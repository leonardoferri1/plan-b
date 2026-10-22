import { create } from 'zustand';
import {
  CURRENT_SCHEMA_VERSION,
  createSampleProject,
  currentLevel,
  planStats,
} from '@plan-b/shared';
import type { FloorPlan, Project } from '@plan-b/shared';
import type { PlanCommand } from '@/editor/commands';
import {
  canRedo,
  canUndo,
  emptyHistory,
  pushHistory,
  redo as redoHistory,
  redoLabel,
  runCommand,
  undo as undoHistory,
  undoLabel,
  type HistoryState,
} from '@/editor/history';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export interface ProjectStoreState {
  projectId: string;
  name: string;
  plan: FloorPlan;
  history: HistoryState;

  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: string | null;
  /** Bumped on every accepted command; the autosave loop watches this instead of the plan. */
  revision: number;
  /** True while the project is being loaded from a repository. */
  loading: boolean;

  dispatch: (command: PlanCommand) => boolean;
  undo: () => string | null;
  redo: () => string | null;
  loadProject: (project: Project, options?: { markSaved?: boolean }) => void;
  renameProject: (name: string) => void;
  resetToSample: () => void;

  /** Adopts the id a repository assigned on first save, without disturbing the history. */
  setProjectId: (id: string) => void;
  setSaveState: (state: SaveState, error?: string | null) => void;
  markSaved: (at?: string) => void;
  setLoading: (loading: boolean) => void;
  toProject: () => Project;
}

const initialProject = createSampleProject();

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projectId: initialProject.id,
  name: initialProject.name,
  plan: initialProject.plan,
  history: emptyHistory(),

  saveState: 'saved',
  saveError: null,
  lastSavedAt: null,
  revision: 0,
  loading: false,

  /**
   * Runs a command and records it. Returns `false` when the command was a no-op, which lets
   * tools distinguish "rejected by validation" from "applied" without reading the state back.
   */
  dispatch(command) {
    const { plan, history } = get();
    const result = runCommand(plan, command);

    if (!result.entry) return false;

    set({
      plan: result.state,
      history: pushHistory(history, result.entry),
      saveState: 'dirty',
      saveError: null,
      revision: get().revision + 1,
    });

    return true;
  },

  undo() {
    const { plan, history } = get();
    const result = undoHistory(plan, history);
    if (!result.entry) return null;

    set({
      plan: result.state,
      history: result.history,
      saveState: 'dirty',
      revision: get().revision + 1,
    });

    return result.entry.label;
  },

  redo() {
    const { plan, history } = get();
    const result = redoHistory(plan, history);
    if (!result.entry) return null;

    set({
      plan: result.state,
      history: result.history,
      saveState: 'dirty',
      revision: get().revision + 1,
    });

    return result.entry.label;
  },

  loadProject(project, options) {
    set({
      projectId: project.id,
      name: project.name,
      plan: project.plan,
      history: emptyHistory(),
      saveState: options?.markSaved === false ? 'dirty' : 'saved',
      saveError: null,
      lastSavedAt: options?.markSaved === false ? null : project.updatedAt,
      revision: get().revision + 1,
      loading: false,
    });
  },

  renameProject(name) {
    if (!name.trim() || name === get().name) return;
    set({ name: name.trim(), saveState: 'dirty', revision: get().revision + 1 });
  },

  resetToSample() {
    get().loadProject(createSampleProject(), { markSaved: false });
  },

  setProjectId(id) {
    if (!id || id === get().projectId) return;
    set({ projectId: id });
  },

  setSaveState(state, error = null) {
    set({ saveState: state, saveError: error });
  },

  markSaved(at = new Date().toISOString()) {
    set({ saveState: 'saved', saveError: null, lastSavedAt: at });
  },

  setLoading(loading) {
    set({ loading });
  },

  toProject() {
    const { projectId, name, plan } = get();
    return {
      id: projectId,
      name,
      plan: { ...plan, schemaVersion: CURRENT_SCHEMA_VERSION },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },
}));

// ── Selectors ──────────────────────────────────────────────────────────────

export const selectLevel = (state: ProjectStoreState) => currentLevel(state.plan);
export const selectSettings = (state: ProjectStoreState) => state.plan.settings;
export const selectCanUndo = (state: ProjectStoreState) => canUndo(state.history);
export const selectCanRedo = (state: ProjectStoreState) => canRedo(state.history);
export const selectUndoLabel = (state: ProjectStoreState) => undoLabel(state.history);
export const selectRedoLabel = (state: ProjectStoreState) => redoLabel(state.history);
export const selectStats = (state: ProjectStoreState) => planStats(currentLevel(state.plan));
