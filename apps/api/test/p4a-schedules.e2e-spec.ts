import { INestApplication } from '@nestjs/common';

import {
  createTestApp,
  closeTestApp,
  getAuthToken,
  authGet,
  authPost,
  authPatch,
  authDelete,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  AL_NOOR_DOMAIN,
} from './helpers';
import { setupP4ATestData, P4ATestData } from './p4a-test-data.helper';

jest.setTimeout(120_000);

describe('P4A Schedules (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let teacherToken: string;
  let td: P4ATestData;

  let exclusiveRoomId: string;
  let nonExclusiveRoomId: string;
  let createdScheduleId: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN);
    teacherToken = await getAuthToken(app, AL_NOOR_TEACHER_EMAIL, AL_NOOR_DOMAIN);
    td = await setupP4ATestData(app, adminToken);

    const exclRes = await authPost(app, '/api/v1/rooms', adminToken, {
      name: `Excl Room ${Date.now()}`, room_type: 'classroom', capacity: 30, is_exclusive: true,
    }, AL_NOOR_DOMAIN).expect(201);
    exclusiveRoomId = exclRes.body.data.id;

    const sharedRes = await authPost(app, '/api/v1/rooms', adminToken, {
      name: `Shared Room ${Date.now()}`, room_type: 'gym', capacity: 100, is_exclusive: false,
    }, AL_NOOR_DOMAIN).expect(201);
    nonExclusiveRoomId = sharedRes.body.data.id;
  });

  afterAll(async () => { await closeTestApp(); });

  it('should create a schedule (POST /api/v1/schedules -> 201)', async () => {
    const res = await authPost(app, '/api/v1/schedules', adminToken, {
      class_id: td.classId, room_id: exclusiveRoomId, weekday: 3,
      start_time: '14:00', end_time: '15:00', effective_start_date: td.dateInYear(9, 1),
    }, AL_NOOR_DOMAIN).expect(201);
    const schedule = res.body.data?.data ?? res.body.data;
    expect(schedule.id).toBeDefined();
    createdScheduleId = schedule.id;
  });

  it('should detect hard conflict for overlapping exclusive room+time (POST -> 409)', async () => {
    const res = await authPost(app, '/api/v1/schedules', adminToken, {
      class_id: td.classId, room_id: exclusiveRoomId, weekday: 3,
      start_time: '14:00', end_time: '15:00', effective_start_date: td.dateInYear(9, 1),
    }, AL_NOOR_DOMAIN).expect(409);
    expect(res.body.error.code).toBe('SCHEDULE_CONFLICT');
  });

  it('should allow override with owner having schedule.override_conflict', async () => {
    const ownerToken = await getAuthToken(app, 'owner@alnoor.test', AL_NOOR_DOMAIN);
    const roomRes = await authPost(app, '/api/v1/rooms', ownerToken, {
      name: `Override Room ${Date.now()}`, room_type: 'classroom', is_exclusive: true,
    }, AL_NOOR_DOMAIN).expect(201);

    await authPost(app, '/api/v1/schedules', ownerToken, {
      class_id: td.classId, room_id: roomRes.body.data.id, weekday: 4,
      start_time: '10:00', end_time: '11:00', effective_start_date: td.dateInYear(9, 1),
    }, AL_NOOR_DOMAIN).expect(201);

    const res = await authPost(app, '/api/v1/schedules', ownerToken, {
      class_id: td.classId, room_id: roomRes.body.data.id, weekday: 4,
      start_time: '10:00', end_time: '11:00', effective_start_date: td.dateInYear(9, 1),
      override_conflicts: true, override_reason: 'Testing override',
    }, AL_NOOR_DOMAIN).expect(201);
    const schedule = res.body.data?.data ?? res.body.data;
    expect(schedule.id).toBeDefined();
  });

  it('should handle soft conflicts for non-exclusive room overlap (POST -> 201)', async () => {
    await authPost(app, '/api/v1/schedules', adminToken, {
      class_id: td.classId, room_id: nonExclusiveRoomId, weekday: 6,
      start_time: '08:00', end_time: '09:00', effective_start_date: td.dateInYear(9, 1),
    }, AL_NOOR_DOMAIN).expect(201);

    const res = await authPost(app, '/api/v1/schedules', adminToken, {
      class_id: td.classId, room_id: nonExclusiveRoomId, weekday: 6,
      start_time: '08:00', end_time: '09:00', effective_start_date: td.dateInYear(9, 1),
    }, AL_NOOR_DOMAIN).expect(201);
    const schedule = res.body.data?.data ?? res.body.data;
    expect(schedule.id).toBeDefined();
  });

  it('should list schedules with filters (GET /api/v1/schedules -> 200)', async () => {
    const res = await authGet(app, `/api/v1/schedules?page=1&pageSize=20&class_id=${td.classId}`, adminToken, AL_NOOR_DOMAIN).expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  it('should update a schedule (PATCH /api/v1/schedules/:id -> 200)', async () => {
    const res = await authPatch(app, `/api/v1/schedules/${createdScheduleId}`, adminToken,
      { start_time: '14:30', end_time: '15:30' }, AL_NOOR_DOMAIN).expect(200);
    const schedule = res.body.data?.data ?? res.body.data;
    expect(String(schedule.start_time)).toContain('14:30');
  });

  it('should end-date a schedule with attendance sessions (DELETE -> 200 action=end_dated)', async () => {
    const roomRes = await authPost(app, '/api/v1/rooms', adminToken, {
      name: `EndDate Room ${Date.now()}`, room_type: 'classroom',
    }, AL_NOOR_DOMAIN).expect(201);

    const schedRes = await authPost(app, '/api/v1/schedules', adminToken, {
      class_id: td.classId, room_id: roomRes.body.data.id, weekday: 2,
      start_time: '11:00', end_time: '12:00', effective_start_date: td.dateInYear(9, 1),
    }, AL_NOOR_DOMAIN).expect(201);
    const scheduleId = (schedRes.body.data?.data ?? schedRes.body.data).id;

    // Create attendance session as teacher on a date within the academic year
    await authPost(app, '/api/v1/attendance-sessions', teacherToken, {
      class_id: td.classId, schedule_id: scheduleId, session_date: td.dateInYear(10, 7),
    }, AL_NOOR_DOMAIN).expect(201);

    const delRes = await authDelete(app, `/api/v1/schedules/${scheduleId}`, adminToken, AL_NOOR_DOMAIN).expect(200);
    expect((delRes.body.data ?? delRes.body).action).toBe('end_dated');
  });

  it('should hard-delete a schedule without attendance sessions (DELETE -> 200 action=deleted)', async () => {
    const roomRes = await authPost(app, '/api/v1/rooms', adminToken, {
      name: `HardDel Room ${Date.now()}`, room_type: 'classroom',
    }, AL_NOOR_DOMAIN).expect(201);

    const schedRes = await authPost(app, '/api/v1/schedules', adminToken, {
      class_id: td.classId, room_id: roomRes.body.data.id, weekday: 5,
      start_time: '15:00', end_time: '16:00', effective_start_date: td.dateInYear(9, 1),
    }, AL_NOOR_DOMAIN).expect(201);
    const scheduleId = (schedRes.body.data?.data ?? schedRes.body.data).id;

    const delRes = await authDelete(app, `/api/v1/schedules/${scheduleId}`, adminToken, AL_NOOR_DOMAIN).expect(200);
    expect((delRes.body.data ?? delRes.body).action).toBe('deleted');
  });
});
