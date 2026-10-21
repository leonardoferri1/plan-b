import { GEOMETRY_LIMITS } from '../domain/types';
import type { Level, Opening, Vec2, Wall, WallNode } from '../domain/types';
import { closestPointOnSegment, projectParam, signedDistanceToLine } from './segment';
import { EPSILON, add, distance, normalize, perpendicular, scale, sub } from './vec2';

export type NodeMap = ReadonlyMap<string, WallNode>;

export function buildNodeMap(nodes: readonly WallNode[]): Map<string, WallNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

export function wallEndpoints(wall: Wall, nodes: NodeMap): { a: WallNode; b: WallNode } | null {
  const a = nodes.get(wall.a);
  const b = nodes.get(wall.b);
  return a && b ? { a, b } : null;
}

export function wallLength(wall: Wall, nodes: NodeMap): number {
  const ends = wallEndpoints(wall, nodes);
  return ends ? distance(ends.a, ends.b) : 0;
}

/** Unit vector pointing from node `a` to node `b`. */
export function wallDirection(wall: Wall, nodes: NodeMap): Vec2 {
  const ends = wallEndpoints(wall, nodes);
  if (!ends) return { x: 1, y: 0 };
  return normalize(sub(ends.b, ends.a));
}

export function wallAngle(wall: Wall, nodes: NodeMap): number {
  const direction = wallDirection(wall, nodes);
  return Math.atan2(direction.y, direction.x);
}

export function wallMidpoint(wall: Wall, nodes: NodeMap): Vec2 {
  const ends = wallEndpoints(wall, nodes);
  if (!ends) return { x: 0, y: 0 };
  return { x: (ends.a.x + ends.b.x) / 2, y: (ends.a.y + ends.b.y) / 2 };
}

export interface WallExtensions {
  start: number;
  end: number;
}

/**
 * How far each end of a wall must grow past its node so that junctions read as solid corners.
 *
 * Mitering every corner analytically is overkill for axis-friendly residential plans: growing
 * each wall by half of the thickest wall meeting at that node produces an overlapping union
 * that is visually exact for the 2D fill and for the 3D extrusion alike, with no special cases
 * for T junctions, crossings or acute angles.
 */
export function wallExtensions(
  wall: Wall,
  walls: readonly Wall[],
  _nodes: NodeMap,
): WallExtensions {
  const extensionAt = (nodeId: string): number => {
    let maxThickness = 0;
    let incident = 0;

    for (const other of walls) {
      if (other.id === wall.id) continue;
      if (other.a === nodeId || other.b === nodeId) {
        incident += 1;
        maxThickness = Math.max(maxThickness, other.thickness);
      }
    }

    return incident === 0 ? 0 : maxThickness / 2;
  };

  return { start: extensionAt(wall.a), end: extensionAt(wall.b) };
}

export interface WallQuad {
  /** Corners in order: a-left, b-left, b-right, a-right. */
  points: [Vec2, Vec2, Vec2, Vec2];
  /** Centerline start, after junction extension. */
  start: Vec2;
  /** Centerline end, after junction extension. */
  end: Vec2;
  length: number;
}

/**
 * The filled footprint of a wall in plan space, optionally grown at the ends to close corners.
 */
export function wallQuad(
  wall: Wall,
  nodes: NodeMap,
  extensions: WallExtensions = { start: 0, end: 0 },
): WallQuad | null {
  const ends = wallEndpoints(wall, nodes);
  if (!ends) return null;

  const direction = normalize(sub(ends.b, ends.a));
  if (Math.abs(direction.x) < EPSILON && Math.abs(direction.y) < EPSILON) return null;

  const start = sub(ends.a, scale(direction, extensions.start));
  const end = add(ends.b, scale(direction, extensions.end));
  const half = scale(perpendicular(direction), wall.thickness / 2);

  return {
    points: [add(start, half), add(end, half), sub(end, half), sub(start, half)],
    start,
    end,
    length: distance(start, end),
  };
}

/** Position of a point expressed in the wall's own frame. */
export interface WallLocalPoint {
  /** Distance from node `a` along the centerline (may fall outside `[0, length]`). */
  along: number;
  /** Signed perpendicular offset; positive on the left of `a→b`. */
  offset: number;
  /** Clamped parameter in `[0, 1]`. */
  t: number;
}

export function toWallLocal(point: Vec2, wall: Wall, nodes: NodeMap): WallLocalPoint | null {
  const ends = wallEndpoints(wall, nodes);
  if (!ends) return null;

  const length = distance(ends.a, ends.b);
  const t = projectParam(point, ends.a, ends.b);

  return {
    along: t * length,
    offset: signedDistanceToLine(point, ends.a, ends.b),
    t,
  };
}

export function distanceToWall(point: Vec2, wall: Wall, nodes: NodeMap): number {
  const ends = wallEndpoints(wall, nodes);
  if (!ends) return Infinity;
  return distance(point, closestPointOnSegment(point, ends.a, ends.b));
}

/** World-space endpoints of an opening measured along its host wall's centerline. */
export interface OpeningPlacement {
  opening: Opening;
  /** Center of the opening in plan space. */
  center: Vec2;
  /** Centerline start of the opening. */
  from: Vec2;
  /** Centerline end of the opening. */
  to: Vec2;
  /** Unit vector along the wall. */
  direction: Vec2;
  /** Unit vector perpendicular to the wall (left side). */
  normal: Vec2;
  wallThickness: number;
}

export function openingPlacement(
  opening: Opening,
  wall: Wall,
  nodes: NodeMap,
): OpeningPlacement | null {
  const ends = wallEndpoints(wall, nodes);
  if (!ends) return null;

  const direction = normalize(sub(ends.b, ends.a));
  const half = opening.width / 2;
  const center = add(ends.a, scale(direction, opening.offset));

  return {
    opening,
    center,
    from: add(ends.a, scale(direction, opening.offset - half)),
    to: add(ends.a, scale(direction, opening.offset + half)),
    direction,
    normal: perpendicular(direction),
    wallThickness: wall.thickness,
  };
}

/** A solid piece of wall remaining after openings are cut out, in wall-local coordinates. */
export interface WallSolidSegment {
  /** Start distance along the **extended** wall. */
  start: number;
  /** End distance along the extended wall. */
  end: number;
  /** Elevation of the bottom of the piece. */
  bottom: number;
  /** Elevation of the top of the piece. */
  top: number;
}

interface LocalOpening {
  start: number;
  end: number;
  sill: number;
  head: number;
}

/**
 * Decomposes a wall into axis-aligned solid boxes with the openings removed.
 *
 * A straight wall with rectangular openings factorises exactly: full-height pieces between
 * openings, plus an under-sill piece and an over-head piece for each opening. That is why the
 * 3D viewer needs no CSG — this returns everything required to build the extrusion from boxes.
 *
 * All distances are relative to the extended wall, so `offsetAlong` is the amount the wall was
 * grown at its start (see {@link wallExtensions}).
 */
export function wallSolidSegments(
  extendedLength: number,
  wallHeight: number,
  openings: readonly Opening[],
  offsetAlong = 0,
): WallSolidSegment[] {
  const clamp = (value: number): number => Math.min(extendedLength, Math.max(0, value));

  const local: LocalOpening[] = openings
    .map((opening) => {
      const half = opening.width / 2;
      return {
        start: clamp(opening.offset - half + offsetAlong),
        end: clamp(opening.offset + half + offsetAlong),
        sill: Math.max(0, opening.sillHeight),
        head: Math.min(wallHeight, opening.sillHeight + opening.height),
      };
    })
    .filter((item) => item.end - item.start > EPSILON)
    .sort((a, b) => a.start - b.start);

  // Openings that overlap would otherwise emit negative-width pieces; merging is not correct
  // either (their sills differ), so overlapping openings are dropped by the validator before
  // reaching this point. Here we simply skip anything swallowed by the previous opening.
  const segments: WallSolidSegment[] = [];
  let cursor = 0;

  for (const opening of local) {
    if (opening.start < cursor - EPSILON) continue;

    if (opening.start - cursor > EPSILON) {
      segments.push({ start: cursor, end: opening.start, bottom: 0, top: wallHeight });
    }

    if (opening.sill > EPSILON) {
      segments.push({ start: opening.start, end: opening.end, bottom: 0, top: opening.sill });
    }

    if (wallHeight - opening.head > EPSILON) {
      segments.push({
        start: opening.start,
        end: opening.end,
        bottom: opening.head,
        top: wallHeight,
      });
    }

    cursor = opening.end;
  }

  if (extendedLength - cursor > EPSILON) {
    segments.push({ start: cursor, end: extendedLength, bottom: 0, top: wallHeight });
  }

  return segments;
}

/** Walls that touch a given node. */
export function wallsAtNode(nodeId: string, walls: readonly Wall[]): Wall[] {
  return walls.filter((wall) => wall.a === nodeId || wall.b === nodeId);
}

export function openingsOfWall(wallId: string, openings: readonly Opening[]): Opening[] {
  return openings.filter((opening) => opening.wallId === wallId);
}

export interface OpeningFitResult {
  valid: boolean;
  reason?: string;
  /** The nearest offset that would be valid, when one exists. */
  clampedOffset?: number;
}

/**
 * Checks that an opening fits its wall: inside the span, clear of the ends, below the ceiling
 * and not overlapping a sibling opening.
 */
export function checkOpeningFit(
  candidate: Pick<Opening, 'id' | 'offset' | 'width' | 'height' | 'sillHeight'>,
  wall: Wall,
  nodes: NodeMap,
  siblings: readonly Opening[],
): OpeningFitResult {
  const length = wallLength(wall, nodes);
  const half = candidate.width / 2;
  const margin = GEOMETRY_LIMITS.minOpeningMargin;
  const minOffset = half + margin;
  const maxOffset = length - half - margin;

  if (candidate.width + margin * 2 > length) {
    return { valid: false, reason: 'A abertura é mais larga que a parede.' };
  }

  if (candidate.sillHeight + candidate.height > wall.height + EPSILON) {
    return { valid: false, reason: 'A abertura ultrapassa a altura da parede.' };
  }

  if (candidate.offset < minOffset - EPSILON || candidate.offset > maxOffset + EPSILON) {
    return {
      valid: false,
      reason: 'A abertura precisa ficar dentro da parede.',
      clampedOffset: Math.min(maxOffset, Math.max(minOffset, candidate.offset)),
    };
  }

  for (const sibling of siblings) {
    if (sibling.id === candidate.id) continue;
    const siblingHalf = sibling.width / 2;
    const overlaps =
      candidate.offset + half > sibling.offset - siblingHalf - margin &&
      candidate.offset - half < sibling.offset + siblingHalf + margin;
    if (overlaps) {
      return { valid: false, reason: 'As aberturas não podem se sobrepor.' };
    }
  }

  return { valid: true };
}

/**
 * Finds the wall a point should attach to when placing a door or a window, and the offset the
 * opening would take on it.
 */
export function findHostWall(
  point: Vec2,
  level: Pick<Level, 'walls' | 'openings'>,
  nodes: NodeMap,
  tolerance: number,
  width: number,
): { wall: Wall; offset: number } | null {
  let best: { wall: Wall; offset: number; distance: number } | null = null;

  for (const wall of level.walls) {
    const d = distanceToWall(point, wall, nodes);
    if (d > tolerance) continue;

    const local = toWallLocal(point, wall, nodes);
    if (!local) continue;

    const length = wallLength(wall, nodes);
    const margin = GEOMETRY_LIMITS.minOpeningMargin;
    const minOffset = width / 2 + margin;
    const maxOffset = length - width / 2 - margin;
    if (minOffset > maxOffset) continue;

    const offset = Math.min(maxOffset, Math.max(minOffset, local.along));
    if (best === null || d < best.distance) {
      best = { wall, offset, distance: d };
    }
  }

  return best ? { wall: best.wall, offset: best.offset } : null;
}
