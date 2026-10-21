import {
  currentLevel,
  formatArea,
  formatMeters,
  levelBounds,
  planStats,
  type FloorPlan,
} from '@spacecraft/shared';
import { PLAN_COLORS } from '@/canvas2d/colors';
import { renderPlan } from '@/canvas2d/renderer';
import { buildScene } from '@/canvas2d/scene';
import { fitBounds, type ViewportTransform } from '@/canvas2d/viewport';
import { downloadBlob, slugify, timestamp } from './download';

export interface PlanImageOptions {
  /** Longest side of the exported image in pixels. */
  maxSize?: number;
  /** Device pixel ratio equivalent; 2 produces a crisp print-ready raster. */
  scale?: number;
  showDimensions?: boolean;
  showFurniture?: boolean;
  showGrid?: boolean;
  /** Draws the title block with the project name, area and date. */
  titleBlock?: boolean;
}

const TITLE_BLOCK_HEIGHT = 86;

/**
 * Renders the plan to an offscreen canvas.
 *
 * The export reuses the exact renderer the editor draws with — only the viewport changes — so
 * what is downloaded is what was on screen, framed to the drawing and without the editor-only
 * affordances (hover, handles, corner dots) that `chrome` suppresses.
 */
export function renderPlanToCanvas(
  plan: FloorPlan,
  projectName: string,
  options: PlanImageOptions = {},
): HTMLCanvasElement {
  const {
    maxSize = 2200,
    scale = 2,
    showDimensions = true,
    showFurniture = true,
    showGrid = false,
    titleBlock = true,
  } = options;

  const level = currentLevel(plan);
  const scene = buildScene(level);
  const bounds = levelBounds(level);

  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const aspect = spanX / spanY;

  const width = aspect >= 1 ? maxSize : Math.round(maxSize * aspect);
  const planHeight = aspect >= 1 ? Math.round(maxSize / aspect) : maxSize;
  const height = planHeight + (titleBlock ? TITLE_BLOCK_HEIGHT : 0);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível criar o contexto 2D para exportar.');

  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  ctx.fillStyle = PLAN_COLORS.background;
  ctx.fillRect(0, 0, width, height);

  const fitted = fitBounds(bounds, width, planHeight, 72);
  const view: ViewportTransform = { ...fitted, width, height: planHeight };

  renderPlan(ctx, {
    scene,
    view,
    selection: [],
    hovered: null,
    gridVisible: showGrid,
    gridSize: plan.settings.gridSize,
    dimensionsVisible: showDimensions,
    furnitureVisible: showFurniture,
    chrome: true,
    opaqueBackground: false,
  });

  if (titleBlock) {
    drawTitleBlock(ctx, plan, projectName, width, planHeight);
  }

  return canvas;
}

function drawTitleBlock(
  ctx: CanvasRenderingContext2D,
  plan: FloorPlan,
  projectName: string,
  width: number,
  planHeight: number,
): void {
  const stats = planStats(currentLevel(plan));
  const top = planHeight;

  ctx.fillStyle = '#070c18';
  ctx.fillRect(0, top, width, TITLE_BLOCK_HEIGHT);

  ctx.strokeStyle = 'rgba(148, 170, 205, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top + 0.5);
  ctx.lineTo(width, top + 0.5);
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  ctx.fillStyle = '#e6edf7';
  ctx.font = '600 20px Inter, system-ui, sans-serif';
  ctx.fillText(projectName, 32, top + 36);

  ctx.fillStyle = '#7d8ca8';
  ctx.font = '400 12px Inter, system-ui, sans-serif';
  ctx.fillText('SpaceCraft · planta baixa', 32, top + 58);

  const facts = [
    `${stats.rooms} ambientes`,
    formatArea(stats.floorArea),
    `${formatMeters(stats.wallLength)} de parede`,
  ].join('   ·   ');

  ctx.textAlign = 'right';
  ctx.font = '500 12px "JetBrains Mono", ui-monospace, monospace';

  ctx.fillStyle = '#9fb0cc';
  ctx.fillText(facts, width - 32, top + 36);

  ctx.fillStyle = '#5f7290';
  ctx.fillText(new Date().toLocaleDateString('pt-BR'), width - 32, top + 58);
}

export async function exportPlanPng(
  plan: FloorPlan,
  projectName: string,
  options?: PlanImageOptions,
): Promise<void> {
  const canvas = renderPlanToCanvas(plan, projectName, options);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });

  if (!blob) throw new Error('A exportação da imagem falhou.');

  downloadBlob(blob, `${slugify(projectName)}-planta-${timestamp()}.png`);
}
