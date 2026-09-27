import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from './helpers/app';
import { truncateAll } from './helpers/db';
import { registerAndLogin, authHeader } from './helpers/auth';
import { createProject } from './helpers/projects';

describe('Tasks (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  afterEach(async () => {
    await truncateAll(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('X1 - combinable filters over HTTP', () => {
    it('returns only rows matching both status and projectId, not a deliberate near-miss', async () => {
      const { token } = await registerAndLogin(app);
      const projectA = await createProject(app, token, 'Project A');
      const projectB = await createProject(app, token, 'Project B');

      // Matches both filters.
      const wanted = await request(app.getHttpServer())
        .post('/tasks')
        .set(authHeader(token))
        .send({ title: 'Wanted task', projectId: projectA.id, status: 'todo' })
        .expect(201);

      // Near-miss #1: right project, wrong status.
      await request(app.getHttpServer())
        .post('/tasks')
        .set(authHeader(token))
        .send({ title: 'Wrong status', projectId: projectA.id, status: 'done' })
        .expect(201);

      // Near-miss #2: right status, wrong project - the case a broken OR
      // (instead of AND) would let through.
      await request(app.getHttpServer())
        .post('/tasks')
        .set(authHeader(token))
        .send({
          title: 'Wrong project',
          projectId: projectB.id,
          status: 'todo',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/tasks?status=todo&projectId=${projectA.id}`)
        .set(authHeader(token))
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(wanted.body.id);
    });
  });
});
