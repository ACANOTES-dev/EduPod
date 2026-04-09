/* eslint-disable school/no-raw-sql-outside-rls -- integration tests require direct SQL for setup/teardown */
/**
 * E2E tests for the overall comment subsystem.
 *
 * Validates homeroom-teacher authorship and window enforcement against a
 * real database using the full Nest AppModule for DI.
 */
import '../setup-env';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { ReportCardOverallCommentsService } from '../../src/modules/gradebook/report-cards/report-card-overall-comments.service';
import { ReportCommentWindowsService } from '../../src/modules/gradebook/report-cards/report-comment-windows.service';

const TENANT_ID = 'cafe2001-0001-4001-8001-000000000001';
const HOMEROOM_USER_ID = 'cafe2002-0002-4002-8002-000000000002';
const OTHER_USER_ID = 'cafe2003-0003-4003-8003-000000000003';
const HOMEROOM_STAFF_ID = 'cafe2004-0004-4004-8004-000000000004';
const HOUSEHOLD_ID = 'cafe2005-0005-4005-8005-000000000005';
const STUDENT_ID = 'cafe2006-0006-4006-8006-000000000006';
const CLASS_ID = 'cafe2007-0007-4007-8007-000000000007';
const YEAR_ID = 'cafe2008-0008-4008-8008-000000000008';
const PERIOD_ID = 'cafe2009-0009-4009-8009-000000000009';

jest.setTimeout(60_000);

describe('Overall Comments (e2e) — impl 02', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let windowsService: ReportCommentWindowsService;
  let service: ReportCardOverallCommentsService;

  async function cleanup() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_overall_comments WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_comment_windows WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM classes WHERE tenant_id = '${TENANT_ID}'::uuid`);
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
      `DELETE FROM users WHERE id IN ('${HOMEROOM_USER_ID}'::uuid, '${OTHER_USER_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = '${TENANT_ID}'::uuid`);
  }

  async function openWindow() {
    await windowsService.open(TENANT_ID, HOMEROOM_USER_ID, {
      academic_period_id: PERIOD_ID,
      opens_at: new Date('2020-01-01T00:00:00Z').toISOString(),
      closes_at: new Date('2099-01-01T00:00:00Z').toISOString(),
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    service = app.get(ReportCardOverallCommentsService);
    windowsService = app.get(ReportCommentWindowsService);

    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    await cleanup();

    await prisma.tenant.create({
      data: {
        id: TENANT_ID,
        name: 'Overall E2E',
        slug: 'overall-e2e',
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
        id: HOMEROOM_USER_ID,
        email: 'overall-homeroom@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'Homeroom',
        last_name: 'Teacher',
        global_status: 'active',
      },
    });
    await prisma.user.create({
      data: {
        id: OTHER_USER_ID,
        email: 'overall-other@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'Other',
        last_name: 'User',
        global_status: 'active',
      },
    });
    await prisma.staffProfile.create({
      data: {
        id: HOMEROOM_STAFF_ID,
        tenant_id: TENANT_ID,
        user_id: HOMEROOM_USER_ID,
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
    await prisma.class.create({
      data: {
        id: CLASS_ID,
        tenant_id: TENANT_ID,
        academic_year_id: YEAR_ID,
        name: 'Year 4 Homeroom',
        status: 'active',
        homeroom_teacher_staff_id: HOMEROOM_STAFF_ID,
      },
    });

    await prisma.household.create({
      data: { id: HOUSEHOLD_ID, tenant_id: TENANT_ID, household_name: 'Overall HH' },
    });
    await prisma.student.create({
      data: {
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
        household_id: HOUSEHOLD_ID,
        first_name: 'Casey',
        last_name: 'C',
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
    await prisma.reportCardOverallComment.deleteMany({ where: { tenant_id: TENANT_ID } });
    await prisma.reportCommentWindow.deleteMany({ where: { tenant_id: TENANT_ID } });
  });

  it('rejects upsert when no window is open', async () => {
    await expect(
      service.upsert(
        TENANT_ID,
        { userId: HOMEROOM_USER_ID, isAdmin: false },
        {
          student_id: STUDENT_ID,
          class_id: CLASS_ID,
          academic_period_id: PERIOD_ID,
          comment_text: 'Overall summary.',
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'COMMENT_WINDOW_CLOSED' } });
  });

  it('allows the homeroom teacher to upsert and finalise', async () => {
    await openWindow();
    const row = await service.upsert(
      TENANT_ID,
      { userId: HOMEROOM_USER_ID, isAdmin: false },
      {
        student_id: STUDENT_ID,
        class_id: CLASS_ID,
        academic_period_id: PERIOD_ID,
        comment_text: 'Outstanding year.',
      },
    );
    expect(row.author_user_id).toBe(HOMEROOM_USER_ID);

    const finalised = await service.finalise(
      TENANT_ID,
      { userId: HOMEROOM_USER_ID, isAdmin: false },
      row.id,
    );
    expect(finalised.finalised_at).not.toBeNull();
  });

  it('rejects a non-homeroom teacher with INVALID_AUTHOR', async () => {
    await openWindow();
    await expect(
      service.upsert(
        TENANT_ID,
        { userId: OTHER_USER_ID, isAdmin: false },
        {
          student_id: STUDENT_ID,
          class_id: CLASS_ID,
          academic_period_id: PERIOD_ID,
          comment_text: 'Not allowed.',
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_AUTHOR' } });
  });

  it('lets an admin bypass the homeroom check', async () => {
    await openWindow();
    const row = await service.upsert(
      TENANT_ID,
      { userId: OTHER_USER_ID, isAdmin: true },
      {
        student_id: STUDENT_ID,
        class_id: CLASS_ID,
        academic_period_id: PERIOD_ID,
        comment_text: 'Admin write.',
      },
    );
    expect(row.author_user_id).toBe(OTHER_USER_ID);
  });
});
