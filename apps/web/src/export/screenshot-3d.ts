import { captureViewport, hasCaptureTarget } from '@/viewer3d/capture';
import { downloadDataUrl, slugify, timestamp } from './download';

export const hasScene = hasCaptureTarget;

/**
 * Saves the current 3D frame as a PNG.
 *
 * The renderer is created with `preserveDrawingBuffer`, and the capture re-renders once before
 * reading the canvas, so the file always matches what is on screen rather than whatever the
 * browser happened to leave in the back buffer.
 */
export function captureScene(projectName: string): void {
  const dataUrl = captureViewport();

  if (!dataUrl) {
    throw new Error('Abra a vista 3D para capturar a cena.');
  }

  downloadDataUrl(dataUrl, `${slugify(projectName)}-3d-${timestamp()}.png`);
}
