/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A_ID = 'a0000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'a0000002-0002-4002-8002-000000000002';
const USER_A_ID = 'a0000003-0003-4003-8003-000000000003';
const USER_B_ID = 'a0000004-0004-4004-8004-000000000004';
const HOUSEHOLD_A_ID = 'a0000005-0005-4005-8005-000000000005';
const HOUSEHOLD_B_ID = 'a0000006-0006-4006-8006-000000000006';
const RLS_TEST_ROLE = 'rls_students_test_user';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

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
    `DELETE FROM students WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM households WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
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
      name: 'RLS Students Tenant A',
      slug: 'rls-stu-a',
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
      name: 'RLS Students Tenant B',
      slug: 'rls-stu-b',
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
      email: 'rls-stu-user-a@test.local',
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
      email: 'rls-stu-user-b@test.local',
      password_hash: '$2a$10$placeholder',
      first_name: 'RLS',
      last_name: 'User',
      global_status: 'active',
    },
  });

  // Households
  await prisma.household.upsert({
    where: { id: HOUSEHOLD_A_ID },
    update: {},
    create: {
      id: HOUSEHOLD_A_ID,
      tenant_id: TENANT_A_ID,
      household_name: 'RLS Household A',
    },
  });
  await prisma.household.upsert({
    where: { id: HOUSEHOLD_B_ID },
    update: {},
    create: {
      id: HOUSEHOLD_B_ID,
      tenant_id: TENANT_B_ID,
      household_name: 'RLS Household B',
    },
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('Students RLS — tenant isolation (integration)', () => {
  let studentAId: string;
  let _studentBId: string;

  beforeAll(async () => {
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

    // Create one student per tenant
    const studentA = await prisma.student.create({
      data: {
        tenant_id: TENANT_A_ID,
        household_id: HOUSEHOLD_A_ID,
        first_name: 'RLS',
        last_name: 'StudentA',
        date_of_birth: new Date('2012-01-01'),
        status: 'active',
      },
    });
    studentAId = studentA.id;

    const studentB = await prisma.student.create({
      data: {
        tenant_id: TENANT_B_ID,
        household_id: HOUSEHOLD_B_ID,
        first_name: 'RLS',
        last_name: 'StudentB',
        date_of_birth: new Date('2012-02-02'),
        status: 'active',
      },
    });
    _studentBId = studentB.id;
  });

  afterAll(async () => {
    await cleanupTestData();
    try {
      await execWithRetry(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RLS_TEST_ROLE}`);
      await execWithRetry(`REVOKE USAGE ON SCHEMA public FROM ${RLS_TEST_ROLE}`);
      await execWithRetry(`DROP ROLE IF EXISTS ${RLS_TEST_ROLE}`);
    } catch (err) {
      console.error('[students-rls cleanup]', err);
    }
    await prisma.$disconnect();
  });

  // ─── Read Isolation (findMany) ───────────────────────────────────────────────

  describe('Read isolation — findMany', () => {
    it('should return only Tenant A records when querying as Tenant A', async () => {
      const rows = await queryAsTenant<{ tenant_id: string }>(
        TENANT_A_ID,
        `SELECT id::text, tenant_id::text FROM students`,
      );

      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) {
        expect(row.tenant_id).toBe(TENANT_A_ID);
      }
    });

    it('should return empty when Tenant B queries for Tenant A data', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM students WHERE tenant_id = '${TENANT_A_ID}'`,
      );

      expect(rows).toHaveLength(0);
    });
  });

  // ─── Read Isolation (findFirst — by ID) ─────────────────────────────────────

  describe('Read isolation — findFirst by ID', () => {
    it('should return empty when Tenant B queries Tenant A record by ID', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM students WHERE id = '${studentAId}'`,
      );

      expect(rows).toHaveLength(0);
    });
  });

  // ─── Write Isolation (UPDATE) ────────────────────────────────────────────────

  describe('Write isolation — UPDATE', () => {
    it('should not allow Tenant B to update Tenant A records', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE students SET last_name = 'HACKED' WHERE id = '${studentAId}'`,
      );

      // Verify via superuser query (no role switch) that the record is unchanged
      const rows = await prisma.$queryRawUnsafe<{ last_name: string }[]>(
        `SELECT last_name FROM students WHERE id = '${studentAId}'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.last_name).toBe('StudentA');
    });
  });

  // ─── Write Isolation (DELETE) ────────────────────────────────────────────────

  describe('Write isolation — DELETE', () => {
    it('should not allow Tenant B to delete Tenant A records', async () => {
      await mutateAsTenant(TENANT_B_ID, `DELETE FROM students WHERE id = '${studentAId}'`);

      // Verify via superuser query that the record still exists
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text FROM students WHERE id = '${studentAId}'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(studentAId);
    });
  });
});
