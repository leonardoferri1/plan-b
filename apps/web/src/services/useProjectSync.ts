import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { parseProject, type Project } from '@spacecraft/shared';
import { useEditorStore } from '@/store/editor-store';
import { useProjectStore } from '@/store/project-store';
import {
  createRemoteRepository,
  getRepository,
  localRepository,
  probeBackend,
  setRepository,
  type BackendStatus,
} from './repository';
import { getLastProjectId, setLastProjectId } from './workspace';

export const AUTOSAVE_DELAY_MS = 1200;

/**
 * Probes the API once per session and switches the active repository accordingly.
 *
 * The result is cached forever on purpose: flipping storage back and forth mid-session, with
 * unsaved work in flight, would be far more confusing than committing to one backend and
 * telling the user which one it is.
 */
export function useBackendStatus(): BackendStatus & { resolved: boolean } {
  const query = useQuery({
    queryKey: ['backend-status'],
    queryFn: async () => {
      const status = await probeBackend();
      setRepository(status.available ? createRemoteRepository() : localRepository);
      return status;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  return {
    available: query.data?.available ?? false,
    database: query.data?.database ?? 'unknown',
    resolved: query.isFetched,
  };
}

/**
 * Opens the project the visitor was last working on, or seeds the demo apartment.
 *
 * Runs only after the backend probe has resolved, so a reload with the API up restores the
 * server copy rather than briefly showing a stale local one.
 */
export function useProjectBootstrap(ready: boolean): { loading: boolean } {
  const loadProject = useProjectStore((state) => state.loadProject);
  const [loading, setLoading] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;

    let cancelled = false;

    const open = async (): Promise<void> => {
      const repository = getRepository();
      const lastId = getLastProjectId();

      try {
        if (lastId) {
          const existing = await repository.get(lastId);
          if (existing && !cancelled) {
            loadProject(existing);
            setLoading(false);
            return;
          }
        }

        if (repository.kind === 'remote') {
          const summaries = await repository.list();
          const first = summaries[0];
          if (first) {
            const project = await repository.get(first.id);
            if (project && !cancelled) {
              loadProject(project);
              setLastProjectId(project.id);
              setLoading(false);
              return;
            }
          }
        }

        const demo = await localRepository.ensureDemoProject();
        if (cancelled) return;

        loadProject(demo, { markSaved: repository.kind === 'local' });
        setLastProjectId(repository.kind === 'local' ? demo.id : null);
      } catch (error) {
        if (!cancelled) {
          toast.error('Não foi possível abrir o último projeto.', {
            description: error instanceof Error ? error.message : undefined,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void open();

    return () => {
      // React's strict mode mounts, cleans up and mounts again. Without releasing the guard
      // the second mount would skip the load while the first one's work has already been
      // cancelled, leaving the splash on screen forever.
      cancelled = true;
      started.current = false;
    };
  }, [ready, loadProject]);

  return { loading };
}

/**
 * Debounced autosave.
 *
 * Saving is deferred while a pointer drag is in progress: a drag emits a command per frame,
 * and persisting mid-gesture would both hammer the backend and show a "saving" flicker during
 * a continuous interaction.
 */
export function useAutosave(enabled: boolean): void {
  const revision = useProjectStore((state) => state.revision);
  const saveState = useProjectStore((state) => state.saveState);
  const interacting = useEditorStore((state) => state.interacting);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled || saveState !== 'dirty' || interacting) return;

    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      void save();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };

    async function save(): Promise<void> {
      // A command that lands mid-save re-marks the document dirty; retrying rather than
      // dropping the attempt is what keeps it from sitting dirty forever.
      if (inFlight.current) {
        timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
        return;
      }
      inFlight.current = true;

      const store = useProjectStore.getState();
      store.setSaveState('saving');

      try {
        const repository = getRepository();
        const project = store.toProject();

        const saved = await persist(repository.kind === 'remote', project, store.projectId);

        // The server assigns its own id on first write; adopt it so later saves update rather
        // than creating a new project on every keystroke.
        if (saved.id !== store.projectId) {
          useProjectStore.getState().setProjectId(saved.id);
        }

        setLastProjectId(saved.id);
        useProjectStore.getState().markSaved(saved.updatedAt);
      } catch (error) {
        useProjectStore
          .getState()
          .setSaveState('error', error instanceof Error ? error.message : 'Falha ao salvar.');
      } finally {
        inFlight.current = false;
      }
    }
  }, [enabled, revision, saveState, interacting]);
}

async function persist(remote: boolean, project: Project, id: string): Promise<Project> {
  const repository = getRepository();

  if (!remote) {
    return repository.update(id, { name: project.name, project });
  }

  // A server id is a cuid; anything else means this project has never been written remotely.
  const looksRemote = /^c[a-z0-9]{20,}$/i.test(id);

  if (!looksRemote) {
    return repository.create(project);
  }

  try {
    return await repository.update(id, { name: project.name, project });
  } catch {
    // The row was deleted elsewhere; recreate it rather than losing the session's work.
    return repository.create(project);
  }
}

/** Saves immediately, bypassing the debounce. Used by explicit "save" actions. */
export async function saveNow(): Promise<void> {
  const store = useProjectStore.getState();
  if (store.saveState === 'saving') return;

  store.setSaveState('saving');

  try {
    const repository = getRepository();
    const project = store.toProject();
    const saved = await persist(repository.kind === 'remote', project, store.projectId);

    if (saved.id !== store.projectId) useProjectStore.getState().setProjectId(saved.id);
    setLastProjectId(saved.id);
    useProjectStore.getState().markSaved(saved.updatedAt);
  } catch (error) {
    useProjectStore
      .getState()
      .setSaveState('error', error instanceof Error ? error.message : 'Falha ao salvar.');
    throw error;
  }
}

/** Opens a project by id, used by the library page and by deep links. */
export async function openProject(id: string): Promise<boolean> {
  const project = await getRepository().get(id);
  if (!project) return false;

  useProjectStore.getState().loadProject(project);
  setLastProjectId(project.id);
  return true;
}

/** Replaces the open document with an imported one and persists it under a new id. */
export async function adoptImportedProject(payload: unknown): Promise<Project> {
  const parsed = parseProject(payload);
  if (!parsed.project) {
    throw new Error(parsed.errors.slice(0, 3).join('\n') || 'Arquivo inválido.');
  }

  const repository = getRepository();
  const created = await repository.create({
    ...parsed.project,
    id: `pr_${Math.random().toString(36).slice(2, 10)}`,
  });

  useProjectStore.getState().loadProject(created);
  setLastProjectId(created.id);
  return created;
}
