/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A_ID = '30a00001-0001-4001-8001-000000000001';
const TENANT_B_ID = '30a00002-0002-4002-8002-000000000002';
const USER_A_ID = '30a00003-0003-4003-8003-000000000003';
const USER_B_ID = '30a00004-0004-4004-8004-000000000004';
const ACADEMIC_YEAR_A_ID = '30a00005-0005-4005-8005-000000000005';
const ACADEMIC_YEAR_B_ID = '30a00006-0006-4006-8006-000000000006';
const CATEGORY_A_ID = '30a00007-0007-4007-8007-000000000007';
const CATEGORY_B_ID = '30a00008-0008-4008-8008-000000000008';
const RLS_TEST_ROLE = 'rls_behaviour_test_user';

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
    `DELETE FROM behaviour_incidents WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM behaviour_categories WHERE tenant_id IN ('${TENANT_A_ID}', '${TENANT_B_ID}')`,
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
      name: 'RLS BH Tenant A',
      slug: 'rls-bh-a',
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
      name: 'RLS BH Tenant B',
      slug: 'rls-bh-b',
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
      email: 'rls-bh-user-a@test.local',
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
      email: 'rls-bh-user-b@test.local',
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
      name: 'RLS BH Year A',
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
      name: 'RLS BH Year B',
      start_date: new Date('2025-09-01'),
      end_date: new Date('2026-06-30'),
      status: 'active',
    },
  });

  // BehaviourCategories — @@unique([tenant_id, name]), so use deleteMany + create
  await prisma.behaviourCategory.deleteMany({
    where: { tenant_id: TENANT_A_ID, name: 'RLS BH Category A' },
  });
  await prisma.behaviourCategory.create({
    data: {
      id: CATEGORY_A_ID,
      tenant_id: TENANT_A_ID,
      name: 'RLS BH Category A',
      polarity: 'negative',
      severity: 3,
      benchmark_category: 'verbal_warning',
    },
  });

  await prisma.behaviourCategory.deleteMany({
    where: { tenant_id: TENANT_B_ID, name: 'RLS BH Category B' },
  });
  await prisma.behaviourCategory.create({
    data: {
      id: CATEGORY_B_ID,
      tenant_id: TENANT_B_ID,
      name: 'RLS BH Category B',
      polarity: 'negative',
      severity: 3,
      benchmark_category: 'verbal_warning',
    },
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('behaviour_incidents RLS — tenant isolation (integration)', () => {
  let incidentAId: string;

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

    // Create test incident for Tenant A
    const incidentA = await prisma.behaviourIncident.create({
      data: {
        tenant_id: TENANT_A_ID,
        incident_number: 'RLS-BH-A-001',
        category_id: CATEGORY_A_ID,
        polarity: 'negative',
        severity: 3,
        reported_by_id: USER_A_ID,
        description: 'RLS test incident A',
        occurred_at: new Date(),
        academic_year_id: ACADEMIC_YEAR_A_ID,
        status: 'draft',
      },
    });
    incidentAId = incidentA.id;

    // Create test incident for Tenant B (ensures rows exist for both tenants)
    await prisma.behaviourIncident.create({
      data: {
        tenant_id: TENANT_B_ID,
        incident_number: 'RLS-BH-B-001',
        category_id: CATEGORY_B_ID,
        polarity: 'negative',
        severity: 3,
        reported_by_id: USER_B_ID,
        description: 'RLS test incident B',
        occurred_at: new Date(),
        academic_year_id: ACADEMIC_YEAR_B_ID,
        status: 'draft',
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
      console.error('[behaviour-incidents-rls cleanup]', err);
    }
    await prisma.$disconnect();
  });

  // ─── Read Isolation (findMany) ────────────────────────────────────────────────

  describe('Read isolation — findMany', () => {
    it('should return only Tenant A records when querying as Tenant A', async () => {
      const rows = await queryAsTenant<{ tenant_id: string }>(
        TENANT_A_ID,
        `SELECT id::text, tenant_id::text FROM behaviour_incidents`,
      );

      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) {
        expect(row.tenant_id).toBe(TENANT_A_ID);
      }
    });

    it('should return empty when Tenant B queries for Tenant A behaviour_incidents', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM behaviour_incidents WHERE tenant_id = '${TENANT_A_ID}'`,
      );

      expect(rows).toHaveLength(0);
    });
  });

  // ─── Read Isolation (findFirst — by ID) ──────────────────────────────────────

  describe('Read isolation — findFirst by ID', () => {
    it('should return empty when Tenant B queries Tenant A incident by ID', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM behaviour_incidents WHERE id = '${incidentAId}'`,
      );

      expect(rows).toHaveLength(0);
    });
  });

  // ─── Write Isolation (UPDATE) ─────────────────────────────────────────────────

  describe('Write isolation — UPDATE', () => {
    it('should not allow Tenant B to update Tenant A behaviour_incident', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE behaviour_incidents SET description = 'HACKED' WHERE id = '${incidentAId}'`,
      );

      // Verify via superuser query (no role switch) that the record is unchanged
      const rows = await prisma.$queryRawUnsafe<Array<{ description: string }>>(
        `SELECT description FROM behaviour_incidents WHERE id = '${incidentAId}'`,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]!.description).toBe('RLS test incident A');
    });
  });

  // ─── Write Isolation (DELETE) ─────────────────────────────────────────────────

  describe('Write isolation — DELETE', () => {
    it('should not allow Tenant B to delete Tenant A behaviour_incident', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `DELETE FROM behaviour_incidents WHERE id = '${incidentAId}'`,
      );

      // Verify via superuser query that the record still exists
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text FROM behaviour_incidents WHERE id = '${incidentAId}'`,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(incidentAId);
    });
  });
});
