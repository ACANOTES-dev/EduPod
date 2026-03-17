import { INestApplication } from '@nestjs/common';

import {
  createTestApp,
  closeTestApp,
  getAuthToken,
  authGet,
  authPost,
  AL_NOOR_ADMIN_EMAIL,
  CEDAR_ADMIN_EMAIL,
  AL_NOOR_DOMAIN,
  CEDAR_DOMAIN,
  AL_NOOR_TEACHER_EMAIL,
} from './helpers';
import { setupP4ATestData, P4ATestData } from './p4a-test-data.helper';

jest.setTimeout(120_000);

describe('P4A RLS Leakage Tests (e2e)', () => {
  let app: INestApplication;
  let alNoorAdminToken: string;
  let alNoorTeacherToken: string;
  let cedarAdminToken: string;
  let td: P4ATestData;

  let alNoorRoomId: string;
  let alNoorScheduleId: string;
  let alNoorClosureId: string;
  let alNoorSessionId: string;

  beforeAll(async () => {
    app = await createTestApp();
    alNoorAdminToken = await getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN);
    alNoorTeacherToken = await getAuthToken(app, AL_NOOR_TEACHER_EMAIL, AL_NOOR_DOMAIN);
    cedarAdminToken = await getAuthToken(app, CEDAR_ADMIN_EMAIL, CEDAR_DOMAIN);
    td = await setupP4ATestData(app, alNoorAdminToken);

    // Create Al Noor room
    const roomRes = await authPost(app, '/api/v1/rooms', alNoorAdminToken, {
      name: `RLS Test Room ${Date.now()}`, room_type: 'classroom', is_exclusive: true,
    }, AL_NOOR_DOMAIN).expect(201);
    alNoorRoomId = roomRes.body.data.id;

    // Create Al Noor schedule
    const schedRes = await authPost(app, '/api/v1/schedules', alNoorAdminToken, {
      class_id: td.classId, room_id: alNoorRoomId, weekday: 1,
      start_time: '08:00', end_time: '09:00', effective_start_date: td.dateInYear(9, 1),
    }, AL_NOOR_DOMAIN).expect(201);
    alNoorScheduleId = (schedRes.body.data?.data ?? schedRes.body.data).id;

    // Create Al Noor closure
    const closureRes = await authPost(app, '/api/v1/school-closures', alNoorAdminToken, {
      closure_date: td.dateInYear(5, 1), reason: 'RLS test closure', affects_scope: 'all',
    }, AL_NOOR_DOMAIN).expect(201);
    alNoorClosureId = (closureRes.body.data ?? closureRes.body).closure.id;

    // Create Al Noor attendance session
    const sessRes = await authPost(app, '/api/v1/attendance-sessions', alNoorTeacherToken, {
      class_id: td.classId, session_date: td.dateInYear(11, 3),
    }, AL_NOOR_DOMAIN).expect(201);
    alNoorSessionId = (sessRes.body.data ?? sessRes.body).id;
  });

  afterAll(async () => { await closeTestApp(); });

  it('RLS: Al Noor room should NOT appear in Cedar rooms list', async () => {
    const res = await authGet(app, '/api/v1/rooms?page=1&pageSize=100', cedarAdminToken, CEDAR_DOMAIN).expect(200);
    expect(res.body.data.map((r: Record<string, unknown>) => r['id'])).not.toContain(alNoorRoomId);
  });

  it('RLS: Al Noor room should return 404 when queried by Cedar', async () => {
    await authGet(app, `/api/v1/rooms/${alNoorRoomId}`, cedarAdminToken, CEDAR_DOMAIN).expect(404);
  });

  it('RLS: Al Noor schedule should NOT appear in Cedar schedules list', async () => {
    const res = await authGet(app, '/api/v1/schedules?page=1&pageSize=100', cedarAdminToken, CEDAR_DOMAIN).expect(200);
    expect(res.body.data.map((s: Record<string, unknown>) => s['id'])).not.toContain(alNoorScheduleId);
  });

  it('RLS: Al Noor closure should NOT appear in Cedar closures list', async () => {
    const res = await authGet(app, '/api/v1/school-closures?page=1&pageSize=100', cedarAdminToken, CEDAR_DOMAIN).expect(200);
    expect(res.body.data.map((c: Record<string, unknown>) => c['id'])).not.toContain(alNoorClosureId);
  });

  it('RLS: Al Noor attendance session should NOT appear in Cedar sessions list', async () => {
    const res = await authGet(app, '/api/v1/attendance-sessions?page=1&pageSize=100', cedarAdminToken, CEDAR_DOMAIN).expect(200);
    expect(res.body.data.map((s: Record<string, unknown>) => s['id'])).not.toContain(alNoorSessionId);
  });

  it('RLS: Al Noor session should return 404 when queried by Cedar', async () => {
    await authGet(app, `/api/v1/attendance-sessions/${alNoorSessionId}`, cedarAdminToken, CEDAR_DOMAIN).expect(404);
  });

  it('RLS: Al Noor daily summaries should NOT appear in Cedar summaries list', async () => {
    const res = await authGet(app, '/api/v1/attendance/daily-summaries?page=1&pageSize=100', cedarAdminToken, CEDAR_DOMAIN).expect(200);
    const studentIds = (res.body.data ?? []).map((s: Record<string, unknown>) => s['student_id']);
    expect(studentIds).not.toContain(td.studentId);
  });
});
