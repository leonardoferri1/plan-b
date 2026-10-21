import { FlipHorizontal, Trash2 } from 'lucide-react';
import {
  buildNodeMap,
  currentLevel,
  formatMeters,
  wallLength,
  type Opening,
} from '@spacecraft/shared';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { deleteEntities, moveOpening, setOpeningProperties } from '@/editor/commands';
import { useProjectStore } from '@/store/project-store';
import { useEditorStore } from '@/store/editor-store';
import { FieldRow, InspectorHeader, Section } from '../Section';
import { NumberField } from '../NumberField';

export function OpeningPanel({ opening }: { opening: Opening }): JSX.Element {
  const dispatch = useProjectStore((state) => state.dispatch);
  const plan = useProjectStore((state) => state.plan);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const select = useEditorStore((state) => state.select);

  const level = currentLevel(plan);
  const wall = level.walls.find((candidate) => candidate.id === opening.wallId);
  const span = wall ? wallLength(wall, buildNodeMap(level.nodes)) : 0;

  const isDoor = opening.kind === 'door';

  return (
    <>
      <InspectorHeader eyebrow={isDoor ? 'Porta' : 'Janela'} title={formatMeters(opening.width)} />

      <Section>
        <Tabs
          value={opening.kind}
          onValueChange={(value) =>
            dispatch(
              setOpeningProperties(opening.id, {
                kind: value as Opening['kind'],
                sillHeight: value === 'door' ? 0 : Math.max(0.9, opening.sillHeight),
                height: value === 'door' ? 2.1 : Math.min(opening.height, 1.5),
              }),
            )
          }
        >
          <TabsList>
            <TabsTrigger value="door">Porta</TabsTrigger>
            <TabsTrigger value="window">Janela</TabsTrigger>
          </TabsList>
        </Tabs>
      </Section>

      <Section title="Dimensões">
        <FieldRow>
          <NumberField
            label="Largura"
            unit="cm"
            value={opening.width}
            displayFactor={100}
            step={5}
            min={0.4}
            max={Math.max(0.4, span - 0.1)}
            onChange={(value) => dispatch(setOpeningProperties(opening.id, { width: value }))}
          />
          <NumberField
            label="Altura"
            unit="cm"
            value={opening.height}
            displayFactor={100}
            step={5}
            min={0.3}
            max={wall?.height ?? 2.7}
            onChange={(value) => dispatch(setOpeningProperties(opening.id, { height: value }))}
          />
        </FieldRow>
        <FieldRow>
          <NumberField
            label="Peitoril"
            unit="cm"
            value={opening.sillHeight}
            displayFactor={100}
            step={5}
            min={0}
            max={(wall?.height ?? 2.7) - 0.3}
            disabled={isDoor}
            onChange={(value) => dispatch(setOpeningProperties(opening.id, { sillHeight: value }))}
          />
          <NumberField
            label="Posição"
            unit="cm"
            value={opening.offset}
            displayFactor={100}
            step={5}
            min={0}
            max={span}
            onChange={(value) => dispatch(moveOpening(opening.id, value))}
          />
        </FieldRow>
        <p className="tabular text-[10px] text-muted-foreground">
          Vão de {formatMeters(span)} · medida a partir do primeiro canto da parede.
        </p>
      </Section>

      <Section>
        <div className="flex flex-col gap-2">
          {isDoor ? (
            <Button
              variant="subtle"
              size="sm"
              onClick={() =>
                dispatch(setOpeningProperties(opening.id, { flipped: !opening.flipped }))
              }
            >
              <FlipHorizontal />
              Inverter abertura
            </Button>
          ) : null}

          {wall ? (
            <Button variant="ghost" size="sm" onClick={() => select({ kind: 'wall', id: wall.id })}>
              Selecionar parede
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              dispatch(deleteEntities([{ kind: 'opening', id: opening.id }]));
              clearSelection();
            }}
          >
            <Trash2 />
            Excluir
          </Button>
        </div>
      </Section>
    </>
  );
}
