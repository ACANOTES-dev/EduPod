import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPost,
  login,
} from './helpers';

describe('Admission Forms (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let parentToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    parentToken = parentLogin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp();
  });

  it('GET /admission-forms/system returns the canonical system form', async () => {
    const res = await authGet(
      app,
      '/api/v1/admission-forms/system',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.name).toBe('System Application Form');
    expect(body.status).toBe('published');
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.length).toBeGreaterThan(5);

    const targetAcademicYearField = body.fields.find(
      (field: { field_key: string }) => field.field_key === 'target_academic_year_id',
    );
    expect(targetAcademicYearField).toBeDefined();
    expect(Array.isArray(targetAcademicYearField.options_json)).toBe(true);

    const targetYearGroupField = body.fields.find(
      (field: { field_key: string }) => field.field_key === 'target_year_group_id',
    );
    expect(targetYearGroupField).toBeDefined();
    expect(Array.isArray(targetYearGroupField.options_json)).toBe(true);
  });

  it('GET /admission-forms/system rejects unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admission-forms/system')
      .set('Host', AL_NOOR_DOMAIN)
      .expect(401);
  });

  it('POST /admission-forms/system/rebuild rebuilds the canonical form', async () => {
    const res = await authPost(
      app,
      '/api/v1/admission-forms/system/rebuild',
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;

    expect(body.id).toBeDefined();
    expect(body.name).toBe('System Application Form');
    expect(body.status).toBe('published');
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.length).toBeGreaterThan(5);
  });

  it('POST /admission-forms/system/rebuild rejects parents', async () => {
    await authPost(
      app,
      '/api/v1/admission-forms/system/rebuild',
      parentToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(403);
  });

  it('GET /public/admissions/form returns the same system form publicly', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/admissions/form')
      .set('Host', AL_NOOR_DOMAIN)
      .expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.status).toBe('published');
    expect(body.name).toBe('System Application Form');
    expect(Array.isArray(body.fields)).toBe(true);
  });
});
