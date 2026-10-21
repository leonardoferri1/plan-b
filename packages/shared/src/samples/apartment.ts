import { DEFAULT_PLAN_SETTINGS } from '../domain/types';
import type {
  FloorPlan,
  FurnitureItem,
  Level,
  Opening,
  Project,
  Room,
  Wall,
  WallNode,
} from '../domain/types';
import { CURRENT_SCHEMA_VERSION } from '../domain/types';
import { requireCatalogItem } from '../catalog/furniture';

/**
 * The demo apartment every visitor lands on: a 9.0 × 7.0 m unit of roughly 63 m² with a
 * living/dining room, a bedroom, a kitchen, a bathroom and a home office.
 *
 * Ids are fixed rather than generated so that the demo is byte-for-byte reproducible, which
 * makes it usable as a fixture in unit tests and as a stable target for the E2E suite.
 */

const WALL_HEIGHT = 2.7;
const EXTERIOR = 0.2;
const INTERIOR = 0.12;

const node = (id: string, x: number, y: number): WallNode => ({ id, x, y });

const NODES: WallNode[] = [
  node('n-a', 0, 0),
  node('n-b', 5.4, 0),
  node('n-c', 9, 0),
  node('n-d', 0, 4.2),
  node('n-e', 3.4, 4.2),
  node('n-f', 5.4, 4.2),
  node('n-g', 9, 4.2),
  node('n-h', 0, 7),
  node('n-i', 3.4, 7),
  node('n-j', 5.4, 7),
  node('n-k', 9, 7),
];

const wall = (id: string, a: string, b: string, thickness: number): Wall => ({
  id,
  a,
  b,
  thickness,
  height: WALL_HEIGHT,
  materialId: 'white-plaster',
});

const WALLS: Wall[] = [
  // Envelope, clockwise from the north-west corner.
  wall('w-n1', 'n-a', 'n-b', EXTERIOR),
  wall('w-n2', 'n-b', 'n-c', EXTERIOR),
  wall('w-e1', 'n-c', 'n-g', EXTERIOR),
  wall('w-e2', 'n-g', 'n-k', EXTERIOR),
  wall('w-s1', 'n-k', 'n-j', EXTERIOR),
  wall('w-s2', 'n-j', 'n-i', EXTERIOR),
  wall('w-s3', 'n-i', 'n-h', EXTERIOR),
  wall('w-w1', 'n-h', 'n-d', EXTERIOR),
  wall('w-w2', 'n-d', 'n-a', EXTERIOR),

  // Partitions.
  wall('w-i1', 'n-b', 'n-f', INTERIOR),
  wall('w-i2', 'n-d', 'n-e', INTERIOR),
  wall('w-i3', 'n-e', 'n-f', INTERIOR),
  wall('w-i4', 'n-f', 'n-g', INTERIOR),
  wall('w-i5', 'n-e', 'n-i', INTERIOR),
  wall('w-i6', 'n-f', 'n-j', INTERIOR),
];

const door = (
  id: string,
  wallId: string,
  offset: number,
  width = 0.9,
  flipped = false,
): Opening => ({
  id,
  wallId,
  kind: 'door',
  offset,
  width,
  height: 2.1,
  sillHeight: 0,
  flipped,
  swingReversed: false,
});

const window_ = (
  id: string,
  wallId: string,
  offset: number,
  width: number,
  height = 1.5,
  sillHeight = 0.9,
): Opening => ({
  id,
  wallId,
  kind: 'window',
  offset,
  width,
  height,
  sillHeight,
  flipped: false,
  swingReversed: false,
});

const OPENINGS: Opening[] = [
  // Entrance, on the west facade.
  door('o-entry', 'w-w2', 3.2, 0.95),

  // Living / dining glazing.
  window_('o-liv-1', 'w-n1', 1.5, 1.4),
  window_('o-liv-2', 'w-n1', 3.9, 1.4),

  // Bedroom.
  window_('o-bed-1', 'w-n2', 1.8, 1.6),
  window_('o-bed-2', 'w-e1', 2.1, 1.2),
  door('o-bed-door', 'w-i1', 3.5),

  // Home office.
  window_('o-off-1', 'w-e2', 1.4, 1.2),
  door('o-off-door', 'w-i4', 0.95),

  // Kitchen.
  window_('o-kit-1', 'w-s3', 1.7, 1.2, 1.1, 1.1),
  door('o-kit-door', 'w-i2', 2.6, 0.9, true),

  // Bathroom.
  window_('o-bath-1', 'w-s2', 1, 0.6, 0.7, 1.5),
  door('o-bath-door', 'w-i3', 1, 0.8),
];

const ROOMS: Room[] = [
  {
    id: 'rm-living',
    name: 'Sala de estar',
    nodeIds: ['n-a', 'n-b', 'n-f', 'n-e', 'n-d'],
    floorMaterialId: 'oak',
    autoNamed: false,
  },
  {
    id: 'rm-bedroom',
    name: 'Dormitório',
    nodeIds: ['n-b', 'n-c', 'n-g', 'n-f'],
    floorMaterialId: 'oak',
    autoNamed: false,
  },
  {
    id: 'rm-kitchen',
    name: 'Cozinha',
    nodeIds: ['n-d', 'n-e', 'n-i', 'n-h'],
    floorMaterialId: 'concrete',
    autoNamed: false,
  },
  {
    id: 'rm-bath',
    name: 'Banheiro',
    nodeIds: ['n-e', 'n-f', 'n-j', 'n-i'],
    floorMaterialId: 'marble',
    autoNamed: false,
  },
  {
    id: 'rm-office',
    name: 'Home office',
    nodeIds: ['n-f', 'n-g', 'n-k', 'n-j'],
    floorMaterialId: 'oak',
    autoNamed: false,
  },
];

const DEG = Math.PI / 180;

interface FurnitureSpec {
  id: string;
  catalogId: string;
  x: number;
  y: number;
  rotation?: number;
  name?: string;
  materialId?: string;
  width?: number;
  depth?: number;
}

function furniture(spec: FurnitureSpec): FurnitureItem {
  const catalog = requireCatalogItem(spec.catalogId);

  return {
    id: spec.id,
    catalogId: spec.catalogId,
    name: spec.name ?? catalog.name,
    position: { x: spec.x, y: spec.y },
    rotation: spec.rotation ?? 0,
    size: {
      width: spec.width ?? catalog.defaultSize.width,
      depth: spec.depth ?? catalog.defaultSize.depth,
      height: catalog.defaultSize.height,
    },
    materialId: spec.materialId ?? catalog.defaultMaterials.primary,
    elevation: catalog.elevation,
    locked: false,
  };
}

const FURNITURE: FurnitureItem[] = [
  // ── Living / dining ──────────────────────────────────────────────────────
  furniture({ id: 'f-rug-living', catalogId: 'rug', x: 1.85, y: 2.3, width: 2.7, depth: 2.1 }),
  furniture({ id: 'f-sofa', catalogId: 'sofa', x: 1.85, y: 1.15, name: 'Sofá da sala' }),
  furniture({ id: 'f-coffee', catalogId: 'coffee-table', x: 1.85, y: 2.45 }),
  furniture({ id: 'f-tv', catalogId: 'tv-stand', x: 1.85, y: 3.78, rotation: 180 * DEG }),
  furniture({ id: 'f-lamp-living', catalogId: 'floor-lamp', x: 0.52, y: 0.55 }),
  furniture({ id: 'f-plant-living', catalogId: 'plant', x: 0.55, y: 3.75 }),
  furniture({ id: 'f-table', catalogId: 'dining-table', x: 4.35, y: 2.15, rotation: 90 * DEG }),
  furniture({ id: 'f-chair-1', catalogId: 'chair', x: 3.65, y: 1.75, rotation: 90 * DEG }),
  furniture({ id: 'f-chair-2', catalogId: 'chair', x: 3.65, y: 2.55, rotation: 90 * DEG }),
  furniture({ id: 'f-chair-3', catalogId: 'chair', x: 5.05, y: 1.75, rotation: -90 * DEG }),
  furniture({ id: 'f-chair-4', catalogId: 'chair', x: 5.05, y: 2.55, rotation: -90 * DEG }),

  // ── Bedroom ──────────────────────────────────────────────────────────────
  furniture({ id: 'f-bed', catalogId: 'bed', x: 7.2, y: 1.35 }),
  furniture({ id: 'f-night-1', catalogId: 'nightstand', x: 6.25, y: 0.52 }),
  furniture({ id: 'f-night-2', catalogId: 'nightstand', x: 8.15, y: 0.52 }),
  furniture({
    id: 'f-wardrobe',
    catalogId: 'cabinet',
    x: 8.55,
    y: 3.2,
    rotation: -90 * DEG,
    name: 'Guarda-roupa',
  }),
  furniture({
    id: 'f-armchair-bed',
    catalogId: 'armchair',
    x: 6.1,
    y: 3.5,
    rotation: 180 * DEG,
  }),

  // ── Kitchen ──────────────────────────────────────────────────────────────
  furniture({
    id: 'f-kit-counter',
    catalogId: 'cabinet',
    x: 1.7,
    y: 4.56,
    name: 'Bancada',
    materialId: 'matte-black',
  }),
  furniture({
    id: 'f-kit-tall',
    catalogId: 'cabinet',
    x: 0.37,
    y: 5.8,
    rotation: 90 * DEG,
    name: 'Torre quente',
  }),
  furniture({ id: 'f-plant-kitchen', catalogId: 'plant', x: 3.05, y: 6.55 }),

  // ── Bathroom ─────────────────────────────────────────────────────────────
  furniture({
    id: 'f-vanity',
    catalogId: 'cabinet',
    x: 4.4,
    y: 4.6,
    name: 'Gabinete',
    materialId: 'marble',
  }),

  // ── Home office ──────────────────────────────────────────────────────────
  furniture({ id: 'f-rug-office', catalogId: 'rug', x: 7, y: 5.9, width: 1.8, depth: 1.4 }),
  furniture({ id: 'f-desk', catalogId: 'desk', x: 7.2, y: 4.68 }),
  furniture({ id: 'f-desk-chair', catalogId: 'chair', x: 7.2, y: 5.5, rotation: 180 * DEG }),
  furniture({
    id: 'f-bookcase',
    catalogId: 'cabinet',
    x: 8.6,
    y: 5.9,
    rotation: -90 * DEG,
    name: 'Estante',
    materialId: 'walnut',
  }),
  furniture({ id: 'f-lamp-office', catalogId: 'floor-lamp', x: 5.85, y: 6.45 }),
];

export const SAMPLE_PROJECT_ID = 'demo-apartamento';

export function createSampleLevel(): Level {
  return {
    id: 'lv-ground',
    name: 'Pavimento térreo',
    elevation: 0,
    nodes: NODES.map((item) => ({ ...item })),
    walls: WALLS.map((item) => ({ ...item })),
    openings: OPENINGS.map((item) => ({ ...item })),
    rooms: ROOMS.map((item) => ({ ...item, nodeIds: [...item.nodeIds] })),
    furniture: FURNITURE.map((item) => ({
      ...item,
      position: { ...item.position },
      size: { ...item.size },
    })),
  };
}

export function createSamplePlan(): FloorPlan {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    levels: [createSampleLevel()],
    settings: { ...DEFAULT_PLAN_SETTINGS },
  };
}

export function createSampleProject(overrides: Partial<Project> = {}): Project {
  const now = new Date().toISOString();

  return {
    id: SAMPLE_PROJECT_ID,
    name: 'Apartamento Aurora',
    plan: createSamplePlan(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** An empty plan, used by "new project" and by the empty-state illustration. */
export function createEmptyPlan(): FloorPlan {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    levels: [
      {
        id: 'lv-ground',
        name: 'Pavimento térreo',
        elevation: 0,
        nodes: [],
        walls: [],
        openings: [],
        rooms: [],
        furniture: [],
      },
    ],
    settings: { ...DEFAULT_PLAN_SETTINGS },
  };
}

export function createEmptyProject(name = 'Novo projeto'): Project {
  const now = new Date().toISOString();
  return {
    id: `pr_${Math.random().toString(36).slice(2, 10)}`,
    name,
    plan: createEmptyPlan(),
    createdAt: now,
    updatedAt: now,
  };
}
