import { beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, createSampleProject, currentLevel } from '@plan-b/shared';
import { addFurniture, deleteEntities, moveFurniture } from '@/editor/commands';
import {
  selectCanRedo,
  selectCanUndo,
  selectStats,
  selectUndoLabel,
  useProjectStore,
} from './project-store';

const store = () => useProjectStore.getState();

describe('useProjectStore', () => {
  beforeEach(() => {
    store().loadProject(createSampleProject());
  });

  it('opens a project as saved, with an empty history', () => {
    expect(store().saveState).toBe('saved');
    expect(selectCanUndo(store())).toBe(false);
    expect(selectCanRedo(store())).toBe(false);
  });

  it('marks the document dirty when a command lands', () => {
    const applied = store().dispatch(moveFurniture('f-sofa', { x: 2, y: 2 }));

    expect(applied).toBe(true);
    expect(store().saveState).toBe('dirty');
    expect(selectUndoLabel(store())).toBe('Mover móvel');
  });

  it('reports a no-op command without touching the history', () => {
    const applied = store().dispatch(moveFurniture('does-not-exist', { x: 1, y: 1 }));

    expect(applied).toBe(false);
    expect(selectCanUndo(store())).toBe(false);
    expect(store().saveState).toBe('saved');
  });

  it('bumps the revision only for accepted commands', () => {
    const before = store().revision;

    store().dispatch(moveFurniture('f-sofa', { x: 2, y: 2 }));
    const afterChange = store().revision;

    store().dispatch(moveFurniture('does-not-exist', { x: 1, y: 1 }));

    expect(afterChange).toBe(before + 1);
    expect(store().revision).toBe(afterChange);
  });

  it('undoes and redoes a change', () => {
    const original = currentLevel(store().plan).furniture.find((i) => i.id === 'f-sofa')!.position
      .x;

    store().dispatch(moveFurniture('f-sofa', { x: original + 2, y: 2 }));
    expect(currentLevel(store().plan).furniture.find((i) => i.id === 'f-sofa')!.position.x).toBe(
      original + 2,
    );

    expect(store().undo()).toBe('Mover móvel');
    expect(currentLevel(store().plan).furniture.find((i) => i.id === 'f-sofa')!.position.x).toBe(
      original,
    );

    expect(store().redo()).toBe('Mover móvel');
    expect(currentLevel(store().plan).furniture.find((i) => i.id === 'f-sofa')!.position.x).toBe(
      original + 2,
    );
  });

  it('returns null when there is nothing to undo', () => {
    expect(store().undo()).toBeNull();
    expect(store().redo()).toBeNull();
  });

  it('keeps the stats selector in sync with the document', () => {
    expect(selectStats(store()).furniture).toBe(25);

    store().dispatch(addFurniture({ catalogId: 'chair', position: { x: 1, y: 1 } }));
    expect(selectStats(store()).furniture).toBe(26);

    store().dispatch(deleteEntities([{ kind: 'wall', id: 'w-i1' }]));
    expect(selectStats(store()).rooms).toBe(4);
  });

  it('drops the history when a different project is opened', () => {
    store().dispatch(moveFurniture('f-sofa', { x: 2, y: 2 }));
    expect(selectCanUndo(store())).toBe(true);

    store().loadProject(createSampleProject());

    expect(selectCanUndo(store())).toBe(false);
    expect(store().saveState).toBe('saved');
  });

  it('opens an imported project as unsaved when asked', () => {
    store().loadProject(createSampleProject(), { markSaved: false });

    expect(store().saveState).toBe('dirty');
    expect(store().lastSavedAt).toBeNull();
  });

  it('renames the project and marks it dirty', () => {
    store().renameProject('  Casa da Serra  ');

    expect(store().name).toBe('Casa da Serra');
    expect(store().saveState).toBe('dirty');
  });

  it('ignores an empty rename', () => {
    store().renameProject('   ');

    expect(store().name).toBe('Apartamento Aurora');
    expect(store().saveState).toBe('saved');
  });

  it('moves through the save states', () => {
    store().setSaveState('saving');
    expect(store().saveState).toBe('saving');

    store().setSaveState('error', 'sem conexão');
    expect(store().saveError).toBe('sem conexão');

    store().markSaved('2026-02-01T10:00:00.000Z');
    expect(store().saveState).toBe('saved');
    expect(store().saveError).toBeNull();
    expect(store().lastSavedAt).toBe('2026-02-01T10:00:00.000Z');
  });

  it('adopts the id a repository assigned without disturbing the history', () => {
    store().dispatch(moveFurniture('f-sofa', { x: 2, y: 2 }));
    store().setProjectId('clz2k9x0h0000qw3f');

    expect(store().projectId).toBe('clz2k9x0h0000qw3f');
    expect(selectCanUndo(store())).toBe(true);
  });

  it('serializes the document to a project at the current schema version', () => {
    const project = store().toProject();

    expect(project.name).toBe('Apartamento Aurora');
    expect(project.plan.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(project.plan.levels[0]?.rooms).toHaveLength(5);
  });
});
