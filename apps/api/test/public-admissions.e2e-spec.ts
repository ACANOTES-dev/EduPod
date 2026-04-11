import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { buildPublicApplicationSeed, ensureAdmissionsTargets } from './admissions-test-helpers';
import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  CEDAR_DOMAIN,
  cleanupRedisKeys,
  closeTestApp,
  createTestApp,
  getAuthToken,
} from './helpers';

describe('Public Admissions (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let ipCounter = 1;

  beforeAll(async () => {
    app = await createTestApp();

    ownerToken = await getAuthToken(app, AL_NOOR_OWNER_EMAIL, AL_NOOR_DOMAIN);
    await ensureAdmissionsTargets(app, ownerToken, AL_NOOR_DOMAIN);
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['ratelimit:admissions:*']);
    await closeTestApp();
  });

  it('returns the published public form with parent-visible fields only', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/admissions/form')
      .set('Host', AL_NOOR_DOMAIN)
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
      .set('Host', CEDAR_DOMAIN)
      .expect(200);

    const body = res.body.data ?? res.body;
    expect(body.name).toBe('System Application Form');
    expect(body.status).toBe('published');
  });

  it('creates an application via the public endpoint', async () => {
    const targets = await ensureAdmissionsTargets(app, ownerToken, AL_NOOR_DOMAIN);
    const seed = buildPublicApplicationSeed(targets);
    ipCounter += 1;

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .set('X-Forwarded-For', `10.0.0.${ipCounter}`)
      .send(seed)
      .expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.application_number).toBeDefined();
    expect(['ready_to_admit', 'waiting_list']).toContain(body.status);
  });

  it('rejects the 4th submission from the same IP within the rate-limit window', async () => {
    const targets = await ensureAdmissionsTargets(app, ownerToken, AL_NOOR_DOMAIN);
    const seed = buildPublicApplicationSeed(targets);

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/public/admissions/applications')
        .set('Host', AL_NOOR_DOMAIN)
        .set('X-Forwarded-For', '10.99.99.99')
        .send(buildPublicApplicationSeed(targets))
        .expect(201);
    }

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .set('X-Forwarded-For', '10.99.99.99')
      .send(seed)
      .expect(400);

    const body = res.body;
    expect(body.error?.code ?? body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('silently ignores submissions that fill the honeypot field', async () => {
    const targets = await ensureAdmissionsTargets(app, ownerToken, AL_NOOR_DOMAIN);
    const seed = buildPublicApplicationSeed(targets);
    ipCounter += 1;

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .set('X-Forwarded-For', `10.0.0.${ipCounter}`)
      .send({ ...seed, website_url: 'https://spam.invalid' })
      .expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBe('ignored');
  });

  it('returns 404 when the form_definition_id does not exist', async () => {
    const targets = await ensureAdmissionsTargets(app, ownerToken, AL_NOOR_DOMAIN);
    const seed = buildPublicApplicationSeed(targets);
    ipCounter += 1;

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
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
    const targets = await ensureAdmissionsTargets(app, ownerToken, AL_NOOR_DOMAIN);
    const seed = buildPublicApplicationSeed(targets);
    ipCounter += 1;

    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
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
