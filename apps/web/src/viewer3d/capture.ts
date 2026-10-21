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

/** True while `gl` is the renderer a capture would read from. */
export function isCaptureTarget(gl: THREE.WebGLRenderer): boolean {
  return handle?.gl === gl;
}

/**
 * Clears the handle only when it still points at `gl`.
 *
 * An unmount cleanup can run *after* a replacement canvas has already registered itself —
 * React's strict mode does exactly that on every mount — and clearing unconditionally would
 * leave the live scene uncapturable.
 */
export function clearCaptureTarget(gl: THREE.WebGLRenderer): void {
  if (handle?.gl === gl) handle = null;
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
