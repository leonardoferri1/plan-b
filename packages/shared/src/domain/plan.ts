import { detectRoomLoops, loopKey } from '../geometry/rooms';
import { polygonArea, polygonBounds, polygonCentroid, type Bounds } from '../geometry/polygon';
import { pointInPolygon } from '../geometry/polygon';
import { buildNodeMap, solveJunctions, wallLength, wallQuad } from '../geometry/walls';
import { newRoomId } from './ids';
import type { EntityRef, FloorPlan, Level, Room, Vec2 } from './types';

export function currentLevel(plan: FloorPlan): Level {
  const level = plan.levels[0];
  if (!level) throw new Error('FloorPlan has no levels');
  return level;
}

/** Default name for a freshly detected room, numbered after the ones already present. */
function nextAutoName(rooms: readonly Room[]): string {
  let index = rooms.length + 1;
  const taken = new Set(rooms.map((room) => room.name));
  while (taken.has(`Ambiente ${index}`)) index += 1;
  return `Ambiente ${index}`;
}

/**
 * Re-derives the room list from the wall graph, preserving user intent.
 *
 * Matching is done in two passes: first by loop identity (the set of corner nodes, which is
 * stable while you merely drag walls around), then by centroid containment, which keeps a
 * renamed room attached to its space even when the corner set changes — for example when a
 * wall is split in two by a new junction.
 *
 * Mutates `level` in place so it can be called from inside an immer draft.
 */
export function syncRooms(level: Level): void {
  const loops = detectRoomLoops(level.nodes, level.walls);
  const previous = level.rooms;
  const consumed = new Set<string>();
  const result: Room[] = [];

  const byKey = new Map<string, Room>();
  for (const room of previous) byKey.set(loopKey(room.nodeIds), room);

  const nodeMap = buildNodeMap(level.nodes);
  const previousCentroids = previous.map((room) => ({
    room,
    centroid: polygonCentroid(
      room.nodeIds
        .map((id) => nodeMap.get(id))
        .filter((node): node is NonNullable<typeof node> => Boolean(node)),
    ),
  }));

  for (const loop of loops) {
    const exact = byKey.get(loop.key);
    if (exact && !consumed.has(exact.id)) {
      consumed.add(exact.id);
      result.push({ ...exact, nodeIds: loop.nodeIds });
      continue;
    }

    const contained = previousCentroids.find(
      (entry) =>
        !consumed.has(entry.room.id) &&
        !entry.room.autoNamed &&
        pointInPolygon(entry.centroid, loop.polygon),
    );

    if (contained) {
      consumed.add(contained.room.id);
      result.push({ ...contained.room, nodeIds: loop.nodeIds });
      continue;
    }

    result.push({
      id: newRoomId(),
      name: nextAutoName(result),
      nodeIds: loop.nodeIds,
      floorMaterialId: previous[0]?.floorMaterialId ?? 'oak',
      autoNamed: true,
    });
  }

  level.rooms = result;
}

/** Area of a room polygon in square meters. */
export function roomArea(room: Room, level: Level): number {
  const nodeMap = buildNodeMap(level.nodes);
  const polygon = room.nodeIds
    .map((id) => nodeMap.get(id))
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .map((node) => ({ x: node.x, y: node.y }));
  return polygon.length >= 3 ? polygonArea(polygon) : 0;
}

export function roomCentroid(room: Room, level: Level): Vec2 {
  const nodeMap = buildNodeMap(level.nodes);
  const polygon = room.nodeIds
    .map((id) => nodeMap.get(id))
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .map((node) => ({ x: node.x, y: node.y }));
  return polygonCentroid(polygon);
}

export function totalFloorArea(level: Level): number {
  return level.rooms.reduce((sum, room) => sum + roomArea(room, level), 0);
}

/** Bounding box of everything drawn on a level, in plan meters. */
export function levelBounds(level: Level): Bounds {
  const nodeMap = buildNodeMap(level.nodes);
  const junctions = solveJunctions(nodeMap, level.walls);
  const points: Vec2[] = [];

  for (const wall of level.walls) {
    const quad = wallQuad(wall, nodeMap, junctions.walls.get(wall.id));
    if (quad) points.push(...quad.points);
  }

  for (const block of junctions.blocks.values()) points.push(...block);

  for (const item of level.furniture) {
    const radius = Math.max(item.size.width, item.size.depth) / 2;
    points.push(
      { x: item.position.x - radius, y: item.position.y - radius },
      { x: item.position.x + radius, y: item.position.y + radius },
    );
  }

  if (points.length === 0) {
    return { minX: -5, minY: -5, maxX: 5, maxY: 5 };
  }

  return polygonBounds(points);
}

/**
 * Deletes entities and everything that depends on them:
 * a wall takes its openings with it, a node takes its walls, and rooms are re-derived.
 */
export function removeEntities(level: Level, refs: readonly EntityRef[]): void {
  const nodeIds = new Set(refs.filter((ref) => ref.kind === 'node').map((ref) => ref.id));
  const wallIds = new Set(refs.filter((ref) => ref.kind === 'wall').map((ref) => ref.id));
  const openingIds = new Set(refs.filter((ref) => ref.kind === 'opening').map((ref) => ref.id));
  const furnitureIds = new Set(refs.filter((ref) => ref.kind === 'furniture').map((ref) => ref.id));

  for (const wall of level.walls) {
    if (nodeIds.has(wall.a) || nodeIds.has(wall.b)) wallIds.add(wall.id);
  }

  level.walls = level.walls.filter((wall) => !wallIds.has(wall.id));
  level.openings = level.openings.filter(
    (opening) => !openingIds.has(opening.id) && !wallIds.has(opening.wallId),
  );
  level.furniture = level.furniture.filter((item) => !furnitureIds.has(item.id));

  // Nodes left without any wall are meaningless; drop them so the graph stays clean.
  const referenced = new Set<string>();
  for (const wall of level.walls) {
    referenced.add(wall.a);
    referenced.add(wall.b);
  }
  level.nodes = level.nodes.filter((node) => referenced.has(node.id));

  syncRooms(level);
}

/** Total running length of every wall on the level. */
export function totalWallLength(level: Level): number {
  const nodeMap = buildNodeMap(level.nodes);
  return level.walls.reduce((sum, wall) => sum + wallLength(wall, nodeMap), 0);
}

export interface PlanStats {
  rooms: number;
  walls: number;
  openings: number;
  furniture: number;
  floorArea: number;
  wallLength: number;
}

export function planStats(level: Level): PlanStats {
  return {
    rooms: level.rooms.length,
    walls: level.walls.length,
    openings: level.openings.length,
    furniture: level.furniture.length,
    floorArea: totalFloorArea(level),
    wallLength: totalWallLength(level),
  };
}
