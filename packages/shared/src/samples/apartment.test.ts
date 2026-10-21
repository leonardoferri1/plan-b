import { describe, expect, it } from 'vitest';
import { createSampleLevel, createSamplePlan } from './apartment';
import { currentLevel, planStats, removeEntities, roomArea, syncRooms } from '../domain/plan';
import { detectRoomLoops } from '../geometry/rooms';
import { buildNodeMap, checkOpeningFit, openingsOfWall, wallLength } from '../geometry/walls';
import { getMaterial, materialExists } from '../catalog/materials';
import { catalogExists, clampFurnitureSize, resolveParts } from '../catalog/furniture';

describe('sample apartment', () => {
  const level = createSampleLevel();

  it('describes five rooms totalling about 63 m²', () => {
    const stats = planStats(level);

    expect(stats.rooms).toBe(5);
    expect(stats.floorArea).toBeCloseTo(63, 0);
  });

  it('has rooms whose hand-written loops match the detected ones', () => {
    const detected = detectRoomLoops(level.nodes, level.walls);
    const detectedKeys = detected.map((loop) => [...loop.nodeIds].sort().join('|')).sort();
    const authoredKeys = level.rooms.map((room) => [...room.nodeIds].sort().join('|')).sort();

    expect(detectedKeys).toEqual(authoredKeys);
  });

  it('keeps every room name after a room re-sync', () => {
    const copy = createSampleLevel();
    syncRooms(copy);

    expect(copy.rooms.map((room) => room.name).sort()).toEqual(
      level.rooms.map((room) => room.name).sort(),
    );
  });

  it('gives each room a plausible area', () => {
    const areas = Object.fromEntries(level.rooms.map((room) => [room.name, roomArea(room, level)]));

    expect(areas['Sala de estar']).toBeCloseTo(22.68, 2);
    expect(areas['Dormitório']).toBeCloseTo(15.12, 2);
    expect(areas['Cozinha']).toBeCloseTo(9.52, 2);
    expect(areas['Banheiro']).toBeCloseTo(5.6, 2);
    expect(areas['Home office']).toBeCloseTo(10.08, 2);
  });

  it('places every opening legally on its host wall', () => {
    const nodes = buildNodeMap(level.nodes);

    for (const opening of level.openings) {
      const host = level.walls.find((wall) => wall.id === opening.wallId);
      expect(host, `missing host wall for ${opening.id}`).toBeDefined();

      const siblings = openingsOfWall(opening.wallId, level.openings);
      const fit = checkOpeningFit(opening, host!, nodes, siblings);

      expect(fit.reason ?? 'ok', `${opening.id} on ${opening.wallId}`).toBe('ok');
      expect(fit.valid).toBe(true);
    }
  });

  it('uses only known materials and catalog items', () => {
    for (const wall of level.walls) expect(materialExists(wall.materialId)).toBe(true);
    for (const room of level.rooms) expect(materialExists(room.floorMaterialId)).toBe(true);
    for (const item of level.furniture) {
      expect(catalogExists(item.catalogId), item.catalogId).toBe(true);
      expect(materialExists(item.materialId), item.materialId).toBe(true);
    }
  });

  it('keeps every wall longer than the minimum', () => {
    const nodes = buildNodeMap(level.nodes);
    for (const wall of level.walls) {
      expect(wallLength(wall, nodes)).toBeGreaterThan(0.2);
    }
  });

  it('builds geometry for every piece of furniture', () => {
    for (const item of level.furniture) {
      const parts = resolveParts(item.catalogId, item.size);
      expect(parts.length, item.catalogId).toBeGreaterThan(0);
      for (const part of parts) {
        expect(Number.isFinite(part.center.x)).toBe(true);
        expect(part.size.y).toBeGreaterThan(0);
      }
    }
  });

  it('keeps furniture sizes inside the catalog limits', () => {
    for (const item of level.furniture) {
      expect(clampFurnitureSize(item.catalogId, item.size)).toEqual(item.size);
    }
  });
});

describe('removeEntities on the sample', () => {
  it('takes openings and orphan nodes along when a wall is deleted', () => {
    const level = createSampleLevel();
    const openingsBefore = openingsOfWall('w-i1', level.openings).length;

    expect(openingsBefore).toBeGreaterThan(0);

    removeEntities(level, [{ kind: 'wall', id: 'w-i1' }]);

    expect(level.walls.some((wall) => wall.id === 'w-i1')).toBe(false);
    expect(openingsOfWall('w-i1', level.openings)).toHaveLength(0);
  });

  it('merges two rooms when the partition between them is removed', () => {
    const level = createSampleLevel();
    expect(level.rooms).toHaveLength(5);

    removeEntities(level, [{ kind: 'wall', id: 'w-i1' }]);

    // Living room and bedroom become a single space.
    expect(level.rooms).toHaveLength(4);
    const biggest = Math.max(...level.rooms.map((room) => roomArea(room, level)));
    expect(biggest).toBeCloseTo(22.68 + 15.12, 1);
  });

  it('removes the walls attached to a deleted node', () => {
    const level = createSampleLevel();
    removeEntities(level, [{ kind: 'node', id: 'n-a' }]);

    expect(level.walls.some((wall) => wall.a === 'n-a' || wall.b === 'n-a')).toBe(false);
    expect(level.nodes.some((node) => node.id === 'n-a')).toBe(false);
  });

  it('deletes furniture without touching the shell', () => {
    const level = createSampleLevel();
    const wallsBefore = level.walls.length;

    removeEntities(level, [{ kind: 'furniture', id: 'f-sofa' }]);

    expect(level.furniture.some((item) => item.id === 'f-sofa')).toBe(false);
    expect(level.walls).toHaveLength(wallsBefore);
    expect(level.rooms).toHaveLength(5);
  });
});

describe('createSamplePlan', () => {
  it('returns an independent copy every call', () => {
    const a = createSamplePlan();
    const b = createSamplePlan();

    currentLevel(a).furniture[0]!.position.x = 999;

    expect(currentLevel(b).furniture[0]!.position.x).not.toBe(999);
  });

  it('resolves the default wall material', () => {
    expect(getMaterial(createSamplePlan().settings.wallMaterialId).id).toBe('white-plaster');
  });
});
