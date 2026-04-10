/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A_ID = '10a00001-0001-4001-8001-000000000001';
const TENANT_B_ID = '10a00002-0002-4002-8002-000000000002';
const USER_A_ID = '10a00003-0003-4003-8003-000000000003';
const USER_B_ID = '10a00004-0004-4004-8004-000000000004';
const ACADEMIC_YEAR_A_ID = '10a00005-0005-4005-8005-000000000005';
const ACADEMIC_YEAR_B_ID = '10a00006-0006-4006-8006-000000000006';
const CLASS_A_ID = '10a00007-0007-4007-8007-000000000007';
const CLASS_B_ID = '10a00008-0008-4008-8008-000000000008';
const HOUSEHOLD_A_ID = '10a00009-0009-4009-8009-000000000009';
const HOUSEHOLD_B_ID = '10a0000c-000c-400c-800c-00000000000c';
const STUDENT_A_ID = '10a0000a-000a-400a-800a-00000000000a';
const STUDENT_B_ID = '10a0000b-000b-400b-800b-00000000000b';
const RLS_TEST_ROLE = 'rls_attendance_test_user';

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
    `DELETE FROM attendance_records WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM attendance_sessions WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM students WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM households WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM classes WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM academic_years WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
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
      name: 'RLS Att Tenant A',
      slug: 'rls-att-a',
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
      name: 'RLS Att Tenant B',
      slug: 'rls-att-b',
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
      email: 'rls-att-user-a@test.local',
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
      email: 'rls-att-user-b@test.local',
      password_hash: '$2a$10$placeholder',
      first_name: 'RLS',
      last_name: 'User',
      global_status: 'active',
    },
  });

  // Academic Years (one per tenant)
  await prisma.academicYear.upsert({
    where: { id: ACADEMIC_YEAR_A_ID },
    update: {},
    create: {
      id: ACADEMIC_YEAR_A_ID,
      tenant_id: TENANT_A_ID,
      name: 'RLS Att Year A',
      start_date: new Date('2025-09-01'),
      end_date: new Date('2026-06-30'),
      status: 'active',
    },
  });
  await prisma.academicYear.upsert({
    where: { id: ACADEMIC_YEAR_B_ID },
    update: {},
    create: {
      id: ACADEMIC_YEAR_B_ID,
      tenant_id: TENANT_B_ID,
      name: 'RLS Att Year B',
      start_date: new Date('2025-09-01'),
      end_date: new Date('2026-06-30'),
      status: 'active',
    },
  });

  // Classes (one per tenant)
  await prisma.class.upsert({
    where: { id: CLASS_A_ID },
    update: {},
    create: {
      id: CLASS_A_ID,
      tenant_id: TENANT_A_ID,
      academic_year_id: ACADEMIC_YEAR_A_ID,
      name: 'RLS Att Class A',
      status: 'active',
      max_capacity: 25,
    },
  });
  await prisma.class.upsert({
    where: { id: CLASS_B_ID },
    update: {},
    create: {
      id: CLASS_B_ID,
      tenant_id: TENANT_B_ID,
      academic_year_id: ACADEMIC_YEAR_B_ID,
      name: 'RLS Att Class B',
      status: 'active',
      max_capacity: 25,
    },
  });

  // Households (one per tenant)
  await prisma.household.upsert({
    where: { id: HOUSEHOLD_A_ID },
    update: {},
    create: {
      id: HOUSEHOLD_A_ID,
      tenant_id: TENANT_A_ID,
      household_name: 'RLS Att HH A',
    },
  });
  await prisma.household.upsert({
    where: { id: HOUSEHOLD_B_ID },
    update: {},
    create: {
      id: HOUSEHOLD_B_ID,
      tenant_id: TENANT_B_ID,
      household_name: 'RLS Att HH B',
    },
  });

  // Students (one per tenant)
  await prisma.student.upsert({
    where: { id: STUDENT_A_ID },
    update: {},
    create: {
      id: STUDENT_A_ID,
      tenant_id: TENANT_A_ID,
      household_id: HOUSEHOLD_A_ID,
      first_name: 'RLS',
      last_name: 'AttStudentA',
      date_of_birth: new Date('2012-01-01'),
      status: 'active',
    },
  });
  await prisma.student.upsert({
    where: { id: STUDENT_B_ID },
    update: {},
    create: {
      id: STUDENT_B_ID,
      tenant_id: TENANT_B_ID,
      household_id: HOUSEHOLD_B_ID,
      first_name: 'RLS',
      last_name: 'AttStudentB',
      date_of_birth: new Date('2012-02-02'),
      status: 'active',
    },
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('attendance_records RLS — tenant isolation (integration)', () => {
  let recordAId: string;

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

    // Create attendance sessions (prerequisites for records)
    const sessionA = await prisma.attendanceSession.create({
      data: {
        tenant_id: TENANT_A_ID,
        class_id: CLASS_A_ID,
        session_date: new Date('2026-04-01'),
        status: 'open',
      },
    });

    await prisma.attendanceSession.create({
      data: {
        tenant_id: TENANT_B_ID,
        class_id: CLASS_B_ID,
        session_date: new Date('2026-04-01'),
        status: 'open',
      },
    });

    // Create test attendance record for Tenant A
    const recordA = await prisma.attendanceRecord.create({
      data: {
        tenant_id: TENANT_A_ID,
        attendance_session_id: sessionA.id,
        student_id: STUDENT_A_ID,
        status: 'present',
        marked_by_user_id: USER_A_ID,
        marked_at: new Date(),
      },
    });
    recordAId = recordA.id;
  });

  afterAll(async () => {
    await cleanupTestData();
    try {
      await execWithRetry(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RLS_TEST_ROLE}`);
      await execWithRetry(`REVOKE USAGE ON SCHEMA public FROM ${RLS_TEST_ROLE}`);
      await execWithRetry(`DROP ROLE IF EXISTS ${RLS_TEST_ROLE}`);
    } catch (err) {
      console.error('[attendance-records-rls cleanup]', err);
    }
    await prisma.$disconnect();
  });

  // ─── Read Isolation (findMany) ───────────────────────────────────────────────

  describe('Read isolation — findMany', () => {
    it('should return only Tenant A records when querying as Tenant A', async () => {
      const rows = await queryAsTenant<{ tenant_id: string }>(
        TENANT_A_ID,
        `SELECT id::text, tenant_id::text FROM attendance_records`,
      );

      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) {
        expect(row.tenant_id).toBe(TENANT_A_ID);
      }
    });

    it('should return empty when Tenant B queries for Tenant A data', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM attendance_records WHERE tenant_id = '${TENANT_A_ID}'`,
      );

      expect(rows).toHaveLength(0);
    });
  });

  // ─── Read Isolation (findFirst — by ID) ─────────────────────────────────────

  describe('Read isolation — findFirst by ID', () => {
    it('should return empty when Tenant B queries Tenant A record by ID', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM attendance_records WHERE id = '${recordAId}'`,
      );

      expect(rows).toHaveLength(0);
    });
  });

  // ─── Write Isolation (UPDATE) ────────────────────────────────────────────────

  describe('Write isolation — UPDATE', () => {
    it('should not allow Tenant B to update Tenant A records', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE attendance_records SET status = 'absent_unexcused' WHERE id = '${recordAId}'`,
      );

      // Verify via superuser query (no role switch) that the record is unchanged
      const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT status FROM attendance_records WHERE id = '${recordAId}'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('present');
    });
  });

  // ─── Write Isolation (DELETE) ────────────────────────────────────────────────

  describe('Write isolation — DELETE', () => {
    it('should not allow Tenant B to delete Tenant A records', async () => {
      await mutateAsTenant(TENANT_B_ID, `DELETE FROM attendance_records WHERE id = '${recordAId}'`);

      // Verify via superuser query that the record still exists
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text FROM attendance_records WHERE id = '${recordAId}'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(recordAId);
    });
  });
});
