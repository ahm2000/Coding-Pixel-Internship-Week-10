import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from './helpers/app';
import { ProjectMember } from '../src/entities/ProjectMember';
import { ProjectRole } from '../src/entities/Enums';
import { Tag } from '../src/entities/Tag';

// W1/W2/C1/C2: one continuous story, told as ordered steps rather than one
// giant `it()`, specifically so C3/C4's "delete one test" / "break one
// behaviour" exercises have something discrete to delete or break. Order
// matters here - each step's `it()` reuses state a previous step produced
// (the access token, the project id, the task id) - so this file is
// deliberately never run with `--randomize`, unlike assignment-1's
// independent-by-design specs.
describe('Full user journey (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const password = 'password123456';
  const owner = { name: 'Journey Owner', email: 'journey-owner@example.com' };
  const viewer = {
    name: 'Journey Viewer',
    email: 'journey-viewer@example.com',
  };

  let ownerId: number;
  let accessToken: string;
  let refreshToken: string;
  let projectId: number;
  let taskId: number;
  let tagId: number;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new user', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: owner.name, email: owner.email, password })
      .expect(201);

    expect(res.body).toMatchObject({ name: owner.name, email: owner.email });
    ownerId = res.body.id;
  });

  it('logs in and receives a token pair', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: owner.email, password })
      .expect(200);

    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('creates a project, owned by the logged-in user', async () => {
    const res = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Launch plan' })
      .expect(201);

    expect(res.body.owner.id).toBe(ownerId);
    projectId = res.body.id;
  });

  it('creates a task inside that project', async () => {
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Write the brief', projectId })
      .expect(201);

    expect(res.body.project.id).toBe(projectId);
    taskId = res.body.id;
  });

  it('reads the task back and confirms it still belongs to the project', async () => {
    const res = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(taskId);
    expect(res.body.project.id).toBe(projectId);
  });

  it('adds a comment on the task', async () => {
    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ body: 'Looks good to me.' })
      .expect(201);

    expect(res.body.task.id).toBe(taskId);
    expect(res.body.author.id).toBe(ownerId);
  });

  it('renames the project', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Launch plan (renamed)' })
      .expect(200);

    expect(res.body.name).toBe('Launch plan (renamed)');
  });

  it("lists the caller's projects and finds the renamed one", async () => {
    const res = await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toContainEqual(
      expect.objectContaining({ id: projectId, name: 'Launch plan (renamed)' }),
    );
  });

  // X2: a real branch that would hurt in production if it regressed - a
  // client could otherwise create a task pointing at a tag id that no
  // longer exists (e.g. a deleted tag), leaving a task referencing
  // nothing. See the README for the coverage delta this one test made.
  it('rejects creating a task with a tag that does not exist (404)', async () => {
    await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Should not be created', projectId, tagIds: [999999] })
      .expect(404);
  });

  it('reassigns the task to the owner and attaches a real tag', async () => {
    const tagsRepository = dataSource.getRepository(Tag);
    const tag = await tagsRepository.save(
      tagsRepository.create({ name: 'urgent' }),
    );
    tagId = tag.id;

    const res = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ assigneeId: ownerId, tagIds: [tagId] })
      .expect(200);

    expect(res.body.assignee.id).toBe(ownerId);
  });

  it('lists tasks filtered by project, status and assignee together', async () => {
    const res = await request(app.getHttpServer())
      .get(`/tasks?projectId=${projectId}&status=todo&assigneeId=${ownerId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.items.map((task: { id: number }) => task.id)).toContain(
      taskId,
    );
  });

  it('blocks a viewer on the project from writing a task (403)', async () => {
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: viewer.name, email: viewer.email, password })
      .expect(201);

    const loggedIn = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: viewer.email, password })
      .expect(200);

    // No membership-management endpoint exists in this API's scope (same
    // as Week 9's own tests) - inserted directly, the way a real admin
    // action would end up represented in the table.
    const membersRepository = dataSource.getRepository(ProjectMember);
    await membersRepository.save(
      membersRepository.create({
        userId: registered.body.id,
        projectId,
        role: ProjectRole.VIEWER,
      }),
    );

    await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${loggedIn.body.accessToken}`)
      .send({ title: 'Viewer should not be able to create this', projectId })
      .expect(403);
  });

  it('deletes the task, then confirms deleting it again is a 404', async () => {
    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('deletes the project, then confirms deleting it again is a 404', async () => {
    await request(app.getHttpServer())
      .delete(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('renews the access token via refresh and keeps working with the new one (C1)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;

    // The project is gone by now (previous step) - a still-protected route
    // that doesn't depend on it proves the new token itself is what works.
    await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('logs out, then rejects reuse of the revoked refresh token (401)', async () => {
    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
