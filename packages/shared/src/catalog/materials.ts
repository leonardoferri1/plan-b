export type MaterialCategory = 'madeira' | 'pedra' | 'pintura' | 'metal' | 'tecido';

export type MaterialPattern = 'none' | 'wood' | 'marble' | 'concrete' | 'weave' | 'tile';

export interface MaterialPreset {
  id: string;
  name: string;
  category: MaterialCategory;
  /** Base colour, used by both renderers. */
  color: string;
  /** Secondary colour driving the procedural pattern (grain, veins, speckle). */
  accent: string;
  roughness: number;
  metalness: number;
  /** Fill colour used by the 2D plan, usually a flattened version of `color`. */
  planFill: string;
  pattern: MaterialPattern;
  /** Repeat of the procedural texture, in tiles per meter. */
  scale: number;
}

export const MATERIAL_PRESETS: readonly MaterialPreset[] = [
  {
    id: 'oak',
    name: 'Carvalho',
    category: 'madeira',
    color: '#c69c6d',
    accent: '#9c7246',
    roughness: 0.62,
    metalness: 0.0,
    planFill: '#d8bb94',
    pattern: 'wood',
    scale: 1.1,
  },
  {
    id: 'walnut',
    name: 'Nogueira',
    category: 'madeira',
    color: '#6b4631',
    accent: '#432a1c',
    roughness: 0.55,
    metalness: 0.0,
    planFill: '#8a614a',
    pattern: 'wood',
    scale: 1.1,
  },
  {
    id: 'white-plaster',
    name: 'Massa branca',
    category: 'pintura',
    color: '#ece9e3',
    accent: '#d9d5cd',
    roughness: 0.95,
    metalness: 0.0,
    planFill: '#e8e6e1',
    pattern: 'none',
    scale: 1,
  },
  {
    id: 'concrete',
    name: 'Concreto',
    category: 'pedra',
    color: '#9a9a97',
    accent: '#7c7c79',
    roughness: 0.88,
    metalness: 0.0,
    planFill: '#a9a9a6',
    pattern: 'concrete',
    scale: 0.9,
  },
  {
    id: 'marble',
    name: 'Mármore',
    category: 'pedra',
    color: '#eef0f1',
    accent: '#9aa6ad',
    roughness: 0.18,
    metalness: 0.05,
    planFill: '#e4e8ea',
    pattern: 'marble',
    scale: 0.6,
  },
  {
    id: 'matte-black',
    name: 'Preto fosco',
    category: 'pintura',
    color: '#1f2124',
    accent: '#141619',
    roughness: 0.82,
    metalness: 0.08,
    planFill: '#2a2d31',
    pattern: 'none',
    scale: 1,
  },
  {
    id: 'brushed-metal',
    name: 'Metal escovado',
    category: 'metal',
    color: '#b8bcc0',
    accent: '#8c9196',
    roughness: 0.32,
    metalness: 0.92,
    planFill: '#b2b6ba',
    pattern: 'none',
    scale: 1,
  },
  {
    id: 'linen',
    name: 'Linho areia',
    category: 'tecido',
    color: '#cfc3b2',
    accent: '#b3a593',
    roughness: 0.94,
    metalness: 0.0,
    planFill: '#d6cbbb',
    pattern: 'weave',
    scale: 2.2,
  },
  {
    id: 'charcoal-fabric',
    name: 'Tecido grafite',
    category: 'tecido',
    color: '#4a4e55',
    accent: '#383c42',
    roughness: 0.96,
    metalness: 0.0,
    planFill: '#555a61',
    pattern: 'weave',
    scale: 2.2,
  },
  {
    id: 'sage',
    name: 'Verde sálvia',
    category: 'pintura',
    color: '#6f8f6a',
    accent: '#56714f',
    roughness: 0.85,
    metalness: 0.0,
    planFill: '#7d9a78',
    pattern: 'none',
    scale: 1,
  },
  {
    id: 'terracotta',
    name: 'Terracota',
    category: 'pedra',
    color: '#b5674a',
    accent: '#8e4c34',
    roughness: 0.8,
    metalness: 0.0,
    planFill: '#c07a5d',
    pattern: 'tile',
    scale: 1.4,
  },
] as const;

const MATERIAL_INDEX = new Map(MATERIAL_PRESETS.map((material) => [material.id, material]));

export const DEFAULT_MATERIAL_ID = 'white-plaster';

export function getMaterial(id: string): MaterialPreset {
  return MATERIAL_INDEX.get(id) ?? MATERIAL_INDEX.get(DEFAULT_MATERIAL_ID)!;
}

export function materialExists(id: string): boolean {
  return MATERIAL_INDEX.has(id);
}

export function materialsByCategory(): Map<MaterialCategory, MaterialPreset[]> {
  const grouped = new Map<MaterialCategory, MaterialPreset[]>();
  for (const material of MATERIAL_PRESETS) {
    const list = grouped.get(material.category) ?? [];
    list.push(material);
    grouped.set(material.category, list);
  }
  return grouped;
}
