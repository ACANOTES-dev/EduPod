import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { closeTestApp, createTestApp, DEV_PASSWORD, authGet, login } from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let ownerToken: string;
  let parentToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);

    const ownerLogin = await login(app, fixture.ownerEmail, DEV_PASSWORD, fixture.domainName);
    ownerToken = ownerLogin.accessToken;

    const parentLogin = await login(app, fixture.parentEmail!, DEV_PASSWORD, fixture.domainName);
    parentToken = parentLogin.accessToken;
  });

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  it('GET /dashboard/school-admin — should return stats → 200', async () => {
    const res = await authGet(
      app,
      '/api/v1/dashboard/school-admin',
      ownerToken,
      fixture.domainName,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
    expect(typeof body).toBe('object');
  });

  it('GET /dashboard/school-admin — should reject unauthenticated → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/school-admin')
      .set('Host', fixture.domainName)
      .expect(401);
  });

  it('GET /dashboard/parent — should return linked students → 200', async () => {
    const res = await authGet(
      app,
      '/api/v1/dashboard/parent',
      parentToken,
      fixture.domainName,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
    expect(typeof body).toBe('object');
  });
});
