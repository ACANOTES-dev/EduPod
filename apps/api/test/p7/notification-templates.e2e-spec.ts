import { randomUUID } from 'crypto';

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import {
  DEV_PASSWORD,
  authGet,
  authPatch,
  authPost,
  cleanupRedisKeys,
  closeTestApp,
  createTestApp,
  login,
} from '../helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from '../tenant-fixture.builder';

jest.setTimeout(120_000);

describe('Notification Templates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let adminToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);

    const adminLogin = await login(app, fixture.adminEmail!, DEV_PASSWORD, fixture.domainName);
    adminToken = adminLogin.accessToken;

    const teacherLogin = await login(app, fixture.teacherEmail!, DEV_PASSWORD, fixture.domainName);
    teacherToken = teacherLogin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['bull:*']);
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  // ─── GET /api/v1/notification-templates ───────────────────────────────────

  describe('GET /api/v1/notification-templates', () => {
    it('happy path — admin lists notification templates', async () => {
      const res = await authGet(
        app,
        '/api/v1/notification-templates',
        adminToken,
        fixture.domainName,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      // Should include platform-level seeded templates
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should return 401 when no token provided', async () => {
      const res = await authGet(app, '/api/v1/notification-templates', '', fixture.domainName);

      expect([401, 403]).toContain(res.status);
    });

    it('should return 403 when teacher lacks communications.manage', async () => {
      await authGet(app, '/api/v1/notification-templates', teacherToken, fixture.domainName).expect(
        403,
      );
    });
  });

  // ─── POST /api/v1/notification-templates ──────────────────────────────────

  describe('POST /api/v1/notification-templates', () => {
    const uniqueKey = `test_template_${Date.now()}`;

    it('happy path — create custom notification template', async () => {
      const res = await authPost(
        app,
        '/api/v1/notification-templates',
        adminToken,
        {
          template_key: uniqueKey,
          channel: 'in_app',
          locale: 'en',
          subject_template: 'Test Template Subject',
          body_template: 'Hello {{name}}, this is a test notification.',
        },
        fixture.domainName,
      ).expect(201);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.template_key).toBe(uniqueKey);
      expect(res.body.data.channel).toBe('in_app');
      expect(res.body.data.locale).toBe('en');
    });

    it('should return 401 when no token provided', async () => {
      const res = await authPost(
        app,
        '/api/v1/notification-templates',
        '',
        {
          template_key: 'no_auth_template',
          channel: 'in_app',
          locale: 'en',
          subject_template: 'No Auth',
          body_template: 'No auth body',
        },
        fixture.domainName,
      );

      expect([401, 403]).toContain(res.status);
    });

    it('should return 409 when creating duplicate template_key/channel/locale', async () => {
      // First creation already happened above, try same combo again
      await authPost(
        app,
        '/api/v1/notification-templates',
        adminToken,
        {
          template_key: uniqueKey,
          channel: 'in_app',
          locale: 'en',
          subject_template: 'Duplicate Subject',
          body_template: 'Duplicate body',
        },
        fixture.domainName,
      ).expect(409);
    });
  });

  // ─── PATCH /api/v1/notification-templates/:id ─────────────────────────────

  describe('PATCH /api/v1/notification-templates/:id', () => {
    it('happy path — update tenant template body', async () => {
      // Create a template to update
      const createRes = await authPost(
        app,
        '/api/v1/notification-templates',
        adminToken,
        {
          template_key: `update_test_${Date.now()}`,
          channel: 'in_app',
          locale: 'en',
          subject_template: 'Original Subject',
          body_template: 'Original body content',
        },
        fixture.domainName,
      ).expect(201);

      const templateId = createRes.body.data.id;

      const res = await authPatch(
        app,
        `/api/v1/notification-templates/${templateId}`,
        adminToken,
        {
          body_template: 'Updated body content with {{variable}}',
          subject_template: 'Updated Subject',
        },
        fixture.domainName,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.body_template).toBe('Updated body content with {{variable}}');
      expect(res.body.data.subject_template).toBe('Updated Subject');
    });

    it('should return 401 when no token provided', async () => {
      const res = await authPatch(
        app,
        `/api/v1/notification-templates/${randomUUID()}`,
        '',
        { body_template: 'No auth' },
        fixture.domainName,
      );

      expect([401, 403]).toContain(res.status);
    });

    it('should return 404 for non-existent template', async () => {
      await authPatch(
        app,
        `/api/v1/notification-templates/${randomUUID()}`,
        adminToken,
        { body_template: 'Ghost template' },
        fixture.domainName,
      ).expect(404);
    });
  });
});
