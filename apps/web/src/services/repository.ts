import {
  createSampleProject,
  currentLevel,
  parseProject,
  planStats,
  type Project,
  type ProjectSummary,
} from '@spacecraft/shared';
import { WORKSPACE_HEADER, getWorkspaceId } from './workspace';

/**
 * Persistence boundary.
 *
 * Two implementations share this interface: one backed by the NestJS API and one backed by
 * `localStorage`. The editor talks only to the interface, which is what lets the portfolio
 * demo be fully usable with no backend running and upgrade transparently when one is.
 */
export interface ProjectRepository {
  readonly kind: 'local' | 'remote';
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project | null>;
  create(project: Project): Promise<Project>;
  update(id: string, changes: { name?: string; project?: Project }): Promise<Project>;
  duplicate(id: string, name?: string): Promise<Project>;
  remove(id: string): Promise<void>;
}

const STORAGE_KEY = 'spacecraft:projects:v1';

function toSummary(project: Project): ProjectSummary {
  const stats = planStats(currentLevel(project.plan));

  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    schemaVersion: project.plan.schemaVersion,
    stats: {
      rooms: stats.rooms,
      walls: stats.walls,
      furniture: stats.furniture,
      floorArea: Math.round(stats.floorArea * 100) / 100,
    },
  };
}

/** Projects kept in this browser. Always available, even with the API down. */
export class LocalProjectRepository implements ProjectRepository {
  readonly kind = 'local' as const;

  private read(): Record<string, Project> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};

      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return {};

      const result: Record<string, Project> = {};
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        // Stored payloads pass through the same migration and validation as an imported file;
        // an entry written by an older build is upgraded, and a corrupt one is skipped rather
        // than taking the whole library down with it.
        const outcome = parseProject(value);
        if (outcome.project) result[id] = outcome.project;
      }
      return result;
    } catch {
      return {};
    }
  }

  private write(projects: Record<string, Project>): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch (error) {
      throw new Error(
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? 'O armazenamento local do navegador está cheio.'
          : 'Não foi possível gravar no armazenamento local.',
      );
    }
  }

  async list(): Promise<ProjectSummary[]> {
    return Object.values(this.read())
      .map(toSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Project | null> {
    return this.read()[id] ?? null;
  }

  async create(project: Project): Promise<Project> {
    const projects = this.read();
    const now = new Date().toISOString();
    const stored: Project = { ...project, createdAt: project.createdAt || now, updatedAt: now };

    projects[stored.id] = stored;
    this.write(projects);
    return stored;
  }

  async update(id: string, changes: { name?: string; project?: Project }): Promise<Project> {
    const projects = this.read();
    const existing = projects[id] ?? changes.project;
    if (!existing) throw new Error(`Projeto ${id} não encontrado.`);

    const updated: Project = {
      ...existing,
      ...(changes.project ?? {}),
      id,
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      updatedAt: new Date().toISOString(),
    };

    projects[id] = updated;
    this.write(projects);
    return updated;
  }

  async duplicate(id: string, name?: string): Promise<Project> {
    const source = this.read()[id];
    if (!source) throw new Error(`Projeto ${id} não encontrado.`);

    const now = new Date().toISOString();
    const copy: Project = {
      ...source,
      id: `pr_${Math.random().toString(36).slice(2, 10)}`,
      name: name?.trim() || `${source.name} (cópia)`,
      createdAt: now,
      updatedAt: now,
    };

    return this.create(copy);
  }

  async remove(id: string): Promise<void> {
    const projects = this.read();
    delete projects[id];
    this.write(projects);
  }

  /** Seeds the demo apartment the first time somebody opens the studio. */
  async ensureDemoProject(): Promise<Project> {
    const projects = this.read();
    const existing = Object.values(projects)[0];
    if (existing) return existing;

    return this.create(createSampleProject());
  }
}

export class HttpProjectRepository implements ProjectRepository {
  readonly kind = 'remote' as const;

  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        [WORKSPACE_HEADER]: getWorkspaceId(),
        ...init?.headers,
      },
    });

    if (response.status === 204) return undefined as T;

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        (payload as { message?: string } | null)?.message ??
        `A requisição falhou (${response.status}).`;
      throw new Error(message);
    }

    return payload as T;
  }

  list(): Promise<ProjectSummary[]> {
    return this.request<ProjectSummary[]>('/projects');
  }

  async get(id: string): Promise<Project | null> {
    try {
      return await this.request<Project>(`/projects/${id}`);
    } catch {
      return null;
    }
  }

  create(project: Project): Promise<Project> {
    return this.request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name: project.name, plan: project.plan }),
    });
  }

  update(id: string, changes: { name?: string; project?: Project }): Promise<Project> {
    return this.request<Project>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.project ? { plan: changes.project.plan } : {}),
      }),
    });
  }

  duplicate(id: string, name?: string): Promise<Project> {
    return this.request<Project>(`/projects/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(name ? { name } : {}),
    });
  }

  async remove(id: string): Promise<void> {
    await this.request<void>(`/projects/${id}`, { method: 'DELETE' });
  }
}

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

export interface BackendStatus {
  available: boolean;
  database: 'up' | 'down' | 'unknown';
}

/**
 * One short probe decides which repository the session uses. It is deliberately quick to fail:
 * a visitor with no backend should reach a working editor without waiting on a timeout.
 */
export async function probeBackend(timeoutMs = 1500): Promise<BackendStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_URL}/api/health`, { signal: controller.signal });
    if (!response.ok) return { available: false, database: 'unknown' };

    const payload = (await response.json()) as { database?: 'up' | 'down' };
    const database = payload.database ?? 'unknown';

    return { available: database === 'up', database };
  } catch {
    return { available: false, database: 'unknown' };
  } finally {
    clearTimeout(timer);
  }
}

export const localRepository = new LocalProjectRepository();

let activeRepository: ProjectRepository = localRepository;

export function getRepository(): ProjectRepository {
  return activeRepository;
}

export function setRepository(repository: ProjectRepository): void {
  activeRepository = repository;
}

export function createRemoteRepository(): ProjectRepository {
  return new HttpProjectRepository(API_URL);
}
