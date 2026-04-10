import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { AuthReadFacade } from '../../auth/auth-read.facade';
import { NotificationsService } from '../../communications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacReadFacade } from '../../rbac/rbac-read.facade';

import type { SubmitTeacherRequestDto } from './dto/teacher-request.dto';
import { ReportCardGenerationService } from './report-card-generation.service';
import { ReportCardTeacherRequestsService } from './report-card-teacher-requests.service';
import { ReportCommentWindowsService } from './report-comment-windows.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEACHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OTHER_TEACHER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ADMIN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PERIOD_ID = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const RUN_ID = '44444444-4444-4444-4444-444444444444';
const WINDOW_ID = '55555555-5555-5555-5555-555555555555';
const ANOTHER_REQUEST_ID = '66666666-6666-6666-6666-666666666666';

const TEACHER_ACTOR = { userId: TEACHER_ID, isAdmin: false };
const OTHER_TEACHER_ACTOR = { userId: OTHER_TEACHER_ID, isAdmin: false };
const ADMIN_ACTOR = { userId: ADMIN_ID, isAdmin: true };

const basePendingRequest = {
  id: REQUEST_ID,
  tenant_id: TENANT_ID,
  requested_by_user_id: TEACHER_ID,
  request_type: 'open_comment_window' as const,
  academic_period_id: PERIOD_ID,
  target_scope_json: null,
  reason: 'Two students were absent during the first window.',
  status: 'pending' as const,
  reviewed_by_user_id: null,
  reviewed_at: null,
  review_note: null,
  resulting_run_id: null,
  resulting_window_id: null,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCardTeacherRequest: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

function buildMockPrisma() {
  return {
    reportCardTeacherRequest: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

const mockAcademicReadFacade = {
  findPeriodById: jest.fn(),
};

// hydrateUserInfo goes through AuthReadFacade.findUsersByIds rather than
// touching the platform-level `user` table directly. Default to an empty
// array so existing tests don't care about user hydration — they only
// check the request rows.
const mockAuthReadFacade = {
  findUsersByIds: jest.fn().mockResolvedValue([]),
};

const mockNotificationsService = {
  createBatch: jest.fn(),
};

const mockRbacReadFacade = {
  findMembershipsWithPermissionAndUser: jest.fn(),
};

const mockCommentWindowsService = {
  open: jest.fn(),
  // B14: auto-execute open_comment_window now carries forward the
  // homeroom assignments from the most recent prior window so the
  // reopened window isn't empty. Default to [] — tests that cover the
  // carry-forward path override this.
  findLatestHomeroomAssignmentsForScope: jest.fn().mockResolvedValue([]),
};

const mockGenerationService = {
  generateRun: jest.fn(),
};

describe('ReportCardTeacherRequestsService', () => {
  let service: ReportCardTeacherRequestsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardTeacherRequest.create.mockReset();
    mockRlsTx.reportCardTeacherRequest.update.mockReset();
    mockAcademicReadFacade.findPeriodById.mockReset();
    mockAuthReadFacade.findUsersByIds.mockReset().mockResolvedValue([]);
    mockNotificationsService.createBatch.mockReset().mockResolvedValue(undefined);
    mockRbacReadFacade.findMembershipsWithPermissionAndUser.mockReset().mockResolvedValue([]);
    mockCommentWindowsService.open.mockReset();
    mockCommentWindowsService.findLatestHomeroomAssignmentsForScope
      .mockReset()
      .mockResolvedValue([]);
    mockGenerationService.generateRun.mockReset();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTeacherRequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AcademicReadFacade, useValue: mockAcademicReadFacade },
        { provide: AuthReadFacade, useValue: mockAuthReadFacade },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: RbacReadFacade, useValue: mockRbacReadFacade },
        { provide: ReportCommentWindowsService, useValue: mockCommentWindowsService },
        { provide: ReportCardGenerationService, useValue: mockGenerationService },
      ],
    }).compile();

    service = moduleRef.get<ReportCardTeacherRequestsService>(ReportCardTeacherRequestsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── submit ────────────────────────────────────────────────────────────────

  describe('submit', () => {
    const openWindowDto: SubmitTeacherRequestDto = {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_ID,
      reason: 'Two students were absent during the first window.',
    };

    it('should create a pending request and notify all admin reviewers', async () => {
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
      mockRlsTx.reportCardTeacherRequest.create.mockResolvedValue(basePendingRequest);
      mockRbacReadFacade.findMembershipsWithPermissionAndUser.mockResolvedValue([
        { user_id: ADMIN_ID, user: { first_name: 'Adah', last_name: 'Admin' } },
      ]);

      const result = await service.submit(TENANT_ID, TEACHER_ACTOR, openWindowDto);

      expect(result).toEqual(basePendingRequest);
      expect(mockAcademicReadFacade.findPeriodById).toHaveBeenCalledWith(TENANT_ID, PERIOD_ID);
      expect(mockRlsTx.reportCardTeacherRequest.create).toHaveBeenCalledTimes(1);
      expect(mockRbacReadFacade.findMembershipsWithPermissionAndUser).toHaveBeenCalledWith(
        TENANT_ID,
        'report_cards.manage',
      );
      expect(mockNotificationsService.createBatch).toHaveBeenCalledWith(
        TENANT_ID,
        expect.arrayContaining([
          expect.objectContaining({
            recipient_user_id: ADMIN_ID,
            source_entity_type: 'report_card_teacher_request',
            source_entity_id: REQUEST_ID,
            template_key: 'report_cards.teacher_request_submitted',
          }),
        ]),
      );
    });

    it('should throw NotFoundException when the academic period does not exist', async () => {
      mockAcademicReadFacade.findPeriodById.mockResolvedValue(null);

      await expect(service.submit(TENANT_ID, TEACHER_ACTOR, openWindowDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRlsTx.reportCardTeacherRequest.create).not.toHaveBeenCalled();
    });

    it('should persist target_scope_json for regenerate requests', async () => {
      const dto: SubmitTeacherRequestDto = {
        request_type: 'regenerate_reports',
        academic_period_id: PERIOD_ID,
        target_scope_json: { scope: 'student', ids: [STUDENT_ID] },
        reason: 'Grade correction for this student.',
      };
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
      mockRlsTx.reportCardTeacherRequest.create.mockResolvedValue({
        ...basePendingRequest,
        request_type: 'regenerate_reports',
        target_scope_json: { scope: 'student', ids: [STUDENT_ID] },
      });

      await service.submit(TENANT_ID, TEACHER_ACTOR, dto);

      const createCall = mockRlsTx.reportCardTeacherRequest.create.mock.calls[0][0];
      expect(createCall.data.target_scope_json).toEqual({ scope: 'student', ids: [STUDENT_ID] });
      expect(createCall.data.request_type).toBe('regenerate_reports');
    });

    it('should still return the created request when reviewer notification fails', async () => {
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
      mockRlsTx.reportCardTeacherRequest.create.mockResolvedValue(basePendingRequest);
      mockRbacReadFacade.findMembershipsWithPermissionAndUser.mockResolvedValue([
        { user_id: ADMIN_ID, user: { first_name: 'Adah', last_name: 'Admin' } },
      ]);
      mockNotificationsService.createBatch.mockRejectedValue(new Error('redis down'));

      const result = await service.submit(TENANT_ID, TEACHER_ACTOR, openWindowDto);
      expect(result).toEqual(basePendingRequest);
    });
  });

  // ─── cancel ────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it("should cancel the teacher's own pending request", async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(basePendingRequest);
      mockRlsTx.reportCardTeacherRequest.update.mockResolvedValue({
        ...basePendingRequest,
        status: 'cancelled',
      });

      const result = await service.cancel(TENANT_ID, TEACHER_ACTOR, REQUEST_ID);
      expect(result.status).toBe('cancelled');
    });

    it("should throw ForbiddenException when cancelling another teacher's request", async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(basePendingRequest);

      await expect(service.cancel(TENANT_ID, OTHER_TEACHER_ACTOR, REQUEST_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRlsTx.reportCardTeacherRequest.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the request does not exist', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(null);

      await expect(service.cancel(TENANT_ID, TEACHER_ACTOR, REQUEST_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when cancelling an already-approved request', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue({
        ...basePendingRequest,
        status: 'approved',
      });

      await expect(service.cancel(TENANT_ID, TEACHER_ACTOR, REQUEST_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── approve ───────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('should transition the request to approved without auto-executing', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(basePendingRequest);
      mockRlsTx.reportCardTeacherRequest.update.mockResolvedValue({
        ...basePendingRequest,
        status: 'approved',
        reviewed_by_user_id: ADMIN_ID,
        review_note: 'Approved.',
      });

      const result = await service.approve(TENANT_ID, ADMIN_ACTOR, REQUEST_ID, {
        review_note: 'Approved.',
        auto_execute: false,
      });

      expect(result.request.status).toBe('approved');
      expect(result.resulting_window_id).toBeNull();
      expect(result.resulting_run_id).toBeNull();
      expect(mockCommentWindowsService.open).not.toHaveBeenCalled();
      expect(mockGenerationService.generateRun).not.toHaveBeenCalled();
      expect(mockNotificationsService.createBatch).toHaveBeenCalled();
    });

    it('should auto-execute open_comment_window and link the resulting window id', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(basePendingRequest);
      mockCommentWindowsService.open.mockResolvedValue({ id: WINDOW_ID });
      // B14: simulate a prior window with two homeroom assignments that
      // should be carried forward onto the newly-opened window.
      mockCommentWindowsService.findLatestHomeroomAssignmentsForScope.mockResolvedValueOnce([
        { class_id: 'class-2a', homeroom_teacher_staff_id: 'staff-sarah' },
        { class_id: 'class-3b', homeroom_teacher_staff_id: 'staff-aiden' },
      ]);
      mockRlsTx.reportCardTeacherRequest.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...basePendingRequest,
          ...args.data,
        }),
      );

      const result = await service.approve(TENANT_ID, ADMIN_ACTOR, REQUEST_ID, {
        auto_execute: true,
      });

      expect(mockCommentWindowsService.findLatestHomeroomAssignmentsForScope).toHaveBeenCalledWith(
        TENANT_ID,
        {
          periodId: PERIOD_ID,
          yearId: basePendingRequest.academic_year_id,
        },
      );
      expect(mockCommentWindowsService.open).toHaveBeenCalledWith(
        TENANT_ID,
        ADMIN_ID,
        expect.objectContaining({
          academic_period_id: PERIOD_ID,
          homeroom_assignments: [
            { class_id: 'class-2a', homeroom_teacher_staff_id: 'staff-sarah' },
            { class_id: 'class-3b', homeroom_teacher_staff_id: 'staff-aiden' },
          ],
        }),
      );
      expect(result.resulting_window_id).toBe(WINDOW_ID);
      expect(result.resulting_run_id).toBeNull();
      expect(result.request.resulting_window_id).toBe(WINDOW_ID);
    });

    it('should auto-execute regenerate_reports and link the resulting run id', async () => {
      const regenerateRequest = {
        ...basePendingRequest,
        request_type: 'regenerate_reports' as const,
        target_scope_json: { scope: 'class', ids: ['class-1'] },
      };
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(regenerateRequest);
      mockGenerationService.generateRun.mockResolvedValue({ batch_job_id: RUN_ID });
      mockRlsTx.reportCardTeacherRequest.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...regenerateRequest,
          ...args.data,
        }),
      );

      const result = await service.approve(TENANT_ID, ADMIN_ACTOR, REQUEST_ID, {
        auto_execute: true,
      });

      expect(mockGenerationService.generateRun).toHaveBeenCalledWith(
        TENANT_ID,
        ADMIN_ID,
        expect.objectContaining({
          scope: { mode: 'class', class_ids: ['class-1'] },
          academic_period_id: PERIOD_ID,
          content_scope: 'grades_only',
        }),
      );
      expect(result.resulting_run_id).toBe(RUN_ID);
      expect(result.resulting_window_id).toBeNull();
    });

    it('should leave the request untouched when auto-execute fails downstream', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(basePendingRequest);
      mockCommentWindowsService.open.mockRejectedValue(new Error('window collision'));

      await expect(
        service.approve(TENANT_ID, ADMIN_ACTOR, REQUEST_ID, { auto_execute: true }),
      ).rejects.toThrow('window collision');
      expect(mockRlsTx.reportCardTeacherRequest.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when approving a non-pending request', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue({
        ...basePendingRequest,
        status: 'rejected',
      });

      await expect(
        service.approve(TENANT_ID, ADMIN_ACTOR, REQUEST_ID, { auto_execute: false }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when the request does not exist', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.approve(TENANT_ID, ADMIN_ACTOR, REQUEST_ID, { auto_execute: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── reject ────────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('should transition to rejected and persist the review note', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(basePendingRequest);
      mockRlsTx.reportCardTeacherRequest.update.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          ...basePendingRequest,
          ...args.data,
        }),
      );

      const result = await service.reject(TENANT_ID, ADMIN_ACTOR, REQUEST_ID, {
        review_note: 'Out of scope for this period.',
      });

      expect(result.status).toBe('rejected');
      expect(result.review_note).toBe('Out of scope for this period.');
      expect(result.reviewed_by_user_id).toBe(ADMIN_ID);
      expect(mockNotificationsService.createBatch).toHaveBeenCalledWith(
        TENANT_ID,
        expect.arrayContaining([
          expect.objectContaining({
            recipient_user_id: TEACHER_ID,
            template_key: 'report_cards.teacher_request_rejected',
          }),
        ]),
      );
    });

    it('should throw BadRequestException when rejecting an already-rejected request', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue({
        ...basePendingRequest,
        status: 'rejected',
      });

      await expect(
        service.reject(TENANT_ID, ADMIN_ACTOR, REQUEST_ID, { review_note: 'nope' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── markCompleted ─────────────────────────────────────────────────────────

  describe('markCompleted', () => {
    it('should transition approved → completed', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue({
        ...basePendingRequest,
        status: 'approved',
      });
      mockRlsTx.reportCardTeacherRequest.update.mockResolvedValue({
        ...basePendingRequest,
        status: 'completed',
      });

      const result = await service.markCompleted(TENANT_ID, ADMIN_ACTOR, REQUEST_ID);
      expect(result.status).toBe('completed');
    });

    it('should throw BadRequestException when marking a pending request completed', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(basePendingRequest);

      await expect(service.markCompleted(TENANT_ID, ADMIN_ACTOR, REQUEST_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should scope non-admin callers to their own requests', async () => {
      mockPrisma.reportCardTeacherRequest.findMany.mockResolvedValue([basePendingRequest]);
      mockPrisma.reportCardTeacherRequest.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, TEACHER_ACTOR, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.reportCardTeacherRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            requested_by_user_id: TEACHER_ID,
          }),
        }),
      );
    });

    it('should allow admins to see every tenant request by default', async () => {
      mockPrisma.reportCardTeacherRequest.findMany.mockResolvedValue([
        basePendingRequest,
        { ...basePendingRequest, id: ANOTHER_REQUEST_ID, requested_by_user_id: OTHER_TEACHER_ID },
      ]);
      mockPrisma.reportCardTeacherRequest.count.mockResolvedValue(2);

      const result = await service.list(TENANT_ID, ADMIN_ACTOR, { page: 1, pageSize: 20 });
      expect(result.meta.total).toBe(2);
      const whereArg = mockPrisma.reportCardTeacherRequest.findMany.mock.calls[0][0].where;
      expect(whereArg.requested_by_user_id).toBeUndefined();
    });

    it('should honour my=true for an admin viewer', async () => {
      mockPrisma.reportCardTeacherRequest.findMany.mockResolvedValue([]);
      mockPrisma.reportCardTeacherRequest.count.mockResolvedValue(0);

      await service.list(TENANT_ID, ADMIN_ACTOR, { page: 1, pageSize: 20, my: true });
      const whereArg = mockPrisma.reportCardTeacherRequest.findMany.mock.calls[0][0].where;
      expect(whereArg.requested_by_user_id).toBe(ADMIN_ID);
    });

    it('should filter by status when provided', async () => {
      mockPrisma.reportCardTeacherRequest.findMany.mockResolvedValue([]);
      mockPrisma.reportCardTeacherRequest.count.mockResolvedValue(0);

      await service.list(TENANT_ID, ADMIN_ACTOR, {
        page: 1,
        pageSize: 20,
        status: 'pending',
      });
      const whereArg = mockPrisma.reportCardTeacherRequest.findMany.mock.calls[0][0].where;
      expect(whereArg.status).toBe('pending');
    });
  });

  // ─── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return the request to its author', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(basePendingRequest);
      const result = await service.findById(TENANT_ID, TEACHER_ACTOR, REQUEST_ID);
      expect(result.id).toBe(REQUEST_ID);
    });

    it('should return any request to an admin', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(basePendingRequest);
      const result = await service.findById(TENANT_ID, ADMIN_ACTOR, REQUEST_ID);
      expect(result.id).toBe(REQUEST_ID);
    });

    it("should hide another teacher's request from a non-admin", async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(basePendingRequest);
      await expect(service.findById(TENANT_ID, OTHER_TEACHER_ACTOR, REQUEST_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when missing', async () => {
      mockPrisma.reportCardTeacherRequest.findFirst.mockResolvedValue(null);
      await expect(service.findById(TENANT_ID, ADMIN_ACTOR, REQUEST_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
