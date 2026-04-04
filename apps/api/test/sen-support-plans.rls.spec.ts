/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A_ID = 'c4000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'c4000002-0002-4002-8002-000000000002';
const USER_A_ID = 'c4000003-0003-4003-8003-000000000003';
const USER_B_ID = 'c4000004-0004-4004-8004-000000000004';
const HOUSEHOLD_A_ID = 'c4000005-0005-4005-8005-000000000005';
const HOUSEHOLD_B_ID = 'c4000006-0006-4006-8006-000000000006';
const STUDENT_A_ID = 'c4000007-0007-4007-8007-000000000007';
const ACAD_YEAR_A_ID = 'c4000008-0008-4008-8008-000000000008';
const SEN_PROFILE_A_ID = 'c4000009-0009-4009-8009-000000000009';
const RLS_TEST_ROLE = 'rls_sen_support_plans_test_user';

// ─── Suite ───────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('sen_support_plans — RLS leakage (database layer)', () => {
  let prisma: PrismaClient;
  let supportPlanAId: string;

  // ─── Helpers ───────────────────────────────────────────────────────────────

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

  // ─── Setup / teardown ──────────────────────────────────────────────────────

  async function cleanupTestData(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `DELETE FROM sen_support_plans WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM sen_profiles WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_years WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM students WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM households WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
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

    // Clean any leftover data from prior runs
    await cleanupTestData();

    // ── Seed prerequisites ─────────────────────────────────────────────────

    // Tenants
    await prisma.tenant.upsert({
      where: { id: TENANT_A_ID },
      create: {
        id: TENANT_A_ID,
        name: 'RLS SenSupportPlan Tenant A',
        slug: 'rls-ssp-a',
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
        name: 'RLS SenSupportPlan Tenant B',
        slug: 'rls-ssp-b',
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
      update: {},
    });

    // Users
    await prisma.user.upsert({
      where: { id: USER_A_ID },
      create: {
        id: USER_A_ID,
        email: 'rls-ssp-user-a@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'User',
        global_status: 'active',
      },
      update: {},
    });

    await prisma.user.upsert({
      where: { id: USER_B_ID },
      create: {
        id: USER_B_ID,
        email: 'rls-ssp-user-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'User',
        global_status: 'active',
      },
      update: {},
    });

    // Households
    await prisma.household.upsert({
      where: { id: HOUSEHOLD_A_ID },
      create: {
        id: HOUSEHOLD_A_ID,
        tenant_id: TENANT_A_ID,
        household_name: 'RLS SenSupportPlan HH A',
      },
      update: {},
    });

    await prisma.household.upsert({
      where: { id: HOUSEHOLD_B_ID },
      create: {
        id: HOUSEHOLD_B_ID,
        tenant_id: TENANT_B_ID,
        household_name: 'RLS SenSupportPlan HH B',
      },
      update: {},
    });

    // Student
    await prisma.student.upsert({
      where: { id: STUDENT_A_ID },
      create: {
        id: STUDENT_A_ID,
        tenant_id: TENANT_A_ID,
        household_id: HOUSEHOLD_A_ID,
        first_name: 'RLS',
        last_name: 'SspStudentA',
        date_of_birth: new Date('2012-01-01'),
        status: 'active',
      },
      update: {},
    });

    // Academic Year
    await prisma.academicYear.upsert({
      where: { id: ACAD_YEAR_A_ID },
      create: {
        id: ACAD_YEAR_A_ID,
        tenant_id: TENANT_A_ID,
        name: '2025-2026',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2026-06-30'),
        status: 'active',
      },
      update: {},
    });

    // SEN Profile
    await prisma.senProfile.upsert({
      where: { id: SEN_PROFILE_A_ID },
      create: {
        id: SEN_PROFILE_A_ID,
        tenant_id: TENANT_A_ID,
        student_id: STUDENT_A_ID,
        sen_categories: ['learning'],
        primary_category: 'learning',
        support_level: 'school_support',
      },
      update: {},
    });

    // SEN Support Plan for Tenant A (test entity)
    const supportPlanA = await prisma.senSupportPlan.create({
      data: {
        tenant_id: TENANT_A_ID,
        sen_profile_id: SEN_PROFILE_A_ID,
        academic_year_id: ACAD_YEAR_A_ID,
        plan_number: 'RLS-SSP-001',
        created_by_user_id: USER_A_ID,
      },
    });
    supportPlanAId = supportPlanA.id;

    // ── Create non-BYPASSRLS role ──────────────────────────────────────────

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
      console.error('[sen_support_plans RLS role cleanup]', err);
    }

    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  // 1. Read isolation (findMany) — Tenant A's SELECT returns only its own rows

  it('SELECT as Tenant A returns only Tenant A sen_support_plans', async () => {
    const rows = await queryAsTenant<{ id: string; tenant_id: string }>(
      TENANT_A_ID,
      `SELECT id::text, tenant_id::text FROM sen_support_plans`,
    );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.tenant_id).toBe(TENANT_A_ID);
    }
  });

  // 2. Read isolation (cross-tenant by ID) — Tenant B cannot read Tenant A's record

  it('SELECT as Tenant B with Tenant A record ID returns 0 rows', async () => {
    const rows = await queryAsTenant<{ id: string }>(
      TENANT_B_ID,
      `SELECT id::text FROM sen_support_plans WHERE id = '${supportPlanAId}'::uuid`,
    );

    expect(rows).toHaveLength(0);
  });

  // 3. Write isolation (UPDATE) — Tenant B UPDATE targeting Tenant A's record is silently blocked

  it('UPDATE as Tenant B targeting Tenant A sen_support_plan leaves the record unchanged', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `UPDATE sen_support_plans SET plan_number = 'HACKED' WHERE id = '${supportPlanAId}'::uuid`,
    );

    // Verify via superuser (no role switch) that Tenant A's record is intact
    const rows = await prisma.$queryRawUnsafe<Array<{ plan_number: string }>>(
      `SELECT plan_number FROM sen_support_plans WHERE id = '${supportPlanAId}'::uuid`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.plan_number).toBe('RLS-SSP-001');
  });

  // 4. Write isolation (DELETE) — Tenant B DELETE targeting Tenant A's record is silently blocked

  it('DELETE as Tenant B targeting Tenant A sen_support_plan leaves the record intact', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `DELETE FROM sen_support_plans WHERE id = '${supportPlanAId}'::uuid`,
    );

    // Verify via superuser (no role switch) that Tenant A's record still exists
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM sen_support_plans WHERE id = '${supportPlanAId}'::uuid`,
    );

    expect(rows).toHaveLength(1);
  });
});
