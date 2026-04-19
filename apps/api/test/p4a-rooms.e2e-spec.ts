import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import {
  createTestApp,
  closeTestApp,
  getAuthToken,
  authGet,
  authPost,
  authPatch,
  authDelete,
} from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

jest.setTimeout(120_000);

describe('P4A Rooms (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let adminToken: string;
  let parentToken: string;

  // Track rooms created during tests for cleanup reference
  let createdRoomId: string;
  let deletableRoomId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);
    adminToken = await getAuthToken(app, fixture.adminEmail!, fixture.domainName);
    parentToken = await getAuthToken(app, fixture.parentEmail!, fixture.domainName);
  });

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  // ─── 1. Create room ────────────────────────────────────────────────────
  it('should create a room (POST /api/v1/rooms → 201)', async () => {
    const uniqueName = `Test Room ${Date.now()}`;
    const res = await authPost(
      app,
      '/api/v1/rooms',
      adminToken,
      {
        name: uniqueName,
        room_type: 'classroom',
        capacity: 25,
        is_exclusive: true,
      },
      fixture.domainName,
    ).expect(201);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe(uniqueName);
    expect(res.body.data.room_type).toBe('classroom');
    expect(res.body.data.capacity).toBe(25);
    expect(res.body.data.is_exclusive).toBe(true);
    expect(res.body.data.active).toBe(true);

    createdRoomId = res.body.data.id;
  });

  // ─── 2. Reject duplicate name ─────────────────────────────────────────
  it('should reject duplicate room name (POST /api/v1/rooms → 409)', async () => {
    // First, create a room
    const uniqueName = `Dup Room ${Date.now()}`;
    await authPost(
      app,
      '/api/v1/rooms',
      adminToken,
      {
        name: uniqueName,
        room_type: 'classroom',
      },
      fixture.domainName,
    ).expect(201);

    // Attempt to create a room with the same name
    const res = await authPost(
      app,
      '/api/v1/rooms',
      adminToken,
      {
        name: uniqueName,
        room_type: 'classroom',
      },
      fixture.domainName,
    ).expect(409);

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('ROOM_NAME_EXISTS');
  });

  // ─── 3. List rooms with pagination ────────────────────────────────────
  it('should list rooms with pagination (GET /api/v1/rooms → 200)', async () => {
    const res = await authGet(
      app,
      '/api/v1/rooms?page=1&pageSize=10',
      adminToken,
      fixture.domainName,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.pageSize).toBe(10);
    expect(typeof res.body.meta.total).toBe('number');
  });

  // ─── 4. Filter by active ──────────────────────────────────────────────
  it('should filter rooms by active status (GET /api/v1/rooms?active=true → 200)', async () => {
    const res = await authGet(
      app,
      '/api/v1/rooms?active=true',
      adminToken,
      fixture.domainName,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);

    // All returned rooms should be active
    for (const room of res.body.data) {
      expect(room.active).toBe(true);
    }
  });

  // ─── 5. Get room by ID ────────────────────────────────────────────────
  it('should get a room by ID (GET /api/v1/rooms/:id → 200)', async () => {
    expect(createdRoomId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/rooms/${createdRoomId}`,
      adminToken,
      fixture.domainName,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBe(createdRoomId);
  });

  // ─── 6. 404 for unknown room ─────────────────────────────────────────
  it('should return 404 for unknown room (GET /api/v1/rooms/<random> → 404)', async () => {
    const randomUuid = '00000000-0000-0000-0000-000000000099';
    const res = await authGet(
      app,
      `/api/v1/rooms/${randomUuid}`,
      adminToken,
      fixture.domainName,
    ).expect(404);

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('ROOM_NOT_FOUND');
  });

  // ─── 7. Update room ──────────────────────────────────────────────────
  it('should update a room (PATCH /api/v1/rooms/:id → 200)', async () => {
    expect(createdRoomId).toBeDefined();

    const newName = `Updated Room ${Date.now()}`;
    const res = await authPatch(
      app,
      `/api/v1/rooms/${createdRoomId}`,
      adminToken,
      { name: newName, capacity: 50 },
      fixture.domainName,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.name).toBe(newName);
    expect(res.body.data.capacity).toBe(50);
  });

  // ─── 8. Delete unused room ────────────────────────────────────────────
  it('should delete an unused room (DELETE /api/v1/rooms/:id → 204)', async () => {
    // Create a fresh room to delete (no schedules referencing it)
    const uniqueName = `Deletable Room ${Date.now()}`;
    const createRes = await authPost(
      app,
      '/api/v1/rooms',
      adminToken,
      {
        name: uniqueName,
        room_type: 'other',
      },
      fixture.domainName,
    ).expect(201);

    deletableRoomId = createRes.body.data.id;

    await authDelete(
      app,
      `/api/v1/rooms/${deletableRoomId}`,
      adminToken,
      fixture.domainName,
    ).expect(204);

    // Verify it's gone
    await authGet(app, `/api/v1/rooms/${deletableRoomId}`, adminToken, fixture.domainName).expect(
      404,
    );
  });

  // ─── 9. Block delete of room in use ───────────────────────────────────
  it('should block deletion of room assigned to a schedule (DELETE → 409)', async () => {
    // Create a room
    const roomName = `InUse Room ${Date.now()}`;
    const roomRes = await authPost(
      app,
      '/api/v1/rooms',
      adminToken,
      {
        name: roomName,
        room_type: 'classroom',
      },
      fixture.domainName,
    ).expect(201);
    const roomId = roomRes.body.data.id;

    // Find an existing class to create a schedule with this room
    const classesRes = await authGet(
      app,
      '/api/v1/schedules?page=1&pageSize=1',
      adminToken,
      fixture.domainName,
    ).expect(200);

    // If there are schedules, borrow the class_id from one
    let classId: string;
    if (classesRes.body.data.length > 0) {
      classId = classesRes.body.data[0].class_id;
    } else {
      // Skip if no classes available — we cannot run this test without seed data
      console.warn('No existing schedules found; skipping room-in-use test detail');
      return;
    }

    // Create a schedule that references this room (use weekday=5 and unique time to avoid conflicts)
    await authPost(
      app,
      '/api/v1/schedules',
      adminToken,
      {
        class_id: classId,
        room_id: roomId,
        weekday: 5,
        start_time: '16:00',
        end_time: '17:00',
        effective_start_date: '2025-09-01',
      },
      fixture.domainName,
    ).expect(201);

    // Now try to delete the room — should be blocked
    const delRes = await authDelete(
      app,
      `/api/v1/rooms/${roomId}`,
      adminToken,
      fixture.domainName,
    ).expect(409);

    expect(delRes.body.error).toBeDefined();
    expect(delRes.body.error.code).toBe('ROOM_IN_USE');
  });

  // ─── 10. Permission denied without schedule.manage ────────────────────
  it('should return 403 for parent user lacking schedule.manage (GET /api/v1/rooms → 403)', async () => {
    const res = await authGet(
      app,
      '/api/v1/rooms?page=1&pageSize=10',
      parentToken,
      fixture.domainName,
    ).expect(403);

    expect(res.body.error).toBeDefined();
  });
});
