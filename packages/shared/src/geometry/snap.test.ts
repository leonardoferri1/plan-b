import { describe, expect, it } from 'vitest';
import type { WallNode } from '../domain/types';
import { findNearestNode, resolveSnap, snapToAngle, snapToGrid } from './snap';

const nodes: WallNode[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 4, y: 0 },
];

describe('snapToGrid', () => {
  it('rounds to the nearest multiple', () => {
    expect(snapToGrid({ x: 1.23, y: 2.78 }, 0.5)).toEqual({ x: 1, y: 3 });
  });

  it('is a no-op for a non-positive grid', () => {
    const point = { x: 1.23, y: 2.78 };
    expect(snapToGrid(point, 0)).toBe(point);
  });

  it('handles negative coordinates', () => {
    expect(snapToGrid({ x: -1.2, y: -0.9 }, 0.5)).toEqual({ x: -1, y: -1 });
  });
});

describe('snapToAngle', () => {
  const origin = { x: 0, y: 0 };

  it('locks a nearly horizontal direction onto the axis', () => {
    const snapped = snapToAngle(origin, { x: 3, y: 0.12 }, 15);
    expect(snapped.y).toBeCloseTo(0, 10);
    expect(snapped.x).toBeCloseTo(Math.hypot(3, 0.12), 10);
  });

  it('preserves the distance from the anchor', () => {
    const snapped = snapToAngle(origin, { x: 2, y: 2.3 }, 15);
    expect(Math.hypot(snapped.x, snapped.y)).toBeCloseTo(Math.hypot(2, 2.3), 10);
  });

  it('snaps to 45° steps when asked', () => {
    const snapped = snapToAngle(origin, { x: 3, y: 2.6 }, 45);
    expect(snapped.x).toBeCloseTo(snapped.y, 8);
  });

  it('returns the input for a zero-length delta', () => {
    expect(snapToAngle(origin, origin, 15)).toEqual(origin);
  });
});

describe('findNearestNode', () => {
  it('returns the closest node inside the tolerance', () => {
    expect(findNearestNode({ x: 0.2, y: 0.1 }, nodes, 0.4)?.id).toBe('a');
  });

  it('returns null when nothing is close enough', () => {
    expect(findNearestNode({ x: 2, y: 2 }, nodes, 0.4)).toBeNull();
  });

  it('honours the exclusion set', () => {
    expect(findNearestNode({ x: 0.1, y: 0 }, nodes, 0.4, new Set(['a']))).toBeNull();
  });
});

describe('resolveSnap', () => {
  const base = { gridSize: 0.5, snapEnabled: true, tolerance: 0.3, nodes };

  it('prefers an existing node over the grid', () => {
    const result = resolveSnap({ x: 0.12, y: 0.08 }, base);

    expect(result.kind).toBe('node');
    expect(result.nodeId).toBe('a');
    expect(result.point).toEqual({ x: 0, y: 0 });
  });

  it('snaps onto a wall centerline when no node is near', () => {
    const result = resolveSnap(
      { x: 2, y: 0.1 },
      {
        ...base,
        walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }],
      },
    );

    expect(result.kind).toBe('wall');
    expect(result.wallId).toBe('w1');
    expect(result.point.y).toBeCloseTo(0, 10);
  });

  it('falls back to the grid', () => {
    const result = resolveSnap({ x: 2.2, y: 3.1 }, base);

    expect(result.kind).toBe('grid');
    expect(result.point).toEqual({ x: 2, y: 3 });
  });

  it('keeps the angle constraint after grid rounding', () => {
    const result = resolveSnap({ x: 3.1, y: 0.2 }, { ...base, angleAnchor: { x: 0, y: 0 } });

    expect(result.point.y).toBeCloseTo(0, 10);
  });

  it('reports free movement when snapping is disabled', () => {
    const result = resolveSnap({ x: 2.2, y: 3.1 }, { ...base, snapEnabled: false });

    expect(result.kind).toBe('free');
    expect(result.point).toEqual({ x: 2.2, y: 3.1 });
  });
});
