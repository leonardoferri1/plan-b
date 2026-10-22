import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  GEOMETRY_LIMITS,
  buildNodeMap,
  currentLevel,
  distance,
  findHostWall,
  getCatalogItem,
  resolveSnap,
  toWallLocal,
  type EntityRef,
  type Vec2,
} from '@plan-b/shared';
import {
  addFurniture,
  addOpening,
  addRoomRectangle,
  addWall,
  moveFurniture,
  moveNode,
  moveOpening,
  moveWall,
  resizeFurniture,
  rotateFurniture,
  type WallAnchor,
} from '@/editor/commands';
import { useEditorStore, type ToolId } from '@/store/editor-store';
import { useProjectStore } from '@/store/project-store';
import { cn } from '@/lib/utils';
import { buildScene, furnitureHandles } from './scene';
import { hitTest } from './hit-test';
import { renderPlan, type Preview } from './renderer';
import { pixelsToMeters, screenToWorld, zoomAtPoint, type ViewportTransform } from './viewport';

const HIT_RADIUS_PX = 9;
const HANDLE_RADIUS_PX = 9;

type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; lastScreen: Vec2 }
  | { kind: 'move-furniture'; id: string; grabOffset: Vec2 }
  | { kind: 'rotate-furniture'; id: string }
  | { kind: 'resize-furniture'; id: string; corner: number; origin: Vec2; rotation: number }
  | { kind: 'move-node'; id: string }
  | { kind: 'move-wall'; id: string; lastWorld: Vec2 }
  | { kind: 'move-opening'; id: string }
  | { kind: 'draw-rect'; from: Vec2; to: Vec2 }
  | { kind: 'measure'; from: Vec2; to: Vec2 };

interface PointerState {
  interaction: Interaction;
  /** Set while the wall tool has an open chain. */
  wallAnchor: WallAnchor | null;
  pointer: Vec2 | null;
  placementRotation: number;
  spaceDown: boolean;
}

const cursorForTool = (tool: ToolId, panning: boolean): string => {
  if (panning) return 'grabbing';
  switch (tool) {
    case 'wall':
    case 'room':
      return 'crosshair';
    case 'door':
    case 'window':
    case 'furniture':
      return 'copy';
    case 'measure':
      return 'crosshair';
    default:
      return 'default';
  }
};

export function PlanCanvas({ className }: { className?: string }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const dirtyRef = useRef(true);
  const frameRef = useRef<number | null>(null);

  const pointerRef = useRef<PointerState>({
    interaction: { kind: 'none' },
    wallAnchor: null,
    pointer: null,
    placementRotation: 0,
    spaceDown: false,
  });

  const plan = useProjectStore((state) => state.plan);
  const dispatch = useProjectStore((state) => state.dispatch);

  const tool = useEditorStore((state) => state.tool);
  const selection = useEditorStore((state) => state.selection);
  const hovered = useEditorStore((state) => state.hovered);
  const viewport = useEditorStore((state) => state.viewport);
  const gridVisible = useEditorStore((state) => state.gridVisible);
  const dimensionsVisible = useEditorStore((state) => state.dimensionsVisible);
  const furnitureVisible = useEditorStore((state) => state.furnitureVisible);
  const pendingCatalogId = useEditorStore((state) => state.pendingCatalogId);
  const measurement = useEditorStore((state) => state.measurement);

  const level = useMemo(() => currentLevel(plan), [plan]);
  const scene = useMemo(() => buildScene(level), [level]);

  // Keep the latest values reachable from the imperative pointer handlers without making them
  // depend on every render.
  const latest = useRef({ scene, viewport, tool, selection, plan, measurement, pendingCatalogId });
  latest.current = { scene, viewport, tool, selection, plan, measurement, pendingCatalogId };

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const transform = useCallback(
    (): ViewportTransform => ({
      center: latest.current.viewport.center,
      zoom: latest.current.viewport.zoom,
      width: sizeRef.current.width,
      height: sizeRef.current.height,
    }),
    [],
  );

  const toWorld = useCallback(
    (event: { clientX: number; clientY: number }): Vec2 => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return screenToWorld(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        transform(),
      );
    },
    [transform],
  );

  const toScreenPoint = useCallback((event: { clientX: number; clientY: number }): Vec2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  /** Snap a raw world point using the plan settings and the current zoom. */
  const snap = useCallback(
    (point: Vec2, options?: { anchor?: Vec2 | null; excludeNodes?: ReadonlySet<string> }) => {
      const state = latest.current;
      const lvl = currentLevel(state.plan);
      const tolerance = pixelsToMeters(HIT_RADIUS_PX + 3, transform());

      return resolveSnap(point, {
        gridSize: state.plan.settings.gridSize,
        snapEnabled: state.plan.settings.snapEnabled,
        tolerance,
        nodes: lvl.nodes,
        walls: state.scene.walls.map((wall) => ({ id: wall.id, a: wall.a, b: wall.b })),
        excludeNodeIds: options?.excludeNodes,
        angleAnchor: options?.anchor ?? null,
      });
    },
    [transform],
  );

  // ── Render loop ──────────────────────────────────────────────────────────

  const buildPreview = useCallback((): Preview | null => {
    const state = pointerRef.current;
    const { tool: currentTool, scene: currentScene } = latest.current;

    if (state.interaction.kind === 'draw-rect') {
      return { kind: 'rect', from: state.interaction.from, to: state.interaction.to };
    }

    if (state.interaction.kind === 'measure') {
      return { kind: 'measure', from: state.interaction.from, to: state.interaction.to };
    }

    if (latest.current.measurement && currentTool === 'measure') {
      return {
        kind: 'measure',
        from: latest.current.measurement.from,
        to: latest.current.measurement.to,
      };
    }

    if (currentTool === 'wall' && state.wallAnchor && state.pointer) {
      const resolved = snap(state.pointer, { anchor: state.wallAnchor.point });
      return {
        kind: 'wall',
        from: state.wallAnchor.point,
        to: resolved.point,
        valid: distance(state.wallAnchor.point, resolved.point) >= GEOMETRY_LIMITS.minWallLength,
      };
    }

    if ((currentTool === 'door' || currentTool === 'window') && state.pointer) {
      const lvl = currentLevel(latest.current.plan);
      const nodes = buildNodeMap(lvl.nodes);
      const width = currentTool === 'door' ? 0.9 : 1.2;
      const host = findHostWall(state.pointer, lvl, nodes, pixelsToMeters(26, transform()), width);
      if (!host) return null;

      const wall = currentScene.wallById.get(host.wall.id);
      if (!wall) return null;

      const direction = { x: Math.cos(wall.angle), y: Math.sin(wall.angle) };
      return {
        kind: 'opening',
        openingKind: currentTool === 'door' ? 'door' : 'window',
        center: {
          x: wall.a.x + direction.x * host.offset,
          y: wall.a.y + direction.y * host.offset,
        },
        direction,
        width,
        thickness: wall.thickness,
        valid: true,
      };
    }

    if (currentTool === 'furniture' && latest.current.pendingCatalogId && state.pointer) {
      const catalog = getCatalogItem(latest.current.pendingCatalogId);
      if (!catalog) return null;
      const resolved = snap(state.pointer);
      return {
        kind: 'furniture',
        position: resolved.point,
        width: catalog.defaultSize.width,
        depth: catalog.defaultSize.depth,
        rotation: state.placementRotation,
      };
    }

    return null;
  }, [snap, transform]);

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>();
    const selectedWalls = new Set(
      selection.filter((ref) => ref.kind === 'wall').map((ref) => ref.id),
    );
    for (const wall of scene.walls) {
      if (selectedWalls.has(wall.id)) {
        ids.add(wall.nodeA);
        ids.add(wall.nodeB);
      }
    }
    for (const ref of selection) if (ref.kind === 'node') ids.add(ref.id);
    if (tool === 'wall') for (const node of scene.nodes) ids.add(node.id);
    return ids;
  }, [scene, selection, tool]);

  const visibleNodeIdsRef = useRef(visibleNodeIds);
  visibleNodeIdsRef.current = visibleNodeIds;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const draw = (): void => {
      frameRef.current = requestAnimationFrame(draw);
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      const { width, height } = sizeRef.current;
      if (width === 0 || height === 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      renderPlan(context, {
        scene: latest.current.scene,
        view: transform(),
        selection: latest.current.selection,
        hovered: useEditorStore.getState().hovered,
        gridVisible: useEditorStore.getState().gridVisible,
        gridSize: latest.current.plan.settings.gridSize,
        dimensionsVisible: useEditorStore.getState().dimensionsVisible,
        furnitureVisible: useEditorStore.getState().furnitureVisible,
        preview: buildPreview(),
      });
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [buildPreview, transform]);

  // Anything that changes the picture marks the canvas dirty.
  useEffect(markDirty, [
    markDirty,
    scene,
    viewport,
    selection,
    hovered,
    gridVisible,
    dimensionsVisible,
    furnitureVisible,
    tool,
    pendingCatalogId,
    measurement,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      sizeRef.current = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      markDirty();
    });

    observer.observe(container);
    sizeRef.current = { width: container.clientWidth, height: container.clientHeight };

    return () => observer.disconnect();
  }, [markDirty]);

  // ── Pointer interactions ─────────────────────────────────────────────────

  const beginInteraction = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): void => {
      const state = pointerRef.current;
      const world = toWorld(event);
      const screen = toScreenPoint(event);
      const editor = useEditorStore.getState();
      const currentScene = latest.current.scene;

      const wantsPan = event.button === 1 || event.button === 2 || state.spaceDown;
      if (wantsPan) {
        state.interaction = { kind: 'pan', lastScreen: screen };
        editor.setInteracting(true);
        return;
      }

      if (event.button !== 0) return;

      switch (editor.tool) {
        case 'wall': {
          const resolved = snap(world, { anchor: state.wallAnchor?.point ?? null });
          const anchor: WallAnchor = {
            point: resolved.point,
            nodeId: resolved.nodeId,
            wallId: resolved.wallId,
          };

          if (!state.wallAnchor) {
            state.wallAnchor = anchor;
          } else if (
            distance(state.wallAnchor.point, anchor.point) >= GEOMETRY_LIMITS.minWallLength
          ) {
            dispatch(addWall({ from: state.wallAnchor, to: anchor }));
            // Chain: the end of this wall becomes the start of the next one.
            state.wallAnchor = { point: anchor.point };
          }
          markDirty();
          return;
        }

        case 'room': {
          const resolved = snap(world);
          state.interaction = { kind: 'draw-rect', from: resolved.point, to: resolved.point };
          editor.setInteracting(true);
          return;
        }

        case 'door':
        case 'window': {
          const lvl = currentLevel(latest.current.plan);
          const nodes = buildNodeMap(lvl.nodes);
          const width = editor.tool === 'door' ? 0.9 : 1.2;
          const host = findHostWall(world, lvl, nodes, pixelsToMeters(26, transform()), width);
          if (!host) return;

          dispatch(
            addOpening({
              wallId: host.wall.id,
              kind: editor.tool === 'door' ? 'door' : 'window',
              offset: host.offset,
              width,
            }),
          );
          return;
        }

        case 'furniture': {
          if (!editor.pendingCatalogId) return;
          const resolved = snap(world);
          dispatch(
            addFurniture({
              catalogId: editor.pendingCatalogId,
              position: resolved.point,
              rotation: state.placementRotation,
            }),
          );
          return;
        }

        case 'measure': {
          const resolved = snap(world);
          state.interaction = { kind: 'measure', from: resolved.point, to: resolved.point };
          editor.setMeasurement(null);
          editor.setInteracting(true);
          return;
        }

        default:
          break;
      }

      // ── Select tool ────────────────────────────────────────────────────
      const selectedFurniture = editor.selection.filter((ref) => ref.kind === 'furniture');

      if (selectedFurniture.length === 1) {
        const item = currentScene.furniture.find(
          (candidate) => candidate.id === selectedFurniture[0]!.id,
        );

        if (item && !item.locked) {
          const handles = furnitureHandles(item);
          const handleTolerance = pixelsToMeters(HANDLE_RADIUS_PX, transform());

          if (distance(world, handles.rotate) <= handleTolerance) {
            state.interaction = { kind: 'rotate-furniture', id: item.id };
            editor.setInteracting(true);
            return;
          }

          const cornerIndex = handles.corners.findIndex(
            (corner) => distance(world, corner) <= handleTolerance,
          );
          if (cornerIndex >= 0) {
            state.interaction = {
              kind: 'resize-furniture',
              id: item.id,
              corner: cornerIndex,
              origin: item.position,
              rotation: item.rotation,
            };
            editor.setInteracting(true);
            return;
          }
        }
      }

      const hit = hitTest(currentScene, world, {
        tolerance: pixelsToMeters(HIT_RADIUS_PX, transform()),
        visibleNodeIds: visibleNodeIdsRef.current,
        ignore: furnitureVisible ? undefined : new Set<EntityRef['kind']>(['furniture']),
      });

      if (!hit) {
        if (!event.shiftKey) editor.clearSelection();
        state.interaction = { kind: 'pan', lastScreen: screen };
        editor.setInteracting(true);
        return;
      }

      editor.select(hit.ref, { additive: event.shiftKey });

      switch (hit.ref.kind) {
        case 'furniture': {
          const item = currentScene.furniture.find((candidate) => candidate.id === hit.ref.id);
          if (!item || item.locked) break;
          state.interaction = {
            kind: 'move-furniture',
            id: item.id,
            grabOffset: { x: world.x - item.position.x, y: world.y - item.position.y },
          };
          editor.setInteracting(true);
          break;
        }
        case 'node':
          state.interaction = { kind: 'move-node', id: hit.ref.id };
          editor.setInteracting(true);
          break;
        case 'wall':
          state.interaction = { kind: 'move-wall', id: hit.ref.id, lastWorld: world };
          editor.setInteracting(true);
          break;
        case 'opening':
          state.interaction = { kind: 'move-opening', id: hit.ref.id };
          editor.setInteracting(true);
          break;
        default:
          break;
      }
    },
    [dispatch, furnitureVisible, markDirty, snap, toScreenPoint, toWorld, transform],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): void => {
      // Capture keeps a drag alive when the pointer leaves the canvas. Some synthetic events
      // (tests, assistive tech) carry an id the browser does not know, which throws.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* capture is an optimisation, not a requirement */
      }
      beginInteraction(event);
      markDirty();
    },
    [beginInteraction, markDirty],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): void => {
      const state = pointerRef.current;
      const world = toWorld(event);
      const screen = toScreenPoint(event);
      state.pointer = world;

      const editor = useEditorStore.getState();
      const interaction = state.interaction;

      switch (interaction.kind) {
        case 'pan': {
          const view = transform();
          const dx = (screen.x - interaction.lastScreen.x) / view.zoom;
          const dy = (screen.y - interaction.lastScreen.y) / view.zoom;
          interaction.lastScreen = screen;
          editor.panBy({ x: -dx, y: -dy });
          return;
        }

        case 'move-furniture': {
          const target = {
            x: world.x - interaction.grabOffset.x,
            y: world.y - interaction.grabOffset.y,
          };
          dispatch(moveFurniture(interaction.id, snap(target).point));
          return;
        }

        case 'rotate-furniture': {
          const item = latest.current.scene.furniture.find(
            (candidate) => candidate.id === interaction.id,
          );
          if (!item) return;
          // The handle sits in front of the item, so the rotation is the pointer angle plus 90°.
          const angle =
            Math.atan2(world.y - item.position.y, world.x - item.position.x) + Math.PI / 2;
          const step = event.shiftKey ? Math.PI / 36 : Math.PI / 12;
          dispatch(rotateFurniture(interaction.id, Math.round(angle / step) * step));
          return;
        }

        case 'resize-furniture': {
          const cos = Math.cos(-interaction.rotation);
          const sin = Math.sin(-interaction.rotation);
          const dx = world.x - interaction.origin.x;
          const dy = world.y - interaction.origin.y;
          const localX = dx * cos - dy * sin;
          const localY = dx * sin + dy * cos;

          dispatch(
            resizeFurniture(interaction.id, {
              width: Math.abs(localX) * 2,
              depth: Math.abs(localY) * 2,
            }),
          );
          return;
        }

        case 'move-node': {
          const resolved = snap(world, { excludeNodes: new Set([interaction.id]) });
          dispatch(moveNode(interaction.id, resolved.point));
          return;
        }

        case 'move-wall': {
          const resolvedNow = snap(world);
          const delta = {
            x: resolvedNow.point.x - interaction.lastWorld.x,
            y: resolvedNow.point.y - interaction.lastWorld.y,
          };
          if (Math.abs(delta.x) < 1e-6 && Math.abs(delta.y) < 1e-6) return;
          interaction.lastWorld = resolvedNow.point;
          dispatch(moveWall(interaction.id, delta));
          return;
        }

        case 'move-opening': {
          const lvl = currentLevel(latest.current.plan);
          const opening = lvl.openings.find((candidate) => candidate.id === interaction.id);
          if (!opening) return;
          const wall = lvl.walls.find((candidate) => candidate.id === opening.wallId);
          if (!wall) return;

          const local = toWallLocal(world, wall, buildNodeMap(lvl.nodes));
          if (!local) return;
          dispatch(moveOpening(interaction.id, local.along));
          return;
        }

        case 'draw-rect': {
          interaction.to = snap(world).point;
          markDirty();
          return;
        }

        case 'measure': {
          interaction.to = snap(world).point;
          markDirty();
          return;
        }

        default:
          break;
      }

      // Idle: hover feedback and tool previews.
      if (editor.tool === 'select') {
        const hit = hitTest(latest.current.scene, world, {
          tolerance: pixelsToMeters(HIT_RADIUS_PX, transform()),
          visibleNodeIds: visibleNodeIdsRef.current,
          ignore: furnitureVisible ? undefined : new Set<EntityRef['kind']>(['furniture']),
        });
        editor.setHovered(hit?.ref ?? null);
      } else if (editor.hovered) {
        editor.setHovered(null);
      }

      markDirty();
    },
    [dispatch, furnitureVisible, markDirty, snap, toScreenPoint, toWorld, transform],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): void => {
      const state = pointerRef.current;
      const editor = useEditorStore.getState();
      const interaction = state.interaction;

      if (interaction.kind === 'draw-rect') {
        dispatch(addRoomRectangle(interaction.from, interaction.to));
      }

      if (interaction.kind === 'measure') {
        if (distance(interaction.from, interaction.to) > 0.01) {
          editor.setMeasurement({ from: interaction.from, to: interaction.to });
        }
      }

      state.interaction = { kind: 'none' };
      editor.setInteracting(false);

      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        /* nothing to release */
      }

      markDirty();
    },
    [dispatch, markDirty],
  );

  const handleWheel = useCallback(
    (event: WheelEvent): void => {
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const factor = Math.exp(-event.deltaY * 0.0016);
      const next = zoomAtPoint(transform(), anchor, factor);

      useEditorStore.getState().setViewport(next);
      markDirty();
    },
    [markDirty, transform],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Registered manually so the listener can be non-passive and call preventDefault.
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Space pans, Escape cancels an open wall chain or placement.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Space') pointerRef.current.spaceDown = true;

      if (event.key === 'Escape') {
        pointerRef.current.wallAnchor = null;
        useEditorStore.getState().armCatalogItem(null);
        markDirty();
      }

      if ((event.key === 'r' || event.key === 'R') && useEditorStore.getState().pendingCatalogId) {
        pointerRef.current.placementRotation += Math.PI / 2;
        markDirty();
      }
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') pointerRef.current.spaceDown = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [markDirty]);

  // Reset the open wall chain whenever the tool changes.
  useEffect(() => {
    pointerRef.current.wallAnchor = null;
    markDirty();
  }, [tool, markDirty]);

  // ── Drag and drop from the catalog ───────────────────────────────────────

  const handleDragOver = useCallback((event: React.DragEvent<HTMLCanvasElement>): void => {
    if (!event.dataTransfer.types.includes('application/x-plan-b-item')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLCanvasElement>): void => {
      const catalogId = event.dataTransfer.getData('application/x-plan-b-item');
      if (!catalogId || !getCatalogItem(catalogId)) return;

      event.preventDefault();
      const resolved = snap(toWorld(event));
      dispatch(
        addFurniture({
          catalogId,
          position: resolved.point,
          rotation: pointerRef.current.placementRotation,
        }),
      );
      markDirty();
    },
    [dispatch, markDirty, snap, toWorld],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>): void => {
      const world = toWorld(event);
      const hit = hitTest(latest.current.scene, world, {
        tolerance: pixelsToMeters(HIT_RADIUS_PX, transform()),
      });
      if (hit) {
        useEditorStore.getState().select(hit.ref);
        useEditorStore.getState().setInspectorOpen(true);
      }
    },
    [toWorld, transform],
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>): void => {
      event.preventDefault();
      pointerRef.current.wallAnchor = null;
      markDirty();
    },
    [markDirty],
  );

  return (
    <div ref={containerRef} className={cn('relative size-full overflow-hidden', className)}>
      <canvas
        ref={canvasRef}
        className="size-full touch-none select-none"
        style={{ cursor: cursorForTool(tool, pointerRef.current.interaction.kind === 'pan') }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          pointerRef.current.pointer = null;
          useEditorStore.getState().setHovered(null);
          markDirty();
        }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        role="application"
        aria-label="Planta baixa — área de edição"
      />
    </div>
  );
}
