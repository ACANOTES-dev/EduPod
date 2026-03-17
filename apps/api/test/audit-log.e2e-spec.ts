import './setup-env';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  PLATFORM_ADMIN_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  login,
  getAuthToken,
} from './helpers';

jest.setTimeout(60_000);

describe('Audit Logs (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let parentToken: string;
  let platformToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    parentToken = parentLogin.accessToken;

    platformToken = await getAuthToken(app, PLATFORM_ADMIN_EMAIL);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── GET /api/v1/audit-logs ───────────────────────────────────────────────────

  describe('GET /api/v1/audit-logs', () => {
    it('should return 200 with paginated audit logs for authenticated user', async () => {
      const res = await authGet(
        app,
        '/api/v1/audit-logs',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // ResponseTransformInterceptor passes through {data, meta} as-is
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toBeDefined();
      expect(typeof res.body.meta.page).toBe('number');
      expect(typeof res.body.meta.pageSize).toBe('number');
      expect(typeof res.body.meta.total).toBe('number');
    });

    it('should return 401 when no auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('should return 403 when user lacks analytics.view permission', async () => {
      await authGet(
        app,
        '/api/v1/audit-logs',
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('should filter by entity_type query param', async () => {
      const res = await authGet(
        app,
        '/api/v1/audit-logs?entity_type=auth',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns {data, meta} → interceptor passes through as-is
      expect(res.body.data).toBeInstanceOf(Array);
      for (const log of res.body.data) {
        expect(log.entity_type).toBe('auth');
      }
    });

    it('should filter by action query param', async () => {
      const res = await authGet(
        app,
        '/api/v1/audit-logs?action=login',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns {data, meta} → interceptor passes through as-is
      expect(res.body.data).toBeInstanceOf(Array);
      for (const log of res.body.data) {
        expect(log.action).toBe('login');
      }
    });

    it('should filter by date range', async () => {
      const startDate = '2020-01-01T00:00:00.000Z';
      const endDate = new Date().toISOString();

      const res = await authGet(
        app,
        `/api/v1/audit-logs?start_date=${startDate}&end_date=${endDate}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns {data, meta} → interceptor passes through as-is
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(0);
    });

    it('should paginate correctly with page=2', async () => {
      const res = await authGet(
        app,
        '/api/v1/audit-logs?page=2&pageSize=1',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns {data, meta} → interceptor passes through as-is
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta.page).toBe(2);
      expect(res.body.meta.pageSize).toBe(1);
    });
  });

  // ─── GET /api/v1/admin/audit-logs ─────────────────────────────────────────────

  describe('GET /api/v1/admin/audit-logs', () => {
    it('should return 200 with cross-tenant audit logs for platform admin', async () => {
      const res = await authGet(
        app,
        '/api/v1/admin/audit-logs',
        platformToken,
      ).expect(200);

      // Service returns {data, meta} → interceptor passes through as-is
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toBeDefined();
      expect(typeof res.body.meta.page).toBe('number');
      expect(typeof res.body.meta.total).toBe('number');

      // Platform admin response may include tenant_name field
      if (res.body.data.length > 0) {
        const firstLog = res.body.data[0];
        expect(firstLog).toHaveProperty('id');
        expect(firstLog).toHaveProperty('action');
      }
    });

    it('should return 401 when no auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .expect(401);
    });

    it('should return 403 when non-platform-owner accesses admin audit logs', async () => {
      // PlatformOwnerGuard rejects tenant owners — they are not platform owners
      await authGet(
        app,
        '/api/v1/admin/audit-logs',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('should filter by tenant_id query param', async () => {
      // First get some logs to find a tenant_id
      const allRes = await authGet(
        app,
        '/api/v1/admin/audit-logs',
        platformToken,
      ).expect(200);

      // Service returns {data, meta} → interceptor passes through as-is
      if (allRes.body.data.length === 0) return; // skip if no logs

      const tenantId = allRes.body.data[0].tenant_id;
      if (!tenantId) return; // some logs may not have tenant_id

      const res = await authGet(
        app,
        `/api/v1/admin/audit-logs?tenant_id=${tenantId}`,
        platformToken,
      ).expect(200);

      // Service returns {data, meta} → interceptor passes through as-is
      expect(res.body.data).toBeInstanceOf(Array);
      for (const log of res.body.data) {
        if (log.tenant_id) {
          expect(log.tenant_id).toBe(tenantId);
        }
      }
    });
  });
});
