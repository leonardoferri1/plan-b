import { Box, Columns2, Eye, Grid2x2, Maximize, Minus, Plus, Scissors, Square } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { currentLevel, levelBounds } from '@plan-b/shared';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { HintTooltip } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useEditorStore, type CameraPreset, type ViewMode } from '@/store/editor-store';
import { useProjectStore } from '@/store/project-store';
import { fitBounds } from '@/canvas2d/viewport';
import { cn } from '@/lib/utils';

const VIEW_MODES: { id: ViewMode; label: string; shortcut: string; icon: LucideIcon }[] = [
  { id: '2d', label: 'Planta', shortcut: '1', icon: Square },
  { id: '3d', label: '3D', shortcut: '2', icon: Box },
  { id: 'split', label: 'Dividido', shortcut: '3', icon: Columns2 },
];

const CAMERA_PRESETS: { id: CameraPreset; label: string; icon: LucideIcon }[] = [
  { id: 'perspective', label: 'Perspectiva', icon: Eye },
  { id: 'isometric', label: 'Isométrica', icon: Box },
  { id: 'top', label: 'Superior', icon: Grid2x2 },
];

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
  const viewMode = useEditorStore((state) => state.viewMode);
  const setViewMode = useEditorStore((state) => state.setViewMode);
  const cameraPreset = useEditorStore((state) => state.cameraPreset);
  const setCameraPreset = useEditorStore((state) => state.setCameraPreset);
  const wallCutaway = useEditorStore((state) => state.wallCutaway);
  const toggleWallCutaway = useEditorStore((state) => state.toggleWallCutaway);
  const zoomBy = useEditorStore((state) => state.zoomBy);
  const zoom = useEditorStore((state) => state.viewport.zoom);
  const fit = useFitToPlan();

  const showsPlan = viewMode !== '3d';
  const shows3D = viewMode !== '2d';

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(value) => {
          if (value) setViewMode(value as ViewMode);
        }}
        aria-label="Modo de visualização"
      >
        {VIEW_MODES.map((mode) => {
          const Icon = mode.icon;
          return (
            <HintTooltip key={mode.id} side="top" label={mode.label} shortcut={mode.shortcut}>
              <ToggleGroupItem value={mode.id} aria-label={mode.label}>
                <Icon />
                <span className="hidden xl:inline">{mode.label}</span>
              </ToggleGroupItem>
            </HintTooltip>
          );
        })}
      </ToggleGroup>

      {shows3D ? (
        <ToggleGroup
          type="single"
          value={cameraPreset}
          onValueChange={(value) => {
            if (value) setCameraPreset(value as CameraPreset);
          }}
          aria-label="Câmera"
        >
          {CAMERA_PRESETS.map((preset) => {
            const Icon = preset.icon;
            return (
              <HintTooltip key={preset.id} side="top" label={preset.label}>
                <ToggleGroupItem value={preset.id} aria-label={preset.label}>
                  <Icon />
                </ToggleGroupItem>
              </HintTooltip>
            );
          })}
        </ToggleGroup>
      ) : null}

      {shows3D ? (
        <HintTooltip
          side="top"
          label={wallCutaway ? 'Mostrar todas as paredes' : 'Cortar paredes da frente'}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cortar paredes da frente"
            aria-pressed={wallCutaway}
            onClick={toggleWallCutaway}
            className={cn(
              'size-9 rounded-lg border border-border bg-surface-panel/90 backdrop-blur',
              wallCutaway && 'text-primary',
            )}
          >
            <Scissors />
          </Button>
        </HintTooltip>
      ) : null}

      {showsPlan ? (
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-panel/90 p-1 backdrop-blur">
          <HintTooltip side="top" label="Afastar">
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

          <span className="tabular w-14 text-center text-2xs text-muted-foreground">
            {Math.round(zoom)} px/m
          </span>

          <HintTooltip side="top" label="Aproximar">
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
      ) : null}
    </div>
  );
}
