import {
  buildNodeMap,
  getCatalogItem,
  getMaterial,
  openingPlacement,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  resolveMaterialSlots,
  resolveParts,
  wallExtensions,
  wallLength,
  wallQuad,
  type Bounds,
  type FurnitureItem,
  type Level,
  type Opening,
  type OpeningKind,
  type Vec2,
  type WallQuad,
} from '@spacecraft/shared';
import { PLAN_COLORS, shade } from './colors';

/**
 * The derived scene: everything the plan renderer and the hit-tester need, computed once per
 * document change instead of once per frame. The plan is immutable (immer gives us structural
 * sharing), so a `useMemo` keyed on the level object is enough to keep this out of the
 * pointer-move path.
 */

export interface SceneWall {
  id: string;
  a: Vec2;
  b: Vec2;
  /** Centerline endpoints after junction extension. */
  quad: WallQuad;
  thickness: number;
  height: number;
  length: number;
  angle: number;
  materialId: string;
  nodeA: string;
  nodeB: string;
}

export interface SceneRoom {
  id: string;
  name: string;
  polygon: Vec2[];
  area: number;
  centroid: Vec2;
  fill: string;
  floorMaterialId: string;
}

export interface SceneOpening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  from: Vec2;
  to: Vec2;
  center: Vec2;
  direction: Vec2;
  normal: Vec2;
  width: number;
  thickness: number;
  flipped: boolean;
  source: Opening;
}

export interface ScenePart {
  /** Center of the part in item-local plan coordinates (before rotation). */
  cx: number;
  cy: number;
  width: number;
  depth: number;
  /** Elevation of the part's top, used to sort the top-down painting order. */
  top: number;
  fill: string;
  round: boolean;
}

export interface SceneFurniture {
  id: string;
  catalogId: string;
  name: string;
  position: Vec2;
  rotation: number;
  width: number;
  depth: number;
  /** Oriented bounding rectangle in world space, used for hit-testing and handles. */
  corners: [Vec2, Vec2, Vec2, Vec2];
  parts: ScenePart[];
  locked: boolean;
  materialId: string;
}

export interface SceneNode {
  id: string;
  point: Vec2;
  degree: number;
}

export interface PlanScene {
  walls: SceneWall[];
  rooms: SceneRoom[];
  openings: SceneOpening[];
  furniture: SceneFurniture[];
  nodes: SceneNode[];
  bounds: Bounds;
  wallById: Map<string, SceneWall>;
  openingsByWall: Map<string, SceneOpening[]>;
}

function orientedCorners(item: FurnitureItem): [Vec2, Vec2, Vec2, Vec2] {
  const cos = Math.cos(item.rotation);
  const sin = Math.sin(item.rotation);
  const hw = item.size.width / 2;
  const hd = item.size.depth / 2;

  const local: Vec2[] = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];

  return local.map((point) => ({
    x: item.position.x + point.x * cos - point.y * sin,
    y: item.position.y + point.x * sin + point.y * cos,
  })) as [Vec2, Vec2, Vec2, Vec2];
}

/** Rounded parts (cylinders, spheres, cones) read better as circles in a plan view. */
const ROUND_SHAPES = new Set(['cylinder', 'sphere', 'cone']);

function buildParts(item: FurnitureItem): ScenePart[] {
  const catalog = getCatalogItem(item.catalogId);
  if (!catalog) return [];

  const slots = resolveMaterialSlots(item.catalogId, item.materialId);
  const resolved = resolveParts(item.catalogId, item.size);

  const colorFor = (slot: string): string => {
    if (slot === 'light') return '#ffe9b8';
    const materialId =
      slot === 'secondary' ? slots.secondary : slot === 'accent' ? slots.accent : slots.primary;
    const base = getMaterial(materialId).planFill;
    // A touch of contrast between slots so the top view reads as a piece of furniture rather
    // than a flat blob, without inventing colours that are not in the material.
    if (slot === 'secondary') return shade(base, -0.22);
    if (slot === 'accent') return shade(base, 0.12);
    return base;
  };

  return resolved
    .map((part) => ({
      cx: part.center.x,
      cy: part.center.z,
      width: part.size.x,
      depth: part.size.z,
      top: part.center.y + part.size.y / 2,
      fill: colorFor(part.slot),
      round: ROUND_SHAPES.has(part.shape),
    }))
    .sort((a, b) => a.top - b.top);
}

export function buildScene(level: Level): PlanScene {
  const nodeMap = buildNodeMap(level.nodes);

  const walls: SceneWall[] = [];
  const wallById = new Map<string, SceneWall>();

  for (const wall of level.walls) {
    const a = nodeMap.get(wall.a);
    const b = nodeMap.get(wall.b);
    if (!a || !b) continue;

    const quad = wallQuad(wall, nodeMap, wallExtensions(wall, level.walls, nodeMap));
    if (!quad) continue;

    const entry: SceneWall = {
      id: wall.id,
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      quad,
      thickness: wall.thickness,
      height: wall.height,
      length: wallLength(wall, nodeMap),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      materialId: wall.materialId,
      nodeA: wall.a,
      nodeB: wall.b,
    };

    walls.push(entry);
    wallById.set(wall.id, entry);
  }

  const rooms: SceneRoom[] = [];
  for (const room of level.rooms) {
    const polygon = room.nodeIds
      .map((id) => nodeMap.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => ({ x: node.x, y: node.y }));

    if (polygon.length < 3) continue;

    rooms.push({
      id: room.id,
      name: room.name,
      polygon,
      area: polygonArea(polygon),
      centroid: polygonCentroid(polygon),
      fill: getMaterial(room.floorMaterialId).planFill,
      floorMaterialId: room.floorMaterialId,
    });
  }

  const openings: SceneOpening[] = [];
  const openingsByWall = new Map<string, SceneOpening[]>();

  for (const opening of level.openings) {
    const wall = level.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) continue;

    const placement = openingPlacement(opening, wall, nodeMap);
    if (!placement) continue;

    const entry: SceneOpening = {
      id: opening.id,
      wallId: opening.wallId,
      kind: opening.kind,
      from: placement.from,
      to: placement.to,
      center: placement.center,
      direction: placement.direction,
      normal: placement.normal,
      width: opening.width,
      thickness: wall.thickness,
      flipped: opening.flipped,
      source: opening,
    };

    openings.push(entry);
    const list = openingsByWall.get(opening.wallId) ?? [];
    list.push(entry);
    openingsByWall.set(opening.wallId, list);
  }

  const furniture: SceneFurniture[] = level.furniture.map((item) => ({
    id: item.id,
    catalogId: item.catalogId,
    name: item.name,
    position: { ...item.position },
    rotation: item.rotation,
    width: item.size.width,
    depth: item.size.depth,
    corners: orientedCorners(item),
    parts: buildParts(item),
    locked: item.locked,
    materialId: item.materialId,
  }));

  const degrees = new Map<string, number>();
  for (const wall of level.walls) {
    degrees.set(wall.a, (degrees.get(wall.a) ?? 0) + 1);
    degrees.set(wall.b, (degrees.get(wall.b) ?? 0) + 1);
  }

  const nodes: SceneNode[] = level.nodes.map((node) => ({
    id: node.id,
    point: { x: node.x, y: node.y },
    degree: degrees.get(node.id) ?? 0,
  }));

  const points: Vec2[] = [];
  for (const wall of walls) points.push(...wall.quad.points);
  for (const item of furniture) points.push(...item.corners);

  const bounds =
    points.length > 0 ? polygonBounds(points) : { minX: -4, minY: -3, maxX: 4, maxY: 3 };

  return { walls, rooms, openings, furniture, nodes, bounds, wallById, openingsByWall };
}

/** Distance from the item's front edge to its rotation handle, in meters. */
export const ROTATE_HANDLE_GAP = 0.34;

export interface FurnitureHandles {
  rotate: Vec2;
  corners: [Vec2, Vec2, Vec2, Vec2];
}

/**
 * Direct-manipulation handles for a selected item: four corners that resize and one puck in
 * front of the item that rotates it. Positions are world-space so both the renderer and the
 * hit-tester read the same numbers.
 */
export function furnitureHandles(item: SceneFurniture): FurnitureHandles {
  const cos = Math.cos(item.rotation);
  const sin = Math.sin(item.rotation);

  const toWorld = (x: number, y: number): Vec2 => ({
    x: item.position.x + x * cos - y * sin,
    y: item.position.y + x * sin + y * cos,
  });

  return {
    rotate: toWorld(0, -(item.depth / 2 + ROTATE_HANDLE_GAP)),
    corners: item.corners,
  };
}

export const EMPTY_SCENE: PlanScene = {
  walls: [],
  rooms: [],
  openings: [],
  furniture: [],
  nodes: [],
  bounds: { minX: -4, minY: -3, maxX: 4, maxY: 3 },
  wallById: new Map(),
  openingsByWall: new Map(),
};

export { PLAN_COLORS };
