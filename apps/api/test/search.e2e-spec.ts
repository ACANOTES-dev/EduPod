import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { closeTestApp, createTestApp, DEV_PASSWORD, authGet, login } from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

describe('Search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let ownerToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);

    const ownerLogin = await login(app, fixture.ownerEmail, DEV_PASSWORD, fixture.domainName);
    ownerToken = ownerLogin.accessToken;
  });

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  it('GET /search?q=test — should return results → 200', async () => {
    const res = await authGet(app, '/api/v1/search?q=test', ownerToken, fixture.domainName).expect(
      200,
    );

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
      .set('Host', fixture.domainName)
      .expect(401);
  });
});
