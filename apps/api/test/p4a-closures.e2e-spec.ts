import { INestApplication } from '@nestjs/common';

import {
  createTestApp,
  closeTestApp,
  getAuthToken,
  authGet,
  authPost,
  authPut,
  authPatch,
  authDelete,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  AL_NOOR_DOMAIN,
} from './helpers';
import { setupP4ATestData, P4ATestData } from './p4a-test-data.helper';

jest.setTimeout(120_000);

describe('P4A School Closures (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let teacherToken: string;
  let td: P4ATestData;
  let createdClosureId: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN);
    teacherToken = await getAuthToken(app, AL_NOOR_TEACHER_EMAIL, AL_NOOR_DOMAIN);
    td = await setupP4ATestData(app, adminToken);
  });

  afterAll(async () => { await closeTestApp(); });

  it('should create a single closure (POST /api/v1/school-closures -> 201)', async () => {
    const res = await authPost(app, '/api/v1/school-closures', adminToken, {
      closure_date: td.dateInYear(12, 25),
      reason: 'Christmas Day',
      affects_scope: 'all',
    }, AL_NOOR_DOMAIN).expect(201);
    const body = res.body.data ?? res.body;
    expect(body.closure).toBeDefined();
    expect(body.closure.reason).toBe('Christmas Day');
    expect(typeof body.cancelled_sessions).toBe('number');
    expect(Array.isArray(body.flagged_sessions)).toBe(true);
    createdClosureId = body.closure.id;
  });

  it('should cancel open attendance sessions when closure is created', async () => {
    const sessionDate = td.dateInYear(1, 15);
    await authPost(app, '/api/v1/attendance-sessions', teacherToken, {
      class_id: td.classId, session_date: sessionDate,
    }, AL_NOOR_DOMAIN).expect(201);

    const closureRes = await authPost(app, '/api/v1/school-closures', adminToken, {
      closure_date: sessionDate, reason: 'Emergency closure', affects_scope: 'all',
    }, AL_NOOR_DOMAIN).expect(201);
    const body = closureRes.body.data ?? closureRes.body;
    expect(body.cancelled_sessions).toBeGreaterThanOrEqual(1);
  });

  it('should flag submitted sessions when closure is created on that date', async () => {
    const sessionDate = td.dateInYear(2, 10);
    const sessRes = await authPost(app, '/api/v1/attendance-sessions', teacherToken, {
      class_id: td.classId, session_date: sessionDate,
    }, AL_NOOR_DOMAIN).expect(201);
    const sessionId = (sessRes.body.data ?? sessRes.body).id;

    // Save a record and submit
    await authPut(app, `/api/v1/attendance-sessions/${sessionId}/records`, teacherToken, {
      records: [{ student_id: td.studentId, status: 'present' }],
    }, AL_NOOR_DOMAIN);

    await authPatch(app, `/api/v1/attendance-sessions/${sessionId}/submit`, teacherToken, {}, AL_NOOR_DOMAIN);

    const closureRes = await authPost(app, '/api/v1/school-closures', adminToken, {
      closure_date: sessionDate, reason: 'Sudden weather emergency', affects_scope: 'all',
    }, AL_NOOR_DOMAIN).expect(201);
    const body = closureRes.body.data ?? closureRes.body;
    expect(Array.isArray(body.flagged_sessions)).toBe(true);
  });

  it('should bulk create closures (POST /api/v1/school-closures/bulk -> 201)', async () => {
    const res = await authPost(app, '/api/v1/school-closures/bulk', adminToken, {
      start_date: td.dateInYear(4, 6), end_date: td.dateInYear(4, 10),
      reason: 'Spring break', affects_scope: 'all', skip_weekends: false,
    }, AL_NOOR_DOMAIN).expect(201);
    const body = res.body.data ?? res.body;
    expect(body.created_count).toBeGreaterThan(0);
    expect(Array.isArray(body.closures)).toBe(true);
  });

  it('should skip weekends with skip_weekends=true', async () => {
    // Use a known date range that spans a weekend
    const res = await authPost(app, '/api/v1/school-closures/bulk', adminToken, {
      start_date: td.dateInYear(3, 1), end_date: td.dateInYear(3, 10),
      reason: 'Conference week', affects_scope: 'all', skip_weekends: true,
    }, AL_NOOR_DOMAIN).expect(201);
    const body = res.body.data ?? res.body;
    // 10 calendar days minus weekends (about 7 weekdays at most)
    expect(body.created_count).toBeGreaterThan(0);
    expect(body.created_count).toBeLessThanOrEqual(8);
  });

  it('should reject duplicate closure for same date+scope (POST -> 409)', async () => {
    const date = td.dateInYear(11, 15);
    await authPost(app, '/api/v1/school-closures', adminToken, {
      closure_date: date, reason: 'First closure', affects_scope: 'all',
    }, AL_NOOR_DOMAIN).expect(201);

    const res = await authPost(app, '/api/v1/school-closures', adminToken, {
      closure_date: date, reason: 'Duplicate attempt', affects_scope: 'all',
    }, AL_NOOR_DOMAIN).expect(409);
    expect(res.body.error.code).toBe('CLOSURE_ALREADY_EXISTS');
  });

  it('should list closures with date filter (GET /api/v1/school-closures -> 200)', async () => {
    const res = await authGet(app,
      `/api/v1/school-closures?start_date=${td.dateInYear(9, 1)}&end_date=${td.dateInYear(6, 30)}`,
      adminToken, AL_NOOR_DOMAIN).expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  it('should delete a closure (DELETE /api/v1/school-closures/:id -> 204)', async () => {
    expect(createdClosureId).toBeDefined();
    await authDelete(app, `/api/v1/school-closures/${createdClosureId}`, adminToken, AL_NOOR_DOMAIN).expect(204);
  });
});

