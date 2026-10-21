import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';

enablePatches();

/**
 * Undo/redo is implemented with immer patches rather than document snapshots.
 *
 * Each entry stores the forward patches and their inverses, so a step costs the size of the
 * change instead of the size of the plan. That matters here: dragging a wall corner emits one
 * command per pointer move, and snapshotting a furnished apartment sixty times a second would
 * be wasteful enough to be felt.
 */

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  /**
   * Consecutive entries sharing a key inside {@link COALESCE_WINDOW_MS} collapse into one, so
   * a drag is a single undo step rather than one per frame.
   */
  coalesceKey?: string;
  timestamp: number;
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const HISTORY_LIMIT = 200;
export const COALESCE_WINDOW_MS = 600;

export const emptyHistory = (): HistoryState => ({ past: [], future: [] });

export interface CommandLike<T> {
  type: string;
  label: string;
  coalesceKey?: string;
  mutate(draft: T): void;
}

export interface CommandResult<T> {
  state: T;
  entry: HistoryEntry | null;
}

/** Runs a command against `state`, producing the next state and its history entry. */
export function runCommand<T>(
  state: T,
  command: CommandLike<T>,
  now = Date.now(),
): CommandResult<T> {
  const [next, patches, inversePatches] = produceWithPatches(state, (draft) => {
    command.mutate(draft as T);
  });

  if (patches.length === 0) {
    return { state, entry: null };
  }

  return {
    state: next as T,
    entry: {
      label: command.label,
      patches: patches as Patch[],
      inversePatches: inversePatches as Patch[],
      coalesceKey: command.coalesceKey,
      timestamp: now,
    },
  };
}

/** Appends an entry, coalescing it into the previous one when both opt in. */
export function pushHistory(
  history: HistoryState,
  entry: HistoryEntry,
  limit = HISTORY_LIMIT,
): HistoryState {
  const previous = history.past[history.past.length - 1];

  const canCoalesce =
    previous !== undefined &&
    entry.coalesceKey !== undefined &&
    previous.coalesceKey === entry.coalesceKey &&
    entry.timestamp - previous.timestamp <= COALESCE_WINDOW_MS;

  if (canCoalesce && previous) {
    const merged: HistoryEntry = {
      label: entry.label,
      coalesceKey: entry.coalesceKey,
      timestamp: entry.timestamp,
      patches: [...previous.patches, ...entry.patches],
      // Inverses unwind in reverse order.
      inversePatches: [...entry.inversePatches, ...previous.inversePatches],
    };

    return { past: [...history.past.slice(0, -1), merged], future: [] };
  }

  const past = [...history.past, entry];

  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    future: [],
  };
}

export interface UndoResult<T> {
  state: T;
  history: HistoryState;
  entry: HistoryEntry | null;
}

export function undo<T>(state: T, history: HistoryState): UndoResult<T> {
  const entry = history.past[history.past.length - 1];
  if (!entry) return { state, history, entry: null };

  return {
    state: applyPatches(state as never, entry.inversePatches) as T,
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
    entry,
  };
}

export function redo<T>(state: T, history: HistoryState): UndoResult<T> {
  const entry = history.future[0];
  if (!entry) return { state, history, entry: null };

  return {
    state: applyPatches(state as never, entry.patches) as T,
    history: { past: [...history.past, entry], future: history.future.slice(1) },
    entry,
  };
}

export const canUndo = (history: HistoryState): boolean => history.past.length > 0;
export const canRedo = (history: HistoryState): boolean => history.future.length > 0;

export const undoLabel = (history: HistoryState): string | null =>
  history.past[history.past.length - 1]?.label ?? null;

export const redoLabel = (history: HistoryState): string | null => history.future[0]?.label ?? null;
