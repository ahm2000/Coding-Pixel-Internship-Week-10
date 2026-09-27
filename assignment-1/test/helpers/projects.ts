import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { authHeader } from './auth';

export interface CreatedProject {
  id: number;
  name: string;
}

export async function createProject(
  app: INestApplication,
  token: string,
  name = 'Test Project',
): Promise<CreatedProject> {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set(authHeader(token))
    .send({ name })
    .expect(201);

  return { id: res.body.id, name: res.body.name };
}
