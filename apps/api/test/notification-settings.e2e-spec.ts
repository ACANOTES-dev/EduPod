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

describe('Notification Settings Endpoints (e2e)', () => {
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

  it('should list notification settings', async () => {
    const res = await authGet(
      app,
      '/api/v1/notification-settings',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(12);
  });

  it('should update a notification setting', async () => {
    const res = await authPatch(
      app,
      '/api/v1/notification-settings/invoice.issued',
      ownerToken,
      { is_enabled: false },
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.notification_type).toBe('invoice.issued');
    expect(res.body.data.is_enabled).toBe(false);
  });

  it('should reject without notifications.manage permission', async () => {
    await authPatch(
      app,
      '/api/v1/notification-settings/invoice.issued',
      teacherToken,
      { is_enabled: true },
      AL_NOOR_DOMAIN,
    ).expect(403);
  });
});
