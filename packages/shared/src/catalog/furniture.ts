import type { Size3 } from '../domain/types';

export type FurnitureCategory =
  | 'estar'
  | 'quarto'
  | 'jantar'
  | 'escritorio'
  | 'armazenamento'
  | 'iluminacao'
  | 'decoracao';

export const FURNITURE_CATEGORIES: { id: FurnitureCategory | 'todos'; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'estar', label: 'Estar' },
  { id: 'quarto', label: 'Quarto' },
  { id: 'jantar', label: 'Jantar' },
  { id: 'escritorio', label: 'Escritório' },
  { id: 'armazenamento', label: 'Armazenamento' },
  { id: 'iluminacao', label: 'Iluminação' },
  { id: 'decoracao', label: 'Decoração' },
];

export type PartShape = 'box' | 'cylinder' | 'cone' | 'sphere';

/** Which of the item's resolved materials a part is painted with. */
export type PartSlot = 'primary' | 'secondary' | 'accent' | 'light';

/**
 * One primitive of a procedural model, expressed in **normalized** item space so that the same
 * definition scales to any instance size:
 *
 * - `center.x` / `center.z` are fractions of width / depth, measured from the footprint center
 *   and ranging over `[-0.5, 0.5]`;
 * - `center.y` is a fraction of the height measured from the floor, ranging over `[0, 1]`;
 * - `size` holds the extents as fractions of width / height / depth.
 *
 * `cylinder` and `sphere` take their radius from the bounding box (`min(size.x, size.z) / 2`).
 * `cone` is rendered as a truncated cone — a lamp shade — narrower at the top.
 */
export interface FurniturePart {
  shape: PartShape;
  center: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  slot: PartSlot;
  /** Rotation about the vertical axis, in radians. */
  rotationY?: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  /** lucide-react icon name used by the catalog panel. */
  icon: string;
  description: string;
  defaultSize: Size3;
  minSize: Size3;
  maxSize: Size3;
  /** Items such as rugs keep their proportions free; lamps are locked to their silhouette. */
  resizable: boolean;
  defaultMaterials: { primary: string; secondary: string; accent: string };
  /** Default height of the base above the floor. */
  elevation: number;
  parts: FurniturePart[];
}

const box = (
  center: [number, number, number],
  size: [number, number, number],
  slot: PartSlot = 'primary',
): FurniturePart => ({
  shape: 'box',
  center: { x: center[0], y: center[1], z: center[2] },
  size: { x: size[0], y: size[1], z: size[2] },
  slot,
});

const shape = (
  kind: PartShape,
  center: [number, number, number],
  size: [number, number, number],
  slot: PartSlot = 'primary',
): FurniturePart => ({
  shape: kind,
  center: { x: center[0], y: center[1], z: center[2] },
  size: { x: size[0], y: size[1], z: size[2] },
  slot,
});

/** Four legs placed symmetrically at `±x`, `±z`. */
const legs = (
  x: number,
  z: number,
  centerY: number,
  size: [number, number, number],
  slot: PartSlot = 'secondary',
): FurniturePart[] => [
  box([-x, centerY, -z], size, slot),
  box([x, centerY, -z], size, slot),
  box([-x, centerY, z], size, slot),
  box([x, centerY, z], size, slot),
];

export const FURNITURE_CATALOG: readonly CatalogItem[] = [
  {
    id: 'sofa',
    name: 'Sofá 3 lugares',
    category: 'estar',
    icon: 'Sofa',
    description: 'Sofá modular com braços baixos e pés metálicos.',
    defaultSize: { width: 2.2, depth: 0.92, height: 0.82 },
    minSize: { width: 1.2, depth: 0.7, height: 0.6 },
    maxSize: { width: 3.6, depth: 1.2, height: 1.1 },
    resizable: true,
    defaultMaterials: { primary: 'linen', secondary: 'matte-black', accent: 'linen' },
    elevation: 0,
    parts: [
      ...legs(0.45, 0.38, 0.05, [0.03, 0.1, 0.05]),
      box([0, 0.22, 0], [1, 0.26, 1]),
      box([0, 0.59, -0.4], [1, 0.62, 0.2]),
      box([-0.455, 0.5, 0.06], [0.09, 0.42, 0.8]),
      box([0.455, 0.5, 0.06], [0.09, 0.42, 0.8]),
      box([-0.22, 0.42, 0.07], [0.4, 0.14, 0.7], 'accent'),
      box([0.22, 0.42, 0.07], [0.4, 0.14, 0.7], 'accent'),
      box([-0.22, 0.62, -0.26], [0.4, 0.34, 0.12], 'accent'),
      box([0.22, 0.62, -0.26], [0.4, 0.34, 0.12], 'accent'),
    ],
  },
  {
    id: 'armchair',
    name: 'Poltrona',
    category: 'estar',
    icon: 'Armchair',
    description: 'Poltrona compacta para leitura.',
    defaultSize: { width: 0.86, depth: 0.84, height: 0.78 },
    minSize: { width: 0.6, depth: 0.6, height: 0.6 },
    maxSize: { width: 1.2, depth: 1.1, height: 1.05 },
    resizable: true,
    defaultMaterials: {
      primary: 'charcoal-fabric',
      secondary: 'matte-black',
      accent: 'charcoal-fabric',
    },
    elevation: 0,
    parts: [
      ...legs(0.4, 0.36, 0.06, [0.04, 0.12, 0.05]),
      box([0, 0.25, 0], [1, 0.26, 1]),
      box([0, 0.6, -0.41], [1, 0.56, 0.18]),
      box([-0.45, 0.5, 0.05], [0.1, 0.38, 0.82]),
      box([0.45, 0.5, 0.05], [0.1, 0.38, 0.82]),
      box([0, 0.45, 0.05], [0.78, 0.14, 0.72], 'accent'),
    ],
  },
  {
    id: 'coffee-table',
    name: 'Mesa de centro',
    category: 'estar',
    icon: 'Table',
    description: 'Mesa baixa com tampo em madeira.',
    defaultSize: { width: 1.1, depth: 0.6, height: 0.4 },
    minSize: { width: 0.5, depth: 0.4, height: 0.25 },
    maxSize: { width: 2, depth: 1.1, height: 0.6 },
    resizable: true,
    defaultMaterials: { primary: 'oak', secondary: 'matte-black', accent: 'oak' },
    elevation: 0,
    parts: [box([0, 0.94, 0], [1, 0.12, 1]), ...legs(0.42, 0.36, 0.44, [0.06, 0.88, 0.1])],
  },
  {
    id: 'tv-stand',
    name: 'Rack de TV',
    category: 'estar',
    icon: 'Tv',
    description: 'Rack baixo com portas de correr.',
    defaultSize: { width: 1.6, depth: 0.42, height: 0.48 },
    minSize: { width: 0.8, depth: 0.3, height: 0.3 },
    maxSize: { width: 3, depth: 0.7, height: 0.8 },
    resizable: true,
    defaultMaterials: { primary: 'walnut', secondary: 'matte-black', accent: 'walnut' },
    elevation: 0,
    parts: [
      box([0, 0.5, 0], [1, 0.72, 1]),
      box([0, 0.07, 0], [0.9, 0.14, 0.86], 'secondary'),
      box([0, 0.9, 0], [1.02, 0.08, 1.02]),
      box([-0.25, 0.5, 0.51], [0.46, 0.5, 0.04], 'accent'),
      box([0.25, 0.5, 0.51], [0.46, 0.5, 0.04], 'accent'),
    ],
  },
  {
    id: 'rug',
    name: 'Tapete',
    category: 'decoracao',
    icon: 'Squircle',
    description: 'Tapete de lã que delimita a área social.',
    defaultSize: { width: 2.4, depth: 1.7, height: 0.02 },
    minSize: { width: 0.6, depth: 0.4, height: 0.01 },
    maxSize: { width: 6, depth: 5, height: 0.06 },
    resizable: true,
    defaultMaterials: { primary: 'linen', secondary: 'linen', accent: 'linen' },
    elevation: 0,
    parts: [box([0, 0.5, 0], [1, 1, 1])],
  },
  {
    id: 'bed',
    name: 'Cama queen',
    category: 'quarto',
    icon: 'BedDouble',
    description: 'Cama com cabeceira estofada e roupa de cama.',
    defaultSize: { width: 1.6, depth: 2.05, height: 0.95 },
    minSize: { width: 0.9, depth: 1.8, height: 0.6 },
    maxSize: { width: 2.2, depth: 2.4, height: 1.3 },
    resizable: true,
    defaultMaterials: { primary: 'oak', secondary: 'matte-black', accent: 'white-plaster' },
    elevation: 0,
    parts: [
      box([0, 0.54, -0.465], [1, 0.92, 0.07]),
      box([0, 0.28, 0.03], [0.98, 0.26, 0.92]),
      ...legs(0.44, 0.42, 0.08, [0.05, 0.16, 0.04]),
      box([0, 0.51, 0.045], [0.94, 0.2, 0.86], 'accent'),
      box([0, 0.63, 0.17], [0.96, 0.06, 0.6], 'accent'),
      box([-0.2, 0.655, -0.32], [0.36, 0.09, 0.16], 'accent'),
      box([0.2, 0.655, -0.32], [0.36, 0.09, 0.16], 'accent'),
    ],
  },
  {
    id: 'nightstand',
    name: 'Criado-mudo',
    category: 'quarto',
    icon: 'Box',
    description: 'Mesa de cabeceira com gaveta.',
    defaultSize: { width: 0.45, depth: 0.4, height: 0.52 },
    minSize: { width: 0.3, depth: 0.3, height: 0.35 },
    maxSize: { width: 0.8, depth: 0.6, height: 0.8 },
    resizable: true,
    defaultMaterials: { primary: 'oak', secondary: 'matte-black', accent: 'oak' },
    elevation: 0,
    parts: [
      box([0, 0.55, 0], [1, 0.78, 1]),
      ...legs(0.4, 0.38, 0.08, [0.08, 0.16, 0.08]),
      box([0, 0.62, 0.51], [0.8, 0.3, 0.04], 'accent'),
    ],
  },
  {
    id: 'dining-table',
    name: 'Mesa de jantar',
    category: 'jantar',
    icon: 'Table2',
    description: 'Mesa retangular para seis lugares.',
    defaultSize: { width: 1.8, depth: 0.9, height: 0.75 },
    minSize: { width: 0.8, depth: 0.6, height: 0.6 },
    maxSize: { width: 3.2, depth: 1.4, height: 0.95 },
    resizable: true,
    defaultMaterials: { primary: 'walnut', secondary: 'matte-black', accent: 'walnut' },
    elevation: 0,
    parts: [
      box([0, 0.96, 0], [1, 0.08, 1]),
      box([0, 0.88, 0], [0.92, 0.08, 0.84], 'secondary'),
      ...legs(0.45, 0.42, 0.45, [0.05, 0.9, 0.09]),
    ],
  },
  {
    id: 'chair',
    name: 'Cadeira',
    category: 'jantar',
    icon: 'Armchair',
    description: 'Cadeira de madeira com encosto vazado.',
    defaultSize: { width: 0.46, depth: 0.5, height: 0.88 },
    minSize: { width: 0.35, depth: 0.35, height: 0.6 },
    maxSize: { width: 0.7, depth: 0.7, height: 1.2 },
    resizable: true,
    defaultMaterials: { primary: 'oak', secondary: 'matte-black', accent: 'oak' },
    elevation: 0,
    parts: [
      box([0, 0.52, 0], [1, 0.06, 1]),
      box([0, 0.76, -0.46], [0.94, 0.42, 0.07]),
      ...legs(0.44, 0.44, 0.26, [0.08, 0.52, 0.08]),
    ],
  },
  {
    id: 'desk',
    name: 'Escrivaninha',
    category: 'escritorio',
    icon: 'Laptop',
    description: 'Mesa de trabalho com gaveteiro lateral.',
    defaultSize: { width: 1.4, depth: 0.68, height: 0.75 },
    minSize: { width: 0.8, depth: 0.5, height: 0.6 },
    maxSize: { width: 2.4, depth: 1, height: 0.9 },
    resizable: true,
    defaultMaterials: { primary: 'oak', secondary: 'matte-black', accent: 'matte-black' },
    elevation: 0,
    parts: [
      box([0, 0.965, 0], [1, 0.07, 1]),
      box([-0.475, 0.465, 0], [0.05, 0.93, 0.94], 'secondary'),
      box([0.475, 0.465, 0], [0.05, 0.93, 0.94], 'secondary'),
      box([0, 0.6, -0.47], [0.9, 0.5, 0.04], 'secondary'),
      box([0.28, 0.72, 0], [0.34, 0.26, 0.86], 'accent'),
    ],
  },
  {
    id: 'cabinet',
    name: 'Armário',
    category: 'armazenamento',
    icon: 'Columns3',
    description: 'Armário alto de duas portas.',
    defaultSize: { width: 1.2, depth: 0.45, height: 1.8 },
    minSize: { width: 0.5, depth: 0.3, height: 0.8 },
    maxSize: { width: 3, depth: 0.8, height: 2.6 },
    resizable: true,
    defaultMaterials: { primary: 'white-plaster', secondary: 'brushed-metal', accent: 'oak' },
    elevation: 0,
    parts: [
      box([0, 0.53, 0], [1, 0.94, 1]),
      box([0, 0.03, 0], [0.94, 0.06, 0.9], 'secondary'),
      box([-0.245, 0.53, 0.51], [0.47, 0.88, 0.04], 'accent'),
      box([0.245, 0.53, 0.51], [0.47, 0.88, 0.04], 'accent'),
      shape('cylinder', [-0.04, 0.53, 0.55], [0.02, 0.18, 0.02], 'secondary'),
      shape('cylinder', [0.04, 0.53, 0.55], [0.02, 0.18, 0.02], 'secondary'),
    ],
  },
  {
    id: 'floor-lamp',
    name: 'Luminária de piso',
    category: 'iluminacao',
    icon: 'Lamp',
    description: 'Luminária com cúpula difusora e luz quente.',
    defaultSize: { width: 0.42, depth: 0.42, height: 1.62 },
    minSize: { width: 0.3, depth: 0.3, height: 1.1 },
    maxSize: { width: 0.7, depth: 0.7, height: 2.1 },
    resizable: false,
    defaultMaterials: { primary: 'matte-black', secondary: 'brushed-metal', accent: 'linen' },
    elevation: 0,
    parts: [
      shape('cylinder', [0, 0.015, 0], [0.9, 0.03, 0.9], 'secondary'),
      shape('cylinder', [0, 0.4, 0], [0.1, 0.78, 0.1]),
      shape('cone', [0, 0.88, 0], [1, 0.22, 1], 'accent'),
      shape('sphere', [0, 0.8, 0], [0.3, 0.3, 0.3], 'light'),
    ],
  },
  {
    id: 'plant',
    name: 'Planta',
    category: 'decoracao',
    icon: 'Sprout',
    description: 'Planta de interior em vaso de cerâmica.',
    defaultSize: { width: 0.55, depth: 0.55, height: 1.25 },
    minSize: { width: 0.3, depth: 0.3, height: 0.5 },
    maxSize: { width: 1.2, depth: 1.2, height: 2.4 },
    resizable: true,
    defaultMaterials: { primary: 'terracotta', secondary: 'concrete', accent: 'sage' },
    elevation: 0,
    parts: [
      shape('cylinder', [0, 0.13, 0], [0.72, 0.26, 0.72]),
      shape('cylinder', [0, 0.26, 0], [0.64, 0.02, 0.64], 'secondary'),
      shape('cylinder', [0, 0.45, 0], [0.06, 0.4, 0.06], 'accent'),
      shape('sphere', [0, 0.72, 0], [0.9, 0.42, 0.9], 'accent'),
      shape('sphere', [0.12, 0.92, -0.1], [0.5, 0.26, 0.5], 'accent'),
    ],
  },
] as const;

const CATALOG_INDEX = new Map(FURNITURE_CATALOG.map((item) => [item.id, item]));

export function getCatalogItem(id: string): CatalogItem | undefined {
  return CATALOG_INDEX.get(id);
}

export function requireCatalogItem(id: string): CatalogItem {
  const item = CATALOG_INDEX.get(id);
  if (!item) throw new Error(`Unknown catalog item: ${id}`);
  return item;
}

export function catalogExists(id: string): boolean {
  return CATALOG_INDEX.has(id);
}

/** Absolute, meter-space placement of a part for an instance of the given size. */
export interface ResolvedPart {
  shape: PartShape;
  slot: PartSlot;
  center: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  rotationY: number;
}

export function resolveParts(catalogId: string, size: Size3): ResolvedPart[] {
  const item = getCatalogItem(catalogId);
  if (!item) return [];

  return item.parts.map((part) => ({
    shape: part.shape,
    slot: part.slot,
    center: {
      x: part.center.x * size.width,
      y: part.center.y * size.height,
      z: part.center.z * size.depth,
    },
    size: {
      x: Math.max(0.004, part.size.x * size.width),
      y: Math.max(0.004, part.size.y * size.height),
      z: Math.max(0.004, part.size.z * size.depth),
    },
    rotationY: part.rotationY ?? 0,
  }));
}

/**
 * Clamps a requested size to the catalog entry's limits, keeping the item usable no matter
 * what the inspector or a drag handle asks for.
 */
export function clampFurnitureSize(catalogId: string, size: Size3): Size3 {
  const item = getCatalogItem(catalogId);
  if (!item) return size;

  const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

  return {
    width: clamp(size.width, item.minSize.width, item.maxSize.width),
    depth: clamp(size.depth, item.minSize.depth, item.maxSize.depth),
    height: clamp(size.height, item.minSize.height, item.maxSize.height),
  };
}

/**
 * Material slots for an instance: the user-chosen material always drives the primary surface,
 * while structural and accent parts keep the catalog defaults so a sofa never ends up with
 * oak cushions.
 */
export function resolveMaterialSlots(
  catalogId: string,
  materialId: string,
): { primary: string; secondary: string; accent: string } {
  const item = getCatalogItem(catalogId);
  if (!item) {
    return { primary: materialId, secondary: materialId, accent: materialId };
  }

  const sharesPrimary = item.defaultMaterials.accent === item.defaultMaterials.primary;

  return {
    primary: materialId,
    secondary: item.defaultMaterials.secondary,
    accent: sharesPrimary ? materialId : item.defaultMaterials.accent,
  };
}
