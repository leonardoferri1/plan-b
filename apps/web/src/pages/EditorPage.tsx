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

export function EditorPage(): JSX.Element {
  useEditorShortcuts();
  const fit = useFitToPlan();

  // Frame the demo apartment once the canvas knows its size.
  useEffect(() => {
    const id = window.setTimeout(fit, 60);
    return () => window.clearTimeout(id);
    // Intentionally runs once: later changes should not yank the user's viewport around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
