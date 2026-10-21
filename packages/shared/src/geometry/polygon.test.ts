import { describe, expect, it } from 'vitest';
import {
  offsetPolygon,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  polygonPerimeter,
  removeCollinear,
  signedArea,
} from './polygon';

const square = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];

describe('polygonArea', () => {
  it('computes the area of a rectangle', () => {
    expect(polygonArea(square)).toBeCloseTo(12, 10);
  });

  it('is independent of winding direction', () => {
    expect(polygonArea([...square].reverse())).toBeCloseTo(12, 10);
  });

  it('returns zero for degenerate polygons', () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe(0);
    expect(polygonArea([])).toBe(0);
  });

  it('handles an L-shaped polygon', () => {
    const shape = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 5 },
      { x: 0, y: 5 },
    ];
    // 4×2 arm plus 2×3 arm.
    expect(polygonArea(shape)).toBeCloseTo(8 + 6, 10);
  });
});

describe('signedArea', () => {
  it('flips sign with the winding order', () => {
    expect(signedArea(square)).toBeGreaterThan(0);
    expect(signedArea([...square].reverse())).toBeLessThan(0);
  });
});

describe('polygonPerimeter', () => {
  it('sums the edge lengths', () => {
    expect(polygonPerimeter(square)).toBeCloseTo(14, 10);
  });
});

describe('polygonCentroid', () => {
  it('finds the center of a rectangle', () => {
    const centroid = polygonCentroid(square);
    expect(centroid.x).toBeCloseTo(2, 10);
    expect(centroid.y).toBeCloseTo(1.5, 10);
  });

  it('falls back to the vertex average for a segment', () => {
    const centroid = polygonCentroid([
      { x: 0, y: 0 },
      { x: 2, y: 4 },
    ]);
    expect(centroid).toEqual({ x: 1, y: 2 });
  });
});

describe('pointInPolygon', () => {
  it('detects interior points', () => {
    expect(pointInPolygon({ x: 2, y: 1.5 }, square)).toBe(true);
  });

  it('rejects exterior points', () => {
    expect(pointInPolygon({ x: 5, y: 1.5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -0.1, y: 1.5 }, square)).toBe(false);
  });

  it('counts points on an edge as inside', () => {
    expect(pointInPolygon({ x: 4, y: 1.5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 0 }, square)).toBe(true);
  });

  it('handles concave shapes', () => {
    const uShape = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 5 },
      { x: 0, y: 5 },
    ];
    expect(pointInPolygon({ x: 3, y: 4 }, uShape)).toBe(false);
    expect(pointInPolygon({ x: 3, y: 1 }, uShape)).toBe(true);
  });
});

describe('polygonBounds', () => {
  it('wraps every vertex', () => {
    expect(polygonBounds(square)).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 3 });
  });
});

describe('removeCollinear', () => {
  it('drops a vertex sitting on a straight edge', () => {
    const withExtra = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    expect(removeCollinear(withExtra)).toHaveLength(4);
  });
});

describe('offsetPolygon', () => {
  it('shrinks a rectangle inward by the given distance', () => {
    const inner = offsetPolygon(square, 0.5);
    expect(polygonBounds(inner)).toEqual({ minX: 0.5, minY: 0.5, maxX: 3.5, maxY: 2.5 });
  });

  it('shrinks the same way regardless of winding', () => {
    const inner = offsetPolygon([...square].reverse(), 0.5);
    const bounds = polygonBounds(inner);
    expect(bounds.minX).toBeCloseTo(0.5, 10);
    expect(bounds.maxX).toBeCloseTo(3.5, 10);
  });
});
