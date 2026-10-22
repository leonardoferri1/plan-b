import { CURRENT_SCHEMA_VERSION, parseProject, type Project } from '@plan-b/shared';
import { downloadBlob, slugify, timestamp } from './download';

export const PROJECT_FILE_EXTENSION = '.plan-b.json';

/**
 * Envelope written to disk.
 *
 * The project is nested under `project` rather than written at the top level so the file can
 * carry provenance — who wrote it and when — without those fields ever being mistaken for part
 * of the domain model. `parseProject` is applied to the inner object on read, which means an
 * exported file is validated and migrated exactly like any other stored payload.
 */
export interface ProjectFile {
  format: 'plan-b-project';
  formatVersion: 1;
  schemaVersion: number;
  exportedAt: string;
  application: string;
  project: Project;
}

export function buildProjectFile(project: Project): ProjectFile {
  return {
    format: 'plan-b-project',
    formatVersion: 1,
    schemaVersion: project.plan.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    application: 'Plan B',
    project,
  };
}

export function exportProjectJson(project: Project): void {
  const file = buildProjectFile(project);
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: 'application/json;charset=utf-8',
  });

  downloadBlob(blob, `${slugify(project.name)}-${timestamp()}${PROJECT_FILE_EXTENSION}`);
}

export interface ImportResult {
  ok: boolean;
  project?: Project;
  errors: string[];
}

/**
 * Reads either a full export envelope or a bare project object, so a file hand-edited down to
 * just the project still imports.
 */
export function parseProjectFile(raw: string): ImportResult {
  let payload: unknown;

  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['O arquivo não é um JSON válido.'] };
  }

  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, errors: ['O arquivo não contém um projeto.'] };
  }

  const envelope = payload as { format?: string; project?: Project };
  const candidate =
    envelope.format === 'plan-b-project' || envelope.format === 'spacecraft-project'
      ? envelope.project
      : payload;

  if (!candidate) {
    return { ok: false, errors: ['O arquivo não contém um projeto.'] };
  }

  const parsed = parseProject(candidate);

  return {
    ok: parsed.ok,
    project: parsed.project,
    errors: parsed.errors,
  };
}

/** Opens the native file picker and returns the file's text, or null if cancelled. */
export function pickProjectFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    const cleanup = (): void => {
      input.remove();
      window.removeEventListener('focus', onFocus);
    };

    // A cancelled picker fires no event, so the window regaining focus with no file selected
    // is what tells us to stop waiting.
    const onFocus = (): void => {
      setTimeout(() => {
        if (input.files && input.files.length > 0) return;
        cleanup();
        resolve(null);
      }, 400);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }

      void file.text().then((text) => {
        cleanup();
        resolve(text);
      });
    });

    document.body.appendChild(input);
    window.addEventListener('focus', onFocus, { once: true });
    input.click();
  });
}
