/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// `compliance_report_generations` is the audit-trail table added by impl 07
// of the Reports rebuild (Wave 2). Every generated compliance report
// writes one row. Because these rows carry the exact payload regulators
// see, tenant isolation must be enforced at the DB layer — RLS is the
// only defence against a cross-tenant leak in the generation-history
// surface.
//
// Pattern mirrors `reports-rebuild-foundation.rls.spec.ts`: seed a row
// as Tenant A, query/mutate as Tenant B under a non-BYPASSRLS role,
// assert no leak.

const TENANT_A_ID = 'ce070001-0007-4007-8007-000000000001';
const TENANT_B_ID = 'ce070002-0007-4007-8007-000000000002';
const USER_A_ID = 'ce070003-0007-4007-8007-000000000003';
const USER_B_ID = 'ce070004-0007-4007-8007-000000000004';
const ACADEMIC_YEAR_A_ID = 'ce070005-0007-4007-8007-000000000005';
const RLS_TEST_ROLE = 'rls_compliance_gen_test_user';

jest.setTimeout(60_000);

describe('compliance_report_generations — RLS leakage', () => {
  let prisma: PrismaClient;
  let generationAId: string;

  async function queryAsTenant<T>(tenantId: string, sql: string): Promise<T[]> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenantId}', true)`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      const result = await tx.$queryRawUnsafe(sql);
      return result as T[];
    });
  }

  async function mutateAsTenant(tenantId: string, sql: string): Promise<number> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenantId}', true)`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
      const result = await tx.$executeRawUnsafe(sql);
      return result as number;
    });
  }

  async function cleanupTestData(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `DELETE FROM compliance_report_generations WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_years WHERE id = '${ACADEMIC_YEAR_A_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ('${USER_A_ID}'::uuid, '${USER_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await prisma.$connect();

    await cleanupTestData();

    await prisma.tenant.upsert({
      where: { id: TENANT_A_ID },
      create: {
        id: TENANT_A_ID,
        name: 'RLS Compliance Gen Tenant A',
        slug: 'rls-compliance-gen-a',
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
      update: {},
    });

    await prisma.tenant.upsert({
      where: { id: TENANT_B_ID },
      create: {
        id: TENANT_B_ID,
        name: 'RLS Compliance Gen Tenant B',
        slug: 'rls-compliance-gen-b',
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
      update: {},
    });

    await prisma.user.upsert({
      where: { id: USER_A_ID },
      create: {
        id: USER_A_ID,
        email: 'rls-compliance-gen-user-a@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'UserA',
        global_status: 'active',
      },
      update: {},
    });

    await prisma.user.upsert({
      where: { id: USER_B_ID },
      create: {
        id: USER_B_ID,
        email: 'rls-compliance-gen-user-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'UserB',
        global_status: 'active',
      },
      update: {},
    });

    await prisma.academicYear.upsert({
      where: { id: ACADEMIC_YEAR_A_ID },
      create: {
        id: ACADEMIC_YEAR_A_ID,
        tenant_id: TENANT_A_ID,
        name: 'RLS Test AY 2026-2027',
        start_date: new Date('2026-09-01'),
        end_date: new Date('2027-06-30'),
        status: 'active',
      },
      update: {},
    });

    const generation = await prisma.complianceReportGeneration.create({
      data: {
        tenant_id: TENANT_A_ID,
        academic_year_id: ACADEMIC_YEAR_A_ID,
        generated_by: USER_A_ID,
        fields_json: [
          { key: 'student_headcount', value: 120, has_gap: false },
          { key: 'qualified_teachers_percent', value: null, has_gap: true },
        ],
        catalogue_version: 'v1',
      },
    });
    generationAId = generation.id;

    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN;
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $$`,
    );
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`);
    await prisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_ROLE}`,
    );
  });

  afterAll(async () => {
    await cleanupTestData();

    try {
      await prisma.$executeRawUnsafe(
        `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RLS_TEST_ROLE}`,
      );
      await prisma.$executeRawUnsafe(`REVOKE USAGE ON SCHEMA public FROM ${RLS_TEST_ROLE}`);
      await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${RLS_TEST_ROLE}`);
    } catch (err) {
      console.error('[compliance_report_generations RLS role cleanup]', err);
    }

    await prisma.$disconnect();
  });

  describe('compliance_report_generations', () => {
    it('SELECT as Tenant A sees only its own generation row', async () => {
      const rows = await queryAsTenant<{ tenant_id: string }>(
        TENANT_A_ID,
        `SELECT tenant_id::text FROM compliance_report_generations`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) expect(row.tenant_id).toBe(TENANT_A_ID);
    });

    it('SELECT as Tenant B with Tenant A generation id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM compliance_report_generations WHERE id = '${generationAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('UPDATE as Tenant B targeting Tenant A generation leaves it unchanged', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE compliance_report_generations SET catalogue_version = 'HACKED' WHERE id = '${generationAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ catalogue_version: string }>>(
        `SELECT catalogue_version FROM compliance_report_generations WHERE id = '${generationAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.catalogue_version).toBe('v1');
    });

    it('DELETE as Tenant B targeting Tenant A generation leaves it in place', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `DELETE FROM compliance_report_generations WHERE id = '${generationAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text FROM compliance_report_generations WHERE id = '${generationAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
    });

    it('INSERT as Tenant B with Tenant A tenant_id is rejected by WITH CHECK', async () => {
      await expect(
        mutateAsTenant(
          TENANT_B_ID,
          `INSERT INTO compliance_report_generations
            (tenant_id, academic_year_id, generated_by, fields_json, catalogue_version)
           VALUES
            ('${TENANT_A_ID}'::uuid, '${ACADEMIC_YEAR_A_ID}'::uuid, '${USER_B_ID}'::uuid, '[]'::jsonb, 'v1')`,
        ),
      ).rejects.toThrow();
    });
  });
});
