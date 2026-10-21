import { z } from 'zod';
import type { Project } from '../domain/types';
import { migratableFloorPlanSchema } from './plan';

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, 'Dê um nome ao projeto.')
  .max(120, 'O nome do projeto é muito longo.');

export const projectSchema = z.object({
  id: z.string().min(1),
  name: projectNameSchema,
  plan: migratableFloorPlanSchema,
  createdAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  updatedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  workspaceId: z.string().min(1).optional(),
});

/** Body accepted by `POST /projects`. */
export const createProjectSchema = z.object({
  name: projectNameSchema,
  plan: migratableFloorPlanSchema,
});

/** Body accepted by `PATCH /projects/:id` — every field is optional. */
export const updateProjectSchema = z
  .object({
    name: projectNameSchema.optional(),
    plan: migratableFloorPlanSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.plan !== undefined, {
    message: 'Envie ao menos um campo para atualizar.',
  });

export const duplicateProjectSchema = z.object({
  name: projectNameSchema.optional(),
});

/** Shape returned by `GET /projects` — the plan is replaced by cheap summary counters. */
export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  schemaVersion: z.number(),
  stats: z.object({
    rooms: z.number(),
    walls: z.number(),
    furniture: z.number(),
    floorArea: z.number(),
  }),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type DuplicateProjectInput = z.infer<typeof duplicateProjectSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export interface ProjectParseResult {
  ok: boolean;
  project?: Project;
  errors: string[];
}

/**
 * Parses an arbitrary payload — a `.spacecraft.json` file, a localStorage entry or an API
 * response — migrating old schema versions before validating.
 */
export function parseProject(value: unknown): ProjectParseResult {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, errors: ['O arquivo não contém um projeto válido.'] };
  }

  // `projectSchema` migrates the nested plan itself, so the payload goes in untouched.
  const result = projectSchema.safeParse(value);

  if (result.success) {
    return { ok: true, project: result.data as Project, errors: [] };
  }

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}
