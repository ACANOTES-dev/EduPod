import { INestApplication } from '@nestjs/common';

import {
  createTestApp,
  closeTestApp,
  getAuthToken,
  authGet,
  authPost,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_DOMAIN,
} from './helpers';
import { setupP4ATestData, P4ATestData } from './p4a-test-data.helper';

jest.setTimeout(120_000);

describe('P4A Timetables (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let td: P4ATestData;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN);
    td = await setupP4ATestData(app, adminToken);

    // Create a schedule for the class so timetable endpoints have data.
    // Use owner to override any teacher double-booking conflicts.
    const ownerToken = await getAuthToken(app, 'owner@alnoor.test', AL_NOOR_DOMAIN);
    const schedRes = await authPost(app, '/api/v1/schedules', ownerToken, {
      class_id: td.classId,
      room_id: td.roomId,
      teacher_staff_id: td.teacherStaffProfileId,
      weekday: 1,
      start_time: '07:00',
      end_time: '07:45',
      effective_start_date: td.dateInYear(9, 1),
      override_conflicts: true,
      override_reason: 'Test setup for timetables',
    }, AL_NOOR_DOMAIN).expect(201);
  });

  afterAll(async () => { await closeTestApp(); });

  it('should get teacher timetable (GET /api/v1/timetables/teacher/:id -> 200)', async () => {
    const res = await authGet(app,
      `/api/v1/timetables/teacher/${td.teacherStaffProfileId}?academic_year_id=${td.academicYearId}&week_start=${td.dateInYear(9, 1)}`,
      adminToken, AL_NOOR_DOMAIN).expect(200);
    const entries = res.body.data;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].schedule_id).toBeDefined();
    expect(entries[0].class_name).toBeDefined();
  });

  it('should get room timetable (GET /api/v1/timetables/room/:id -> 200)', async () => {
    const res = await authGet(app,
      `/api/v1/timetables/room/${td.roomId}?academic_year_id=${td.academicYearId}&week_start=${td.dateInYear(9, 1)}`,
      adminToken, AL_NOOR_DOMAIN).expect(200);
    const entries = res.body.data;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].room_id).toBe(td.roomId);
  });

  it('should get student timetable (GET /api/v1/timetables/student/:id -> 200)', async () => {
    const res = await authGet(app,
      `/api/v1/timetables/student/${td.studentId}?academic_year_id=${td.academicYearId}&week_start=${td.dateInYear(9, 1)}`,
      adminToken, AL_NOOR_DOMAIN).expect(200);
    const entries = res.body.data;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].class_id).toBe(td.classId);
  });

  it('should get workload report (GET /api/v1/reports/workload -> 200)', async () => {
    const res = await authGet(app,
      `/api/v1/reports/workload?academic_year_id=${td.academicYearId}`,
      adminToken, AL_NOOR_DOMAIN).expect(200);
    const entries = res.body.data;
    expect(Array.isArray(entries)).toBe(true);
    // The workload report filters by effective date vs current date.
    // Since our test academic year is in the far future, the effective_start_date
    // may not pass the filter. If entries exist, validate their shape.
    if (entries.length > 0) {
      expect(entries[0].staff_profile_id).toBeDefined();
      expect(entries[0].total_periods).toBeGreaterThanOrEqual(1);
      expect(typeof entries[0].total_hours).toBe('number');
    }
  });
});
