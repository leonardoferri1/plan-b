import type { Vec2 } from '../domain/types';
import { distanceToSegment } from './segment';
import { EPSILON } from './vec2';

export type Polygon = Vec2[];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Shoelace area. The sign encodes winding: with screen-down `y`, a clockwise-on-screen loop
 * yields a positive value.
 */
export function signedArea(polygon: Polygon): number {
  const n = polygon.length;
  if (n < 3) return 0;

  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % n]!;
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

export const polygonArea = (polygon: Polygon): number => Math.abs(signedArea(polygon));

export function polygonPerimeter(polygon: Polygon): number {
  const n = polygon.length;
  if (n < 2) return 0;

  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % n]!;
    total += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return total;
}

/** Area-weighted centroid; falls back to the vertex average for degenerate polygons. */
export function polygonCentroid(polygon: Polygon): Vec2 {
  const n = polygon.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n < 3) {
    return {
      x: polygon.reduce((sum, p) => sum + p.x, 0) / n,
      y: polygon.reduce((sum, p) => sum + p.y, 0) / n,
    };
  }

  let cx = 0;
  let cy = 0;
  let area = 0;

  for (let i = 0; i < n; i += 1) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % n]!;
    const factor = current.x * next.y - next.x * current.y;
    cx += (current.x + next.x) * factor;
    cy += (current.y + next.y) * factor;
    area += factor;
  }

  area /= 2;
  if (Math.abs(area) < EPSILON) {
    return {
      x: polygon.reduce((sum, p) => sum + p.x, 0) / n,
      y: polygon.reduce((sum, p) => sum + p.y, 0) / n,
    };
  }

  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/** Ray-casting point-in-polygon test. Points exactly on an edge count as inside. */
export function pointInPolygon(point: Vec2, polygon: Polygon, edgeTolerance = 1e-9): boolean {
  const n = polygon.length;
  if (n < 3) return false;

  for (let i = 0; i < n; i += 1) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % n]!;
    if (distanceToSegment(point, current, next) <= edgeTolerance) return true;
  }

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonBounds(polygon: Polygon): Bounds {
  if (polygon.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of polygon) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  return { minX, minY, maxX, maxY };
}

export function mergeBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function expandBounds(bounds: Bounds, margin: number): Bounds {
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  };
}

/** Rewinds the polygon so that `signedArea` is positive. */
export function ensureClockwise(polygon: Polygon): Polygon {
  return signedArea(polygon) < 0 ? [...polygon].reverse() : polygon;
}

/** Drops vertices that sit on the straight line between their neighbours. */
export function removeCollinear(polygon: Polygon, tolerance = 1e-6): Polygon {
  const n = polygon.length;
  if (n < 3) return polygon;

  const result: Polygon = [];
  for (let i = 0; i < n; i += 1) {
    const previous = polygon[(i - 1 + n) % n]!;
    const current = polygon[i]!;
    const next = polygon[(i + 1) % n]!;
    const area = Math.abs(
      (current.x - previous.x) * (next.y - previous.y) -
        (next.x - previous.x) * (current.y - previous.y),
    );
    if (area > tolerance) result.push(current);
  }
  return result.length >= 3 ? result : polygon;
}

/**
 * Offsets a convex-or-concave simple polygon inward by `distance` using edge offsetting with
 * miter joins. Used to derive the inner face of a room from its wall centerlines.
 */
export function offsetPolygon(polygon: Polygon, distance: number): Polygon {
  const n = polygon.length;
  if (n < 3 || Math.abs(distance) < EPSILON) return polygon;

  const orientation = signedArea(polygon) >= 0 ? 1 : -1;
  const result: Polygon = [];

  for (let i = 0; i < n; i += 1) {
    const previous = polygon[(i - 1 + n) % n]!;
    const current = polygon[i]!;
    const next = polygon[(i + 1) % n]!;

    const inDir = normalizeVector(current.x - previous.x, current.y - previous.y);
    const outDir = normalizeVector(next.x - current.x, next.y - current.y);

    // Inward normal for the given winding.
    const inNormal = { x: -inDir.y * orientation, y: inDir.x * orientation };
    const outNormal = { x: -outDir.y * orientation, y: outDir.x * orientation };

    const bisector = normalizeVector(inNormal.x + outNormal.x, inNormal.y + outNormal.y);
    const cosHalf = bisector.x * inNormal.x + bisector.y * inNormal.y;
    const miterLength = Math.abs(cosHalf) < 0.1 ? distance * 10 : distance / cosHalf;

    result.push({
      x: current.x + bisector.x * miterLength,
      y: current.y + bisector.y * miterLength,
    });
  }

  return result;
}

function normalizeVector(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  return len < EPSILON ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}
