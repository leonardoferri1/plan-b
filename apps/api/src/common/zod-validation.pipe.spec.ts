import { BadRequestException } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { createProjectSchema, createSamplePlan, updateProjectSchema } from '@spacecraft/shared';
import { ZodValidationPipe } from './zod-validation.pipe';

const metadata: ArgumentMetadata = { type: 'body' };

describe('ZodValidationPipe', () => {
  it('passes a valid create payload through', () => {
    const pipe = new ZodValidationPipe(createProjectSchema);
    const body = { name: 'Apartamento Aurora', plan: createSamplePlan() };

    expect(pipe.transform(body, metadata).name).toBe('Apartamento Aurora');
  });

  it('rejects a payload with no name', () => {
    const pipe = new ZodValidationPipe(createProjectSchema);

    expect(() => pipe.transform({ plan: createSamplePlan() }, metadata)).toThrow(
      BadRequestException,
    );
  });

  it('reports the path of the offending field', () => {
    const pipe = new ZodValidationPipe(createProjectSchema);
    const plan = createSamplePlan();
    plan.levels[0]!.walls[0]!.thickness = 99;

    try {
      pipe.transform({ name: 'x', plan }, metadata);
      throw new Error('expected the pipe to throw');
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as {
        errors: { path: string }[];
      };
      expect(response.errors[0]?.path).toContain('plan.levels.0.walls.0.thickness');
    }
  });

  it('rejects a wall that references a missing corner', () => {
    const pipe = new ZodValidationPipe(createProjectSchema);
    const plan = createSamplePlan();
    plan.levels[0]!.walls[0]!.a = 'ghost';

    expect(() => pipe.transform({ name: 'x', plan }, metadata)).toThrow(BadRequestException);
  });

  it('requires an update to carry at least one field', () => {
    const pipe = new ZodValidationPipe(updateProjectSchema);

    expect(() => pipe.transform({}, metadata)).toThrow(BadRequestException);
  });

  it('accepts a name-only update', () => {
    const pipe = new ZodValidationPipe(updateProjectSchema);

    expect(pipe.transform({ name: 'Renomeado' }, metadata)).toEqual({ name: 'Renomeado' });
  });

  it('trims the project name', () => {
    const pipe = new ZodValidationPipe(updateProjectSchema);

    expect(pipe.transform({ name: '  Casa  ' }, metadata)).toEqual({ name: 'Casa' });
  });
});
