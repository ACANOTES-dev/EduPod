import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authDelete,
  authGet,
  authPatch,
  authPost,
  login,
} from './helpers';

describe('Classes (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let academicYearId: string;
  let yearGroupId: string;
  let createdClassId: string;
  let staffProfileId: string;
  let studentId: string;
  let secondStudentId: string;
  let enrolmentId: string;
  let completedEnrolmentId: string;

  const uniqueSuffix = `cl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const baseYear = 4000 + Math.floor(Math.random() * 800);

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    // Get teacher user id for staff profile
    const teacherLogin = await login(app, AL_NOOR_TEACHER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    const teacherUserId = teacherLogin.user.id as string;

    // Create an academic year
    const yearRes = await authPost(
      app,
      '/api/v1/academic-years',
      ownerToken,
      {
        name: `Class Test Year ${uniqueSuffix}`,
        start_date: `${baseYear}-09-01`,
        end_date: `${baseYear + 1}-06-30`,
        status: 'planned',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    academicYearId = (yearRes.body.data ?? yearRes.body).id;

    // Create a year group
    const yearGroupRes = await authPost(
      app,
      '/api/v1/year-groups',
      ownerToken,
      { name: `Class Test YG ${uniqueSuffix}` },
      AL_NOOR_DOMAIN,
    ).expect(201);
    yearGroupId = (yearGroupRes.body.data ?? yearGroupRes.body).id;

    // Get or create a staff profile for the teacher
    const staffListRes = await authGet(
      app,
      '/api/v1/staff-profiles',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const staffList = staffListRes.body.data ?? staffListRes.body;
    const existingProfile = Array.isArray(staffList)
      ? staffList.find((s: Record<string, unknown>) => s.user_id === teacherUserId)
      : null;

    if (existingProfile) {
      staffProfileId = existingProfile.id as string;
    } else {
      const staffRes = await authPost(
        app,
        '/api/v1/staff-profiles',
        ownerToken,
        {
          user_id: teacherUserId,
          employment_status: 'active',
        },
        AL_NOOR_DOMAIN,
      ).expect(201);
      staffProfileId = (staffRes.body.data ?? staffRes.body).id;
    }

    // Create a household and students
    const householdRes = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: `Class Test Family ${uniqueSuffix}`,
        emergency_contacts: [
          { contact_name: 'Test Contact', phone: '+1234567890', display_order: 1 },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    const householdId = (householdRes.body.data ?? householdRes.body).id;

    const studentRes = await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: householdId,
        first_name: 'Class',
        last_name: 'StudentOne',
        date_of_birth: '2015-03-15',
        national_id: `NID-S1-${uniqueSuffix}`,
        nationality: 'Irish',
        status: 'active',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    studentId = (studentRes.body.data ?? studentRes.body).id;

    const student2Res = await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: householdId,
        first_name: 'Class',
        last_name: 'StudentTwo',
        date_of_birth: '2015-06-20',
        national_id: `NID-S2-${uniqueSuffix}`,
        nationality: 'Irish',
        status: 'active',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    secondStudentId = (student2Res.body.data ?? student2Res.body).id;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('POST /classes — should create → 201', async () => {
    const res = await authPost(
      app,
      '/api/v1/classes',
      ownerToken,
      {
        name: `Test Class ${uniqueSuffix}`,
        academic_year_id: academicYearId,
        year_group_id: yearGroupId,
        max_capacity: 30,
        class_type: 'floating',
        status: 'active',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.name).toBe(`Test Class ${uniqueSuffix}`);
    expect(body.status).toBe('active');
    createdClassId = body.id;
  });

  it('GET /classes — should list with filters → 200', async () => {
    const res = await authGet(
      app,
      `/api/v1/classes?academic_year_id=${academicYearId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('GET /classes/:id — should return detail → 200', async () => {
    expect(createdClassId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/classes/${createdClassId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBe(createdClassId);
    expect(body.name).toBe(`Test Class ${uniqueSuffix}`);
  });

  it('POST /classes/:id/staff — should assign staff → 201', async () => {
    expect(createdClassId).toBeDefined();
    expect(staffProfileId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/classes/${createdClassId}/staff`,
      ownerToken,
      {
        staff_profile_id: staffProfileId,
        assignment_role: 'teacher',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
  });

  it('DELETE /classes/:id/staff/:sid/role/:r — should remove → 204', async () => {
    expect(createdClassId).toBeDefined();
    expect(staffProfileId).toBeDefined();

    await authDelete(
      app,
      `/api/v1/classes/${createdClassId}/staff/${staffProfileId}/role/teacher`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(204);
  });

  it('POST /classes/:id/enrolments — should enrol student → 201', async () => {
    expect(createdClassId).toBeDefined();
    expect(studentId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/classes/${createdClassId}/enrolments`,
      ownerToken,
      {
        student_id: studentId,
        start_date: `${baseYear}-09-01`,
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.student_id).toBe(studentId);
    enrolmentId = body.id;
  });

  it('POST /classes/:id/enrolments — reject already enrolled → 409', async () => {
    expect(createdClassId).toBeDefined();
    expect(studentId).toBeDefined();

    await authPost(
      app,
      `/api/v1/classes/${createdClassId}/enrolments`,
      ownerToken,
      {
        student_id: studentId,
        start_date: `${baseYear}-09-01`,
      },
      AL_NOOR_DOMAIN,
    ).expect(409);
  });

  it('POST /classes/:id/enrolments/bulk — should bulk enrol → 200', async () => {
    expect(createdClassId).toBeDefined();
    expect(secondStudentId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/classes/${createdClassId}/enrolments/bulk`,
      ownerToken,
      {
        student_ids: [secondStudentId],
        start_date: `${baseYear}-09-01`,
      },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();

    // Get the enrolment id for the second student to use in the completed → active test
    const enrolmentsRes = await authGet(
      app,
      `/api/v1/classes/${createdClassId}/enrolments`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const enrolments = enrolmentsRes.body.data ?? enrolmentsRes.body;
    const secondEnrolment = Array.isArray(enrolments)
      ? enrolments.find((e: Record<string, unknown>) => e.student_id === secondStudentId)
      : null;
    if (secondEnrolment) {
      // Transition to completed so we can test completed → active rejection
      await authPatch(
        app,
        `/api/v1/class-enrolments/${secondEnrolment.id}/status`,
        ownerToken,
        { status: 'completed', end_date: `${baseYear + 1}-06-30` },
        AL_NOOR_DOMAIN,
      ).expect(200);
      completedEnrolmentId = secondEnrolment.id as string;
    }
  });

  it('PATCH /class-enrolments/:id/status — active → dropped → 200', async () => {
    expect(enrolmentId).toBeDefined();

    const res = await authPatch(
      app,
      `/api/v1/class-enrolments/${enrolmentId}/status`,
      ownerToken,
      { status: 'dropped' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.status).toBe('dropped');
  });

  it('PATCH /class-enrolments/:id/status — reject completed → active → 400', async () => {
    expect(completedEnrolmentId).toBeDefined();

    await authPatch(
      app,
      `/api/v1/class-enrolments/${completedEnrolmentId}/status`,
      ownerToken,
      { status: 'active' },
      AL_NOOR_DOMAIN,
    ).expect(400);
  });

  it('GET /classes/:id/preview — should return preview → 200', async () => {
    expect(createdClassId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/classes/${createdClassId}/preview`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
  });
});
