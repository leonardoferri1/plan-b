import { create } from 'zustand';
import type { EntityRef, Vec2 } from '@spacecraft/shared';
import { clamp } from '@/lib/utils';

export type ToolId = 'select' | 'wall' | 'room' | 'door' | 'window' | 'furniture' | 'measure';

export type ViewMode = '2d' | '3d' | 'split';

export type CameraPreset = 'perspective' | 'top' | 'isometric';

export interface Viewport {
  /** Plan coordinate (in meters) displayed at the center of the canvas. */
  center: Vec2;
  /** Pixels per meter. */
  zoom: number;
}

export const ZOOM_LIMITS = { min: 8, max: 400 } as const;

export interface Measurement {
  from: Vec2;
  to: Vec2;
}

export interface EditorStoreState {
  tool: ToolId;
  selection: EntityRef[];
  hovered: EntityRef | null;

  viewMode: ViewMode;
  cameraPreset: CameraPreset;
  viewport: Viewport;

  gridVisible: boolean;
  dimensionsVisible: boolean;
  furnitureVisible: boolean;
  /** Hides the walls between the camera and the interior in the 3D view. */
  wallCutaway: boolean;

  catalogOpen: boolean;
  inspectorOpen: boolean;
  shortcutsOpen: boolean;

  /** Catalog item armed for click-to-place, if any. */
  pendingCatalogId: string | null;
  measurement: Measurement | null;

  /** Set while a pointer drag is in progress so the autosave loop can wait it out. */
  interacting: boolean;

  setTool: (tool: ToolId) => void;
  setViewMode: (mode: ViewMode) => void;
  setCameraPreset: (preset: CameraPreset) => void;

  setSelection: (selection: EntityRef[]) => void;
  select: (ref: EntityRef | null, options?: { additive?: boolean }) => void;
  clearSelection: () => void;
  setHovered: (ref: EntityRef | null) => void;

  setViewport: (viewport: Partial<Viewport>) => void;
  panBy: (deltaMeters: Vec2) => void;
  zoomBy: (factor: number) => void;
  zoomTo: (zoom: number) => void;

  toggleGrid: () => void;
  toggleDimensions: () => void;
  toggleFurniture: () => void;
  toggleWallCutaway: () => void;
  setCatalogOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;

  armCatalogItem: (catalogId: string | null) => void;
  setMeasurement: (measurement: Measurement | null) => void;
  setInteracting: (interacting: boolean) => void;
}

const sameRef = (a: EntityRef, b: EntityRef): boolean => a.kind === b.kind && a.id === b.id;

export const useEditorStore = create<EditorStoreState>((set, get) => ({
  tool: 'select',
  selection: [],
  hovered: null,

  viewMode: '2d',
  cameraPreset: 'perspective',
  viewport: { center: { x: 4.5, y: 3.5 }, zoom: 78 },

  gridVisible: true,
  dimensionsVisible: true,
  furnitureVisible: true,
  wallCutaway: true,

  catalogOpen: true,
  inspectorOpen: true,
  shortcutsOpen: false,

  pendingCatalogId: null,
  measurement: null,
  interacting: false,

  setTool(tool) {
    // Switching away from a placement tool must not leave an armed catalog item behind.
    set({
      tool,
      pendingCatalogId: tool === 'furniture' ? get().pendingCatalogId : null,
      measurement: tool === 'measure' ? get().measurement : null,
    });
  },

  setViewMode(viewMode) {
    set({ viewMode });
  },

  setCameraPreset(cameraPreset) {
    set({ cameraPreset });
  },

  setSelection(selection) {
    set({ selection });
  },

  select(ref, options) {
    if (!ref) {
      set({ selection: [] });
      return;
    }

    if (!options?.additive) {
      set({ selection: [ref] });
      return;
    }

    const current = get().selection;
    const exists = current.some((candidate) => sameRef(candidate, ref));

    set({
      selection: exists
        ? current.filter((candidate) => !sameRef(candidate, ref))
        : [...current, ref],
    });
  },

  clearSelection() {
    set({ selection: [] });
  },

  setHovered(hovered) {
    const current = get().hovered;
    if (current === hovered) return;
    if (current && hovered && sameRef(current, hovered)) return;
    set({ hovered });
  },

  setViewport(viewport) {
    set({ viewport: { ...get().viewport, ...viewport } });
  },

  panBy(deltaMeters) {
    const { center, zoom } = get().viewport;
    set({
      viewport: { center: { x: center.x + deltaMeters.x, y: center.y + deltaMeters.y }, zoom },
    });
  },

  zoomBy(factor) {
    const { viewport } = get();
    set({
      viewport: {
        ...viewport,
        zoom: clamp(viewport.zoom * factor, ZOOM_LIMITS.min, ZOOM_LIMITS.max),
      },
    });
  },

  zoomTo(zoom) {
    const { viewport } = get();
    set({ viewport: { ...viewport, zoom: clamp(zoom, ZOOM_LIMITS.min, ZOOM_LIMITS.max) } });
  },

  toggleGrid() {
    set({ gridVisible: !get().gridVisible });
  },

  toggleDimensions() {
    set({ dimensionsVisible: !get().dimensionsVisible });
  },

  toggleFurniture() {
    set({ furnitureVisible: !get().furnitureVisible });
  },

  toggleWallCutaway() {
    set({ wallCutaway: !get().wallCutaway });
  },

  setCatalogOpen(catalogOpen) {
    set({ catalogOpen });
  },

  setInspectorOpen(inspectorOpen) {
    set({ inspectorOpen });
  },

  setShortcutsOpen(shortcutsOpen) {
    set({ shortcutsOpen });
  },

  armCatalogItem(pendingCatalogId) {
    set({ pendingCatalogId, tool: pendingCatalogId ? 'furniture' : get().tool });
  },

  setMeasurement(measurement) {
    set({ measurement });
  },

  setInteracting(interacting) {
    set({ interacting });
  },
}));

export const isSelected = (selection: readonly EntityRef[], ref: EntityRef): boolean =>
  selection.some((candidate) => sameRef(candidate, ref));

export const selectionIds = (selection: readonly EntityRef[], kind: EntityRef['kind']): string[] =>
  selection.filter((ref) => ref.kind === kind).map((ref) => ref.id);
