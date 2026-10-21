import { Trash2 } from 'lucide-react';
import {
  MATERIAL_PRESETS,
  buildNodeMap,
  currentLevel,
  formatMeters,
  openingsOfWall,
  wallLength,
  type Wall,
} from '@spacecraft/shared';
import { Button } from '@/components/ui/button';
import { deleteEntities, setWallProperties } from '@/editor/commands';
import { useProjectStore } from '@/store/project-store';
import { useEditorStore } from '@/store/editor-store';
import { FieldRow, InspectorHeader, Section } from '../Section';
import { NumberField } from '../NumberField';
import { MaterialPicker } from '../MaterialPicker';

const SURFACE_MATERIALS = MATERIAL_PRESETS.filter((material) =>
  ['pintura', 'madeira', 'pedra', 'metal'].includes(material.category),
);

export function WallPanel({ wall }: { wall: Wall }): JSX.Element {
  const dispatch = useProjectStore((state) => state.dispatch);
  const plan = useProjectStore((state) => state.plan);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const select = useEditorStore((state) => state.select);

  const level = currentLevel(plan);
  const length = wallLength(wall, buildNodeMap(level.nodes));
  const openings = openingsOfWall(wall.id, level.openings);

  return (
    <>
      <InspectorHeader eyebrow="Parede" title={formatMeters(length)} />

      <Section title="Seção">
        <FieldRow>
          <NumberField
            label="Espessura"
            unit="cm"
            value={wall.thickness}
            displayFactor={100}
            step={1}
            min={0.05}
            max={0.6}
            onChange={(value) => dispatch(setWallProperties(wall.id, { thickness: value }))}
          />
          <NumberField
            label="Altura"
            unit="cm"
            value={wall.height}
            displayFactor={100}
            step={5}
            min={1.8}
            max={6}
            onChange={(value) => dispatch(setWallProperties(wall.id, { height: value }))}
          />
        </FieldRow>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          O comprimento é definido pelos cantos. Selecione a parede e arraste um canto na planta
          para alterá-lo.
        </p>
      </Section>

      <Section title="Acabamento">
        <MaterialPicker
          value={wall.materialId}
          options={SURFACE_MATERIALS}
          onChange={(materialId) => dispatch(setWallProperties(wall.id, { materialId }))}
        />
      </Section>

      <Section title={`Aberturas (${openings.length})`}>
        {openings.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Use as ferramentas de porta ou janela para encaixar aberturas nesta parede.
          </p>
        ) : (
          <ul className="space-y-1">
            {openings.map((opening) => (
              <li key={opening.id}>
                <button
                  type="button"
                  onClick={() => select({ kind: 'opening', id: opening.id })}
                  className="flex w-full items-center justify-between rounded-md bg-surface-raised px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-accent"
                >
                  <span>{opening.kind === 'door' ? 'Porta' : 'Janela'}</span>
                  <span className="tabular text-muted-foreground">
                    {formatMeters(opening.width)} · {formatMeters(opening.offset)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            dispatch(deleteEntities([{ kind: 'wall', id: wall.id }]));
            clearSelection();
          }}
        >
          <Trash2 />
          Excluir parede
        </Button>
      </Section>
    </>
  );
}
