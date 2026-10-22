import { MATERIAL_PRESETS, formatArea, formatMeters } from '@plan-b/shared';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { setPlanSettings } from '@/editor/commands';
import { selectStats, useProjectStore } from '@/store/project-store';
import { FieldRow, InspectorHeader, Section } from '../Section';
import { NumberField } from '../NumberField';
import { MaterialPicker } from '../MaterialPicker';

const GRID_OPTIONS = [
  { value: '0.1', label: '10 cm' },
  { value: '0.25', label: '25 cm' },
  { value: '0.5', label: '50 cm' },
  { value: '1', label: '1 m' },
];

const WALL_MATERIALS = MATERIAL_PRESETS.filter((material) =>
  ['pintura', 'pedra', 'madeira'].includes(material.category),
);

/** Shown when nothing is selected: the document itself is the object being inspected. */
export function PlanPanel(): JSX.Element {
  const dispatch = useProjectStore((state) => state.dispatch);
  const settings = useProjectStore((state) => state.plan.settings);
  const stats = useProjectStore(selectStats);
  const name = useProjectStore((state) => state.name);

  return (
    <>
      <InspectorHeader eyebrow="Projeto" title={name} />

      <Section title="Resumo">
        <dl className="grid grid-cols-2 gap-2">
          {[
            { label: 'Ambientes', value: String(stats.rooms) },
            { label: 'Área total', value: formatArea(stats.floorArea) },
            { label: 'Paredes', value: formatMeters(stats.wallLength) },
            { label: 'Móveis', value: String(stats.furniture) },
          ].map((entry) => (
            <div key={entry.label} className="rounded-md bg-surface-raised px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {entry.label}
              </dt>
              <dd className="tabular text-sm font-medium">{entry.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Grade e encaixe">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="snap-toggle" className="normal-case tracking-normal text-foreground/90">
              Encaixar na grade
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Desligue para posicionar livremente.
            </p>
          </div>
          <Switch
            id="snap-toggle"
            checked={settings.snapEnabled}
            onCheckedChange={(checked) => dispatch(setPlanSettings({ snapEnabled: checked }))}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="grid-size">Módulo da grade</Label>
          <Select
            value={String(settings.gridSize)}
            onValueChange={(value) => dispatch(setPlanSettings({ gridSize: Number(value) }))}
          >
            <SelectTrigger id="grid-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRID_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title="Padrões de parede">
        <FieldRow>
          <NumberField
            label="Espessura"
            unit="cm"
            value={settings.defaultWallThickness}
            displayFactor={100}
            step={1}
            min={0.05}
            max={0.6}
            onChange={(value) => dispatch(setPlanSettings({ defaultWallThickness: value }))}
          />
          <NumberField
            label="Pé-direito"
            unit="cm"
            value={settings.defaultWallHeight}
            displayFactor={100}
            step={5}
            min={1.8}
            max={6}
            onChange={(value) => dispatch(setPlanSettings({ defaultWallHeight: value }))}
          />
        </FieldRow>

        <MaterialPicker
          label="Acabamento padrão"
          value={settings.wallMaterialId}
          options={WALL_MATERIALS}
          onChange={(wallMaterialId) => dispatch(setPlanSettings({ wallMaterialId }))}
        />
      </Section>

      <Section>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Selecione uma parede, um ambiente, uma abertura ou um móvel na planta para editar suas
          propriedades aqui.
        </p>
      </Section>
    </>
  );
}
