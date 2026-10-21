import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { EntityRef } from '@spacecraft/shared';
import type { FloorShape3D, Scene3D, WallGroup3D } from './scene3d';
import { resolvePrismGeometries } from './prisms';
import { getGlassMaterial, getSolidMaterial, getSurfaceMaterial } from './materials';
import { getUnitBox } from './geometries';

interface StructureProps {
  scene: Scene3D;
  selection: readonly EntityRef[];
  onSelect: (ref: EntityRef, additive: boolean) => void;
  /** Hides the walls standing between the camera and the interior. */
  cutaway: boolean;
  /** Plan-space centre of the model, used to decide which side is "inside". */
  planCenter: { x: number; y: number };
}

function isSelected(selection: readonly EntityRef[], kind: EntityRef['kind'], id: string): boolean {
  return selection.some((ref) => ref.kind === kind && ref.id === id);
}

/**
 * Floors are `ShapeGeometry` built from the room polygon. The shape is authored with a negated
 * `y` and then rotated `-90°` about X, which lands plan `y` on world `z` with the surface
 * normal pointing up — and, as a bonus, leaves the generated UVs expressed in meters, so a
 * material's `repeat` means "tiles per meter" with no extra bookkeeping.
 */
function Floor({
  floor,
  selected,
  onSelect,
}: {
  floor: FloorShape3D;
  selected: boolean;
  onSelect: (event: ThreeEvent<MouseEvent>) => void;
}): JSX.Element | null {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const [first, ...rest] = floor.points;
    if (!first) return null;

    shape.moveTo(first.x, -first.y);
    for (const point of rest) shape.lineTo(point.x, -point.y);
    shape.closePath();

    return new THREE.ShapeGeometry(shape);
  }, [floor.points]);

  // ShapeGeometry is built here, so it is ours to release when the room changes.
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      material={getSurfaceMaterial(floor.materialId, selected)}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.002, 0]}
      receiveShadow
      onClick={onSelect}
    />
  );
}

function WallAssembly({
  wall,
  selection,
  onSelect,
  register,
  geometries,
}: {
  wall: WallGroup3D;
  selection: readonly EntityRef[];
  onSelect: (ref: EntityRef) => (event: ThreeEvent<MouseEvent>) => void;
  register: (id: string, group: THREE.Group | null) => void;
  geometries: Map<string, THREE.BufferGeometry>;
}): JSX.Element {
  const box = getUnitBox();
  const glassMaterial = getGlassMaterial();
  const wallSelected = isSelected(selection, 'wall', wall.id);

  return (
    <group ref={(instance) => register(wall.id, instance)}>
      {wall.pieces.map((piece) => {
        const geometry = geometries.get(piece.key);
        if (!geometry) return null;

        return (
          <mesh
            key={piece.key}
            geometry={geometry}
            material={getSolidMaterial(piece.materialId, wallSelected)}
            castShadow
            receiveShadow
            onClick={onSelect({ kind: 'wall', id: wall.id })}
          />
        );
      })}

      {wall.frames.map((frame) => (
        <mesh
          key={frame.key}
          geometry={box}
          material={getSolidMaterial(
            frame.materialId,
            isSelected(selection, 'opening', frame.ownerId),
          )}
          position={frame.position}
          rotation={[0, frame.rotationY, 0]}
          scale={frame.size}
          castShadow
          receiveShadow
          onClick={onSelect({ kind: 'opening', id: frame.ownerId })}
        />
      ))}

      {wall.doors.map((door) => (
        // The leaf hangs from its hinge, so it is offset by half its width inside the group.
        <group key={door.key} position={door.position} rotation={[0, door.rotationY, 0]}>
          <mesh
            geometry={box}
            material={getSolidMaterial(
              door.materialId,
              isSelected(selection, 'opening', door.ownerId),
            )}
            position={[door.size[0] / 2, door.size[1] / 2, 0]}
            scale={door.size}
            castShadow
            onClick={onSelect({ kind: 'opening', id: door.ownerId })}
          />
        </group>
      ))}

      {wall.glass.map((pane) => (
        <mesh
          key={pane.key}
          geometry={box}
          material={glassMaterial}
          position={pane.position}
          rotation={[0, pane.rotationY, 0]}
          scale={pane.size}
          onClick={onSelect({ kind: 'opening', id: pane.ownerId })}
        />
      ))}
    </group>
  );
}

export function Structure({
  scene,
  selection,
  onSelect,
  cutaway,
  planCenter,
}: StructureProps): JSX.Element {
  const groups = useRef(new Map<string, THREE.Group>());
  const fillers = useRef(new Map<string, THREE.Mesh>());

  // Prism geometry is keyed by footprint, so an edit only rebuilds the walls it touched.
  const geometries = useMemo(
    () =>
      resolvePrismGeometries([...scene.walls.flatMap((wall) => wall.pieces), ...scene.junctions]),
    [scene],
  );

  const register = (id: string, group: THREE.Group | null): void => {
    if (group) groups.current.set(id, group);
    else groups.current.delete(id);
  };

  /**
   * Cutaway test: a wall is hidden when the camera and the bulk of the plan sit on opposite
   * sides of it, which is exactly the set of walls standing between the viewer and the
   * interior. Looking straight down puts the camera on the same side as the centre for every
   * wall, so the top view keeps the whole shell — no special case needed.
   */
  useFrame(({ camera }) => {
    const hidden = new Set<string>();

    for (const wall of scene.walls) {
      const group = groups.current.get(wall.id);
      if (!group) continue;

      if (!cutaway) {
        group.visible = true;
        continue;
      }

      const toCamera =
        (camera.position.x - wall.center.x) * wall.normal.x +
        (camera.position.z - wall.center.y) * wall.normal.y;
      const toCenter =
        (planCenter.x - wall.center.x) * wall.normal.x +
        (planCenter.y - wall.center.y) * wall.normal.y;

      const opposite = toCamera * toCenter < 0 && Math.abs(toCamera) > 0.2;
      group.visible = !opposite;
      if (opposite) hidden.add(wall.id);
    }

    // A filler only exists to complete the walls around it: once every one of them has been
    // cut away it has nothing to join, and would otherwise stand in the room as a lone post.
    for (const filler of scene.junctions) {
      const mesh = fillers.current.get(filler.key);
      if (!mesh) continue;

      mesh.visible = !cutaway || (filler.joins ?? []).some((wallId) => !hidden.has(wallId));
    }
  });

  const handle =
    (ref: EntityRef) =>
    (event: ThreeEvent<MouseEvent>): void => {
      event.stopPropagation();
      onSelect(ref, event.nativeEvent.shiftKey);
    };

  return (
    <group>
      {scene.floors.map((floor) => (
        <Floor
          key={floor.id}
          floor={floor}
          selected={isSelected(selection, 'room', floor.id)}
          onSelect={handle({ kind: 'room', id: floor.id })}
        />
      ))}

      {scene.walls.map((wall) => (
        <WallAssembly
          key={wall.id}
          wall={wall}
          selection={selection}
          onSelect={handle}
          register={register}
          geometries={geometries}
        />
      ))}

      {scene.junctions.map((filler) => {
        const geometry = geometries.get(filler.key);
        if (!geometry) return null;

        return (
          <mesh
            key={filler.key}
            ref={(instance) => {
              if (instance) fillers.current.set(filler.key, instance);
              else fillers.current.delete(filler.key);
            }}
            geometry={geometry}
            material={getSolidMaterial(filler.materialId, false)}
            castShadow
            receiveShadow
            onClick={handle({ kind: 'wall', id: filler.ownerId })}
          />
        );
      })}
    </group>
  );
}
