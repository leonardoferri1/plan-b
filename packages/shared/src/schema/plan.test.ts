import { describe, expect, it } from 'vitest';
import { createSamplePlan, createSampleProject } from '../samples/apartment';
import { CURRENT_SCHEMA_VERSION } from '../domain/types';
import { floorPlanSchema, migratableFloorPlanSchema, validateFloorPlan } from './plan';
import { parseProject } from './project';
import { UnsupportedSchemaVersionError, detectSchemaVersion, migratePlan } from './migrations';

describe('validateFloorPlan', () => {
  it('accepts the sample plan', () => {
    const result = validateFloorPlan(createSamplePlan());

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('survives a JSON round trip without losing geometry', () => {
    const plan = createSamplePlan();
    const restored = validateFloorPlan(JSON.parse(JSON.stringify(plan)));

    expect(restored.ok).toBe(true);
    expect(restored.plan).toEqual(plan);
  });

  it('rejects a plan with no levels', () => {
    const result = validateFloorPlan({ ...createSamplePlan(), levels: [] });

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('pavimento');
  });

  it('rejects a wall pointing at a missing node', () => {
    const plan = createSamplePlan();
    plan.levels[0]!.walls[0]!.a = 'nope';

    const result = validateFloorPlan(plan);

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('canto inexistente');
  });

  it('rejects an opening pointing at a missing wall', () => {
    const plan = createSamplePlan();
    plan.levels[0]!.openings[0]!.wallId = 'nope';

    expect(validateFloorPlan(plan).ok).toBe(false);
  });

  it('rejects a degenerate wall', () => {
    const plan = createSamplePlan();
    plan.levels[0]!.walls[0]!.b = plan.levels[0]!.walls[0]!.a;

    expect(validateFloorPlan(plan).ok).toBe(false);
  });

  it('rejects an unknown furniture material', () => {
    const plan = createSamplePlan();
    plan.levels[0]!.furniture[0]!.materialId = 'unobtainium';

    const result = validateFloorPlan(plan);

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('Material desconhecido');
  });

  it('rejects an unknown catalog id', () => {
    const plan = createSamplePlan();
    plan.levels[0]!.furniture[0]!.catalogId = 'teleporter';

    expect(validateFloorPlan(plan).ok).toBe(false);
  });

  it('rejects out-of-range wall thickness', () => {
    const plan = createSamplePlan();
    plan.levels[0]!.walls[0]!.thickness = 5;

    expect(validateFloorPlan(plan).ok).toBe(false);
  });

  it('rejects non-finite coordinates', () => {
    const plan = createSamplePlan();
    plan.levels[0]!.nodes[0]!.x = Number.POSITIVE_INFINITY;

    expect(validateFloorPlan(plan).ok).toBe(false);
  });
});

describe('parseProject', () => {
  it('accepts a serialized project', () => {
    const project = createSampleProject();
    const result = parseProject(JSON.parse(JSON.stringify(project)));

    expect(result.errors).toEqual([]);
    expect(result.project?.plan).toEqual(project.plan);
  });

  it('rejects a non-object payload', () => {
    expect(parseProject('nope').ok).toBe(false);
    expect(parseProject(null).ok).toBe(false);
  });

  it('rejects a project without a name', () => {
    const project = { ...createSampleProject(), name: '' };
    expect(parseProject(project).ok).toBe(false);
  });
});

describe('schema v1 -> v2', () => {
  /** A plan as an older build would have written it: no swing side on the openings. */
  const legacyPlan = (): Record<string, unknown> => {
    const plan = JSON.parse(JSON.stringify(createSamplePlan()));
    plan.schemaVersion = 1;
    for (const level of plan.levels) {
      for (const opening of level.openings) delete opening.swingReversed;
    }
    return plan;
  };

  it('a v1 plan no longer validates on its own', () => {
    expect(floorPlanSchema.safeParse(legacyPlan()).success).toBe(false);
  });

  it('migration adds the swing side and bumps the version', () => {
    const migrated = migratePlan(legacyPlan()) as Record<string, unknown>;

    expect(migrated.schemaVersion).toBe(2);
    const openings = (migrated.levels as { openings: { swingReversed: boolean }[] }[])[0]!.openings;
    expect(openings.length).toBeGreaterThan(0);
    expect(openings.every((opening) => opening.swingReversed === false)).toBe(true);
  });

  it('the migrating schema accepts a v1 plan and hands back a v2 one', () => {
    const result = migratableFloorPlanSchema.safeParse(legacyPlan());

    expect(result.success).toBe(true);
    if (result.success) {
      const plan = result.data as ReturnType<typeof createSamplePlan>;
      expect(plan.schemaVersion).toBe(2);
      expect(plan.levels[0]!.openings[0]!.swingReversed).toBe(false);
    }
  });

  it('leaves everything else about the plan alone', () => {
    const migrated = migratePlan(legacyPlan()) as ReturnType<typeof createSamplePlan>;
    const current = createSamplePlan();

    expect(migrated.levels[0]!.walls).toEqual(current.levels[0]!.walls);
    expect(migrated.levels[0]!.furniture).toEqual(current.levels[0]!.furniture);
  });

  it('a v1 project file imports without complaint', () => {
    const project = JSON.parse(JSON.stringify(createSampleProject()));
    project.plan = legacyPlan();

    const result = parseProject(project);

    expect(result.errors).toEqual([]);
    expect(result.project?.plan.schemaVersion).toBe(2);
  });

  it('migrating an already-current plan changes nothing', () => {
    const plan = createSamplePlan();
    expect(migratePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });
});

describe('migratePlan', () => {
  it('leaves a current plan untouched', () => {
    const plan = createSamplePlan();
    expect(migratePlan(plan)).toEqual(plan);
  });

  it('defaults a missing version to 1', () => {
    expect(detectSchemaVersion({})).toBe(1);
    expect(detectSchemaVersion(null)).toBe(0);
  });

  it('refuses a plan written by a newer version', () => {
    expect(() => migratePlan({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toThrow(
      UnsupportedSchemaVersionError,
    );
  });

  it('passes through values it cannot migrate so the validator reports them', () => {
    expect(migratePlan('nope')).toBe('nope');
  });
});
