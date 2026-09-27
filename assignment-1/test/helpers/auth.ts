import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

export interface RegisteredUser {
  id: number;
  email: string;
  token: string;
}

let counter = 0;

// One call per test, per the brief's own hint (C4) - no rows created at
// module load time, so a test using this is never depending on another
// test having run first.
export async function registerAndLogin(
  app: INestApplication,
  overrides: { name?: string; email?: string; password?: string } = {},
): Promise<RegisteredUser> {
  counter += 1;
  const name = overrides.name ?? `Test User ${counter}`;
  const email = overrides.email ?? `user${counter}@example.com`;
  const password = overrides.password ?? 'password123456';

  const registered = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name, email, password })
    .expect(201);

  const loggedIn = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return { id: registered.body.id, email, token: loggedIn.body.accessToken };
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
