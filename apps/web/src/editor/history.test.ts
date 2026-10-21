import { describe, expect, it } from 'vitest';
import {
  COALESCE_WINDOW_MS,
  canRedo,
  canUndo,
  emptyHistory,
  pushHistory,
  redo,
  redoLabel,
  runCommand,
  undo,
  undoLabel,
  type CommandLike,
} from './history';

interface Doc {
  count: number;
  items: string[];
  nested: { label: string };
}

const doc = (): Doc => ({ count: 0, items: [], nested: { label: 'inicial' } });

const increment = (by = 1): CommandLike<Doc> => ({
  type: 'count.increment',
  label: 'Incrementar',
  mutate: (draft) => {
    draft.count += by;
  },
});

const rename = (label: string, coalesceKey?: string): CommandLike<Doc> => ({
  type: 'label.set',
  label: 'Renomear',
  coalesceKey,
  mutate: (draft) => {
    draft.nested.label = label;
  },
});

describe('runCommand', () => {
  it('produces a new state without mutating the previous one', () => {
    const before = doc();
    const result = runCommand(before, increment());

    expect(before.count).toBe(0);
    expect(result.state.count).toBe(1);
    expect(result.state).not.toBe(before);
  });

  it('shares untouched branches of the document', () => {
    const before = doc();
    const result = runCommand(before, increment());

    // Structural sharing is what makes `useMemo` on a sub-tree a valid cache key.
    expect(result.state.nested).toBe(before.nested);
  });

  it('reports no entry for a command that changes nothing', () => {
    const result = runCommand(doc(), {
      type: 'noop',
      label: 'Nada',
      mutate: () => {},
    });

    expect(result.entry).toBeNull();
    expect(result.state).toEqual(doc());
  });

  it('records inverse patches alongside the forward ones', () => {
    const result = runCommand(doc(), increment(5));

    expect(result.entry?.patches).toHaveLength(1);
    expect(result.entry?.inversePatches).toHaveLength(1);
  });
});

describe('undo and redo', () => {
  it('restores the previous state', () => {
    const start = doc();
    const first = runCommand(start, increment());
    let history = pushHistory(emptyHistory(), first.entry!);

    const undone = undo(first.state, history);
    history = undone.history;

    expect(undone.state.count).toBe(0);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(true);
  });

  it('replays the change on redo', () => {
    const first = runCommand(doc(), increment(3));
    const history = pushHistory(emptyHistory(), first.entry!);

    const undone = undo(first.state, history);
    const redone = redo(undone.state, undone.history);

    expect(redone.state.count).toBe(3);
    expect(canRedo(redone.history)).toBe(false);
  });

  it('walks back through several steps in order', () => {
    let state = doc();
    let history = emptyHistory();

    for (const amount of [1, 10, 100]) {
      const result = runCommand(state, increment(amount));
      state = result.state;
      history = pushHistory(history, result.entry!);
    }

    expect(state.count).toBe(111);

    let step = undo(state, history);
    expect(step.state.count).toBe(11);

    step = undo(step.state, step.history);
    expect(step.state.count).toBe(1);

    step = undo(step.state, step.history);
    expect(step.state.count).toBe(0);
    expect(canUndo(step.history)).toBe(false);
  });

  it('is a no-op when there is nothing to undo or redo', () => {
    const state = doc();
    const history = emptyHistory();

    expect(undo(state, history).entry).toBeNull();
    expect(redo(state, history).entry).toBeNull();
  });

  it('exposes the labels of the next undo and redo steps', () => {
    const result = runCommand(doc(), increment());
    const history = pushHistory(emptyHistory(), result.entry!);

    expect(undoLabel(history)).toBe('Incrementar');
    expect(redoLabel(history)).toBeNull();

    const undone = undo(result.state, history);
    expect(redoLabel(undone.history)).toBe('Incrementar');
  });
});

describe('coalescing', () => {
  it('merges consecutive entries sharing a key inside the window', () => {
    let state = doc();
    let history = emptyHistory();
    const start = 1_000;

    for (let index = 0; index < 5; index += 1) {
      const result = runCommand(state, rename(`passo ${index}`, 'rename:1'), start + index * 50);
      state = result.state;
      history = pushHistory(history, result.entry!);
    }

    expect(history.past).toHaveLength(1);
    expect(state.nested.label).toBe('passo 4');

    const undone = undo(state, history);
    expect(undone.state.nested.label).toBe('inicial');
  });

  it('starts a new entry once the window has elapsed', () => {
    const first = runCommand(doc(), rename('a', 'rename:1'), 1_000);
    let history = pushHistory(emptyHistory(), first.entry!);

    const second = runCommand(first.state, rename('b', 'rename:1'), 1_000 + COALESCE_WINDOW_MS + 1);
    history = pushHistory(history, second.entry!);

    expect(history.past).toHaveLength(2);
  });

  it('never merges entries with different keys', () => {
    const first = runCommand(doc(), rename('a', 'rename:1'), 1_000);
    let history = pushHistory(emptyHistory(), first.entry!);

    const second = runCommand(first.state, rename('b', 'rename:2'), 1_010);
    history = pushHistory(history, second.entry!);

    expect(history.past).toHaveLength(2);
  });

  it('never merges entries without a key', () => {
    const first = runCommand(doc(), increment(), 1_000);
    let history = pushHistory(emptyHistory(), first.entry!);

    const second = runCommand(first.state, increment(), 1_010);
    history = pushHistory(history, second.entry!);

    expect(history.past).toHaveLength(2);
  });
});

describe('history limits', () => {
  it('drops the oldest entries past the limit', () => {
    let state = doc();
    let history = emptyHistory();

    for (let index = 0; index < 8; index += 1) {
      const result = runCommand(state, increment());
      state = result.state;
      history = pushHistory(history, result.entry!, 5);
    }

    expect(history.past).toHaveLength(5);
  });

  it('clears the redo stack when a new command is pushed', () => {
    const first = runCommand(doc(), increment());
    let history = pushHistory(emptyHistory(), first.entry!);

    const undone = undo(first.state, history);
    history = undone.history;
    expect(canRedo(history)).toBe(true);

    const second = runCommand(undone.state, increment(7));
    history = pushHistory(history, second.entry!);

    expect(canRedo(history)).toBe(false);
  });
});
