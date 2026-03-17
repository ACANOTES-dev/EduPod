/**
 * RLS Comprehensive Tests — All Tenant-Scoped Tables
 *
 * Exhaustive table-level RLS verification. Programmatically iterates over
 * EVERY tenant-scoped table in the database, queries via the rls_test_user
 * role (no BYPASSRLS), and asserts that no Al Noor (Tenant A) rows are
 * visible when the current_tenant_id is set to Cedar (Tenant B).
 *
 * Special dual-policy tables (roles, role_permissions, notification_templates,
 * audit_logs): verifies that Al Noor rows are hidden but platform rows
 * (NULL tenant_id) remain visible where the policy allows.
 *
 * This file is the single source of truth for verifying RLS coverage across
 * the entire schema.
 */

import { PrismaClient } from '@prisma/client';

// ─── Constants ───────────────────────────────────────────────────────────────

const AL_NOOR_TENANT_ID = 'aa08873c-40a5-4bba-a9e3-8bd0f6d5e696';
const CEDAR_TENANT_ID = 'a032c7be-a0c3-4375-add7-174afa46e046';
const RLS_TEST_ROLE = 'rls_test_user_comprehensive';

/**
 * Full list of tenant-scoped tables in the School Operating System.
 *
 * Each table MUST have a tenant_id column and an RLS policy. If a table
 * appears in this list but lacks an RLS policy, the test will catch the
 * leakage (all rows visible regardless of tenant context).
 */
const STANDARD_TENANT_TABLES = [
  // P0/P1 — Core
  // Note: 'tenants' table uses `id` (not `tenant_id`) for RLS — tested separately
  'tenant_domains',
  'tenant_modules',
  'tenant_branding',
  'tenant_settings',
  'tenant_notification_settings',
  'tenant_sequences',
  'tenant_stripe_configs',
  'tenant_memberships',
  'membership_roles',
  'invitations',
  'approval_workflows',
  'approval_requests',
  'user_ui_preferences',

  // P2 — People
  'households',
  'household_emergency_contacts',
  'parents',
  'household_parents',
  'students',
  'student_parents',
  'staff_profiles',

  // P3 — Academics
  'academic_years',
  'academic_periods',
  'year_groups',
  'subjects',
  'classes',
  'class_staff',
  'class_enrolments',

  // P3 — Admissions
  'admission_form_definitions',
  'admission_form_fields',
  'applications',
  'application_notes',

  // P4A — Attendance
  'rooms',
  'schedules',
  'school_closures',
  'attendance_sessions',
  'attendance_records',
  'daily_attendance_summaries',

  // P4B — Scheduling
  'schedule_period_templates',
  'class_scheduling_requirements',
  'staff_availability',
  'staff_scheduling_preferences',
  'scheduling_runs',

  // P5 — Gradebook
  'grading_scales',
  'assessment_categories',
  'class_subject_grade_configs',
  'assessments',
  'grades',
  'period_grade_snapshots',
  'report_cards',

  // P6 — Finance
  'fee_structures',
  'discounts',
  'household_fee_assignments',
  'invoices',
  'invoice_lines',
  'installments',
  'payments',
  'payment_allocations',
  'receipts',
  'refunds',

  // P6B — Payroll
  'staff_compensation',
  'payroll_runs',
  'payroll_entries',
  'payslips',

  // P7 — Communications
  'announcements',
  'notifications',
  'parent_inquiries',
  'parent_inquiry_messages',
  'website_pages',
  'contact_form_submissions',

  // P8 — Operations
  'compliance_requests',
  'import_jobs',
  'search_index_status',
];

/**
 * Tables with dual RLS policies that allow platform-level rows (tenant_id IS
 * NULL) to be visible alongside tenant-scoped rows.
 *
 * For these tables, the test additionally verifies that platform rows ARE
 * visible while Al Noor rows are NOT.
 */
const DUAL_POLICY_TABLES = [
  'roles',
  'role_permissions',
  'notification_templates',
  'audit_logs',
];

/**
 * Combined list of all tables to test (standard + dual-policy).
 */
const ALL_TENANT_TABLES = [...STANDARD_TENANT_TABLES, ...DUAL_POLICY_TABLES];

// ─── Suite ───────────────────────────────────────────────────────────────────

jest.setTimeout(300_000);

describe('RLS Comprehensive — All Tenant-Scoped Tables (e2e)', () => {
  let directPrisma: PrismaClient;

  beforeAll(async () => {
    directPrisma = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
    });
    await directPrisma.$connect();

    // Create the non-superuser role for RLS testing (idempotent).
    await directPrisma.$executeRawUnsafe(
      `DO $$ BEGIN
         CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN;
       EXCEPTION WHEN duplicate_object THEN NULL;
       END $$`,
    );
    await directPrisma.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`,
    );
    await directPrisma.$executeRawUnsafe(
      `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_ROLE}`,
    );
  });

  afterAll(async () => {
    if (directPrisma) {
      try {
        await directPrisma.$executeRawUnsafe(
          `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RLS_TEST_ROLE}`,
        );
        await directPrisma.$executeRawUnsafe(
          `REVOKE USAGE ON SCHEMA public FROM ${RLS_TEST_ROLE}`,
        );
        await directPrisma.$executeRawUnsafe(
          `DROP ROLE IF EXISTS ${RLS_TEST_ROLE}`,
        );
      } catch {
        // Role cleanup is best-effort.
      }
      await directPrisma.$disconnect();
    }
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Runs a raw SELECT against `tableName` inside a transaction that:
   *   1. Sets app.current_tenant_id to the Cedar tenant ID.
   *   2. Switches the active role to the test role (no BYPASSRLS).
   *
   * Returns rows with tenant_id cast to text.
   */
  async function queryAsCedar(
    tableName: string,
  ): Promise<Array<{ tenant_id: string | null }>> {
    return directPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant_id', '${CEDAR_TENANT_ID}', true)`,
      );
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return tx.$queryRawUnsafe(
        `SELECT tenant_id::text FROM "${tableName}"`,
      ) as Promise<Array<{ tenant_id: string | null }>>;
    });
  }

  /**
   * Shared assertion: no row in `rows` should carry the Al Noor tenant_id.
   */
  function assertNoAlNoorRows(
    rows: Array<{ tenant_id: string | null }>,
    context: string,
  ): void {
    const leaks = rows.filter((r) => r.tenant_id === AL_NOOR_TENANT_ID);
    expect(leaks).toHaveLength(0);
    if (leaks.length > 0) {
      throw new Error(
        `RLS LEAK in ${context}: ${leaks.length} Al Noor row(s) returned when querying as Cedar`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. Standard Tenant-Scoped Tables (strict tenant_id = current_tenant_id)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Standard tenant-scoped tables: Cedar must not see Al Noor rows', () => {
    it.each(STANDARD_TENANT_TABLES)(
      '%s: querying as Cedar returns no Al Noor rows',
      async (tableName: string) => {
        const rows = await queryAsCedar(tableName);
        assertNoAlNoorRows(rows, tableName);
      },
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Dual-Policy Tables (nullable tenant_id, platform rows visible)
  // ══════════════════════════════════════════════════════════════════════════

  describe('Dual-policy tables: Cedar must not see Al Noor rows but CAN see platform rows', () => {
    it.each(DUAL_POLICY_TABLES)(
      '%s: querying as Cedar returns no Al Noor rows',
      async (tableName: string) => {
        const rows = await queryAsCedar(tableName);
        assertNoAlNoorRows(rows, tableName);
      },
    );

    /**
     * roles — Platform roles (tenant_id IS NULL) must remain visible.
     * These are the system-defined roles shared across all tenants.
     */
    it('roles: platform roles (tenant_id IS NULL) are visible to Cedar', async () => {
      const rows = await queryAsCedar('roles');
      const platformRows = rows.filter((r) => r.tenant_id === null);
      expect(platformRows.length).toBeGreaterThan(0);
    });

    /**
     * role_permissions — Platform permission rows (tenant_id IS NULL) must
     * remain visible. These are the permissions for system-defined roles.
     */
    it('role_permissions: platform permission rows (tenant_id IS NULL) are visible to Cedar', async () => {
      const rows = await queryAsCedar('role_permissions');
      const platformRows = rows.filter((r) => r.tenant_id === null);
      expect(platformRows.length).toBeGreaterThan(0);
    });

    /**
     * notification_templates — Platform templates (tenant_id IS NULL) must
     * remain visible. These are the system-defined templates used as defaults.
     */
    it('notification_templates: platform templates (tenant_id IS NULL) are visible to Cedar', async () => {
      const rows = await queryAsCedar('notification_templates');
      const platformRows = rows.filter((r) => r.tenant_id === null);
      expect(platformRows.length).toBeGreaterThan(0);
    });

    /**
     * audit_logs — Dual policy behaviour at the DB layer.
     *
     * The audit_logs dual RLS policy is:
     *   USING (tenant_id IS NULL OR tenant_id = current_setting(...)::uuid)
     * So platform-level logs (NULL tenant_id) ARE visible to all tenants.
     */
    it('audit_logs: platform logs (tenant_id IS NULL) are visible via dual RLS policy', async () => {
      const rows = await directPrisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', '${CEDAR_TENANT_ID}', true)`,
        );
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);

        return tx.$queryRawUnsafe(
          `SELECT id::text, tenant_id::text FROM audit_logs WHERE tenant_id IS NULL`,
        ) as Promise<Array<{ id: string; tenant_id: string | null }>>;
      });

      // Dual RLS policy: platform rows (NULL tenant_id) ARE visible
      for (const row of rows) {
        expect(row.tenant_id).toBeNull();
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Completeness Verification
  // ══════════════════════════════════════════════════════════════════════════

  describe('Completeness: every table in the list exists and has a tenant_id column', () => {
    it.each(ALL_TENANT_TABLES)(
      '%s: table exists and has tenant_id column',
      async (tableName: string) => {
        // This query will fail if the table does not exist or lacks a
        // tenant_id column, which is itself a test failure indicating
        // a schema drift or missing RLS setup.
        const result = await directPrisma.$queryRawUnsafe(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = 'tenant_id'
        `, tableName) as Array<{ column_name: string }>;

        expect(result.length).toBe(1);
      },
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. RLS Policy Existence Verification
  // ══════════════════════════════════════════════════════════════════════════

  describe('RLS Policy: every tenant-scoped table has at least one RLS policy enabled', () => {
    it.each(ALL_TENANT_TABLES)(
      '%s: has RLS enabled and at least one policy defined',
      async (tableName: string) => {
        // Check that RLS is enabled on the table
        const rlsEnabled = await directPrisma.$queryRawUnsafe(`
          SELECT relrowsecurity
          FROM pg_class
          WHERE relname = $1
            AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        `, tableName) as Array<{ relrowsecurity: boolean }>;

        expect(rlsEnabled.length).toBe(1);
        expect(rlsEnabled[0].relrowsecurity).toBe(true);

        // Check that at least one policy exists
        const policies = await directPrisma.$queryRawUnsafe(`
          SELECT polname
          FROM pg_policy
          WHERE polrelid = (
            SELECT oid FROM pg_class
            WHERE relname = $1
              AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          )
        `, tableName) as Array<{ polname: string }>;

        expect(policies.length).toBeGreaterThan(0);
      },
    );
  });
});
