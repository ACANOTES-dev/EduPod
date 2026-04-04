/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A_ID = '40a00001-0001-4001-8001-000000000001';
const TENANT_B_ID = '40a00002-0002-4002-8002-000000000002';
const USER_A_ID = '40a00003-0003-4003-8003-000000000003';
const USER_B_ID = '40a00004-0004-4004-8004-000000000004';
const RLS_TEST_ROLE = 'rls_payslips_test_user';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

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

async function execWithRetry(sql: string, maxRetries = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$executeRawUnsafe(sql);
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('tuple concurrently updated') && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
        continue;
      }
      throw err;
    }
  }
}

async function cleanupTestData(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM payslips WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM payroll_entries WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM payroll_runs WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM staff_profiles WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id IN ('${USER_A_ID}', '${USER_B_ID}')`);
  await prisma.$executeRawUnsafe(
    `DELETE FROM tenants WHERE id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
}

async function seedPrerequisites(): Promise<void> {
  // Tenants
  await prisma.tenant.upsert({
    where: { id: TENANT_A_ID },
    update: {},
    create: {
      id: TENANT_A_ID,
      name: 'RLS PS Tenant A',
      slug: 'rls-ps-a',
      default_locale: 'en',
      timezone: 'UTC',
      date_format: 'YYYY-MM-DD',
      currency_code: 'USD',
      academic_year_start_month: 9,
      status: 'active',
    },
  });
  await prisma.tenant.upsert({
    where: { id: TENANT_B_ID },
    update: {},
    create: {
      id: TENANT_B_ID,
      name: 'RLS PS Tenant B',
      slug: 'rls-ps-b',
      default_locale: 'en',
      timezone: 'UTC',
      date_format: 'YYYY-MM-DD',
      currency_code: 'USD',
      academic_year_start_month: 9,
      status: 'active',
    },
  });

  // Users (platform-level, no tenant_id)
  await prisma.user.upsert({
    where: { id: USER_A_ID },
    update: {},
    create: {
      id: USER_A_ID,
      email: 'rls-ps-user-a@test.local',
      password_hash: '$2a$10$placeholder',
      first_name: 'RLS',
      last_name: 'User',
      global_status: 'active',
    },
  });
  await prisma.user.upsert({
    where: { id: USER_B_ID },
    update: {},
    create: {
      id: USER_B_ID,
      email: 'rls-ps-user-b@test.local',
      password_hash: '$2a$10$placeholder',
      first_name: 'RLS',
      last_name: 'User',
      global_status: 'active',
    },
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('payslips RLS — tenant isolation (integration)', () => {
  let payslipAId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanupTestData();
    await seedPrerequisites();

    // Create non-BYPASSRLS role (idempotent)
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await execWithRetry(`GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`);
    await execWithRetry(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_ROLE}`,
    );

    // StaffProfiles (created dynamically — no fixed UUID to avoid collisions)
    const staffA = await prisma.staffProfile.create({
      data: {
        tenant_id: TENANT_A_ID,
        user_id: USER_A_ID,
        employment_status: 'active',
        job_title: 'RLS Payslip Staff A',
      },
    });
    const staffB = await prisma.staffProfile.create({
      data: {
        tenant_id: TENANT_B_ID,
        user_id: USER_B_ID,
        employment_status: 'active',
        job_title: 'RLS Payslip Staff B',
      },
    });

    // PayrollRuns
    const payrollRunA = await prisma.payrollRun.create({
      data: {
        tenant_id: TENANT_A_ID,
        period_label: 'RLS PS Apr 2026 A',
        period_month: 4,
        period_year: 2026,
        total_working_days: 22,
        status: 'draft',
        created_by_user_id: USER_A_ID,
      },
    });
    const payrollRunB = await prisma.payrollRun.create({
      data: {
        tenant_id: TENANT_B_ID,
        period_label: 'RLS PS Apr 2026 B',
        period_month: 4,
        period_year: 2026,
        total_working_days: 22,
        status: 'draft',
        created_by_user_id: USER_B_ID,
      },
    });

    // PayrollEntries
    const entryA = await prisma.payrollEntry.create({
      data: {
        tenant_id: TENANT_A_ID,
        payroll_run_id: payrollRunA.id,
        staff_profile_id: staffA.id,
        compensation_type: 'salaried',
        basic_pay: 5000.0,
        total_pay: 5000.0,
      },
    });
    const entryB = await prisma.payrollEntry.create({
      data: {
        tenant_id: TENANT_B_ID,
        payroll_run_id: payrollRunB.id,
        staff_profile_id: staffB.id,
        compensation_type: 'salaried',
        basic_pay: 4000.0,
        total_pay: 4000.0,
      },
    });

    // Payslips — the entity under test
    const payslipA = await prisma.payslip.create({
      data: {
        tenant_id: TENANT_A_ID,
        payroll_entry_id: entryA.id,
        payslip_number: 'RLS-PS-A-001',
        template_locale: 'en',
        issued_at: new Date(),
        issued_by_user_id: USER_A_ID,
        snapshot_payload_json: { employee: 'Staff A', amount: 5000 },
        render_version: '1.0',
      },
    });
    payslipAId = payslipA.id;

    await prisma.payslip.create({
      data: {
        tenant_id: TENANT_B_ID,
        payroll_entry_id: entryB.id,
        payslip_number: 'RLS-PS-B-001',
        template_locale: 'en',
        issued_at: new Date(),
        issued_by_user_id: USER_B_ID,
        snapshot_payload_json: { employee: 'Staff B', amount: 4000 },
        render_version: '1.0',
      },
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    try {
      await execWithRetry(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RLS_TEST_ROLE}`);
      await execWithRetry(`REVOKE USAGE ON SCHEMA public FROM ${RLS_TEST_ROLE}`);
      await execWithRetry(`DROP ROLE IF EXISTS ${RLS_TEST_ROLE}`);
    } catch (err) {
      console.error('[payslips-rls cleanup]', err);
    }
    await prisma.$disconnect();
  });

  // ─── Read Isolation (findMany) ────────────────────────────────────────────────

  describe('Read isolation — findMany', () => {
    it('should return only Tenant A records when querying as Tenant A', async () => {
      const rows = await queryAsTenant<{ tenant_id: string }>(
        TENANT_A_ID,
        `SELECT id::text, tenant_id::text FROM payslips`,
      );

      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) {
        expect(row.tenant_id).toBe(TENANT_A_ID);
      }
    });

    it('should return empty when Tenant B queries for Tenant A payslips', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM payslips WHERE tenant_id = '${TENANT_A_ID}'`,
      );

      expect(rows).toHaveLength(0);
    });
  });

  // ─── Read Isolation (findFirst — by ID) ──────────────────────────────────────

  describe('Read isolation — findFirst by ID', () => {
    it('should return empty when Tenant B queries Tenant A payslip by ID', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM payslips WHERE id = '${payslipAId}'`,
      );

      expect(rows).toHaveLength(0);
    });
  });

  // ─── Write Isolation (UPDATE) ─────────────────────────────────────────────────

  describe('Write isolation — UPDATE', () => {
    it('should not allow Tenant B to update Tenant A payslip', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE payslips SET payslip_number = 'HACKED' WHERE id = '${payslipAId}'`,
      );

      // Verify via superuser query (no role switch) that the record is unchanged
      const rows = await prisma.$queryRawUnsafe<Array<{ payslip_number: string }>>(
        `SELECT payslip_number FROM payslips WHERE id = '${payslipAId}'`,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]!.payslip_number).toBe('RLS-PS-A-001');
    });
  });

  // ─── Write Isolation (DELETE) ─────────────────────────────────────────────────

  describe('Write isolation — DELETE', () => {
    it('should not allow Tenant B to delete Tenant A payslip', async () => {
      await mutateAsTenant(TENANT_B_ID, `DELETE FROM payslips WHERE id = '${payslipAId}'`);

      // Verify via superuser query that the record still exists
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text FROM payslips WHERE id = '${payslipAId}'`,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(payslipAId);
    });
  });
});
