import { Copy, Lock, Trash2, Unlock } from 'lucide-react';
import { formatArea, getCatalogItem, type FurnitureItem } from '@spacecraft/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FurniturePreview } from '@/components/FurniturePreview';
import {
  deleteEntities,
  duplicateFurniture,
  moveFurniture,
  resizeFurniture,
  rotateFurniture,
  setFurnitureProperties,
} from '@/editor/commands';
import { useProjectStore } from '@/store/project-store';
import { useEditorStore } from '@/store/editor-store';
import { FieldRow, InspectorHeader, Section } from '../Section';
import { NumberField } from '../NumberField';
import { MaterialPicker } from '../MaterialPicker';

export function FurniturePanel({ item }: { item: FurnitureItem }): JSX.Element {
  const dispatch = useProjectStore((state) => state.dispatch);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const catalog = getCatalogItem(item.catalogId);

  const footprint = item.size.width * item.size.depth;

  return (
    <>
      <InspectorHeader eyebrow="Móvel" title={item.name}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={item.locked ? 'Desbloquear' : 'Bloquear'}
          onClick={() => dispatch(setFurnitureProperties(item.id, { locked: !item.locked }))}
        >
          {item.locked ? <Lock className="text-warning" /> : <Unlock />}
        </Button>
      </InspectorHeader>

      <Section>
        <div className="flex gap-3">
          <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-gradient-to-b from-surface-sunken to-surface-panel p-1.5">
            <FurniturePreview
              catalogId={item.catalogId}
              materialId={item.materialId}
              size={item.size}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="furniture-name">Nome</Label>
            <Input
              id="furniture-name"
              value={item.name}
              onChange={(event) =>
                dispatch(setFurnitureProperties(item.id, { name: event.target.value }))
              }
            />
            <p className="tabular pt-0.5 text-[10px] text-muted-foreground">
              {catalog?.category ? `${catalog.name} · ` : ''}
              {formatArea(footprint)} de projeção
            </p>
          </div>
        </div>
      </Section>

      <Section title="Dimensões">
        <FieldRow>
          <NumberField
            label="Largura"
            unit="cm"
            value={item.size.width}
            displayFactor={100}
            step={5}
            disabled={item.locked || !catalog?.resizable}
            min={catalog?.minSize.width}
            max={catalog?.maxSize.width}
            onChange={(value) => dispatch(resizeFurniture(item.id, { width: value }))}
          />
          <NumberField
            label="Profundidade"
            unit="cm"
            value={item.size.depth}
            displayFactor={100}
            step={5}
            disabled={item.locked || !catalog?.resizable}
            min={catalog?.minSize.depth}
            max={catalog?.maxSize.depth}
            onChange={(value) => dispatch(resizeFurniture(item.id, { depth: value }))}
          />
        </FieldRow>
        <FieldRow>
          <NumberField
            label="Altura"
            unit="cm"
            value={item.size.height}
            displayFactor={100}
            step={5}
            disabled={item.locked || !catalog?.resizable}
            min={catalog?.minSize.height}
            max={catalog?.maxSize.height}
            onChange={(value) => dispatch(resizeFurniture(item.id, { height: value }))}
          />
          <NumberField
            label="Elevação"
            unit="cm"
            value={item.elevation}
            displayFactor={100}
            step={5}
            min={0}
            max={3}
            disabled={item.locked}
            onChange={(value) => dispatch(setFurnitureProperties(item.id, { elevation: value }))}
          />
        </FieldRow>
      </Section>

      <Section title="Posição">
        <FieldRow>
          <NumberField
            label="X"
            unit="m"
            decimals={2}
            step={0.1}
            value={item.position.x}
            disabled={item.locked}
            onChange={(value) => dispatch(moveFurniture(item.id, { ...item.position, x: value }))}
          />
          <NumberField
            label="Y"
            unit="m"
            decimals={2}
            step={0.1}
            value={item.position.y}
            disabled={item.locked}
            onChange={(value) => dispatch(moveFurniture(item.id, { ...item.position, y: value }))}
          />
        </FieldRow>
        <NumberField
          label="Rotação"
          unit="°"
          value={item.rotation}
          displayFactor={180 / Math.PI}
          step={15}
          disabled={item.locked}
          onChange={(value) => dispatch(rotateFurniture(item.id, value))}
        />
      </Section>

      <Section title="Acabamento">
        <MaterialPicker
          value={item.materialId}
          onChange={(materialId) => dispatch(setFurnitureProperties(item.id, { materialId }))}
        />
      </Section>

      <Section>
        <div className="flex gap-2">
          <Button
            variant="subtle"
            size="sm"
            className="flex-1"
            onClick={() => dispatch(duplicateFurniture(item.id))}
          >
            <Copy />
            Duplicar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              dispatch(deleteEntities([{ kind: 'furniture', id: item.id }]));
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
