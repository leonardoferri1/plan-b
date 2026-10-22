import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createSamplePlan, createSampleProject } from '@plan-b/shared';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/**
 * HTTP-level tests for the projects routes, with the service mocked out.
 *
 * These exist because the unit tests around the zod pipe could not see how the pipe was
 * *bound*: an earlier version applied it with `@UsePipes`, which hands every handler argument
 * to the pipe — so a route parameter was being validated against the request-body schema and
 * every write answered 400. Only a request through the real routing layer catches that.
 */
describe('ProjectsController', () => {
  let app: INestApplication;

  const service = {
    list: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    duplicate: jest.fn(),
    remove: jest.fn(),
  };

  const WORKSPACE = 'ws-controller-0001';
  const project = createSampleProject();

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const send = (): request.Agent => request(app.getHttpServer());

  describe('workspace header', () => {
    it('rejects a request without it', async () => {
      await send().get('/projects').expect(400);
      expect(service.list).not.toHaveBeenCalled();
    });

    it('rejects a malformed one', async () => {
      await send().get('/projects').set('x-workspace-id', 'tiny').expect(400);
    });

    it('passes a valid one through to the service', async () => {
      service.list.mockResolvedValue([]);

      await send().get('/projects').set('x-workspace-id', WORKSPACE).expect(200);

      expect(service.list).toHaveBeenCalledWith(WORKSPACE);
    });
  });

  describe('POST /projects', () => {
    it('accepts a valid body and answers 201', async () => {
      service.create.mockResolvedValue(project);

      const response = await send()
        .post('/projects')
        .set('x-workspace-id', WORKSPACE)
        .send({ name: 'Casa da Serra', plan: createSamplePlan() })
        .expect(201);

      expect(response.body.name).toBe(project.name);
      expect(service.create).toHaveBeenCalledWith(
        WORKSPACE,
        expect.objectContaining({ name: 'Casa da Serra' }),
      );
    });

    it('rejects a plan that fails validation', async () => {
      const plan = createSamplePlan();
      plan.levels[0]!.walls[0]!.a = 'ghost';

      const response = await send()
        .post('/projects')
        .set('x-workspace-id', WORKSPACE)
        .send({ name: 'Inválido', plan })
        .expect(400);

      expect(response.body.errors[0].path).toContain('plan.levels.0.walls.0');
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /projects/:id', () => {
    it('accepts a name-only patch and forwards the id untouched', async () => {
      service.update.mockResolvedValue(project);

      await send()
        .patch('/projects/cmvi3k0rt00005illhqs3pf3n')
        .set('x-workspace-id', WORKSPACE)
        .send({ name: 'Renomeado' })
        .expect(200);

      expect(service.update).toHaveBeenCalledWith(WORKSPACE, 'cmvi3k0rt00005illhqs3pf3n', {
        name: 'Renomeado',
      });
    });

    it('rejects an empty patch', async () => {
      await send()
        .patch('/projects/cmvi3k0rt00005illhqs3pf3n')
        .set('x-workspace-id', WORKSPACE)
        .send({})
        .expect(400);
    });

    it('surfaces a not-found from the service', async () => {
      service.update.mockRejectedValue(new NotFoundException('nope'));

      await send()
        .patch('/projects/missing')
        .set('x-workspace-id', WORKSPACE)
        .send({ name: 'x' })
        .expect(404);
    });
  });

  describe('POST /projects/:id/duplicate', () => {
    it('accepts an empty body', async () => {
      service.duplicate.mockResolvedValue(project);

      await send()
        .post('/projects/cmvi3k0rt00005illhqs3pf3n/duplicate')
        .set('x-workspace-id', WORKSPACE)
        .send({})
        .expect(201);

      expect(service.duplicate).toHaveBeenCalledWith(
        WORKSPACE,
        'cmvi3k0rt00005illhqs3pf3n',
        undefined,
      );
    });

    it('forwards an explicit name', async () => {
      service.duplicate.mockResolvedValue(project);

      await send()
        .post('/projects/cmvi3k0rt00005illhqs3pf3n/duplicate')
        .set('x-workspace-id', WORKSPACE)
        .send({ name: 'Estudo B' })
        .expect(201);

      expect(service.duplicate).toHaveBeenCalledWith(
        WORKSPACE,
        'cmvi3k0rt00005illhqs3pf3n',
        'Estudo B',
      );
    });
  });

  describe('DELETE /projects/:id', () => {
    it('answers 204 with no body', async () => {
      service.remove.mockResolvedValue(undefined);

      const response = await send()
        .delete('/projects/cmvi3k0rt00005illhqs3pf3n')
        .set('x-workspace-id', WORKSPACE)
        .expect(204);

      expect(response.body).toEqual({});
      expect(service.remove).toHaveBeenCalledWith(WORKSPACE, 'cmvi3k0rt00005illhqs3pf3n');
    });
  });
});
