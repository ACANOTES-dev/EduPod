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

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let cedarFixture: TenantFixture;
  let adminToken: string;
  let parentToken: string;
  let _teacherToken: string;
  let cedarAdminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);
    cedarFixture = await createTenantFixture(prisma);

    const adminLogin = await login(app, fixture.adminEmail!, DEV_PASSWORD, fixture.domainName);
    adminToken = adminLogin.accessToken;

    const parentLogin = await login(app, fixture.parentEmail!, DEV_PASSWORD, fixture.domainName);
    parentToken = parentLogin.accessToken;

    const teacherLogin = await login(app, fixture.teacherEmail!, DEV_PASSWORD, fixture.domainName);
    _teacherToken = teacherLogin.accessToken;

    const cedarLogin = await login(
      app,
      cedarFixture.adminEmail!,
      DEV_PASSWORD,
      cedarFixture.domainName,
    );
    cedarAdminToken = cedarLogin.accessToken;

    // Publish a school-wide announcement so notifications are created for users
    await seedNotifications();
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['bull:*']);
    await deleteTenantFixture(prisma, fixture);
    await deleteTenantFixture(prisma, cedarFixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  // ─── Seed: publish announcement to generate in-app notifications ────────

  async function seedNotifications(): Promise<void> {
    const createRes = await authPost(
      app,
      '/api/v1/announcements',
      adminToken,
      {
        title: 'Notification Seed Announcement',
        body_html: '<p>Generates notifications for e2e tests</p>',
        scope: 'school',
        target_payload: {},
      },
      fixture.domainName,
    ).expect(201);

    const announcementId = createRes.body.data.id;

    await authPost(
      app,
      `/api/v1/announcements/${announcementId}/publish`,
      adminToken,
      {},
      fixture.domainName,
    ).expect(200);

    // Allow a small window for async notification creation
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // ─── GET /api/v1/notifications ────────────────────────────────────────────

  describe('GET /api/v1/notifications', () => {
    it('happy path — returns current user notifications', async () => {
      const res = await authGet(
        app,
        '/api/v1/notifications',
        parentToken,
        fixture.domainName,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 401 when no token provided', async () => {
      const res = await authGet(app, '/api/v1/notifications', '', fixture.domainName);

      expect([401, 403]).toContain(res.status);
    });
  });

  // ─── GET /api/v1/notifications/unread-count ───────────────────────────────

  describe('GET /api/v1/notifications/unread-count', () => {
    it('happy path — returns unread count', async () => {
      const res = await authGet(
        app,
        '/api/v1/notifications/unread-count',
        parentToken,
        fixture.domainName,
      ).expect(200);

      // getUnreadCount returns a number, wrapped as { data: number }
      expect(typeof res.body.data).toBe('number');
      expect(res.body.data).toBeGreaterThanOrEqual(0);
    });

    it('should return 401 when no token provided', async () => {
      const res = await authGet(app, '/api/v1/notifications/unread-count', '', fixture.domainName);

      expect([401, 403]).toContain(res.status);
    });
  });

  // ─── PATCH /api/v1/notifications/:id/read ─────────────────────────────────

  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('happy path — mark notification as read', async () => {
      // First get notifications to find one to mark
      const listRes = await authGet(
        app,
        '/api/v1/notifications',
        parentToken,
        fixture.domainName,
      ).expect(200);

      const notifications = listRes.body.data;
      if (notifications.length === 0) {
        // If no notifications exist, just verify the endpoint returns 404 for a random ID
        await authPatch(
          app,
          `/api/v1/notifications/${randomUUID()}/read`,
          parentToken,
          {},
          fixture.domainName,
        ).expect(404);
        return;
      }

      const notificationId = notifications[0].id;
      await authPatch(
        app,
        `/api/v1/notifications/${notificationId}/read`,
        parentToken,
        {},
        fixture.domainName,
      ).expect(200);
    });

    it('should return 401 when no token provided', async () => {
      const res = await authPatch(
        app,
        `/api/v1/notifications/${randomUUID()}/read`,
        '',
        {},
        fixture.domainName,
      );

      expect([401, 403]).toContain(res.status);
    });

    it('should return 404 for another user notification or non-existent', async () => {
      await authPatch(
        app,
        `/api/v1/notifications/${randomUUID()}/read`,
        parentToken,
        {},
        fixture.domainName,
      ).expect(404);
    });
  });

  // ─── POST /api/v1/notifications/mark-all-read ────────────────────────────

  describe('POST /api/v1/notifications/mark-all-read', () => {
    it('happy path — marks all notifications as read', async () => {
      await authPost(
        app,
        '/api/v1/notifications/mark-all-read',
        parentToken,
        {},
        fixture.domainName,
      ).expect(200);
    });

    it('should return 401 when no token provided', async () => {
      const res = await authPost(
        app,
        '/api/v1/notifications/mark-all-read',
        '',
        {},
        fixture.domainName,
      );

      expect([401, 403]).toContain(res.status);
    });
  });

  // ─── GET /api/v1/notifications/admin/failed ───────────────────────────────

  describe('GET /api/v1/notifications/admin/failed', () => {
    it('happy path — admin can view failed notifications', async () => {
      const res = await authGet(
        app,
        '/api/v1/notifications/admin/failed',
        adminToken,
        fixture.domainName,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 401 when no token provided', async () => {
      const res = await authGet(app, '/api/v1/notifications/admin/failed', '', fixture.domainName);

      expect([401, 403]).toContain(res.status);
    });

    it('should return 403 when parent tries to access', async () => {
      await authGet(
        app,
        '/api/v1/notifications/admin/failed',
        parentToken,
        fixture.domainName,
      ).expect(403);
    });
  });

  // ─── RLS: Cross-tenant isolation ─────────────────────────────────────────

  describe('RLS — cross-tenant notification isolation', () => {
    it('Cedar admin cannot see Al Noor notifications', async () => {
      const res = await authGet(
        app,
        '/api/v1/notifications',
        cedarAdminToken,
        cedarFixture.domainName,
      ).expect(200);

      // Cedar admin should not have Al Noor's announcement notifications
      const notifications = res.body.data;
      for (const n of notifications) {
        // If the notification has a tenant_id, it should not be Al Noor's
        expect(n.title).not.toBe('Notification Seed Announcement');
      }
    });
  });
});
