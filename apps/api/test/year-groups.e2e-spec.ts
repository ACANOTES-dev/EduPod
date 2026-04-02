import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authDelete,
  authGet,
  authPost,
  login,
} from './helpers';

describe('Year Groups (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let createdYearGroupId: string;
  let inUseYearGroupId: string;

  const uniqueSuffix = Date.now();

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    // Create a year group that will be "in use" by a student
    const ygRes = await authPost(
      app,
      '/api/v1/year-groups',
      ownerToken,
      { name: `In Use YG ${uniqueSuffix}`, display_order: 99 },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const ygBody = ygRes.body.data ?? ygRes.body;
    inUseYearGroupId = ygBody.id;

    // Create a household for the student
    const householdRes = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: `YG Test Family ${uniqueSuffix}`,
        emergency_contacts: [
          { contact_name: 'Test Contact', phone: '+1234567890', display_order: 1 },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const householdBody = householdRes.body.data ?? householdRes.body;
    const householdId = householdBody.id;

    // Create a student assigned to that year group
    await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: householdId,
        first_name: 'YG',
        last_name: 'Student',
        date_of_birth: '2015-01-01',
        status: 'active',
        year_group_id: inUseYearGroupId,
        national_id: `NID-YG-${uniqueSuffix}`,
        nationality: 'Irish',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('POST /year-groups — should create → 201', async () => {
    const res = await authPost(
      app,
      '/api/v1/year-groups',
      ownerToken,
      { name: `Grade Test ${uniqueSuffix}`, display_order: 50 },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.name).toBe(`Grade Test ${uniqueSuffix}`);
    expect(body.display_order).toBe(50);
    createdYearGroupId = body.id;
  });

  it('GET /year-groups — should list ordered → 200', async () => {
    const res = await authGet(app, '/api/v1/year-groups', ownerToken, AL_NOOR_DOMAIN).expect(200);

    const body = res.body.data ?? res.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    // Verify ordering by display_order
    for (let i = 1; i < body.length; i++) {
      expect(body[i].display_order).toBeGreaterThanOrEqual(body[i - 1].display_order);
    }
  });

  it('DELETE /year-groups/:id — should delete unused → 204', async () => {
    expect(createdYearGroupId).toBeDefined();

    await authDelete(
      app,
      `/api/v1/year-groups/${createdYearGroupId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(204);
  });

  it('DELETE /year-groups/:id — should block when in use → 400', async () => {
    expect(inUseYearGroupId).toBeDefined();

    await authDelete(
      app,
      `/api/v1/year-groups/${inUseYearGroupId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(400);
  });
});
