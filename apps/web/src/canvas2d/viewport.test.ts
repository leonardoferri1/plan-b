import { describe, expect, it } from 'vitest';
import {
  adaptiveGridStep,
  fitBounds,
  metersToPixels,
  pixelsToMeters,
  screenToWorld,
  visibleBounds,
  worldToScreen,
  zoomAtPoint,
  type ViewportTransform,
} from './viewport';

const view: ViewportTransform = {
  center: { x: 4, y: 3 },
  zoom: 50,
  width: 800,
  height: 600,
};

describe('worldToScreen and screenToWorld', () => {
  it('maps the viewport center to the canvas center', () => {
    expect(worldToScreen(view.center, view)).toEqual({ x: 400, y: 300 });
  });

  it('scales by the zoom with no axis flip', () => {
    expect(worldToScreen({ x: 6, y: 5 }, view)).toEqual({ x: 500, y: 400 });
  });

  it('round-trips any point', () => {
    const point = { x: -2.37, y: 9.11 };
    const back = screenToWorld(worldToScreen(point, view), view);

    expect(back.x).toBeCloseTo(point.x, 10);
    expect(back.y).toBeCloseTo(point.y, 10);
  });
});

describe('unit conversions', () => {
  it('converts pixels to meters at the current zoom', () => {
    expect(pixelsToMeters(100, view)).toBeCloseTo(2);
    expect(metersToPixels(2, view)).toBeCloseTo(100);
  });
});

describe('visibleBounds', () => {
  it('spans the canvas in world units', () => {
    const bounds = visibleBounds(view);

    expect(bounds.minX).toBeCloseTo(4 - 8);
    expect(bounds.maxX).toBeCloseTo(4 + 8);
    expect(bounds.minY).toBeCloseTo(3 - 6);
    expect(bounds.maxY).toBeCloseTo(3 + 6);
  });
});

describe('fitBounds', () => {
  it('centers on the bounding box', () => {
    const result = fitBounds({ minX: 0, minY: 0, maxX: 10, maxY: 6 }, 800, 600, 0);

    expect(result.center).toEqual({ x: 5, y: 3 });
  });

  it('picks the zoom of the constraining axis', () => {
    const result = fitBounds({ minX: 0, minY: 0, maxX: 10, maxY: 6 }, 800, 600, 0);

    // 800/10 = 80 against 600/6 = 100: the width constrains.
    expect(result.zoom).toBeCloseTo(80);
  });

  it('honours the padding', () => {
    const result = fitBounds({ minX: 0, minY: 0, maxX: 10, maxY: 6 }, 800, 600, 50);

    expect(result.zoom).toBeCloseTo(70);
  });

  it('stays inside the zoom limits for a tiny plan', () => {
    const result = fitBounds({ minX: 0, minY: 0, maxX: 0.01, maxY: 0.01 }, 800, 600, 0);

    expect(result.zoom).toBeLessThanOrEqual(400);
  });

  it('stays inside the zoom limits for an enormous plan', () => {
    const result = fitBounds({ minX: 0, minY: 0, maxX: 5000, maxY: 5000 }, 800, 600, 0);

    expect(result.zoom).toBeGreaterThanOrEqual(8);
  });
});

describe('zoomAtPoint', () => {
  it('keeps the world point under the cursor fixed', () => {
    const anchor = { x: 650, y: 120 };
    const before = screenToWorld(anchor, view);

    const next = zoomAtPoint(view, anchor, 1.6);
    const after = screenToWorld(anchor, { ...view, ...next });

    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
  });

  it('does not move the view when the zoom is already clamped', () => {
    const clamped: ViewportTransform = { ...view, zoom: 400 };
    const next = zoomAtPoint(clamped, { x: 10, y: 10 }, 2);

    expect(next.zoom).toBe(400);
    expect(next.center).toEqual(clamped.center);
  });
});

describe('adaptiveGridStep', () => {
  it('keeps the base step when cells are big enough', () => {
    expect(adaptiveGridStep(0.5, 50)).toBe(0.5);
  });

  it('doubles the step until cells are readable', () => {
    expect(adaptiveGridStep(0.5, 10)).toBe(2);
    expect(adaptiveGridStep(0.5, 5)).toBe(4);
  });

  it('terminates even at an absurd zoom', () => {
    expect(adaptiveGridStep(0.5, 0.0001)).toBeGreaterThan(0);
  });
});
