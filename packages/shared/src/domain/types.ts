/**
 * SpaceCraft canonical domain model.
 *
 * Every length in this file is expressed in **meters**, including the persisted wire format.
 * The 2D editor and the 3D viewer are both pure projections of these structures — there is no
 * second, renderer-owned geometry state anywhere in the product.
 *
 * Plan space: `x` grows to the east, `y` grows to the south (screen-down, canvas convention).
 * World space: plan `(x, y)` maps to three.js `(x, elevation, y)`.
 */

/** Current persisted schema version. Bump whenever the shape of `FloorPlan` changes. */
export const CURRENT_SCHEMA_VERSION = 1;

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * A shared corner of the wall graph. Walls reference nodes by id instead of storing raw
 * endpoints, which is what makes corner dragging and room detection possible.
 */
export interface WallNode {
  id: string;
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  /** Start node id. */
  a: string;
  /** End node id. */
  b: string;
  /** Full thickness in meters; the centerline sits in the middle. */
  thickness: number;
  height: number;
  materialId: string;
}

export type OpeningKind = 'door' | 'window';

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distance from node `a` to the **center** of the opening, along the wall centerline. */
  offset: number;
  width: number;
  height: number;
  /** Distance from the floor to the bottom of the opening. Doors use 0. */
  sillHeight: number;
  /** Mirrors the door swing symbol in the plan view. */
  flipped: boolean;
}

export interface Room {
  id: string;
  name: string;
  /** Ordered, closed loop of node ids. The last node implicitly connects back to the first. */
  nodeIds: string[];
  floorMaterialId: string;
  /** Rooms created by loop detection are re-derived on every wall edit unless renamed. */
  autoNamed: boolean;
}

export interface Size3 {
  width: number;
  depth: number;
  height: number;
}

export interface FurnitureItem {
  id: string;
  /** Points at an entry of the procedural catalog. */
  catalogId: string;
  name: string;
  /** Footprint center, in plan space. */
  position: Vec2;
  /** Rotation around the vertical axis, in radians, clockwise on the plan. */
  rotation: number;
  size: Size3;
  materialId: string;
  /** Height of the item's base above the floor (a lamp on a table, a wall shelf…). */
  elevation: number;
  locked: boolean;
}

export interface Level {
  id: string;
  name: string;
  /** Floor elevation in meters — reserved for the multi-level future, always 0 in the MVP. */
  elevation: number;
  nodes: WallNode[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  furniture: FurnitureItem[];
}

export interface PlanSettings {
  /** Grid spacing in meters. */
  gridSize: number;
  snapEnabled: boolean;
  defaultWallHeight: number;
  defaultWallThickness: number;
  wallMaterialId: string;
  floorMaterialId: string;
}

export interface FloorPlan {
  schemaVersion: number;
  levels: Level[];
  settings: PlanSettings;
}

export interface Project {
  id: string;
  name: string;
  plan: FloorPlan;
  createdAt: string;
  updatedAt: string;
  /** Anonymous demo workspace the project belongs to. */
  workspaceId?: string;
}

/** Everything that can be selected in either view. */
export type EntityKind = 'node' | 'wall' | 'opening' | 'room' | 'furniture';

export interface EntityRef {
  kind: EntityKind;
  id: string;
}

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  gridSize: 0.5,
  snapEnabled: true,
  defaultWallHeight: 2.7,
  defaultWallThickness: 0.15,
  wallMaterialId: 'white-plaster',
  floorMaterialId: 'oak',
};

/** Hard geometric limits enforced by validation and by the editor tools. */
export const GEOMETRY_LIMITS = {
  minWallLength: 0.2,
  maxWallLength: 60,
  minWallThickness: 0.05,
  maxWallThickness: 0.6,
  minWallHeight: 1.8,
  maxWallHeight: 6,
  minOpeningWidth: 0.4,
  maxOpeningWidth: 6,
  minOpeningHeight: 0.3,
  /** An opening must keep at least this much solid wall on each side. */
  minOpeningMargin: 0.05,
  minFurnitureSize: 0.01,
  maxFurnitureSize: 12,
} as const;
