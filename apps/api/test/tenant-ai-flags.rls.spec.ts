/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A_ID = 'd4000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'd4000002-0002-4002-8002-000000000002';
const RLS_TEST_ROLE = 'rls_tenant_ai_flags_test_user';

jest.setTimeout(60_000);

describe('tenant_ai_flags — RLS leakage (database layer)', () => {
  let prisma: PrismaClient;
  let flagAId: string;

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
      `DELETE FROM tenant_ai_flags WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    await cleanupTestData();

    await prisma.tenant.upsert({
      where: { id: TENANT_A_ID },
      create: {
        id: TENANT_A_ID,
        name: 'RLS AI Flags Tenant A',
        slug: 'rls-ai-flags-a',
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
        name: 'RLS AI Flags Tenant B',
        slug: 'rls-ai-flags-b',
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
      update: {},
    });

    const flagA = await prisma.tenantAiFlag.create({
      data: { tenant_id: TENANT_A_ID, module_key: 'behaviour', enabled: true },
    });
    flagAId = flagA.id;

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
      console.error('[tenant_ai_flags RLS role cleanup]', err);
    }
    await prisma.$disconnect();
  });

  it('SELECT as Tenant A returns only Tenant A flag rows', async () => {
    const rows = await queryAsTenant<{ id: string; tenant_id: string }>(
      TENANT_A_ID,
      `SELECT id::text, tenant_id::text FROM tenant_ai_flags`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.tenant_id).toBe(TENANT_A_ID);
    }
  });

  it('SELECT as Tenant B with Tenant A flag id returns 0 rows', async () => {
    const rows = await queryAsTenant<{ id: string }>(
      TENANT_B_ID,
      `SELECT id::text FROM tenant_ai_flags WHERE id = '${flagAId}'::uuid`,
    );
    expect(rows).toHaveLength(0);
  });

  it('UPDATE as Tenant B against Tenant A flag leaves enabled untouched', async () => {
    await mutateAsTenant(
      TENANT_B_ID,
      `UPDATE tenant_ai_flags SET enabled = false WHERE id = '${flagAId}'::uuid`,
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ enabled: boolean }>>(
      `SELECT enabled FROM tenant_ai_flags WHERE id = '${flagAId}'::uuid`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.enabled).toBe(true);
  });

  it('DELETE as Tenant B against Tenant A flag leaves the row intact', async () => {
    await mutateAsTenant(TENANT_B_ID, `DELETE FROM tenant_ai_flags WHERE id = '${flagAId}'::uuid`);
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id::text FROM tenant_ai_flags WHERE id = '${flagAId}'::uuid`,
    );
    expect(rows).toHaveLength(1);
  });
});
