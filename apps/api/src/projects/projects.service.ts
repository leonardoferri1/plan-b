import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Prisma, Project as ProjectRow } from '@prisma/client';
import {
  CURRENT_SCHEMA_VERSION,
  currentLevel,
  migratePlan,
  planStats,
  validateFloorPlan,
  type FloorPlan,
  type Project,
  type ProjectSummary,
} from '@spacecraft/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateProjectData {
  name: string;
  plan: FloorPlan;
}

export interface UpdateProjectData {
  name?: string;
  plan?: FloorPlan;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDatabase(): Promise<void> {
    if (this.prisma.isReady) return;
    if (await this.prisma.ping()) return;

    throw new ServiceUnavailableException(
      'Banco de dados indisponível. O editor continua funcionando com o armazenamento local.',
    );
  }

  /**
   * Rows are read back through the migration chain and the validator before being handed out,
   * so a plan written by an older build is upgraded on read rather than reaching the client in
   * a shape it no longer understands.
   */
  private toProject(row: ProjectRow): Project {
    const migrated = migratePlan(row.plan);
    const result = validateFloorPlan(migrated);

    if (!result.plan) {
      throw new ServiceUnavailableException(
        `O projeto ${row.id} está corrompido: ${result.errors.slice(0, 3).join('; ')}`,
      );
    }

    return {
      id: row.id,
      name: row.name,
      plan: result.plan,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      workspaceId: row.workspaceId,
    };
  }

  private toSummary(row: ProjectRow): ProjectSummary {
    const migrated = migratePlan(row.plan);
    const parsed = validateFloorPlan(migrated);
    const stats = parsed.plan
      ? planStats(currentLevel(parsed.plan))
      : { rooms: 0, walls: 0, furniture: 0, floorArea: 0 };

    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      schemaVersion: row.schemaVersion,
      stats: {
        rooms: stats.rooms,
        walls: stats.walls,
        furniture: stats.furniture,
        floorArea: Math.round(stats.floorArea * 100) / 100,
      },
    };
  }

  async list(workspaceId: string): Promise<ProjectSummary[]> {
    await this.ensureDatabase();

    const rows = await this.prisma.project.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return rows.map((row) => this.toSummary(row));
  }

  async findOne(workspaceId: string, id: string): Promise<Project> {
    await this.ensureDatabase();

    const row = await this.prisma.project.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException(`Projeto ${id} não encontrado.`);

    return this.toProject(row);
  }

  async create(workspaceId: string, data: CreateProjectData): Promise<Project> {
    await this.ensureDatabase();

    const row = await this.prisma.project.create({
      data: {
        name: data.name,
        workspaceId,
        schemaVersion: data.plan.schemaVersion ?? CURRENT_SCHEMA_VERSION,
        plan: data.plan as unknown as Prisma.InputJsonValue,
      },
    });

    return this.toProject(row);
  }

  async update(workspaceId: string, id: string, data: UpdateProjectData): Promise<Project> {
    await this.ensureDatabase();

    // Scoping the existence check to the workspace keeps one demo visitor from discovering
    // another's project ids through the difference between 404 and 403.
    const existing = await this.prisma.project.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Projeto ${id} não encontrado.`);

    const row = await this.prisma.project.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.plan !== undefined
          ? {
              plan: data.plan as unknown as Prisma.InputJsonValue,
              schemaVersion: data.plan.schemaVersion ?? CURRENT_SCHEMA_VERSION,
            }
          : {}),
      },
    });

    return this.toProject(row);
  }

  async duplicate(workspaceId: string, id: string, name?: string): Promise<Project> {
    await this.ensureDatabase();

    const source = await this.prisma.project.findFirst({ where: { id, workspaceId } });
    if (!source) throw new NotFoundException(`Projeto ${id} não encontrado.`);

    const row = await this.prisma.project.create({
      data: {
        name: name?.trim() || `${source.name} (cópia)`,
        workspaceId,
        schemaVersion: source.schemaVersion,
        plan: source.plan as Prisma.InputJsonValue,
      },
    });

    return this.toProject(row);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    await this.ensureDatabase();

    const result = await this.prisma.project.deleteMany({ where: { id, workspaceId } });
    if (result.count === 0) throw new NotFoundException(`Projeto ${id} não encontrado.`);
  }
}
