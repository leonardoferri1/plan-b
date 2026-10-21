import {
  buildNodeMap,
  getCatalogItem,
  openingsOfWall,
  resolveMaterialSlots,
  resolveParts,
  solidPieceFootprint,
  solveJunctions,
  wallLength,
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

/**
 * A solid piece of wall: a vertical prism over a plan footprint.
 *
 * Wall bodies are prisms rather than boxes because their ends are mitered against their
 * neighbours. That is what keeps two walls meeting at a corner from sharing a volume — and
 * therefore from sharing coplanar faces the depth buffer cannot order.
 */
export interface Prism3D {
  key: string;
  /** Plan-space polygon; the renderer lifts it into the XZ plane. */
  footprint: Vec2[];
  bottom: number;
  top: number;
  materialId: string;
  ownerId: string;
  /** For a junction filler, the walls it joins; the cutaway hides it with the last of them. */
  joins?: string[];
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
  pieces: Prism3D[];
  frames: Box3D[];
  glass: GlassPane[];
  doors: DoorLeaf[];
}

export interface Scene3D {
  walls: WallGroup3D[];
  /** Fillers where three or more walls meet, emitted once each. */
  junctions: Prism3D[];
  floors: FloorShape3D[];
  furniture: Furniture3D[];
  /** Tallest wall, used to place the camera and the key light. */
  maxHeight: number;
}

const FRAME_DEPTH_RATIO = 1.12;
const FRAME_THICKNESS = 0.05;
/**
 * How far a lining is pushed into the surrounding wall.
 *
 * A reveal that stopped exactly at the opening would put its outer face in the same plane as
 * the wall's cut face, which is the other way this scene used to produce z-fighting. Burying
 * it keeps every shared surface strictly inside a solid, where it cannot be seen or fought
 * over.
 */
const FRAME_EMBED = FRAME_THICKNESS * 0.6;

export function buildScene3D(level: Level): Scene3D {
  const nodes = buildNodeMap(level.nodes);
  const junctions = solveJunctions(nodes, level.walls);

  const walls: WallGroup3D[] = [];
  let maxHeight = 0;

  for (const wall of level.walls) {
    const start = nodes.get(wall.a);
    const end = nodes.get(wall.b);
    if (!start || !end) continue;

    const length = wallLength(wall, nodes);
    if (length <= 1e-6) continue;

    maxHeight = Math.max(maxHeight, wall.height);

    const direction: Vec2 = {
      x: (end.x - start.x) / length,
      y: (end.y - start.y) / length,
    };
    const angle = Math.atan2(direction.y, direction.x);
    const openings = openingsOfWall(wall.id, level.openings);
    const trim = junctions.walls.get(wall.id);

    const group: WallGroup3D = {
      id: wall.id,
      center: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      normal: { x: -direction.y, y: direction.x },
      pieces: [],
      frames: [],
      glass: [],
      doors: [],
    };

    const segments = wallSolidSegments(length, wall.height, openings, 0);

    segments.forEach((segment, index) => {
      const spanLength = segment.end - segment.start;
      const spanHeight = segment.top - segment.bottom;
      if (spanLength <= 1e-4 || spanHeight <= 1e-4) return;

      const footprint = solidPieceFootprint(wall, nodes, segment, trim);
      if (!footprint) return;

      group.pieces.push({
        key: `${wall.id}:${index}`,
        footprint,
        bottom: segment.bottom,
        top: segment.top,
        materialId: wall.materialId,
        ownerId: wall.id,
      });
    });

    // Reveal and joinery around each hole.
    for (const opening of openings) {
      // Openings are measured from node A along the centerline, which the miter does not move.
      const along = opening.offset;
      const center: [number, number, number] = [
        start.x + direction.x * along,
        0,
        start.y + direction.y * along,
      ];
      const rotationY = planRotationToThree(angle);
      const depth = wall.thickness * FRAME_DEPTH_RATIO;

      const head = opening.sillHeight + opening.height;

      // Jambs on both sides, each reaching back into the wall.
      for (const side of [-1, 1] as const) {
        const jambLength = FRAME_THICKNESS + FRAME_EMBED;
        const jambCentre = (opening.width - FRAME_THICKNESS + FRAME_EMBED) / 2;

        group.frames.push({
          key: `${opening.id}:jamb:${side}`,
          position: [
            center[0] + direction.x * side * jambCentre,
            opening.sillHeight + opening.height / 2,
            center[2] + direction.y * side * jambCentre,
          ],
          size: [jambLength, opening.height, depth],
          rotationY,
          materialId: 'white-plaster',
          ownerId: opening.id,
        });
      }

      // Lintel, reaching up into the wall above.
      group.frames.push({
        key: `${opening.id}:head`,
        position: [center[0], head - FRAME_THICKNESS / 2 + FRAME_EMBED / 2, center[2]],
        size: [opening.width, FRAME_THICKNESS + FRAME_EMBED, depth],
        rotationY,
        materialId: 'white-plaster',
        ownerId: opening.id,
      });

      if (opening.kind === 'window') {
        group.frames.push({
          key: `${opening.id}:sill`,
          position: [
            center[0],
            opening.sillHeight + FRAME_THICKNESS / 2 - FRAME_EMBED / 2,
            center[2],
          ],
          size: [opening.width, FRAME_THICKNESS + FRAME_EMBED, depth],
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
        // A door leaf standing open. The hand picks the hinged end, the swing side picks which
        // face of the wall it sweeps across — the same two booleans the plan symbol reads, so
        // the two views always show the same door.
        const hingeSign = opening.flipped ? 1 : -1;
        const swingSign = opening.swingReversed ? -1 : 1;
        const hinge: [number, number, number] = [
          center[0] + (direction.x * hingeSign * opening.width) / 2,
          0,
          center[2] + (direction.y * hingeSign * opening.width) / 2,
        ];

        group.doors.push({
          key: `${opening.id}:leaf`,
          position: hinge,
          size: [opening.width - FRAME_THICKNESS, opening.height - FRAME_THICKNESS, 0.04],
          rotationY: planRotationToThree(angle + (hingeSign * swingSign * Math.PI) / 2),
          materialId: 'white-plaster',
          ownerId: opening.id,
        });
      }
    }

    walls.push(group);
  }

  const junctionPrisms: Prism3D[] = [];

  for (const [nodeId, footprint] of junctions.blocks) {
    const incident = level.walls.filter((wall) => wall.a === nodeId || wall.b === nodeId);
    const tallest = incident.reduce(
      (best, wall) => (wall.height > best.height ? wall : best),
      incident[0]!,
    );
    if (!tallest) continue;

    junctionPrisms.push({
      key: `junction:${nodeId}`,
      footprint,
      bottom: 0,
      top: tallest.height,
      materialId: tallest.materialId,
      ownerId: tallest.id,
      joins: incident.map((wall) => wall.id),
    });
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
    junctions: junctionPrisms,
    floors,
    furniture,
    maxHeight: maxHeight || 2.7,
  };
}

export type { OpeningKind };
