import { ChevronRight, PanelRightOpen, Trash2 } from 'lucide-react';
import { currentLevel } from '@spacecraft/shared';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HintTooltip } from '@/components/ui/tooltip';
import { deleteEntities } from '@/editor/commands';
import { useEditorStore } from '@/store/editor-store';
import { useProjectStore } from '@/store/project-store';
import { InspectorHeader, Section } from './Section';
import { FurniturePanel } from './panels/FurniturePanel';
import { OpeningPanel } from './panels/OpeningPanel';
import { PlanPanel } from './panels/PlanPanel';
import { RoomPanel } from './panels/RoomPanel';
import { WallPanel } from './panels/WallPanel';

const KIND_LABELS: Record<string, string> = {
  wall: 'parede',
  room: 'ambiente',
  opening: 'abertura',
  furniture: 'móvel',
  node: 'canto',
};

function MultiSelectionPanel(): JSX.Element {
  const selection = useEditorStore((state) => state.selection);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const dispatch = useProjectStore((state) => state.dispatch);

  const counts = selection.reduce<Record<string, number>>((acc, ref) => {
    acc[ref.kind] = (acc[ref.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <InspectorHeader eyebrow="Seleção" title={`${selection.length} objetos`} />
      <Section>
        <ul className="space-y-1 text-[11px] text-muted-foreground">
          {Object.entries(counts).map(([kind, count]) => (
            <li key={kind} className="flex justify-between">
              <span>{KIND_LABELS[kind] ?? kind}</span>
              <span className="tabular text-foreground/80">{count}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            dispatch(deleteEntities(selection));
            clearSelection();
          }}
        >
          <Trash2 />
          Excluir seleção
        </Button>
      </Section>
    </>
  );
}

function SelectionPanel(): JSX.Element {
  const selection = useEditorStore((state) => state.selection);
  const plan = useProjectStore((state) => state.plan);
  const level = currentLevel(plan);

  if (selection.length === 0) return <PlanPanel />;
  if (selection.length > 1) return <MultiSelectionPanel />;

  const ref = selection[0]!;

  if (ref.kind === 'furniture') {
    const item = level.furniture.find((candidate) => candidate.id === ref.id);
    if (item) return <FurniturePanel item={item} />;
  }

  if (ref.kind === 'wall') {
    const wall = level.walls.find((candidate) => candidate.id === ref.id);
    if (wall) return <WallPanel wall={wall} />;
  }

  if (ref.kind === 'opening') {
    const opening = level.openings.find((candidate) => candidate.id === ref.id);
    if (opening) return <OpeningPanel opening={opening} />;
  }

  if (ref.kind === 'room') {
    const room = level.rooms.find((candidate) => candidate.id === ref.id);
    if (room) return <RoomPanel room={room} />;
  }

  if (ref.kind === 'node') {
    const node = level.nodes.find((candidate) => candidate.id === ref.id);
    if (node) {
      return (
        <>
          <InspectorHeader eyebrow="Canto" title={`${node.x.toFixed(2)} · ${node.y.toFixed(2)}`} />
          <Section>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Arraste o canto na planta para reposicionar todas as paredes conectadas a ele.
            </p>
          </Section>
        </>
      );
    }
  }

  // The selected entity disappeared (undo, deletion from elsewhere).
  return <PlanPanel />;
}

export function Inspector(): JSX.Element {
  const open = useEditorStore((state) => state.inspectorOpen);
  const setOpen = useEditorStore((state) => state.setInspectorOpen);

  if (!open) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-l border-border bg-surface-panel py-3">
        <HintTooltip side="left" label="Abrir propriedades">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Abrir propriedades"
            onClick={() => setOpen(true)}
          >
            <PanelRightOpen />
          </Button>
        </HintTooltip>
      </div>
    );
  }

  return (
    <aside
      aria-label="Propriedades"
      className="flex w-[19rem] shrink-0 flex-col border-l border-border bg-surface-panel"
    >
      <div className="flex h-11 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Propriedades
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Recolher propriedades"
          onClick={() => setOpen(false)}
        >
          <ChevronRight />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <SelectionPanel />
      </ScrollArea>
    </aside>
  );
}
