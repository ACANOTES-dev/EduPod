/* eslint-disable school/no-raw-sql-outside-rls -- integration tests require direct SQL for setup/teardown */
/**
 * E2E tests for the Report Card generation-runs subsystem (impl 04).
 *
 * Boots the full Nest AppModule so the real DI graph, real PostgreSQL, and
 * the seeded tenant settings + templates from impl 01/03 all participate.
 * The BullMQ queue is overridden to capture enqueued jobs without a live
 * Redis. The worker processor itself is covered by its own unit spec.
 */
import '../setup-env';

import { getQueueToken } from '@nestjs/bullmq';
import { ForbiddenException, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { ReportCardGenerationService } from '../../src/modules/gradebook/report-cards/report-card-generation.service';

// Valid UUID v4 fixtures for the e2e suite. Each value is reused across
// setup / assertions so keep them distinct from other report-card e2e specs.
const TENANT_A = 'aaaa0004-0004-4004-8004-000000000004';
const TENANT_B = 'bbbb0004-0004-4004-8004-000000000004';
const USER_ID = 'aaaa0004-0004-4004-8004-000000000005';
const YEAR_GROUP_ID = 'aaaa0004-0004-4004-8004-000000000006';
const CLASS_ID = 'aaaa0004-0004-4004-8004-000000000007';
const STUDENT_A = 'aaaa0004-0004-4004-8004-000000000008';
const STUDENT_B = 'aaaa0004-0004-4004-8004-000000000009';
const HOUSEHOLD_ID = 'aaaa0004-0004-4004-8004-00000000000a';
const PARENT_ID = 'aaaa0004-0004-4004-8004-00000000000b';
const SUBJECT_ID = 'aaaa0004-0004-4004-8004-00000000000c';
const PERIOD_ID = 'aaaa0004-0004-4004-8004-00000000000d';
const ACADEMIC_YEAR_ID = 'aaaa0004-0004-4004-8004-00000000000e';

jest.setTimeout(90_000);

describe('Report Card generation runs (e2e) — impl 04', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let service: ReportCardGenerationService;
  const queueAdd = jest.fn().mockResolvedValue({ id: 'stub-job' });

  async function cleanup() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_overall_comments WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_subject_comments WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_batch_jobs WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_cards WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM period_grade_snapshots WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM class_enrolments WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM students WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM household_parents WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM parents WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM households WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM classes WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM year_groups WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM subjects WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_periods WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_years WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_templates WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_tenant_settings WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = '${USER_ID}'::uuid`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getQueueToken('gradebook'))
      .useValue({ add: queueAdd })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(ReportCardGenerationService);

    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    await cleanup();

    // ─── Seed: tenants, user, year group, class, students, period, subject ──
    await prisma.tenant.createMany({
      data: [
        {
          id: TENANT_A,
          name: 'Impl04 Runs Tenant A',
          slug: 'impl04-runs-tenant-a',
          default_locale: 'en',
          timezone: 'UTC',
          date_format: 'YYYY-MM-DD',
          currency_code: 'USD',
          academic_year_start_month: 9,
          status: 'active',
        },
        {
          id: TENANT_B,
          name: 'Impl04 Runs Tenant B',
          slug: 'impl04-runs-tenant-b',
          default_locale: 'en',
          timezone: 'UTC',
          date_format: 'YYYY-MM-DD',
          currency_code: 'USD',
          academic_year_start_month: 9,
          status: 'active',
        },
      ],
    });

    await prisma.user.create({
      data: {
        id: USER_ID,
        email: 'impl04-runs-admin@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'Impl04',
        last_name: 'Admin',
        global_status: 'active',
      },
    });

    await prisma.academicYear.create({
      data: {
        id: ACADEMIC_YEAR_ID,
        tenant_id: TENANT_A,
        name: '2025-2026',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2026-06-30'),
        status: 'active',
      },
    });

    await prisma.academicPeriod.create({
      data: {
        id: PERIOD_ID,
        tenant_id: TENANT_A,
        academic_year_id: ACADEMIC_YEAR_ID,
        name: 'Term 1',
        period_type: 'term',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2025-12-15'),
        status: 'active',
      },
    });

    await prisma.yearGroup.create({
      data: {
        id: YEAR_GROUP_ID,
        tenant_id: TENANT_A,
        name: 'Year 5',
        display_order: 5,
      },
    });

    await prisma.class.create({
      data: {
        id: CLASS_ID,
        tenant_id: TENANT_A,
        year_group_id: YEAR_GROUP_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        name: '5A',
        status: 'active',
      },
    });

    await prisma.subject.create({
      data: {
        id: SUBJECT_ID,
        tenant_id: TENANT_A,
        name: 'Mathematics',
        code: 'MATH',
      },
    });

    await prisma.household.create({
      data: {
        id: HOUSEHOLD_ID,
        tenant_id: TENANT_A,
        household_name: 'Impl04 Household',
        household_number: 'HH-001',
        status: 'active',
      },
    });

    await prisma.parent.create({
      data: {
        id: PARENT_ID,
        tenant_id: TENANT_A,
        first_name: 'Parent',
        last_name: 'One',
        preferred_contact_channels: [],
      },
    });

    await prisma.householdParent.create({
      data: {
        tenant_id: TENANT_A,
        household_id: HOUSEHOLD_ID,
        parent_id: PARENT_ID,
        role_label: 'billing',
      },
    });

    await prisma.student.createMany({
      data: [
        {
          id: STUDENT_A,
          tenant_id: TENANT_A,
          household_id: HOUSEHOLD_ID,
          first_name: 'Ali',
          last_name: 'Hassan',
          student_number: 'STU001',
          date_of_birth: new Date('2015-05-01'),
          status: 'active',
          year_group_id: YEAR_GROUP_ID,
          class_homeroom_id: CLASS_ID,
        },
        {
          id: STUDENT_B,
          tenant_id: TENANT_A,
          household_id: HOUSEHOLD_ID,
          first_name: 'Sara',
          last_name: 'Khan',
          student_number: 'STU002',
          date_of_birth: new Date('2015-08-15'),
          status: 'active',
          year_group_id: YEAR_GROUP_ID,
          class_homeroom_id: CLASS_ID,
          preferred_second_language: 'ar',
        },
      ],
    });

    await prisma.classEnrolment.createMany({
      data: [
        {
          tenant_id: TENANT_A,
          class_id: CLASS_ID,
          student_id: STUDENT_A,
          status: 'active',
          start_date: new Date('2025-09-01'),
        },
        {
          tenant_id: TENANT_A,
          class_id: CLASS_ID,
          student_id: STUDENT_B,
          status: 'active',
          start_date: new Date('2025-09-01'),
        },
      ],
    });

    // Period grade snapshots — one per (student, subject, period)
    await prisma.periodGradeSnapshot.createMany({
      data: [
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_A,
          class_id: CLASS_ID,
          subject_id: SUBJECT_ID,
          academic_period_id: PERIOD_ID,
          computed_value: 85,
          display_value: 'A',
          snapshot_at: new Date(),
        },
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_B,
          class_id: CLASS_ID,
          subject_id: SUBJECT_ID,
          academic_period_id: PERIOD_ID,
          computed_value: 75,
          display_value: 'B',
          snapshot_at: new Date(),
        },
      ],
    });

    // Impl 01 seeds default "Grades Only" templates for every tenant on first
    // touch; we force an English row here so resolveForGeneration always
    // finds something.
    await prisma.reportCardTemplate.create({
      data: {
        tenant_id: TENANT_A,
        name: 'Grades Only (E2E)',
        locale: 'en',
        is_default: true,
        content_scope: 'grades_only',
        sections_json: [],
        created_by_user_id: USER_ID,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(() => {
    queueAdd.mockClear();
  });

  afterEach(async () => {
    await prisma.reportCardBatchJob.deleteMany({ where: { tenant_id: TENANT_A } });
    await prisma.reportCardSubjectComment.deleteMany({ where: { tenant_id: TENANT_A } });
    await prisma.reportCardOverallComment.deleteMany({ where: { tenant_id: TENANT_A } });
  });

  // ─── dryRunCommentGate ───────────────────────────────────────────────────

  it('dryRunCommentGate flags missing comments and blocks when strict', async () => {
    const result = await service.dryRunCommentGate(TENANT_A, {
      scope: { mode: 'class', class_ids: [CLASS_ID] },
      academic_period_id: PERIOD_ID,
      content_scope: 'grades_only',
    });

    expect(result.students_total).toBe(2);
    expect(result.missing_subject_comments.length).toBe(2);
    expect(result.missing_overall_comments.length).toBe(2);
    // strict by default
    expect(result.would_block).toBe(true);
    // One student has ar flag but the seeded tenant has no ar template row
    expect(result.languages_preview.en).toBe(2);
    expect(result.languages_preview.ar).toBe(0);
  });

  it('dryRunCommentGate resolves year_group scope', async () => {
    const result = await service.dryRunCommentGate(TENANT_A, {
      scope: { mode: 'year_group', year_group_ids: [YEAR_GROUP_ID] },
      academic_period_id: PERIOD_ID,
      content_scope: 'grades_only',
    });

    expect(result.students_total).toBe(2);
  });

  // ─── generateRun ─────────────────────────────────────────────────────────

  it('generateRun blocks without override when strict mode and missing comments', async () => {
    await expect(
      service.generateRun(TENANT_A, USER_ID, {
        scope: { mode: 'class', class_ids: [CLASS_ID] },
        academic_period_id: PERIOD_ID,
        content_scope: 'grades_only',
        override_comment_gate: false,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('generateRun creates a batch job + enqueues when override is set', async () => {
    const result = await service.generateRun(TENANT_A, USER_ID, {
      scope: { mode: 'class', class_ids: [CLASS_ID] },
      academic_period_id: PERIOD_ID,
      content_scope: 'grades_only',
      override_comment_gate: true,
    });

    expect(result.batch_job_id).toBeTruthy();
    expect(queueAdd).toHaveBeenCalledTimes(1);

    const row = await prisma.reportCardBatchJob.findUnique({
      where: { id: result.batch_job_id },
    });
    expect(row).not.toBeNull();
    expect(row?.status).toBe('queued');
    expect(row?.total_count).toBe(2);
    expect(row?.scope_type).toBe('class');
    expect(row?.languages_requested).toEqual(['en']); // no ar template
  });

  it('generateRun SCOPE_EMPTY when no students resolve', async () => {
    await expect(
      service.generateRun(TENANT_A, USER_ID, {
        scope: { mode: 'individual', student_ids: ['11111111-1111-4111-8111-999999999999'] },
        academic_period_id: PERIOD_ID,
        content_scope: 'grades_only',
        override_comment_gate: true,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── listRuns / getRun ───────────────────────────────────────────────────

  it('listRuns returns created runs ordered by created_at desc', async () => {
    await service.generateRun(TENANT_A, USER_ID, {
      scope: { mode: 'class', class_ids: [CLASS_ID] },
      academic_period_id: PERIOD_ID,
      content_scope: 'grades_only',
      override_comment_gate: true,
    });

    const result = await service.listRuns(TENANT_A, { page: 1, pageSize: 20 });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.meta.total).toBeGreaterThan(0);
  });

  it('getRun returns the run summary; unknown id throws', async () => {
    const run = await service.generateRun(TENANT_A, USER_ID, {
      scope: { mode: 'class', class_ids: [CLASS_ID] },
      academic_period_id: PERIOD_ID,
      content_scope: 'grades_only',
      override_comment_gate: true,
    });

    const summary = await service.getRun(TENANT_A, run.batch_job_id);
    expect(summary.id).toBe(run.batch_job_id);
    expect(summary.scope_type).toBe('class');

    await expect(service.getRun(TENANT_A, '11111111-1111-4111-8111-999999999999')).rejects.toThrow(
      NotFoundException,
    );
  });

  // ─── Tenant isolation ────────────────────────────────────────────────────

  it('cross-tenant: Tenant B cannot see Tenant A runs', async () => {
    const run = await service.generateRun(TENANT_A, USER_ID, {
      scope: { mode: 'class', class_ids: [CLASS_ID] },
      academic_period_id: PERIOD_ID,
      content_scope: 'grades_only',
      override_comment_gate: true,
    });

    const listFromB = await service.listRuns(TENANT_B, { page: 1, pageSize: 20 });
    expect(listFromB.data.map((r) => r.id)).not.toContain(run.batch_job_id);

    await expect(service.getRun(TENANT_B, run.batch_job_id)).rejects.toThrow(NotFoundException);
  });
});
