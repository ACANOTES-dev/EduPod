import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { closeTestApp, createTestApp, DEV_PASSWORD, authGet, authPatch, login } from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

describe('Preferences (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let teacherToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);

    const teacherLogin = await login(app, fixture.teacherEmail!, DEV_PASSWORD, fixture.domainName);
    teacherToken = teacherLogin.accessToken;
  });

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  it('should get preferences (empty default)', async () => {
    const res = await authGet(
      app,
      '/api/v1/me/preferences',
      teacherToken,
      fixture.domainName,
    ).expect(200);

    // Either an empty object or previously saved preferences — must be an object
    const body = res.body.data ?? res.body;
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
  });

  it('should update preferences', async () => {
    const res = await authPatch(
      app,
      '/api/v1/me/preferences',
      teacherToken,
      { theme: 'dark' },
      fixture.domainName,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
    // The deep-merge should preserve the theme key
    expect(body.theme).toBe('dark');
  });

  it('should reject unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me/preferences')
      .set('Host', fixture.domainName)
      .expect(401);
  });
});
