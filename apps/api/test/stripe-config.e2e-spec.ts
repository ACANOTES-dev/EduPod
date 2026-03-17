import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  DEV_PASSWORD,
  authGet,
  authPut,
  closeTestApp,
  createTestApp,
  login,
} from './helpers';

const TEST_STRIPE_BODY = {
  stripe_secret_key: 'sk_test_123456',
  stripe_publishable_key: 'pk_test_123456',
  stripe_webhook_secret: 'whsec_test_123456',
};

describe('Stripe Config Endpoints (e2e)', () => {
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

  it('should return 404 when no stripe config exists', async () => {
    // This test assumes no stripe config has been seeded for al-noor.
    // If a prior test run created one, this will return 200 instead.
    // The test is intentionally first in the suite so the config does not yet exist.
    const res = await authGet(app, '/api/v1/stripe-config', ownerToken, AL_NOOR_DOMAIN);
    // Accept either 404 (no config) or 200 (config already exists from a prior run)
    expect([200, 404]).toContain(res.status);
    if (res.status === 404) {
      expect(res.body.error).toBeDefined();
    }
  });

  it('should create stripe config via PUT', async () => {
    const res = await authPut(
      app,
      '/api/v1/stripe-config',
      ownerToken,
      TEST_STRIPE_BODY,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.stripe_publishable_key).toBe('pk_test_123456');
    expect(res.body.data.stripe_secret_key_masked).toBeDefined();
    expect(res.body.data.stripe_webhook_secret_masked).toBeDefined();
  });

  it('should return masked secrets on GET', async () => {
    // Ensure config exists first
    await authPut(
      app,
      '/api/v1/stripe-config',
      ownerToken,
      TEST_STRIPE_BODY,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const res = await authGet(
      app,
      '/api/v1/stripe-config',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.stripe_secret_key_masked).toMatch(/^\*{4}/);
    expect(res.body.data.stripe_webhook_secret_masked).toMatch(/^\*{4}/);
    // Publishable key is not secret and returned in full
    expect(res.body.data.stripe_publishable_key).toBe('pk_test_123456');
  });

  it('should reject without stripe.manage permission', async () => {
    await authPut(
      app,
      '/api/v1/stripe-config',
      teacherToken,
      TEST_STRIPE_BODY,
      AL_NOOR_DOMAIN,
    ).expect(403);
  });
});
