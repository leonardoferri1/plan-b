import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  Cloud,
  FolderOpen,
  Keyboard,
  Loader2,
  Redo2,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HintTooltip } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import {
  selectCanRedo,
  selectCanUndo,
  selectRedoLabel,
  selectUndoLabel,
  useProjectStore,
  type SaveState,
} from '@/store/project-store';
import { useEditorStore } from '@/store/editor-store';
import { ExportMenu } from '@/features/export/ExportMenu';

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'Salvo',
  dirty: 'Alterações não salvas',
  saving: 'Salvando…',
  error: 'Erro ao salvar',
};

function SaveIndicator(): JSX.Element {
  const saveState = useProjectStore((state) => state.saveState);
  const saveError = useProjectStore((state) => state.saveError);
  const lastSavedAt = useProjectStore((state) => state.lastSavedAt);

  const Icon =
    saveState === 'saving'
      ? Loader2
      : saveState === 'error'
        ? AlertTriangle
        : saveState === 'dirty'
          ? Cloud
          : Check;

  const time = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <HintTooltip
      side="bottom"
      label={
        saveError ?? (time && saveState === 'saved' ? `Salvo às ${time}` : SAVE_LABELS[saveState])
      }
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'flex h-7 select-none items-center gap-1.5 rounded-md px-2 text-2xs font-medium',
          saveState === 'saved' && 'text-muted-foreground',
          saveState === 'dirty' && 'text-warning',
          saveState === 'saving' && 'text-primary',
          saveState === 'error' && 'text-destructive',
        )}
      >
        <Icon className={cn('size-3.5', saveState === 'saving' && 'animate-spin')} />
        <span className="hidden sm:inline">{SAVE_LABELS[saveState]}</span>
      </div>
    </HintTooltip>
  );
}

function ProjectName(): JSX.Element {
  const name = useProjectStore((state) => state.name);
  const renameProject = useProjectStore((state) => state.renameProject);

  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = (): void => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) renameProject(next);
    else setDraft(name);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="max-w-[16rem] truncate rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-accent"
        title="Renomear projeto"
      >
        {name}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      aria-label="Nome do projeto"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') {
          setDraft(name);
          setEditing(false);
        }
      }}
      className="h-7 max-w-[16rem] rounded-md border border-primary/50 bg-surface-sunken px-2 text-sm font-medium outline-none"
    />
  );
}

export function TopBar(): JSX.Element {
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const canUndo = useProjectStore(selectCanUndo);
  const canRedo = useProjectStore(selectCanRedo);
  const undoLabel = useProjectStore(selectUndoLabel);
  const redoLabel = useProjectStore(selectRedoLabel);
  const setShortcutsOpen = useEditorStore((state) => state.setShortcutsOpen);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface-panel px-3">
      <Link
        to="/"
        className="flex items-center gap-2 rounded-md px-1 py-1 transition-opacity hover:opacity-80"
        aria-label="SpaceCraft — início"
      >
        <Logo className="size-6" />
        <span className="hidden text-sm font-semibold tracking-tight md:inline">SpaceCraft</span>
      </Link>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <ProjectName />
      <SaveIndicator />

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        <HintTooltip
          side="bottom"
          label={undoLabel ? `Desfazer: ${undoLabel}` : 'Desfazer'}
          shortcut="Ctrl+Z"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Desfazer"
            disabled={!canUndo}
            onClick={() => undo()}
          >
            <Undo2 />
          </Button>
        </HintTooltip>

        <HintTooltip
          side="bottom"
          label={redoLabel ? `Refazer: ${redoLabel}` : 'Refazer'}
          shortcut="Ctrl+Shift+Z"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refazer"
            disabled={!canRedo}
            onClick={() => redo()}
          >
            <Redo2 />
          </Button>
        </HintTooltip>
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button variant="ghost" size="sm" asChild>
        <Link to="/projetos">
          <FolderOpen />
          <span className="hidden lg:inline">Projetos</span>
        </Link>
      </Button>

      <ExportMenu />

      <HintTooltip side="bottom" label="Atalhos do teclado" shortcut="?">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Atalhos do teclado"
          onClick={() => setShortcutsOpen(true)}
        >
          <Keyboard />
        </Button>
      </HintTooltip>
    </header>
  );
}
