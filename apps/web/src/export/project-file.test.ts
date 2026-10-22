import { describe, expect, it } from 'vitest';
import { createSampleProject, CURRENT_SCHEMA_VERSION } from '@plan-b/shared';
import { buildProjectFile, parseProjectFile } from './project-file';
import { slugify, timestamp } from './download';

describe('buildProjectFile', () => {
  it('wraps the project in a versioned envelope', () => {
    const file = buildProjectFile(createSampleProject());

    expect(file.format).toBe('plan-b-project');
    expect(file.formatVersion).toBe(1);
    expect(file.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(file.project.name).toBe('Apartamento Aurora');
  });
});

describe('parseProjectFile', () => {
  it('imports files exported before the rename', () => {
    const project = createSampleProject();
    const legacy = { ...buildProjectFile(project), format: 'spacecraft-project' };
    expect(parseProjectFile(JSON.stringify(legacy)).project).toEqual(project);
  });

  it('round-trips an exported file without losing geometry', () => {
    const project = createSampleProject();
    const raw = JSON.stringify(buildProjectFile(project));

    const result = parseProjectFile(raw);

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.project?.plan).toEqual(project.plan);
  });

  it('accepts a bare project object', () => {
    const project = createSampleProject();

    const result = parseProjectFile(JSON.stringify(project));

    expect(result.ok).toBe(true);
    expect(result.project?.name).toBe(project.name);
  });

  it('rejects malformed JSON with a readable message', () => {
    const result = parseProjectFile('{ not json');

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('JSON');
  });

  it('rejects a payload that is not an object', () => {
    expect(parseProjectFile('42').ok).toBe(false);
    expect(parseProjectFile('null').ok).toBe(false);
  });

  it('rejects an envelope with no project', () => {
    const result = parseProjectFile(JSON.stringify({ format: 'plan-b-project', formatVersion: 1 }));

    expect(result.ok).toBe(false);
  });

  it('rejects a plan that fails schema validation', () => {
    const project = createSampleProject();
    project.plan.levels[0]!.walls[0]!.a = 'ghost';

    const result = parseProjectFile(JSON.stringify(buildProjectFile(project)));

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('canto inexistente');
  });

  it('refuses a file written by a newer schema version', () => {
    const project = createSampleProject();
    project.plan.schemaVersion = CURRENT_SCHEMA_VERSION + 1;

    expect(() => parseProjectFile(JSON.stringify(project))).toThrow(/mais novo/);
  });
});

describe('file naming', () => {
  it('slugifies accented project names', () => {
    expect(slugify('Apartamento Aurora — Estúdio')).toBe('apartamento-aurora-estudio');
  });

  it('falls back when a name has no usable characters', () => {
    expect(slugify('***')).toBe('plan-b');
  });

  it('formats a sortable timestamp', () => {
    expect(timestamp(new Date(2026, 0, 5, 9, 7))).toBe('20260105-0907');
  });
});
