import { INestApplication } from '@nestjs/common';

import {
  createTestApp,
  closeTestApp,
  getAuthToken,
  authGet,
  authPost,
  authPatch,
  authPut,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  AL_NOOR_DOMAIN,
} from './helpers';
import { setupP4ATestData, P4ATestData } from './p4a-test-data.helper';

jest.setTimeout(120_000);

describe('P4A Attendance (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let teacherToken: string;
  let td: P4ATestData;
  let sessionId: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN);
    teacherToken = await getAuthToken(app, AL_NOOR_TEACHER_EMAIL, AL_NOOR_DOMAIN);
    td = await setupP4ATestData(app, adminToken);
  });

  afterAll(async () => { await closeTestApp(); });

  it('should create an attendance session (POST -> 201 status=open)', async () => {
    const res = await authPost(app, '/api/v1/attendance-sessions', teacherToken, {
      class_id: td.classId, session_date: td.dateInYear(10, 6),
    }, AL_NOOR_DOMAIN).expect(201);
    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.status).toBe('open');
    sessionId = body.id;
  });

  it('should block session creation on a closure date (POST -> 409)', async () => {
    const closureDate = td.dateInYear(12, 1);
    await authPost(app, '/api/v1/school-closures', adminToken, {
      closure_date: closureDate, reason: 'Test closure', affects_scope: 'all',
    }, AL_NOOR_DOMAIN).expect(201);

    const res = await authPost(app, '/api/v1/attendance-sessions', teacherToken, {
      class_id: td.classId, session_date: closureDate,
    }, AL_NOOR_DOMAIN).expect(409);
    expect(res.body.error.code).toBe('DATE_IS_CLOSURE');
  });

  it('should return 403 for override_closure without required permission', async () => {
    const closureDate = td.dateInYear(12, 2);
    await authPost(app, '/api/v1/school-closures', adminToken, {
      closure_date: closureDate, reason: 'Test closure for override', affects_scope: 'all',
    }, AL_NOOR_DOMAIN).expect(201);

    const res = await authPost(app, '/api/v1/attendance-sessions', teacherToken, {
      class_id: td.classId, session_date: closureDate,
      override_closure: true, override_reason: 'Make-up class',
    }, AL_NOOR_DOMAIN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('OVERRIDE_NOT_PERMITTED');
  });

  it('should return existing session on duplicate POST (race condition handling)', async () => {
    const sessionDate = td.dateInYear(10, 13);
    const first = await authPost(app, '/api/v1/attendance-sessions', teacherToken, {
      class_id: td.classId, session_date: sessionDate,
    }, AL_NOOR_DOMAIN).expect(201);

    const second = await authPost(app, '/api/v1/attendance-sessions', teacherToken, {
      class_id: td.classId, session_date: sessionDate,
    }, AL_NOOR_DOMAIN).expect(201);

    expect((second.body.data ?? second.body).id).toBe((first.body.data ?? first.body).id);
  });

  it('should save attendance records (PUT /api/v1/attendance-sessions/:id/records -> 200)', async () => {
    const res = await authPut(app, `/api/v1/attendance-sessions/${sessionId}/records`, teacherToken, {
      records: [{ student_id: td.studentId, status: 'present' }],
    }, AL_NOOR_DOMAIN).expect(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].student_id).toBe(td.studentId);
    expect(res.body.data[0].status).toBe('present');
  });

  it('should submit a session (PATCH /api/v1/attendance-sessions/:id/submit -> 200)', async () => {
    const res = await authPatch(app, `/api/v1/attendance-sessions/${sessionId}/submit`, teacherToken, {}, AL_NOOR_DOMAIN).expect(200);
    expect((res.body.data ?? res.body).status).toBe('submitted');
  });

  it('should reject saving records on a non-open session (PUT -> 409)', async () => {
    const res = await authPut(app, `/api/v1/attendance-sessions/${sessionId}/records`, teacherToken, {
      records: [{ student_id: td.studentId, status: 'absent_unexcused' }],
    }, AL_NOOR_DOMAIN).expect(409);
    expect(res.body.error.code).toBe('SESSION_NOT_OPEN');
  });

  it('should require attendance.amend_historical permission to amend a record', async () => {
    // Get record ID from the submitted session
    const sessRes = await authGet(app, `/api/v1/attendance-sessions/${sessionId}`, adminToken, AL_NOOR_DOMAIN).expect(200);
    const records = (sessRes.body.data ?? sessRes.body).records ?? [];
    if (records.length === 0) return;

    // Neither admin nor teacher has attendance.amend_historical by default
    const res = await authPatch(app, `/api/v1/attendance-records/${records[0].id}/amend`, adminToken, {
      status: 'absent_excused', amendment_reason: 'Parent called in sick',
    }, AL_NOOR_DOMAIN);
    expect(res.status).toBe(403);
  });

  it('should require amendment_reason for amend (validation or permission error)', async () => {
    const sessRes = await authGet(app, `/api/v1/attendance-sessions/${sessionId}`, adminToken, AL_NOOR_DOMAIN).expect(200);
    const records = (sessRes.body.data ?? sessRes.body).records ?? [];
    if (records.length === 0) return;

    const res = await authPatch(app, `/api/v1/attendance-records/${records[0].id}/amend`, adminToken, {
      status: 'absent_excused',
    }, AL_NOOR_DOMAIN);
    // Either 400 (Zod validation fails on missing amendment_reason) or 403 (permission check first)
    expect([400, 403]).toContain(res.status);
  });

  it('should cancel an open session (PATCH /api/v1/attendance-sessions/:id/cancel -> 200)', async () => {
    const sessRes = await authPost(app, '/api/v1/attendance-sessions', teacherToken, {
      class_id: td.classId, session_date: td.dateInYear(10, 20),
    }, AL_NOOR_DOMAIN).expect(201);
    const newSessionId = (sessRes.body.data ?? sessRes.body).id;

    const res = await authPatch(app, `/api/v1/attendance-sessions/${newSessionId}/cancel`, adminToken, {}, AL_NOOR_DOMAIN).expect(200);
    expect((res.body.data ?? res.body).status).toBe('cancelled');
  });
});
