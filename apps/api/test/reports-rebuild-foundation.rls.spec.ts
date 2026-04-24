/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Each of the five new tenant-scoped tables introduced by
// `20260425100000_reports_rebuild_foundation` gets a cross-tenant leakage
// test: seed a row as Tenant A, authenticate as Tenant B under a non-
// BYPASSRLS role, assert SELECT returns 0 rows and write attempts are
// silently blocked.

const TENANT_A_ID = 'ce000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'ce000002-0002-4002-8002-000000000002';
const USER_A_ID = 'ce000003-0003-4003-8003-000000000003';
const USER_B_ID = 'ce000004-0004-4004-8004-000000000004';
const RLS_TEST_ROLE = 'rls_reports_rebuild_test_user';

// ─── Suite ───────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('reports rebuild foundation — RLS leakage (database layer)', () => {
  let prisma: PrismaClient;
  let savedReportAId: string;
  let savedReportDraftAId: string;
  let scheduledReportAId: string;
  let scheduledReportRunAId: string;
  let reportAlertAId: string;
  let reportAlertRunAId: string;
  let reportShareLogAId: string;
  let kpiPrefsAId: string;

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
    // report_share_log references saved_reports by FK cascade, so this
    // order is fine — cascades take care of the detail rows.
    await prisma.$executeRawUnsafe(
      `DELETE FROM reports_kpi_tenant_preferences WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_share_log WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_alert_runs WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM scheduled_report_runs WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM saved_report_drafts WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_alerts WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM scheduled_reports WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM saved_reports WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
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
        name: 'RLS Reports Tenant A',
        slug: 'rls-reports-a',
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
        name: 'RLS Reports Tenant B',
        slug: 'rls-reports-b',
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
        email: 'rls-reports-user-a@test.local',
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
        email: 'rls-reports-user-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'User',
        global_status: 'active',
      },
      update: {},
    });

    // ── Tenant A fixtures in every new table ──────────────────────────────

    const savedReportA = await prisma.savedReport.create({
      data: {
        tenant_id: TENANT_A_ID,
        name: 'RLS Tenant A — saved report',
        data_source: 'students',
        dimensions_json: {},
        measures_json: {},
        filters_json: {},
        visibility: 'private',
        created_by_user_id: USER_A_ID,
      },
    });
    savedReportAId = savedReportA.id;

    const draftA = await prisma.savedReportDraft.create({
      data: {
        tenant_id: TENANT_A_ID,
        user_id: USER_A_ID,
        subject_key: 'student',
        columns_json: { field_ids: ['student.identity.first_name'] },
      },
    });
    savedReportDraftAId = draftA.id;

    const scheduledReportA = await prisma.scheduledReport.create({
      data: {
        tenant_id: TENANT_A_ID,
        name: 'RLS Tenant A — scheduled',
        report_type: 'custom',
        parameters_json: {},
        schedule_cron: '0 9 * * 1',
        recipient_emails: ['owner@rls-reports-a.test'],
        format: 'pdf',
        active: true,
        created_by_user_id: USER_A_ID,
      },
    });
    scheduledReportAId = scheduledReportA.id;

    const scheduledReportRunA = await prisma.scheduledReportRun.create({
      data: {
        tenant_id: TENANT_A_ID,
        scheduled_report_id: scheduledReportAId,
        status: 'succeeded',
        row_count: 1,
      },
    });
    scheduledReportRunAId = scheduledReportRunA.id;

    const reportAlertA = await prisma.reportAlert.create({
      data: {
        tenant_id: TENANT_A_ID,
        name: 'RLS Tenant A — alert',
        metric: 'attendance.rate',
        operator: '<',
        threshold: 0.85,
        check_frequency: 'daily',
        notification_recipients_json: [],
        active: true,
        created_by_user_id: USER_A_ID,
      },
    });
    reportAlertAId = reportAlertA.id;

    const reportAlertRunA = await prisma.reportAlertRun.create({
      data: {
        tenant_id: TENANT_A_ID,
        report_alert_id: reportAlertAId,
        outcome: 'ok',
        measured_value: 0.92,
        threshold_value: 0.85,
      },
    });
    reportAlertRunAId = reportAlertRunA.id;

    const shareA = await prisma.reportShareLog.create({
      data: {
        tenant_id: TENANT_A_ID,
        saved_report_id: savedReportAId,
        shared_by: USER_A_ID,
        format: 'pdf',
        recipients_json: { user_ids: [], role_keys: ['school_principal'] },
      },
    });
    reportShareLogAId = shareA.id;

    const prefsA = await prisma.reportsKpiTenantPreferences.create({
      data: {
        tenant_id: TENANT_A_ID,
        hidden_kpi_keys: ['parent_escalations'],
      },
    });
    kpiPrefsAId = prefsA.id;

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
      console.error('[reports-rebuild-foundation RLS role cleanup]', err);
    }

    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  describe('saved_report_drafts', () => {
    it('SELECT as Tenant A sees only its own draft', async () => {
      const rows = await queryAsTenant<{ tenant_id: string }>(
        TENANT_A_ID,
        `SELECT tenant_id::text FROM saved_report_drafts`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) expect(row.tenant_id).toBe(TENANT_A_ID);
    });

    it('SELECT as Tenant B with Tenant A draft id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM saved_report_drafts WHERE id = '${savedReportDraftAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('UPDATE as Tenant B targeting Tenant A draft leaves it unchanged', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE saved_report_drafts SET subject_key = 'HACKED' WHERE id = '${savedReportDraftAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ subject_key: string }>>(
        `SELECT subject_key FROM saved_report_drafts WHERE id = '${savedReportDraftAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.subject_key).toBe('student');
    });
  });

  describe('scheduled_report_runs', () => {
    it('SELECT as Tenant B with Tenant A run id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM scheduled_report_runs WHERE id = '${scheduledReportRunAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('DELETE as Tenant B targeting Tenant A run leaves it intact', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `DELETE FROM scheduled_report_runs WHERE id = '${scheduledReportRunAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text FROM scheduled_report_runs WHERE id = '${scheduledReportRunAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('report_alert_runs', () => {
    it('SELECT as Tenant B with Tenant A run id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM report_alert_runs WHERE id = '${reportAlertRunAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('DELETE as Tenant B targeting Tenant A run leaves it intact', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `DELETE FROM report_alert_runs WHERE id = '${reportAlertRunAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text FROM report_alert_runs WHERE id = '${reportAlertRunAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('report_share_log', () => {
    it('SELECT as Tenant B with Tenant A share id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM report_share_log WHERE id = '${reportShareLogAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('UPDATE as Tenant B targeting Tenant A share leaves message_body unchanged', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE report_share_log SET message_body = 'HACKED' WHERE id = '${reportShareLogAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ message_body: string | null }>>(
        `SELECT message_body FROM report_share_log WHERE id = '${reportShareLogAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.message_body).toBeNull();
    });
  });

  describe('reports_kpi_tenant_preferences', () => {
    it('SELECT as Tenant B with Tenant A prefs id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM reports_kpi_tenant_preferences WHERE id = '${kpiPrefsAId}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('UPDATE as Tenant B targeting Tenant A prefs leaves hidden_kpi_keys unchanged', async () => {
      await mutateAsTenant(
        TENANT_B_ID,
        `UPDATE reports_kpi_tenant_preferences SET hidden_kpi_keys = ARRAY['hacked'] WHERE id = '${kpiPrefsAId}'::uuid`,
      );
      const rows = await prisma.$queryRawUnsafe<Array<{ hidden_kpi_keys: string[] }>>(
        `SELECT hidden_kpi_keys FROM reports_kpi_tenant_preferences WHERE id = '${kpiPrefsAId}'::uuid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.hidden_kpi_keys).toEqual(['parent_escalations']);
    });
  });

  // Hush the unused-binding check — the IDs are referenced implicitly via
  // cleanupTestData's cascades and the test's setup verification.
  it('fixtures were seeded as expected (sanity)', () => {
    expect(savedReportAId).toMatch(/^[0-9a-f-]{36}$/);
    expect(scheduledReportAId).toMatch(/^[0-9a-f-]{36}$/);
    expect(reportAlertAId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
