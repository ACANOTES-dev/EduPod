import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { DEV_PASSWORD, authGet, authPatch, closeTestApp, createTestApp, login } from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

describe('Settings Endpoints (e2e)', () => {
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

  it('should get settings', async () => {
    const res = await authGet(app, '/api/v1/settings', ownerToken, fixture.domainName).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.attendance).toBeDefined();
  });

  it('should update settings with partial data', async () => {
    const res = await authPatch(
      app,
      '/api/v1/settings',
      ownerToken,
      { attendance: { allowTeacherAmendment: true } },
      fixture.domainName,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.settings).toBeDefined();
    expect(res.body.data.settings.attendance.allowTeacherAmendment).toBe(true);
  });

  it('should return cross-module warnings array', async () => {
    const res = await authPatch(
      app,
      '/api/v1/settings',
      ownerToken,
      { payroll: { autoPopulateClassCounts: true } },
      fixture.domainName,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.warnings)).toBe(true);
  });

  it('should reject without settings.manage permission', async () => {
    await authPatch(
      app,
      '/api/v1/settings',
      teacherToken,
      { attendance: { allowTeacherAmendment: false } },
      fixture.domainName,
    ).expect(403);
  });

  it('should reject invalid settings', async () => {
    await authPatch(
      app,
      '/api/v1/settings',
      ownerToken,
      { attendance: { pendingAlertTimeHour: 'not a number' } },
      fixture.domainName,
    ).expect(400);
  });
});
