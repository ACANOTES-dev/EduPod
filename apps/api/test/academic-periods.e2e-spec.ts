import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPost,
  login,
} from './helpers';

describe('Academic Periods (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let academicYearId: string;

  const uniqueSuffix = `ap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Generate a unique year range to avoid exclusion constraint conflicts with prior runs
  const baseYear = 2200 + Math.floor(Math.random() * 800);

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    // Create an academic year to attach periods to
    const yearRes = await authPost(
      app,
      '/api/v1/academic-years',
      ownerToken,
      {
        name: `Period Test Year ${uniqueSuffix}`,
        start_date: `${baseYear}-09-01`,
        end_date: `${baseYear + 1}-06-30`,
        status: 'planned',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const yearBody = yearRes.body.data ?? yearRes.body;
    academicYearId = yearBody.id;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('POST /academic-years/:id/periods — should create → 201', async () => {
    expect(academicYearId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/academic-years/${academicYearId}/periods`,
      ownerToken,
      {
        name: `Term 1 ${uniqueSuffix}`,
        period_type: 'term',
        start_date: `${baseYear}-09-01`,
        end_date: `${baseYear}-12-20`,
        status: 'planned',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.name).toBe(`Term 1 ${uniqueSuffix}`);
    expect(body.period_type).toBe('term');
    expect(body.status).toBe('planned');
  });

  it('POST /academic-years/:id/periods — reject dates outside year → 400', async () => {
    expect(academicYearId).toBeDefined();

    await authPost(
      app,
      `/api/v1/academic-years/${academicYearId}/periods`,
      ownerToken,
      {
        name: `Out of Range Period ${uniqueSuffix}`,
        period_type: 'term',
        start_date: `${baseYear + 5}-01-01`,
        end_date: `${baseYear + 5}-06-30`,
        status: 'planned',
      },
      AL_NOOR_DOMAIN,
    ).expect(400);
  });

  it('GET /academic-years/:id/periods — should list → 200', async () => {
    expect(academicYearId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/academic-years/${academicYearId}/periods`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});
