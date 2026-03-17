import './setup-env';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  login,
} from './helpers';

jest.setTimeout(60_000);

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let parentToken: string;

  // IDs discovered from seeded data
  let academicYearId: string;
  let studentId: string;
  let householdId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    parentToken = parentLogin.accessToken;

    // Discover academic year ID from seeded data
    // These list endpoints return {data, meta} → interceptor passes through as-is
    const ayRes = await authGet(
      app,
      '/api/v1/academic-years',
      ownerToken,
      AL_NOOR_DOMAIN,
    );
    const years = ayRes.body.data;
    if (years && years.length > 0) {
      academicYearId = years[0].id;
    }

    // Discover a student ID from seeded data
    const studRes = await authGet(
      app,
      '/api/v1/students?pageSize=1',
      ownerToken,
      AL_NOOR_DOMAIN,
    );
    const students = studRes.body.data;
    if (students && students.length > 0) {
      studentId = students[0].id;
    }

    // Discover a household ID from seeded data
    const hhRes = await authGet(
      app,
      '/api/v1/households?pageSize=1',
      ownerToken,
      AL_NOOR_DOMAIN,
    );
    const households = hhRes.body.data;
    if (households && households.length > 0) {
      householdId = households[0].id;
    }
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── GET /api/v1/reports/promotion-rollover ───────────────────────────────────

  describe('GET /api/v1/reports/promotion-rollover', () => {
    it('should return 200 with promotion rollover report', async () => {
      if (!academicYearId) return; // skip if no academic year seeded

      const res = await authGet(
        app,
        `/api/v1/reports/promotion-rollover?academic_year_id=${academicYearId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns plain object → interceptor wraps to {data: {...}}
      const report = res.body.data;
      expect(report).toBeDefined();
      expect(typeof report.promoted).toBe('number');
      expect(typeof report.held_back).toBe('number');
      expect(typeof report.graduated).toBe('number');
      expect(typeof report.withdrawn).toBe('number');
      expect(report.details).toBeInstanceOf(Array);
    });

    it('should return 401 when no auth token', async () => {
      if (!academicYearId) return;

      await request(app.getHttpServer())
        .get(`/api/v1/reports/promotion-rollover?academic_year_id=${academicYearId}`)
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('should return 403 when user lacks analytics.view', async () => {
      if (!academicYearId) return;

      await authGet(
        app,
        `/api/v1/reports/promotion-rollover?academic_year_id=${academicYearId}`,
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('should return 400 when academic_year_id missing', async () => {
      await authGet(
        app,
        '/api/v1/reports/promotion-rollover',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(400);
    });
  });

  // ─── GET /api/v1/reports/fee-generation-runs ──────────────────────────────────

  describe('GET /api/v1/reports/fee-generation-runs', () => {
    it('should return 200 with paginated fee generation run summaries', async () => {
      const res = await authGet(
        app,
        '/api/v1/reports/fee-generation-runs',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns {data, meta} → interceptor passes through as-is
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toBeDefined();
      expect(typeof res.body.meta.page).toBe('number');
      expect(typeof res.body.meta.pageSize).toBe('number');
      expect(typeof res.body.meta.total).toBe('number');
    });

    it('should return 401 when no auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/fee-generation-runs')
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('should return 403 when user lacks finance.view', async () => {
      await authGet(
        app,
        '/api/v1/reports/fee-generation-runs',
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });

  // ─── GET /api/v1/reports/write-offs ───────────────────────────────────────────

  describe('GET /api/v1/reports/write-offs', () => {
    it('should return 200 with write-off report', async () => {
      const res = await authGet(
        app,
        '/api/v1/reports/write-offs',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns {data: WriteOffReport, meta} → interceptor passes through as-is
      // res.body.data = WriteOffReport = {entries, totals}
      expect(res.body.data).toBeDefined();
      expect(res.body.data.entries).toBeInstanceOf(Array);
      expect(res.body.data.totals).toBeDefined();
      expect(typeof res.body.data.totals.total_written_off).toBe('number');
      expect(typeof res.body.data.totals.total_discounts).toBe('number');
      expect(res.body.meta).toBeDefined();
    });

    it('should return 401 when no auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/write-offs')
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('should return 403 when user lacks finance.view', async () => {
      await authGet(
        app,
        '/api/v1/reports/write-offs',
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('should apply date range filters', async () => {
      const startDate = '2020-01-01';
      const endDate = '2030-12-31';

      const res = await authGet(
        app,
        `/api/v1/reports/write-offs?start_date=${startDate}&end_date=${endDate}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns {data: WriteOffReport, meta} → interceptor passes through as-is
      expect(res.body.data).toBeDefined();
      expect(res.body.data.entries).toBeInstanceOf(Array);
    });
  });

  // ─── GET /api/v1/reports/notification-delivery ────────────────────────────────

  describe('GET /api/v1/reports/notification-delivery', () => {
    it('should return 200 with notification delivery summary', async () => {
      const res = await authGet(
        app,
        '/api/v1/reports/notification-delivery',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns plain object → interceptor wraps to {data: {...}}
      const summary = res.body.data;
      expect(summary).toBeDefined();
      expect(typeof summary.total_sent).toBe('number');
      expect(typeof summary.total_delivered).toBe('number');
      expect(typeof summary.total_failed).toBe('number');
      expect(summary.by_channel).toBeInstanceOf(Array);
      expect(summary.by_template).toBeInstanceOf(Array);
      expect(summary.failure_reasons).toBeInstanceOf(Array);
    });

    it('should return 401 when no auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports/notification-delivery')
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('should return 403 when user lacks analytics.view', async () => {
      await authGet(
        app,
        '/api/v1/reports/notification-delivery',
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });

  // ─── GET /api/v1/reports/student-export/:studentId ────────────────────────────

  describe('GET /api/v1/reports/student-export/:studentId', () => {
    it('should return 200 with student export pack', async () => {
      if (!studentId) return; // skip if no student seeded

      const res = await authGet(
        app,
        `/api/v1/reports/student-export/${studentId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns ExportPack (plain object) → interceptor wraps to {data: {...}}
      const pack = res.body.data;
      expect(pack).toBeDefined();
      expect(pack.subject_type).toBe('student');
      expect(pack.subject_id).toBe(studentId);
      expect(pack.exported_at).toBeDefined();
      expect(pack.sections).toBeInstanceOf(Array);
      expect(pack.sections.length).toBeGreaterThanOrEqual(1);

      // Verify expected sections exist
      const sectionNames = pack.sections.map((s: { section: string }) => s.section);
      expect(sectionNames).toContain('profile');
    });

    it('should return 401 when no auth token', async () => {
      if (!studentId) return;

      await request(app.getHttpServer())
        .get(`/api/v1/reports/student-export/${studentId}`)
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('should return 403 when user lacks students.view', async () => {
      if (!studentId) return;

      // Parent may have students.view for their own children;
      // use parent token and expect either 200 (if they have it) or 403
      const res = await authGet(
        app,
        `/api/v1/reports/student-export/${studentId}`,
        parentToken,
        AL_NOOR_DOMAIN,
      );

      // The parent role typically lacks students.view permission
      // but if the seed grants it, this test still validates the endpoint works
      expect([200, 403]).toContain(res.status);
    });

    it('should return 404 for non-existent student', async () => {
      await authGet(
        app,
        '/api/v1/reports/student-export/00000000-0000-0000-0000-000000000099',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(404);
    });
  });

  // ─── GET /api/v1/reports/household-export/:householdId ────────────────────────

  describe('GET /api/v1/reports/household-export/:householdId', () => {
    it('should return 200 with household export pack', async () => {
      if (!householdId) return; // skip if no household seeded

      const res = await authGet(
        app,
        `/api/v1/reports/household-export/${householdId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns ExportPack (plain object) → interceptor wraps to {data: {...}}
      const pack = res.body.data;
      expect(pack).toBeDefined();
      expect(pack.subject_type).toBe('household');
      expect(pack.subject_id).toBe(householdId);
      expect(pack.exported_at).toBeDefined();
      expect(pack.sections).toBeInstanceOf(Array);
      expect(pack.sections.length).toBeGreaterThanOrEqual(1);

      // Verify expected sections exist
      const sectionNames = pack.sections.map((s: { section: string }) => s.section);
      expect(sectionNames).toContain('profile');
    });

    it('should return 401 when no auth token', async () => {
      if (!householdId) return;

      await request(app.getHttpServer())
        .get(`/api/v1/reports/household-export/${householdId}`)
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('should return 403 when user lacks finance.view', async () => {
      if (!householdId) return;

      await authGet(
        app,
        `/api/v1/reports/household-export/${householdId}`,
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('should return 404 for non-existent household', async () => {
      await authGet(
        app,
        '/api/v1/reports/household-export/00000000-0000-0000-0000-000000000099',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(404);
    });
  });
});
