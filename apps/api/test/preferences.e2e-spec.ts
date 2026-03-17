import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_TEACHER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPatch,
  login,
} from './helpers';

describe('Preferences (e2e)', () => {
  let app: INestApplication;
  let teacherToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const teacherLogin = await login(app, AL_NOOR_TEACHER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    teacherToken = teacherLogin.accessToken;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('should get preferences (empty default)', async () => {
    const res = await authGet(
      app,
      '/api/v1/me/preferences',
      teacherToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    // Either an empty object or previously saved preferences — must be an object
    const body = res.body.data ?? res.body;
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
  });

  it('should update preferences', async () => {
    const res = await authPatch(
      app,
      '/api/v1/me/preferences',
      teacherToken,
      { theme: 'dark' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
    // The deep-merge should preserve the theme key
    expect(body.theme).toBe('dark');
  });

  it('should reject unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me/preferences')
      .set('Host', AL_NOOR_DOMAIN)
      .expect(401);
  });
});
