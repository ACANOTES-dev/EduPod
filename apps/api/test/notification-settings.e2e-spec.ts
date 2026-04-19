import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { DEV_PASSWORD, authGet, authPatch, closeTestApp, createTestApp, login } from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

describe('Notification Settings Endpoints (e2e)', () => {
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

  it('should list notification settings', async () => {
    const res = await authGet(
      app,
      '/api/v1/notification-settings',
      ownerToken,
      fixture.domainName,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(12);
  });

  it('should update a notification setting', async () => {
    const res = await authPatch(
      app,
      '/api/v1/notification-settings/invoice.issued',
      ownerToken,
      { is_enabled: false },
      fixture.domainName,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.notification_type).toBe('invoice.issued');
    expect(res.body.data.is_enabled).toBe(false);
  });

  it('should reject without notifications.manage permission', async () => {
    await authPatch(
      app,
      '/api/v1/notification-settings/invoice.issued',
      teacherToken,
      { is_enabled: true },
      fixture.domainName,
    ).expect(403);
  });
});
