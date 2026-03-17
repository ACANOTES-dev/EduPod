import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  login,
} from './helpers';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let parentToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    parentToken = parentLogin.accessToken;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('GET /dashboard/school-admin — should return stats → 200', async () => {
    const res = await authGet(
      app,
      '/api/v1/dashboard/school-admin',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
    expect(typeof body).toBe('object');
  });

  it('GET /dashboard/school-admin — should reject unauthenticated → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/school-admin')
      .set('Host', AL_NOOR_DOMAIN)
      .expect(401);
  });

  it('GET /dashboard/parent — should return linked students → 200', async () => {
    const res = await authGet(
      app,
      '/api/v1/dashboard/parent',
      parentToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
    expect(typeof body).toBe('object');
  });
});
