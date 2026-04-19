import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { buildPublicApplicationSeed, ensureAdmissionsTargets } from './admissions-test-helpers';
import { cleanupRedisKeys, closeTestApp, createTestApp, getAuthToken } from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

describe('Public Admissions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let cedarFixture: TenantFixture;
  let ownerToken: string;
  let ipCounter = 1;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);
    cedarFixture = await createTenantFixture(prisma);

    ownerToken = await getAuthToken(app, fixture.ownerEmail, fixture.domainName);
    await ensureAdmissionsTargets(app, ownerToken, fixture.domainName);
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['ratelimit:admissions:*']);
    await deleteTenantFixture(prisma, fixture);
    await deleteTenantFixture(prisma, cedarFixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  it('returns the published public form with parent-visible fields only', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/admissions/form')
      .set('Host', fixture.domainName)
      .expect(200);

    const body = res.body.data ?? res.body;
    expect(body.status).toBe('published');
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.length).toBeGreaterThan(5);

    for (const field of body.fields) {
      expect(field.visible_to_parent).toBe(true);
    }
  });

  it('auto-provisions a public system form for other tenants too', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/admissions/form')
      .set('Host', cedarFixture.domainName)
      .expect(200);

    const body = res.body.data ?? res.body;
    expect(body.name).toBe('System Application Form');
    expect(body.status).toBe('published');
  });

  it('creates an application via the public endpoint', async () => {
    const targets = await ensureAdmissionsTargets(app, ownerToken, fixture.domainName);
    const seed = buildPublicApplicationSeed(targets);
    ipCounter += 1;

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', fixture.domainName)
      .set('X-Forwarded-For', `10.0.0.${ipCounter}`)
      .send(seed)
      .expect(201);

    const body = res.body.data ?? res.body;
    const firstApp = body.applications?.[0];
    expect(firstApp?.id).toBeDefined();
    expect(firstApp?.application_number).toBeDefined();
    expect(['ready_to_admit', 'waiting_list']).toContain(firstApp?.status);
  });

  it('rejects the 4th submission from the same IP within the rate-limit window', async () => {
    const targets = await ensureAdmissionsTargets(app, ownerToken, fixture.domainName);
    const seed = buildPublicApplicationSeed(targets);

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/public/admissions/applications')
        .set('Host', fixture.domainName)
        .set('X-Forwarded-For', '10.99.99.99')
        .send(buildPublicApplicationSeed(targets))
        .expect(201);
    }

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', fixture.domainName)
      .set('X-Forwarded-For', '10.99.99.99')
      .send(seed)
      .expect(400);

    const body = res.body;
    expect(body.error?.code ?? body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('silently ignores submissions that fill the honeypot field', async () => {
    const targets = await ensureAdmissionsTargets(app, ownerToken, fixture.domainName);
    const seed = buildPublicApplicationSeed(targets);
    ipCounter += 1;

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', fixture.domainName)
      .set('X-Forwarded-For', `10.0.0.${ipCounter}`)
      .send({ ...seed, website_url: 'https://spam.invalid' })
      .expect(201);

    const body = res.body.data ?? res.body;
    expect(body.applications).toEqual([]);
  });

  it('returns 404 when the form_definition_id does not exist', async () => {
    const targets = await ensureAdmissionsTargets(app, ownerToken, fixture.domainName);
    const seed = buildPublicApplicationSeed(targets);
    ipCounter += 1;

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', fixture.domainName)
      .set('X-Forwarded-For', `10.0.0.${ipCounter}`)
      .send({
        ...seed,
        form_definition_id: '00000000-0000-0000-0000-000000000000',
      })
      .expect(404);

    const body = res.body;
    expect(body.error?.code ?? body.code).toBe('FORM_NOT_FOUND');
  });

  it('returns 400 when students array is empty', async () => {
    const targets = await ensureAdmissionsTargets(app, ownerToken, fixture.domainName);
    const seed = buildPublicApplicationSeed(targets);
    ipCounter += 1;

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', fixture.domainName)
      .set('X-Forwarded-For', `10.0.0.${ipCounter}`)
      .send({
        ...seed,
        students: [],
      })
      .expect(400);

    const body = res.body;
    expect(body.error?.code ?? body.code).toBe('VALIDATION_ERROR');
  });
});
