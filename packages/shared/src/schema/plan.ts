import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, GEOMETRY_LIMITS } from '../domain/types';
import type { FloorPlan, Level } from '../domain/types';
import { catalogExists } from '../catalog/furniture';
import { materialExists } from '../catalog/materials';

const finite = (label: string) =>
  z
    .number()
    .finite(`${label} precisa ser um número finito.`)
    .refine((value) => !Number.isNaN(value), `${label} inválido.`);

export const vec2Schema = z.object({
  x: finite('x'),
  y: finite('y'),
});

export const wallNodeSchema = z.object({
  id: z.string().min(1),
  x: finite('x'),
  y: finite('y'),
});

export const wallSchema = z
  .object({
    id: z.string().min(1),
    a: z.string().min(1),
    b: z.string().min(1),
    thickness: z
      .number()
      .min(GEOMETRY_LIMITS.minWallThickness)
      .max(GEOMETRY_LIMITS.maxWallThickness),
    height: z.number().min(GEOMETRY_LIMITS.minWallHeight).max(GEOMETRY_LIMITS.maxWallHeight),
    materialId: z.string().min(1),
  })
  .refine((wall) => wall.a !== wall.b, {
    message: 'Uma parede não pode começar e terminar no mesmo ponto.',
    path: ['b'],
  });

export const openingSchema = z.object({
  id: z.string().min(1),
  wallId: z.string().min(1),
  kind: z.enum(['door', 'window']),
  offset: z.number().min(0),
  width: z.number().min(GEOMETRY_LIMITS.minOpeningWidth).max(GEOMETRY_LIMITS.maxOpeningWidth),
  height: z.number().min(GEOMETRY_LIMITS.minOpeningHeight).max(GEOMETRY_LIMITS.maxWallHeight),
  sillHeight: z.number().min(0).max(GEOMETRY_LIMITS.maxWallHeight),
  flipped: z.boolean(),
});

export const roomSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  nodeIds: z.array(z.string().min(1)).min(3, 'Um ambiente precisa de ao menos três cantos.'),
  floorMaterialId: z.string().min(1),
  autoNamed: z.boolean(),
});

export const size3Schema = z.object({
  width: z.number().min(GEOMETRY_LIMITS.minFurnitureSize).max(GEOMETRY_LIMITS.maxFurnitureSize),
  depth: z.number().min(GEOMETRY_LIMITS.minFurnitureSize).max(GEOMETRY_LIMITS.maxFurnitureSize),
  height: z.number().min(GEOMETRY_LIMITS.minFurnitureSize).max(GEOMETRY_LIMITS.maxFurnitureSize),
});

export const furnitureItemSchema = z.object({
  id: z.string().min(1),
  catalogId: z.string().min(1),
  name: z.string().min(1).max(80),
  position: vec2Schema,
  rotation: finite('rotação'),
  size: size3Schema,
  materialId: z.string().min(1),
  elevation: z.number().min(0).max(10),
  locked: z.boolean(),
});

export const planSettingsSchema = z.object({
  gridSize: z.number().min(0.05).max(5),
  snapEnabled: z.boolean(),
  defaultWallHeight: z
    .number()
    .min(GEOMETRY_LIMITS.minWallHeight)
    .max(GEOMETRY_LIMITS.maxWallHeight),
  defaultWallThickness: z
    .number()
    .min(GEOMETRY_LIMITS.minWallThickness)
    .max(GEOMETRY_LIMITS.maxWallThickness),
  wallMaterialId: z.string().min(1),
  floorMaterialId: z.string().min(1),
});

export const levelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(80),
    elevation: finite('elevação'),
    nodes: z.array(wallNodeSchema),
    walls: z.array(wallSchema),
    openings: z.array(openingSchema),
    rooms: z.array(roomSchema),
    furniture: z.array(furnitureItemSchema),
  })
  .superRefine((level, ctx) => {
    const nodeIds = new Set(level.nodes.map((node) => node.id));
    const wallIds = new Set(level.walls.map((wall) => wall.id));

    level.walls.forEach((wall, index) => {
      if (!nodeIds.has(wall.a) || !nodeIds.has(wall.b)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['walls', index],
          message: `A parede ${wall.id} aponta para um canto inexistente.`,
        });
      }
    });

    level.openings.forEach((opening, index) => {
      if (!wallIds.has(opening.wallId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['openings', index],
          message: `A abertura ${opening.id} aponta para uma parede inexistente.`,
        });
      }
    });

    level.rooms.forEach((room, index) => {
      const missing = room.nodeIds.find((id) => !nodeIds.has(id));
      if (missing) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rooms', index],
          message: `O ambiente ${room.name} aponta para um canto inexistente.`,
        });
      }
    });

    level.furniture.forEach((item, index) => {
      if (!catalogExists(item.catalogId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['furniture', index, 'catalogId'],
          message: `Móvel desconhecido: ${item.catalogId}.`,
        });
      }
      if (!materialExists(item.materialId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['furniture', index, 'materialId'],
          message: `Material desconhecido: ${item.materialId}.`,
        });
      }
    });
  });

export const floorPlanSchema = z.object({
  schemaVersion: z.number().int().min(1).max(CURRENT_SCHEMA_VERSION),
  levels: z.array(levelSchema).min(1, 'A planta precisa de ao menos um pavimento.'),
  settings: planSettingsSchema,
});

export type FloorPlanInput = z.input<typeof floorPlanSchema>;
export type FloorPlanOutput = z.output<typeof floorPlanSchema>;

// Compile-time guarantee that the schema and the hand-written domain types stay aligned.
type AssertAssignable<A extends B, B> = A;
export type _LevelMatchesSchema = AssertAssignable<z.infer<typeof levelSchema>, Level>;
export type _PlanMatchesSchema = AssertAssignable<z.infer<typeof floorPlanSchema>, FloorPlan>;

export interface ValidationResult {
  ok: boolean;
  plan?: FloorPlan;
  errors: string[];
}

/** Human-readable validation used by the JSON import flow and by the API boundary. */
export function validateFloorPlan(value: unknown): ValidationResult {
  const result = floorPlanSchema.safeParse(value);

  if (result.success) {
    return { ok: true, plan: result.data as FloorPlan, errors: [] };
  }

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}
