import type { Vec2, WallNode } from '../domain/types';
import { distanceToSegment, closestPointOnSegment } from './segment';
import { distance, sub } from './vec2';

export type SnapKind = 'grid' | 'node' | 'wall' | 'axis' | 'free';

export interface SnapResult {
  point: Vec2;
  kind: SnapKind;
  /** Set when the result snapped onto an existing node. */
  nodeId?: string;
  /** Set when the result snapped onto a wall centerline. */
  wallId?: string;
}

export function snapToGrid(point: Vec2, gridSize: number): Vec2 {
  if (gridSize <= 0) return point;
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

/**
 * Constrains `to` onto the nearest ray from `from` whose angle is a multiple of `stepDegrees`.
 * This is what makes free-hand wall drawing produce exactly orthogonal rooms.
 */
export function snapToAngle(from: Vec2, to: Vec2, stepDegrees = 15): Vec2 {
  const delta = sub(to, from);
  const len = Math.hypot(delta.x, delta.y);
  if (len < 1e-9) return to;

  const step = (stepDegrees * Math.PI) / 180;
  const snapped = Math.round(Math.atan2(delta.y, delta.x) / step) * step;

  return { x: from.x + Math.cos(snapped) * len, y: from.y + Math.sin(snapped) * len };
}

export function findNearestNode(
  point: Vec2,
  nodes: readonly WallNode[],
  tolerance: number,
  excludeIds: ReadonlySet<string> = new Set(),
): WallNode | null {
  let best: WallNode | null = null;
  let bestDistance = tolerance;

  for (const node of nodes) {
    if (excludeIds.has(node.id)) continue;
    const d = distance(point, node);
    if (d <= bestDistance) {
      best = node;
      bestDistance = d;
    }
  }

  return best;
}

export interface WallCenterline {
  id: string;
  a: Vec2;
  b: Vec2;
}

export function findNearestWall(
  point: Vec2,
  walls: readonly WallCenterline[],
  tolerance: number,
  excludeIds: ReadonlySet<string> = new Set(),
): { wall: WallCenterline; point: Vec2; distance: number } | null {
  let best: { wall: WallCenterline; point: Vec2; distance: number } | null = null;

  for (const wall of walls) {
    if (excludeIds.has(wall.id)) continue;
    const d = distanceToSegment(point, wall.a, wall.b);
    if (d <= tolerance && (best === null || d < best.distance)) {
      best = { wall, point: closestPointOnSegment(point, wall.a, wall.b), distance: d };
    }
  }

  return best;
}

export interface SnapOptions {
  gridSize: number;
  snapEnabled: boolean;
  /** Snap radius in **world meters** — callers convert from screen pixels using the zoom. */
  tolerance: number;
  nodes: readonly WallNode[];
  walls?: readonly WallCenterline[];
  excludeNodeIds?: ReadonlySet<string>;
  excludeWallIds?: ReadonlySet<string>;
  /** When set, the result is also constrained to an angle step from this anchor. */
  angleAnchor?: Vec2 | null;
  angleStepDegrees?: number;
}

/**
 * The single snapping entry point used by every 2D tool.
 *
 * Priority is deliberate: existing nodes win over wall centerlines, which win over the grid.
 * Reusing a node is what keeps the wall graph connected (and therefore keeps rooms closed),
 * so it must never lose to a grid intersection that merely happens to be nearer.
 */
export function resolveSnap(point: Vec2, options: SnapOptions): SnapResult {
  const {
    gridSize,
    snapEnabled,
    tolerance,
    nodes,
    walls = [],
    excludeNodeIds,
    excludeWallIds,
    angleAnchor,
    angleStepDegrees = 15,
  } = options;

  const node = findNearestNode(point, nodes, tolerance, excludeNodeIds);
  if (node) {
    return { point: { x: node.x, y: node.y }, kind: 'node', nodeId: node.id };
  }

  const wallHit = findNearestWall(point, walls, tolerance * 0.75, excludeWallIds);
  if (wallHit) {
    return { point: wallHit.point, kind: 'wall', wallId: wallHit.wall.id };
  }

  let candidate = point;

  if (angleAnchor) {
    candidate = snapToAngle(angleAnchor, candidate, angleStepDegrees);
  }

  if (snapEnabled) {
    const gridPoint = snapToGrid(candidate, gridSize);
    // Re-apply the angle constraint so grid rounding cannot break orthogonality.
    if (angleAnchor) {
      const onAxis = snapToAngle(angleAnchor, gridPoint, angleStepDegrees);
      return { point: onAxis, kind: 'grid' };
    }
    return { point: gridPoint, kind: 'grid' };
  }

  return { point: candidate, kind: angleAnchor ? 'axis' : 'free' };
}
