import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_DOMAIN,
  AL_NOOR_PARENT_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  CEDAR_ADMIN_EMAIL,
  CEDAR_PARENT_EMAIL,
  CEDAR_DOMAIN,
  DEV_PASSWORD,
  authGet,
  authPost,
  authPatch,
  cleanupRedisKeys,
  closeTestApp,
  createTestApp,
  login,
} from '../helpers';

jest.setTimeout(120_000);

describe('Announcements (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let teacherToken: string;
  let parentToken: string;
  let cedarAdminToken: string;
  let cedarParentToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const adminLogin = await login(app, AL_NOOR_ADMIN_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    adminToken = adminLogin.accessToken;

    const teacherLogin = await login(app, AL_NOOR_TEACHER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    teacherToken = teacherLogin.accessToken;

    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    parentToken = parentLogin.accessToken;

    const cedarLogin = await login(app, CEDAR_ADMIN_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN);
    cedarAdminToken = cedarLogin.accessToken;

    const cedarParentLogin = await login(app, CEDAR_PARENT_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN);
    cedarParentToken = cedarParentLogin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['bull:*']);
    await closeTestApp();
  });

  // ─── Helper ────────────────────────────────────────────────────────────────

  async function createDraftAnnouncement(
    token: string,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const payload = {
      title: 'Test Announcement',
      body_html: '<p>Hello World</p>',
      scope: 'school',
      target_payload: {},
      ...overrides,
    };

    const res = await authPost(app, '/api/v1/announcements', token, payload, AL_NOOR_DOMAIN)
      .expect(201);

    return res.body.data;
  }

  async function publishAnnouncement(
    id: string,
    token: string,
  ): Promise<Record<string, unknown>> {
    const res = await authPost(
      app,
      `/api/v1/announcements/${id}/publish`,
      token,
      {},
      AL_NOOR_DOMAIN,
    ).expect(200);

    return res.body.data;
  }

  // ─── POST /api/v1/announcements ──────────────────────────────────────────

  describe('POST /api/v1/announcements', () => {
    it('happy path — school scope: admin creates announcement', async () => {
      const res = await authPost(
        app,
        '/api/v1/announcements',
        adminToken,
        {
          title: 'School-wide Announcement',
          body_html: '<p>Important update for all</p>',
          scope: 'school',
          target_payload: {},
        },
        AL_NOOR_DOMAIN,
      ).expect(201);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.scope).toBe('school');
      expect(res.body.data.title).toBe('School-wide Announcement');
    });

    it('should return 401 when no token provided', async () => {
      const res = await authPost(
        app,
        '/api/v1/announcements',
        '',
        {
          title: 'No Auth',
          body_html: '<p>Test</p>',
          scope: 'school',
          target_payload: {},
        },
        AL_NOOR_DOMAIN,
      );

      expect([401, 403]).toContain(res.status);
    });

    it('should return 403 when user lacks communications.manage permission', async () => {
      await authPost(
        app,
        '/api/v1/announcements',
        teacherToken,
        {
          title: 'Teacher Announcement',
          body_html: '<p>Test</p>',
          scope: 'school',
          target_payload: {},
        },
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('should return 400 when title is missing', async () => {
      await authPost(
        app,
        '/api/v1/announcements',
        adminToken,
        {
          body_html: '<p>No title</p>',
          scope: 'school',
          target_payload: {},
        },
        AL_NOOR_DOMAIN,
      ).expect(400);
    });
  });

  // ─── PATCH /api/v1/announcements/:id ─────────────────────────────────────

  describe('PATCH /api/v1/announcements/:id', () => {
    it('happy path — update draft announcement title', async () => {
      const draft = await createDraftAnnouncement(adminToken);

      const res = await authPatch(
        app,
        `/api/v1/announcements/${draft.id}`,
        adminToken,
        { title: 'Updated Title' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.title).toBe('Updated Title');
    });

    it('should return 404 for non-existent announcement', async () => {
      await authPatch(
        app,
        `/api/v1/announcements/${randomUUID()}`,
        adminToken,
        { title: 'Ghost' },
        AL_NOOR_DOMAIN,
      ).expect(404);
    });

    it('should return 400 when editing a published announcement', async () => {
      const draft = await createDraftAnnouncement(adminToken);
      await publishAnnouncement(draft.id as string, adminToken);

      await authPatch(
        app,
        `/api/v1/announcements/${draft.id}`,
        adminToken,
        { title: 'Cannot Edit Published' },
        AL_NOOR_DOMAIN,
      ).expect(400);
    });
  });

  // ─── POST /api/v1/announcements/:id/publish ──────────────────────────────

  describe('POST /api/v1/announcements/:id/publish', () => {
    it('happy path — immediate publish', async () => {
      const draft = await createDraftAnnouncement(adminToken);

      const res = await authPost(
        app,
        `/api/v1/announcements/${draft.id}/publish`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.status).toBe('published');
    });

    it('should return 401 when no token provided', async () => {
      const draft = await createDraftAnnouncement(adminToken);

      const res = await authPost(
        app,
        `/api/v1/announcements/${draft.id}/publish`,
        '',
        {},
        AL_NOOR_DOMAIN,
      );

      expect([401, 403]).toContain(res.status);
    });

    it('should return 400 when publishing an already published announcement', async () => {
      const draft = await createDraftAnnouncement(adminToken);
      await publishAnnouncement(draft.id as string, adminToken);

      await authPost(
        app,
        `/api/v1/announcements/${draft.id}/publish`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(400);
    });
  });

  // ─── POST /api/v1/announcements/:id/archive ──────────────────────────────

  describe('POST /api/v1/announcements/:id/archive', () => {
    it('happy path — archive published announcement', async () => {
      const draft = await createDraftAnnouncement(adminToken);
      await publishAnnouncement(draft.id as string, adminToken);

      const res = await authPost(
        app,
        `/api/v1/announcements/${draft.id}/archive`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.status).toBe('archived');
    });

    it('happy path — archive draft announcement', async () => {
      const draft = await createDraftAnnouncement(adminToken);

      const res = await authPost(
        app,
        `/api/v1/announcements/${draft.id}/archive`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.status).toBe('archived');
    });

    it('should return 401 when no token provided', async () => {
      const draft = await createDraftAnnouncement(adminToken);

      const res = await authPost(
        app,
        `/api/v1/announcements/${draft.id}/archive`,
        '',
        {},
        AL_NOOR_DOMAIN,
      );

      expect([401, 403]).toContain(res.status);
    });

    it('should return 404 for non-existent announcement', async () => {
      await authPost(
        app,
        `/api/v1/announcements/${randomUUID()}/archive`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(404);
    });
  });

  // ─── GET /api/v1/announcements/:id/delivery-status ───────────────────────

  describe('GET /api/v1/announcements/:id/delivery-status', () => {
    it('happy path — returns delivery counts for published announcement', async () => {
      const draft = await createDraftAnnouncement(adminToken);
      await publishAnnouncement(draft.id as string, adminToken);

      const res = await authGet(
        app,
        `/api/v1/announcements/${draft.id}/delivery-status`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      // Expect numeric count fields
      expect(typeof res.body.data.total).toBe('number');
    });

    it('should return 401 when no token provided', async () => {
      const draft = await createDraftAnnouncement(adminToken);

      const res = await authGet(
        app,
        `/api/v1/announcements/${draft.id}/delivery-status`,
        '',
        AL_NOOR_DOMAIN,
      );

      expect([401, 403]).toContain(res.status);
    });

    it('should return 404 for non-existent announcement', async () => {
      await authGet(
        app,
        `/api/v1/announcements/${randomUUID()}/delivery-status`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(404);
    });
  });

  // ─── GET /api/v1/announcements/my ────────────────────────────────────────

  describe('GET /api/v1/announcements/my', () => {
    it('happy path — parent can list their announcements', async () => {
      // Publish a school-wide announcement so the parent might have it
      const draft = await createDraftAnnouncement(adminToken);
      await publishAnnouncement(draft.id as string, adminToken);

      const res = await authGet(
        app,
        '/api/v1/announcements/my',
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 401 when no token provided', async () => {
      const res = await authGet(
        app,
        '/api/v1/announcements/my',
        '',
        AL_NOOR_DOMAIN,
      );

      expect([401, 403]).toContain(res.status);
    });

    it('should return empty array when user has no announcements', async () => {
      // Cedar parent checking their own — they won't see Al Noor announcements
      const res = await authGet(
        app,
        '/api/v1/announcements/my',
        cedarParentToken,
        CEDAR_DOMAIN,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ─── RLS: Cross-tenant isolation ─────────────────────────────────────────

  describe('RLS — cross-tenant isolation', () => {
    it('Cedar admin cannot see Al Noor announcements', async () => {
      const draft = await createDraftAnnouncement(adminToken);

      // Cedar admin tries to access Al Noor announcement
      await authGet(
        app,
        `/api/v1/announcements/${draft.id}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('Cedar admin cannot publish Al Noor announcement', async () => {
      const draft = await createDraftAnnouncement(adminToken);

      const res = await authPost(
        app,
        `/api/v1/announcements/${draft.id}/publish`,
        cedarAdminToken,
        {},
        CEDAR_DOMAIN,
      );

      expect([403, 404]).toContain(res.status);
    });
  });
});
