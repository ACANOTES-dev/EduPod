import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { closeTestApp, createTestApp, DEV_PASSWORD, authGet, authPost, login } from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

describe('Admission Forms (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let ownerToken: string;
  let parentToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);

    const ownerLogin = await login(app, fixture.ownerEmail, DEV_PASSWORD, fixture.domainName);
    ownerToken = ownerLogin.accessToken;

    const parentLogin = await login(app, fixture.parentEmail!, DEV_PASSWORD, fixture.domainName);
    parentToken = parentLogin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  it('GET /admission-forms/system returns the canonical system form', async () => {
    const res = await authGet(
      app,
      '/api/v1/admission-forms/system',
      ownerToken,
      fixture.domainName,
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
      .set('Host', fixture.domainName)
      .expect(401);
  });

  it('POST /admission-forms/system/rebuild rebuilds the canonical form', async () => {
    const res = await authPost(
      app,
      '/api/v1/admission-forms/system/rebuild',
      ownerToken,
      {},
      fixture.domainName,
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
      fixture.domainName,
    ).expect(403);
  });

  it('GET /public/admissions/form returns the same system form publicly', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/admissions/form')
      .set('Host', fixture.domainName)
      .expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.status).toBe('published');
    expect(body.name).toBe('System Application Form');
    expect(Array.isArray(body.fields)).toBe(true);
  });
});
