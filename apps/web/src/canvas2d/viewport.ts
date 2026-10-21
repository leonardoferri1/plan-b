import type { Bounds, Vec2 } from '@spacecraft/shared';
import { clamp } from '@/lib/utils';
import { ZOOM_LIMITS } from '@/store/editor-store';

/**
 * Plan space is measured in meters with `y` growing downwards, which matches canvas space —
 * so the transform is a pure uniform scale plus a translation, with no axis flip to reason
 * about when hit-testing or exporting.
 */
export interface ViewportTransform {
  /** World point displayed at the canvas center. */
  center: Vec2;
  /** Pixels per meter. */
  zoom: number;
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
}

export function worldToScreen(point: Vec2, view: ViewportTransform): Vec2 {
  return {
    x: (point.x - view.center.x) * view.zoom + view.width / 2,
    y: (point.y - view.center.y) * view.zoom + view.height / 2,
  };
}

export function screenToWorld(point: Vec2, view: ViewportTransform): Vec2 {
  return {
    x: (point.x - view.width / 2) / view.zoom + view.center.x,
    y: (point.y - view.height / 2) / view.zoom + view.center.y,
  };
}

/** Converts a pixel distance to meters at the current zoom — used for hit tolerances. */
export const pixelsToMeters = (pixels: number, view: ViewportTransform): number =>
  pixels / view.zoom;

export const metersToPixels = (meters: number, view: ViewportTransform): number =>
  meters * view.zoom;

/** World-space rectangle currently visible, useful for culling. */
export function visibleBounds(view: ViewportTransform): Bounds {
  const halfWidth = view.width / 2 / view.zoom;
  const halfHeight = view.height / 2 / view.zoom;

  return {
    minX: view.center.x - halfWidth,
    minY: view.center.y - halfHeight,
    maxX: view.center.x + halfWidth,
    maxY: view.center.y + halfHeight,
  };
}

export interface FitResult {
  center: Vec2;
  zoom: number;
}

/** Centers and scales the view so that `bounds` fits with a pixel padding on every side. */
export function fitBounds(bounds: Bounds, width: number, height: number, padding = 64): FitResult {
  const spanX = Math.max(0.5, bounds.maxX - bounds.minX);
  const spanY = Math.max(0.5, bounds.maxY - bounds.minY);

  const usableWidth = Math.max(80, width - padding * 2);
  const usableHeight = Math.max(80, height - padding * 2);

  const zoom = clamp(
    Math.min(usableWidth / spanX, usableHeight / spanY),
    ZOOM_LIMITS.min,
    ZOOM_LIMITS.max,
  );

  return {
    center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    zoom,
  };
}

/**
 * Zooms around a fixed screen anchor (the pointer), keeping the world point under the cursor
 * exactly where it was — the behaviour every map and CAD tool has.
 */
export function zoomAtPoint(
  view: ViewportTransform,
  anchorScreen: Vec2,
  factor: number,
): FitResult {
  const nextZoom = clamp(view.zoom * factor, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
  if (nextZoom === view.zoom) return { center: view.center, zoom: view.zoom };

  const anchorWorld = screenToWorld(anchorScreen, view);
  const offsetX = (anchorScreen.x - view.width / 2) / nextZoom;
  const offsetY = (anchorScreen.y - view.height / 2) / nextZoom;

  return {
    center: { x: anchorWorld.x - offsetX, y: anchorWorld.y - offsetY },
    zoom: nextZoom,
  };
}

/**
 * Grid spacing that keeps lines readable at any zoom: the base spacing is multiplied by
 * powers of two until a cell is at least `minPixels` wide.
 */
export function adaptiveGridStep(baseStep: number, zoom: number, minPixels = 14): number {
  let step = baseStep;
  let guard = 0;
  while (step * zoom < minPixels && guard < 12) {
    step *= 2;
    guard += 1;
  }
  return step;
}
