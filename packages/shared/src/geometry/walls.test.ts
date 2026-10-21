import { describe, expect, it } from 'vitest';
import type { Opening, Wall, WallNode } from '../domain/types';
import {
  buildNodeMap,
  checkOpeningFit,
  findHostWall,
  openingPlacement,
  toWallLocal,
  wallExtensions,
  wallLength,
  wallQuad,
  wallSolidSegments,
} from './walls';

const node = (id: string, x: number, y: number): WallNode => ({ id, x, y });

const wall = (id: string, a: string, b: string, thickness = 0.2): Wall => ({
  id,
  a,
  b,
  thickness,
  height: 2.7,
  materialId: 'white-plaster',
});

const opening = (overrides: Partial<Opening> = {}): Opening => ({
  id: 'o1',
  wallId: 'w1',
  kind: 'window',
  offset: 2,
  width: 1,
  height: 1.2,
  sillHeight: 0.9,
  flipped: false,
  swingReversed: false,
  ...overrides,
});

describe('wallLength and wallQuad', () => {
  const nodes = buildNodeMap([node('a', 0, 0), node('b', 4, 0)]);

  it('measures the centerline', () => {
    expect(wallLength(wall('w1', 'a', 'b'), nodes)).toBeCloseTo(4, 10);
  });

  it('builds a rectangle of the wall thickness', () => {
    const quad = wallQuad(wall('w1', 'a', 'b', 0.2), nodes)!;

    expect(quad.points).toHaveLength(4);
    expect(quad.length).toBeCloseTo(4, 10);
    const ys = quad.points.map((point) => point.y).sort((p, q) => p - q);
    expect(ys[0]).toBeCloseTo(-0.1, 10);
    expect(ys[3]).toBeCloseTo(0.1, 10);
  });

  it('grows the quad when junction extensions are supplied', () => {
    const quad = wallQuad(wall('w1', 'a', 'b', 0.2), nodes, { start: 0.1, end: 0.1 })!;
    expect(quad.length).toBeCloseTo(4.2, 10);
    expect(quad.start.x).toBeCloseTo(-0.1, 10);
    expect(quad.end.x).toBeCloseTo(4.1, 10);
  });

  it('returns null when an endpoint is missing', () => {
    expect(wallQuad(wall('w1', 'a', 'missing'), nodes)).toBeNull();
  });
});

describe('wallExtensions', () => {
  const nodes = buildNodeMap([node('a', 0, 0), node('b', 4, 0), node('c', 4, 3)]);

  it('extends only at ends that have a neighbour', () => {
    const walls = [wall('w1', 'a', 'b', 0.2), wall('w2', 'b', 'c', 0.3)];
    const extensions = wallExtensions(walls[0]!, walls, nodes);

    expect(extensions.start).toBe(0);
    expect(extensions.end).toBeCloseTo(0.15, 10);
  });

  it('uses the thickest neighbour at a junction', () => {
    const walls = [wall('w1', 'a', 'b', 0.1), wall('w2', 'b', 'c', 0.3), wall('w3', 'b', 'a', 0.5)];
    expect(wallExtensions(walls[0]!, walls, nodes).end).toBeCloseTo(0.25, 10);
  });
});

describe('toWallLocal', () => {
  const nodes = buildNodeMap([node('a', 0, 0), node('b', 4, 0)]);

  it('measures distance along the wall from node a', () => {
    const local = toWallLocal({ x: 1, y: 0.5 }, wall('w1', 'a', 'b'), nodes)!;
    expect(local.along).toBeCloseTo(1, 10);
    expect(local.t).toBeCloseTo(0.25, 10);
  });

  it('reports a signed perpendicular offset', () => {
    const w = wall('w1', 'a', 'b');
    expect(toWallLocal({ x: 1, y: 0.5 }, w, nodes)!.offset).toBeCloseTo(0.5, 10);
    expect(toWallLocal({ x: 1, y: -0.5 }, w, nodes)!.offset).toBeCloseTo(-0.5, 10);
  });

  it('clamps the parameter outside the segment', () => {
    expect(toWallLocal({ x: -3, y: 0 }, wall('w1', 'a', 'b'), nodes)!.t).toBe(0);
    expect(toWallLocal({ x: 9, y: 0 }, wall('w1', 'a', 'b'), nodes)!.t).toBe(1);
  });
});

describe('openingPlacement', () => {
  const nodes = buildNodeMap([node('a', 0, 0), node('b', 4, 0)]);

  it('spans width/2 on each side of the offset', () => {
    const placement = openingPlacement(
      opening({ offset: 2, width: 1 }),
      wall('w1', 'a', 'b'),
      nodes,
    )!;

    expect(placement.center.x).toBeCloseTo(2, 10);
    expect(placement.from.x).toBeCloseTo(1.5, 10);
    expect(placement.to.x).toBeCloseTo(2.5, 10);
  });
});

describe('wallSolidSegments', () => {
  it('returns one full-height box for a blank wall', () => {
    const segments = wallSolidSegments(4, 2.7, []);

    expect(segments).toEqual([{ start: 0, end: 4, bottom: 0, top: 2.7 }]);
  });

  it('splits around a window into four pieces', () => {
    const segments = wallSolidSegments(4, 2.7, [opening({ offset: 2, width: 1 })]);

    expect(segments).toHaveLength(4);
    expect(segments).toContainEqual({ start: 0, end: 1.5, bottom: 0, top: 2.7 });
    expect(segments).toContainEqual({ start: 1.5, end: 2.5, bottom: 0, top: 0.9 });
    expect(segments).toContainEqual({ start: 1.5, end: 2.5, bottom: 2.1, top: 2.7 });
    expect(segments).toContainEqual({ start: 2.5, end: 4, bottom: 0, top: 2.7 });
  });

  it('omits the under-sill piece for a door', () => {
    const segments = wallSolidSegments(4, 2.7, [
      opening({ kind: 'door', offset: 2, width: 0.9, height: 2.1, sillHeight: 0 }),
    ]);

    expect(segments).toHaveLength(3);
    expect(segments.some((segment) => segment.bottom === 0 && segment.top === 0)).toBe(false);
    expect(segments).toContainEqual({ start: 1.55, end: 2.45, bottom: 2.1, top: 2.7 });
  });

  it('omits the lintel for a full-height opening', () => {
    const segments = wallSolidSegments(4, 2.7, [
      opening({ kind: 'door', offset: 2, width: 1, height: 2.7, sillHeight: 0 }),
    ]);

    expect(segments).toHaveLength(2);
    expect(segments).toEqual([
      { start: 0, end: 1.5, bottom: 0, top: 2.7 },
      { start: 2.5, end: 4, bottom: 0, top: 2.7 },
    ]);
  });

  it('keeps the solid area consistent with the cut-out area', () => {
    const wallArea = 4 * 2.7;
    const segments = wallSolidSegments(4, 2.7, [
      opening({ id: 'o1', offset: 1, width: 0.8 }),
      opening({ id: 'o2', offset: 3, width: 1, sillHeight: 0, height: 2.1 }),
    ]);

    const solid = segments.reduce(
      (sum, segment) => sum + (segment.end - segment.start) * (segment.top - segment.bottom),
      0,
    );

    expect(solid).toBeCloseTo(wallArea - 0.8 * 1.2 - 1 * 2.1, 10);
  });

  it('shifts openings by the junction extension', () => {
    const segments = wallSolidSegments(4.2, 2.7, [opening({ offset: 2, width: 1 })], 0.1);

    expect(segments[0]).toEqual({ start: 0, end: 1.6, bottom: 0, top: 2.7 });
    expect(segments[segments.length - 1]).toEqual({
      start: 2.6,
      end: 4.2,
      bottom: 0,
      top: 2.7,
    });
  });

  it('handles several openings in order regardless of input order', () => {
    const segments = wallSolidSegments(6, 2.7, [
      opening({ id: 'o2', offset: 4, width: 1 }),
      opening({ id: 'o1', offset: 1.5, width: 1 }),
    ]);

    const fullHeight = segments.filter((segment) => segment.bottom === 0 && segment.top === 2.7);
    expect(fullHeight).toEqual([
      { start: 0, end: 1, bottom: 0, top: 2.7 },
      { start: 2, end: 3.5, bottom: 0, top: 2.7 },
      { start: 4.5, end: 6, bottom: 0, top: 2.7 },
    ]);
  });
});

describe('checkOpeningFit', () => {
  const nodes = buildNodeMap([node('a', 0, 0), node('b', 4, 0)]);
  const host = wall('w1', 'a', 'b');

  it('accepts an opening that fits', () => {
    expect(checkOpeningFit(opening(), host, nodes, []).valid).toBe(true);
  });

  it('rejects an opening wider than the wall', () => {
    const result = checkOpeningFit(opening({ width: 5 }), host, nodes, []);
    expect(result.valid).toBe(false);
  });

  it('rejects an opening that overflows the end and suggests a clamp', () => {
    const result = checkOpeningFit(opening({ offset: 3.9, width: 1 }), host, nodes, []);

    expect(result.valid).toBe(false);
    expect(result.clampedOffset).toBeCloseTo(3.45, 10);
  });

  it('rejects an opening taller than the wall', () => {
    const result = checkOpeningFit(opening({ sillHeight: 2, height: 1.2 }), host, nodes, []);
    expect(result.valid).toBe(false);
  });

  it('rejects overlapping openings', () => {
    const siblings = [opening({ id: 'other', offset: 2.4, width: 1 })];
    expect(checkOpeningFit(opening({ offset: 2 }), host, nodes, siblings).valid).toBe(false);
  });

  it('allows two openings that clear each other', () => {
    const siblings = [opening({ id: 'other', offset: 3.2, width: 1 })];
    expect(checkOpeningFit(opening({ offset: 1.5 }), host, nodes, siblings).valid).toBe(true);
  });

  it('ignores the opening being moved when checking siblings', () => {
    const siblings = [opening({ id: 'o1', offset: 2, width: 1 })];
    expect(checkOpeningFit(opening({ id: 'o1', offset: 2 }), host, nodes, siblings).valid).toBe(
      true,
    );
  });
});

describe('findHostWall', () => {
  const nodes = buildNodeMap([node('a', 0, 0), node('b', 4, 0), node('c', 4, 3)]);
  const level = {
    walls: [wall('w1', 'a', 'b'), wall('w2', 'b', 'c')],
    openings: [] as Opening[],
  };

  it('picks the nearest wall within tolerance', () => {
    const hit = findHostWall({ x: 1.5, y: 0.1 }, level, nodes, 0.4, 0.9)!;
    expect(hit.wall.id).toBe('w1');
    expect(hit.offset).toBeCloseTo(1.5, 10);
  });

  it('clamps the offset so the opening stays inside the wall', () => {
    const hit = findHostWall({ x: 3.95, y: 0 }, level, nodes, 0.4, 0.9)!;
    expect(hit.offset).toBeCloseTo(3.5, 10);
  });

  it('returns null when nothing is close enough', () => {
    expect(findHostWall({ x: 2, y: 2 }, level, nodes, 0.4, 0.9)).toBeNull();
  });
});
