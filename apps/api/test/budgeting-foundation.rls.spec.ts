/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Each of the nine new tenant-scoped tables introduced by
// `20260426100000_budgeting_modeling_foundation` gets a cross-tenant leakage
// test: seed a row as Tenant A, authenticate as Tenant B under a non-
// BYPASSRLS role, assert SELECT returns 0 rows and write attempts are
// silently blocked (or rejected by WITH CHECK on INSERT).

const TENANT_A_ID = 'cb000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'cb000002-0002-4002-8002-000000000002';
const USER_A_ID = 'cb000003-0003-4003-8003-000000000003';
const USER_B_ID = 'cb000004-0004-4004-8004-000000000004';
const RLS_TEST_ROLE = 'rls_budgeting_foundation_test_user';

// ─── Suite ───────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('budgeting foundation — RLS leakage (database layer)', () => {
  let prisma: PrismaClient;
  let financialModelAId: string;
  let scenarioAId: string;
  let lineItemAId: string;
  let snapshotAId: string;
  let eventBudgetAId: string;
  let eventBudgetScenarioAId: string;
  let varianceCacheAId: string;
  let shareableLinkAId: string;
  let preferencesAId: string;

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
    // Cascades from financial_models → scenarios, line_items, snapshots,
    // variance_cache, shareable_links. Cascade from event_budgets →
    // event_budget_scenarios. So the explicit deletes below are belt-and-
    // braces for the case where an earlier run failed mid-flight.
    await prisma.$executeRawUnsafe(
      `DELETE FROM budgeting_tenant_preferences WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM shareable_links WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM variance_cache WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM event_budget_scenarios WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM financial_model_line_items WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM event_budgets WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM financial_model_snapshots WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM scenarios WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM financial_models WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
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

    await prisma.tenant.upsert({
      where: { id: TENANT_A_ID },
      create: {
        id: TENANT_A_ID,
        name: 'RLS Budgeting Tenant A',
        slug: 'rls-budgeting-a',
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
        name: 'RLS Budgeting Tenant B',
        slug: 'rls-budgeting-b',
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
        email: 'rls-budgeting-user-a@test.local',
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
        email: 'rls-budgeting-user-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'User',
        global_status: 'active',
      },
      update: {},
    });

    // ── Tenant A fixtures in every new table ──────────────────────────────

    const modelA = await prisma.financialModel.create({
      data: {
        tenant_id: TENANT_A_ID,
        name: 'RLS Tenant A — FY 2026/27',
        fiscal_year_start: new Date('2026-09-01'),
        fiscal_year_end: new Date('2027-08-31'),
        horizon_years: 1,
        drivers: {},
        source_snapshot_json: {},
        status: 'draft',
        created_by: USER_A_ID,
      },
    });
    financialModelAId = modelA.id;

    const scenarioA = await prisma.scenario.create({
      data: {
        tenant_id: TENANT_A_ID,
        parent_model_id: financialModelAId,
        name: 'Cautious',
        position: 0,
        driver_overrides: {},
      },
    });
    scenarioAId = scenarioA.id;

    const lineItemA = await prisma.financialModelLineItem.create({
      data: {
        tenant_id: TENANT_A_ID,
        parent_model_id: financialModelAId,
        scenario_id: null,
        category: 'income',
        subcategory: 'Tuition (gross)',
        name: 'Tuition (gross)',
        fiscal_year: 1,
        source: 'driver_derived',
        amount: '1234567.89',
      },
    });
    lineItemAId = lineItemA.id;

    const snapshotA = await prisma.financialModelSnapshot.create({
      data: {
        tenant_id: TENANT_A_ID,
        parent_model_id: financialModelAId,
        version_number: 1,
        payload: { sentinel: 'tenant_a_snapshot' },
        published_by: USER_A_ID,
      },
    });
    snapshotAId = snapshotA.id;

    const eventBudgetA = await prisma.eventBudget.create({
      data: {
        tenant_id: TENANT_A_ID,
        name: 'RLS Tenant A — Class 2A Trip',
        event_type: 'trip',
        participant_count: 24,
        drivers: {},
        status: 'draft',
        created_by: USER_A_ID,
      },
    });
    eventBudgetAId = eventBudgetA.id;

    const eventBudgetScenarioA = await prisma.eventBudgetScenario.create({
      data: {
        tenant_id: TENANT_A_ID,
        parent_event_budget_id: eventBudgetAId,
        name: 'Group discount',
        position: 0,
        driver_overrides: {},
      },
    });
    eventBudgetScenarioAId = eventBudgetScenarioA.id;

    const varianceCacheA = await prisma.varianceCache.create({
      data: {
        tenant_id: TENANT_A_ID,
        parent_model_id: financialModelAId,
        snapshot_id: snapshotAId,
        period_type: 'month',
        period_label: 'Sep 2026',
        line_item_key: 'income.tuition_gross',
        planned: '100000.00',
        actual: '102345.67',
        variance: '2345.67',
        variance_pct: '2.35',
      },
    });
    varianceCacheAId = varianceCacheA.id;

    const shareableLinkA = await prisma.shareableLink.create({
      data: {
        tenant_id: TENANT_A_ID,
        token: 'cb000099-0099-4099-8099-000000000099',
        parent_model_id: financialModelAId,
        parent_snapshot_id: snapshotAId,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        scenarios_visible: ['base'],
        created_by: USER_A_ID,
      },
    });
    shareableLinkAId = shareableLinkA.id;

    const preferencesA = await prisma.budgetingTenantPreferences.create({
      data: {
        tenant_id: TENANT_A_ID,
        default_horizon_years: 3,
        hidden_kpi_keys: ['breakeven_students'],
      },
    });
    preferencesAId = preferencesA.id;

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
      console.error('[budgeting-foundation RLS role cleanup]', err);
    }

    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  describe('financial_models', () => {
    it('SELECT as Tenant A sees only its own model', async () => {
      const rows = await queryAsTenant<{ tenant_id: string }>(
        TENANT_A_ID,
        `SELECT tenant_id::text FROM financial_models`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) expect(row.tenant_id).toBe(TENANT_A_ID);
    });

    it('SELECT as Tenant B with Tenant A model id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM financial_models WHERE id = '${financialModelAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('UPDATE as Tenant B targeting Tenant A model leaves it unchanged', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE financial_models SET name = 'HACKED' WHERE id = '${financialModelAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM financial_models WHERE id = '${financialModelAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe('RLS Tenant A — FY 2026/27');
    });

    it('INSERT as Tenant B with Tenant A tenant_id is rejected by WITH CHECK', async () => {
      const sneakModelId = 'cb000099-0099-4099-8099-000000000098';
      await expect(
        mutateAsTenant(
          TENANT_B_ID,
          `INSERT INTO financial_models
              (id, tenant_id, name, fiscal_year_start, fiscal_year_end,
               drivers, source_snapshot_json, created_by)
           VALUES
              ('${sneakModelId}'::uuid, '${TENANT_A_ID}'::uuid,
               'sneaky', '2026-09-01', '2027-08-31',
               '{}'::jsonb, '{}'::jsonb, '${USER_A_ID}'::uuid)`,
        ),
      ).rejects.toThrow();
    });
  });

  describe('scenarios', () => {
    it('SELECT as Tenant B with Tenant A scenario id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM scenarios WHERE id = '${scenarioAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('DELETE as Tenant B targeting Tenant A scenario leaves it intact', async () => {
      await mutateAsTenant(TENANT_B_ID, `DELETE FROM scenarios WHERE id = '${scenarioAId}'::uuid`);
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text FROM scenarios WHERE id = '${scenarioAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('financial_model_line_items', () => {
    it('SELECT as Tenant B with Tenant A line item id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM financial_model_line_items WHERE id = '${lineItemAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('UPDATE as Tenant B targeting Tenant A line item leaves amount unchanged', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE financial_model_line_items SET amount = 0 WHERE id = '${lineItemAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ amount: string }>>(
        `SELECT amount::text FROM financial_model_line_items WHERE id = '${lineItemAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.amount).toBe('1234567.89');
    });
  });

  describe('financial_model_snapshots', () => {
    it('SELECT as Tenant B with Tenant A snapshot id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM financial_model_snapshots WHERE id = '${snapshotAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('UPDATE as Tenant B targeting Tenant A snapshot leaves payload sentinel intact', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE financial_model_snapshots
            SET payload = '{"sentinel": "HACKED"}'::jsonb
            WHERE id = '${snapshotAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ payload: { sentinel?: string } }>>(
        `SELECT payload FROM financial_model_snapshots WHERE id = '${snapshotAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.payload.sentinel).toBe('tenant_a_snapshot');
    });
  });

  describe('event_budgets', () => {
    it('SELECT as Tenant B with Tenant A event budget id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM event_budgets WHERE id = '${eventBudgetAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('UPDATE as Tenant B targeting Tenant A event budget leaves name unchanged', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE event_budgets SET name = 'HACKED' WHERE id = '${eventBudgetAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM event_budgets WHERE id = '${eventBudgetAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe('RLS Tenant A — Class 2A Trip');
    });
  });

  describe('event_budget_scenarios', () => {
    it('SELECT as Tenant B with Tenant A scenario id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM event_budget_scenarios WHERE id = '${eventBudgetScenarioAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('DELETE as Tenant B targeting Tenant A event scenario leaves it intact', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `DELETE FROM event_budget_scenarios WHERE id = '${eventBudgetScenarioAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text FROM event_budget_scenarios WHERE id = '${eventBudgetScenarioAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('variance_cache', () => {
    it('SELECT as Tenant B with Tenant A row id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM variance_cache WHERE id = '${varianceCacheAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('UPDATE as Tenant B targeting Tenant A row leaves planned unchanged', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE variance_cache SET planned = 0 WHERE id = '${varianceCacheAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ planned: string }>>(
        `SELECT planned::text FROM variance_cache WHERE id = '${varianceCacheAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.planned).toBe('100000.00');
    });
  });

  describe('shareable_links', () => {
    it('SELECT as Tenant B with Tenant A link id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM shareable_links WHERE id = '${shareableLinkAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('UPDATE as Tenant B targeting Tenant A link leaves token unchanged', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE shareable_links
            SET token = '99999999-9999-4999-8999-999999999999'
            WHERE id = '${shareableLinkAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ token: string }>>(
        `SELECT token::text FROM shareable_links WHERE id = '${shareableLinkAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.token).toBe('cb000099-0099-4099-8099-000000000099');
    });
  });

  describe('budgeting_tenant_preferences', () => {
    it('SELECT as Tenant B with Tenant A prefs id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM budgeting_tenant_preferences WHERE id = '${preferencesAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('UPDATE as Tenant B targeting Tenant A prefs leaves default_horizon_years unchanged', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE budgeting_tenant_preferences
            SET default_horizon_years = 5
            WHERE id = '${preferencesAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ default_horizon_years: number }>>(
        `SELECT default_horizon_years FROM budgeting_tenant_preferences WHERE id = '${preferencesAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.default_horizon_years).toBe(3);
    });

    it('INSERT as Tenant B with Tenant A tenant_id is rejected by WITH CHECK', async () => {
      const sneakPrefsId = 'cb000099-0099-4099-8099-000000000097';
      await expect(
        mutateAsTenant(
          TENANT_B_ID,
          `INSERT INTO budgeting_tenant_preferences (id, tenant_id) VALUES ('${sneakPrefsId}'::uuid, '${TENANT_A_ID}'::uuid)`,
        ),
      ).rejects.toThrow();
    });
  });

  // Hush the unused-binding check — the IDs are referenced implicitly via
  // cleanupTestData's cascades and the per-test verification queries.
  it('fixtures were seeded as expected (sanity)', () => {
    expect(financialModelAId).toMatch(/^[0-9a-f-]{36}$/);
    expect(scenarioAId).toMatch(/^[0-9a-f-]{36}$/);
    expect(lineItemAId).toMatch(/^[0-9a-f-]{36}$/);
    expect(snapshotAId).toMatch(/^[0-9a-f-]{36}$/);
    expect(eventBudgetAId).toMatch(/^[0-9a-f-]{36}$/);
    expect(eventBudgetScenarioAId).toMatch(/^[0-9a-f-]{36}$/);
    expect(varianceCacheAId).toMatch(/^[0-9a-f-]{36}$/);
    expect(shareableLinkAId).toMatch(/^[0-9a-f-]{36}$/);
    expect(preferencesAId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
