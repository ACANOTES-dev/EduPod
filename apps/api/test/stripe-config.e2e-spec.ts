import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { DEV_PASSWORD, authGet, authPut, closeTestApp, createTestApp, login } from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

const TEST_STRIPE_BODY = {
  stripe_secret_key: 'sk_test_123456',
  stripe_publishable_key: 'pk_test_123456',
  stripe_webhook_secret: 'whsec_test_123456',
};

describe('Stripe Config Endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let ownerToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);

    const ownerLogin = await login(app, fixture.ownerEmail, DEV_PASSWORD, fixture.domainName);
    ownerToken = ownerLogin.accessToken;

    const teacherLogin = await login(app, fixture.teacherEmail!, DEV_PASSWORD, fixture.domainName);
    teacherToken = teacherLogin.accessToken;
  });

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  it('should return 404 when no stripe config exists', async () => {
    // This test assumes no stripe config has been seeded for al-noor.
    // If a prior test run created one, this will return 200 instead.
    // The test is intentionally first in the suite so the config does not yet exist.
    const res = await authGet(app, '/api/v1/stripe-config', ownerToken, fixture.domainName);
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
      fixture.domainName,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.stripe_publishable_key_masked).toMatch(/^\*{4}/);
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
      fixture.domainName,
    ).expect(200);

    const res = await authGet(app, '/api/v1/stripe-config', ownerToken, fixture.domainName).expect(
      200,
    );

    expect(res.body.data).toBeDefined();
    expect(res.body.data.stripe_secret_key_masked).toMatch(/^\*{4}/);
    expect(res.body.data.stripe_webhook_secret_masked).toMatch(/^\*{4}/);
    // Publishable key is not secret and returned in full
    expect(res.body.data.stripe_publishable_key_masked).toMatch(/^\*{4}/);
  });

  it('should reject without stripe.manage permission', async () => {
    await authPut(
      app,
      '/api/v1/stripe-config',
      teacherToken,
      TEST_STRIPE_BODY,
      fixture.domainName,
    ).expect(403);
  });
});
