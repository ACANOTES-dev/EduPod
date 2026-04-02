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
    const res = await authGet(app, '/api/v1/search?q=test', ownerToken, AL_NOOR_DOMAIN).expect(200);

    // Controller returns { data: { results, total } }
    // ResponseTransformInterceptor wraps to { data: { data: { results, total } } }
    // or passes through if already wrapped — handle both shapes
    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();

    // The search response contains { results: [...], total: N }
    const searchData = body.data ?? body;
    expect(searchData.results).toBeDefined();
    expect(Array.isArray(searchData.results)).toBe(true);
    expect(typeof searchData.total).toBe('number');
  });

  it('GET /search — should require authentication → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/search?q=test')
      .set('Host', AL_NOOR_DOMAIN)
      .expect(401);
  });
});
