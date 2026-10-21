import { Environment, Lightformer } from '@react-three/drei';
import type { Bounds } from '@spacecraft/shared';

/**
 * Lighting rig: a warm key light casting soft shadows, a cool sky fill, and a small studio
 * environment assembled from light cards.
 *
 * The environment is built in-scene with `Lightformer`s rather than loading an HDRI from a
 * CDN — marble, glass and brushed metal still get believable specular response, and the viewer
 * keeps working with no network at all.
 */
export function Lighting({ bounds, height }: { bounds: Bounds; height: number }): JSX.Element {
  const spanX = Math.max(4, bounds.maxX - bounds.minX);
  const spanY = Math.max(4, bounds.maxY - bounds.minY);
  const span = Math.max(spanX, spanY);

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minY + bounds.maxY) / 2;

  // The shadow frustum must wrap the whole plan or walls at the edge lose their shadows.
  const extent = span * 0.9 + 2;

  return (
    <>
      <ambientLight intensity={0.34} color="#dfe8ff" />
      <hemisphereLight intensity={0.38} color="#dceaff" groundColor="#3a3730" />

      <directionalLight
        castShadow
        position={[centerX + span * 0.65, height * 3.4 + 4, centerZ - span * 0.75]}
        intensity={2.7}
        color="#fff1dc"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00035}
        shadow-normalBias={0.02}
        shadow-camera-near={0.5}
        shadow-camera-far={span * 5 + 30}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
      />

      {/* Bounce light from the floor keeps interiors from going flat black. */}
      <directionalLight
        position={[centerX - span, height * 1.2, centerZ + span]}
        intensity={0.38}
        color="#cddcff"
      />

      <Environment resolution={256} frames={1} background={false}>
        <Lightformer
          form="rect"
          intensity={1.8}
          color="#ffffff"
          position={[0, 8, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[20, 20, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.1}
          color="#cfe2ff"
          position={[-9, 3, 4]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[12, 8, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.8}
          color="#ffe6c9"
          position={[9, 3, -4]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={[12, 8, 1]}
        />
        <Lightformer form="ring" intensity={0.6} color="#ffffff" position={[0, 2, 12]} scale={6} />
      </Environment>
    </>
  );
}
