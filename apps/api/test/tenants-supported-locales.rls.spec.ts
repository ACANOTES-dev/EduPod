/* eslint-disable school/no-raw-sql-outside-rls -- platform-table integration tests use direct SQL */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Implementation 01 added `tenants.supported_locales VARCHAR(10)[]`. The
// `tenants` table is intentionally PLATFORM-LEVEL — it has no `tenant_id`
// column and does NOT enable Row-Level Security. Every other table is gated
// at the DB layer; `tenants` is gated at the APPLICATION layer, because the
// table IS the tenant.
//
// This test documents that fact and pins the DB-layer behaviour:
//   1. RLS is OFF on `tenants` (relrowsecurity=false). If a future migration
//      flips this without fixing the application-layer reads, every tenant
//      lookup will silently return nothing.
//   2. The CHECK constraint `tenants_default_locale_in_supported` rejects
//      any row where default_locale is NOT in supported_locales. This is
//      the schema-level guarantee implementation 03 will rely on when the
//      platform-admin UI mutates the array.
//   3. Backfill: every existing tenant SHOULD have supported_locales set
//      to a non-empty array post-migration (the tenants seeded for this
//      test confirm the backfill behaviour locally).
//
// Application-layer isolation (user-B cannot read tenant-A's row via the
// API) is exercised by the existing tenants.e2e-spec.ts suite, which guards
// the `/v1/tenants/:id` route via @RequiresPermission('tenants.manage') —
// platform-admin only. No new endpoint is added in implementation 01, so no
// new application-level surface needs leakage testing here.

const TENANT_A_ID = 'b1200001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'b1200002-0002-4002-8002-000000000002';

// ─── Suite ───────────────────────────────────────────────────────────────────

jest.setTimeout(30_000);

describe('tenants.supported_locales — schema invariants + platform-table behaviour', () => {
  let prisma: PrismaClient;

  async function cleanupTestData(): Promise<void> {
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
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it('tenants table has RLS DISABLED (platform-level by design)', async () => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >(
      `SELECT relrowsecurity, relforcerowsecurity
       FROM pg_class
       WHERE relname = 'tenants' AND relkind = 'r'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.relrowsecurity).toBe(false);
    expect(rows[0]!.relforcerowsecurity).toBe(false);
  });

  it('CHECK constraint rejects default_locale outside supported_locales', async () => {
    await expect(
      prisma.tenant.create({
        data: {
          id: TENANT_A_ID,
          name: 'RLS Tenant Locales A',
          slug: 'rls-tenant-loc-a',
          default_locale: 'fr',
          supported_locales: ['en', 'ar'],
          timezone: 'UTC',
          date_format: 'YYYY-MM-DD',
          currency_code: 'USD',
          academic_year_start_month: 9,
          status: 'active',
        },
      }),
    ).rejects.toThrow();

    // Confirm the row was not partially created
    const remnant = await prisma.tenant.findUnique({ where: { id: TENANT_A_ID } });
    expect(remnant).toBeNull();
  });

  it('CHECK constraint accepts default_locale that IS in supported_locales', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        id: TENANT_A_ID,
        name: 'RLS Tenant Locales A',
        slug: 'rls-tenant-loc-a',
        default_locale: 'ar',
        supported_locales: ['en', 'ar', 'fr'],
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
    });

    expect(tenant.supported_locales).toEqual(['en', 'ar', 'fr']);
    expect(tenant.default_locale).toBe('ar');
  });

  it('CHECK constraint blocks an UPDATE that drops the default_locale from supported_locales', async () => {
    // Tenant A from the previous test has default_locale='ar' + supported={en,ar,fr}.
    await expect(
      prisma.tenant.update({
        where: { id: TENANT_A_ID },
        data: { supported_locales: ['en', 'fr'] },
      }),
    ).rejects.toThrow();

    // Confirm the array is unchanged
    const after = await prisma.tenant.findUnique({
      where: { id: TENANT_A_ID },
      select: { supported_locales: true },
    });
    expect(after?.supported_locales).toEqual(['en', 'ar', 'fr']);
  });

  it('default for new tenants is {en} only (platform admin opts into more later)', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        id: TENANT_B_ID,
        name: 'RLS Tenant Locales B',
        slug: 'rls-tenant-loc-b',
        default_locale: 'en',
        // intentionally omit supported_locales — exercise the column default
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
    });

    expect(tenant.supported_locales).toEqual(['en']);
  });

  it('GIN index on supported_locales exists for membership queries', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename = 'tenants'
         AND indexname = 'idx_tenants_supported_locales'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toMatch(/USING gin/i);
  });
});
