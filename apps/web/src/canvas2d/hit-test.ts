import {
  distance,
  distanceToSegment,
  pointInPolygon,
  type EntityRef,
  type Vec2,
} from '@plan-b/shared';
import type { PlanScene, SceneFurniture } from './scene';

export interface HitResult {
  ref: EntityRef;
  /** Distance from the probe to the entity, in meters; used to break ties. */
  distance: number;
}

export interface HitOptions {
  /** Pick radius in meters, derived from a fixed pixel radius and the current zoom. */
  tolerance: number;
  /** Node handles are only grabbable while they are drawn. */
  visibleNodeIds?: ReadonlySet<string>;
  /** Kinds to ignore, e.g. furniture while the furniture layer is hidden. */
  ignore?: ReadonlySet<EntityRef['kind']>;
}

/** True when `point` is inside the furniture item's oriented bounding rectangle. */
export function hitsFurniture(point: Vec2, item: SceneFurniture, tolerance = 0): boolean {
  const cos = Math.cos(-item.rotation);
  const sin = Math.sin(-item.rotation);
  const dx = point.x - item.position.x;
  const dy = point.y - item.position.y;

  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  return (
    Math.abs(localX) <= item.width / 2 + tolerance && Math.abs(localY) <= item.depth / 2 + tolerance
  );
}

/**
 * Picks the entity under the pointer.
 *
 * The order is the order of the drawing stack read from the top: handles first, then furniture,
 * then openings, then walls, then rooms. Anything else feels wrong — clicking a sofa that sits
 * on a wall must select the sofa.
 */
export function hitTest(scene: PlanScene, point: Vec2, options: HitOptions): HitResult | null {
  const { tolerance, visibleNodeIds, ignore } = options;
  const skip = (kind: EntityRef['kind']): boolean => ignore?.has(kind) ?? false;

  if (!skip('node') && visibleNodeIds && visibleNodeIds.size > 0) {
    let best: HitResult | null = null;
    for (const node of scene.nodes) {
      if (!visibleNodeIds.has(node.id)) continue;
      const d = distance(point, node.point);
      if (d <= tolerance * 1.4 && (best === null || d < best.distance)) {
        best = { ref: { kind: 'node', id: node.id }, distance: d };
      }
    }
    if (best) return best;
  }

  if (!skip('furniture')) {
    // Later items are drawn on top, so scan backwards.
    for (let i = scene.furniture.length - 1; i >= 0; i -= 1) {
      const item = scene.furniture[i]!;
      if (hitsFurniture(point, item)) {
        return {
          ref: { kind: 'furniture', id: item.id },
          distance: distance(point, item.position),
        };
      }
    }
  }

  if (!skip('opening')) {
    let best: HitResult | null = null;
    for (const opening of scene.openings) {
      const d = distanceToSegment(point, opening.from, opening.to);
      if (d <= opening.thickness / 2 + tolerance && (best === null || d < best.distance)) {
        best = { ref: { kind: 'opening', id: opening.id }, distance: d };
      }
    }
    if (best) return best;
  }

  if (!skip('wall')) {
    let best: HitResult | null = null;
    for (const wall of scene.walls) {
      const d = distanceToSegment(point, wall.a, wall.b);
      const inside = d <= wall.thickness / 2 + tolerance * 0.6;
      if (inside && (best === null || d < best.distance)) {
        best = { ref: { kind: 'wall', id: wall.id }, distance: d };
      }
    }
    if (best) return best;
  }

  if (!skip('room')) {
    // Smaller rooms win so a room nested inside another stays reachable.
    const candidates = scene.rooms
      .filter((room) => pointInPolygon(point, room.polygon))
      .sort((a, b) => a.area - b.area);

    const room = candidates[0];
    if (room) return { ref: { kind: 'room', id: room.id }, distance: 0 };
  }

  return null;
}

/** Every entity whose footprint intersects a rubber-band rectangle. */
export function hitTestRect(scene: PlanScene, from: Vec2, to: Vec2): EntityRef[] {
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);

  const contains = (point: Vec2): boolean =>
    point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;

  const refs: EntityRef[] = [];

  for (const item of scene.furniture) {
    if (contains(item.position)) refs.push({ kind: 'furniture', id: item.id });
  }

  for (const wall of scene.walls) {
    if (contains(wall.a) && contains(wall.b)) refs.push({ kind: 'wall', id: wall.id });
  }

  return refs;
}
