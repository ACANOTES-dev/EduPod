/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import '../setup-env';

import { PrismaClient } from '@prisma/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// One Tenant A row per new table is created, then queried/updated as Tenant B.
// All five tables introduced by Implementation 01 are exercised here:
//   1. report_comment_windows
//   2. report_card_subject_comments
//   3. report_card_overall_comments
//   4. report_card_teacher_requests
//   5. report_card_tenant_settings

const TENANT_A_ID = 'b6000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'b6000002-0002-4002-8002-000000000002';
const USER_A_ID = 'b6000003-0003-4003-8003-000000000003';
const USER_B_ID = 'b6000004-0004-4004-8004-000000000004';
const HOUSEHOLD_A_ID = 'b6000005-0005-4005-8005-000000000005';
const STUDENT_A_ID = 'b6000006-0006-4006-8006-000000000006';
const ACAD_YEAR_A_ID = 'b6000007-0007-4007-8007-000000000007';
const ACAD_PERIOD_A_ID = 'b6000008-0008-4008-8008-000000000008';
const SUBJECT_A_ID = 'b6000009-0009-4009-8009-000000000009';
const CLASS_A_ID = 'b600000a-000a-400a-800a-00000000000a';

const RLS_TEST_ROLE = 'rls_report_cards_redesign_test_user';

// ─── Suite ───────────────────────────────────────────────────────────────────

jest.setTimeout(60_000);

describe('Report Cards Redesign — RLS leakage (database layer)', () => {
  let prisma: PrismaClient;

  let commentWindowAId: string;
  let subjectCommentAId: string;
  let overallCommentAId: string;
  let teacherRequestAId: string;
  let tenantSettingsAId: string;

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
    // Order matters — children before parents
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_teacher_requests WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_comment_windows WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_subject_comments WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_overall_comments WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_tenant_settings WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM class_enrolments WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM classes WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM subjects WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_periods WHERE tenant_id IN ('${TENANT_A_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
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

    await cleanupTestData();

    // ── Tenants ────────────────────────────────────────────────────────────
    await prisma.tenant.upsert({
      where: { id: TENANT_A_ID },
      create: {
        id: TENANT_A_ID,
        name: 'RLS RC Redesign Tenant A',
        slug: 'rls-rcr-a',
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
        name: 'RLS RC Redesign Tenant B',
        slug: 'rls-rcr-b',
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
      update: {},
    });

    // ── Users (platform-level) ────────────────────────────────────────────
    await prisma.user.upsert({
      where: { id: USER_A_ID },
      create: {
        id: USER_A_ID,
        email: 'rls-rcr-a@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'UserA',
        global_status: 'active',
      },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: USER_B_ID },
      create: {
        id: USER_B_ID,
        email: 'rls-rcr-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'UserB',
        global_status: 'active',
      },
      update: {},
    });

    // ── Tenant A prerequisites ────────────────────────────────────────────
    await prisma.household.upsert({
      where: { id: HOUSEHOLD_A_ID },
      create: { id: HOUSEHOLD_A_ID, tenant_id: TENANT_A_ID, household_name: 'RLS RCR HH' },
      update: {},
    });

    await prisma.student.upsert({
      where: { id: STUDENT_A_ID },
      create: {
        id: STUDENT_A_ID,
        tenant_id: TENANT_A_ID,
        household_id: HOUSEHOLD_A_ID,
        first_name: 'RLS',
        last_name: 'StudentA',
        date_of_birth: new Date('2012-01-01'),
        status: 'active',
      },
      update: {},
    });

    await prisma.academicYear.upsert({
      where: { id: ACAD_YEAR_A_ID },
      create: {
        id: ACAD_YEAR_A_ID,
        tenant_id: TENANT_A_ID,
        name: '2025-2026',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2026-06-30'),
        status: 'active',
      },
      update: {},
    });

    await prisma.academicPeriod.upsert({
      where: { id: ACAD_PERIOD_A_ID },
      create: {
        id: ACAD_PERIOD_A_ID,
        tenant_id: TENANT_A_ID,
        academic_year_id: ACAD_YEAR_A_ID,
        name: 'Term 1',
        period_type: 'term',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2025-12-20'),
        status: 'active',
      },
      update: {},
    });

    await prisma.subject.upsert({
      where: { id: SUBJECT_A_ID },
      create: {
        id: SUBJECT_A_ID,
        tenant_id: TENANT_A_ID,
        name: 'Mathematics',
      },
      update: {},
    });

    await prisma.class.upsert({
      where: { id: CLASS_A_ID },
      create: {
        id: CLASS_A_ID,
        tenant_id: TENANT_A_ID,
        academic_year_id: ACAD_YEAR_A_ID,
        name: 'Year 4 Maths',
        status: 'active',
      },
      update: {},
    });

    // ── Tenant A: one row per new table ────────────────────────────────────
    const window = await prisma.reportCommentWindow.create({
      data: {
        tenant_id: TENANT_A_ID,
        academic_period_id: ACAD_PERIOD_A_ID,
        academic_year_id: ACAD_YEAR_A_ID,
        opens_at: new Date('2026-04-01T08:00:00Z'),
        closes_at: new Date('2026-04-08T17:00:00Z'),
        opened_by_user_id: USER_A_ID,
        instructions: 'Tenant A window',
      },
    });
    commentWindowAId = window.id;

    const subjComment = await prisma.reportCardSubjectComment.create({
      data: {
        tenant_id: TENANT_A_ID,
        student_id: STUDENT_A_ID,
        subject_id: SUBJECT_A_ID,
        class_id: CLASS_A_ID,
        academic_period_id: ACAD_PERIOD_A_ID,
        academic_year_id: ACAD_YEAR_A_ID,
        author_user_id: USER_A_ID,
        comment_text: 'Tenant A subject comment',
      },
    });
    subjectCommentAId = subjComment.id;

    const overall = await prisma.reportCardOverallComment.create({
      data: {
        tenant_id: TENANT_A_ID,
        student_id: STUDENT_A_ID,
        class_id: CLASS_A_ID,
        academic_period_id: ACAD_PERIOD_A_ID,
        academic_year_id: ACAD_YEAR_A_ID,
        author_user_id: USER_A_ID,
        comment_text: 'Tenant A overall comment',
      },
    });
    overallCommentAId = overall.id;

    const teacherRequest = await prisma.reportCardTeacherRequest.create({
      data: {
        tenant_id: TENANT_A_ID,
        requested_by_user_id: USER_A_ID,
        request_type: 'open_comment_window',
        academic_period_id: ACAD_PERIOD_A_ID,
        academic_year_id: ACAD_YEAR_A_ID,
        reason: 'Tenant A request',
      },
    });
    teacherRequestAId = teacherRequest.id;

    const settings = await prisma.reportCardTenantSettings.create({
      data: {
        tenant_id: TENANT_A_ID,
        settings_json: { matrix_display_mode: 'grade', show_top_rank_badge: false },
      },
    });
    tenantSettingsAId = settings.id;

    // ── Create non-BYPASSRLS role for cross-tenant queries ────────────────
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
      console.error('[report cards redesign RLS role cleanup]', err);
    }
    await prisma.$disconnect();
  });

  // ─── Per-table tests ───────────────────────────────────────────────────────

  describe.each([
    ['report_comment_windows', () => commentWindowAId, 'instructions'],
    ['report_card_subject_comments', () => subjectCommentAId, 'comment_text'],
    ['report_card_overall_comments', () => overallCommentAId, 'comment_text'],
    ['report_card_teacher_requests', () => teacherRequestAId, 'reason'],
    ['report_card_tenant_settings', () => tenantSettingsAId, null as null | string],
  ])('%s', (table, getId, mutableTextColumn) => {
    it('SELECT as Tenant A returns Tenant A rows only', async () => {
      const rows = await queryAsTenant<{ id: string; tenant_id: string }>(
        TENANT_A_ID,
        `SELECT id::text, tenant_id::text FROM ${table}`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const row of rows) {
        expect(row.tenant_id).toBe(TENANT_A_ID);
      }
    });

    it('SELECT as Tenant B with Tenant A row id returns 0 rows', async () => {
      const rows = await queryAsTenant<{ id: string }>(
        TENANT_B_ID,
        `SELECT id::text FROM ${table} WHERE id = '${getId()}'::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    if (mutableTextColumn !== null) {
      it('UPDATE as Tenant B targeting Tenant A row leaves it unchanged', async () => {
        await mutateAsTenant(
          TENANT_B_ID,
          `UPDATE ${table} SET ${mutableTextColumn} = 'HACKED' WHERE id = '${getId()}'::uuid`,
        );

        const rows = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
          `SELECT ${mutableTextColumn} FROM ${table} WHERE id = '${getId()}'::uuid`,
        );
        expect(rows).toHaveLength(1);
        const value = rows[0]?.[mutableTextColumn];
        expect(value).not.toBe('HACKED');
      });
    }

    it('DELETE as Tenant B targeting Tenant A row leaves it intact', async () => {
      await mutateAsTenant(TENANT_B_ID, `DELETE FROM ${table} WHERE id = '${getId()}'::uuid`);

      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id::text FROM ${table} WHERE id = '${getId()}'::uuid`,
      );
      expect(rows).toHaveLength(1);
    });
  });
});
