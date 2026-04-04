/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A_ID = 'b0000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'b0000002-0002-4002-8002-000000000002';
const ACADEMIC_YEAR_A_ID = 'b0000007-0007-4007-8007-000000000007';
const ACADEMIC_YEAR_B_ID = 'b0000008-0008-4008-8008-000000000008';
const RLS_TEST_ROLE = 'rls_classes_test_user';

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
    `DELETE FROM classes WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM academic_years WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
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
      name: 'RLS Classes Tenant A',
      slug: 'rls-cls-a',
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
      name: 'RLS Classes Tenant B',
      slug: 'rls-cls-b',
      default_locale: 'en',
      timezone: 'UTC',
      date_format: 'YYYY-MM-DD',
      currency_code: 'USD',
      academic_year_start_month: 9,
      status: 'active',
    },
  });

  // Academic years (one per tenant)
  await prisma.academicYear.upsert({
    where: { id: ACADEMIC_YEAR_A_ID },
    update: {},
    create: {
      id: ACADEMIC_YEAR_A_ID,
      tenant_id: TENANT_A_ID,
      name: 'RLS Class Test Year A',
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
      name: 'RLS Class Test Year B',
      start_date: new Date('2025-09-01'),
      end_date: new Date('2026-06-30'),
      status: 'active',
    },
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('Classes RLS — tenant isolation (integration)', () => {
  let classAId: string;

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

    // Create one class per tenant
    const classA = await prisma.class.create({
      data: {
        tenant_id: TENANT_A_ID,
        academic_year_id: ACADEMIC_YEAR_A_ID,
        name: 'RLS Class A',
        status: 'active',
      },
    });
    classAId = classA.id;

    await prisma.class.create({
      data: {
        tenant_id: TENANT_B_ID,
        academic_year_id: ACADEMIC_YEAR_B_ID,
        name: 'RLS Class B',
        status: 'active',
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
      console.error('[classes-rls cleanup]', err);
    }
    await prisma.$disconnect();
  });

  // ─── Read Isolation (findMany) ───────────────────────────────────────────────

  describe('Read isolation — findMany', () => {
    it('should return only Tenant A records when querying as Tenant A', async () => {
      const rows = await queryAsTenant<{ tenant_id: string }>(
        TENANT_A_ID,
        `SELECT id::text, tenant_id::text FROM classes`,
      );

      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) {
        expect(row.tenant_id).toBe(TENANT_A_ID);
      }
    });

    it('should return empty when Tenant B queries for Tenant A data', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM classes WHERE tenant_id = '${TENANT_A_ID}'`,
      );

      expect(rows).toHaveLength(0);
    });
  });

  // ─── Read Isolation (findFirst — by ID) ─────────────────────────────────────

  describe('Read isolation — findFirst by ID', () => {
    it('should return empty when Tenant B queries Tenant A record by ID', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM classes WHERE id = '${classAId}'`,
      );

      expect(rows).toHaveLength(0);
    });
  });

  // ─── Write Isolation (UPDATE) ────────────────────────────────────────────────

  describe('Write isolation — UPDATE', () => {
    it('should not allow Tenant B to update Tenant A records', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE classes SET name = 'HACKED' WHERE id = '${classAId}'`,
      );

      // Verify via superuser query (no role switch) that the record is unchanged
      const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
        `SELECT name FROM classes WHERE id = '${classAId}'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe('RLS Class A');
    });
  });

  // ─── Write Isolation (DELETE) ────────────────────────────────────────────────

  describe('Write isolation — DELETE', () => {
    it('should not allow Tenant B to delete Tenant A records', async () => {
      await mutateAsTenant(TENANT_B_ID, `DELETE FROM classes WHERE id = '${classAId}'`);

      // Verify via superuser query that the record still exists
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id::text FROM classes WHERE id = '${classAId}'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(classAId);
    });
  });
});
