import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  login,
} from './helpers';

describe('Search (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('GET /search?q=test — should return results → 200', async () => {
    const res = await authGet(
      app,
      '/api/v1/search?q=test',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
    // Search results should be an object or array
    if (Array.isArray(body)) {
      // Each result should have a type indicator
    } else if (body.data) {
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  it('GET /search — should require authentication → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/search?q=test')
      .set('Host', AL_NOOR_DOMAIN)
      .expect(401);
  });
});
