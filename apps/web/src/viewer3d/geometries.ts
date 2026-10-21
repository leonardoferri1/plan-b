import * as THREE from 'three';
import type { PartShape } from '@spacecraft/shared';

/**
 * Unit primitives shared by every mesh in the scene.
 *
 * Each procedural part is a unit shape scaled by its mesh transform, so a furnished apartment
 * uploads four buffer geometries to the GPU instead of one per part. They are created lazily
 * and recreated after {@link disposeUnitGeometries}, so unmounting the viewport can release
 * everything without leaving dangling references behind.
 */

const cache = new Map<PartShape, THREE.BufferGeometry>();

const FACTORIES: Record<PartShape, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  sphere: () => new THREE.SphereGeometry(0.5, 20, 14),
  /** A lamp shade: narrower at the top than at the base, open so the bulb shows through. */
  cone: () => new THREE.CylinderGeometry(0.3, 0.5, 1, 24, 1, true),
};

export function getUnitGeometry(shape: PartShape): THREE.BufferGeometry {
  const cached = cache.get(shape);
  if (cached) return cached;

  const created = FACTORIES[shape]();
  cache.set(shape, created);
  return created;
}

export const getUnitBox = (): THREE.BufferGeometry => getUnitGeometry('box');

export function disposeUnitGeometries(): void {
  for (const geometry of cache.values()) geometry.dispose();
  cache.clear();
}
