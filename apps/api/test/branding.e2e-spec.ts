import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { DEV_PASSWORD, authGet, authPatch, closeTestApp, createTestApp, login } from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

describe('Branding Endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let ownerToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);

    const ownerLogin = await login(app, fixture.ownerEmail, DEV_PASSWORD, fixture.domainName);
    ownerToken = ownerLogin.accessToken;

    const teacherLogin = await login(app, fixture.teacherEmail!, DEV_PASSWORD, fixture.domainName);
    teacherToken = teacherLogin.accessToken;
  });

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  it('should get branding', async () => {
    const res = await authGet(app, '/api/v1/branding', ownerToken, fixture.domainName).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.school_name_display).toBeDefined();
  });

  it('should update branding', async () => {
    const res = await authPatch(
      app,
      '/api/v1/branding',
      ownerToken,
      { primary_colour: '#FF0000' },
      fixture.domainName,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.primary_color).toBe('#FF0000');
  });

  it('should reject without branding.manage permission', async () => {
    await authPatch(
      app,
      '/api/v1/branding',
      teacherToken,
      { primary_colour: '#00FF00' },
      fixture.domainName,
    ).expect(403);
  });

  it.todo('should upload logo — skipped due to file upload complexity');
});
