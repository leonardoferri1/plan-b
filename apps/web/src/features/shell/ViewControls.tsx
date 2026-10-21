import { Maximize, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HintTooltip } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useEditorStore } from '@/store/editor-store';
import { useProjectStore } from '@/store/project-store';
import { currentLevel, levelBounds } from '@spacecraft/shared';
import { fitBounds } from '@/canvas2d/viewport';

/** Recenters the plan on everything that is drawn. */
export function useFitToPlan(): () => void {
  const plan = useProjectStore((state) => state.plan);
  const setViewport = useEditorStore((state) => state.setViewport);

  return () => {
    const bounds = levelBounds(currentLevel(plan));
    const canvas = document.querySelector<HTMLElement>('[data-plan-canvas]');
    const width = canvas?.clientWidth ?? 1000;
    const height = canvas?.clientHeight ?? 700;
    setViewport(fitBounds(bounds, width, height, 72));
  };
}

export function ViewControls(): JSX.Element {
  const zoomBy = useEditorStore((state) => state.zoomBy);
  const zoom = useEditorStore((state) => state.viewport.zoom);
  const fit = useFitToPlan();

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-panel/90 p-1 backdrop-blur">
        <HintTooltip side="top" label="Afastar" shortcut="Ctrl+-">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            aria-label="Afastar"
            onClick={() => zoomBy(1 / 1.25)}
          >
            <Minus />
          </Button>
        </HintTooltip>

        <span className="tabular w-12 text-center text-2xs text-muted-foreground">
          {Math.round(zoom)} px/m
        </span>

        <HintTooltip side="top" label="Aproximar" shortcut="Ctrl++">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            aria-label="Aproximar"
            onClick={() => zoomBy(1.25)}
          >
            <Plus />
          </Button>
        </HintTooltip>

        <Separator orientation="vertical" className="mx-0.5 h-4" />

        <HintTooltip side="top" label="Enquadrar planta" shortcut="Shift+F">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            aria-label="Enquadrar planta"
            onClick={fit}
          >
            <Maximize />
          </Button>
        </HintTooltip>
      </div>
    </div>
  );
}
