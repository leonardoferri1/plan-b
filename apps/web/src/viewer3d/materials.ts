import * as THREE from 'three';
import { getMaterial, type MaterialPreset } from '@plan-b/shared';

/**
 * three.js materials for the catalog presets.
 *
 * Textures are generated procedurally into an offscreen canvas rather than downloaded, which
 * keeps the viewer working offline, removes any asset licensing question and lets a material
 * change repaint instantly. Everything is cached by material id and disposed together when the
 * scene unmounts.
 */

const TEXTURE_SIZE = 256;

const textureCache = new Map<string, THREE.Texture>();
const surfaceCache = new Map<string, THREE.MeshStandardMaterial>();

function drawWood(ctx: CanvasRenderingContext2D, preset: MaterialPreset): void {
  ctx.fillStyle = preset.color;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  ctx.strokeStyle = preset.accent;
  ctx.globalAlpha = 0.33;

  for (let i = 0; i < 46; i += 1) {
    const y = (i / 46) * TEXTURE_SIZE + Math.sin(i * 1.7) * 1.6;
    ctx.lineWidth = i % 7 === 0 ? 1.8 : 0.7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= TEXTURE_SIZE; x += 16) {
      ctx.lineTo(x, y + Math.sin((x + i * 23) * 0.035) * 2.2);
    }
    ctx.stroke();
  }

  // Plank joints every quarter of the tile.
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 4; i += 1) {
    const y = (i / 4) * TEXTURE_SIZE;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEXTURE_SIZE, y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawMarble(ctx: CanvasRenderingContext2D, preset: MaterialPreset): void {
  ctx.fillStyle = preset.color;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  ctx.strokeStyle = preset.accent;

  for (let vein = 0; vein < 9; vein += 1) {
    ctx.globalAlpha = 0.1 + (vein % 3) * 0.07;
    ctx.lineWidth = 0.6 + (vein % 4) * 0.9;
    ctx.beginPath();

    let x = -20 + vein * 34;
    let y = -10;
    ctx.moveTo(x, y);

    while (y < TEXTURE_SIZE + 10) {
      x += Math.sin(y * 0.05 + vein) * 11 + 4;
      y += 16;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawConcrete(ctx: CanvasRenderingContext2D, preset: MaterialPreset): void {
  ctx.fillStyle = preset.color;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const image = ctx.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const { data } = image;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 26;
    data[i] = Math.max(0, Math.min(255, (data[i] ?? 0) + noise));
    data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] ?? 0) + noise));
    data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] ?? 0) + noise));
  }

  ctx.putImageData(image, 0, 0);
}

function drawWeave(ctx: CanvasRenderingContext2D, preset: MaterialPreset): void {
  ctx.fillStyle = preset.color;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  ctx.strokeStyle = preset.accent;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;

  for (let i = 0; i < TEXTURE_SIZE; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, TEXTURE_SIZE);
    ctx.moveTo(0, i);
    ctx.lineTo(TEXTURE_SIZE, i);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawTile(ctx: CanvasRenderingContext2D, preset: MaterialPreset): void {
  ctx.fillStyle = preset.color;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  ctx.strokeStyle = preset.accent;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  ctx.globalAlpha = 1;
}

function createTexture(preset: MaterialPreset): THREE.Texture | null {
  if (preset.pattern === 'none' || typeof document === 'undefined') return null;

  const cached = textureCache.get(preset.id);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  switch (preset.pattern) {
    case 'wood':
      drawWood(ctx, preset);
      break;
    case 'marble':
      drawMarble(ctx, preset);
      break;
    case 'concrete':
      drawConcrete(ctx, preset);
      break;
    case 'weave':
      drawWeave(ctx, preset);
      break;
    case 'tile':
      drawTile(ctx, preset);
      break;
    default:
      return null;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  textureCache.set(preset.id, texture);
  return texture;
}

/**
 * Material for a surface whose UVs are expressed in meters (floors built from `ShapeGeometry`).
 * `repeat` therefore means "tiles per meter" and comes straight from the preset.
 */
export function getSurfaceMaterial(
  materialId: string,
  selected = false,
): THREE.MeshStandardMaterial {
  const key = selected ? `${materialId}:selected` : materialId;
  const cached = surfaceCache.get(key);
  if (cached) return cached;

  const preset = getMaterial(materialId);
  const texture = createTexture(preset);

  if (texture) {
    texture.repeat.set(preset.scale, preset.scale);
  }

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(preset.color),
    roughness: preset.roughness,
    metalness: preset.metalness,
    map: texture ?? null,
    envMapIntensity: preset.metalness > 0.4 ? 1.1 : 0.55,
  });

  if (selected) {
    material.emissive = SELECTION_COLOR;
    material.emissiveIntensity = 0.22;
  }

  surfaceCache.set(key, material);
  return material;
}

const solidCache = new Map<string, THREE.MeshStandardMaterial>();

export const SELECTION_COLOR = new THREE.Color('#4d8cff');

/**
 * Untextured material for volumes whose UVs are per-face (boxes, cylinders, spheres).
 *
 * The selected variant is cached alongside the plain one instead of being cloned per mesh:
 * a furnished apartment has hundreds of parts, and each inline material would be its own
 * shader program upload.
 */
export function getSolidMaterial(materialId: string, selected = false): THREE.MeshStandardMaterial {
  const key = selected ? `${materialId}:selected` : materialId;
  const cached = solidCache.get(key);
  if (cached) return cached;

  const preset = getMaterial(materialId);

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(preset.color),
    roughness: preset.roughness,
    metalness: preset.metalness,
    envMapIntensity: preset.metalness > 0.4 ? 1.2 : 0.5,
  });

  if (selected) {
    material.emissive = SELECTION_COLOR;
    material.emissiveIntensity = 0.32;
  }

  solidCache.set(key, material);
  return material;
}

let glassMaterial: THREE.MeshPhysicalMaterial | null = null;

export function getGlassMaterial(): THREE.MeshPhysicalMaterial {
  glassMaterial ??= new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#bfe0f5'),
    roughness: 0.04,
    metalness: 0,
    transmission: 0.82,
    thickness: 0.02,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  });

  return glassMaterial;
}

let lampMaterial: THREE.MeshStandardMaterial | null = null;

export function getLampMaterial(): THREE.MeshStandardMaterial {
  lampMaterial ??= new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fff2d2'),
    emissive: new THREE.Color('#ffd79a'),
    emissiveIntensity: 2.4,
    roughness: 1,
  });

  return lampMaterial;
}

/** Releases every cached GPU resource. Called when the 3D viewport unmounts. */
export function disposeMaterialCaches(): void {
  for (const material of surfaceCache.values()) material.dispose();
  for (const material of solidCache.values()) material.dispose();
  for (const texture of textureCache.values()) texture.dispose();

  glassMaterial?.dispose();
  lampMaterial?.dispose();

  surfaceCache.clear();
  solidCache.clear();
  textureCache.clear();
  glassMaterial = null;
  lampMaterial = null;
}
