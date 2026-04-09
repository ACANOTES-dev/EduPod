/* eslint-disable school/no-raw-sql-outside-rls -- integration tests require direct SQL for setup/teardown */
/**
 * E2E tests for the Report Card teacher-requests subsystem (impl 05).
 *
 * Boots the full Nest AppModule so the real DI graph and PostgreSQL
 * participate. Notifications are stubbed via `overrideProvider`; the
 * window service runs for real because it only needs the tenant + period
 * fixtures seeded by this suite. The generation service is stubbed because
 * a real `generateRun` needs full class/template/grade fixtures — the
 * auto-execute hand-off for `regenerate_reports` is covered by the
 * co-located unit spec.
 */
import '../setup-env';

import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { NotificationsService } from '../../src/modules/communications/notifications.service';
import { ReportCardGenerationService } from '../../src/modules/gradebook/report-cards/report-card-generation.service';
import { ReportCardTeacherRequestsService } from '../../src/modules/gradebook/report-cards/report-card-teacher-requests.service';

// Valid UUID v4 fixtures.
const TENANT_A = 'aaaa0005-0005-4005-8005-000000000001';
const TENANT_B = 'bbbb0005-0005-4005-8005-000000000001';
const TEACHER_A = 'aaaa0005-0005-4005-8005-000000000002';
const TEACHER_A2 = 'aaaa0005-0005-4005-8005-000000000003';
const ADMIN_A = 'aaaa0005-0005-4005-8005-000000000004';
const TEACHER_B = 'bbbb0005-0005-4005-8005-000000000002';
const YEAR_A_ID = 'aaaa0005-0005-4005-8005-000000000005';
const PERIOD_A_ID = 'aaaa0005-0005-4005-8005-000000000006';
const YEAR_B_ID = 'bbbb0005-0005-4005-8005-000000000003';
const PERIOD_B_ID = 'bbbb0005-0005-4005-8005-000000000004';

const TEACHER_ACTOR = { userId: TEACHER_A, isAdmin: false };
const OTHER_TEACHER_ACTOR = { userId: TEACHER_A2, isAdmin: false };
const ADMIN_ACTOR = { userId: ADMIN_A, isAdmin: true };
const TEACHER_B_ACTOR = { userId: TEACHER_B, isAdmin: false };

jest.setTimeout(60_000);

describe('Report Card teacher requests (e2e) — impl 05', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let service: ReportCardTeacherRequestsService;

  const createBatchMock = jest.fn().mockResolvedValue(undefined);
  const generateRunMock = jest.fn();

  async function cleanup() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_teacher_requests WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_comment_windows WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_periods WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_years WHERE tenant_id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM users WHERE id IN ('${TEACHER_A}'::uuid, '${TEACHER_A2}'::uuid, '${ADMIN_A}'::uuid, '${TEACHER_B}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id IN ('${TENANT_A}'::uuid, '${TENANT_B}'::uuid)`,
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NotificationsService)
      .useValue({ createBatch: createBatchMock })
      .overrideProvider(ReportCardGenerationService)
      .useValue({ generateRun: generateRunMock })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(ReportCardTeacherRequestsService);

    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    await cleanup();

    await prisma.tenant.createMany({
      data: [
        {
          id: TENANT_A,
          name: 'Impl05 Requests Tenant A',
          slug: 'impl05-requests-tenant-a',
          default_locale: 'en',
          timezone: 'UTC',
          date_format: 'YYYY-MM-DD',
          currency_code: 'USD',
          academic_year_start_month: 9,
          status: 'active',
        },
        {
          id: TENANT_B,
          name: 'Impl05 Requests Tenant B',
          slug: 'impl05-requests-tenant-b',
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
          id: TEACHER_A,
          email: 'impl05-teacher-a@test.local',
          password_hash: '$2a$10$placeholder',
          first_name: 'Impl05',
          last_name: 'Teacher A',
          global_status: 'active',
        },
        {
          id: TEACHER_A2,
          email: 'impl05-teacher-a2@test.local',
          password_hash: '$2a$10$placeholder',
          first_name: 'Impl05',
          last_name: 'Teacher A2',
          global_status: 'active',
        },
        {
          id: ADMIN_A,
          email: 'impl05-admin-a@test.local',
          password_hash: '$2a$10$placeholder',
          first_name: 'Impl05',
          last_name: 'Admin A',
          global_status: 'active',
        },
        {
          id: TEACHER_B,
          email: 'impl05-teacher-b@test.local',
          password_hash: '$2a$10$placeholder',
          first_name: 'Impl05',
          last_name: 'Teacher B',
          global_status: 'active',
        },
      ],
    });

    await prisma.academicYear.createMany({
      data: [
        {
          id: YEAR_A_ID,
          tenant_id: TENANT_A,
          name: '2025-2026 A',
          start_date: new Date('2025-09-01'),
          end_date: new Date('2026-06-30'),
          status: 'active',
        },
        {
          id: YEAR_B_ID,
          tenant_id: TENANT_B,
          name: '2025-2026 B',
          start_date: new Date('2025-09-01'),
          end_date: new Date('2026-06-30'),
          status: 'active',
        },
      ],
    });

    await prisma.academicPeriod.createMany({
      data: [
        {
          id: PERIOD_A_ID,
          tenant_id: TENANT_A,
          academic_year_id: YEAR_A_ID,
          name: 'Term 1 A',
          period_type: 'term',
          start_date: new Date('2025-09-01'),
          end_date: new Date('2025-12-15'),
          status: 'active',
        },
        {
          id: PERIOD_B_ID,
          tenant_id: TENANT_B,
          academic_year_id: YEAR_B_ID,
          name: 'Term 1 B',
          period_type: 'term',
          start_date: new Date('2025-09-01'),
          end_date: new Date('2025-12-15'),
          status: 'active',
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  afterEach(async () => {
    await prisma.reportCardTeacherRequest.deleteMany({
      where: { tenant_id: { in: [TENANT_A, TENANT_B] } },
    });
    createBatchMock.mockClear();
    generateRunMock.mockReset();
  });

  it('teacher submits a request and it appears in the admin pending list', async () => {
    const created = await service.submit(TENANT_A, TEACHER_ACTOR, {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_A_ID,
      reason: 'Need extra time for SEN students.',
    });
    expect(created.status).toBe('pending');
    expect(created.requested_by_user_id).toBe(TEACHER_A);

    const pending = await service.listPendingForReviewer(TENANT_A);
    expect(pending.map((r) => r.id)).toContain(created.id);
  });

  it('teacher cancels their own pending request', async () => {
    const created = await service.submit(TENANT_A, TEACHER_ACTOR, {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_A_ID,
      reason: 'Need extra time.',
    });

    const cancelled = await service.cancel(TENANT_A, TEACHER_ACTOR, created.id);
    expect(cancelled.status).toBe('cancelled');
  });

  it("teacher cannot cancel another teacher's request", async () => {
    const created = await service.submit(TENANT_A, TEACHER_ACTOR, {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_A_ID,
      reason: 'Need extra time.',
    });

    await expect(service.cancel(TENANT_A, OTHER_TEACHER_ACTOR, created.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('admin approves a request without auto-execute and the status transitions', async () => {
    const created = await service.submit(TENANT_A, TEACHER_ACTOR, {
      request_type: 'regenerate_reports',
      academic_period_id: PERIOD_A_ID,
      target_scope_json: { scope: 'class', ids: ['11111111-1111-1111-1111-111111111111'] },
      reason: 'Please regenerate this class.',
    });

    const result = await service.approve(TENANT_A, ADMIN_ACTOR, created.id, {
      review_note: 'Approved — routing to wizard.',
      auto_execute: false,
    });

    expect(result.request.status).toBe('approved');
    expect(result.resulting_run_id).toBeNull();
    expect(result.resulting_window_id).toBeNull();
    expect(generateRunMock).not.toHaveBeenCalled();
  });

  it('admin approves with auto_execute=true for open_comment_window and links resulting_window_id', async () => {
    const created = await service.submit(TENANT_A, TEACHER_ACTOR, {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_A_ID,
      reason: 'Reopen window for typo fix.',
    });

    const result = await service.approve(TENANT_A, ADMIN_ACTOR, created.id, {
      auto_execute: true,
    });

    // Real ReportCommentWindowsService is in the DI graph — the auto-execute
    // path must have created a real row whose id was persisted on the request.
    expect(result.resulting_window_id).not.toBeNull();
    expect(result.request.resulting_window_id).toBe(result.resulting_window_id);

    const window = await prisma.reportCommentWindow.findFirst({
      where: { tenant_id: TENANT_A, academic_period_id: PERIOD_A_ID },
    });
    expect(window).not.toBeNull();
    expect(window?.id).toBe(result.resulting_window_id);
    expect(window?.opened_by_user_id).toBe(ADMIN_A);
  });

  it('admin approves with auto_execute=true for regenerate_reports and delegates to the generation service', async () => {
    // Real generation runs require class/template/grade fixtures — that path
    // is covered in the co-located unit spec. Here we stub `generateRun` to
    // return a null batch_job_id so the FK stays null, and only assert that
    // the hand-off receives the translated scope.
    generateRunMock.mockResolvedValue({ batch_job_id: null as unknown as string });

    const scopeIds = ['22222222-2222-2222-2222-222222222222'];
    const created = await service.submit(TENANT_A, TEACHER_ACTOR, {
      request_type: 'regenerate_reports',
      academic_period_id: PERIOD_A_ID,
      target_scope_json: { scope: 'class', ids: scopeIds },
      reason: 'Please regenerate this class.',
    });

    await service.approve(TENANT_A, ADMIN_ACTOR, created.id, {
      auto_execute: true,
    });

    expect(generateRunMock).toHaveBeenCalledWith(
      TENANT_A,
      ADMIN_A,
      expect.objectContaining({
        scope: { mode: 'class', class_ids: scopeIds },
        academic_period_id: PERIOD_A_ID,
      }),
    );
  });

  it('admin rejects a request and the review note is persisted', async () => {
    const created = await service.submit(TENANT_A, TEACHER_ACTOR, {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_A_ID,
      reason: 'Late entry.',
    });

    const rejected = await service.reject(TENANT_A, ADMIN_ACTOR, created.id, {
      review_note: 'Not possible for this period — period closed.',
    });

    expect(rejected.status).toBe('rejected');
    expect(rejected.review_note).toBe('Not possible for this period — period closed.');
    expect(rejected.reviewed_by_user_id).toBe(ADMIN_A);
  });

  it('cannot approve an already-rejected request', async () => {
    const created = await service.submit(TENANT_A, TEACHER_ACTOR, {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_A_ID,
      reason: 'Late entry.',
    });

    await service.reject(TENANT_A, ADMIN_ACTOR, created.id, { review_note: 'no' });

    await expect(
      service.approve(TENANT_A, ADMIN_ACTOR, created.id, { auto_execute: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('markCompleted works on approved requests and rejects pending', async () => {
    const created = await service.submit(TENANT_A, TEACHER_ACTOR, {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_A_ID,
      reason: 'Late entry.',
    });

    await expect(service.markCompleted(TENANT_A, ADMIN_ACTOR, created.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await service.approve(TENANT_A, ADMIN_ACTOR, created.id, { auto_execute: false });
    const completed = await service.markCompleted(TENANT_A, ADMIN_ACTOR, created.id);
    expect(completed.status).toBe('completed');
  });

  it('throws NotFoundException when submitting against an unknown period', async () => {
    await expect(
      service.submit(TENANT_A, TEACHER_ACTOR, {
        request_type: 'open_comment_window',
        academic_period_id: '99999999-9999-4999-8999-999999999999',
        reason: 'Unknown period.',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── RLS / tenant isolation ───────────────────────────────────────────────

  it("tenant A cannot see tenant B's request", async () => {
    const tenantBRequest = await service.submit(TENANT_B, TEACHER_B_ACTOR, {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_B_ID,
      reason: 'Tenant B request.',
    });

    // findById scoped to tenant A should not find it.
    await expect(service.findById(TENANT_A, ADMIN_ACTOR, tenantBRequest.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    // list for tenant A (admin) should not include the tenant B row.
    const listA = await service.list(TENANT_A, ADMIN_ACTOR, { page: 1, pageSize: 100 });
    expect(listA.data.some((r) => r.id === tenantBRequest.id)).toBe(false);
  });

  it('admin sees all tenant A requests while a non-admin sees only their own', async () => {
    const own = await service.submit(TENANT_A, TEACHER_ACTOR, {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_A_ID,
      reason: 'Request by teacher A.',
    });
    const other = await service.submit(TENANT_A, OTHER_TEACHER_ACTOR, {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_A_ID,
      reason: 'Request by teacher A2.',
    });

    const listForTeacher = await service.list(TENANT_A, TEACHER_ACTOR, {
      page: 1,
      pageSize: 100,
    });
    const teacherIds = listForTeacher.data.map((r) => r.id);
    expect(teacherIds).toContain(own.id);
    expect(teacherIds).not.toContain(other.id);

    const listForAdmin = await service.list(TENANT_A, ADMIN_ACTOR, { page: 1, pageSize: 100 });
    const adminIds = listForAdmin.data.map((r) => r.id);
    expect(adminIds).toContain(own.id);
    expect(adminIds).toContain(other.id);
  });
});
