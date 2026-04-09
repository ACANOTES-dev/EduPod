/* eslint-disable school/no-raw-sql-outside-rls -- integration tests require direct SQL for setup/teardown */
/**
 * E2E tests for the AI draft subsystem.
 *
 * Verifies the *guard* behaviours of the AI draft pathway — authorship and
 * window enforcement — without making real calls to the Anthropic API. The
 * Anthropic client and GDPR consent are overridden on the Nest TestingModule.
 */
import '../setup-env';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { AnthropicClientService } from '../../src/modules/ai/anthropic-client.service';
import { ConsentService } from '../../src/modules/gdpr/consent.service';
import { GdprTokenService } from '../../src/modules/gdpr/gdpr-token.service';
import { ReportCardAiDraftService } from '../../src/modules/gradebook/report-cards/report-card-ai-draft.service';
import { ReportCommentWindowsService } from '../../src/modules/gradebook/report-cards/report-comment-windows.service';

const TENANT_ID = 'cafe3001-0001-4001-8001-000000000001';
const TEACHER_USER_ID = 'cafe3002-0002-4002-8002-000000000002';
const TEACHER_STAFF_ID = 'cafe3003-0003-4003-8003-000000000003';
const HOUSEHOLD_ID = 'cafe3004-0004-4004-8004-000000000004';
const STUDENT_ID = 'cafe3005-0005-4005-8005-000000000005';
const SUBJECT_ID = 'cafe3006-0006-4006-8006-000000000006';
const CLASS_ID = 'cafe3007-0007-4007-8007-000000000007';
const YEAR_ID = 'cafe3008-0008-4008-8008-000000000008';
const PERIOD_ID = 'cafe3009-0009-4009-8009-000000000009';

jest.setTimeout(60_000);

describe('AI Draft (e2e) — impl 02', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let windowsService: ReportCommentWindowsService;
  let service: ReportCardAiDraftService;

  const stubAnthropic = {
    isConfigured: true,
    createMessage: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Solid progress, focused learner.' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    }),
  };

  const stubConsent = {
    hasConsent: jest.fn().mockResolvedValue(true),
  };

  const stubGdpr = {
    processOutbound: jest.fn().mockResolvedValue({
      processedData: { entities: [{ fields: { full_name: 'TOKEN-1' } }], entityCount: 1 },
      tokenMap: {},
    }),
    processInbound: jest.fn().mockImplementation(async (_t: string, text: string) => text),
  };

  async function cleanup() {
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
      `DELETE FROM ai_processing_logs WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenant_settings WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = '${TEACHER_USER_ID}'::uuid`);
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AnthropicClientService)
      .useValue(stubAnthropic)
      .overrideProvider(ConsentService)
      .useValue(stubConsent)
      .overrideProvider(GdprTokenService)
      .useValue(stubGdpr)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    service = app.get(ReportCardAiDraftService);
    windowsService = app.get(ReportCommentWindowsService);

    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    await cleanup();

    await prisma.tenant.create({
      data: {
        id: TENANT_ID,
        name: 'AI Draft E2E',
        slug: 'ai-draft-e2e',
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
    });
    // Enable AI comments for the tenant via the legacy tenant_settings blob.
    await prisma.tenantSetting.upsert({
      where: { tenant_id: TENANT_ID },
      update: { settings: { ai: { commentsEnabled: true } } },
      create: { tenant_id: TENANT_ID, settings: { ai: { commentsEnabled: true } } },
    });

    await prisma.user.create({
      data: {
        id: TEACHER_USER_ID,
        email: 'ai-draft-teacher@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'AI',
        last_name: 'Drafter',
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
    await prisma.class.create({
      data: {
        id: CLASS_ID,
        tenant_id: TENANT_ID,
        academic_year_id: YEAR_ID,
        subject_id: SUBJECT_ID,
        name: 'Year 4 Maths',
        status: 'active',
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
      data: { id: HOUSEHOLD_ID, tenant_id: TENANT_ID, household_name: 'AI HH' },
    });
    await prisma.student.create({
      data: {
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
        household_id: HOUSEHOLD_ID,
        first_name: 'Dana',
        last_name: 'D',
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
    await prisma.reportCommentWindow.deleteMany({ where: { tenant_id: TENANT_ID } });
    stubAnthropic.createMessage.mockClear();
  });

  const draftArgs = {
    studentId: STUDENT_ID,
    subjectId: SUBJECT_ID,
    classId: CLASS_ID,
    academicPeriodId: PERIOD_ID,
  };

  it('rejects with COMMENT_WINDOW_CLOSED when no window is open', async () => {
    await expect(
      service.draftSubjectComment(
        TENANT_ID,
        { userId: TEACHER_USER_ID, isAdmin: false },
        draftArgs,
      ),
    ).rejects.toMatchObject({ response: { code: 'COMMENT_WINDOW_CLOSED' } });
    expect(stubAnthropic.createMessage).not.toHaveBeenCalled();
  });

  it('returns a draft when the window is open and settings are fine', async () => {
    await openWindow();
    const result = await service.draftSubjectComment(
      TENANT_ID,
      { userId: TEACHER_USER_ID, isAdmin: false },
      draftArgs,
    );
    expect(result.comment_text).toContain('Solid progress');
    expect(result.tokens_used).toBe(120);
    expect(stubAnthropic.createMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects a teacher who is not assigned to the class', async () => {
    await openWindow();
    await expect(
      service.draftSubjectComment(
        TENANT_ID,
        { userId: 'cafe3099-0099-4099-8099-000000000099', isAdmin: false },
        draftArgs,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_AUTHOR' } });
    expect(stubAnthropic.createMessage).not.toHaveBeenCalled();
  });
});
