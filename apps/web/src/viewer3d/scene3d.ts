import {
  buildNodeMap,
  getCatalogItem,
  openingsOfWall,
  resolveMaterialSlots,
  resolveParts,
  wallExtensions,
  wallQuad,
  wallSolidSegments,
  type Level,
  type OpeningKind,
  type PartShape,
  type Vec2,
} from '@spacecraft/shared';

/**
 * Derived 3D geometry, built once per document change.
 *
 * Plan space `(x, y)` maps to world `(x, z)` and elevation is `+Y`. A plan rotation of `r` is a
 * three.js rotation of `-r` about Y, because the plan's `y` axis points south while three's `z`
 * points towards the viewer. `planRotationToThree` is the only place that conversion happens.
 */

export const planRotationToThree = (rotation: number): number => -rotation;

export interface Box3D {
  key: string;
  position: [number, number, number];
  size: [number, number, number];
  rotationY: number;
  materialId: string;
  /** The entity this box belongs to, for picking and highlighting. */
  ownerId: string;
}

export interface GlassPane {
  key: string;
  position: [number, number, number];
  size: [number, number, number];
  rotationY: number;
  ownerId: string;
}

export interface DoorLeaf {
  key: string;
  /** Hinge position in world space. */
  position: [number, number, number];
  size: [number, number, number];
  rotationY: number;
  materialId: string;
  ownerId: string;
}

export interface FloorShape3D {
  id: string;
  /** Polygon in plan coordinates; the renderer flips `y` into `z`. */
  points: Vec2[];
  materialId: string;
}

export interface Part3D {
  key: string;
  shape: PartShape;
  position: [number, number, number];
  size: [number, number, number];
  materialId: string;
  emissive: boolean;
}

export interface Furniture3D {
  id: string;
  position: [number, number, number];
  rotationY: number;
  /** Bounding box used for the selection outline and the transform gizmo. */
  bounds: { width: number; height: number; depth: number };
  parts: Part3D[];
  /** Lamps carry a real light source. */
  light: { position: [number, number, number]; intensity: number } | null;
}

/**
 * Everything belonging to one wall, kept together so the cutaway view can hide a wall and its
 * joinery as a single unit instead of leaving door frames floating in mid-air.
 */
export interface WallGroup3D {
  id: string;
  /** Centre of the wall in plan coordinates. */
  center: Vec2;
  /** Unit normal of the wall in plan coordinates. */
  normal: Vec2;
  boxes: Box3D[];
  frames: Box3D[];
  glass: GlassPane[];
  doors: DoorLeaf[];
}

export interface Scene3D {
  walls: WallGroup3D[];
  floors: FloorShape3D[];
  furniture: Furniture3D[];
  /** Tallest wall, used to place the camera and the key light. */
  maxHeight: number;
}

const FRAME_DEPTH_RATIO = 1.12;
const FRAME_THICKNESS = 0.05;

export function buildScene3D(level: Level): Scene3D {
  const nodes = buildNodeMap(level.nodes);

  const walls: WallGroup3D[] = [];
  let maxHeight = 0;

  for (const wall of level.walls) {
    const extensions = wallExtensions(wall, level.walls, nodes);
    const quad = wallQuad(wall, nodes, extensions);
    if (!quad) continue;

    maxHeight = Math.max(maxHeight, wall.height);

    const direction: Vec2 = {
      x: (quad.end.x - quad.start.x) / quad.length,
      y: (quad.end.y - quad.start.y) / quad.length,
    };
    const angle = Math.atan2(direction.y, direction.x);
    const openings = openingsOfWall(wall.id, level.openings);

    const group: WallGroup3D = {
      id: wall.id,
      center: { x: (quad.start.x + quad.end.x) / 2, y: (quad.start.y + quad.end.y) / 2 },
      normal: { x: -direction.y, y: direction.x },
      boxes: [],
      frames: [],
      glass: [],
      doors: [],
    };

    const segments = wallSolidSegments(quad.length, wall.height, openings, extensions.start);

    segments.forEach((segment, index) => {
      const spanLength = segment.end - segment.start;
      const spanHeight = segment.top - segment.bottom;
      if (spanLength <= 1e-4 || spanHeight <= 1e-4) return;

      const along = (segment.start + segment.end) / 2;

      group.boxes.push({
        key: `${wall.id}:${index}`,
        position: [
          quad.start.x + direction.x * along,
          (segment.bottom + segment.top) / 2,
          quad.start.y + direction.y * along,
        ],
        size: [spanLength, spanHeight, wall.thickness],
        rotationY: planRotationToThree(angle),
        materialId: wall.materialId,
        ownerId: wall.id,
      });
    });

    // Reveal and joinery around each hole.
    for (const opening of openings) {
      const along = opening.offset + extensions.start;
      const center: [number, number, number] = [
        quad.start.x + direction.x * along,
        0,
        quad.start.y + direction.y * along,
      ];
      const rotationY = planRotationToThree(angle);
      const depth = wall.thickness * FRAME_DEPTH_RATIO;

      const head = opening.sillHeight + opening.height;

      // Jambs on both sides.
      for (const side of [-1, 1] as const) {
        group.frames.push({
          key: `${opening.id}:jamb:${side}`,
          position: [
            center[0] + direction.x * ((side * (opening.width - FRAME_THICKNESS)) / 2),
            opening.sillHeight + opening.height / 2,
            center[2] + direction.y * ((side * (opening.width - FRAME_THICKNESS)) / 2),
          ],
          size: [FRAME_THICKNESS, opening.height, depth],
          rotationY,
          materialId: 'white-plaster',
          ownerId: opening.id,
        });
      }

      // Lintel.
      group.frames.push({
        key: `${opening.id}:head`,
        position: [center[0], head - FRAME_THICKNESS / 2, center[2]],
        size: [opening.width, FRAME_THICKNESS, depth],
        rotationY,
        materialId: 'white-plaster',
        ownerId: opening.id,
      });

      if (opening.kind === 'window') {
        group.frames.push({
          key: `${opening.id}:sill`,
          position: [center[0], opening.sillHeight + FRAME_THICKNESS / 2, center[2]],
          size: [opening.width, FRAME_THICKNESS, depth],
          rotationY,
          materialId: 'white-plaster',
          ownerId: opening.id,
        });

        group.glass.push({
          key: `${opening.id}:glass`,
          position: [center[0], opening.sillHeight + opening.height / 2, center[2]],
          size: [opening.width - FRAME_THICKNESS * 2, opening.height - FRAME_THICKNESS * 2, 0.015],
          rotationY,
          ownerId: opening.id,
        });
      } else {
        // A door leaf standing open, hinged on the same side the plan symbol swings from.
        const hingeSign = opening.flipped ? 1 : -1;
        const hinge: [number, number, number] = [
          center[0] + (direction.x * hingeSign * opening.width) / 2,
          0,
          center[2] + (direction.y * hingeSign * opening.width) / 2,
        ];

        group.doors.push({
          key: `${opening.id}:leaf`,
          position: hinge,
          size: [opening.width - FRAME_THICKNESS, opening.height - FRAME_THICKNESS, 0.04],
          rotationY: planRotationToThree(angle + (hingeSign * Math.PI) / 2),
          materialId: 'white-plaster',
          ownerId: opening.id,
        });
      }
    }

    walls.push(group);
  }

  const floors: FloorShape3D[] = level.rooms
    .map((room) => ({
      id: room.id,
      materialId: room.floorMaterialId,
      points: room.nodeIds
        .map((id) => nodes.get(id))
        .filter((node): node is NonNullable<typeof node> => Boolean(node))
        .map((node) => ({ x: node.x, y: node.y })),
    }))
    .filter((floor) => floor.points.length >= 3);

  const furniture: Furniture3D[] = level.furniture.map((item) => {
    const catalog = getCatalogItem(item.catalogId);
    const slots = resolveMaterialSlots(item.catalogId, item.materialId);
    const resolved = resolveParts(item.catalogId, item.size);

    const parts: Part3D[] = resolved.map((part, index) => ({
      key: `${item.id}:${index}`,
      shape: part.shape,
      position: [part.center.x, part.center.y, part.center.z],
      size: [part.size.x, part.size.y, part.size.z],
      materialId:
        part.slot === 'secondary'
          ? slots.secondary
          : part.slot === 'accent'
            ? slots.accent
            : slots.primary,
      emissive: part.slot === 'light',
    }));

    const emissive = parts.find((part) => part.emissive);

    return {
      id: item.id,
      position: [item.position.x, item.elevation, item.position.y],
      rotationY: planRotationToThree(item.rotation),
      bounds: { width: item.size.width, height: item.size.height, depth: item.size.depth },
      parts,
      light:
        emissive && catalog?.category === 'iluminacao'
          ? { position: emissive.position, intensity: 3.2 }
          : null,
    };
  });

  return {
    walls,
    floors,
    furniture,
    maxHeight: maxHeight || 2.7,
  };
}

export type { OpeningKind };
