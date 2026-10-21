import {
  MATERIAL_PRESETS,
  currentLevel,
  formatArea,
  formatMeters,
  roomArea,
  type Room,
} from '@spacecraft/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setRoomProperties } from '@/editor/commands';
import { useProjectStore } from '@/store/project-store';
import { InspectorHeader, Section } from '../Section';
import { MaterialPicker } from '../MaterialPicker';

const FLOOR_MATERIALS = MATERIAL_PRESETS.filter((material) =>
  ['madeira', 'pedra', 'pintura'].includes(material.category),
);

export function RoomPanel({ room }: { room: Room }): JSX.Element {
  const dispatch = useProjectStore((state) => state.dispatch);
  const plan = useProjectStore((state) => state.plan);
  const level = currentLevel(plan);

  const area = roomArea(room, level);
  const perimeter = room.nodeIds.reduce((sum, id, index) => {
    const current = level.nodes.find((node) => node.id === id);
    const next = level.nodes.find(
      (node) => node.id === room.nodeIds[(index + 1) % room.nodeIds.length],
    );
    if (!current || !next) return sum;
    return sum + Math.hypot(next.x - current.x, next.y - current.y);
  }, 0);

  return (
    <>
      <InspectorHeader eyebrow="Ambiente" title={room.name} />

      <Section>
        <div className="space-y-1">
          <Label htmlFor="room-name">Nome</Label>
          <Input
            id="room-name"
            value={room.name}
            onChange={(event) => dispatch(setRoomProperties(room.id, { name: event.target.value }))}
          />
        </div>

        <dl className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-md bg-surface-raised px-2.5 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Área</dt>
            <dd className="tabular text-sm font-medium">{formatArea(area)}</dd>
          </div>
          <div className="rounded-md bg-surface-raised px-2.5 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Perímetro</dt>
            <dd className="tabular text-sm font-medium">{formatMeters(perimeter)}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Piso">
        <MaterialPicker
          label="Revestimento"
          value={room.floorMaterialId}
          options={FLOOR_MATERIALS}
          onChange={(floorMaterialId) => dispatch(setRoomProperties(room.id, { floorMaterialId }))}
        />
      </Section>

      <Section>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Ambientes são detectados automaticamente a partir dos ciclos fechados de paredes. Ao
          remover uma divisória, os ambientes vizinhos se fundem — o nome do maior é preservado.
        </p>
      </Section>
    </>
  );
}
