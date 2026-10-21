import {
  formatArea,
  formatDimension,
  type EntityRef,
  type OpeningKind,
  type Vec2,
} from '@spacecraft/shared';
import { PLAN_COLORS, withAlpha } from './colors';
import { furnitureHandles } from './scene';
import type { PlanScene, SceneFurniture, SceneOpening, SceneWall } from './scene';
import {
  adaptiveGridStep,
  metersToPixels,
  visibleBounds,
  worldToScreen,
  type ViewportTransform,
} from './viewport';

export type Preview =
  | { kind: 'wall'; from: Vec2; to: Vec2; valid: boolean }
  | { kind: 'rect'; from: Vec2; to: Vec2 }
  | {
      kind: 'opening';
      openingKind: OpeningKind;
      center: Vec2;
      direction: Vec2;
      width: number;
      thickness: number;
      valid: boolean;
    }
  | { kind: 'furniture'; position: Vec2; width: number; depth: number; rotation: number }
  | { kind: 'measure'; from: Vec2; to: Vec2 };

export interface RenderOptions {
  scene: PlanScene;
  view: ViewportTransform;
  selection: readonly EntityRef[];
  hovered: EntityRef | null;
  gridVisible: boolean;
  gridSize: number;
  dimensionsVisible: boolean;
  furnitureVisible: boolean;
  preview?: Preview | null;
  /** Hides editor-only affordances (node handles, hover) for a clean PNG export. */
  chrome?: boolean;
  /** Draws an opaque background; the editor leaves it transparent over its CSS surface. */
  opaqueBackground?: boolean;
}

const isSelectedRef = (
  selection: readonly EntityRef[],
  kind: EntityRef['kind'],
  id: string,
): boolean => selection.some((ref) => ref.kind === kind && ref.id === id);

const isHoveredRef = (hovered: EntityRef | null, kind: EntityRef['kind'], id: string): boolean =>
  hovered?.kind === kind && hovered.id === id;

/** Reusable offscreen layer so that openings can be punched out of the wall fill. */
let wallLayer: HTMLCanvasElement | null = null;

function getWallLayer(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  if (!wallLayer) wallLayer = document.createElement('canvas');
  if (wallLayer.width !== width || wallLayer.height !== height) {
    wallLayer.width = width;
    wallLayer.height = height;
  }
  return wallLayer;
}

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  points: readonly Vec2[],
  view: ViewportTransform,
): void {
  if (points.length === 0) return;
  ctx.beginPath();
  points.forEach((point, index) => {
    const screen = worldToScreen(point, view);
    if (index === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });
  ctx.closePath();
}

function drawGrid(ctx: CanvasRenderingContext2D, view: ViewportTransform, gridSize: number): void {
  const step = adaptiveGridStep(gridSize, view.zoom);
  const bounds = visibleBounds(view);

  const startX = Math.floor(bounds.minX / step) * step;
  const startY = Math.floor(bounds.minY / step) * step;

  ctx.lineWidth = 1;

  for (let pass = 0; pass < 2; pass += 1) {
    const major = pass === 1;
    ctx.strokeStyle = major ? PLAN_COLORS.gridMajor : PLAN_COLORS.gridMinor;
    ctx.beginPath();

    for (let x = startX; x <= bounds.maxX; x += step) {
      const isMajor = Math.abs(Math.round(x / step) % 5) === 0;
      if (isMajor !== major) continue;
      const screenX = Math.round(worldToScreen({ x, y: 0 }, view).x) + 0.5;
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, view.height);
    }

    for (let y = startY; y <= bounds.maxY; y += step) {
      const isMajor = Math.abs(Math.round(y / step) % 5) === 0;
      if (isMajor !== major) continue;
      const screenY = Math.round(worldToScreen({ x: 0, y }, view).y) + 0.5;
      ctx.moveTo(0, screenY);
      ctx.lineTo(view.width, screenY);
    }

    ctx.stroke();
  }
}

function drawRooms(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { scene, view, selection, hovered } = options;

  for (const room of scene.rooms) {
    const selected = isSelectedRef(selection, 'room', room.id);
    const hover = isHoveredRef(hovered, 'room', room.id);

    tracePolygon(ctx, room.polygon, view);
    ctx.fillStyle = selected
      ? withAlpha(PLAN_COLORS.selection, 0.14)
      : withAlpha(room.fill, hover ? 0.2 : 0.13);
    ctx.fill();

    ctx.strokeStyle = selected ? PLAN_COLORS.selection : PLAN_COLORS.roomStroke;
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.stroke();
  }
}

function drawRoomLabels(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { scene, view } = options;

  for (const room of scene.rooms) {
    const widthPx = metersToPixels(Math.sqrt(room.area), view);
    if (widthPx < 56) continue;

    const center = worldToScreen(room.centroid, view);
    const name = room.name.toUpperCase();
    const area = formatArea(room.area);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // A soft plate keeps the label readable where furniture sits under the centroid, which is
    // the normal case in a furnished room.
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    const plateWidth = Math.max(ctx.measureText(name).width, 44) + 18;

    ctx.fillStyle = PLAN_COLORS.dimensionBackground;
    ctx.beginPath();
    roundRect(ctx, center.x - plateWidth / 2, center.y - 17, plateWidth, 34, 7);
    ctx.fill();

    ctx.fillStyle = PLAN_COLORS.roomLabel;
    ctx.fillText(name, center.x, center.y - 7);

    ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = PLAN_COLORS.roomArea;
    ctx.fillText(area, center.x, center.y + 8);
  }
}

/**
 * Walls are painted into an offscreen layer and the openings are erased from it with
 * `destination-out` before compositing. Punching the hole on a separate layer is what keeps
 * the room fill visible through a doorway instead of a rectangle of background colour.
 */
function drawWalls(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { scene, view } = options;
  const dpr = ctx.getTransform().a || 1;
  const layer = getWallLayer(Math.ceil(view.width * dpr), Math.ceil(view.height * dpr));

  const target = layer?.getContext('2d');
  if (!layer || !target) {
    paintWallBodies(ctx, options);
    return;
  }

  target.setTransform(dpr, 0, 0, dpr, 0, 0);
  target.clearRect(0, 0, view.width, view.height);

  paintWallBodies(target, options);

  target.globalCompositeOperation = 'destination-out';
  for (const opening of scene.openings) {
    traceOpeningRect(target, opening, view, 1.5);
    target.fill();
  }
  target.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

/**
 * Paints the walls as a single solid body.
 *
 * The pieces already tile the plan exactly — mitered ends, plus a filler where three or more
 * walls meet — so the only thing left to hide is the hairline where two of them abut. Stroking
 * everything first and filling afterwards does that: a stroke straddles its edge, and the fills
 * cover the inner half, leaving just the outline of the union.
 */
function paintWallBodies(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { scene, view, selection, hovered } = options;

  const fillFor = (id: string): string => {
    if (isSelectedRef(selection, 'wall', id)) return PLAN_COLORS.selection;
    if (!options.chrome && isHoveredRef(hovered, 'wall', id)) return '#e8eefb';
    return PLAN_COLORS.wallFill;
  };

  ctx.lineWidth = 2;
  ctx.lineJoin = 'miter';

  for (const wall of scene.walls) {
    tracePolygon(ctx, wall.quad.points, view);
    ctx.strokeStyle = isSelectedRef(selection, 'wall', wall.id)
      ? PLAN_COLORS.selection
      : PLAN_COLORS.wallStroke;
    ctx.stroke();
  }

  for (const block of scene.junctions) {
    tracePolygon(ctx, block, view);
    ctx.strokeStyle = PLAN_COLORS.wallStroke;
    ctx.stroke();
  }

  for (const wall of scene.walls) {
    tracePolygon(ctx, wall.quad.points, view);
    ctx.fillStyle = fillFor(wall.id);
    ctx.fill();
  }

  // Fillers carry no identity of their own, so they take the plain wall colour.
  for (const block of scene.junctions) {
    tracePolygon(ctx, block, view);
    ctx.fillStyle = PLAN_COLORS.wallFill;
    ctx.fill();
  }

  ctx.lineJoin = 'round';
}

/** Rectangle covering the opening span across the full wall thickness. */
function traceOpeningRect(
  ctx: CanvasRenderingContext2D,
  opening: SceneOpening,
  view: ViewportTransform,
  overscanPx = 0,
): void {
  const half = opening.thickness / 2;
  const overscan = overscanPx / view.zoom;

  const normal = opening.normal;
  const direction = opening.direction;

  const corners: Vec2[] = [
    {
      x: opening.from.x + normal.x * (half + overscan) - direction.x * overscan,
      y: opening.from.y + normal.y * (half + overscan) - direction.y * overscan,
    },
    {
      x: opening.to.x + normal.x * (half + overscan) + direction.x * overscan,
      y: opening.to.y + normal.y * (half + overscan) + direction.y * overscan,
    },
    {
      x: opening.to.x - normal.x * (half + overscan) + direction.x * overscan,
      y: opening.to.y - normal.y * (half + overscan) + direction.y * overscan,
    },
    {
      x: opening.from.x - normal.x * (half + overscan) - direction.x * overscan,
      y: opening.from.y - normal.y * (half + overscan) - direction.y * overscan,
    },
  ];

  tracePolygon(ctx, corners, view);
}

function drawOpenings(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { scene, view, selection, hovered } = options;

  for (const opening of scene.openings) {
    const selected = isSelectedRef(selection, 'opening', opening.id);
    const hover = !options.chrome && isHoveredRef(hovered, 'opening', opening.id);
    const accent = selected ? PLAN_COLORS.selection : hover ? PLAN_COLORS.hover : null;

    if (opening.kind === 'door') {
      drawDoorSymbol(ctx, opening, view, accent);
    } else {
      drawWindowSymbol(ctx, opening, view, accent);
    }
  }
}

function drawDoorSymbol(
  ctx: CanvasRenderingContext2D,
  opening: SceneOpening,
  view: ViewportTransform,
  accent: string | null,
): void {
  const hinge = opening.flipped ? opening.to : opening.from;
  const direction = opening.flipped
    ? { x: -opening.direction.x, y: -opening.direction.y }
    : opening.direction;
  // The hand decides which end carries the hinge; the swing side decides which face of the
  // wall the leaf sweeps across. They are independent, so a door has four valid arrangements.
  const swing = opening.swingReversed
    ? { x: -opening.normal.x, y: -opening.normal.y }
    : opening.normal;

  const hingeScreen = worldToScreen(hinge, view);
  const radius = metersToPixels(opening.width, view);
  const startAngle = Math.atan2(direction.y, direction.x);
  const endAngle = Math.atan2(swing.y, swing.x);

  // Jambs: short strokes closing the wall on both sides of the leaf.
  ctx.strokeStyle = accent ?? PLAN_COLORS.wallStroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const point of [opening.from, opening.to]) {
    const half = opening.thickness / 2;
    const a = worldToScreen(
      { x: point.x + opening.normal.x * half, y: point.y + opening.normal.y * half },
      view,
    );
    const b = worldToScreen(
      { x: point.x - opening.normal.x * half, y: point.y - opening.normal.y * half },
      view,
    );
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  // Swing arc.
  ctx.strokeStyle = accent ?? withAlpha(PLAN_COLORS.wallStroke, 0.7);
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(
    hingeScreen.x,
    hingeScreen.y,
    radius,
    startAngle,
    endAngle,
    isClockwise(startAngle, endAngle),
  );
  ctx.stroke();
  ctx.setLineDash([]);

  // Leaf.
  ctx.strokeStyle = accent ?? PLAN_COLORS.wallFill;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(hingeScreen.x, hingeScreen.y);
  ctx.lineTo(
    hingeScreen.x + Math.cos(endAngle) * radius,
    hingeScreen.y + Math.sin(endAngle) * radius,
  );
  ctx.stroke();
}

function isClockwise(start: number, end: number): boolean {
  const delta = ((end - start) % (Math.PI * 2)) + Math.PI * 2;
  return delta % (Math.PI * 2) > Math.PI;
}

function drawWindowSymbol(
  ctx: CanvasRenderingContext2D,
  opening: SceneOpening,
  view: ViewportTransform,
  accent: string | null,
): void {
  const half = opening.thickness / 2;

  ctx.strokeStyle = accent ?? PLAN_COLORS.wallStroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const side of [half, -half]) {
    const a = worldToScreen(
      { x: opening.from.x + opening.normal.x * side, y: opening.from.y + opening.normal.y * side },
      view,
    );
    const b = worldToScreen(
      { x: opening.to.x + opening.normal.x * side, y: opening.to.y + opening.normal.y * side },
      view,
    );
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  // Glass pane down the middle of the opening.
  ctx.strokeStyle = accent ?? PLAN_COLORS.glass;
  ctx.lineWidth = 2;
  const from = worldToScreen(opening.from, view);
  const to = worldToScreen(opening.to, view);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function drawFurniture(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { scene, view, selection, hovered } = options;

  for (const item of scene.furniture) {
    const selected = isSelectedRef(selection, 'furniture', item.id);
    const hover = !options.chrome && isHoveredRef(hovered, 'furniture', item.id);

    drawFurnitureBody(ctx, item, view);

    if (selected || hover) {
      tracePolygon(ctx, item.corners, view);
      ctx.strokeStyle = selected ? PLAN_COLORS.selection : PLAN_COLORS.hover;
      ctx.lineWidth = selected ? 2 : 1.5;
      ctx.stroke();
    }
  }
}

function drawFurnitureBody(
  ctx: CanvasRenderingContext2D,
  item: SceneFurniture,
  view: ViewportTransform,
): void {
  const origin = worldToScreen(item.position, view);

  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.rotate(item.rotation);

  ctx.lineWidth = 0.75;
  ctx.strokeStyle = PLAN_COLORS.furnitureStroke;

  for (const part of item.parts) {
    const w = metersToPixels(part.width, view);
    const d = metersToPixels(part.depth, view);
    if (w < 0.6 || d < 0.6) continue;

    const x = metersToPixels(part.cx, view);
    const y = metersToPixels(part.cy, view);

    ctx.fillStyle = part.fill;
    ctx.beginPath();

    if (part.round) {
      ctx.ellipse(x, y, w / 2, d / 2, 0, 0, Math.PI * 2);
    } else {
      const radius = Math.min(3, w / 4, d / 4);
      roundRect(ctx, x - w / 2, y - d / 2, w, d, radius);
    }

    ctx.fill();
    if (w > 5 && d > 5) ctx.stroke();
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawDimensions(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { scene, view } = options;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';

  for (const wall of scene.walls) {
    const lengthPx = metersToPixels(wall.length, view);
    if (lengthPx < 44) continue;

    const mid = {
      x: (wall.a.x + wall.b.x) / 2,
      y: (wall.a.y + wall.b.y) / 2,
    };

    const normal = { x: -Math.sin(wall.angle), y: Math.cos(wall.angle) };
    const offset = wall.thickness / 2 + 0.18;
    const labelWorld = { x: mid.x + normal.x * offset, y: mid.y + normal.y * offset };
    const screen = worldToScreen(labelWorld, view);

    const text = formatDimension(wall.length);
    const metrics = ctx.measureText(text);
    const padX = 5;
    const boxWidth = metrics.width + padX * 2;
    const boxHeight = 15;

    ctx.fillStyle = PLAN_COLORS.dimensionBackground;
    ctx.beginPath();
    roundRect(ctx, screen.x - boxWidth / 2, screen.y - boxHeight / 2, boxWidth, boxHeight, 4);
    ctx.fill();

    ctx.fillStyle = PLAN_COLORS.dimension;
    ctx.fillText(text, screen.x, screen.y + 0.5);
  }
}

function drawNodes(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { scene, view, selection, hovered } = options;
  if (options.chrome) return;

  const wallSelected = new Set(selection.filter((ref) => ref.kind === 'wall').map((ref) => ref.id));

  const visible = new Set<string>();
  for (const wall of scene.walls) {
    if (wallSelected.has(wall.id)) {
      visible.add(wall.nodeA);
      visible.add(wall.nodeB);
    }
  }
  for (const ref of selection) if (ref.kind === 'node') visible.add(ref.id);
  if (hovered?.kind === 'node') visible.add(hovered.id);

  for (const node of scene.nodes) {
    if (!visible.has(node.id)) continue;

    const screen = worldToScreen(node.point, view);
    const selected = isSelectedRef(selection, 'node', node.id);

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, selected ? 5.5 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = selected ? PLAN_COLORS.selection : '#0d1526';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = selected ? '#ffffff' : PLAN_COLORS.node;
    ctx.stroke();
  }
}

/**
 * Direct-manipulation handles for a single selected item: corner pucks that resize and a
 * detached puck in front that rotates.
 */
function drawHandles(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  if (options.chrome) return;

  const selected = options.selection.filter((ref) => ref.kind === 'furniture');
  if (selected.length !== 1) return;

  const item = options.scene.furniture.find((candidate) => candidate.id === selected[0]!.id);
  if (!item || item.locked) return;

  const { view } = options;
  const handles = furnitureHandles(item);
  const center = worldToScreen(item.position, view);
  const rotate = worldToScreen(handles.rotate, view);

  ctx.strokeStyle = withAlpha(PLAN_COLORS.selection, 0.6);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(rotate.x, rotate.y);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const corner of handles.corners) {
    const screen = worldToScreen(corner, view);
    ctx.beginPath();
    ctx.rect(screen.x - 3.5, screen.y - 3.5, 7, 7);
    ctx.fillStyle = '#0d1526';
    ctx.fill();
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = PLAN_COLORS.selection;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(rotate.x, rotate.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = PLAN_COLORS.selection;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
}

function drawPreview(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const preview = options.preview;
  if (!preview) return;

  const { view } = options;

  if (preview.kind === 'wall') {
    const from = worldToScreen(preview.from, view);
    const to = worldToScreen(preview.to, view);
    const length = Math.hypot(preview.to.x - preview.from.x, preview.to.y - preview.from.y);

    ctx.strokeStyle = preview.valid ? PLAN_COLORS.accent : PLAN_COLORS.danger;
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);

    drawBadge(ctx, (from.x + to.x) / 2, (from.y + to.y) / 2 - 14, formatDimension(length));
    drawCrosshair(ctx, to, PLAN_COLORS.accent);
    return;
  }

  if (preview.kind === 'rect') {
    const a = worldToScreen(preview.from, view);
    const b = worldToScreen(preview.to, view);

    ctx.fillStyle = PLAN_COLORS.accentSoft;
    ctx.strokeStyle = PLAN_COLORS.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    const width = Math.abs(preview.to.x - preview.from.x);
    const depth = Math.abs(preview.to.y - preview.from.y);
    drawBadge(
      ctx,
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      `${formatDimension(width)} × ${formatDimension(depth)}`,
    );
    return;
  }

  if (preview.kind === 'opening') {
    const half = preview.width / 2;
    const from = {
      x: preview.center.x - preview.direction.x * half,
      y: preview.center.y - preview.direction.y * half,
    };
    const to = {
      x: preview.center.x + preview.direction.x * half,
      y: preview.center.y + preview.direction.y * half,
    };

    const a = worldToScreen(from, view);
    const b = worldToScreen(to, view);

    ctx.strokeStyle = preview.valid ? PLAN_COLORS.accent : PLAN_COLORS.danger;
    ctx.lineWidth = Math.max(3, metersToPixels(preview.thickness, view));
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  if (preview.kind === 'furniture') {
    const center = worldToScreen(preview.position, view);
    const w = metersToPixels(preview.width, view);
    const d = metersToPixels(preview.depth, view);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(preview.rotation);
    ctx.fillStyle = PLAN_COLORS.accentSoft;
    ctx.strokeStyle = PLAN_COLORS.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    roundRect(ctx, -w / 2, -d / 2, w, d, 4);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  if (preview.kind === 'measure') {
    const from = worldToScreen(preview.from, view);
    const to = worldToScreen(preview.to, view);
    const length = Math.hypot(preview.to.x - preview.from.x, preview.to.y - preview.from.y);

    ctx.strokeStyle = PLAN_COLORS.measure;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const point of [from, to]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = PLAN_COLORS.measure;
      ctx.fill();
    }

    drawBadge(
      ctx,
      (from.x + to.x) / 2,
      (from.y + to.y) / 2 - 14,
      `${formatDimension(length)} m`,
      PLAN_COLORS.measure,
    );
  }
}

function drawCrosshair(ctx: CanvasRenderingContext2D, point: Vec2, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(point.x - 7, point.y);
  ctx.lineTo(point.x + 7, point.y);
  ctx.moveTo(point.x, point.y - 7);
  ctx.lineTo(point.x, point.y + 7);
  ctx.stroke();
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string = PLAN_COLORS.accent,
): void {
  ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const width = ctx.measureText(text).width + 12;

  ctx.fillStyle = PLAN_COLORS.dimensionBackground;
  ctx.beginPath();
  roundRect(ctx, x - width / 2, y - 9, width, 18, 5);
  ctx.fill();

  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 0.5);
}

/** Draws the full plan. The caller owns the device-pixel-ratio transform. */
export function renderPlan(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { view } = options;

  ctx.clearRect(0, 0, view.width, view.height);

  if (options.opaqueBackground) {
    ctx.fillStyle = PLAN_COLORS.background;
    ctx.fillRect(0, 0, view.width, view.height);
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (options.gridVisible) drawGrid(ctx, view, options.gridSize);

  drawRooms(ctx, options);
  drawWalls(ctx, options);
  drawOpenings(ctx, options);

  if (options.furnitureVisible) drawFurniture(ctx, options);

  drawRoomLabels(ctx, options);

  if (options.dimensionsVisible) drawDimensions(ctx, options);

  drawNodes(ctx, options);
  drawHandles(ctx, options);
  drawPreview(ctx, options);
}

export type { SceneWall };
