import { useEffect, useRef, type ElementRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Bounds } from '@plan-b/shared';
import type { CameraPreset } from '@/store/editor-store';

/** drei exposes the controls implementation type only through its ref. */
type OrbitControlsImpl = ElementRef<typeof OrbitControls>;

interface CameraRigProps {
  bounds: Bounds;
  height: number;
  preset: CameraPreset;
  /** Disables orbiting while a gizmo drag is in progress. */
  enabled?: boolean;
  onControlsReady?: (controls: OrbitControlsImpl | null) => void;
}

interface Framing {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

function framingFor(preset: CameraPreset, bounds: Bounds, height: number): Framing {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minY + bounds.maxY) / 2;
  const spanX = Math.max(3, bounds.maxX - bounds.minX);
  const spanZ = Math.max(3, bounds.maxY - bounds.minY);
  const span = Math.max(spanX, spanZ);

  const target = new THREE.Vector3(centerX, height * 0.42, centerZ);

  switch (preset) {
    case 'top':
      return {
        // A hair off the vertical keeps the orbit controls from gimbal-locking.
        position: new THREE.Vector3(centerX + 0.01, span * 1.55 + height, centerZ + 0.01),
        target: new THREE.Vector3(centerX, 0, centerZ),
      };

    case 'isometric':
      return {
        position: new THREE.Vector3(
          centerX + span * 0.78,
          span * 0.78 + height,
          centerZ + span * 0.78,
        ),
        target,
      };

    case 'perspective':
    default:
      // A raised three-quarter view: high enough to look over the near walls into the rooms,
      // which is what an interior designer actually wants to see first.
      return {
        position: new THREE.Vector3(
          centerX + spanX * 0.5,
          height * 2.6 + span * 0.42,
          centerZ + spanZ * 0.95 + 2.5,
        ),
        target,
      };
  }
}

const EASING = 0.1;

/**
 * Orbit controls plus animated camera presets.
 *
 * A preset change sets a goal and the rig eases towards it for a few frames; the moment the
 * user grabs the mouse the animation is abandoned, so a transition never fights an input.
 */
export function CameraRig({
  bounds,
  height,
  preset,
  enabled = true,
  onControlsReady,
}: CameraRigProps): JSX.Element {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const goalRef = useRef<Framing | null>(null);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    goalRef.current = framingFor(preset, bounds, height);
    // Re-framing on every geometry edit would yank the camera around; only the preset and the
    // first mount should re-aim it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  // Place the camera immediately on mount so the first frame is already composed.
  useEffect(() => {
    const framing = framingFor(preset, bounds, height);
    camera.position.copy(framing.position);
    controlsRef.current?.target.copy(framing.target);
    controlsRef.current?.update();
    goalRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(() => {
    const goal = goalRef.current;
    const controls = controlsRef.current;
    if (!goal || !controls) return;

    camera.position.lerp(goal.position, EASING);
    controls.target.lerp(goal.target, EASING);
    controls.update();

    if (
      camera.position.distanceTo(goal.position) < 0.02 &&
      controls.target.distanceTo(goal.target) < 0.02
    ) {
      camera.position.copy(goal.position);
      controls.target.copy(goal.target);
      controls.update();
      goalRef.current = null;
    }
  });

  return (
    <OrbitControls
      ref={(instance) => {
        controlsRef.current = instance;
        onControlsReady?.(instance);
      }}
      enabled={enabled}
      makeDefault
      enableDamping
      dampingFactor={0.09}
      minDistance={1.2}
      maxDistance={120}
      maxPolarAngle={Math.PI / 2.02}
      onStart={() => {
        // The user took over: drop any in-flight transition.
        goalRef.current = null;
      }}
    />
  );
}
