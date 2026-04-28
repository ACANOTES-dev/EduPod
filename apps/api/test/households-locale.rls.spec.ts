/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Implementation 01 (multi-language expansion) added two new columns to the
// `households` table:
//   - secondary_locale          VARCHAR(10) NULL
//   - dual_language_opt_in      BOOLEAN NOT NULL DEFAULT false
//
// `households` already has FORCE ROW LEVEL SECURITY enabled with the canonical
// `households_tenant_isolation` policy. The new columns ride along on that
// policy automatically — RLS is row-level, not column-level — but we add
// explicit leakage tests here so any future regression (someone disables FORCE
// RLS, drops the policy, or adds a column that should NOT be tenant-scoped) is
// caught at the test layer, not in production.

const TENANT_A_ID = 'b1100001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'b1100002-0002-4002-8002-000000000002';
const HOUSEHOLD_A_ID = 'b1100003-0003-4003-8003-000000000003';
const HOUSEHOLD_B_ID = 'b1100004-0004-4004-8004-000000000004';
const RLS_TEST_ROLE = 'rls_household_locale_test_user';

// ─── Suite ───────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('households.secondary_locale + dual_language_opt_in — RLS leakage', () => {
  let prisma: PrismaClient;

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

  async function cleanupTestData(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `DELETE FROM households WHERE id IN ('${HOUSEHOLD_A_ID}'::uuid, '${HOUSEHOLD_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
  }

  // ─── Setup / teardown ──────────────────────────────────────────────────────

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await prisma.$connect();
    await cleanupTestData();

    // Seed two tenants with `supported_locales` set to {en, ar, fr} so that
    // setting secondary_locale='fr' is allowed by the schema (the validation
    // for "secondary_locale must be in tenant.supported_locales" lands in
    // implementation 06 — for now the column is free-form at the DB level).
    for (const [id, slug, name] of [
      [TENANT_A_ID, 'rls-hh-loc-a', 'RLS Household Locale Tenant A'],
      [TENANT_B_ID, 'rls-hh-loc-b', 'RLS Household Locale Tenant B'],
    ] as const) {
      await prisma.tenant.upsert({
        where: { id },
        create: {
          id,
          name,
          slug,
          default_locale: 'en',
          supported_locales: ['en', 'ar', 'fr'],
          timezone: 'UTC',
          date_format: 'YYYY-MM-DD',
          currency_code: 'USD',
          academic_year_start_month: 9,
          status: 'active',
        },
        update: {},
      });
    }

    // Tenant A household with the new columns populated
    await prisma.household.create({
      data: {
        id: HOUSEHOLD_A_ID,
        tenant_id: TENANT_A_ID,
        household_name: 'RLS Locale Household A',
        secondary_locale: 'fr',
        dual_language_opt_in: true,
      },
    });

    // Tenant B household with the columns at their defaults
    await prisma.household.create({
      data: {
        id: HOUSEHOLD_B_ID,
        tenant_id: TENANT_B_ID,
        household_name: 'RLS Locale Household B',
      },
    });

    // Non-BYPASSRLS role used to actually trigger RLS enforcement
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
      console.error('[households-locale-rls role cleanup]', err);
    }
    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it('Tenant A reads its own secondary_locale and dual_language_opt_in', async () => {
    const rows = await queryAsTenant<{
      id: string;
      secondary_locale: string | null;
      dual_language_opt_in: boolean;
    }>(
      TENANT_A_ID,
      `SELECT id::text, secondary_locale, dual_language_opt_in
       FROM households
       WHERE id = '${HOUSEHOLD_A_ID}'::uuid`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.secondary_locale).toBe('fr');
    expect(rows[0]!.dual_language_opt_in).toBe(true);
  });

  it('Tenant B SELECT for Tenant A household returns 0 rows (RLS blocks new columns)', async () => {
    const rows = await queryAsTenant<{ id: string }>(
      TENANT_B_ID,
      `SELECT id::text, secondary_locale, dual_language_opt_in
       FROM households
       WHERE id = '${HOUSEHOLD_A_ID}'::uuid`,
    );

    expect(rows).toHaveLength(0);
  });

  it('Tenant B cannot UPDATE Tenant A household locale columns', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `UPDATE households
       SET secondary_locale = 'ar', dual_language_opt_in = false
       WHERE id = '${HOUSEHOLD_A_ID}'::uuid`,
    );

    // Verify via superuser that Tenant A's row is intact
    const rows = await prisma.$queryRawUnsafe<
      Array<{ secondary_locale: string | null; dual_language_opt_in: boolean }>
    >(
      `SELECT secondary_locale, dual_language_opt_in
       FROM households
       WHERE id = '${HOUSEHOLD_A_ID}'::uuid`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.secondary_locale).toBe('fr');
    expect(rows[0]!.dual_language_opt_in).toBe(true);
  });

  it('Tenant B cannot DELETE Tenant A household via the new column predicate', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `DELETE FROM households
       WHERE secondary_locale = 'fr' AND dual_language_opt_in = true`,
    );

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM households WHERE id = '${HOUSEHOLD_A_ID}'::uuid`,
    );

    expect(rows).toHaveLength(1);
  });

  it('Tenant A SELECT * returns own row only (cross-tenant scan blocked)', async () => {
    const rows = await queryAsTenant<{ tenant_id: string }>(
      TENANT_A_ID,
      `SELECT tenant_id::text
       FROM households
       WHERE id IN ('${HOUSEHOLD_A_ID}'::uuid, '${HOUSEHOLD_B_ID}'::uuid)`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenant_id).toBe(TENANT_A_ID);
  });
});
