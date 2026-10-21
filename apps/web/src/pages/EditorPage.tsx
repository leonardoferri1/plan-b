import { useEffect } from 'react';
import { CatalogPanel } from '@/features/catalog/CatalogPanel';
import { Inspector } from '@/features/inspector/Inspector';
import { ShortcutsDialog } from '@/features/shell/ShortcutsDialog';
import { StatusBar } from '@/features/shell/StatusBar';
import { Toolbar } from '@/features/shell/Toolbar';
import { TopBar } from '@/features/shell/TopBar';
import { ViewControls, useFitToPlan } from '@/features/shell/ViewControls';
import { Viewport } from '@/features/shell/Viewport';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { useAutosave, useBackendStatus, useProjectBootstrap } from '@/services/useProjectSync';
import { Logo } from '@/components/Logo';

function BootSplash(): JSX.Element {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-surface-base">
      <div className="bg-grid absolute inset-0 opacity-40" aria-hidden="true" />
      <Logo className="relative size-12 animate-pulse" />
      <div className="relative space-y-1 text-center">
        <p className="text-sm font-medium">Preparando o estúdio…</p>
        <p className="text-xs text-muted-foreground">Carregando seu último projeto.</p>
      </div>
    </div>
  );
}

export function EditorPage(): JSX.Element {
  useEditorShortcuts();

  const backend = useBackendStatus();
  const { loading } = useProjectBootstrap(backend.resolved);
  useAutosave(!loading);

  const fit = useFitToPlan();

  // Frame the plan once the document is open and the canvas knows its size.
  useEffect(() => {
    if (loading) return;
    const id = window.setTimeout(fit, 80);
    return () => window.clearTimeout(id);
    // Deliberately keyed on `loading` only: later edits must not yank the viewport around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (loading) return <BootSplash />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface-base text-foreground">
      <TopBar />

      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <CatalogPanel />

        <main className="relative min-w-0 flex-1 bg-surface-sunken">
          <Viewport />

          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <ViewControls />
          </div>
        </main>

        <Inspector />
      </div>

      <StatusBar />
      <ShortcutsDialog />
    </div>
  );
}
