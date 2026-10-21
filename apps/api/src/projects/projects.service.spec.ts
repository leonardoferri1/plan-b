import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createSamplePlan } from '@spacecraft/shared';
import type { Project as ProjectRow } from '@prisma/client';
import { ProjectsService } from './projects.service';
import type { PrismaService } from '../prisma/prisma.service';

const WORKSPACE = 'ws-test-0001';

function makeRow(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'pr-1',
    name: 'Apartamento Aurora',
    workspaceId: WORKSPACE,
    schemaVersion: 1,
    plan: createSamplePlan() as unknown as ProjectRow['plan'],
    createdAt: new Date('2026-01-10T12:00:00.000Z'),
    updatedAt: new Date('2026-01-11T09:30:00.000Z'),
    ...overrides,
  };
}

interface PrismaMock {
  isReady: boolean;
  ping: jest.Mock;
  project: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
}

function makePrisma(ready = true): PrismaMock {
  return {
    isReady: ready,
    ping: jest.fn().mockResolvedValue(ready),
    project: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
}

function makeService(prisma: PrismaMock): ProjectsService {
  return new ProjectsService(prisma as unknown as PrismaService);
}

describe('ProjectsService', () => {
  describe('when the database is unreachable', () => {
    it('answers 503 instead of failing opaquely', async () => {
      const prisma = makePrisma(false);
      const service = makeService(prisma);

      await expect(service.list(WORKSPACE)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.project.findMany).not.toHaveBeenCalled();
    });

    it('retries the connection before giving up', async () => {
      const prisma = makePrisma(false);
      prisma.ping.mockResolvedValue(true);
      prisma.project.findMany.mockResolvedValue([makeRow()]);

      await expect(makeService(prisma).list(WORKSPACE)).resolves.toHaveLength(1);
      expect(prisma.ping).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns summaries with computed stats instead of whole plans', async () => {
      const prisma = makePrisma();
      prisma.project.findMany.mockResolvedValue([makeRow()]);

      const [summary] = await makeService(prisma).list(WORKSPACE);

      expect(summary).toMatchObject({
        id: 'pr-1',
        name: 'Apartamento Aurora',
        schemaVersion: 1,
      });
      expect(summary?.stats.rooms).toBe(5);
      expect(summary?.stats.floorArea).toBeCloseTo(63, 0);
      expect(summary).not.toHaveProperty('plan');
    });

    it('scopes the query to the workspace and orders by recency', async () => {
      const prisma = makePrisma();
      prisma.project.findMany.mockResolvedValue([]);

      await makeService(prisma).list(WORKSPACE);

      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: WORKSPACE },
          orderBy: { updatedAt: 'desc' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns a validated project', async () => {
      const prisma = makePrisma();
      prisma.project.findFirst.mockResolvedValue(makeRow());

      const project = await makeService(prisma).findOne(WORKSPACE, 'pr-1');

      expect(project.id).toBe('pr-1');
      expect(project.plan.levels[0]?.rooms).toHaveLength(5);
      expect(project.createdAt).toBe('2026-01-10T12:00:00.000Z');
    });

    it('404s for a project in another workspace', async () => {
      const prisma = makePrisma();
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(makeService(prisma).findOne(WORKSPACE, 'pr-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses to hand out a corrupted plan', async () => {
      const prisma = makePrisma();
      prisma.project.findFirst.mockResolvedValue(
        makeRow({ plan: { schemaVersion: 1, levels: [] } as unknown as ProjectRow['plan'] }),
      );

      await expect(makeService(prisma).findOne(WORKSPACE, 'pr-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('create', () => {
    it('stores the plan and lifts its schema version into a column', async () => {
      const prisma = makePrisma();
      prisma.project.create.mockResolvedValue(makeRow());

      const plan = createSamplePlan();
      await makeService(prisma).create(WORKSPACE, { name: 'Novo', plan });

      expect(prisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Novo',
          workspaceId: WORKSPACE,
          schemaVersion: plan.schemaVersion,
        }),
      });
    });
  });

  describe('update', () => {
    it('only writes the fields that were sent', async () => {
      const prisma = makePrisma();
      prisma.project.findFirst.mockResolvedValue({ id: 'pr-1' });
      prisma.project.update.mockResolvedValue(makeRow({ name: 'Renomeado' }));

      await makeService(prisma).update(WORKSPACE, 'pr-1', { name: 'Renomeado' });

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: { name: 'Renomeado' },
      });
    });

    it('404s before touching a project from another workspace', async () => {
      const prisma = makePrisma();
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        makeService(prisma).update(WORKSPACE, 'pr-1', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.project.update).not.toHaveBeenCalled();
    });
  });

  describe('duplicate', () => {
    it('defaults the copy name to the source plus a suffix', async () => {
      const prisma = makePrisma();
      prisma.project.findFirst.mockResolvedValue(makeRow());
      prisma.project.create.mockResolvedValue(makeRow({ id: 'pr-2' }));

      await makeService(prisma).duplicate(WORKSPACE, 'pr-1');

      expect(prisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Apartamento Aurora (cópia)' }),
      });
    });

    it('honours an explicit name', async () => {
      const prisma = makePrisma();
      prisma.project.findFirst.mockResolvedValue(makeRow());
      prisma.project.create.mockResolvedValue(makeRow({ id: 'pr-2' }));

      await makeService(prisma).duplicate(WORKSPACE, 'pr-1', '  Estudo B  ');

      expect(prisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Estudo B' }),
      });
    });
  });

  describe('remove', () => {
    it('deletes within the workspace', async () => {
      const prisma = makePrisma();
      prisma.project.deleteMany.mockResolvedValue({ count: 1 });

      await makeService(prisma).remove(WORKSPACE, 'pr-1');

      expect(prisma.project.deleteMany).toHaveBeenCalledWith({
        where: { id: 'pr-1', workspaceId: WORKSPACE },
      });
    });

    it('404s when nothing matched', async () => {
      const prisma = makePrisma();
      prisma.project.deleteMany.mockResolvedValue({ count: 0 });

      await expect(makeService(prisma).remove(WORKSPACE, 'pr-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
