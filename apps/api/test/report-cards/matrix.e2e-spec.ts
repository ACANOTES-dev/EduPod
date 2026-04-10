/* eslint-disable school/no-raw-sql-outside-rls -- integration tests require direct SQL for setup/teardown */
/**
 * E2E tests for the class-first report cards matrix endpoint (impl 06).
 *
 * Boots the full Nest AppModule so the real DI graph, real PostgreSQL, and
 * seeded tenants/templates all participate. The matrix query is driven
 * through `ReportCardsQueriesService.getClassMatrix` to exercise the full
 * path: class lookup, enrolments, subject config, snapshots, rank calc.
 */
import '../setup-env';

import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { ReportCardsQueriesService } from '../../src/modules/gradebook/report-cards/report-cards-queries.service';

// Valid UUID v4 fixtures scoped to impl 06 matrix e2e.
const TENANT_A = 'aaaa0006-1111-4111-8111-000000000001';
const TENANT_B = 'bbbb0006-1111-4111-8111-000000000002';
const USER_ID = 'aaaa0006-1111-4111-8111-000000000003';
const YEAR_GROUP_ID = 'aaaa0006-1111-4111-8111-000000000004';
const CLASS_ID = 'aaaa0006-1111-4111-8111-000000000005';
const ACADEMIC_YEAR_ID = 'aaaa0006-1111-4111-8111-000000000006';
const PERIOD_ID = 'aaaa0006-1111-4111-8111-000000000007';
const PERIOD_B_ID = 'aaaa0006-1111-4111-8111-000000000008';
const SUBJECT_A_ID = 'aaaa0006-1111-4111-8111-000000000009';
const SUBJECT_B_ID = 'aaaa0006-1111-4111-8111-00000000000a';
const GRADING_SCALE_ID = 'aaaa0006-1111-4111-8111-00000000001a';
const HOUSEHOLD_ID = 'aaaa0006-1111-4111-8111-00000000000b';
const STUDENT_A_ID = 'aaaa0006-1111-4111-8111-00000000000c';
const STUDENT_B_ID = 'aaaa0006-1111-4111-8111-00000000000d';
const STUDENT_C_ID = 'aaaa0006-1111-4111-8111-00000000000e';

jest.setTimeout(90_000);

describe('Report Cards matrix (e2e) — impl 06', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let service: ReportCardsQueriesService;

  async function cleanup() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM period_grade_snapshots WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM class_subject_grade_configs WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM grading_scales WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM class_enrolments WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM students WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
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
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = '${USER_ID}'::uuid`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(ReportCardsQueriesService);

    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    await cleanup();

    await prisma.tenant.createMany({
      data: [
        {
          id: TENANT_A,
          name: 'Impl06 Matrix Tenant A',
          slug: 'impl06-matrix-tenant-a',
          default_locale: 'en',
          timezone: 'UTC',
          date_format: 'YYYY-MM-DD',
          currency_code: 'USD',
          academic_year_start_month: 9,
          status: 'active',
        },
        {
          id: TENANT_B,
          name: 'Impl06 Matrix Tenant B',
          slug: 'impl06-matrix-tenant-b',
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
        email: 'impl06-matrix-admin@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'Impl06',
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

    await prisma.academicPeriod.createMany({
      data: [
        {
          id: PERIOD_ID,
          tenant_id: TENANT_A,
          academic_year_id: ACADEMIC_YEAR_ID,
          name: 'Term 1',
          period_type: 'term',
          start_date: new Date('2025-09-01'),
          end_date: new Date('2025-12-15'),
          status: 'active',
        },
        {
          id: PERIOD_B_ID,
          tenant_id: TENANT_A,
          academic_year_id: ACADEMIC_YEAR_ID,
          name: 'Term 2',
          period_type: 'term',
          start_date: new Date('2026-01-08'),
          end_date: new Date('2026-03-30'),
          status: 'active',
        },
      ],
    });

    await prisma.yearGroup.create({
      data: {
        id: YEAR_GROUP_ID,
        tenant_id: TENANT_A,
        name: 'Year 6',
        display_order: 6,
      },
    });

    await prisma.class.create({
      data: {
        id: CLASS_ID,
        tenant_id: TENANT_A,
        year_group_id: YEAR_GROUP_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        name: '6A',
        status: 'active',
        max_capacity: 25,
      },
    });

    await prisma.subject.createMany({
      data: [
        { id: SUBJECT_A_ID, tenant_id: TENANT_A, name: 'Mathematics', code: 'MATH' },
        { id: SUBJECT_B_ID, tenant_id: TENANT_A, name: 'Science', code: 'SCI' },
      ],
    });

    await prisma.gradingScale.create({
      data: {
        id: GRADING_SCALE_ID,
        tenant_id: TENANT_A,
        name: 'Impl06 Matrix Scale',
        config_json: {
          type: 'numeric',
          ranges: [
            { min: 90, label: 'A' },
            { min: 80, label: 'B' },
            { min: 70, label: 'C' },
            { min: 60, label: 'D' },
            { min: 0, label: 'F' },
          ],
        },
      },
    });

    await prisma.classSubjectGradeConfig.createMany({
      data: [
        {
          tenant_id: TENANT_A,
          class_id: CLASS_ID,
          subject_id: SUBJECT_A_ID,
          grading_scale_id: GRADING_SCALE_ID,
          category_weight_json: {},
        },
        {
          tenant_id: TENANT_A,
          class_id: CLASS_ID,
          subject_id: SUBJECT_B_ID,
          grading_scale_id: GRADING_SCALE_ID,
          category_weight_json: {},
        },
      ],
    });

    await prisma.household.create({
      data: {
        id: HOUSEHOLD_ID,
        tenant_id: TENANT_A,
        household_name: 'Impl06 Household',
        household_number: 'HH-06',
        status: 'active',
      },
    });

    await prisma.student.createMany({
      data: [
        {
          id: STUDENT_A_ID,
          tenant_id: TENANT_A,
          household_id: HOUSEHOLD_ID,
          first_name: 'Ali',
          last_name: 'Hassan',
          student_number: 'STU06A',
          date_of_birth: new Date('2014-05-01'),
          status: 'active',
          year_group_id: YEAR_GROUP_ID,
          class_homeroom_id: CLASS_ID,
        },
        {
          id: STUDENT_B_ID,
          tenant_id: TENANT_A,
          household_id: HOUSEHOLD_ID,
          first_name: 'Ben',
          last_name: 'Ibrahim',
          student_number: 'STU06B',
          date_of_birth: new Date('2014-06-12'),
          status: 'active',
          year_group_id: YEAR_GROUP_ID,
          class_homeroom_id: CLASS_ID,
        },
        {
          id: STUDENT_C_ID,
          tenant_id: TENANT_A,
          household_id: HOUSEHOLD_ID,
          first_name: 'Cara',
          last_name: 'Jones',
          student_number: 'STU06C',
          date_of_birth: new Date('2014-07-20'),
          status: 'active',
          year_group_id: YEAR_GROUP_ID,
          class_homeroom_id: CLASS_ID,
        },
      ],
    });

    await prisma.classEnrolment.createMany({
      data: [
        {
          tenant_id: TENANT_A,
          class_id: CLASS_ID,
          student_id: STUDENT_A_ID,
          status: 'active',
          start_date: new Date('2025-09-01'),
        },
        {
          tenant_id: TENANT_A,
          class_id: CLASS_ID,
          student_id: STUDENT_B_ID,
          status: 'active',
          start_date: new Date('2025-09-01'),
        },
        {
          tenant_id: TENANT_A,
          class_id: CLASS_ID,
          student_id: STUDENT_C_ID,
          status: 'active',
          start_date: new Date('2025-09-01'),
        },
      ],
    });

    await prisma.periodGradeSnapshot.createMany({
      data: [
        // Term 1 — Ali dominates both subjects
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_A_ID,
          class_id: CLASS_ID,
          subject_id: SUBJECT_A_ID,
          academic_period_id: PERIOD_ID,
          computed_value: 95,
          display_value: 'A',
          snapshot_at: new Date(),
        },
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_A_ID,
          class_id: CLASS_ID,
          subject_id: SUBJECT_B_ID,
          academic_period_id: PERIOD_ID,
          computed_value: 90,
          display_value: 'A',
          snapshot_at: new Date(),
        },
        // Term 1 — Ben middle of the pack
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_B_ID,
          class_id: CLASS_ID,
          subject_id: SUBJECT_A_ID,
          academic_period_id: PERIOD_ID,
          computed_value: 80,
          display_value: 'B',
          snapshot_at: new Date(),
        },
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_B_ID,
          class_id: CLASS_ID,
          subject_id: SUBJECT_B_ID,
          academic_period_id: PERIOD_ID,
          computed_value: 70,
          display_value: 'C',
          snapshot_at: new Date(),
        },
        // Term 1 — Cara trailing
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_C_ID,
          class_id: CLASS_ID,
          subject_id: SUBJECT_A_ID,
          academic_period_id: PERIOD_ID,
          computed_value: 60,
          display_value: 'D',
          snapshot_at: new Date(),
        },
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_C_ID,
          class_id: CLASS_ID,
          subject_id: SUBJECT_B_ID,
          academic_period_id: PERIOD_ID,
          computed_value: 60,
          display_value: 'D',
          snapshot_at: new Date(),
        },
        // Term 2 — reverse the ordering so "all periods" aggregates evenly
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_A_ID,
          class_id: CLASS_ID,
          subject_id: SUBJECT_A_ID,
          academic_period_id: PERIOD_B_ID,
          computed_value: 80,
          display_value: 'B',
          snapshot_at: new Date(),
        },
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_A_ID,
          class_id: CLASS_ID,
          subject_id: SUBJECT_B_ID,
          academic_period_id: PERIOD_B_ID,
          computed_value: 80,
          display_value: 'B',
          snapshot_at: new Date(),
        },
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_B_ID,
          class_id: CLASS_ID,
          subject_id: SUBJECT_A_ID,
          academic_period_id: PERIOD_B_ID,
          computed_value: 90,
          display_value: 'A',
          snapshot_at: new Date(),
        },
        {
          tenant_id: TENANT_A,
          student_id: STUDENT_B_ID,
          class_id: CLASS_ID,
          subject_id: SUBJECT_B_ID,
          academic_period_id: PERIOD_B_ID,
          computed_value: 80,
          display_value: 'B',
          snapshot_at: new Date(),
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  it('returns matrix for a single period with rank and cells', async () => {
    const result = await service.getClassMatrix(TENANT_A, {
      classId: CLASS_ID,
      academicPeriodId: PERIOD_ID,
    });

    expect(result.class.id).toBe(CLASS_ID);
    expect(result.class.name).toBe('6A');
    expect(result.class.year_group?.id).toBe(YEAR_GROUP_ID);
    expect(result.period).toEqual({ id: PERIOD_ID, name: 'Term 1' });

    expect(result.students.map((s) => s.id).sort()).toEqual(
      [STUDENT_A_ID, STUDENT_B_ID, STUDENT_C_ID].sort(),
    );
    expect(result.subjects.map((s) => s.id).sort()).toEqual([SUBJECT_A_ID, SUBJECT_B_ID].sort());

    // Ali: (95+90)/2 = 92.5
    expect(result.overall_by_student[STUDENT_A_ID]!.weighted_average).toBeCloseTo(92.5, 2);
    expect(result.overall_by_student[STUDENT_A_ID]!.rank_position).toBe(1);

    // Ben: (80+70)/2 = 75
    expect(result.overall_by_student[STUDENT_B_ID]!.weighted_average).toBeCloseTo(75, 2);
    expect(result.overall_by_student[STUDENT_B_ID]!.rank_position).toBe(2);

    // Cara: (60+60)/2 = 60
    expect(result.overall_by_student[STUDENT_C_ID]!.weighted_average).toBeCloseTo(60, 2);
    expect(result.overall_by_student[STUDENT_C_ID]!.rank_position).toBe(3);

    // Per-subject cells pull the display token from the snapshot
    expect(result.cells[STUDENT_A_ID]![SUBJECT_A_ID]!.grade).toBe('A');
    expect(result.cells[STUDENT_A_ID]![SUBJECT_A_ID]!.score).toBeCloseTo(95, 2);
  });

  it('aggregates across periods when academicPeriodId === "all"', async () => {
    const result = await service.getClassMatrix(TENANT_A, {
      classId: CLASS_ID,
      academicPeriodId: 'all',
    });

    expect(result.period.id).toBe('all');

    // Ali: ((95+90)/2 + (80+80)/2) / 2 = (92.5 + 80) / 2 = 86.25
    expect(result.overall_by_student[STUDENT_A_ID]!.weighted_average).toBeCloseTo(86.25, 2);
    // Ben: ((80+70)/2 + (90+80)/2) / 2 = (75 + 85) / 2 = 80
    expect(result.overall_by_student[STUDENT_B_ID]!.weighted_average).toBeCloseTo(80, 2);
    // Cara: only T1 data — (60+60)/2 = 60
    expect(result.overall_by_student[STUDENT_C_ID]!.weighted_average).toBeCloseTo(60, 2);

    // Ranks: Ali=1, Ben=2, Cara=3
    expect(result.overall_by_student[STUDENT_A_ID]!.rank_position).toBe(1);
    expect(result.overall_by_student[STUDENT_B_ID]!.rank_position).toBe(2);
    expect(result.overall_by_student[STUDENT_C_ID]!.rank_position).toBe(3);
  });

  it('throws NotFound when the class belongs to a different tenant (RLS)', async () => {
    await expect(
      service.getClassMatrix(TENANT_B, { classId: CLASS_ID, academicPeriodId: PERIOD_ID }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFound when the period does not exist', async () => {
    await expect(
      service.getClassMatrix(TENANT_A, {
        classId: CLASS_ID,
        academicPeriodId: '11111111-1111-4111-8111-999999999999',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
