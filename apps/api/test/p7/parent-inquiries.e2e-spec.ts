import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  createTestApp,
  closeTestApp,
  getAuthToken,
  authGet,
  authPost,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  CEDAR_PARENT_EMAIL,
  AL_NOOR_DOMAIN,
  CEDAR_DOMAIN,
} from '../helpers';

jest.setTimeout(120_000);

describe('Parent Inquiries (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let parentToken: string;
  let teacherToken: string;
  let cedarParentToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    [adminToken, parentToken, teacherToken, cedarParentToken] = await Promise.all([
      getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN),
      getAuthToken(app, AL_NOOR_PARENT_EMAIL, AL_NOOR_DOMAIN),
      getAuthToken(app, AL_NOOR_TEACHER_EMAIL, AL_NOOR_DOMAIN),
      getAuthToken(app, CEDAR_PARENT_EMAIL, CEDAR_DOMAIN),
    ]);
  }, 60_000);

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── Helper ───────────────────────────────────────────────────────────────────

  function createInquiry(token: string, overrides: Record<string, unknown> = {}) {
    const body = {
      subject: `Test inquiry ${Date.now()}`,
      message: 'I have a question about my child.',
      ...overrides,
    };
    return authPost(app, '/api/v1/inquiries', token, body, AL_NOOR_DOMAIN);
  }

  // ─── POST /api/v1/inquiries (Parent) ──────────────────────────────────────────

  describe('POST /api/v1/inquiries', () => {
    it('happy path — parent creates inquiry without student', async () => {
      const res = await createInquiry(parentToken).expect(201);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.subject).toMatch(/^Test inquiry/);
      expect(res.body.data.status).toBe('open');
    });

    it('auth failure → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inquiries')
        .set('Host', AL_NOOR_DOMAIN)
        .send({ subject: 'Test', message: 'Hello' })
        .expect(401);
    });

    it('permission failure — admin JWT → 403', async () => {
      await authPost(
        app,
        '/api/v1/inquiries',
        adminToken,
        { subject: 'Test', message: 'Hello' },
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('validation failure — missing subject → 400', async () => {
      await authPost(
        app,
        '/api/v1/inquiries',
        parentToken,
        { message: 'No subject' },
        AL_NOOR_DOMAIN,
      ).expect(400);
    });
  });

  // ─── POST /api/v1/inquiries/:id/messages (Admin) ─────────────────────────────

  describe('POST /api/v1/inquiries/:id/messages', () => {
    let inquiryId: string;

    beforeAll(async () => {
      const res = await createInquiry(parentToken).expect(201);
      inquiryId = res.body.data.id;
    });

    it('happy path — admin reply transitions open → in_progress', async () => {
      const res = await authPost(
        app,
        `/api/v1/inquiries/${inquiryId}/messages`,
        adminToken,
        { message: 'We will look into this.' },
        AL_NOOR_DOMAIN,
      ).expect(201);

      expect(res.body.data).toBeDefined();

      // Verify inquiry status changed
      const inquiryRes = await authGet(
        app,
        `/api/v1/inquiries/${inquiryId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(inquiryRes.body.data.status).toBe('in_progress');
    });

    it('auth failure → 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inquiries/${inquiryId}/messages`)
        .set('Host', AL_NOOR_DOMAIN)
        .send({ message: 'No auth' })
        .expect(401);
    });

    it('permission failure — teacher token → 403', async () => {
      await authPost(
        app,
        `/api/v1/inquiries/${inquiryId}/messages`,
        teacherToken,
        { message: 'Teacher reply' },
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('closed inquiry → 400 INQUIRY_CLOSED', async () => {
      // Create and close an inquiry
      const createRes = await createInquiry(parentToken).expect(201);
      const id = createRes.body.data.id;

      await authPost(app, `/api/v1/inquiries/${id}/close`, adminToken, {}, AL_NOOR_DOMAIN).expect(
        200,
      );

      // Try to add message to closed inquiry
      const res = await authPost(
        app,
        `/api/v1/inquiries/${id}/messages`,
        adminToken,
        { message: 'Too late' },
        AL_NOOR_DOMAIN,
      ).expect(400);

      expect(res.body.error.code).toBe('INQUIRY_CLOSED');
    });

    it('not found → 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await authPost(
        app,
        `/api/v1/inquiries/${fakeId}/messages`,
        adminToken,
        { message: 'Ghost' },
        AL_NOOR_DOMAIN,
      ).expect(404);
    });
  });

  // ─── GET /api/v1/inquiries/:id/parent (Parent) ───────────────────────────────

  describe('GET /api/v1/inquiries/:id/parent', () => {
    let inquiryId: string;

    beforeAll(async () => {
      const createRes = await createInquiry(parentToken).expect(201);
      inquiryId = createRes.body.data.id;

      // Admin replies
      await authPost(
        app,
        `/api/v1/inquiries/${inquiryId}/messages`,
        adminToken,
        { message: 'Admin response here.' },
        AL_NOOR_DOMAIN,
      ).expect(201);
    });

    it('happy path — admin author masked as School Administration', async () => {
      const res = await authGet(
        app,
        `/api/v1/inquiries/${inquiryId}/parent`,
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      const data = res.body.data;
      expect(data).toBeDefined();

      // Find the admin message
      const messages = data.messages ?? data.inquiry_messages ?? [];
      const adminMsg = messages.find(
        (m: Record<string, unknown>) => m.message === 'Admin response here.',
      );
      expect(adminMsg).toBeDefined();

      // Author should be masked
      const author = adminMsg.author ?? adminMsg.sender;
      expect(author.first_name).toBe('School');
      expect(author.last_name).toBe('Administration');
    });

    it('auth failure → 401', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/inquiries/${inquiryId}/parent`)
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('parent cannot view other parent inquiry — cross-tenant → 404', async () => {
      await authGet(
        app,
        `/api/v1/inquiries/${inquiryId}/parent`,
        cedarParentToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });

  // ─── POST /api/v1/inquiries/:id/close (Admin) ────────────────────────────────

  describe('POST /api/v1/inquiries/:id/close', () => {
    it('happy path — close open inquiry', async () => {
      const createRes = await createInquiry(parentToken).expect(201);
      const id = createRes.body.data.id;

      const res = await authPost(
        app,
        `/api/v1/inquiries/${id}/close`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.status).toBe('closed');
    });

    it('auth failure → 401', async () => {
      const createRes = await createInquiry(parentToken).expect(201);
      const id = createRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/inquiries/${id}/close`)
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('cannot close already-closed inquiry → 400', async () => {
      const createRes = await createInquiry(parentToken).expect(201);
      const id = createRes.body.data.id;

      // Close it
      await authPost(app, `/api/v1/inquiries/${id}/close`, adminToken, {}, AL_NOOR_DOMAIN).expect(
        200,
      );

      // Try to close again
      await authPost(app, `/api/v1/inquiries/${id}/close`, adminToken, {}, AL_NOOR_DOMAIN).expect(
        400,
      );
    });
  });

  // ─── POST /api/v1/inquiries/:id/messages/parent (Parent) ─────────────────────

  describe('POST /api/v1/inquiries/:id/messages/parent', () => {
    let inquiryId: string;

    beforeAll(async () => {
      const createRes = await createInquiry(parentToken).expect(201);
      inquiryId = createRes.body.data.id;
    });

    it('happy path → 201', async () => {
      const res = await authPost(
        app,
        `/api/v1/inquiries/${inquiryId}/messages/parent`,
        parentToken,
        { message: 'Follow-up from parent' },
        AL_NOOR_DOMAIN,
      ).expect(201);

      expect(res.body.data).toBeDefined();
    });

    it('parent cannot message on closed inquiry → 400 INQUIRY_CLOSED', async () => {
      const createRes = await createInquiry(parentToken).expect(201);
      const id = createRes.body.data.id;

      // Close it
      await authPost(app, `/api/v1/inquiries/${id}/close`, adminToken, {}, AL_NOOR_DOMAIN).expect(
        200,
      );

      // Parent tries to message
      const res = await authPost(
        app,
        `/api/v1/inquiries/${id}/messages/parent`,
        parentToken,
        { message: 'Too late' },
        AL_NOOR_DOMAIN,
      ).expect(400);

      expect(res.body.error.code).toBe('INQUIRY_CLOSED');
    });

    it('auth failure → 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inquiries/${inquiryId}/messages/parent`)
        .set('Host', AL_NOOR_DOMAIN)
        .send({ message: 'No auth' })
        .expect(401);
    });
  });
});
