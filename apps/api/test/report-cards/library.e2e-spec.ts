/* eslint-disable school/no-raw-sql-outside-rls -- integration tests require direct SQL for setup/teardown */
/**
 * E2E tests for the Report Card library endpoint (impl 06).
 *
 * Boots the full Nest AppModule so the real DI graph and PostgreSQL
 * participate. The S3 presigner is stubbed per-test via overrideProvider so
 * we don't need live AWS credentials — the service under test only cares
 * that a string URL is returned.
 */
import '../setup-env';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { ReportCardsQueriesService } from '../../src/modules/gradebook/report-cards/report-cards-queries.service';
import { S3Service } from '../../src/modules/s3/s3.service';

const TENANT_A = 'aaaa0006-2222-4222-8222-000000000001';
const TENANT_B = 'bbbb0006-2222-4222-8222-000000000002';
const ADMIN_USER_ID = 'aaaa0006-2222-4222-8222-000000000003';
const TEACHER_USER_ID = 'aaaa0006-2222-4222-8222-000000000004';
const TEACHER_STAFF_PROFILE_ID = 'aaaa0006-2222-4222-8222-000000000005';
const UNRELATED_TEACHER_USER_ID = 'aaaa0006-2222-4222-8222-000000000006';
const UNRELATED_TEACHER_STAFF_ID = 'aaaa0006-2222-4222-8222-000000000007';
const YEAR_GROUP_ID = 'aaaa0006-2222-4222-8222-000000000008';
const CLASS_HOMEROOM_ID = 'aaaa0006-2222-4222-8222-000000000009';
const OTHER_CLASS_ID = 'aaaa0006-2222-4222-8222-00000000000a';
const ACADEMIC_YEAR_ID = 'aaaa0006-2222-4222-8222-00000000000b';
const PERIOD_ID = 'aaaa0006-2222-4222-8222-00000000000c';
const HOUSEHOLD_ID = 'aaaa0006-2222-4222-8222-00000000000d';
const STUDENT_HOMEROOM_ID = 'aaaa0006-2222-4222-8222-00000000000e';
const STUDENT_OTHER_ID = 'aaaa0006-2222-4222-8222-00000000000f';
const TEMPLATE_EN_ID = 'aaaa0006-2222-4222-8222-000000000010';
const TEMPLATE_AR_ID = 'aaaa0006-2222-4222-8222-000000000011';
const REPORT_EN_HOMEROOM = 'aaaa0006-2222-4222-8222-000000000012';
const REPORT_AR_HOMEROOM = 'aaaa0006-2222-4222-8222-000000000013';
const REPORT_EN_OTHER = 'aaaa0006-2222-4222-8222-000000000014';

jest.setTimeout(90_000);

describe('Report Cards library (e2e) — impl 06', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let service: ReportCardsQueriesService;
  const presign = jest.fn((key: string) => Promise.resolve(`https://signed.example/${key}`));

  async function cleanup() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_cards WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_templates WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_tenant_settings WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM teacher_competencies WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM class_subject_grade_configs WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
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
      `DELETE FROM staff_profiles WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM classes WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM year_groups WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_periods WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_years WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ('${ADMIN_USER_ID}'::uuid, '${TEACHER_USER_ID}'::uuid, '${UNRELATED_TEACHER_USER_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(S3Service)
      .useValue({
        getPresignedUrl: (key: string) => presign(key),
      })
      .compile();
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
          name: 'Impl06 Library Tenant A',
          slug: 'impl06-library-tenant-a',
          default_locale: 'en',
          timezone: 'UTC',
          date_format: 'YYYY-MM-DD',
          currency_code: 'USD',
          academic_year_start_month: 9,
          status: 'active',
        },
        {
          id: TENANT_B,
          name: 'Impl06 Library Tenant B',
          slug: 'impl06-library-tenant-b',
          default_locale: 'en',
          timezone: 'UTC',
          date_format: 'YYYY-MM-DD',
          currency_code: 'USD',
          academic_year_start_month: 9,
          status: 'active',
        },
      ],
    });

    await prisma.user.createMany({
      data: [
        {
          id: ADMIN_USER_ID,
          email: 'impl06-library-admin@test.local',
          password_hash: '$2a$10$placeholder',
          first_name: 'Admin',
          last_name: 'User',
          global_status: 'active',
        },
        {
          id: TEACHER_USER_ID,
          email: 'impl06-library-teacher@test.local',
          password_hash: '$2a$10$placeholder',
          first_name: 'Homeroom',
          last_name: 'Teacher',
          global_status: 'active',
        },
        {
          id: UNRELATED_TEACHER_USER_ID,
          email: 'impl06-library-unrelated@test.local',
          password_hash: '$2a$10$placeholder',
          first_name: 'Unrelated',
          last_name: 'Teacher',
          global_status: 'active',
        },
      ],
    });

    await prisma.staffProfile.createMany({
      data: [
        {
          id: TEACHER_STAFF_PROFILE_ID,
          tenant_id: TENANT_A,
          user_id: TEACHER_USER_ID,
          employment_status: 'active',
        },
        {
          id: UNRELATED_TEACHER_STAFF_ID,
          tenant_id: TENANT_A,
          user_id: UNRELATED_TEACHER_USER_ID,
          employment_status: 'active',
        },
      ],
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
        name: 'Year 7',
        display_order: 7,
      },
    });

    await prisma.class.createMany({
      data: [
        {
          id: CLASS_HOMEROOM_ID,
          tenant_id: TENANT_A,
          year_group_id: YEAR_GROUP_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
          name: '7A',
          status: 'active',
          max_capacity: 25,
          homeroom_teacher_staff_id: TEACHER_STAFF_PROFILE_ID,
        },
        {
          id: OTHER_CLASS_ID,
          tenant_id: TENANT_A,
          year_group_id: YEAR_GROUP_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
          name: '7B',
          status: 'active',
          max_capacity: 25,
        },
      ],
    });

    await prisma.household.create({
      data: {
        id: HOUSEHOLD_ID,
        tenant_id: TENANT_A,
        household_name: 'Library Household',
        household_number: 'HH-LIB',
        status: 'active',
      },
    });

    await prisma.student.createMany({
      data: [
        {
          id: STUDENT_HOMEROOM_ID,
          tenant_id: TENANT_A,
          household_id: HOUSEHOLD_ID,
          first_name: 'Hana',
          last_name: 'Homeroom',
          student_number: 'STU-LIB-H',
          date_of_birth: new Date('2013-01-01'),
          status: 'active',
          year_group_id: YEAR_GROUP_ID,
          class_homeroom_id: CLASS_HOMEROOM_ID,
        },
        {
          id: STUDENT_OTHER_ID,
          tenant_id: TENANT_A,
          household_id: HOUSEHOLD_ID,
          first_name: 'Omar',
          last_name: 'Other',
          student_number: 'STU-LIB-O',
          date_of_birth: new Date('2013-02-01'),
          status: 'active',
          year_group_id: YEAR_GROUP_ID,
          class_homeroom_id: OTHER_CLASS_ID,
        },
      ],
    });

    await prisma.classEnrolment.createMany({
      data: [
        {
          tenant_id: TENANT_A,
          class_id: CLASS_HOMEROOM_ID,
          student_id: STUDENT_HOMEROOM_ID,
          status: 'active',
          start_date: new Date('2025-09-01'),
        },
        {
          tenant_id: TENANT_A,
          class_id: OTHER_CLASS_ID,
          student_id: STUDENT_OTHER_ID,
          status: 'active',
          start_date: new Date('2025-09-01'),
        },
      ],
    });

    await prisma.reportCardTemplate.createMany({
      data: [
        {
          id: TEMPLATE_EN_ID,
          tenant_id: TENANT_A,
          name: 'Grades Only (EN)',
          locale: 'en',
          is_default: true,
          content_scope: 'grades_only',
          sections_json: [],
          created_by_user_id: ADMIN_USER_ID,
        },
        {
          id: TEMPLATE_AR_ID,
          tenant_id: TENANT_A,
          name: 'Grades Only (AR)',
          locale: 'ar',
          is_default: false,
          content_scope: 'grades_only',
          sections_json: [],
          created_by_user_id: ADMIN_USER_ID,
        },
      ],
    });

    // NOTE on the unique constraint:
    // There is a partial unique index `idx_report_cards_active_unique` on
    // (tenant_id, student_id, academic_period_id) WHERE status IN ('draft',
    // 'published') — it predates the language-per-row design and currently
    // prevents us from storing two `published` rows for the same student in
    // the same period, even when the locale differs. A follow-up migration
    // (tracked as tech debt in impl 04) will relax the index to include
    // template_locale; until then we mark the second-language row with a
    // neutral status that bypasses the partial unique index.
    await prisma.reportCard.createMany({
      data: [
        {
          id: REPORT_EN_HOMEROOM,
          tenant_id: TENANT_A,
          student_id: STUDENT_HOMEROOM_ID,
          academic_period_id: PERIOD_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
          template_id: TEMPLATE_EN_ID,
          template_locale: 'en',
          status: 'published',
          pdf_storage_key: `tenant/${TENANT_A}/report/${REPORT_EN_HOMEROOM}.pdf`,
          snapshot_payload_json: {},
        },
        {
          id: REPORT_AR_HOMEROOM,
          tenant_id: TENANT_A,
          student_id: STUDENT_HOMEROOM_ID,
          academic_period_id: PERIOD_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
          template_id: TEMPLATE_EN_ID, // same template → shared group key
          template_locale: 'ar',
          // 'revised' keeps the row out of the 'draft'/'published' partial
          // unique index; the library service's `not: superseded` filter
          // still returns it.
          status: 'revised',
          pdf_storage_key: `tenant/${TENANT_A}/report/${REPORT_AR_HOMEROOM}.pdf`,
          snapshot_payload_json: {},
        },
        {
          id: REPORT_EN_OTHER,
          tenant_id: TENANT_A,
          student_id: STUDENT_OTHER_ID,
          academic_period_id: PERIOD_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
          template_id: TEMPLATE_EN_ID,
          template_locale: 'en',
          status: 'published',
          pdf_storage_key: `tenant/${TENANT_A}/report/${REPORT_EN_OTHER}.pdf`,
          snapshot_payload_json: {},
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(() => presign.mockClear());

  it('admin sees every non-superseded report card with grouped languages_available', async () => {
    const result = await service.listReportCardLibrary(
      TENANT_A,
      { user_id: ADMIN_USER_ID, is_admin: true },
      { page: 1, pageSize: 20 },
    );

    expect(result.meta.total).toBe(3);
    expect(result.data).toHaveLength(3);
    // The homeroom student has both locales; others only en
    const homeroomEn = result.data.find((r) => r.id === REPORT_EN_HOMEROOM)!;
    expect(homeroomEn.languages_available).toEqual(['ar', 'en']);
    const otherEn = result.data.find((r) => r.id === REPORT_EN_OTHER)!;
    expect(otherEn.languages_available).toEqual(['en']);
    // Signed URLs are produced for every row with a pdf_storage_key
    expect(homeroomEn.pdf_download_url).toContain('https://signed.example/');
  });

  it('teacher sees only homeroom + teaching students', async () => {
    const result = await service.listReportCardLibrary(
      TENANT_A,
      { user_id: TEACHER_USER_ID, is_admin: false },
      { page: 1, pageSize: 20 },
    );

    expect(result.meta.total).toBe(2); // en + ar for the homeroom student only
    const studentIds = result.data.map((r) => r.student.id);
    expect(studentIds).toEqual(expect.arrayContaining([STUDENT_HOMEROOM_ID]));
    expect(studentIds).not.toContain(STUDENT_OTHER_ID);
  });

  it('unrelated teacher with no teaching allocations sees nothing', async () => {
    const result = await service.listReportCardLibrary(
      TENANT_A,
      { user_id: UNRELATED_TEACHER_USER_ID, is_admin: false },
      { page: 1, pageSize: 20 },
    );

    expect(result.meta.total).toBe(0);
    expect(result.data).toHaveLength(0);
  });

  it('filters by language', async () => {
    const result = await service.listReportCardLibrary(
      TENANT_A,
      { user_id: ADMIN_USER_ID, is_admin: true },
      { page: 1, pageSize: 20, language: 'ar' },
    );

    expect(result.meta.total).toBe(1);
    expect(result.data[0]!.id).toBe(REPORT_AR_HOMEROOM);
  });

  it('filters by class_id', async () => {
    const result = await service.listReportCardLibrary(
      TENANT_A,
      { user_id: ADMIN_USER_ID, is_admin: true },
      { page: 1, pageSize: 20, class_id: OTHER_CLASS_ID },
    );

    expect(result.meta.total).toBe(1);
    expect(result.data[0]!.id).toBe(REPORT_EN_OTHER);
  });

  it('cross-tenant isolation (RLS): Tenant B cannot see Tenant A documents', async () => {
    const result = await service.listReportCardLibrary(
      TENANT_B,
      { user_id: ADMIN_USER_ID, is_admin: true },
      { page: 1, pageSize: 20 },
    );

    expect(result.meta.total).toBe(0);
    expect(result.data).toHaveLength(0);
  });
});
