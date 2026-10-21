import { useEffect } from 'react';
import { currentLevel, type EntityRef, type Vec2 } from '@spacecraft/shared';
import {
  deleteEntities,
  duplicateFurniture,
  moveFurniture,
  moveNode,
  rotateFurniture,
} from '@/editor/commands';
import { useEditorStore, type ToolId } from '@/store/editor-store';
import { useProjectStore } from '@/store/project-store';
import { useFitToPlan } from '@/features/shell/ViewControls';
import { saveNow } from '@/services/useProjectSync';

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'select',
  p: 'wall',
  a: 'room',
  d: 'door',
  j: 'window',
  m: 'furniture',
  t: 'measure',
};

const ROTATION_STEP = Math.PI / 12;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Every editor action reachable from the keyboard.
 *
 * Shortcuts are deliberately mnemonic in Portuguese (P for parede, A for ambiente, J for
 * janela) because the interface is Portuguese; the modifier combinations follow the usual
 * cross-application conventions.
 */
export function useEditorShortcuts(): void {
  const fit = useFitToPlan();

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;

      const editor = useEditorStore.getState();
      const project = useProjectStore.getState();
      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      // ── History ───────────────────────────────────────────────────────
      if (meta && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) project.redo();
        else project.undo();
        return;
      }

      if (meta && key === 'y') {
        event.preventDefault();
        project.redo();
        return;
      }

      if (meta && key === 's') {
        event.preventDefault();
        void saveNow().catch(() => {
          // The store already carries the error state the top bar renders.
        });
        return;
      }

      // ── Selection ─────────────────────────────────────────────────────
      if (meta && key === 'a') {
        event.preventDefault();
        const level = currentLevel(project.plan);
        editor.setSelection([
          ...level.furniture.map((item): EntityRef => ({ kind: 'furniture', id: item.id })),
          ...level.walls.map((wall): EntityRef => ({ kind: 'wall', id: wall.id })),
        ]);
        return;
      }

      if (meta && key === 'd') {
        const target = editor.selection.find((ref) => ref.kind === 'furniture');
        if (!target) return;
        event.preventDefault();
        project.dispatch(duplicateFurniture(target.id));
        return;
      }

      if (meta) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (editor.selection.length === 0) return;
        event.preventDefault();
        project.dispatch(deleteEntities(editor.selection));
        editor.clearSelection();
        return;
      }

      if (event.key === 'Escape') {
        editor.clearSelection();
        editor.armCatalogItem(null);
        editor.setMeasurement(null);
        return;
      }

      // ── Tools ─────────────────────────────────────────────────────────
      const tool = TOOL_KEYS[key];
      if (tool && !event.shiftKey) {
        event.preventDefault();
        editor.setTool(tool);
        return;
      }

      // ── View ──────────────────────────────────────────────────────────
      if (key === '1') return editor.setViewMode('2d');
      if (key === '2') return editor.setViewMode('3d');
      if (key === '3') return editor.setViewMode('split');
      if (key === 'g') return editor.toggleGrid();
      if (key === 'c') return editor.toggleDimensions();
      if (key === 'h') return editor.toggleFurniture();
      if (key === 'f' && event.shiftKey) {
        event.preventDefault();
        fit();
        return;
      }
      if (event.key === '?') {
        editor.setShortcutsOpen(true);
        return;
      }

      // ── Transform the selection ───────────────────────────────────────
      const furniture = editor.selection.find((ref) => ref.kind === 'furniture');

      if ((key === '[' || key === ']') && furniture) {
        event.preventDefault();
        const level = currentLevel(project.plan);
        const item = level.furniture.find((candidate) => candidate.id === furniture.id);
        if (!item) return;
        const delta = key === ']' ? ROTATION_STEP : -ROTATION_STEP;
        project.dispatch(rotateFurniture(item.id, item.rotation + delta));
        return;
      }

      const nudge = NUDGE_KEYS[event.key];
      if (nudge && editor.selection.length > 0) {
        event.preventDefault();
        const step = event.shiftKey
          ? project.plan.settings.gridSize
          : Math.min(0.05, project.plan.settings.gridSize);
        const delta = { x: nudge.x * step, y: nudge.y * step };
        nudgeSelection(delta);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fit]);
}

const NUDGE_KEYS: Record<string, Vec2> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

function nudgeSelection(delta: Vec2): void {
  const project = useProjectStore.getState();
  const editor = useEditorStore.getState();
  const level = currentLevel(project.plan);

  for (const ref of editor.selection) {
    if (ref.kind === 'furniture') {
      const item = level.furniture.find((candidate) => candidate.id === ref.id);
      if (!item) continue;
      project.dispatch(
        moveFurniture(item.id, { x: item.position.x + delta.x, y: item.position.y + delta.y }),
      );
    }

    if (ref.kind === 'node') {
      const node = level.nodes.find((candidate) => candidate.id === ref.id);
      if (!node) continue;
      project.dispatch(moveNode(node.id, { x: node.x + delta.x, y: node.y + delta.y }));
    }
  }
}
