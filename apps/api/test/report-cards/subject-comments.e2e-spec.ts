/* eslint-disable school/no-raw-sql-outside-rls -- integration tests require direct SQL for setup/teardown */
/**
 * E2E tests for the subject comment subsystem.
 *
 * Validates key impl 02 behavioural invariants against a real database:
 * authorship rejection, window enforcement, upsert semantics, and bulk
 * finalise scoping. Uses the full Nest AppModule so we exercise the real
 * DI graph.
 */
import '../setup-env';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { ReportCardSubjectCommentsService } from '../../src/modules/gradebook/report-cards/report-card-subject-comments.service';
import { ReportCommentWindowsService } from '../../src/modules/gradebook/report-cards/report-comment-windows.service';

const TENANT_ID = 'cafe1001-0001-4001-8001-000000000001';
const TEACHER_USER_ID = 'cafe1002-0002-4002-8002-000000000002';
const OTHER_USER_ID = 'cafe1003-0003-4003-8003-000000000003';
const TEACHER_STAFF_ID = 'cafe1004-0004-4004-8004-000000000004';
const HOUSEHOLD_ID = 'cafe1005-0005-4005-8005-000000000005';
const STUDENT_ID_A = 'cafe1006-0006-4006-8006-000000000006';
const STUDENT_ID_B = 'cafe1007-0007-4007-8007-000000000007';
const SUBJECT_ID = 'cafe1008-0008-4008-8008-000000000008';
const OTHER_SUBJECT_ID = 'cafe1009-0009-4009-8009-000000000009';
const CLASS_ID = 'cafe100a-000a-400a-800a-00000000000a';
const YEAR_ID = 'cafe100b-000b-400b-800b-00000000000b';
const PERIOD_ID = 'cafe100c-000c-400c-800c-00000000000c';

jest.setTimeout(60_000);

describe('Subject Comments (e2e) — impl 02', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let windowsService: ReportCommentWindowsService;
  let service: ReportCardSubjectCommentsService;

  async function cleanup() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_subject_comments WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_comment_windows WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM class_staff WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM classes WHERE tenant_id = '${TENANT_ID}'::uuid`);
    await prisma.$executeRawUnsafe(`DELETE FROM subjects WHERE tenant_id = '${TENANT_ID}'::uuid`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_periods WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_years WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM students WHERE tenant_id = '${TENANT_ID}'::uuid`);
    await prisma.$executeRawUnsafe(`DELETE FROM households WHERE tenant_id = '${TENANT_ID}'::uuid`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM staff_profiles WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ('${TEACHER_USER_ID}'::uuid, '${OTHER_USER_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = '${TENANT_ID}'::uuid`);
  }

  async function openWindow() {
    await windowsService.open(TENANT_ID, TEACHER_USER_ID, {
      academic_period_id: PERIOD_ID,
      opens_at: new Date('2020-01-01T00:00:00Z').toISOString(),
      closes_at: new Date('2099-01-01T00:00:00Z').toISOString(),
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    service = app.get(ReportCardSubjectCommentsService);
    windowsService = app.get(ReportCommentWindowsService);

    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    await cleanup();

    await prisma.tenant.create({
      data: {
        id: TENANT_ID,
        name: 'Subj E2E',
        slug: 'subj-e2e',
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
    });
    await prisma.user.create({
      data: {
        id: TEACHER_USER_ID,
        email: 'subj-teacher@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'Teacher',
        last_name: 'One',
        global_status: 'active',
      },
    });
    await prisma.user.create({
      data: {
        id: OTHER_USER_ID,
        email: 'subj-other@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'Other',
        last_name: 'Teacher',
        global_status: 'active',
      },
    });
    await prisma.staffProfile.create({
      data: {
        id: TEACHER_STAFF_ID,
        tenant_id: TENANT_ID,
        user_id: TEACHER_USER_ID,
        employment_status: 'active',
      },
    });

    await prisma.academicYear.create({
      data: {
        id: YEAR_ID,
        tenant_id: TENANT_ID,
        name: '2025-2026',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2026-06-30'),
        status: 'active',
      },
    });
    await prisma.academicPeriod.create({
      data: {
        id: PERIOD_ID,
        tenant_id: TENANT_ID,
        academic_year_id: YEAR_ID,
        name: 'Term 1',
        period_type: 'term',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2025-12-20'),
        status: 'active',
      },
    });
    await prisma.subject.create({
      data: { id: SUBJECT_ID, tenant_id: TENANT_ID, name: 'Mathematics' },
    });
    await prisma.subject.create({
      data: { id: OTHER_SUBJECT_ID, tenant_id: TENANT_ID, name: 'History' },
    });
    await prisma.class.create({
      data: {
        id: CLASS_ID,
        tenant_id: TENANT_ID,
        academic_year_id: YEAR_ID,
        subject_id: SUBJECT_ID,
        name: 'Year 4 Maths',
        status: 'active',
        max_capacity: 25,
      },
    });
    await prisma.classStaff.create({
      data: {
        class_id: CLASS_ID,
        tenant_id: TENANT_ID,
        staff_profile_id: TEACHER_STAFF_ID,
        assignment_role: 'teacher',
      },
    });

    await prisma.household.create({
      data: { id: HOUSEHOLD_ID, tenant_id: TENANT_ID, household_name: 'Subj HH' },
    });
    await prisma.student.create({
      data: {
        id: STUDENT_ID_A,
        tenant_id: TENANT_ID,
        household_id: HOUSEHOLD_ID,
        first_name: 'Alex',
        last_name: 'A',
        date_of_birth: new Date('2014-01-01'),
        status: 'active',
      },
    });
    await prisma.student.create({
      data: {
        id: STUDENT_ID_B,
        tenant_id: TENANT_ID,
        household_id: HOUSEHOLD_ID,
        first_name: 'Bailey',
        last_name: 'B',
        date_of_birth: new Date('2014-01-01'),
        status: 'active',
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  afterEach(async () => {
    await prisma.reportCardSubjectComment.deleteMany({ where: { tenant_id: TENANT_ID } });
    await prisma.reportCommentWindow.deleteMany({ where: { tenant_id: TENANT_ID } });
  });

  it('rejects upsert with COMMENT_WINDOW_CLOSED when no window is open', async () => {
    await expect(
      service.upsert(
        TENANT_ID,
        { userId: TEACHER_USER_ID, isAdmin: false },
        {
          student_id: STUDENT_ID_A,
          subject_id: SUBJECT_ID,
          class_id: CLASS_ID,
          academic_period_id: PERIOD_ID,
          comment_text: 'Good effort.',
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'COMMENT_WINDOW_CLOSED' } });
  });

  it('upserts a comment, finalises it, and idempotently updates on re-upsert', async () => {
    await openWindow();

    const first = await service.upsert(
      TENANT_ID,
      { userId: TEACHER_USER_ID, isAdmin: false },
      {
        student_id: STUDENT_ID_A,
        subject_id: SUBJECT_ID,
        class_id: CLASS_ID,
        academic_period_id: PERIOD_ID,
        comment_text: 'First comment.',
      },
    );
    expect(first.comment_text).toBe('First comment.');

    const finalised = await service.finalise(
      TENANT_ID,
      { userId: TEACHER_USER_ID, isAdmin: false },
      first.id,
    );
    expect(finalised.finalised_at).not.toBeNull();

    const second = await service.upsert(
      TENANT_ID,
      { userId: TEACHER_USER_ID, isAdmin: false },
      {
        student_id: STUDENT_ID_A,
        subject_id: SUBJECT_ID,
        class_id: CLASS_ID,
        academic_period_id: PERIOD_ID,
        comment_text: 'Revised comment.',
      },
    );
    expect(second.id).toBe(first.id);
    expect(second.comment_text).toBe('Revised comment.');
    expect(second.finalised_at).toBeNull();

    const count = await prisma.reportCardSubjectComment.count({
      where: {
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID_A,
        subject_id: SUBJECT_ID,
        academic_period_id: PERIOD_ID,
      },
    });
    expect(count).toBe(1);
  });

  it('rejects a teacher not assigned to the class with INVALID_AUTHOR', async () => {
    await openWindow();
    await expect(
      service.upsert(
        TENANT_ID,
        { userId: OTHER_USER_ID, isAdmin: false },
        {
          student_id: STUDENT_ID_A,
          subject_id: SUBJECT_ID,
          class_id: CLASS_ID,
          academic_period_id: PERIOD_ID,
          comment_text: 'Not allowed.',
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_AUTHOR' } });
  });

  it('rejects a dto subject that does not match the class subject', async () => {
    await openWindow();
    await expect(
      service.upsert(
        TENANT_ID,
        { userId: TEACHER_USER_ID, isAdmin: false },
        {
          student_id: STUDENT_ID_A,
          subject_id: OTHER_SUBJECT_ID,
          class_id: CLASS_ID,
          academic_period_id: PERIOD_ID,
          comment_text: 'Wrong subject.',
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_AUTHOR' } });
  });

  it('lets an admin upsert even when not assigned to the class', async () => {
    await openWindow();
    const row = await service.upsert(
      TENANT_ID,
      { userId: OTHER_USER_ID, isAdmin: true },
      {
        student_id: STUDENT_ID_A,
        subject_id: SUBJECT_ID,
        class_id: CLASS_ID,
        academic_period_id: PERIOD_ID,
        comment_text: 'Admin override.',
      },
    );
    expect(row.author_user_id).toBe(OTHER_USER_ID);
  });

  it('bulkFinalise finalises only non-empty unfinalised comments in the scope', async () => {
    await openWindow();
    await service.upsert(
      TENANT_ID,
      { userId: TEACHER_USER_ID, isAdmin: false },
      {
        student_id: STUDENT_ID_A,
        subject_id: SUBJECT_ID,
        class_id: CLASS_ID,
        academic_period_id: PERIOD_ID,
        comment_text: 'Ready 1.',
      },
    );
    await service.upsert(
      TENANT_ID,
      { userId: TEACHER_USER_ID, isAdmin: false },
      {
        student_id: STUDENT_ID_B,
        subject_id: SUBJECT_ID,
        class_id: CLASS_ID,
        academic_period_id: PERIOD_ID,
        comment_text: 'Ready 2.',
      },
    );

    const count = await service.bulkFinalise(
      TENANT_ID,
      { userId: TEACHER_USER_ID, isAdmin: false },
      { classId: CLASS_ID, subjectId: SUBJECT_ID, academicPeriodId: PERIOD_ID },
    );
    expect(count).toBe(2);

    const rows = await prisma.reportCardSubjectComment.findMany({
      where: { tenant_id: TENANT_ID, class_id: CLASS_ID, subject_id: SUBJECT_ID },
    });
    expect(rows.every((r) => r.finalised_at !== null)).toBe(true);
  });
});
