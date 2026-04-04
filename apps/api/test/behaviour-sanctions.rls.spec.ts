/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A_ID = 'c8000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'c8000002-0002-4002-8002-000000000002';
const USER_A_ID = 'c8000003-0003-4003-8003-000000000003';
const USER_B_ID = 'c8000004-0004-4004-8004-000000000004';
const HOUSEHOLD_A_ID = 'c8000005-0005-4005-8005-000000000005';
const HOUSEHOLD_B_ID = 'c8000006-0006-4006-8006-000000000006';
const STUDENT_A_ID = 'c8000007-0007-4007-8007-000000000007';
const CATEGORY_A_ID = 'c8000008-0008-4008-8008-000000000008';
const ACADEMIC_YEAR_A_ID = 'c8000009-0009-4009-8009-000000000009';
const INCIDENT_A_ID = 'c800000a-000a-400a-800a-00000000000a';
const RLS_TEST_ROLE = 'rls_behaviour_sanctions_test_user';

// ─── Suite ───────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('behaviour_sanctions — RLS leakage (database layer)', () => {
  let prisma: PrismaClient;
  let sanctionAId: string;

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
      `DELETE FROM behaviour_sanctions WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM behaviour_incidents WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM behaviour_categories WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
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
        name: 'RLS BehaviourSanction Tenant A',
        slug: 'rls-bs-a',
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
        name: 'RLS BehaviourSanction Tenant B',
        slug: 'rls-bs-b',
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
        email: 'rls-bs-user-a@test.local',
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
        email: 'rls-bs-user-b@test.local',
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
        household_name: 'RLS BehaviourSanction HH A',
      },
      update: {},
    });

    await prisma.household.upsert({
      where: { id: HOUSEHOLD_B_ID },
      create: {
        id: HOUSEHOLD_B_ID,
        tenant_id: TENANT_B_ID,
        household_name: 'RLS BehaviourSanction HH B',
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
        last_name: 'Student',
        date_of_birth: new Date('2015-01-01'),
        status: 'active',
      },
      update: {},
    });

    // Academic year (required by BehaviourIncident)
    await prisma.academicYear.upsert({
      where: { id: ACADEMIC_YEAR_A_ID },
      create: {
        id: ACADEMIC_YEAR_A_ID,
        tenant_id: TENANT_A_ID,
        name: 'RLS BS Year 2025-26',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2026-06-30'),
        status: 'active',
      },
      update: {},
    });

    // BehaviourCategory (required by BehaviourIncident)
    await prisma.behaviourCategory.upsert({
      where: { id: CATEGORY_A_ID },
      create: {
        id: CATEGORY_A_ID,
        tenant_id: TENANT_A_ID,
        name: 'RLS Test Category',
        polarity: 'negative',
        severity: 3,
        benchmark_category: 'detention',
      },
      update: {},
    });

    // BehaviourIncident
    await prisma.behaviourIncident.upsert({
      where: { id: INCIDENT_A_ID },
      create: {
        id: INCIDENT_A_ID,
        tenant_id: TENANT_A_ID,
        incident_number: 'RLS-BI-001',
        category_id: CATEGORY_A_ID,
        polarity: 'negative',
        severity: 3,
        reported_by_id: USER_A_ID,
        description: 'RLS leakage test incident',
        occurred_at: new Date('2026-04-01T10:00:00Z'),
        academic_year_id: ACADEMIC_YEAR_A_ID,
        status: 'active',
      },
      update: {},
    });

    // BehaviourSanction for Tenant A (test entity)
    const sanctionA = await prisma.behaviourSanction.create({
      data: {
        tenant_id: TENANT_A_ID,
        sanction_number: 'RLS-BS-001',
        incident_id: INCIDENT_A_ID,
        student_id: STUDENT_A_ID,
        type: 'detention',
        status: 'scheduled',
        scheduled_date: new Date('2026-04-05'),
      },
    });
    sanctionAId = sanctionA.id;

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
      console.error('[behaviour_sanctions RLS role cleanup]', err);
    }

    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  // 1. Read isolation (findMany) — Tenant A's SELECT returns only its own rows

  it('SELECT as Tenant A returns only Tenant A behaviour_sanctions', async () => {
    const rows = await queryAsTenant<{ id: string; tenant_id: string }>(
      TENANT_A_ID,
      `SELECT id::text, tenant_id::text FROM behaviour_sanctions`,
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
      `SELECT id::text FROM behaviour_sanctions WHERE id = '${sanctionAId}'::uuid`,
    );

    expect(rows).toHaveLength(0);
  });

  // 3. Write isolation (UPDATE) — Tenant B UPDATE targeting Tenant A's record is silently blocked

  it('UPDATE as Tenant B targeting Tenant A behaviour_sanction leaves the record unchanged', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `UPDATE behaviour_sanctions SET sanction_number = 'HACKED' WHERE id = '${sanctionAId}'::uuid`,
    );

    // Verify via superuser (no role switch) that Tenant A's record is intact
    const rows = await prisma.$queryRawUnsafe<Array<{ sanction_number: string }>>(
      `SELECT sanction_number FROM behaviour_sanctions WHERE id = '${sanctionAId}'::uuid`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.sanction_number).toBe('RLS-BS-001');
  });

  // 4. Write isolation (DELETE) — Tenant B DELETE targeting Tenant A's record is silently blocked

  it('DELETE as Tenant B targeting Tenant A behaviour_sanction leaves the record intact', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `DELETE FROM behaviour_sanctions WHERE id = '${sanctionAId}'::uuid`,
    );

    // Verify via superuser (no role switch) that Tenant A's record still exists
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM behaviour_sanctions WHERE id = '${sanctionAId}'::uuid`,
    );

    expect(rows).toHaveLength(1);
  });
});
