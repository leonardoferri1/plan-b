import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Grid, TransformControls } from '@react-three/drei';
import { currentLevel, levelBounds, type EntityRef } from '@spacecraft/shared';
import { moveFurniture } from '@/editor/commands';
import { useEditorStore } from '@/store/editor-store';
import { useProjectStore } from '@/store/project-store';
import { cn } from '@/lib/utils';
import { CameraRig } from './CameraRig';
import { FurnitureGroup } from './FurnitureGroup';
import { Lighting } from './Lighting';
import { Structure } from './Structure';
import { buildScene3D, type Furniture3D } from './scene3d';
import { disposeMaterialCaches } from './materials';
import { disposeUnitGeometries } from './geometries';
import { clearCaptureTarget, isCaptureTarget, registerCaptureTarget } from './capture';

/** Feature-detects WebGL once; the result cannot change during a session. */
function detectWebGL(): boolean {
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

function WebGLUnavailable(): JSX.Element {
  return (
    <div className="flex size-full items-center justify-center bg-surface-sunken p-8">
      <div className="max-w-sm space-y-2 text-center">
        <h3 className="text-sm font-semibold">Visualização 3D indisponível</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Este navegador não expõe WebGL, então a cena 3D não pode ser renderizada. A planta 2D
          continua totalmente funcional — todo o projeto permanece editável e pode ser exportado
          normalmente.
        </p>
      </div>
    </div>
  );
}

/**
 * Drag gizmo for the selected item.
 *
 * It manipulates a dedicated proxy object rather than the furniture group itself: the group is
 * rebuilt by React whenever the document changes, and attaching a gizmo to an object that may
 * be replaced mid-drag is how transform controls end up detached or snapping back.
 */
function FurnitureGizmo({ item }: { item: Furniture3D }): JSX.Element {
  const proxy = useRef<THREE.Group>(null);
  const dragging = useRef(false);
  const dispatch = useProjectStore((state) => state.dispatch);
  const setInteracting = useEditorStore((state) => state.setInteracting);

  useEffect(() => {
    if (dragging.current || !proxy.current) return;
    proxy.current.position.set(item.position[0], 0, item.position[2]);
  }, [item.position]);

  return (
    <TransformControls
      mode="translate"
      showY={false}
      size={0.75}
      onMouseDown={() => {
        dragging.current = true;
        setInteracting(true);
      }}
      onMouseUp={() => {
        dragging.current = false;
        setInteracting(false);
      }}
      onObjectChange={() => {
        const object = proxy.current;
        if (!object) return;
        dispatch(moveFurniture(item.id, { x: object.position.x, y: object.position.z }));
      }}
    >
      <group ref={proxy} position={[item.position[0], 0, item.position[2]]} />
    </TransformControls>
  );
}

export function SceneCanvas({ className }: { className?: string }): JSX.Element {
  const [supported] = useState(detectWebGL);

  const plan = useProjectStore((state) => state.plan);
  const selection = useEditorStore((state) => state.selection);
  const select = useEditorStore((state) => state.select);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const cameraPreset = useEditorStore((state) => state.cameraPreset);
  const furnitureVisible = useEditorStore((state) => state.furnitureVisible);
  const wallCutaway = useEditorStore((state) => state.wallCutaway);

  const level = useMemo(() => currentLevel(plan), [plan]);
  const scene = useMemo(() => buildScene3D(level), [level]);
  const bounds = useMemo(() => levelBounds(level), [level]);

  const selectedFurniture = useMemo(() => {
    const ids = selection.filter((ref) => ref.kind === 'furniture').map((ref) => ref.id);
    if (ids.length !== 1) return null;
    return scene.furniture.find((item) => item.id === ids[0]) ?? null;
  }, [scene.furniture, selection]);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Everything cached on the GPU belongs to this canvas; release it when the viewport closes.
  // The identity check keeps a late cleanup from tearing down a canvas that already replaced
  // this one.
  useEffect(
    () => () => {
      const gl = rendererRef.current;
      if (!gl || !isCaptureTarget(gl)) return;

      clearCaptureTarget(gl);
      disposeMaterialCaches();
      disposeUnitGeometries();
    },
    [],
  );

  if (!supported) return <WebGLUnavailable />;

  const handleSelect = (ref: EntityRef, additive: boolean): void => {
    select(ref, { additive });
  };

  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 6);

  return (
    <div className={cn('size-full', className)} data-scene-canvas>
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        camera={{ fov: 45, near: 0.1, far: 600 }}
        // Required so the 3D screenshot can read the frame back out of the canvas.
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl, scene: three, camera }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.98;
          three.background = new THREE.Color('#0a1020');
          three.fog = new THREE.Fog('#0a1020', span * 3, span * 7);
          rendererRef.current = gl;
          registerCaptureTarget({ gl, scene: three, camera });
        }}
        onPointerMissed={() => clearSelection()}
      >
        <Suspense fallback={null}>
          <Lighting bounds={bounds} height={scene.maxHeight} />

          <Grid
            position={[(bounds.minX + bounds.maxX) / 2, -0.01, (bounds.minY + bounds.maxY) / 2]}
            args={[span * 4, span * 4]}
            cellSize={0.5}
            cellThickness={0.5}
            cellColor="#1b2740"
            sectionSize={2.5}
            sectionThickness={1}
            sectionColor="#27365a"
            fadeDistance={span * 3.2}
            fadeStrength={1.6}
            infiniteGrid
            followCamera={false}
          />

          <Structure
            scene={scene}
            selection={selection}
            onSelect={handleSelect}
            cutaway={wallCutaway}
            planCenter={{
              x: (bounds.minX + bounds.maxX) / 2,
              y: (bounds.minY + bounds.maxY) / 2,
            }}
          />

          {furnitureVisible ? (
            <FurnitureGroup items={scene.furniture} selection={selection} onSelect={handleSelect} />
          ) : null}

          {selectedFurniture && furnitureVisible ? (
            <FurnitureGizmo key={selectedFurniture.id} item={selectedFurniture} />
          ) : null}

          <CameraRig bounds={bounds} height={scene.maxHeight} preset={cameraPreset} />
        </Suspense>
      </Canvas>
    </div>
  );
}
