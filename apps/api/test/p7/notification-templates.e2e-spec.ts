import { randomUUID } from 'crypto';

import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_DOMAIN,
  AL_NOOR_TEACHER_EMAIL,
  DEV_PASSWORD,
  authGet,
  authPatch,
  authPost,
  cleanupRedisKeys,
  closeTestApp,
  createTestApp,
  login,
} from '../helpers';

jest.setTimeout(120_000);

describe('Notification Templates (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const adminLogin = await login(app, AL_NOOR_ADMIN_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    adminToken = adminLogin.accessToken;

    const teacherLogin = await login(app, AL_NOOR_TEACHER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    teacherToken = teacherLogin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['bull:*']);
    await closeTestApp();
  });

  // ─── GET /api/v1/notification-templates ───────────────────────────────────

  describe('GET /api/v1/notification-templates', () => {
    it('happy path — admin lists notification templates', async () => {
      const res = await authGet(
        app,
        '/api/v1/notification-templates',
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      // Should include platform-level seeded templates
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should return 401 when no token provided', async () => {
      const res = await authGet(app, '/api/v1/notification-templates', '', AL_NOOR_DOMAIN);

      expect([401, 403]).toContain(res.status);
    });

    it('should return 403 when teacher lacks communications.manage', async () => {
      await authGet(app, '/api/v1/notification-templates', teacherToken, AL_NOOR_DOMAIN).expect(
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
        AL_NOOR_DOMAIN,
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
        AL_NOOR_DOMAIN,
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
        AL_NOOR_DOMAIN,
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
        AL_NOOR_DOMAIN,
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
        AL_NOOR_DOMAIN,
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
        AL_NOOR_DOMAIN,
      );

      expect([401, 403]).toContain(res.status);
    });

    it('should return 404 for non-existent template', async () => {
      await authPatch(
        app,
        `/api/v1/notification-templates/${randomUUID()}`,
        adminToken,
        { body_template: 'Ghost template' },
        AL_NOOR_DOMAIN,
      ).expect(404);
    });
  });
});
