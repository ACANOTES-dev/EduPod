/**
 * RLS Leakage Tests — Phase 4B
 *
 * Verifies that tenant isolation holds for all P4B scheduling entities:
 * schedule_period_templates, class_scheduling_requirements, staff_availability,
 * staff_scheduling_preferences, scheduling_runs, and cross-tenant schedule pinning.
 *
 * Pattern:
 *   1. Create test data for Al Noor (Tenant A) via direct DB inserts
 *   2. Authenticate as Cedar (Tenant B) → attempt to read/modify
 *   3. Assert: Cedar MUST NOT see or modify Al Noor data
 *
 * Note: Direct DB inserts are used to create P4B entity data because the API
 * createRlsClient has a known issue with the period grid endpoints in the
 * test environment. The RLS tests themselves verify API-level isolation,
 * which is the purpose of these tests.
 */

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import {
  allocateAcademicYearBase,
  createTestApp,
  closeTestApp,
  getAuthToken,
  authGet,
  authPost,
  authPatch,
  authDelete,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_DOMAIN,
  CEDAR_ADMIN_EMAIL,
  CEDAR_DOMAIN,
} from './helpers';
import { setupP4ATestData, P4ATestData } from './p4a-test-data.helper';

jest.setTimeout(120_000);

describe('P4B RLS Leakage Tests (e2e)', () => {
  let app: INestApplication;
  let alNoorAdminToken: string;
  let cedarAdminToken: string;
  let td: P4ATestData;

  /** Direct Prisma client for creating test data */
  let directPrisma: PrismaClient;

  // Cedar's own academic year for valid queries
  let cedarAcademicYearId: string;

  // Al Noor P4B entity IDs (created via direct DB insert)
  let alNoorPeriodTemplateId: string;
  let alNoorClassRequirementId: string;
  let alNoorAvailabilityId: string;
  let alNoorPreferenceId: string;
  let alNoorSchedulingRunId: string;
  let alNoorScheduleId: string;

  beforeAll(async () => {
    app = await createTestApp();
    alNoorAdminToken = await getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN);
    cedarAdminToken = await getAuthToken(app, CEDAR_ADMIN_EMAIL, CEDAR_DOMAIN);

    // Set up Al Noor P4A base data (academic year, class, room, teacher, student)
    td = await setupP4ATestData(app, alNoorAdminToken);

    // Direct Prisma client for creating P4B entities
    directPrisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await directPrisma.$connect();

    // ── Create Cedar's own academic year ────────────────────────────────────
    const cedarTs = Date.now();
    const cedarBaseYear = allocateAcademicYearBase(4000);

    const cedarAyRes = await authPost(
      app,
      '/api/v1/academic-years',
      cedarAdminToken,
      {
        name: `Cedar RLS Test Year ${cedarTs}`,
        start_date: `${cedarBaseYear}-09-01`,
        end_date: `${cedarBaseYear + 1}-06-30`,
        status: 'active',
      },
      CEDAR_DOMAIN,
    ).expect(201);
    cedarAcademicYearId = cedarAyRes.body.data.id;

    // ── Look up Al Noor tenant_id ──────────────────────────────────────────
    const alNoorDomain = await directPrisma.tenantDomain.findFirst({
      where: { domain: AL_NOOR_DOMAIN },
    });
    const alNoorTenantId = alNoorDomain!.tenant_id;

    // ── Create Al Noor P4B test data via direct DB insert ──────────────────

    // 1. Period template
    const periodTemplate = await directPrisma.schedulePeriodTemplate.create({
      data: {
        tenant_id: alNoorTenantId,
        academic_year_id: td.academicYearId,
        weekday: 0,
        period_name: 'RLS Test Period 1',
        period_order: 90,
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T08:45:00.000Z'),
        schedule_period_type: 'teaching',
      },
    });
    alNoorPeriodTemplateId = periodTemplate.id;

    // 2. Class scheduling requirement
    const classRequirement = await directPrisma.classSchedulingRequirement.create({
      data: {
        tenant_id: alNoorTenantId,
        class_id: td.classId,
        academic_year_id: td.academicYearId,
        periods_per_week: 5,
        max_consecutive_periods: 2,
        min_consecutive_periods: 1,
        spread_preference: 'spread_evenly',
      },
    });
    alNoorClassRequirementId = classRequirement.id;

    // 3. Staff availability
    const availability = await directPrisma.staffAvailability.create({
      data: {
        tenant_id: alNoorTenantId,
        staff_profile_id: td.teacherStaffProfileId,
        academic_year_id: td.academicYearId,
        weekday: 0,
        available_from: new Date('1970-01-01T07:30:00.000Z'),
        available_to: new Date('1970-01-01T15:00:00.000Z'),
      },
    });
    alNoorAvailabilityId = availability.id;

    // 4. Staff scheduling preference
    const preference = await directPrisma.staffSchedulingPreference.create({
      data: {
        tenant_id: alNoorTenantId,
        staff_profile_id: td.teacherStaffProfileId,
        academic_year_id: td.academicYearId,
        preference_type: 'time_slot',
        preference_payload: {
          type: 'time_slot',
          weekday: 0,
          preferred_period_orders: [0, 1, 2],
          mode: 'prefer',
        },
        priority: 'high',
      },
    });
    alNoorPreferenceId = preference.id;

    // 5. Schedule entry (for pin test) — use the P4A API which works
    const schedRes = await authPost(
      app,
      '/api/v1/schedules',
      alNoorAdminToken,
      {
        class_id: td.classId,
        room_id: td.roomId,
        weekday: 2,
        start_time: '09:00',
        end_time: '09:45',
        effective_start_date: td.dateInYear(9, 1),
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    alNoorScheduleId = (schedRes.body.data?.data ?? schedRes.body.data ?? schedRes.body).id;

    // 6. Scheduling run (created via direct DB insert)
    const alNoorUser = await directPrisma.user.findFirst({
      where: { email: AL_NOOR_ADMIN_EMAIL },
    });
    const schedulingRun = await directPrisma.schedulingRun.create({
      data: {
        tenant_id: alNoorTenantId,
        academic_year_id: td.academicYearId,
        mode: 'auto',
        status: 'queued',
        config_snapshot: { academic_year_id: td.academicYearId, mode: 'auto' },
        created_by_user_id: alNoorUser!.id,
      },
    });
    alNoorSchedulingRunId = schedulingRun.id;
  });

  afterAll(async () => {
    if (directPrisma) {
      // Clean up scheduling run to avoid blocking future runs
      try {
        await directPrisma.schedulingRun.update({
          where: { id: alNoorSchedulingRunId },
          data: { status: 'failed', failure_reason: 'Test cleanup' },
        });
      } catch (err) {
        console.error('[p4b-rls cleanup]', err);
      }
      await directPrisma.$disconnect();
    }
    await closeTestApp();
  });

  // ── 3.1 schedule_period_templates ─────────────────────────────────────────

  describe('schedule_period_templates RLS', () => {
    it('Cedar querying period-grid with own academic year should NOT see Al Noor periods', async () => {
      const res = await authGet(
        app,
        `/api/v1/period-grid?academic_year_id=${cedarAcademicYearId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const data = res.body.data ?? [];
      expect(Array.isArray(data)).toBe(true);
      const ids = data.map((p: Record<string, unknown>) => p['id']);
      expect(ids).not.toContain(alNoorPeriodTemplateId);
    });

    it('Cedar querying period-grid with Al Noor academic_year_id should get empty data', async () => {
      const res = await authGet(
        app,
        `/api/v1/period-grid?academic_year_id=${td.academicYearId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const data = res.body.data ?? [];
      expect(data).toHaveLength(0);
    });

    it('Cedar PATCH on Al Noor period template should return 404', async () => {
      await authPatch(
        app,
        `/api/v1/period-grid/${alNoorPeriodTemplateId}`,
        cedarAdminToken,
        { period_name: 'Hacked Period' },
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('Cedar DELETE on Al Noor period template should return 404', async () => {
      await authDelete(
        app,
        `/api/v1/period-grid/${alNoorPeriodTemplateId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });

  // ── 3.2 class_scheduling_requirements ─────────────────────────────────────

  describe('class_scheduling_requirements RLS', () => {
    it('Cedar querying class-scheduling-requirements should NOT see Al Noor requirements', async () => {
      const res = await authGet(
        app,
        `/api/v1/class-scheduling-requirements?academic_year_id=${cedarAcademicYearId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const data = res.body.data?.data ?? res.body.data ?? [];
      const ids = Array.isArray(data) ? data.map((r: Record<string, unknown>) => r['id']) : [];
      expect(ids).not.toContain(alNoorClassRequirementId);
    });

    it('Cedar querying with Al Noor academic_year_id should get empty data', async () => {
      const res = await authGet(
        app,
        `/api/v1/class-scheduling-requirements?academic_year_id=${td.academicYearId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const data = res.body.data?.data ?? res.body.data ?? [];
      const items = Array.isArray(data) ? data : [];
      expect(items).toHaveLength(0);
    });

    it('Cedar DELETE on Al Noor class requirement should return 404', async () => {
      await authDelete(
        app,
        `/api/v1/class-scheduling-requirements/${alNoorClassRequirementId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('Cedar PATCH on Al Noor class requirement should return 404', async () => {
      await authPatch(
        app,
        `/api/v1/class-scheduling-requirements/${alNoorClassRequirementId}`,
        cedarAdminToken,
        { periods_per_week: 10 },
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });

  // ── 3.3 staff_availability ────────────────────────────────────────────────

  describe('staff_availability RLS', () => {
    it('Cedar querying staff-availability should NOT see Al Noor availability', async () => {
      const res = await authGet(
        app,
        `/api/v1/staff-availability?academic_year_id=${cedarAcademicYearId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const data = res.body.data ?? [];
      const items = Array.isArray(data) ? data : [];
      const ids = items.map((a: Record<string, unknown>) => a['id']);
      expect(ids).not.toContain(alNoorAvailabilityId);
    });

    it('Cedar querying with Al Noor academic_year_id should get empty data', async () => {
      const res = await authGet(
        app,
        `/api/v1/staff-availability?academic_year_id=${td.academicYearId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const data = res.body.data ?? [];
      const items = Array.isArray(data) ? data : [];
      expect(items).toHaveLength(0);
    });

    it('Cedar DELETE on Al Noor availability entry should return 404', async () => {
      await authDelete(
        app,
        `/api/v1/staff-availability/${alNoorAvailabilityId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });

  // ── 3.4 staff_scheduling_preferences ──────────────────────────────────────

  describe('staff_scheduling_preferences RLS', () => {
    it('Cedar querying staff-scheduling-preferences should NOT see Al Noor preferences', async () => {
      const res = await authGet(
        app,
        `/api/v1/staff-scheduling-preferences?academic_year_id=${cedarAcademicYearId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const data = res.body.data?.data ?? res.body.data ?? [];
      const items = Array.isArray(data) ? data : [];
      const ids = items.map((p: Record<string, unknown>) => p['id']);
      expect(ids).not.toContain(alNoorPreferenceId);
    });

    it('Cedar querying with Al Noor academic_year_id should get empty data', async () => {
      const res = await authGet(
        app,
        `/api/v1/staff-scheduling-preferences?academic_year_id=${td.academicYearId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const data = res.body.data?.data ?? res.body.data ?? [];
      const items = Array.isArray(data) ? data : [];
      expect(items).toHaveLength(0);
    });

    it('Cedar DELETE on Al Noor preference should return 404', async () => {
      await authDelete(
        app,
        `/api/v1/staff-scheduling-preferences/${alNoorPreferenceId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });

  // ── 3.5 scheduling_runs ───────────────────────────────────────────────────

  describe('scheduling_runs RLS', () => {
    it('Cedar querying scheduling-runs should NOT see Al Noor runs', async () => {
      const res = await authGet(
        app,
        `/api/v1/scheduling-runs?academic_year_id=${cedarAcademicYearId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const data = res.body.data?.data ?? res.body.data ?? [];
      const items = Array.isArray(data) ? data : [];
      const ids = items.map((r: Record<string, unknown>) => r['id']);
      expect(ids).not.toContain(alNoorSchedulingRunId);
    });

    it('Cedar querying with Al Noor academic_year_id should get empty data', async () => {
      const res = await authGet(
        app,
        `/api/v1/scheduling-runs?academic_year_id=${td.academicYearId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const data = res.body.data?.data ?? res.body.data ?? [];
      const items = Array.isArray(data) ? data : [];
      expect(items).toHaveLength(0);
    });

    it('Cedar GET on Al Noor scheduling run by ID should return 404', async () => {
      await authGet(
        app,
        `/api/v1/scheduling-runs/${alNoorSchedulingRunId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('Cedar trying to cancel Al Noor scheduling run should be denied (403 or 404)', async () => {
      const res = await authPost(
        app,
        `/api/v1/scheduling-runs/${alNoorSchedulingRunId}/cancel`,
        cedarAdminToken,
        {},
        CEDAR_DOMAIN,
      );
      // 403 = permission denied (run_auto required), 404 = tenant isolation
      // Either outcome prevents cross-tenant access.
      expect([403, 404]).toContain(res.status);
    });

    it('Cedar trying to get progress of Al Noor scheduling run should be denied (403 or 404)', async () => {
      const res = await authGet(
        app,
        `/api/v1/scheduling-runs/${alNoorSchedulingRunId}/progress`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      );
      // 403 = permission denied (run_auto required), 404 = tenant isolation
      // Either outcome prevents cross-tenant access.
      expect([403, 404]).toContain(res.status);
    });
  });

  // ── 3.6 Cross-tenant schedule pin ─────────────────────────────────────────

  describe('Cross-tenant schedule pinning RLS', () => {
    it('Cedar trying to pin Al Noor schedule entry should return 404', async () => {
      await authPost(
        app,
        `/api/v1/schedules/${alNoorScheduleId}/pin`,
        cedarAdminToken,
        { pin_reason: 'RLS test pin attempt' },
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('Cedar trying to unpin Al Noor schedule entry should return 404', async () => {
      await authPost(
        app,
        `/api/v1/schedules/${alNoorScheduleId}/unpin`,
        cedarAdminToken,
        {},
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('Cedar trying to GET Al Noor schedule entry by ID should return 404', async () => {
      await authGet(
        app,
        `/api/v1/schedules/${alNoorScheduleId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('Cedar listing schedules should NOT contain Al Noor schedule entries', async () => {
      const res = await authGet(
        app,
        '/api/v1/schedules?page=1&pageSize=100',
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const data = res.body.data?.data ?? res.body.data ?? [];
      const items = Array.isArray(data) ? data : [];
      const ids = items.map((s: Record<string, unknown>) => s['id']);
      expect(ids).not.toContain(alNoorScheduleId);
    });
  });
});
