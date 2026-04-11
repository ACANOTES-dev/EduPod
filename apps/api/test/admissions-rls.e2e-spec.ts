/* eslint-disable school/no-raw-sql-outside-rls -- direct SQL is required for explicit RLS verification */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import {
  buildPublicApplicationSeed,
  createPublicApplication,
  ensureAdmissionsTargets,
} from './admissions-test-helpers';
import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  CEDAR_DOMAIN,
  CEDAR_OWNER_EMAIL,
  DEV_PASSWORD,
  authGet,
  authPost,
  cleanupRedisKeys,
  closeTestApp,
  createTestApp,
  login,
} from './helpers';

jest.setTimeout(120_000);

const RLS_TEST_ROLE = 'rls_p3_test_user';

describe('RLS Leakage P3 — Admissions (e2e)', () => {
  let app: INestApplication;
  let directPrisma: PrismaClient;
  let alNoorToken: string;
  let cedarToken: string;
  let alNoorTenantId: string;
  let cedarTenantId: string;
  let alNoorFormId: string;
  let alNoorAppId: string;
  let alNoorAppUpdatedAt: string;

  const uniqueSearchTerm = `RlsP3-${Date.now()}`;

  async function execWithRetry(prisma: PrismaClient, sql: string, maxRetries = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await prisma.$executeRawUnsafe(sql);
        return;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('tuple concurrently updated') && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
          continue;
        }
        throw err;
      }
    }
  }

  async function queryAsCedar(tableName: string): Promise<Array<{ tenant_id: string | null }>> {
    return directPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', '${cedarTenantId}', true)`,
      );
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      return tx.$queryRawUnsafe(`SELECT tenant_id::text FROM "${tableName}"`) as Promise<
        Array<{ tenant_id: string | null }>
      >;
    });
  }

  function assertNoAlNoorRows(rows: Array<{ tenant_id: string | null }>, context: string): void {
    const leaks = rows.filter((row) => row.tenant_id === alNoorTenantId);
    expect(leaks).toHaveLength(0);
    if (leaks.length > 0) {
      throw new Error(`RLS LEAK in ${context}: ${JSON.stringify(leaks)}`);
    }
  }

  beforeAll(async () => {
    app = await createTestApp();

    const alNoorLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    alNoorToken = alNoorLogin.accessToken;

    const cedarLogin = await login(app, CEDAR_OWNER_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN);
    cedarToken = cedarLogin.accessToken;

    const alNoorTargets = await ensureAdmissionsTargets(app, alNoorToken, AL_NOOR_DOMAIN);
    alNoorFormId = alNoorTargets.formId;

    const cedarTargets = await ensureAdmissionsTargets(app, cedarToken, CEDAR_DOMAIN);
    void cedarTargets;

    const seed = buildPublicApplicationSeed(alNoorTargets);
    seed.student_first_name = uniqueSearchTerm;
    seed.student_last_name = 'Isolation';
    seed.payload_json.student_first_name = uniqueSearchTerm;
    seed.payload_json.student_last_name = 'Isolation';
    seed.payload_json.student_national_id = `RLS-${Date.now()}`;

    const created = await createPublicApplication(app, AL_NOOR_DOMAIN, seed);
    alNoorAppId = created.body.id as string;

    await authPost(
      app,
      `/api/v1/applications/${alNoorAppId}/notes`,
      alNoorToken,
      { note: `${uniqueSearchTerm} internal note`, is_internal: true },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const detailRes = await authGet(
      app,
      `/api/v1/applications/${alNoorAppId}`,
      alNoorToken,
      AL_NOOR_DOMAIN,
    ).expect(200);
    alNoorAppUpdatedAt = (detailRes.body.data ?? detailRes.body).updated_at as string;

    directPrisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await directPrisma.$connect();

    const tenants = await directPrisma.tenant.findMany({
      where: { slug: { in: ['al-noor', 'cedar'] } },
      select: { id: true, slug: true },
    });

    alNoorTenantId = tenants.find((tenant) => tenant.slug === 'al-noor')!.id;
    cedarTenantId = tenants.find((tenant) => tenant.slug === 'cedar')!.id;

    await directPrisma.$executeRawUnsafe(
      `DO $$ BEGIN CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await execWithRetry(directPrisma, `GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`);
    await execWithRetry(
      directPrisma,
      `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_ROLE}`,
    );
  }, 120_000);

  afterAll(async () => {
    await cleanupRedisKeys(['ratelimit:admissions:*']);

    if (directPrisma) {
      try {
        await execWithRetry(
          directPrisma,
          `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RLS_TEST_ROLE}`,
        );
        await execWithRetry(directPrisma, `REVOKE USAGE ON SCHEMA public FROM ${RLS_TEST_ROLE}`);
        await execWithRetry(directPrisma, `DROP ROLE IF EXISTS ${RLS_TEST_ROLE}`);
      } catch (err) {
        console.error('[admissions RLS role cleanup]', err);
      }
      await directPrisma.$disconnect();
    }

    await closeTestApp();
  });

  describe('Table-level RLS', () => {
    it('hides Al Noor admission_form_definitions from Cedar', async () => {
      assertNoAlNoorRows(await queryAsCedar('admission_form_definitions'), 'form_definitions');
    });

    it('hides Al Noor admission_form_fields from Cedar', async () => {
      assertNoAlNoorRows(await queryAsCedar('admission_form_fields'), 'form_fields');
    });

    it('hides Al Noor applications from Cedar', async () => {
      assertNoAlNoorRows(await queryAsCedar('applications'), 'applications');
    });

    it('hides Al Noor application_notes from Cedar', async () => {
      assertNoAlNoorRows(await queryAsCedar('application_notes'), 'application_notes');
    });
  });

  describe('API-level isolation', () => {
    it('returns Cedar system-form data instead of Al Noor data', async () => {
      const res = await authGet(
        app,
        '/api/v1/admission-forms/system',
        cedarToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const body = res.body.data ?? res.body;
      expect(body.id).not.toBe(alNoorFormId);
      expect(body.name).toBe('System Application Form');
    });

    it('keeps Al Noor applications out of the Cedar staff list', async () => {
      const res = await authGet(app, '/api/v1/applications', cedarToken, CEDAR_DOMAIN).expect(200);

      const items = res.body.data ?? [];
      expect(items.some((item: { id: string }) => item.id === alNoorAppId)).toBe(false);
      expect(JSON.stringify(items)).not.toContain(uniqueSearchTerm);
    });

    it('returns 404 when Cedar fetches an Al Noor application directly', async () => {
      await authGet(app, `/api/v1/applications/${alNoorAppId}`, cedarToken, CEDAR_DOMAIN).expect(
        404,
      );
    });

    it('returns 404 when Cedar tries to write a note to an Al Noor application', async () => {
      await authPost(
        app,
        `/api/v1/applications/${alNoorAppId}/notes`,
        cedarToken,
        { note: 'Cross-tenant write should fail', is_internal: true },
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('returns 404 when Cedar tries to review an Al Noor application', async () => {
      await authPost(
        app,
        `/api/v1/applications/${alNoorAppId}/review`,
        cedarToken,
        {
          status: 'rejected',
          expected_updated_at: alNoorAppUpdatedAt,
          rejection_reason: 'Cross-tenant review should fail',
        },
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('keeps public forms isolated by domain', async () => {
      const alNoorRes = await request(app.getHttpServer())
        .get('/api/v1/public/admissions/form')
        .set('Host', AL_NOOR_DOMAIN)
        .expect(200);
      const cedarRes = await request(app.getHttpServer())
        .get('/api/v1/public/admissions/form')
        .set('Host', CEDAR_DOMAIN)
        .expect(200);

      expect((alNoorRes.body.data ?? alNoorRes.body).name).toBe('System Application Form');
      expect((cedarRes.body.data ?? cedarRes.body).name).toBe('System Application Form');
      expect((alNoorRes.body.data ?? alNoorRes.body).id).not.toBe(
        (cedarRes.body.data ?? cedarRes.body).id,
      );
    });

    it('creates an Al Noor application only inside the Al Noor tenant', async () => {
      const targets = await ensureAdmissionsTargets(app, alNoorToken, AL_NOOR_DOMAIN);
      const seed = buildPublicApplicationSeed(targets);

      const res = await request(app.getHttpServer())
        .post('/api/v1/public/admissions/applications')
        .set('Host', AL_NOOR_DOMAIN)
        .send(seed)
        .expect(201);

      const createdId = (res.body.data ?? res.body).id as string;

      const detailRes = await authGet(
        app,
        `/api/v1/applications/${createdId}`,
        alNoorToken,
        AL_NOOR_DOMAIN,
      ).expect(200);
      expect((detailRes.body.data ?? detailRes.body).tenant_id).toBe(alNoorTenantId);

      await authGet(app, `/api/v1/applications/${createdId}`, cedarToken, CEDAR_DOMAIN).expect(404);
    });
  });
});
