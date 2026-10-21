import type * as THREE from 'three';

/**
 * Handle onto the live WebGL renderer so the export module can take a screenshot of the 3D
 * view without reaching into React. The canvas registers itself on mount and clears the
 * reference on unmount, so a stale renderer can never be captured.
 */
interface CaptureHandle {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

let handle: CaptureHandle | null = null;

export function registerCaptureTarget(next: CaptureHandle | null): void {
  handle = next;
}

export function hasCaptureTarget(): boolean {
  return handle !== null;
}

/**
 * Renders one fresh frame and returns it as a PNG data URL.
 *
 * The extra render is deliberate: with `preserveDrawingBuffer` the back buffer is only
 * guaranteed to hold the most recent frame, and a capture triggered from a React event can
 * otherwise land after the buffer was cleared for the next one.
 */
export function captureViewport(): string | null {
  if (!handle) return null;

  const { gl, scene, camera } = handle;
  gl.render(scene, camera);
  return gl.domElement.toDataURL('image/png');
}
