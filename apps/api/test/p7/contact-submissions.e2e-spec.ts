import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  createTestApp,
  closeTestApp,
  getAuthToken,
  authGet,
  authPatch,
  cleanupRedisKeys,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  AL_NOOR_DOMAIN,
} from '../helpers';

jest.setTimeout(120_000);

describe('Contact Submissions (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    [adminToken, teacherToken] = await Promise.all([
      getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN),
      getAuthToken(app, AL_NOOR_TEACHER_EMAIL, AL_NOOR_DOMAIN),
    ]);

    // Ensure at least one contact submission exists
    await cleanupRedisKeys(['rate:contact:*']);
    await request(app.getHttpServer())
      .post('/api/v1/public/contact')
      .set('Host', AL_NOOR_DOMAIN)
      .send({
        name: 'Seed Contact',
        email: 'seed@example.com',
        message: 'Seed submission for admin list test.',
        _honeypot: '',
      })
      .expect(201);
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['rate:contact:*']);
    await closeTestApp();
  });

  // ─── GET /api/v1/contact-submissions ──────────────────────────────────────────

  describe('GET /api/v1/contact-submissions', () => {
    it('happy path — admin can list submissions', async () => {
      const res = await authGet(
        app,
        '/api/v1/contact-submissions',
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('auth failure → 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/contact-submissions')
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('permission failure — teacher token → 403', async () => {
      await authGet(app, '/api/v1/contact-submissions', teacherToken, AL_NOOR_DOMAIN).expect(403);
    });
  });

  // ─── PATCH /api/v1/contact-submissions/:id/status ─────────────────────────────

  describe('PATCH /api/v1/contact-submissions/:id/status', () => {
    let submissionId: string;

    beforeAll(async () => {
      // Create a fresh submission
      await cleanupRedisKeys(['rate:contact:*']);
      const contactRes = await request(app.getHttpServer())
        .post('/api/v1/public/contact')
        .set('Host', AL_NOOR_DOMAIN)
        .send({
          name: 'Status Test',
          email: 'status@example.com',
          message: 'For status transition test.',
          _honeypot: '',
        })
        .expect(201);

      submissionId = contactRes.body.data.id;
    });

    it('happy path — new_submission to reviewed', async () => {
      const res = await authPatch(
        app,
        `/api/v1/contact-submissions/${submissionId}/status`,
        adminToken,
        { status: 'reviewed' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.status).toBe('reviewed');
    });

    it('invalid transition — closed to reviewed → 400', async () => {
      // First transition to closed
      await authPatch(
        app,
        `/api/v1/contact-submissions/${submissionId}/status`,
        adminToken,
        { status: 'closed' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Try invalid transition back to reviewed
      const res = await authPatch(
        app,
        `/api/v1/contact-submissions/${submissionId}/status`,
        adminToken,
        { status: 'reviewed' },
        AL_NOOR_DOMAIN,
      ).expect(400);

      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('auth failure → 401', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/contact-submissions/${submissionId}/status`)
        .set('Host', AL_NOOR_DOMAIN)
        .send({ status: 'reviewed' })
        .expect(401);
    });

    it('not found → 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await authPatch(
        app,
        `/api/v1/contact-submissions/${fakeId}/status`,
        adminToken,
        { status: 'reviewed' },
        AL_NOOR_DOMAIN,
      ).expect(404);
    });
  });
});
