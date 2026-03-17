import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  DEV_PASSWORD,
  authGet,
  authPatch,
  closeTestApp,
  createTestApp,
  login,
} from './helpers';

describe('Settings Endpoints (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const teacherLogin = await login(app, AL_NOOR_TEACHER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    teacherToken = teacherLogin.accessToken;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('should get settings', async () => {
    const res = await authGet(app, '/api/v1/settings', ownerToken, AL_NOOR_DOMAIN).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.attendance).toBeDefined();
  });

  it('should update settings with partial data', async () => {
    const res = await authPatch(
      app,
      '/api/v1/settings',
      ownerToken,
      { attendance: { allowTeacherAmendment: true } },
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.settings).toBeDefined();
    expect(res.body.data.settings.attendance.allowTeacherAmendment).toBe(true);
  });

  it('should return cross-module warnings array', async () => {
    const res = await authPatch(
      app,
      '/api/v1/settings',
      ownerToken,
      { payroll: { autoPopulateClassCounts: true } },
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.warnings)).toBe(true);
  });

  it('should reject without settings.manage permission', async () => {
    await authPatch(
      app,
      '/api/v1/settings',
      teacherToken,
      { attendance: { allowTeacherAmendment: false } },
      AL_NOOR_DOMAIN,
    ).expect(403);
  });

  it('should reject invalid settings', async () => {
    await authPatch(
      app,
      '/api/v1/settings',
      ownerToken,
      { attendance: { pendingAlertTimeHour: 'not a number' } },
      AL_NOOR_DOMAIN,
    ).expect(400);
  });
});
