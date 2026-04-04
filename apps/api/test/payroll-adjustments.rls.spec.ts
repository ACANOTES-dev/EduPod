/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A_ID = 'b8000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'b8000002-0002-4002-8002-000000000002';
const USER_A_ID = 'b8000003-0003-4003-8003-000000000003';
const USER_B_ID = 'b8000004-0004-4004-8004-000000000004';
const HOUSEHOLD_A_ID = 'b8000005-0005-4005-8005-000000000005';
const STAFF_A_ID = 'b8000006-0006-4006-8006-000000000006';
const PAYROLL_RUN_A_ID = 'b8000007-0007-4007-8007-000000000007';
const PAYROLL_ENTRY_A_ID = 'b8000008-0008-4008-8008-000000000008';
const RLS_TEST_ROLE = 'rls_payroll_adjustments_test_user';

// ─── Suite ───────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('payroll_adjustments — RLS leakage (database layer)', () => {
  let prisma: PrismaClient;
  let payrollAdjustmentAId: string;

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
      `DELETE FROM payroll_adjustments WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
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

    // Clean any leftover data from prior runs
    await cleanupTestData();

    // ── Seed prerequisites ─────────────────────────────────────────────────

    // Tenants
    await prisma.tenant.upsert({
      where: { id: TENANT_A_ID },
      create: {
        id: TENANT_A_ID,
        name: 'RLS PA Tenant A',
        slug: 'rls-pa-a',
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
        name: 'RLS PA Tenant B',
        slug: 'rls-pa-b',
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
        email: 'rls-pa-user-a@test.local',
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
        email: 'rls-pa-user-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'User',
        global_status: 'active',
      },
      update: {},
    });

    // Household (needed for tenant cleanup ordering)
    await prisma.household.upsert({
      where: { id: HOUSEHOLD_A_ID },
      create: {
        id: HOUSEHOLD_A_ID,
        tenant_id: TENANT_A_ID,
        household_name: 'RLS PA HH A',
      },
      update: {},
    });

    // Staff Profile
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

    // Payroll Run
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

    // Payroll Entry
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

    // Payroll Adjustment for Tenant A (test entity)
    const adjustmentA = await prisma.payrollAdjustment.create({
      data: {
        tenant_id: TENANT_A_ID,
        payroll_run_id: PAYROLL_RUN_A_ID,
        payroll_entry_id: PAYROLL_ENTRY_A_ID,
        adjustment_type: 'bonus',
        amount: 500,
        description: 'RLS test adjustment',
        created_by_user_id: USER_A_ID,
      },
    });
    payrollAdjustmentAId = adjustmentA.id;

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
      console.error('[payroll_adjustments RLS role cleanup]', err);
    }

    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  // 1. Read isolation (findMany) — Tenant A's SELECT returns only its own rows

  it('SELECT as Tenant A returns only Tenant A payroll_adjustments', async () => {
    const rows = await queryAsTenant<{ id: string; tenant_id: string }>(
      TENANT_A_ID,
      `SELECT id::text, tenant_id::text FROM payroll_adjustments`,
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
      `SELECT id::text FROM payroll_adjustments WHERE id = '${payrollAdjustmentAId}'::uuid`,
    );

    expect(rows).toHaveLength(0);
  });

  // 3. Write isolation (UPDATE) — Tenant B UPDATE targeting Tenant A's record is silently blocked

  it('UPDATE as Tenant B targeting Tenant A payroll_adjustment leaves the record unchanged', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `UPDATE payroll_adjustments SET description = 'HACKED' WHERE id = '${payrollAdjustmentAId}'::uuid`,
    );

    // Verify via superuser (no role switch) that Tenant A's record is intact
    const rows = await prisma.$queryRawUnsafe<Array<{ description: string }>>(
      `SELECT description FROM payroll_adjustments WHERE id = '${payrollAdjustmentAId}'::uuid`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.description).toBe('RLS test adjustment');
  });

  // 4. Write isolation (DELETE) — Tenant B DELETE targeting Tenant A's record is silently blocked

  it('DELETE as Tenant B targeting Tenant A payroll_adjustment leaves the record intact', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `DELETE FROM payroll_adjustments WHERE id = '${payrollAdjustmentAId}'::uuid`,
    );

    // Verify via superuser (no role switch) that Tenant A's record still exists
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM payroll_adjustments WHERE id = '${payrollAdjustmentAId}'::uuid`,
    );

    expect(rows).toHaveLength(1);
  });
});
