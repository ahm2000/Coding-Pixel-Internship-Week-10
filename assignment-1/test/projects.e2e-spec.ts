import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from './helpers/app';
import { truncateAll } from './helpers/db';
import { registerAndLogin, authHeader } from './helpers/auth';

describe('Projects (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  // W2/C4: every test starts from an empty database - nothing here leans
  // on rows another test created, and nothing it creates leaks forward.
  afterEach(async () => {
    await truncateAll(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('C1 - create then read back over HTTP', () => {
    it('creates a project and reads the same one back', async () => {
      const { token, id: userId } = await registerAndLogin(app);

      const created = await request(app.getHttpServer())
        .post('/projects')
        .set(authHeader(token))
        .send({ name: 'Launch plan' })
        .expect(201);

      expect(created.body).toMatchObject({ name: 'Launch plan' });
      expect(created.body.owner.id).toBe(userId);

      const fetched = await request(app.getHttpServer())
        .get(`/projects/${created.body.id}`)
        .set(authHeader(token))
        .expect(200);

      expect(fetched.body).toMatchObject({
        id: created.body.id,
        name: 'Launch plan',
      });
    });
  });

  describe('C2 - 400 and 401', () => {
    it('rejects an empty name with 400 and an error body', async () => {
      const { token } = await registerAndLogin(app);

      const res = await request(app.getHttpServer())
        .post('/projects')
        .set(authHeader(token))
        .send({ name: '' })
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('message');
    });

    it('rejects a write with no token at all with 401', async () => {
      await request(app.getHttpServer())
        .post('/projects')
        .send({ name: 'No token' })
        .expect(401);
    });
  });

  describe('C3 - 404 for a project that does not exist', () => {
    it('returns 404 on get, patch and delete for a well-formed missing id', async () => {
      const { token } = await registerAndLogin(app);
      const missingId = 999999;

      await request(app.getHttpServer())
        .get(`/projects/${missingId}`)
        .set(authHeader(token))
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/projects/${missingId}`)
        .set(authHeader(token))
        .send({ name: 'Anything' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/projects/${missingId}`)
        .set(authHeader(token))
        .expect(404);
    });
  });

  describe('C4 - independence: creating a project here does not leak into another test', () => {
    it('sees zero projects for a fresh user, even though other tests in this file create projects', async () => {
      const { token } = await registerAndLogin(app);

      const res = await request(app.getHttpServer())
        .get('/projects')
        .set(authHeader(token))
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('X2 - forbidNonWhitelisted rejects an unknown field, from the outside', () => {
    it('rejects a body carrying ownerId with 400 and creates no row', async () => {
      const { token } = await registerAndLogin(app);

      const res = await request(app.getHttpServer())
        .post('/projects')
        .set(authHeader(token))
        .send({ name: 'Should not exist', ownerId: 999 })
        .expect(400);

      expect(String(res.body.message)).toMatch(/ownerId/);

      const list = await request(app.getHttpServer())
        .get('/projects')
        .set(authHeader(token))
        .expect(200);
      expect(list.body).toEqual([]);
    });
  });
});
