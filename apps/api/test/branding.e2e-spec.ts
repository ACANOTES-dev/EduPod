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

describe('Branding Endpoints (e2e)', () => {
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

  it('should get branding', async () => {
    const res = await authGet(app, '/api/v1/branding', ownerToken, AL_NOOR_DOMAIN).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.school_name_display).toBeDefined();
  });

  it('should update branding', async () => {
    const res = await authPatch(
      app,
      '/api/v1/branding',
      ownerToken,
      { primary_colour: '#FF0000' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.primary_color).toBe('#FF0000');
  });

  it('should reject without branding.manage permission', async () => {
    await authPatch(
      app,
      '/api/v1/branding',
      teacherToken,
      { primary_colour: '#00FF00' },
      AL_NOOR_DOMAIN,
    ).expect(403);
  });

  it.todo('should upload logo — skipped due to file upload complexity');
});
