import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPatch,
  authPost,
  login,
} from './helpers';

describe('Promotion (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let academicYearId: string;
  let yearGroupId: string;
  let nextYearGroupId: string;
  let graduateYearGroupId: string;
  let studentToPromoteId: string;
  let studentToGraduateId: string;

  const uniqueSuffix = `pr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const baseYear = 5000 + Math.floor(Math.random() * 800);

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    // Create year groups for promotion
    const yg1Res = await authPost(
      app,
      '/api/v1/year-groups',
      ownerToken,
      { name: `Promo Grade 1 ${uniqueSuffix}`, display_order: 1 },
      AL_NOOR_DOMAIN,
    ).expect(201);
    yearGroupId = (yg1Res.body.data ?? yg1Res.body).id;

    const yg2Res = await authPost(
      app,
      '/api/v1/year-groups',
      ownerToken,
      { name: `Promo Grade 2 ${uniqueSuffix}`, display_order: 2 },
      AL_NOOR_DOMAIN,
    ).expect(201);
    nextYearGroupId = (yg2Res.body.data ?? yg2Res.body).id;

    // Create a year group with no next (for graduation)
    const ygGradRes = await authPost(
      app,
      '/api/v1/year-groups',
      ownerToken,
      { name: `Promo Final Grade ${uniqueSuffix}`, display_order: 10 },
      AL_NOOR_DOMAIN,
    ).expect(201);
    graduateYearGroupId = (ygGradRes.body.data ?? ygGradRes.body).id;

    // Create an academic year (active so promotion can happen)
    const yearRes = await authPost(
      app,
      '/api/v1/academic-years',
      ownerToken,
      {
        name: `Promo Year ${uniqueSuffix}`,
        start_date: `${baseYear}-09-01`,
        end_date: `${baseYear + 1}-06-30`,
        status: 'planned',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    academicYearId = (yearRes.body.data ?? yearRes.body).id;

    // Activate the year
    await authPatch(
      app,
      `/api/v1/academic-years/${academicYearId}/status`,
      ownerToken,
      { status: 'active' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    // Create a household
    const householdRes = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: `Promo Family ${uniqueSuffix}`,
        emergency_contacts: [
          { contact_name: 'Promo Contact', phone: '+1234567890', display_order: 1 },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    const householdId = (householdRes.body.data ?? householdRes.body).id;

    // Create students assigned to year groups
    const s1Res = await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: householdId,
        first_name: 'Promote',
        last_name: 'Student',
        date_of_birth: '2015-01-01',
        status: 'active',
        year_group_id: yearGroupId,
        national_id: `NID-PR-${uniqueSuffix}-1`,
        nationality: 'Irish',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    studentToPromoteId = (s1Res.body.data ?? s1Res.body).id;

    const s2Res = await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: householdId,
        first_name: 'Graduate',
        last_name: 'Student',
        date_of_birth: '2010-01-01',
        status: 'active',
        year_group_id: graduateYearGroupId,
        national_id: `NID-PR-${uniqueSuffix}-2`,
        nationality: 'Irish',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
    studentToGraduateId = (s2Res.body.data ?? s2Res.body).id;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('GET /promotion/preview — should return grouped by year group → 200', async () => {
    expect(academicYearId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/promotion/preview?academic_year_id=${academicYearId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
    // The preview should return data grouped by year group or at least a list
    if (Array.isArray(body)) {
      expect(body.length).toBeGreaterThan(0);
    } else {
      // Might be an object with groups
      expect(typeof body).toBe('object');
    }
  });

  it('POST /promotion/commit — should promote students → 200', async () => {
    expect(academicYearId).toBeDefined();
    expect(studentToPromoteId).toBeDefined();
    expect(nextYearGroupId).toBeDefined();

    const res = await authPost(
      app,
      '/api/v1/promotion/commit',
      ownerToken,
      {
        academic_year_id: academicYearId,
        actions: [
          {
            student_id: studentToPromoteId,
            action: 'promote',
            target_year_group_id: nextYearGroupId,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
  });

  it('POST /promotion/commit — should graduate students → 200', async () => {
    expect(academicYearId).toBeDefined();
    expect(studentToGraduateId).toBeDefined();

    const res = await authPost(
      app,
      '/api/v1/promotion/commit',
      ownerToken,
      {
        academic_year_id: academicYearId,
        actions: [
          {
            student_id: studentToGraduateId,
            action: 'graduate',
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
  });
});
