import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authDelete,
  authGet,
  authPatch,
  authPost,
  login,
} from './helpers';

describe('Subjects (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let createdSubjectId: string;
  let inUseSubjectId: string;

  const uniqueSuffix = `sb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const baseYear = 6000 + Math.floor(Math.random() * 800);

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    // Create a subject that will be "in use" by a class
    const subjectRes = await authPost(
      app,
      '/api/v1/subjects',
      ownerToken,
      { name: `In Use Subject ${uniqueSuffix}` },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const subjectBody = subjectRes.body.data ?? subjectRes.body;
    inUseSubjectId = subjectBody.id;

    // Create an academic year for the class
    const yearRes = await authPost(
      app,
      '/api/v1/academic-years',
      ownerToken,
      {
        name: `Subject Test Year ${uniqueSuffix}`,
        start_date: `${baseYear}-09-01`,
        end_date: `${baseYear + 1}-06-30`,
        status: 'planned',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const yearBody = yearRes.body.data ?? yearRes.body;

    // Create a year group for the class
    const ygRes = await authPost(
      app,
      '/api/v1/year-groups',
      ownerToken,
      { name: `Subject YG ${uniqueSuffix}` },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const ygBody = ygRes.body.data ?? ygRes.body;

    // Create a class (floating type — no homeroom required)
    const classRes = await authPost(
      app,
      '/api/v1/classes',
      ownerToken,
      {
        name: `Subject Test Class ${uniqueSuffix}`,
        academic_year_id: yearBody.id,
        year_group_id: ygBody.id,
        max_capacity: 30,
        class_type: 'floating',
        status: 'active',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const classBody = classRes.body.data ?? classRes.body;

    // Link the subject to the class via update
    await authPatch(
      app,
      `/api/v1/classes/${classBody.id}`,
      ownerToken,
      { subject_id: inUseSubjectId },
      AL_NOOR_DOMAIN,
    ).expect(200);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('POST /subjects — should create → 201', async () => {
    const res = await authPost(
      app,
      '/api/v1/subjects',
      ownerToken,
      { name: `Test Subject ${uniqueSuffix}` },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.name).toBe(`Test Subject ${uniqueSuffix}`);
    createdSubjectId = body.id;
  });

  it('GET /subjects — should list with filters → 200', async () => {
    const res = await authGet(
      app,
      '/api/v1/subjects?subject_type=academic',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('DELETE /subjects/:id — should delete unused → 204', async () => {
    expect(createdSubjectId).toBeDefined();

    await authDelete(
      app,
      `/api/v1/subjects/${createdSubjectId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(204);
  });

  it('DELETE /subjects/:id — should block when in use → 400', async () => {
    expect(inUseSubjectId).toBeDefined();

    await authDelete(app, `/api/v1/subjects/${inUseSubjectId}`, ownerToken, AL_NOOR_DOMAIN).expect(
      400,
    );
  });
});
