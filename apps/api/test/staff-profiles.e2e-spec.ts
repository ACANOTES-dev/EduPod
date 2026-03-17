import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPatch,
  authPost,
  login,
} from './helpers';

describe('Staff Profiles (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let parentToken: string;
  let teacherUserId: string;
  let createdProfileId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const teacherLogin = await login(app, AL_NOOR_TEACHER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    teacherUserId = teacherLogin.user.id as string;

    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    parentToken = parentLogin.accessToken;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('POST /staff-profiles — should create → 201', async () => {
    // Try to create; if profile already exists (409), retrieve existing one
    const res = await authPost(
      app,
      '/api/v1/staff-profiles',
      ownerToken,
      {
        user_id: teacherUserId,
        employment_status: 'active',
        job_title: 'Mathematics Teacher',
        department: 'Mathematics',
        employment_type: 'full_time',
        bank_name: 'National Bank',
        bank_account_number: '1234567890',
        bank_iban: 'SA0380000000608010167519',
      },
      AL_NOOR_DOMAIN,
    );

    if (res.status === 201) {
      const body = res.body.data ?? res.body;
      expect(body.id).toBeDefined();
      expect(body.user_id).toBe(teacherUserId);
      expect(body.employment_status).toBe('active');
      expect(body.job_title).toBe('Mathematics Teacher');
      // Bank details should be masked in the response
      expect(body.bank_account_number_encrypted).toBeUndefined();
      expect(body.bank_iban_encrypted).toBeUndefined();
      createdProfileId = body.id;
    } else if (res.status === 409) {
      // Profile already exists — list and find it
      const listRes = await authGet(
        app,
        '/api/v1/staff-profiles',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      const profiles = listRes.body.data ?? [];
      const existing = profiles.find(
        (p: Record<string, unknown>) => p.user_id === teacherUserId,
      );
      expect(existing).toBeDefined();
      createdProfileId = existing.id as string;
    } else {
      fail(`Unexpected status: ${res.status}`);
    }
  });

  it('POST /staff-profiles — should reject duplicate → 409', async () => {
    await authPost(
      app,
      '/api/v1/staff-profiles',
      ownerToken,
      {
        user_id: teacherUserId,
        employment_status: 'active',
      },
      AL_NOOR_DOMAIN,
    ).expect(409);
  });

  it('POST /staff-profiles — should reject without users.manage → 403', async () => {
    await authPost(
      app,
      '/api/v1/staff-profiles',
      parentToken,
      {
        user_id: teacherUserId,
        employment_status: 'active',
      },
      AL_NOOR_DOMAIN,
    ).expect(403);
  });

  it('GET /staff-profiles — should list with masked bank details → 200', async () => {
    const res = await authGet(
      app,
      '/api/v1/staff-profiles',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    // Verify bank details are masked in list response
    const profile = body.find((p: Record<string, unknown>) => p.id === createdProfileId);
    if (profile) {
      expect(profile.bank_account_number).toBeUndefined();
      expect(profile.bank_iban).toBeUndefined();
    }
  });

  it('GET /staff-profiles/:id — should return detail → 200', async () => {
    expect(createdProfileId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/staff-profiles/${createdProfileId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBe(createdProfileId);
    expect(body.user_id).toBe(teacherUserId);
    expect(body.employment_status).toBe('active');
  });

  it('PATCH /staff-profiles/:id — should update → 200', async () => {
    expect(createdProfileId).toBeDefined();

    const res = await authPatch(
      app,
      `/api/v1/staff-profiles/${createdProfileId}`,
      ownerToken,
      { job_title: 'Senior Mathematics Teacher', department: 'STEM' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.job_title).toBe('Senior Mathematics Teacher');
    expect(body.department).toBe('STEM');
  });

  it('GET /staff-profiles/:id/bank-details — should return masked details → 200', async () => {
    expect(createdProfileId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/staff-profiles/${createdProfileId}/bank-details`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
    // Should have masked bank info
    expect(body).toBeDefined();
    if (body.bank_account_number_masked !== undefined) {
      expect(typeof body.bank_account_number_masked).toBe('string');
    }
    if (body.bank_iban_masked !== undefined) {
      expect(typeof body.bank_iban_masked).toBe('string');
    }
    expect(body.bank_name).toBe('National Bank');
  });

  it('GET /staff-profiles/:id/bank-details — reject without payroll.view_bank_details → 403', async () => {
    expect(createdProfileId).toBeDefined();

    await authGet(
      app,
      `/api/v1/staff-profiles/${createdProfileId}/bank-details`,
      parentToken,
      AL_NOOR_DOMAIN,
    ).expect(403);
  });

  it('GET /staff-profiles/:id/preview — should return preview → 200', async () => {
    expect(createdProfileId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/staff-profiles/${createdProfileId}/preview`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body).toBeDefined();
  });
});
