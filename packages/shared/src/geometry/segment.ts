import type { Vec2 } from '../domain/types';
import { EPSILON, add, cross, distance, dot, lengthSq, scale, sub } from './vec2';

export interface Segment {
  a: Vec2;
  b: Vec2;
}

/**
 * Parameter `t` in `[0, 1]` of the point on `a→b` closest to `p`.
 * Degenerate (zero-length) segments return 0.
 */
export function projectParam(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const lenSq = lengthSq(ab);
  if (lenSq < EPSILON) return 0;
  const t = dot(sub(p, a), ab) / lenSq;
  return Math.min(1, Math.max(0, t));
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const t = projectParam(p, a, b);
  return add(a, scale(sub(b, a), t));
}

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return distance(p, closestPointOnSegment(p, a, b));
}

/** Signed distance from `p` to the infinite line through `a→b`; positive on the left side. */
export function signedDistanceToLine(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const len = Math.sqrt(lengthSq(ab));
  if (len < EPSILON) return distance(p, a);
  return cross(ab, sub(p, a)) / len;
}

export interface SegmentIntersection {
  point: Vec2;
  /** Parameter along the first segment. */
  t: number;
  /** Parameter along the second segment. */
  u: number;
}

/**
 * Proper intersection of two segments. Returns `null` for parallel, collinear or
 * non-overlapping pairs. `inclusive` decides whether touching endpoints count.
 */
export function segmentIntersection(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
  inclusive = true,
): SegmentIntersection | null {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const denominator = cross(r, s);

  if (Math.abs(denominator) < EPSILON) return null;

  const t = cross(sub(b1, a1), s) / denominator;
  const u = cross(sub(b1, a1), r) / denominator;

  const lower = inclusive ? -1e-9 : 1e-9;
  const upper = inclusive ? 1 + 1e-9 : 1 - 1e-9;

  if (t < lower || t > upper || u < lower || u > upper) return null;

  return { point: add(a1, scale(r, t)), t, u };
}

/** True when `p` lies on segment `a→b` within `tolerance`. */
export function isPointOnSegment(p: Vec2, a: Vec2, b: Vec2, tolerance = 1e-6): boolean {
  return distanceToSegment(p, a, b) <= tolerance;
}
