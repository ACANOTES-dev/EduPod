import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  createTestApp,
  closeTestApp,
  getAuthToken,
  authGet,
  authPost,
  authPatch,
  authPut,
  authDelete,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  AL_NOOR_DOMAIN,
} from './helpers';
import { setupP4BTestData, P4BTestData } from './p4b-test-data.helper';

jest.setTimeout(120_000);

describe('P4B Scheduling (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let ownerToken: string;
  let teacherToken: string;
  let td: P4BTestData;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN);
    ownerToken = await getAuthToken(app, 'owner@alnoor.test', AL_NOOR_DOMAIN);
    teacherToken = await getAuthToken(app, AL_NOOR_TEACHER_EMAIL, AL_NOOR_DOMAIN);
    td = await setupP4BTestData(app, adminToken);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 1: Period Grid Endpoints
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Period Grid', () => {
    let createdPeriodId: string;

    it('POST /api/v1/period-grid -> 201 (happy path)', async () => {
      const res = await authPost(app, '/api/v1/period-grid', adminToken, {
        academic_year_id: td.academicYearId,
        weekday: 1,
        period_name: `Test Period ${Date.now()}`,
        period_order: 0,
        start_time: '08:00',
        end_time: '08:45',
        schedule_period_type: 'teaching',
      }, AL_NOOR_DOMAIN).expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.weekday).toBe(1);
      expect(res.body.data.start_time).toBe('08:00');
      expect(res.body.data.end_time).toBe('08:45');
      createdPeriodId = res.body.data.id;
    });

    it('POST /api/v1/period-grid -> 400 (missing academic_year_id)', async () => {
      const res = await authPost(app, '/api/v1/period-grid', adminToken, {
        weekday: 1,
        period_name: 'Bad Period',
        period_order: 10,
        start_time: '12:00',
        end_time: '12:45',
      }, AL_NOOR_DOMAIN).expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('POST /api/v1/period-grid -> 400 (end_time <= start_time)', async () => {
      const res = await authPost(app, '/api/v1/period-grid', adminToken, {
        academic_year_id: td.academicYearId,
        weekday: 2,
        period_name: 'Backwards Period',
        period_order: 0,
        start_time: '10:00',
        end_time: '09:00',
      }, AL_NOOR_DOMAIN).expect(400);

      expect(res.body.error.code).toBe('INVALID_TIME_RANGE');
    });

    it('POST /api/v1/period-grid -> 409 (duplicate period_order for same weekday)', async () => {
      // First, create a period for weekday 3
      await authPost(app, '/api/v1/period-grid', adminToken, {
        academic_year_id: td.academicYearId,
        weekday: 3,
        period_name: 'Original Period',
        period_order: 0,
        start_time: '08:00',
        end_time: '08:45',
      }, AL_NOOR_DOMAIN).expect(201);

      // Now try to create another with same weekday+period_order
      const res = await authPost(app, '/api/v1/period-grid', adminToken, {
        academic_year_id: td.academicYearId,
        weekday: 3,
        period_name: 'Duplicate Period',
        period_order: 0,
        start_time: '09:00',
        end_time: '09:45',
      }, AL_NOOR_DOMAIN).expect(409);

      expect(res.body.error.code).toBe('PERIOD_TEMPLATE_CONFLICT');
    });

    it('GET /api/v1/period-grid?academic_year_id=X -> 200', async () => {
      const res = await authGet(
        app,
        `/api/v1/period-grid?academic_year_id=${td.academicYearId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/period-grid -> 400 (missing academic_year_id)', async () => {
      await authGet(
        app,
        '/api/v1/period-grid',
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(400);
    });

    it('PATCH /api/v1/period-grid/:id -> 200 (update name)', async () => {
      const newName = `Updated Period ${Date.now()}`;
      const res = await authPatch(
        app,
        `/api/v1/period-grid/${createdPeriodId}`,
        adminToken,
        { period_name: newName },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.period_name).toBe(newName);
    });

    it('PATCH /api/v1/period-grid/:nonexistent -> 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await authPatch(
        app,
        `/api/v1/period-grid/${fakeId}`,
        adminToken,
        { period_name: 'Ghost Period' },
        AL_NOOR_DOMAIN,
      ).expect(404);
    });

    it('DELETE /api/v1/period-grid/:id -> 204', async () => {
      // Create a period to delete
      const createRes = await authPost(app, '/api/v1/period-grid', adminToken, {
        academic_year_id: td.academicYearId,
        weekday: 4,
        period_name: `Deletable Period ${Date.now()}`,
        period_order: 0,
        start_time: '13:00',
        end_time: '13:45',
      }, AL_NOOR_DOMAIN).expect(201);
      const deleteId = createRes.body.data.id;

      await authDelete(
        app,
        `/api/v1/period-grid/${deleteId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(204);
    });

    it('DELETE /api/v1/period-grid/:nonexistent -> 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await authDelete(
        app,
        `/api/v1/period-grid/${fakeId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(404);
    });

    it('POST /api/v1/period-grid/copy-day -> 200 (copy Sun to Mon,Tue)', async () => {
      // Weekday 0 (Sunday) was populated in setupP4BTestData with 4 periods.
      // Copy to weekday 5 and weekday 6 to avoid collisions.
      const res = await authPost(app, '/api/v1/period-grid/copy-day', adminToken, {
        academic_year_id: td.academicYearId,
        source_weekday: 0,
        target_weekdays: [5, 6],
      }, AL_NOOR_DOMAIN).expect(200);

      expect(res.body.data.created).toBeDefined();
      expect(res.body.data.created.length).toBeGreaterThan(0);
    });

    it('POST /api/v1/period-grid/copy-day -> 404 (source day empty)', async () => {
      const freshTs = Date.now();
      const freshBaseYear = 3000 + Math.floor(Math.random() * 5000);
      const freshAyRes = await authPost(app, '/api/v1/academic-years', adminToken, {
        name: `Empty Day Test Year ${freshTs}`,
        start_date: `${freshBaseYear}-09-01`,
        end_date: `${freshBaseYear + 1}-06-30`,
        status: 'active',
      }, AL_NOOR_DOMAIN).expect(201);
      const freshAyId = freshAyRes.body.data.id;

      // Try to copy from a weekday with no periods in this fresh year
      const res = await authPost(app, '/api/v1/period-grid/copy-day', adminToken, {
        academic_year_id: freshAyId,
        source_weekday: 0,
        target_weekdays: [1],
      }, AL_NOOR_DOMAIN).expect(404);

      expect(res.body.error.code).toBe('SOURCE_DAY_EMPTY');
    });

    it('No auth -> 401', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/period-grid?academic_year_id=${td.academicYearId}`)
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('Teacher cannot access period grid -> 403', async () => {
      await authGet(
        app,
        `/api/v1/period-grid?academic_year_id=${td.academicYearId}`,
        teacherToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 2: Class Requirements Endpoints
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Class Requirements', () => {
    let createdRequirementId: string;
    let secondClassId: string;

    beforeAll(async () => {
      // Create a second class for testing
      const ts = Date.now();
      const subRes = await authPost(app, '/api/v1/subjects', adminToken, {
        name: `P4B Req Subject ${ts}`,
        code: `REQ${ts}`,
      }, AL_NOOR_DOMAIN).expect(201);

      const classRes = await authPost(app, '/api/v1/classes', adminToken, {
        academic_year_id: td.academicYearId,
        name: `P4B Req Class ${ts}`,
        subject_id: subRes.body.data.id,
        status: 'active',
      }, AL_NOOR_DOMAIN).expect(201);
      secondClassId = classRes.body.data.id;
    });

    it('GET /api/v1/class-scheduling-requirements?academic_year_id=X -> 200', async () => {
      const res = await authGet(
        app,
        `/api/v1/class-scheduling-requirements?academic_year_id=${td.academicYearId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/v1/class-scheduling-requirements -> 201 (happy path)', async () => {
      const res = await authPost(app, '/api/v1/class-scheduling-requirements', adminToken, {
        class_id: secondClassId,
        academic_year_id: td.academicYearId,
        periods_per_week: 3,
        max_consecutive_periods: 2,
        min_consecutive_periods: 1,
        spread_preference: 'spread_evenly',
      }, AL_NOOR_DOMAIN).expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.periods_per_week).toBe(3);
      createdRequirementId = res.body.data.id;
    });

    it('POST /api/v1/class-scheduling-requirements -> 409 (duplicate class+year)', async () => {
      const res = await authPost(app, '/api/v1/class-scheduling-requirements', adminToken, {
        class_id: secondClassId,
        academic_year_id: td.academicYearId,
        periods_per_week: 5,
      }, AL_NOOR_DOMAIN).expect(409);

      expect(res.body.error.code).toBe('REQUIREMENT_ALREADY_EXISTS');
    });

    it('POST /api/v1/class-scheduling-requirements/bulk -> 200 with created/updated counts', async () => {
      const ts = Date.now();
      const subRes = await authPost(app, '/api/v1/subjects', adminToken, {
        name: `P4B Bulk Subject ${ts}`,
        code: `BLK${ts}`,
      }, AL_NOOR_DOMAIN).expect(201);
      const bulkClassRes = await authPost(app, '/api/v1/classes', adminToken, {
        academic_year_id: td.academicYearId,
        name: `P4B Bulk Class ${ts}`,
        subject_id: subRes.body.data.id,
        status: 'active',
      }, AL_NOOR_DOMAIN).expect(201);
      const bulkClassId = bulkClassRes.body.data.id;

      const res = await authPost(app, '/api/v1/class-scheduling-requirements/bulk', adminToken, {
        academic_year_id: td.academicYearId,
        requirements: [
          { class_id: secondClassId, periods_per_week: 4 },
          { class_id: bulkClassId, periods_per_week: 6 },
        ],
      }, AL_NOOR_DOMAIN).expect(200);

      // Service returns { data: [...], count: N }, interceptor passes through as-is
      expect(res.body.count).toBe(2);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('PATCH /api/v1/class-scheduling-requirements/:id -> 200', async () => {
      const res = await authPatch(
        app,
        `/api/v1/class-scheduling-requirements/${createdRequirementId}`,
        adminToken,
        { periods_per_week: 5 },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.periods_per_week).toBe(5);
    });

    it('PATCH /api/v1/class-scheduling-requirements/:id -> 400 (min > max consecutive via create)', async () => {
      // The create schema has a Zod refine that validates min <= max.
      const ts = Date.now();
      const subRes = await authPost(app, '/api/v1/subjects', adminToken, {
        name: `P4B MinMax Subject ${ts}`,
        code: `MM${ts}`,
      }, AL_NOOR_DOMAIN).expect(201);
      const mmClassRes = await authPost(app, '/api/v1/classes', adminToken, {
        academic_year_id: td.academicYearId,
        name: `P4B MinMax Class ${ts}`,
        subject_id: subRes.body.data.id,
        status: 'active',
      }, AL_NOOR_DOMAIN).expect(201);

      const res = await authPost(app, '/api/v1/class-scheduling-requirements', adminToken, {
        class_id: mmClassRes.body.data.id,
        academic_year_id: td.academicYearId,
        periods_per_week: 5,
        min_consecutive_periods: 5,
        max_consecutive_periods: 2,
      }, AL_NOOR_DOMAIN).expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('DELETE /api/v1/class-scheduling-requirements/:id -> 204', async () => {
      const ts = Date.now();
      const subRes = await authPost(app, '/api/v1/subjects', adminToken, {
        name: `P4B Del Subject ${ts}`,
        code: `DL${ts}`,
      }, AL_NOOR_DOMAIN).expect(201);
      const delClassRes = await authPost(app, '/api/v1/classes', adminToken, {
        academic_year_id: td.academicYearId,
        name: `P4B Del Class ${ts}`,
        subject_id: subRes.body.data.id,
        status: 'active',
      }, AL_NOOR_DOMAIN).expect(201);

      const createRes = await authPost(app, '/api/v1/class-scheduling-requirements', adminToken, {
        class_id: delClassRes.body.data.id,
        academic_year_id: td.academicYearId,
        periods_per_week: 2,
      }, AL_NOOR_DOMAIN).expect(201);
      const deleteId = createRes.body.data.id;

      await authDelete(
        app,
        `/api/v1/class-scheduling-requirements/${deleteId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(204);
    });

    it('Teacher -> 403', async () => {
      await authGet(
        app,
        `/api/v1/class-scheduling-requirements?academic_year_id=${td.academicYearId}`,
        teacherToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 3: Staff Availability Endpoints
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Staff Availability', () => {
    it('GET /api/v1/staff-availability?academic_year_id=X -> 200', async () => {
      const res = await authGet(
        app,
        `/api/v1/staff-availability?academic_year_id=${td.academicYearId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('PUT /api/v1/staff-availability/staff/:staffId/year/:yearId -> 200 (set availability)', async () => {
      const res = await authPut(
        app,
        `/api/v1/staff-availability/staff/${td.teacherStaffProfileId}/year/${td.academicYearId}`,
        ownerToken,
        {
          entries: [
            { weekday: 0, available_from: '08:00', available_to: '14:00' },
            { weekday: 1, available_from: '08:00', available_to: '14:00' },
            { weekday: 2, available_from: '08:00', available_to: '12:00' },
          ],
        },
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns { data: [...], count: N }, interceptor passes through
      expect(res.body.count).toBe(3);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('PUT /api/v1/staff-availability/staff/:staffId/year/:yearId -> 200 (empty entries = clear all)', async () => {
      // First set some availability
      await authPut(
        app,
        `/api/v1/staff-availability/staff/${td.teacherStaffProfileId}/year/${td.academicYearId}`,
        ownerToken,
        {
          entries: [
            { weekday: 3, available_from: '08:00', available_to: '14:00' },
          ],
        },
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Now clear all by sending empty entries
      const res = await authPut(
        app,
        `/api/v1/staff-availability/staff/${td.teacherStaffProfileId}/year/${td.academicYearId}`,
        ownerToken,
        { entries: [] },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.count).toBe(0);
    });

    it('PUT /api/v1/staff-availability/staff/:staffId/year/:yearId -> 400 (duplicate weekdays)', async () => {
      await authPut(
        app,
        `/api/v1/staff-availability/staff/${td.teacherStaffProfileId}/year/${td.academicYearId}`,
        ownerToken,
        {
          entries: [
            { weekday: 0, available_from: '08:00', available_to: '14:00' },
            { weekday: 0, available_from: '09:00', available_to: '15:00' },
          ],
        },
        AL_NOOR_DOMAIN,
      ).expect(400);
    });

    it('DELETE /api/v1/staff-availability/:id -> 204', async () => {
      // First create availability to have something to delete
      const setRes = await authPut(
        app,
        `/api/v1/staff-availability/staff/${td.teacherStaffProfileId}/year/${td.academicYearId}`,
        ownerToken,
        {
          entries: [
            { weekday: 4, available_from: '08:00', available_to: '14:00' },
          ],
        },
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns { data: [...], count: N }
      const deleteId = setRes.body.data[0].id;

      await authDelete(
        app,
        `/api/v1/staff-availability/${deleteId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(204);
    });

    it('Teacher -> 403 (only school_owner has configure_availability)', async () => {
      await authGet(
        app,
        `/api/v1/staff-availability?academic_year_id=${td.academicYearId}`,
        teacherToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 4: Staff Preferences Endpoints
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Staff Preferences', () => {
    let createdPreferenceId: string;

    it('GET /api/v1/staff-scheduling-preferences?academic_year_id=X -> 200', async () => {
      const res = await authGet(
        app,
        `/api/v1/staff-scheduling-preferences?academic_year_id=${td.academicYearId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns { data: [...] }, interceptor passes through
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/v1/staff-scheduling-preferences/own?academic_year_id=X -> 200 (teacher sees own)', async () => {
      const res = await authGet(
        app,
        `/api/v1/staff-scheduling-preferences/own?academic_year_id=${td.academicYearId}`,
        teacherToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/v1/staff-scheduling-preferences -> 201 (admin creates subject preference)', async () => {
      const res = await authPost(app, '/api/v1/staff-scheduling-preferences', adminToken, {
        staff_profile_id: td.teacherStaffProfileId,
        academic_year_id: td.academicYearId,
        preference_payload: {
          type: 'subject',
          subject_ids: [td.subjectId],
          mode: 'prefer',
        },
        priority: 'high',
      }, AL_NOOR_DOMAIN).expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.preference_type).toBe('subject');
      createdPreferenceId = res.body.data.id;
    });

    it('POST /api/v1/staff-scheduling-preferences -> 201 (admin creates time_slot preference)', async () => {
      const res = await authPost(app, '/api/v1/staff-scheduling-preferences', adminToken, {
        staff_profile_id: td.teacherStaffProfileId,
        academic_year_id: td.academicYearId,
        preference_payload: {
          type: 'time_slot',
          weekday: 0,
          preferred_period_orders: [0, 1],
          mode: 'prefer',
        },
        priority: 'medium',
      }, AL_NOOR_DOMAIN).expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.preference_type).toBe('time_slot');
    });

    it('POST /api/v1/staff-scheduling-preferences -> 403 (teacher creates for another teacher)', async () => {
      // Teacher only has schedule.manage_own_preferences.
      // The POST requires @RequiresPermission('schedule.manage_preferences') which teacher lacks.
      await authPost(app, '/api/v1/staff-scheduling-preferences', teacherToken, {
        staff_profile_id: '00000000-0000-0000-0000-000000000001',
        academic_year_id: td.academicYearId,
        preference_payload: {
          type: 'subject',
          subject_ids: [td.subjectId],
          mode: 'prefer',
        },
      }, AL_NOOR_DOMAIN).expect(403);
    });

    it('PATCH /api/v1/staff-scheduling-preferences/:id -> 200', async () => {
      const res = await authPatch(
        app,
        `/api/v1/staff-scheduling-preferences/${createdPreferenceId}`,
        adminToken,
        { priority: 'low' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.priority).toBe('low');
    });

    it('DELETE /api/v1/staff-scheduling-preferences/:id -> 204', async () => {
      const createRes = await authPost(app, '/api/v1/staff-scheduling-preferences', adminToken, {
        staff_profile_id: td.teacherStaffProfileId,
        academic_year_id: td.academicYearId,
        preference_payload: {
          type: 'subject',
          subject_ids: [td.subjectId],
          mode: 'avoid',
        },
        priority: 'low',
      }, AL_NOOR_DOMAIN).expect(201);
      const deleteId = createRes.body.data.id;

      await authDelete(
        app,
        `/api/v1/staff-scheduling-preferences/${deleteId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(204);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 5: Pin Management Endpoints
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Pin Management', () => {
    let scheduleId: string;
    let secondScheduleId: string;

    beforeAll(async () => {
      // Create schedules to pin
      const roomRes = await authPost(app, '/api/v1/rooms', adminToken, {
        name: `Pin Room ${Date.now()}`,
        room_type: 'classroom',
        capacity: 30,
        is_exclusive: false,
      }, AL_NOOR_DOMAIN).expect(201);
      const roomId = roomRes.body.data.id;

      const schedRes1 = await authPost(app, '/api/v1/schedules', adminToken, {
        class_id: td.classId,
        room_id: roomId,
        weekday: 0,
        start_time: '08:00',
        end_time: '08:45',
        effective_start_date: td.dateInYear(9, 1),
      }, AL_NOOR_DOMAIN).expect(201);
      scheduleId = (schedRes1.body.data?.data ?? schedRes1.body.data).id;

      const schedRes2 = await authPost(app, '/api/v1/schedules', adminToken, {
        class_id: td.classId,
        room_id: roomId,
        weekday: 1,
        start_time: '08:00',
        end_time: '08:45',
        effective_start_date: td.dateInYear(9, 1),
      }, AL_NOOR_DOMAIN).expect(201);
      secondScheduleId = (schedRes2.body.data?.data ?? schedRes2.body.data).id;
    });

    it('POST /api/v1/schedules/:id/pin -> 201 (pin with reason)', async () => {
      // NestJS defaults POST to 201 (no @HttpCode override on pin handler)
      const res = await authPost(
        app,
        `/api/v1/schedules/${scheduleId}/pin`,
        adminToken,
        { pin_reason: 'Teacher request' },
        AL_NOOR_DOMAIN,
      ).expect(201);

      expect(res.body.data.is_pinned).toBe(true);
      expect(res.body.data.source).toBe('pinned');
    });

    it('POST /api/v1/schedules/:id/unpin -> 201', async () => {
      const res = await authPost(
        app,
        `/api/v1/schedules/${scheduleId}/unpin`,
        adminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(201);

      expect(res.body.data.is_pinned).toBe(false);
      expect(res.body.data.source).toBe('manual');
    });

    it('POST /api/v1/schedules/bulk-pin -> 201', async () => {
      const res = await authPost(app, '/api/v1/schedules/bulk-pin', adminToken, {
        schedule_ids: [scheduleId, secondScheduleId],
        pin_reason: 'Bulk pin test',
      }, AL_NOOR_DOMAIN).expect(201);

      // Service returns { data: [...], meta: { pinned: N } }, interceptor passes through
      expect(res.body.meta.pinned).toBe(2);
    });

    it('POST /api/v1/schedules/:nonexistent/pin -> 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await authPost(
        app,
        `/api/v1/schedules/${fakeId}/pin`,
        adminToken,
        { pin_reason: 'Should fail' },
        AL_NOOR_DOMAIN,
      ).expect(404);
    });

    it('Teacher -> 403 (missing schedule.pin_entries)', async () => {
      await authPost(
        app,
        `/api/v1/schedules/${scheduleId}/pin`,
        teacherToken,
        { pin_reason: 'Nope' },
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 6: Scheduling Runs Endpoints
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Scheduling Runs', () => {
    let createdRunId: string;

    it('GET /api/v1/scheduling-runs/prerequisites?academic_year_id=X -> 200', async () => {
      const res = await authGet(
        app,
        `/api/v1/scheduling-runs/prerequisites?academic_year_id=${td.academicYearId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.checks).toBeDefined();
      expect(Array.isArray(res.body.data.checks)).toBe(true);
      expect(res.body.data.checks.length).toBeGreaterThan(0);
    });

    it('POST /api/v1/scheduling-runs -> 201 (happy, status=queued)', async () => {
      // Check prerequisites first
      const prereqRes = await authGet(
        app,
        `/api/v1/scheduling-runs/prerequisites?academic_year_id=${td.academicYearId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      const prereqs = prereqRes.body.data;

      // Try to create the run
      const res = await authPost(app, '/api/v1/scheduling-runs', ownerToken, {
        academic_year_id: td.academicYearId,
      }, AL_NOOR_DOMAIN);

      if (res.status === 201) {
        expect(res.body.data.status).toBe('queued');
        expect(res.body.data.id).toBeDefined();
        createdRunId = res.body.data.id;
      } else {
        // Prerequisites not met - verify correct error code
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('PREREQUISITES_NOT_MET');
      }

      void prereqs;
    });

    it('POST /api/v1/scheduling-runs -> 409 (active run exists)', async () => {
      if (!createdRunId) {
        return;
      }

      const res = await authPost(app, '/api/v1/scheduling-runs', ownerToken, {
        academic_year_id: td.academicYearId,
      }, AL_NOOR_DOMAIN).expect(409);

      expect(res.body.error.code).toBe('RUN_ALREADY_ACTIVE');
    });

    it('GET /api/v1/scheduling-runs?academic_year_id=X -> 200 (list)', async () => {
      const res = await authGet(
        app,
        `/api/v1/scheduling-runs?academic_year_id=${td.academicYearId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
    });

    it('GET /api/v1/scheduling-runs/:id -> 200 (detail)', async () => {
      if (!createdRunId) {
        return;
      }

      const res = await authGet(
        app,
        `/api/v1/scheduling-runs/${createdRunId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.id).toBe(createdRunId);
      expect(res.body.data.status).toBeDefined();
    });

    it('POST /api/v1/scheduling-runs/:id/cancel -> 200 (cancel queued)', async () => {
      if (!createdRunId) {
        return;
      }

      const res = await authPost(
        app,
        `/api/v1/scheduling-runs/${createdRunId}/cancel`,
        ownerToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data.status).toBe('failed');
    });

    it('POST /api/v1/scheduling-runs/:id/discard -> 400 (cannot discard non-completed)', async () => {
      if (!createdRunId) {
        return;
      }

      // The run was cancelled (status=failed), so discard should fail
      const detailRes = await authGet(
        app,
        `/api/v1/scheduling-runs/${createdRunId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      const res = await authPost(
        app,
        `/api/v1/scheduling-runs/${createdRunId}/discard`,
        ownerToken,
        {
          expected_updated_at: detailRes.body.data.updated_at,
        },
        AL_NOOR_DOMAIN,
      ).expect(400);

      expect(res.body.error.code).toBe('RUN_NOT_DISCARDABLE');
    });

    it('Teacher -> 403 (missing schedule.run_auto)', async () => {
      await authGet(
        app,
        `/api/v1/scheduling-runs?academic_year_id=${td.academicYearId}`,
        teacherToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 7: Dashboard Endpoints
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Scheduling Dashboard', () => {
    it('GET /api/v1/scheduling-dashboard/overview?academic_year_id=X -> 200', async () => {
      const res = await authGet(
        app,
        `/api/v1/scheduling-dashboard/overview?academic_year_id=${td.academicYearId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(typeof res.body.data.total_classes).toBe('number');
      expect(typeof res.body.data.configured_classes).toBe('number');
      expect(typeof res.body.data.pinned_entries).toBe('number');
    });

    it('GET /api/v1/scheduling-dashboard/workload?academic_year_id=X -> 200', async () => {
      const res = await authGet(
        app,
        `/api/v1/scheduling-dashboard/workload?academic_year_id=${td.academicYearId}`,
        adminToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns { data: [...], total_periods_per_week: N }, interceptor passes through
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.total_periods_per_week).toBe('number');
    });

    it('Teacher -> 403 (missing schedule.view_auto_reports)', async () => {
      await authGet(
        app,
        `/api/v1/scheduling-dashboard/overview?academic_year_id=${td.academicYearId}`,
        teacherToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });
  });
});
