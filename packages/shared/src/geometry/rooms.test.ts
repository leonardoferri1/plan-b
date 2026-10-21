import { describe, expect, it } from 'vitest';
import type { Wall, WallNode } from '../domain/types';
import { detectRoomLoops, loopKey } from './rooms';
import { polygonArea } from './polygon';

const node = (id: string, x: number, y: number): WallNode => ({ id, x, y });

const wall = (id: string, a: string, b: string): Wall => ({
  id,
  a,
  b,
  thickness: 0.15,
  height: 2.7,
  materialId: 'white-plaster',
});

describe('detectRoomLoops', () => {
  it('finds a single room for a closed rectangle', () => {
    const nodes = [node('a', 0, 0), node('b', 4, 0), node('c', 4, 3), node('d', 0, 3)];
    const walls = [
      wall('w1', 'a', 'b'),
      wall('w2', 'b', 'c'),
      wall('w3', 'c', 'd'),
      wall('w4', 'd', 'a'),
    ];

    const loops = detectRoomLoops(nodes, walls);

    expect(loops).toHaveLength(1);
    expect(loops[0]!.area).toBeCloseTo(12, 6);
    expect(new Set(loops[0]!.nodeIds)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('finds both rooms when a rectangle is split by a partition', () => {
    //  a ── e ── b
    //  │    │    │
    //  d ── f ── c
    const nodes = [
      node('a', 0, 0),
      node('e', 4, 0),
      node('b', 10, 0),
      node('c', 10, 5),
      node('f', 4, 5),
      node('d', 0, 5),
    ];
    const walls = [
      wall('w1', 'a', 'e'),
      wall('w2', 'e', 'b'),
      wall('w3', 'b', 'c'),
      wall('w4', 'c', 'f'),
      wall('w5', 'f', 'd'),
      wall('w6', 'd', 'a'),
      wall('w7', 'e', 'f'),
    ];

    const loops = detectRoomLoops(nodes, walls);
    const areas = loops.map((loop) => Math.round(loop.area)).sort((x, y) => x - y);

    expect(loops).toHaveLength(2);
    expect(areas).toEqual([20, 30]);
  });

  it('ignores open shapes', () => {
    const nodes = [node('a', 0, 0), node('b', 4, 0), node('c', 4, 3)];
    const walls = [wall('w1', 'a', 'b'), wall('w2', 'b', 'c')];

    expect(detectRoomLoops(nodes, walls)).toEqual([]);
  });

  it('ignores a dangling wall attached to a closed room', () => {
    const nodes = [
      node('a', 0, 0),
      node('b', 4, 0),
      node('c', 4, 3),
      node('d', 0, 3),
      node('spur', 6, 0),
    ];
    const walls = [
      wall('w1', 'a', 'b'),
      wall('w2', 'b', 'c'),
      wall('w3', 'c', 'd'),
      wall('w4', 'd', 'a'),
      wall('w5', 'b', 'spur'),
    ];

    const loops = detectRoomLoops(nodes, walls);

    expect(loops).toHaveLength(1);
    expect(loops[0]!.area).toBeCloseTo(12, 6);
  });

  it('handles two disconnected rooms', () => {
    const nodes = [
      node('a', 0, 0),
      node('b', 2, 0),
      node('c', 2, 2),
      node('d', 0, 2),
      node('e', 10, 0),
      node('f', 13, 0),
      node('g', 13, 3),
      node('h', 10, 3),
    ];
    const walls = [
      wall('w1', 'a', 'b'),
      wall('w2', 'b', 'c'),
      wall('w3', 'c', 'd'),
      wall('w4', 'd', 'a'),
      wall('w5', 'e', 'f'),
      wall('w6', 'f', 'g'),
      wall('w7', 'g', 'h'),
      wall('w8', 'h', 'e'),
    ];

    const loops = detectRoomLoops(nodes, walls);
    const areas = loops.map((loop) => Math.round(loop.area)).sort((x, y) => x - y);

    expect(loops).toHaveLength(2);
    expect(areas).toEqual([4, 9]);
  });

  it('returns polygons whose area matches the shoelace of their nodes', () => {
    const nodes = [node('a', 0, 0), node('b', 6, 0), node('c', 6, 4), node('d', 0, 4)];
    const walls = [
      wall('w1', 'a', 'b'),
      wall('w2', 'b', 'c'),
      wall('w3', 'c', 'd'),
      wall('w4', 'd', 'a'),
    ];

    const loop = detectRoomLoops(nodes, walls)[0]!;
    expect(polygonArea(loop.polygon)).toBeCloseTo(loop.area, 10);
  });

  it('skips loops smaller than the minimum room area', () => {
    const nodes = [node('a', 0, 0), node('b', 0.3, 0), node('c', 0.3, 0.3), node('d', 0, 0.3)];
    const walls = [
      wall('w1', 'a', 'b'),
      wall('w2', 'b', 'c'),
      wall('w3', 'c', 'd'),
      wall('w4', 'd', 'a'),
    ];

    expect(detectRoomLoops(nodes, walls)).toEqual([]);
  });

  it('produces a key that is stable under node reordering', () => {
    expect(loopKey(['b', 'a', 'c'])).toBe(loopKey(['c', 'b', 'a']));
    expect(loopKey(['a', 'b'])).not.toBe(loopKey(['a', 'c']));
  });
});
