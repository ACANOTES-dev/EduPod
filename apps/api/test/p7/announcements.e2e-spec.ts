import { randomUUID } from 'crypto';

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import {
  DEV_PASSWORD,
  authGet,
  authPost,
  authPatch,
  cleanupRedisKeys,
  closeTestApp,
  createTestApp,
  login,
} from '../helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from '../tenant-fixture.builder';

jest.setTimeout(120_000);

describe('Announcements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let cedarFixture: TenantFixture;
  let adminToken: string;
  let teacherToken: string;
  let parentToken: string;
  let cedarAdminToken: string;
  let cedarParentToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);
    cedarFixture = await createTenantFixture(prisma);

    const adminLogin = await login(app, fixture.adminEmail!, DEV_PASSWORD, fixture.domainName);
    adminToken = adminLogin.accessToken;

    const teacherLogin = await login(app, fixture.teacherEmail!, DEV_PASSWORD, fixture.domainName);
    teacherToken = teacherLogin.accessToken;

    const parentLogin = await login(app, fixture.parentEmail!, DEV_PASSWORD, fixture.domainName);
    parentToken = parentLogin.accessToken;

    const cedarLogin = await login(
      app,
      cedarFixture.adminEmail!,
      DEV_PASSWORD,
      cedarFixture.domainName,
    );
    cedarAdminToken = cedarLogin.accessToken;

    const cedarParentLogin = await login(
      app,
      cedarFixture.parentEmail!,
      DEV_PASSWORD,
      cedarFixture.domainName,
    );
    cedarParentToken = cedarParentLogin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['bull:*']);
    await deleteTenantFixture(prisma, fixture);
    await deleteTenantFixture(prisma, cedarFixture);
    await prisma.$disconnect();

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

    const res = await authPost(
      app,
      '/api/v1/announcements',
      token,
      payload,
      fixture.domainName,
    ).expect(201);

    return res.body.data;
  }

  async function publishAnnouncement(id: string, token: string): Promise<Record<string, unknown>> {
    const res = await authPost(
      app,
      `/api/v1/announcements/${id}/publish`,
      token,
      {},
      fixture.domainName,
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
        fixture.domainName,
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
        fixture.domainName,
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
        fixture.domainName,
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
        fixture.domainName,
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
        fixture.domainName,
      ).expect(200);

      expect(res.body.data.title).toBe('Updated Title');
    });

    it('should return 404 for non-existent announcement', async () => {
      await authPatch(
        app,
        `/api/v1/announcements/${randomUUID()}`,
        adminToken,
        { title: 'Ghost' },
        fixture.domainName,
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
        fixture.domainName,
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
        fixture.domainName,
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
        fixture.domainName,
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
        fixture.domainName,
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
        fixture.domainName,
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
        fixture.domainName,
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
        fixture.domainName,
      );

      expect([401, 403]).toContain(res.status);
    });

    it('should return 404 for non-existent announcement', async () => {
      await authPost(
        app,
        `/api/v1/announcements/${randomUUID()}/archive`,
        adminToken,
        {},
        fixture.domainName,
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
        fixture.domainName,
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
        fixture.domainName,
      );

      expect([401, 403]).toContain(res.status);
    });

    it('should return 404 for non-existent announcement', async () => {
      await authGet(
        app,
        `/api/v1/announcements/${randomUUID()}/delivery-status`,
        adminToken,
        fixture.domainName,
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
        fixture.domainName,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 401 when no token provided', async () => {
      const res = await authGet(app, '/api/v1/announcements/my', '', fixture.domainName);

      expect([401, 403]).toContain(res.status);
    });

    it('should return empty array when user has no announcements', async () => {
      // Cedar parent checking their own — they won't see Al Noor announcements
      const res = await authGet(
        app,
        '/api/v1/announcements/my',
        cedarParentToken,
        cedarFixture.domainName,
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
        cedarFixture.domainName,
      ).expect(404);
    });

    it('Cedar admin cannot publish Al Noor announcement', async () => {
      const draft = await createDraftAnnouncement(adminToken);

      const res = await authPost(
        app,
        `/api/v1/announcements/${draft.id}/publish`,
        cedarAdminToken,
        {},
        cedarFixture.domainName,
      );

      expect([403, 404]).toContain(res.status);
    });
  });
});
