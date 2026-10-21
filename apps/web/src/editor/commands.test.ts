import { describe, expect, it } from 'vitest';
import {
  buildNodeMap,
  createEmptyPlan,
  createSamplePlan,
  currentLevel,
  openingsOfWall,
  roomArea,
  wallLength,
  type FloorPlan,
} from '@spacecraft/shared';
import {
  addFurniture,
  addOpening,
  addRoomRectangle,
  addWall,
  deleteEntities,
  duplicateFurniture,
  moveFurniture,
  moveNode,
  moveOpening,
  resizeFurniture,
  rotateFurniture,
  setOpeningProperties,
  setRoomProperties,
  setWallProperties,
  type PlanCommand,
} from './commands';
import { runCommand } from './history';

const apply = (plan: FloorPlan, ...commands: PlanCommand[]): FloorPlan =>
  commands.reduce((state, command) => runCommand(state, command).state, plan);

const level = currentLevel;

describe('addWall', () => {
  it('creates two nodes and a wall on an empty plan', () => {
    const plan = apply(
      createEmptyPlan(),
      addWall({ from: { point: { x: 0, y: 0 } }, to: { point: { x: 4, y: 0 } } }),
    );

    expect(level(plan).nodes).toHaveLength(2);
    expect(level(plan).walls).toHaveLength(1);
    expect(wallLength(level(plan).walls[0]!, buildNodeMap(level(plan).nodes))).toBeCloseTo(4);
  });

  it('reuses an existing node when the anchor names one', () => {
    let plan = apply(
      createEmptyPlan(),
      addWall({ from: { point: { x: 0, y: 0 } }, to: { point: { x: 4, y: 0 } } }),
    );

    const endNode = level(plan).walls[0]!.b;
    plan = apply(
      plan,
      addWall({
        from: { point: { x: 4, y: 0 }, nodeId: endNode },
        to: { point: { x: 4, y: 3 } },
      }),
    );

    expect(level(plan).nodes).toHaveLength(3);
    expect(level(plan).walls).toHaveLength(2);
  });

  it('refuses a wall shorter than the minimum length', () => {
    const plan = apply(
      createEmptyPlan(),
      addWall({ from: { point: { x: 0, y: 0 } }, to: { point: { x: 0.05, y: 0 } } }),
    );

    expect(level(plan).walls).toHaveLength(0);
  });

  it('refuses a duplicate wall between the same pair of nodes', () => {
    let plan = apply(
      createEmptyPlan(),
      addWall({ from: { point: { x: 0, y: 0 } }, to: { point: { x: 4, y: 0 } } }),
    );

    const [a, b] = [level(plan).walls[0]!.a, level(plan).walls[0]!.b];
    plan = apply(
      plan,
      addWall({
        from: { point: { x: 0, y: 0 }, nodeId: a },
        to: { point: { x: 4, y: 0 }, nodeId: b },
      }),
    );

    expect(level(plan).walls).toHaveLength(1);
  });

  it('splits the host wall when an endpoint lands on it', () => {
    let plan = apply(
      createEmptyPlan(),
      addWall({ from: { point: { x: 0, y: 0 } }, to: { point: { x: 6, y: 0 } } }),
    );

    const hostId = level(plan).walls[0]!.id;

    plan = apply(
      plan,
      addWall({
        from: { point: { x: 3, y: 0 }, wallId: hostId },
        to: { point: { x: 3, y: 4 } },
      }),
    );

    // The original wall became two halves plus the new branch.
    expect(level(plan).walls).toHaveLength(3);
    expect(level(plan).nodes).toHaveLength(4);
  });

  it('reuses the nearest end instead of splitting off a sliver', () => {
    let plan = apply(
      createEmptyPlan(),
      addWall({ from: { point: { x: 0, y: 0 } }, to: { point: { x: 6, y: 0 } } }),
    );

    const hostId = level(plan).walls[0]!.id;

    plan = apply(
      plan,
      addWall({
        from: { point: { x: 0.05, y: 0 }, wallId: hostId },
        to: { point: { x: 0, y: 4 } },
      }),
    );

    expect(level(plan).walls).toHaveLength(2);
    expect(level(plan).nodes).toHaveLength(3);
  });
});

describe('addRoomRectangle', () => {
  it('closes four walls and detects one room', () => {
    const plan = apply(createEmptyPlan(), addRoomRectangle({ x: 0, y: 0 }, { x: 5, y: 4 }));

    expect(level(plan).walls).toHaveLength(4);
    expect(level(plan).rooms).toHaveLength(1);
    expect(roomArea(level(plan).rooms[0]!, level(plan))).toBeCloseTo(20);
  });

  it('ignores a degenerate rectangle', () => {
    const plan = apply(createEmptyPlan(), addRoomRectangle({ x: 0, y: 0 }, { x: 0.05, y: 4 }));

    expect(level(plan).walls).toHaveLength(0);
  });

  it('names the room automatically', () => {
    const plan = apply(createEmptyPlan(), addRoomRectangle({ x: 0, y: 0 }, { x: 5, y: 4 }));

    expect(level(plan).rooms[0]!.name).toMatch(/^Ambiente/);
    expect(level(plan).rooms[0]!.autoNamed).toBe(true);
  });
});

describe('moveNode', () => {
  it('drags the shared corner and both walls with it', () => {
    const plan = apply(createSamplePlan(), moveNode('n-a', { x: -1, y: -1 }));
    const node = level(plan).nodes.find((candidate) => candidate.id === 'n-a');

    expect(node).toMatchObject({ x: -1, y: -1 });
    expect(level(plan).rooms).toHaveLength(5);
  });

  it('keeps openings inside a wall that got shorter', () => {
    // Pull the west end of the north wall far to the right, shrinking it under the windows.
    const plan = apply(createSamplePlan(), moveNode('n-a', { x: 3.6, y: 0 }));
    const wall = level(plan).walls.find((candidate) => candidate.id === 'w-n1')!;
    const span = wallLength(wall, buildNodeMap(level(plan).nodes));

    for (const opening of openingsOfWall('w-n1', level(plan).openings)) {
      expect(opening.offset - opening.width / 2).toBeGreaterThanOrEqual(-1e-6);
      expect(opening.offset + opening.width / 2).toBeLessThanOrEqual(span + 1e-6);
    }
  });
});

describe('setWallProperties', () => {
  it('clamps thickness to the geometric limits', () => {
    const plan = apply(createSamplePlan(), setWallProperties('w-n1', { thickness: 99 }));

    expect(level(plan).walls.find((w) => w.id === 'w-n1')!.thickness).toBeLessThanOrEqual(0.6);
  });

  it('shrinks an opening that no longer fits a shorter wall', () => {
    const plan = apply(createSamplePlan(), setWallProperties('w-i1', { height: 2 }));
    const door = level(plan).openings.find((o) => o.id === 'o-bed-door')!;

    expect(door.sillHeight + door.height).toBeLessThanOrEqual(2 + 1e-9);
  });
});

describe('openings', () => {
  it('adds a door to a wall', () => {
    const plan = apply(createEmptyPlan(), addRoomRectangle({ x: 0, y: 0 }, { x: 5, y: 4 }));
    const wallId = level(plan).walls[0]!.id;

    const next = apply(plan, addOpening({ wallId, kind: 'door', offset: 2.5 }));

    expect(level(next).openings).toHaveLength(1);
    expect(level(next).openings[0]!.kind).toBe('door');
  });

  it('clamps an opening that would overflow the wall end', () => {
    const plan = apply(createEmptyPlan(), addRoomRectangle({ x: 0, y: 0 }, { x: 5, y: 4 }));
    const wallId = level(plan).walls[0]!.id;

    const next = apply(plan, addOpening({ wallId, kind: 'door', offset: 4.95, width: 0.9 }));

    expect(level(next).openings).toHaveLength(1);
    expect(level(next).openings[0]!.offset).toBeLessThanOrEqual(5 - 0.45);
  });

  it('refuses an opening that overlaps an existing one', () => {
    const plan = apply(
      createSamplePlan(),
      addOpening({ wallId: 'w-n1', kind: 'door', offset: 1.5 }),
    );

    expect(openingsOfWall('w-n1', level(plan).openings)).toHaveLength(2);
  });

  it('refuses to move an opening past the end of its wall', () => {
    const plan = apply(createSamplePlan(), moveOpening('o-liv-1', 99));
    const opening = level(plan).openings.find((o) => o.id === 'o-liv-1')!;

    expect(opening.offset).toBeLessThan(5.4);
  });

  it('converts a window into a door and zeroes its sill', () => {
    const plan = apply(
      createSamplePlan(),
      setOpeningProperties('o-liv-1', { kind: 'door', sillHeight: 0, height: 2.1 }),
    );

    const opening = level(plan).openings.find((o) => o.id === 'o-liv-1')!;
    expect(opening.kind).toBe('door');
    expect(opening.sillHeight).toBe(0);
  });
});

describe('deleteEntities', () => {
  it('merges two rooms when the partition between them is removed', () => {
    const plan = apply(createSamplePlan(), deleteEntities([{ kind: 'wall', id: 'w-i1' }]));

    expect(level(plan).rooms).toHaveLength(4);
    expect(openingsOfWall('w-i1', level(plan).openings)).toHaveLength(0);
  });

  it('removes furniture without touching the shell', () => {
    const plan = apply(createSamplePlan(), deleteEntities([{ kind: 'furniture', id: 'f-sofa' }]));

    expect(level(plan).furniture.some((item) => item.id === 'f-sofa')).toBe(false);
    expect(level(plan).rooms).toHaveLength(5);
  });

  it('is undoable as a single step', () => {
    const plan = createSamplePlan();
    const result = runCommand(plan, deleteEntities([{ kind: 'wall', id: 'w-i1' }]));

    expect(currentLevel(result.state).rooms).toHaveLength(4);
    expect(currentLevel(plan).rooms).toHaveLength(5);
  });
});

describe('furniture', () => {
  it('adds an item from the catalog with its default size', () => {
    const plan = apply(
      createEmptyPlan(),
      addFurniture({ catalogId: 'sofa', position: { x: 1, y: 1 } }),
    );
    const item = level(plan).furniture[0]!;

    expect(item.catalogId).toBe('sofa');
    expect(item.size.width).toBeCloseTo(2.2);
  });

  it('clamps a resize to the catalog limits', () => {
    const plan = apply(createSamplePlan(), resizeFurniture('f-sofa', { width: 99 }));

    expect(level(plan).furniture.find((i) => i.id === 'f-sofa')!.size.width).toBeLessThanOrEqual(
      3.6,
    );
  });

  it('refuses to move a locked item', () => {
    let plan = createSamplePlan();
    const item = currentLevel(plan).furniture[0]!;
    item.locked = true;

    plan = apply(plan, moveFurniture(item.id, { x: 99, y: 99 }));

    expect(level(plan).furniture[0]!.position.x).not.toBe(99);
  });

  it('rotates in place', () => {
    const plan = apply(createSamplePlan(), rotateFurniture('f-sofa', Math.PI / 2));

    expect(level(plan).furniture.find((i) => i.id === 'f-sofa')!.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('duplicates with a fresh id and an offset', () => {
    const plan = apply(createSamplePlan(), duplicateFurniture('f-sofa'));
    const copies = level(plan).furniture.filter((item) => item.catalogId === 'sofa');

    expect(copies).toHaveLength(2);
    expect(copies[0]!.id).not.toBe(copies[1]!.id);
    expect(copies[1]!.position.x).not.toBe(copies[0]!.position.x);
  });
});

describe('setRoomProperties', () => {
  it('renaming a room marks it as user-named so re-sync keeps the name', () => {
    const plan = apply(createSamplePlan(), setRoomProperties('rm-living', { name: 'Living' }));
    const room = level(plan).rooms.find((r) => r.id === 'rm-living')!;

    expect(room.name).toBe('Living');
    expect(room.autoNamed).toBe(false);
  });

  it('changes the floor material', () => {
    const plan = apply(
      createSamplePlan(),
      setRoomProperties('rm-kitchen', { floorMaterialId: 'marble' }),
    );

    expect(level(plan).rooms.find((r) => r.id === 'rm-kitchen')!.floorMaterialId).toBe('marble');
  });
});
