import {
  GEOMETRY_LIMITS,
  buildNodeMap,
  checkOpeningFit,
  clampFurnitureSize,
  currentLevel,
  distance,
  newFurnitureId,
  newNodeId,
  newOpeningId,
  newWallId,
  openingsOfWall,
  removeEntities,
  requireCatalogItem,
  syncRooms,
  toWallLocal,
  wallLength,
} from '@spacecraft/shared';
import type {
  EntityRef,
  FloorPlan,
  FurnitureItem,
  Level,
  Opening,
  OpeningKind,
  PlanSettings,
  Room,
  Size3,
  Vec2,
  Wall,
} from '@spacecraft/shared';
import type { CommandLike } from './history';

/**
 * Every mutation of the document is a command: a named, pure function over an immer draft of
 * the plan. Tools and panels never touch the store's state directly, which is what keeps undo
 * correct and makes each behaviour unit-testable without React or a canvas.
 */
export type PlanCommand = CommandLike<FloorPlan>;

const level = (plan: FloorPlan): Level => currentLevel(plan);

const findWall = (lvl: Level, id: string): Wall | undefined =>
  lvl.walls.find((wall) => wall.id === id);

const findFurniture = (lvl: Level, id: string): FurnitureItem | undefined =>
  lvl.furniture.find((item) => item.id === id);

const findOpening = (lvl: Level, id: string): Opening | undefined =>
  lvl.openings.find((opening) => opening.id === id);

const findRoom = (lvl: Level, id: string): Room | undefined =>
  lvl.rooms.find((room) => room.id === id);

/** Point to attach a new wall end to: an existing node, a point on a wall, or open space. */
export interface WallAnchor {
  point: Vec2;
  nodeId?: string;
  /** When set, the anchor lands on this wall and splits it so the graph stays planar. */
  wallId?: string;
}

/**
 * Splits a wall at `point`, returning the id of the node created at the cut.
 *
 * Splitting matters for more than tidiness: room detection walks the wall graph, so a wall
 * that merely *crosses* another without sharing a node leaves the loop open and the room
 * disappears. Openings are redistributed to whichever half now contains them.
 */
function splitWallAt(lvl: Level, wallId: string, point: Vec2): string | null {
  const wall = findWall(lvl, wallId);
  if (!wall) return null;

  const nodes = buildNodeMap(lvl.nodes);
  const local = toWallLocal(point, wall, nodes);
  const total = wallLength(wall, nodes);
  if (!local || total <= 0) return null;

  const min = GEOMETRY_LIMITS.minWallLength;

  // Too close to an end: reuse that end instead of creating a sliver wall.
  if (local.along < min) return wall.a;
  if (total - local.along < min) return wall.b;

  const nodeId = newNodeId();
  lvl.nodes.push({ id: nodeId, x: point.x, y: point.y });

  const tail: Wall = {
    id: newWallId(),
    a: nodeId,
    b: wall.b,
    thickness: wall.thickness,
    height: wall.height,
    materialId: wall.materialId,
  };

  wall.b = nodeId;
  lvl.walls.push(tail);

  for (const opening of lvl.openings) {
    if (opening.wallId !== wallId) continue;
    if (opening.offset > local.along) {
      opening.wallId = tail.id;
      opening.offset -= local.along;
    }
  }

  return nodeId;
}

/** Resolves an anchor to a node id, creating or splitting as needed. */
function resolveAnchor(lvl: Level, anchor: WallAnchor): string | null {
  if (anchor.nodeId && lvl.nodes.some((node) => node.id === anchor.nodeId)) {
    return anchor.nodeId;
  }

  if (anchor.wallId) {
    const nodeId = splitWallAt(lvl, anchor.wallId, anchor.point);
    if (nodeId) return nodeId;
  }

  const id = newNodeId();
  lvl.nodes.push({ id, x: anchor.point.x, y: anchor.point.y });
  return id;
}

export interface AddWallOptions {
  from: WallAnchor;
  to: WallAnchor;
  thickness?: number;
  height?: number;
  materialId?: string;
}

export function addWall(options: AddWallOptions): PlanCommand {
  return {
    type: 'wall.add',
    label: 'Adicionar parede',
    mutate(plan) {
      const lvl = level(plan);

      if (distance(options.from.point, options.to.point) < GEOMETRY_LIMITS.minWallLength) {
        return;
      }

      const a = resolveAnchor(lvl, options.from);
      // The first anchor may have split a wall, so the second is resolved afterwards.
      const b = resolveAnchor(lvl, options.to);

      if (!a || !b || a === b) return;

      const duplicate = lvl.walls.some(
        (wall) => (wall.a === a && wall.b === b) || (wall.a === b && wall.b === a),
      );
      if (duplicate) return;

      lvl.walls.push({
        id: newWallId(),
        a,
        b,
        thickness: options.thickness ?? plan.settings.defaultWallThickness,
        height: options.height ?? plan.settings.defaultWallHeight,
        materialId: options.materialId ?? plan.settings.wallMaterialId,
      });

      syncRooms(lvl);
    },
  };
}

/** Drops a closed rectangle of four walls — the fastest way to start a room. */
export function addRoomRectangle(from: Vec2, to: Vec2): PlanCommand {
  return {
    type: 'room.rectangle',
    label: 'Adicionar ambiente',
    mutate(plan) {
      const lvl = level(plan);
      const minX = Math.min(from.x, to.x);
      const maxX = Math.max(from.x, to.x);
      const minY = Math.min(from.y, to.y);
      const maxY = Math.max(from.y, to.y);

      if (maxX - minX < GEOMETRY_LIMITS.minWallLength) return;
      if (maxY - minY < GEOMETRY_LIMITS.minWallLength) return;

      const corners: Vec2[] = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ];

      const ids = corners.map((corner) => {
        const existing = lvl.nodes.find((node) => distance(node, corner) < 1e-6);
        if (existing) return existing.id;
        const id = newNodeId();
        lvl.nodes.push({ id, x: corner.x, y: corner.y });
        return id;
      });

      for (let i = 0; i < ids.length; i += 1) {
        const a = ids[i]!;
        const b = ids[(i + 1) % ids.length]!;
        const duplicate = lvl.walls.some(
          (wall) => (wall.a === a && wall.b === b) || (wall.a === b && wall.b === a),
        );
        if (duplicate) continue;

        lvl.walls.push({
          id: newWallId(),
          a,
          b,
          thickness: plan.settings.defaultWallThickness,
          height: plan.settings.defaultWallHeight,
          materialId: plan.settings.wallMaterialId,
        });
      }

      syncRooms(lvl);
    },
  };
}

export function moveNode(nodeId: string, position: Vec2): PlanCommand {
  return {
    type: 'node.move',
    label: 'Mover canto',
    coalesceKey: `node.move:${nodeId}`,
    mutate(plan) {
      const lvl = level(plan);
      const node = lvl.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return;

      node.x = position.x;
      node.y = position.y;

      clampOpeningsOfNode(lvl, nodeId);
      syncRooms(lvl);
    },
  };
}

/** Keeps openings legal after their host wall changed length. */
function clampOpeningsOfNode(lvl: Level, nodeId: string): void {
  const nodes = buildNodeMap(lvl.nodes);
  const affected = lvl.walls.filter((wall) => wall.a === nodeId || wall.b === nodeId);

  for (const wall of affected) {
    const length = wallLength(wall, nodes);
    for (const opening of openingsOfWall(wall.id, lvl.openings)) {
      const margin = GEOMETRY_LIMITS.minOpeningMargin;
      const maxWidth = Math.max(GEOMETRY_LIMITS.minOpeningWidth, length - margin * 2);
      opening.width = Math.min(opening.width, maxWidth);
      const half = opening.width / 2;
      opening.offset = Math.min(length - half - margin, Math.max(half + margin, opening.offset));
    }
  }
}

export function moveWall(wallId: string, delta: Vec2): PlanCommand {
  return {
    type: 'wall.move',
    label: 'Mover parede',
    coalesceKey: `wall.move:${wallId}`,
    mutate(plan) {
      const lvl = level(plan);
      const wall = findWall(lvl, wallId);
      if (!wall) return;

      for (const id of [wall.a, wall.b]) {
        const node = lvl.nodes.find((candidate) => candidate.id === id);
        if (!node) continue;
        node.x += delta.x;
        node.y += delta.y;
      }

      syncRooms(lvl);
    },
  };
}

export function setWallProperties(
  wallId: string,
  patch: Partial<Pick<Wall, 'thickness' | 'height' | 'materialId'>>,
): PlanCommand {
  return {
    type: 'wall.update',
    label: 'Editar parede',
    coalesceKey: `wall.update:${wallId}`,
    mutate(plan) {
      const lvl = level(plan);
      const wall = findWall(lvl, wallId);
      if (!wall) return;

      if (patch.thickness !== undefined) {
        wall.thickness = Math.min(
          GEOMETRY_LIMITS.maxWallThickness,
          Math.max(GEOMETRY_LIMITS.minWallThickness, patch.thickness),
        );
      }

      if (patch.height !== undefined) {
        wall.height = Math.min(
          GEOMETRY_LIMITS.maxWallHeight,
          Math.max(GEOMETRY_LIMITS.minWallHeight, patch.height),
        );

        // A shorter wall must not leave an opening poking through the ceiling.
        for (const opening of openingsOfWall(wall.id, lvl.openings)) {
          if (opening.sillHeight + opening.height > wall.height) {
            opening.sillHeight = Math.min(opening.sillHeight, Math.max(0, wall.height - 0.3));
            opening.height = Math.max(
              GEOMETRY_LIMITS.minOpeningHeight,
              wall.height - opening.sillHeight,
            );
          }
        }
      }

      if (patch.materialId !== undefined) wall.materialId = patch.materialId;
    },
  };
}

export function deleteEntities(refs: readonly EntityRef[]): PlanCommand {
  return {
    type: 'entities.delete',
    label: refs.length > 1 ? 'Excluir seleção' : 'Excluir',
    mutate(plan) {
      removeEntities(level(plan), refs);
    },
  };
}

export interface AddOpeningOptions {
  wallId: string;
  kind: OpeningKind;
  offset: number;
  width?: number;
  height?: number;
  sillHeight?: number;
}

const OPENING_DEFAULTS: Record<OpeningKind, { width: number; height: number; sill: number }> = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.4, sill: 0.9 },
};

export function addOpening(options: AddOpeningOptions): PlanCommand {
  return {
    type: 'opening.add',
    label: options.kind === 'door' ? 'Adicionar porta' : 'Adicionar janela',
    mutate(plan) {
      const lvl = level(plan);
      const wall = findWall(lvl, options.wallId);
      if (!wall) return;

      const defaults = OPENING_DEFAULTS[options.kind];
      const candidate: Opening = {
        id: newOpeningId(),
        wallId: options.wallId,
        kind: options.kind,
        offset: options.offset,
        width: options.width ?? defaults.width,
        height: options.height ?? defaults.height,
        sillHeight: options.sillHeight ?? defaults.sill,
        flipped: false,
      };

      const nodes = buildNodeMap(lvl.nodes);
      const fit = checkOpeningFit(candidate, wall, nodes, openingsOfWall(wall.id, lvl.openings));

      if (!fit.valid) {
        if (fit.clampedOffset === undefined) return;
        candidate.offset = fit.clampedOffset;
        const retry = checkOpeningFit(
          candidate,
          wall,
          nodes,
          openingsOfWall(wall.id, lvl.openings),
        );
        if (!retry.valid) return;
      }

      lvl.openings.push(candidate);
    },
  };
}

export function moveOpening(openingId: string, offset: number): PlanCommand {
  return {
    type: 'opening.move',
    label: 'Mover abertura',
    coalesceKey: `opening.move:${openingId}`,
    mutate(plan) {
      const lvl = level(plan);
      const opening = findOpening(lvl, openingId);
      if (!opening) return;

      const wall = findWall(lvl, opening.wallId);
      if (!wall) return;

      const nodes = buildNodeMap(lvl.nodes);
      const siblings = openingsOfWall(wall.id, lvl.openings);
      const fit = checkOpeningFit({ ...opening, offset }, wall, nodes, siblings);

      if (fit.valid) {
        opening.offset = offset;
      } else if (fit.clampedOffset !== undefined) {
        const retry = checkOpeningFit(
          { ...opening, offset: fit.clampedOffset },
          wall,
          nodes,
          siblings,
        );
        if (retry.valid) opening.offset = fit.clampedOffset;
      }
    },
  };
}

export function setOpeningProperties(
  openingId: string,
  patch: Partial<Pick<Opening, 'width' | 'height' | 'sillHeight' | 'flipped' | 'kind'>>,
): PlanCommand {
  return {
    type: 'opening.update',
    label: 'Editar abertura',
    coalesceKey: `opening.update:${openingId}`,
    mutate(plan) {
      const lvl = level(plan);
      const opening = findOpening(lvl, openingId);
      if (!opening) return;

      const wall = findWall(lvl, opening.wallId);
      if (!wall) return;

      const next: Opening = { ...opening, ...patch };
      next.width = Math.min(
        GEOMETRY_LIMITS.maxOpeningWidth,
        Math.max(GEOMETRY_LIMITS.minOpeningWidth, next.width),
      );
      next.height = Math.max(GEOMETRY_LIMITS.minOpeningHeight, next.height);
      next.sillHeight = Math.max(0, next.sillHeight);

      if (next.sillHeight + next.height > wall.height) {
        next.height = Math.max(GEOMETRY_LIMITS.minOpeningHeight, wall.height - next.sillHeight);
      }

      const nodes = buildNodeMap(lvl.nodes);
      const siblings = openingsOfWall(wall.id, lvl.openings);
      let fit = checkOpeningFit(next, wall, nodes, siblings);

      if (!fit.valid && fit.clampedOffset !== undefined) {
        next.offset = fit.clampedOffset;
        fit = checkOpeningFit(next, wall, nodes, siblings);
      }

      if (!fit.valid) return;

      Object.assign(opening, next);
    },
  };
}

export interface AddFurnitureOptions {
  catalogId: string;
  position: Vec2;
  rotation?: number;
  materialId?: string;
  name?: string;
  size?: Size3;
  id?: string;
}

export function addFurniture(options: AddFurnitureOptions): PlanCommand {
  return {
    type: 'furniture.add',
    label: 'Adicionar móvel',
    mutate(plan) {
      const catalog = requireCatalogItem(options.catalogId);
      const lvl = level(plan);

      lvl.furniture.push({
        id: options.id ?? newFurnitureId(),
        catalogId: options.catalogId,
        name: options.name ?? catalog.name,
        position: { ...options.position },
        rotation: options.rotation ?? 0,
        size: clampFurnitureSize(options.catalogId, options.size ?? catalog.defaultSize),
        materialId: options.materialId ?? catalog.defaultMaterials.primary,
        elevation: catalog.elevation,
        locked: false,
      });
    },
  };
}

export function moveFurniture(id: string, position: Vec2): PlanCommand {
  return {
    type: 'furniture.move',
    label: 'Mover móvel',
    coalesceKey: `furniture.move:${id}`,
    mutate(plan) {
      const item = findFurniture(level(plan), id);
      if (!item || item.locked) return;
      item.position.x = position.x;
      item.position.y = position.y;
    },
  };
}

export function rotateFurniture(id: string, rotation: number): PlanCommand {
  return {
    type: 'furniture.rotate',
    label: 'Girar móvel',
    coalesceKey: `furniture.rotate:${id}`,
    mutate(plan) {
      const item = findFurniture(level(plan), id);
      if (!item || item.locked) return;
      item.rotation = rotation;
    },
  };
}

export function resizeFurniture(id: string, size: Partial<Size3>): PlanCommand {
  return {
    type: 'furniture.resize',
    label: 'Redimensionar móvel',
    coalesceKey: `furniture.resize:${id}`,
    mutate(plan) {
      const item = findFurniture(level(plan), id);
      if (!item || item.locked) return;
      item.size = clampFurnitureSize(item.catalogId, { ...item.size, ...size });
    },
  };
}

export function setFurnitureProperties(
  id: string,
  patch: Partial<Pick<FurnitureItem, 'name' | 'materialId' | 'elevation' | 'locked'>>,
): PlanCommand {
  return {
    type: 'furniture.update',
    label: 'Editar móvel',
    coalesceKey: `furniture.update:${id}`,
    mutate(plan) {
      const item = findFurniture(level(plan), id);
      if (!item) return;
      Object.assign(item, patch);
    },
  };
}

export function duplicateFurniture(id: string, offset: Vec2 = { x: 0.4, y: 0.4 }): PlanCommand {
  return {
    type: 'furniture.duplicate',
    label: 'Duplicar móvel',
    mutate(plan) {
      const lvl = level(plan);
      const item = findFurniture(lvl, id);
      if (!item) return;

      lvl.furniture.push({
        ...item,
        id: newFurnitureId(),
        position: { x: item.position.x + offset.x, y: item.position.y + offset.y },
        size: { ...item.size },
        locked: false,
      });
    },
  };
}

export function setRoomProperties(
  roomId: string,
  patch: Partial<Pick<Room, 'name' | 'floorMaterialId'>>,
): PlanCommand {
  return {
    type: 'room.update',
    label: patch.name !== undefined ? 'Renomear ambiente' : 'Editar ambiente',
    coalesceKey: `room.update:${roomId}`,
    mutate(plan) {
      const room = findRoom(level(plan), roomId);
      if (!room) return;

      if (patch.name !== undefined) {
        room.name = patch.name;
        room.autoNamed = false;
      }
      if (patch.floorMaterialId !== undefined) room.floorMaterialId = patch.floorMaterialId;
    },
  };
}

export function setPlanSettings(patch: Partial<PlanSettings>): PlanCommand {
  return {
    type: 'settings.update',
    label: 'Ajustar preferências',
    coalesceKey: 'settings.update',
    mutate(plan) {
      Object.assign(plan.settings, patch);
    },
  };
}

/** Replaces the whole document — used by JSON import and by "open project". */
export function replacePlan(next: FloorPlan): PlanCommand {
  return {
    type: 'plan.replace',
    label: 'Substituir planta',
    mutate(plan) {
      plan.schemaVersion = next.schemaVersion;
      plan.levels = next.levels;
      plan.settings = next.settings;
    },
  };
}
