import { formatArea, formatMeters } from '@plan-b/shared';
import { useProjectStore, selectStats } from '@/store/project-store';
import { useEditorStore } from '@/store/editor-store';
import { TOOLS } from './Toolbar';

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="tabular font-medium text-foreground/80">{value}</span>
    </span>
  );
}

/**
 * A single line of context under the canvas: what the active tool expects next, and the live
 * totals of the plan. It replaces the modal "how do I use this" copy a first-time visitor
 * would otherwise need.
 */
export function StatusBar(): JSX.Element {
  const stats = useProjectStore(selectStats);
  const tool = useEditorStore((state) => state.tool);
  const measurement = useEditorStore((state) => state.measurement);
  const snapEnabled = useProjectStore((state) => state.plan.settings.snapEnabled);
  const gridSize = useProjectStore((state) => state.plan.settings.gridSize);

  const definition = TOOLS.find((candidate) => candidate.id === tool);

  const measured = measurement
    ? Math.hypot(measurement.to.x - measurement.from.x, measurement.to.y - measurement.from.y)
    : null;

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-surface-panel px-3 text-2xs text-muted-foreground">
      <span className="truncate">{definition?.hint}</span>

      <div className="flex-1" />

      {measured !== null ? <Stat label="Medida" value={formatMeters(measured)} /> : null}

      <Stat label="Ambientes" value={String(stats.rooms)} />
      <Stat label="Área" value={formatArea(stats.floorArea)} />
      <Stat label="Paredes" value={formatMeters(stats.wallLength)} />
      <Stat label="Móveis" value={String(stats.furniture)} />
      <Stat
        label="Grade"
        value={snapEnabled ? `${gridSize.toFixed(2).replace('.', ',')} m` : 'livre'}
      />
    </footer>
  );
}
