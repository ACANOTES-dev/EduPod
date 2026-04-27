/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Wave 5 of the payroll-overhaul rebuild — `payroll_deduction_applications`
// is the new (Wave 1) join table that powers the two-phase recurring-deduction
// application. Every previously-shipped payroll table already has an RLS
// leakage spec; this fills the gap for the new table.

const TENANT_A_ID = 'b9000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'b9000002-0002-4002-8002-000000000002';
const USER_A_ID = 'b9000003-0003-4003-8003-000000000003';
const USER_B_ID = 'b9000004-0004-4004-8004-000000000004';
const HOUSEHOLD_A_ID = 'b9000005-0005-4005-8005-000000000005';
const STAFF_A_ID = 'b9000006-0006-4006-8006-000000000006';
const PAYROLL_RUN_A_ID = 'b9000007-0007-4007-8007-000000000007';
const PAYROLL_ENTRY_A_ID = 'b9000008-0008-4008-8008-000000000008';
const DEDUCTION_A_ID = 'b9000009-0009-4009-8009-000000000009';
const RLS_TEST_ROLE = 'rls_payroll_deduction_applications_test_user';

// ─── Suite ───────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('payroll_deduction_applications — RLS leakage (database layer)', () => {
  let prisma: PrismaClient;
  let applicationAId: string;

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
      `DELETE FROM payroll_deduction_applications WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM staff_recurring_deductions WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM payroll_entries WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM payroll_runs WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM staff_profiles WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
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

    await cleanupTestData();

    // ── Seed prerequisites (mirrors payroll-adjustments.rls.spec) ────────────

    await prisma.tenant.upsert({
      where: { id: TENANT_A_ID },
      create: {
        id: TENANT_A_ID,
        name: 'RLS PDA Tenant A',
        slug: 'rls-pda-a',
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
        name: 'RLS PDA Tenant B',
        slug: 'rls-pda-b',
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
        email: 'rls-pda-user-a@test.local',
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
        email: 'rls-pda-user-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'User',
        global_status: 'active',
      },
      update: {},
    });

    await prisma.household.upsert({
      where: { id: HOUSEHOLD_A_ID },
      create: {
        id: HOUSEHOLD_A_ID,
        tenant_id: TENANT_A_ID,
        household_name: 'RLS PDA HH A',
      },
      update: {},
    });

    await prisma.staffProfile.upsert({
      where: { id: STAFF_A_ID },
      create: {
        id: STAFF_A_ID,
        tenant_id: TENANT_A_ID,
        user_id: USER_A_ID,
        employment_status: 'active',
        employment_type: 'full_time',
      },
      update: {},
    });

    await prisma.payrollRun.upsert({
      where: { id: PAYROLL_RUN_A_ID },
      create: {
        id: PAYROLL_RUN_A_ID,
        tenant_id: TENANT_A_ID,
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
        status: 'draft',
        created_by_user_id: USER_A_ID,
      },
      update: {},
    });

    await prisma.payrollEntry.upsert({
      where: { id: PAYROLL_ENTRY_A_ID },
      create: {
        id: PAYROLL_ENTRY_A_ID,
        tenant_id: TENANT_A_ID,
        payroll_run_id: PAYROLL_RUN_A_ID,
        staff_profile_id: STAFF_A_ID,
        compensation_type: 'salaried',
        basic_pay: 5000,
        bonus_pay: 0,
        total_pay: 5000,
      },
      update: {},
    });

    // Recurring deduction (the source the application row references)
    await prisma.staffRecurringDeduction.upsert({
      where: { id: DEDUCTION_A_ID },
      create: {
        id: DEDUCTION_A_ID,
        tenant_id: TENANT_A_ID,
        staff_profile_id: STAFF_A_ID,
        description: 'RLS test deduction',
        total_amount: 1000,
        monthly_amount: 200,
        remaining_amount: 1000,
        start_date: new Date('2026-01-01'),
        months_remaining: 5,
        active: true,
        created_by_user_id: USER_A_ID,
      },
      update: {},
    });

    // Application row (the unit under test)
    const applicationA = await prisma.payrollDeductionApplication.create({
      data: {
        tenant_id: TENANT_A_ID,
        payroll_run_id: PAYROLL_RUN_A_ID,
        payroll_entry_id: PAYROLL_ENTRY_A_ID,
        staff_recurring_deduction_id: DEDUCTION_A_ID,
        applied_amount: 200,
      },
    });
    applicationAId = applicationA.id;

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
      console.error('[payroll_deduction_applications RLS role cleanup]', err);
    }

    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it('SELECT as Tenant A returns only Tenant A payroll_deduction_applications', async () => {
    const rows = await queryAsTenant<{ id: string; tenant_id: string }>(
      TENANT_A_ID,
      `SELECT id::text, tenant_id::text FROM payroll_deduction_applications`,
    );

    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.tenant_id).toBe(TENANT_A_ID);
    }
  });

  it('SELECT as Tenant B with Tenant A application ID returns 0 rows', async () => {
    const rows = await queryAsTenant<{ id: string }>(
      TENANT_B_ID,
      `SELECT id::text FROM payroll_deduction_applications WHERE id = '${applicationAId}'::uuid`,
    );

    expect(rows).toHaveLength(0);
  });

  it('UPDATE as Tenant B targeting Tenant A application leaves applied_amount unchanged', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `UPDATE payroll_deduction_applications SET applied_amount = 99999 WHERE id = '${applicationAId}'::uuid`,
    );

    const rows = await prisma.$queryRawUnsafe<Array<{ applied_amount: string }>>(
      `SELECT applied_amount::text FROM payroll_deduction_applications WHERE id = '${applicationAId}'::uuid`,
    );

    expect(rows).toHaveLength(1);
    // Decimal(12,2) serialises as "200.00" via $queryRawUnsafe
    expect(Number(rows[0]!.applied_amount)).toBe(200);
  });

  it('DELETE as Tenant B targeting Tenant A application leaves the record intact', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `DELETE FROM payroll_deduction_applications WHERE id = '${applicationAId}'::uuid`,
    );

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM payroll_deduction_applications WHERE id = '${applicationAId}'::uuid`,
    );

    expect(rows).toHaveLength(1);
  });

  // FORCE ROW LEVEL SECURITY guard — Tenant A reads should be limited to its
  // own rows even though the test role has the same broad GRANT as Tenant B.
  // If FORCE were missing, the table owner (the postgres role Prisma connects
  // as) would bypass policies and the count would include both tenants.
  it('FORCE ROW LEVEL SECURITY is honoured (relrowsecurity + relforcerowsecurity = t)', async () => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'payroll_deduction_applications'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  // The canonical _tenant_isolation policy must exist (named consistently
  // with every other tenant-scoped table; this is what the FORCE-RLS
  // retrofit migration restores).
  it('payroll_deduction_applications_tenant_isolation policy exists', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ policyname: string }>>(
      `SELECT policyname FROM pg_policies WHERE tablename = 'payroll_deduction_applications' AND policyname = 'payroll_deduction_applications_tenant_isolation'`,
    );

    expect(rows).toHaveLength(1);
  });
});
