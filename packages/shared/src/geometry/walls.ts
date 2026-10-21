import { GEOMETRY_LIMITS } from '../domain/types';
import type { Level, Opening, Vec2, Wall, WallNode } from '../domain/types';
import { closestPointOnSegment, projectParam, signedDistanceToLine } from './segment';
import { EPSILON, add, cross, distance, normalize, perpendicular, scale, sub } from './vec2';

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

/** Where a wall end meets its neighbours, expressed in the wall's own frame. */
export interface WallEndTrim {
  /** Corner on the `+normal` side, where `normal = perpendicular(direction a→b)`. */
  plus: Vec2;
  /** Corner on the `-normal` side. */
  minus: Vec2;
}

export interface WallTrim {
  a: WallEndTrim;
  b: WallEndTrim;
}

export interface JunctionSolution {
  /** Trimmed end corners, by wall id. */
  walls: Map<string, WallTrim>;
  /** Filler polygon by node id. Only nodes joining three or more walls need one. */
  blocks: Map<string, Vec2[]>;
}

/** A miter longer than this many half-thicknesses is clipped; a spike reads worse than a cut. */
const MAX_MITER_RATIO = 6;

interface IncidentWall {
  wall: Wall;
  /** Unit direction pointing away from the node. */
  outward: Vec2;
  /** Left-hand normal of `outward`. */
  normal: Vec2;
  half: number;
  angle: number;
  atA: boolean;
}

/** Intersection of two infinite lines, or `null` when they are parallel. */
function intersectLines(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const denominator = cross(d1, d2);
  if (Math.abs(denominator) < 1e-9) return null;

  const t = cross(sub(p2, p1), d2) / denominator;
  return add(p1, scale(d1, t));
}

/**
 * Resolves every wall junction by mitering.
 *
 * Walls used to be grown past their node so the corner square would be covered by whichever
 * wall happened to overlap it. That reads fine in a flat 2D fill, but in 3D the overlapping
 * bodies share coplanar faces and the depth buffer cannot choose between them — the striping
 * that shows up on wall tops wherever two walls meet.
 *
 * Mitering removes the overlap instead of hiding it. Around each node the walls are taken in
 * angular order and each adjacent pair contributes one corner: the intersection of one wall's
 * left face with the next wall's right face. Those corners trim the wall ends, and for three
 * or more walls the polygon they describe is the leftover middle, emitted once as a filler.
 * The pieces tile the junction exactly: no gap, no overlap, nothing coplanar.
 */
export function solveJunctions(nodes: NodeMap, walls: readonly Wall[]): JunctionSolution {
  const byNode = new Map<string, IncidentWall[]>();

  for (const wall of walls) {
    const ends = wallEndpoints(wall, nodes);
    if (!ends) continue;

    const direction = normalize(sub(ends.b, ends.a));
    if (Math.abs(direction.x) < EPSILON && Math.abs(direction.y) < EPSILON) continue;

    for (const atA of [true, false]) {
      const outward = atA ? direction : scale(direction, -1);
      const entry: IncidentWall = {
        wall,
        outward,
        normal: perpendicular(outward),
        half: wall.thickness / 2,
        angle: Math.atan2(outward.y, outward.x),
        atA,
      };

      const nodeId = atA ? wall.a : wall.b;
      const list = byNode.get(nodeId) ?? [];
      list.push(entry);
      byNode.set(nodeId, list);
    }
  }

  const result: JunctionSolution = { walls: new Map(), blocks: new Map() };

  const record = (entry: IncidentWall, left: Vec2, right: Vec2): void => {
    const trim = result.walls.get(entry.wall.id) ?? {
      a: { plus: { x: 0, y: 0 }, minus: { x: 0, y: 0 } },
      b: { plus: { x: 0, y: 0 }, minus: { x: 0, y: 0 } },
    };

    // Walking outward from node A the wall's `+normal` side is on the left; from node B the
    // outward direction is reversed, so the sides swap.
    const end = entry.atA ? { plus: left, minus: right } : { plus: right, minus: left };
    if (entry.atA) trim.a = end;
    else trim.b = end;

    result.walls.set(entry.wall.id, trim);
  };

  for (const [nodeId, incident] of byNode) {
    const node = nodes.get(nodeId);
    if (!node) continue;

    const origin: Vec2 = { x: node.x, y: node.y };

    if (incident.length === 1) {
      const only = incident[0]!;
      record(
        only,
        add(origin, scale(only.normal, only.half)),
        sub(origin, scale(only.normal, only.half)),
      );
      continue;
    }

    const ordered = [...incident].sort((left, right) => left.angle - right.angle);
    const limit = MAX_MITER_RATIO * Math.max(...ordered.map((entry) => entry.half));

    const corners = ordered.map((current, index) => {
      const next = ordered[(index + 1) % ordered.length]!;

      const leftBase = add(origin, scale(current.normal, current.half));
      const rightBase = sub(origin, scale(next.normal, next.half));

      const crossing = intersectLines(leftBase, current.outward, rightBase, next.outward);

      // Collinear neighbours (a wall carried on by another) have parallel faces and no
      // crossing; the flat end halfway between the two offsets is the joint.
      const corner = crossing ?? {
        x: (leftBase.x + rightBase.x) / 2,
        y: (leftBase.y + rightBase.y) / 2,
      };

      const reach = distance(corner, origin);
      if (reach <= limit) return corner;

      return add(origin, scale(normalize(sub(corner, origin)), limit));
    });

    ordered.forEach((entry, index) => {
      const left = corners[index]!;
      const right = corners[(index - 1 + corners.length) % corners.length]!;
      record(entry, left, right);
    });

    if (ordered.length >= 3) result.blocks.set(nodeId, corners);
  }

  return result;
}

export interface WallQuad {
  /** Corners in order: a-plus, b-plus, b-minus, a-minus. */
  points: [Vec2, Vec2, Vec2, Vec2];
  /** Centerline start. */
  start: Vec2;
  /** Centerline end. */
  end: Vec2;
  /** Centerline length. */
  length: number;
}

/**
 * The filled footprint of a wall in plan space.
 *
 * With a `trim` from {@link solveJunctions} the ends are mitered against the neighbours, so
 * adjacent walls tile rather than overlap. Without one the wall gets square ends, which is
 * what an isolated wall wants anyway.
 */
export function wallQuad(wall: Wall, nodes: NodeMap, trim?: WallTrim): WallQuad | null {
  const ends = wallEndpoints(wall, nodes);
  if (!ends) return null;

  const direction = normalize(sub(ends.b, ends.a));
  if (Math.abs(direction.x) < EPSILON && Math.abs(direction.y) < EPSILON) return null;

  const start: Vec2 = { x: ends.a.x, y: ends.a.y };
  const end: Vec2 = { x: ends.b.x, y: ends.b.y };
  const half = scale(perpendicular(direction), wall.thickness / 2);

  const points: [Vec2, Vec2, Vec2, Vec2] = trim
    ? [trim.a.plus, trim.b.plus, trim.b.minus, trim.a.minus]
    : [add(start, half), add(end, half), sub(end, half), sub(start, half)];

  return { points, start, end, length: distance(start, end) };
}

/**
 * Plan footprint of one solid piece of a wall, given its span along the centerline.
 *
 * Pieces that reach an end inherit that end's mitered corners; the rest are cut square across
 * the wall. This is what turns the one-dimensional decomposition from
 * {@link wallSolidSegments} into geometry the viewer can extrude.
 */
export function solidPieceFootprint(
  wall: Wall,
  nodes: NodeMap,
  segment: { start: number; end: number },
  trim?: WallTrim,
): [Vec2, Vec2, Vec2, Vec2] | null {
  const ends = wallEndpoints(wall, nodes);
  if (!ends) return null;

  const direction = normalize(sub(ends.b, ends.a));
  const normal = perpendicular(direction);
  const half = wall.thickness / 2;
  const length = distance(ends.a, ends.b);

  const across = (along: number, side: 1 | -1): Vec2 =>
    add(add(ends.a, scale(direction, along)), scale(normal, side * half));

  const atStart = segment.start <= EPSILON;
  const atEnd = segment.end >= length - EPSILON;

  return [
    atStart && trim ? trim.a.plus : across(segment.start, 1),
    atEnd && trim ? trim.b.plus : across(segment.end, 1),
    atEnd && trim ? trim.b.minus : across(segment.end, -1),
    atStart && trim ? trim.a.minus : across(segment.start, -1),
  ];
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
