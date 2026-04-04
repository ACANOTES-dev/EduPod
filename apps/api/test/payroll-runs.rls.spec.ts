/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A_ID = 'd0000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'd0000002-0002-4002-8002-000000000002';
const USER_A_ID = 'd0000003-0003-4003-8003-000000000003';
const USER_B_ID = 'd0000004-0004-4004-8004-000000000004';
const RLS_TEST_ROLE = 'rls_payroll_runs_test_user';

// ─── Suite ────────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('PayrollRun RLS — tenant isolation (integration)', () => {
  let prisma: PrismaClient;
  let payrollRunAId: string;

  // ─── Helpers ──────────────────────────────────────────────────────────────

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
      `DELETE FROM payroll_runs WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ('${USER_A_ID}', '${USER_B_ID}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
    );
  }

  // ─── Setup ────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await prisma.$connect();

    // Clean any leftover data from a previous failed run
    await cleanupTestData();

    // ── Role setup ────────────────────────────────────────────────────────

    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${RLS_TEST_ROLE}') THEN CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$`,
    );
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`);
    await prisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_ROLE}`,
    );

    // ── Seed prerequisites (upsert for idempotency) ───────────────────────

    await prisma.tenant.upsert({
      where: { id: TENANT_A_ID },
      create: {
        id: TENANT_A_ID,
        name: 'RLS Payroll Tenant A',
        slug: 'rls-pr-a',
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
        name: 'RLS Payroll Tenant B',
        slug: 'rls-pr-b',
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
        email: 'rls-pr-user-a@test.local',
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
        email: 'rls-pr-user-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'User',
        global_status: 'active',
      },
      update: {},
    });

    // ── Create test entities ───────────────────────────────────────────────

    const payrollRunA = await prisma.payrollRun.create({
      data: {
        tenant_id: TENANT_A_ID,
        period_label: 'RLS Test Apr 2026',
        period_month: 4,
        period_year: 2026,
        total_working_days: 22,
        status: 'draft',
        created_by_user_id: USER_A_ID,
      },
    });
    payrollRunAId = payrollRunA.id;

    await prisma.payrollRun.create({
      data: {
        tenant_id: TENANT_B_ID,
        period_label: 'RLS Test Apr 2026',
        period_month: 4,
        period_year: 2026,
        total_working_days: 22,
        status: 'draft',
        created_by_user_id: USER_B_ID,
      },
    });
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
      console.error('[payroll-runs.rls] Role cleanup failed:', err);
    }

    await prisma.$disconnect();
  });

  // ─── Read isolation ───────────────────────────────────────────────────────

  it('Tenant A query returns only Tenant A payroll_runs', async () => {
    const rows = await queryAsTenant<{ tenant_id: string }>(
      TENANT_A_ID,
      `SELECT id::text, tenant_id::text FROM payroll_runs`,
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.tenant_id).toBe(TENANT_A_ID);
    }
  });

  it('Tenant B query sees zero Tenant A payroll_runs', async () => {
    const rows = await queryAsTenant<{ tenant_id: string }>(
      TENANT_B_ID,
      `SELECT id::text, tenant_id::text FROM payroll_runs WHERE tenant_id = '${TENANT_A_ID}'`,
    );

    expect(rows).toHaveLength(0);
  });

  it('Tenant B cannot fetch Tenant A record by ID', async () => {
    const rows = await queryAsTenant<{ id: string }>(
      TENANT_B_ID,
      `SELECT id::text, tenant_id::text FROM payroll_runs WHERE id = '${payrollRunAId}'`,
    );

    expect(rows).toHaveLength(0);
  });

  // ─── Write isolation ──────────────────────────────────────────────────────

  it('Tenant B UPDATE targeting Tenant A record has no effect', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `UPDATE payroll_runs SET period_label = 'RLS Tampered' WHERE id = '${payrollRunAId}'`,
    );

    // Verify via superuser query (no role switch) that Tenant A data is untouched
    const rows: Array<{ period_label: string }> = await prisma.$queryRawUnsafe(
      `SELECT period_label FROM payroll_runs WHERE id = '${payrollRunAId}'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.period_label).toBe('RLS Test Apr 2026');
  });

  it('Tenant B DELETE targeting Tenant A record has no effect', async () => {
    await mutateAsTenant(TENANT_B_ID, `DELETE FROM payroll_runs WHERE id = '${payrollRunAId}'`);

    // Verify via superuser query that Tenant A record still exists
    const rows: Array<{ id: string }> = await prisma.$queryRawUnsafe(
      `SELECT id::text FROM payroll_runs WHERE id = '${payrollRunAId}'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(payrollRunAId);
  });
});
