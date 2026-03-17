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

describe('Academic Years (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let createdYearId: string;
  let closedYearId: string;

  const uniqueSuffix = `ay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const baseYear = 3000 + Math.floor(Math.random() * 800);

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    // Create a year that we will transition to closed for the invalid transition test
    const closedRes = await authPost(
      app,
      '/api/v1/academic-years',
      ownerToken,
      {
        name: `Closed Year ${uniqueSuffix}`,
        start_date: `${baseYear}-09-01`,
        end_date: `${baseYear + 1}-06-30`,
        status: 'planned',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const closedBody = closedRes.body.data ?? closedRes.body;
    closedYearId = closedBody.id;

    // Transition: planned → active → closed
    await authPatch(
      app,
      `/api/v1/academic-years/${closedYearId}/status`,
      ownerToken,
      { status: 'active' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    await authPatch(
      app,
      `/api/v1/academic-years/${closedYearId}/status`,
      ownerToken,
      { status: 'closed' },
      AL_NOOR_DOMAIN,
    ).expect(200);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('POST /academic-years — should create → 201', async () => {
    const res = await authPost(
      app,
      '/api/v1/academic-years',
      ownerToken,
      {
        name: `Test Year ${uniqueSuffix}`,
        start_date: `${baseYear + 2}-09-01`,
        end_date: `${baseYear + 3}-06-30`,
        status: 'planned',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.name).toBe(`Test Year ${uniqueSuffix}`);
    expect(body.status).toBe('planned');
    createdYearId = body.id;
  });

  it('POST /academic-years — should reject overlapping dates → 409', async () => {
    // Attempt to create another year with the same date range
    await authPost(
      app,
      '/api/v1/academic-years',
      ownerToken,
      {
        name: `Overlap Year ${uniqueSuffix}`,
        start_date: `${baseYear + 2}-09-01`,
        end_date: `${baseYear + 3}-06-30`,
        status: 'planned',
      },
      AL_NOOR_DOMAIN,
    ).expect(409);
  });

  it('GET /academic-years — should list → 200', async () => {
    const res = await authGet(
      app,
      '/api/v1/academic-years',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('GET /academic-years/:id — should return with periods → 200', async () => {
    expect(createdYearId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/academic-years/${createdYearId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBe(createdYearId);
    expect(body.name).toBe(`Test Year ${uniqueSuffix}`);
    // Should include periods (may be empty array)
    if (body.academic_periods !== undefined) {
      expect(Array.isArray(body.academic_periods)).toBe(true);
    }
  });

  it('PATCH /academic-years/:id/status — planned → active → 200', async () => {
    expect(createdYearId).toBeDefined();

    const res = await authPatch(
      app,
      `/api/v1/academic-years/${createdYearId}/status`,
      ownerToken,
      { status: 'active' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.status).toBe('active');
  });

  it('PATCH /academic-years/:id/status — reject invalid transition (closed → active) → 400', async () => {
    expect(closedYearId).toBeDefined();

    await authPatch(
      app,
      `/api/v1/academic-years/${closedYearId}/status`,
      ownerToken,
      { status: 'active' },
      AL_NOOR_DOMAIN,
    ).expect(400);
  });
});
