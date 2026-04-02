import { INestApplication } from '@nestjs/common';

import {
  createTestApp,
  closeTestApp,
  getAuthToken,
  authGet,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  AL_NOOR_DOMAIN,
} from './helpers';
import { setupP4ATestData, P4ATestData } from './p4a-test-data.helper';

jest.setTimeout(120_000);

describe('P4A Dashboard & Exceptions (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let teacherToken: string;
  let parentToken: string;
  let testData: P4ATestData;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN);
    teacherToken = await getAuthToken(app, AL_NOOR_TEACHER_EMAIL, AL_NOOR_DOMAIN);
    parentToken = await getAuthToken(app, AL_NOOR_PARENT_EMAIL, AL_NOOR_DOMAIN);
    testData = await setupP4ATestData(app, adminToken);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── 1. Exceptions ──────────────────────────────────────────────────
  it('should get attendance exceptions (GET /api/v1/attendance/exceptions → 200)', async () => {
    const res = await authGet(
      app,
      '/api/v1/attendance/exceptions',
      adminToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.pending_sessions).toBeDefined();
    expect(Array.isArray(body.pending_sessions)).toBe(true);
    expect(body.excessive_absences).toBeDefined();
    expect(Array.isArray(body.excessive_absences)).toBe(true);
  });

  // ─── 2. Teacher dashboard ───────────────────────────────────────────
  it('should get teacher dashboard (GET /api/v1/dashboard/teacher → 200)', async () => {
    const res = await authGet(
      app,
      '/api/v1/dashboard/teacher',
      teacherToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    // Service returns { greeting, todays_schedule, todays_sessions, pending_submissions }
    expect(body.greeting).toBeDefined();
    expect(Array.isArray(body.todays_schedule)).toBe(true);
    expect(Array.isArray(body.todays_sessions)).toBe(true);
    expect(typeof body.pending_submissions).toBe('number');
  });

  // ─── 3. Parent attendance ───────────────────────────────────────────
  it('should return 403 or 404 for parent viewing unlinked student attendance', async () => {
    // The parent@alnoor.test user may not have a parent profile linked to any student.
    // The endpoint checks the parent-student relationship.
    // We expect either 404 (PARENT_NOT_FOUND) or 403 (NOT_LINKED_TO_STUDENT)
    const res = await authGet(
      app,
      `/api/v1/parent/students/${testData.studentId}/attendance`,
      parentToken,
      AL_NOOR_DOMAIN,
    );

    // Either 404 (no parent profile) or 403 (not linked) is correct behaviour
    expect([403, 404]).toContain(res.status);
    expect(res.body.error).toBeDefined();
  });
});
