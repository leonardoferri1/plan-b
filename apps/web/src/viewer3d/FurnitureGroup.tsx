import { memo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { EntityRef } from '@plan-b/shared';
import { getLampMaterial, getSolidMaterial } from './materials';
import { getUnitGeometry } from './geometries';
import type { Furniture3D } from './scene3d';

interface FurnitureGroupProps {
  items: readonly Furniture3D[];
  selection: readonly EntityRef[];
  onSelect: (ref: EntityRef, additive: boolean) => void;
}

const FurnitureItem = memo(function FurnitureItem({
  item,
  selected,
  onSelect,
}: {
  item: Furniture3D;
  selected: boolean;
  onSelect: (event: ThreeEvent<MouseEvent>) => void;
}): JSX.Element {
  return (
    <group
      position={item.position}
      rotation={[0, item.rotationY, 0]}
      onClick={onSelect}
      userData={{ furnitureId: item.id }}
    >
      {item.parts.map((part) => (
        <mesh
          key={part.key}
          geometry={getUnitGeometry(part.shape)}
          material={part.emissive ? getLampMaterial() : getSolidMaterial(part.materialId, selected)}
          position={part.position}
          scale={part.size}
          castShadow={!part.emissive}
          receiveShadow={!part.emissive}
        />
      ))}

      {item.light ? (
        <pointLight
          position={item.light.position}
          intensity={item.light.intensity}
          distance={6}
          decay={2}
          color="#ffd9a0"
        />
      ) : null}

      {selected ? (
        <mesh position={[0, item.bounds.height / 2, 0]} renderOrder={2}>
          <boxGeometry
            args={[item.bounds.width * 1.03, item.bounds.height * 1.03, item.bounds.depth * 1.03]}
          />
          <meshBasicMaterial color="#4d8cff" wireframe transparent opacity={0.55} />
        </mesh>
      ) : null}
    </group>
  );
});

export function FurnitureGroup({ items, selection, onSelect }: FurnitureGroupProps): JSX.Element {
  const selectedIds = new Set(
    selection.filter((ref) => ref.kind === 'furniture').map((ref) => ref.id),
  );

  return (
    <group>
      {items.map((item) => (
        <FurnitureItem
          key={item.id}
          item={item}
          selected={selectedIds.has(item.id)}
          onSelect={(event) => {
            event.stopPropagation();
            onSelect({ kind: 'furniture', id: item.id }, event.nativeEvent.shiftKey);
          }}
        />
      ))}
    </group>
  );
}
