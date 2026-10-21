import type { Vec2, Wall, WallNode } from '../domain/types';
import { polygonArea, polygonCentroid, pointInPolygon, signedArea } from './polygon';
import { buildNodeMap, type NodeMap } from './walls';
import { normalizeAngle } from './vec2';

/** Loops smaller than this are treated as construction noise rather than rooms. */
export const MIN_ROOM_AREA = 0.4;

export interface DetectedLoop {
  nodeIds: string[];
  polygon: Vec2[];
  area: number;
  centroid: Vec2;
  /** Stable identity of the loop: the sorted node ids. Survives dragging, not re-topology. */
  key: string;
}

interface HalfEdge {
  to: string;
  angle: number;
}

export function loopKey(nodeIds: readonly string[]): string {
  return [...nodeIds].sort().join('|');
}

function buildAdjacency(walls: readonly Wall[], nodes: NodeMap): Map<string, HalfEdge[]> {
  const adjacency = new Map<string, HalfEdge[]>();

  const push = (from: string, to: string): void => {
    const a = nodes.get(from);
    const b = nodes.get(to);
    if (!a || !b || from === to) return;

    const list = adjacency.get(from) ?? [];
    // Parallel edges between the same pair contribute nothing extra to face traversal.
    if (list.some((edge) => edge.to === to)) return;

    list.push({ to, angle: normalizeAngle(Math.atan2(b.y - a.y, b.x - a.x)) });
    adjacency.set(from, list);
  };

  for (const wall of walls) {
    push(wall.a, wall.b);
    push(wall.b, wall.a);
  }

  for (const list of adjacency.values()) {
    list.sort((left, right) => left.angle - right.angle);
  }

  return adjacency;
}

/**
 * Finds every face of the planar wall graph by half-edge traversal.
 *
 * Standing on node `v` having arrived from `u`, the next edge of the face is the neighbour of
 * `v` immediately **clockwise** from `u` — i.e. the predecessor of `u` in the
 * counter-clockwise-sorted adjacency list. Repeating that until the starting half-edge comes
 * back around yields one closed face; doing it for every unvisited half-edge yields all of
 * them, including the unbounded outer face, which is dropped per connected component because
 * it is always the one with the largest absolute area.
 */
export function detectRoomLoops(
  nodes: readonly WallNode[],
  walls: readonly Wall[],
): DetectedLoop[] {
  const nodeMap = buildNodeMap(nodes);
  const adjacency = buildAdjacency(walls, nodeMap);
  if (adjacency.size === 0) return [];

  const visited = new Set<string>();
  const faces: { nodeIds: string[]; polygon: Vec2[] }[] = [];
  const maxSteps = walls.length * 2 + 8;

  for (const [from, edges] of adjacency) {
    for (const edge of edges) {
      const startKey = `${from}>${edge.to}`;
      if (visited.has(startKey)) continue;

      const cycle: string[] = [];
      let previous = from;
      let current = edge.to;
      let steps = 0;
      let closed = false;

      visited.add(startKey);
      cycle.push(from);

      while (steps < maxSteps) {
        steps += 1;
        cycle.push(current);

        const neighbours = adjacency.get(current);
        if (!neighbours || neighbours.length === 0) break;

        const index = neighbours.findIndex((candidate) => candidate.to === previous);
        if (index < 0) break;

        const next = neighbours[(index - 1 + neighbours.length) % neighbours.length]!;
        const stepKey = `${current}>${next.to}`;

        if (stepKey === startKey) {
          closed = true;
          break;
        }

        if (visited.has(stepKey)) break;
        visited.add(stepKey);

        previous = current;
        current = next.to;
      }

      if (!closed || cycle.length < 4) continue;

      // `cycle` ends on the node the start half-edge departs from; drop the duplicate.
      const nodeIds = cycle.slice(0, -1);
      const polygon = nodeIds
        .map((id) => nodeMap.get(id))
        .filter((node): node is WallNode => Boolean(node))
        .map((node) => ({ x: node.x, y: node.y }));

      if (polygon.length !== nodeIds.length || polygon.length < 3) continue;
      faces.push({ nodeIds, polygon });
    }
  }

  const components = connectedComponents(walls);
  const byComponent = new Map<string, DetectedLoop[]>();

  for (const face of faces) {
    const area = polygonArea(face.polygon);
    if (area < MIN_ROOM_AREA) continue;

    const loop: DetectedLoop = {
      nodeIds: face.nodeIds,
      polygon: face.polygon,
      area,
      centroid: polygonCentroid(face.polygon),
      key: loopKey(face.nodeIds),
    };

    const component = components.get(face.nodeIds[0]!) ?? 'default';
    const list = byComponent.get(component) ?? [];
    list.push(loop);
    byComponent.set(component, list);
  }

  const result: DetectedLoop[] = [];
  const seen = new Set<string>();

  for (const loops of byComponent.values()) {
    if (loops.length === 0) continue;

    // The outer face of a component wraps all of its inner faces, so it is the largest one.
    let outerIndex = 0;
    for (let i = 1; i < loops.length; i += 1) {
      if (loops[i]!.area > loops[outerIndex]!.area) outerIndex = i;
    }

    loops.forEach((loop, index) => {
      if (index === outerIndex) return;
      if (seen.has(loop.key)) return;
      seen.add(loop.key);
      result.push(loop);
    });
  }

  return result.sort((a, b) => b.area - a.area);
}

function connectedComponents(walls: readonly Wall[]): Map<string, string> {
  const parent = new Map<string, string>();

  const find = (id: string): string => {
    let root = parent.get(id) ?? id;
    if (root === id) {
      parent.set(id, id);
      return id;
    }
    root = find(root);
    parent.set(id, root);
    return root;
  };

  const union = (a: string, b: string): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };

  for (const wall of walls) {
    if (!parent.has(wall.a)) parent.set(wall.a, wall.a);
    if (!parent.has(wall.b)) parent.set(wall.b, wall.b);
    union(wall.a, wall.b);
  }

  const result = new Map<string, string>();
  for (const id of parent.keys()) result.set(id, find(id));
  return result;
}

export function loopPolygon(nodeIds: readonly string[], nodes: NodeMap): Vec2[] {
  return nodeIds
    .map((id) => nodes.get(id))
    .filter((node): node is WallNode => Boolean(node))
    .map((node) => ({ x: node.x, y: node.y }));
}

/** True when the loop still describes a closed, non-degenerate region. */
export function isLoopIntact(nodeIds: readonly string[], nodes: NodeMap): boolean {
  const polygon = loopPolygon(nodeIds, nodes);
  return (
    polygon.length === nodeIds.length &&
    polygon.length >= 3 &&
    polygonArea(polygon) >= MIN_ROOM_AREA
  );
}

export function isPointInLoop(point: Vec2, nodeIds: readonly string[], nodes: NodeMap): boolean {
  return pointInPolygon(point, loopPolygon(nodeIds, nodes));
}

export { signedArea };
