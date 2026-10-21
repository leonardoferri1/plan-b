import * as THREE from 'three';
import { signedArea, type Vec2 } from '@spacecraft/shared';
import type { Prism3D } from './scene3d';

/**
 * Vertical prisms built from a plan footprint.
 *
 * Wall bodies cannot be unit boxes any more: their ends are mitered against their neighbours,
 * so each piece is a quad — and junction fillers are polygons with as many sides as walls that
 * meet there. The geometry is generated flat-shaded and non-indexed, which is what a wall
 * wants anyway: crisp edges rather than a rounded-looking average at the corners.
 */

/** Cache from footprint signature to geometry, so an untouched wall is never rebuilt. */
let cache = new Map<string, THREE.BufferGeometry>();

function signatureOf(prism: Prism3D): string {
  const points = prism.footprint.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';');
  return `${points}|${prism.bottom.toFixed(4)}|${prism.top.toFixed(4)}`;
}

/** Plan `(x, y)` becomes world `(x, elevation, y)`. */
const vertex = (point: Vec2, y: number): [number, number, number] => [point.x, y, point.y];

function centroid(ring: readonly Vec2[]): Vec2 {
  const sum = ring.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / ring.length, y: sum.y / ring.length };
}

export function createPrismGeometry(prism: Prism3D): THREE.BufferGeometry {
  // Normalise the winding so the face orientations below are predictable.
  const ring = signedArea(prism.footprint) >= 0 ? prism.footprint : [...prism.footprint].reverse();

  const middle = centroid(ring);
  const { bottom, top } = prism;
  const positions: number[] = [];

  const push = (...points: [number, number, number][]): void => {
    for (const point of points) positions.push(point[0], point[1], point[2]);
  };

  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i]!;
    const next = ring[(i + 1) % ring.length]!;

    // Side face, wound so the normal points away from the body.
    push(vertex(current, bottom), vertex(current, top), vertex(next, top));
    push(vertex(current, bottom), vertex(next, top), vertex(next, bottom));

    // Top and bottom caps, fanned from the centre so a star-shaped filler triangulates too.
    push(vertex(middle, top), vertex(next, top), vertex(current, top));
    push(vertex(middle, bottom), vertex(current, bottom), vertex(next, bottom));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Geometry for every prism in the scene, reusing whatever survived the last edit.
 *
 * Dragging a corner changes two or three walls; without this, every wall in the plan would be
 * re-uploaded to the GPU on every frame of the drag.
 */
export function resolvePrismGeometries(
  prisms: readonly Prism3D[],
): Map<string, THREE.BufferGeometry> {
  const next = new Map<string, THREE.BufferGeometry>();
  const byKey = new Map<string, THREE.BufferGeometry>();

  for (const prism of prisms) {
    const signature = signatureOf(prism);
    const geometry = cache.get(signature) ?? next.get(signature) ?? createPrismGeometry(prism);

    next.set(signature, geometry);
    byKey.set(prism.key, geometry);
  }

  for (const [signature, geometry] of cache) {
    if (!next.has(signature)) geometry.dispose();
  }

  cache = next;
  return byKey;
}

export function disposePrismCache(): void {
  for (const geometry of cache.values()) geometry.dispose();
  cache = new Map();
}
