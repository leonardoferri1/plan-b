import { useMemo } from 'react';
import {
  getCatalogItem,
  getMaterial,
  resolveMaterialSlots,
  resolveParts,
  type Size3,
} from '@spacecraft/shared';
import { shade } from '@/canvas2d/colors';
import { cn } from '@/lib/utils';

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

interface Face {
  points: string;
  fill: string;
  depth: number;
}

interface Point3 {
  x: number;
  y: number;
  z: number;
}

const project = (point: Point3): { x: number; y: number } => ({
  x: (point.x - point.z) * COS30,
  y: (point.x + point.z) * SIN30 - point.y,
});

/**
 * Isometric preview built from the very same procedural part list the 3D scene uses, so the
 * catalog thumbnail and the placed object can never drift apart — and no bitmap assets or
 * WebGL context are needed to draw a hundred of them in a scrolling list.
 *
 * Each box contributes its top, front and right faces; painter ordering by depth is exact for
 * axis-aligned boxes that do not interpenetrate.
 */
export function FurniturePreview({
  catalogId,
  materialId,
  size,
  className,
}: {
  catalogId: string;
  materialId?: string;
  size?: Size3;
  className?: string;
}): JSX.Element | null {
  const faces = useMemo(() => {
    const catalog = getCatalogItem(catalogId);
    if (!catalog) return null;

    const dimensions = size ?? catalog.defaultSize;
    const slots = resolveMaterialSlots(catalogId, materialId ?? catalog.defaultMaterials.primary);
    const parts = resolveParts(catalogId, dimensions);

    const colorFor = (slot: string): string => {
      if (slot === 'light') return '#ffe4a8';
      const id =
        slot === 'secondary' ? slots.secondary : slot === 'accent' ? slots.accent : slots.primary;
      return getMaterial(id).color;
    };

    const result: Face[] = [];

    for (const part of parts) {
      const base = colorFor(part.slot);
      const hx = part.size.x / 2;
      const hy = part.size.y / 2;
      const hz = part.size.z / 2;
      const { x, y, z } = part.center;

      const corner = (dx: number, dy: number, dz: number): Point3 => ({
        x: x + dx * hx,
        y: y + dy * hy,
        z: z + dz * hz,
      });

      const polygon = (corners: Point3[]): string =>
        corners
          .map(project)
          .map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)
          .join(' ');

      const depth = x + z + y * 0.4;

      result.push({
        depth,
        fill: shade(base, 0.16),
        points: polygon([corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)]),
      });

      result.push({
        depth,
        fill: shade(base, -0.08),
        points: polygon([corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)]),
      });

      result.push({
        depth,
        fill: shade(base, -0.26),
        points: polygon([corner(1, -1, -1), corner(1, -1, 1), corner(1, 1, 1), corner(1, 1, -1)]),
      });
    }

    return result.sort((a, b) => a.depth - b.depth);
  }, [catalogId, materialId, size]);

  const viewBox = useMemo(() => {
    const catalog = getCatalogItem(catalogId);
    if (!catalog) return '0 0 1 1';

    const dimensions = size ?? catalog.defaultSize;
    const span = Math.max(dimensions.width, dimensions.depth);
    const halfWidth = (span * COS30 * 1.15) / 1;
    const top = -dimensions.height * 1.08;
    const bottom = span * SIN30 * 1.15;

    return `${-halfWidth} ${top} ${halfWidth * 2} ${bottom - top}`;
  }, [catalogId, size]);

  if (!faces) return null;

  return (
    <svg
      viewBox={viewBox}
      className={cn('size-full', className)}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <g strokeLinejoin="round" strokeWidth={0.004} stroke="rgba(10,16,32,0.35)">
        {faces.map((face, index) => (
          <polygon key={index} points={face.points} fill={face.fill} />
        ))}
      </g>
    </svg>
  );
}
