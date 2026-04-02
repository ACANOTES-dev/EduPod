import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  authGet,
  authPatch,
  authPost,
  closeTestApp,
  createTestApp,
  getAuthToken,
} from './helpers';

describe('Students (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let parentToken: string;
  let householdId: string;
  let studentId: string;

  beforeAll(async () => {
    app = await createTestApp();

    ownerToken = await getAuthToken(app, AL_NOOR_OWNER_EMAIL, AL_NOOR_DOMAIN);
    parentToken = await getAuthToken(app, AL_NOOR_PARENT_EMAIL, AL_NOOR_DOMAIN);

    // Create a household to use for student creation
    const householdRes = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: `Test Household ${Date.now()}`,
        emergency_contacts: [{ contact_name: 'Contact', phone: '+1234567', display_order: 1 }],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    householdId = householdRes.body.data.id;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── Create ──────────────────────────────────────────────────────────────────

  it('POST /students — should create student → 201', async () => {
    const res = await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: householdId,
        first_name: 'Test',
        last_name: 'Student',
        date_of_birth: '2015-06-15',
        status: 'applicant',
        national_id: `NID-${Date.now()}-create`,
        nationality: 'Irish',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.first_name).toBe('Test');
    expect(res.body.data.last_name).toBe('Student');
    expect(res.body.data.status).toBe('applicant');
    expect(res.body.data.household_id).toBe(householdId);

    // Store for subsequent tests
    studentId = res.body.data.id;
  });

  it('POST /students — should reject without students.manage → 403', async () => {
    await authPost(
      app,
      '/api/v1/students',
      parentToken,
      {
        household_id: householdId,
        first_name: 'Blocked',
        last_name: 'Student',
        date_of_birth: '2015-01-01',
        status: 'applicant',
        national_id: `NID-${Date.now()}-blocked`,
        nationality: 'Irish',
      },
      AL_NOOR_DOMAIN,
    ).expect(403);
  });

  it('POST /students — should validate allergy details (has_allergy=true but no allergy_details) → 400', async () => {
    const res = await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: householdId,
        first_name: 'Allergy',
        last_name: 'Test',
        date_of_birth: '2015-03-10',
        status: 'applicant',
        has_allergy: true,
        national_id: `NID-${Date.now()}-allergy`,
        nationality: 'Irish',
      },
      AL_NOOR_DOMAIN,
    ).expect(400);

    const body = res.body.error ?? res.body;
    const message = typeof body === 'string' ? body : JSON.stringify(body);
    expect(message).toMatch(/allergy_details/i);
  });

  // ─── List & Detail ───────────────────────────────────────────────────────────

  it('GET /students — should list with filters → 200', async () => {
    const res = await authGet(
      app,
      '/api/v1/students?status=applicant',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    // Every returned student should have the filtered status
    for (const student of res.body.data) {
      expect(student.status).toBe('applicant');
    }

    // Pagination meta
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
  });

  it('GET /students/:id — should return detail → 200', async () => {
    expect(studentId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/students/${studentId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBe(studentId);
    expect(res.body.data.first_name).toBe('Test');
    expect(res.body.data.last_name).toBe('Student');
  });

  // ─── Update ──────────────────────────────────────────────────────────────────

  it('PATCH /students/:id — should update → 200', async () => {
    expect(studentId).toBeDefined();

    const res = await authPatch(
      app,
      `/api/v1/students/${studentId}`,
      ownerToken,
      {
        first_name: 'Updated',
        medical_notes: 'No issues',
      },
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.first_name).toBe('Updated');
    expect(res.body.data.medical_notes).toBe('No issues');
  });

  // ─── Status transitions ──────────────────────────────────────────────────────

  it('PATCH /students/:id/status — applicant → active → 200', async () => {
    expect(studentId).toBeDefined();

    const res = await authPatch(
      app,
      `/api/v1/students/${studentId}/status`,
      ownerToken,
      { status: 'active' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('active');
  });

  it('PATCH /students/:id/status — active → withdrawn with reason → 200', async () => {
    expect(studentId).toBeDefined();

    const res = await authPatch(
      app,
      `/api/v1/students/${studentId}/status`,
      ownerToken,
      { status: 'withdrawn', reason: 'Family relocating' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('withdrawn');
  });

  it('PATCH /students/:id/status — reject invalid transition (applicant → graduated) → 400', async () => {
    // Create a fresh applicant for this test
    const createRes = await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: householdId,
        first_name: 'Transition',
        last_name: 'Test',
        date_of_birth: '2014-09-01',
        status: 'applicant',
        national_id: `NID-${Date.now()}-transition`,
        nationality: 'Irish',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    const freshId = createRes.body.data.id;

    await authPatch(
      app,
      `/api/v1/students/${freshId}/status`,
      ownerToken,
      { status: 'graduated' },
      AL_NOOR_DOMAIN,
    ).expect(400);
  });

  it('PATCH /students/:id/status — reject withdrawal without reason → 400', async () => {
    // Create a fresh active student
    const createRes = await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: householdId,
        first_name: 'NoReason',
        last_name: 'Test',
        date_of_birth: '2014-08-20',
        status: 'applicant',
        national_id: `NID-${Date.now()}-noreason`,
        nationality: 'Irish',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    const freshId = createRes.body.data.id;

    // Transition to active first
    await authPatch(
      app,
      `/api/v1/students/${freshId}/status`,
      ownerToken,
      { status: 'active' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    // Attempt withdrawal without reason — should fail
    await authPatch(
      app,
      `/api/v1/students/${freshId}/status`,
      ownerToken,
      { status: 'withdrawn' },
      AL_NOOR_DOMAIN,
    ).expect(400);
  });

  // ─── Preview & Export ─────────────────────────────────────────────────────────

  it('GET /students/:id/preview — should return preview → 200', async () => {
    expect(studentId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/students/${studentId}/preview`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
  });

  it('GET /students/:id/export-pack — should return pack → 200', async () => {
    expect(studentId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/students/${studentId}/export-pack`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
  });

  // ─── Allergy Report ───────────────────────────────────────────────────────────

  it('GET /students/allergy-report — should return report → 200', async () => {
    const res = await authGet(
      app,
      '/api/v1/students/allergy-report',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
  });
});
