import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

import type { CreateSubjectCommentDto } from './dto/subject-comment.dto';
import { ReportCardSubjectCommentsService } from './report-card-subject-comments.service';
import { ReportCommentWindowsService } from './report-comment-windows.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEACHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ADMIN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTHER_TEACHER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CLASS_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const SUBJECT_ID = '11111111-1111-1111-1111-111111111111';
const PERIOD_ID = '22222222-2222-2222-2222-222222222222';
const COMMENT_ID = '33333333-3333-3333-3333-333333333333';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCardSubjectComment: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
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
    reportCardSubjectComment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

const mockWindowsService = {
  assertWindowOpenForPeriod: jest.fn(),
};

const mockClassesReadFacade = {
  findById: jest.fn(),
  findClassStaffGeneric: jest.fn(),
};

const baseComment = {
  id: COMMENT_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  subject_id: SUBJECT_ID,
  class_id: CLASS_ID,
  academic_period_id: PERIOD_ID,
  author_user_id: TEACHER_ID,
  comment_text: 'Good effort this term.',
  is_ai_draft: false,
  finalised_at: null,
  finalised_by_user_id: null,
  last_ai_drafted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('ReportCardSubjectCommentsService', () => {
  let service: ReportCardSubjectCommentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardSubjectComment.findFirst.mockReset();
    mockRlsTx.reportCardSubjectComment.create.mockReset();
    mockRlsTx.reportCardSubjectComment.update.mockReset();
    mockRlsTx.reportCardSubjectComment.updateMany.mockReset();
    mockWindowsService.assertWindowOpenForPeriod.mockReset().mockResolvedValue(undefined);
    mockClassesReadFacade.findById.mockReset();
    mockClassesReadFacade.findClassStaffGeneric.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardSubjectCommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ReportCommentWindowsService, useValue: mockWindowsService },
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
      ],
    }).compile();

    service = module.get<ReportCardSubjectCommentsService>(ReportCardSubjectCommentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── upsert ────────────────────────────────────────────────────────────────

  describe('upsert', () => {
    const dto: CreateSubjectCommentDto = {
      student_id: STUDENT_ID,
      subject_id: SUBJECT_ID,
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
      comment_text: 'Excellent progress.',
      is_ai_draft: false,
    };

    it('should create a new comment when none exists', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });
      mockClassesReadFacade.findClassStaffGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockRlsTx.reportCardSubjectComment.findFirst.mockResolvedValue(null);
      mockRlsTx.reportCardSubjectComment.create.mockResolvedValue(baseComment);

      const result = await service.upsert(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, dto);
      expect(result).toEqual(baseComment);
      expect(mockWindowsService.assertWindowOpenForPeriod).toHaveBeenCalledWith(
        TENANT_ID,
        PERIOD_ID,
      );
      expect(mockRlsTx.reportCardSubjectComment.create).toHaveBeenCalled();
    });

    it('should update and clear finalisation when comment already exists', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });
      mockClassesReadFacade.findClassStaffGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockRlsTx.reportCardSubjectComment.findFirst.mockResolvedValue({
        ...baseComment,
        finalised_at: new Date(),
        finalised_by_user_id: TEACHER_ID,
      });
      mockRlsTx.reportCardSubjectComment.update.mockResolvedValue(baseComment);

      await service.upsert(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, dto);
      expect(mockRlsTx.reportCardSubjectComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            finalised_at: null,
            finalised_by_user_id: null,
            comment_text: 'Excellent progress.',
          }),
        }),
      );
    });

    it('should reject when the window is closed', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });
      mockClassesReadFacade.findClassStaffGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockWindowsService.assertWindowOpenForPeriod.mockRejectedValue(
        new ForbiddenException({ code: 'COMMENT_WINDOW_CLOSED', message: 'closed' }),
      );
      await expect(
        service.upsert(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, dto),
      ).rejects.toMatchObject({
        response: { code: 'COMMENT_WINDOW_CLOSED' },
      });
    });

    it('should reject when the teacher is not assigned to the class', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });
      mockClassesReadFacade.findClassStaffGeneric.mockResolvedValue([]);
      await expect(
        service.upsert(TENANT_ID, { userId: OTHER_TEACHER_ID, isAdmin: false }, dto),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_AUTHOR' },
      });
      // Window check should NOT fire when authorship fails
      expect(mockWindowsService.assertWindowOpenForPeriod).not.toHaveBeenCalled();
    });

    it('should reject when the class subject mismatches the dto subject', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({
        id: CLASS_ID,
        subject_id: 'different-subject',
      });
      await expect(
        service.upsert(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, dto),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_AUTHOR' },
      });
    });

    it('should reject when the class does not exist', async () => {
      mockClassesReadFacade.findById.mockResolvedValue(null);
      await expect(
        service.upsert(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should bypass authorship check for admins', async () => {
      mockRlsTx.reportCardSubjectComment.findFirst.mockResolvedValue(null);
      mockRlsTx.reportCardSubjectComment.create.mockResolvedValue(baseComment);
      await service.upsert(TENANT_ID, { userId: ADMIN_ID, isAdmin: true }, dto);
      expect(mockClassesReadFacade.findById).not.toHaveBeenCalled();
      expect(mockRlsTx.reportCardSubjectComment.create).toHaveBeenCalled();
    });
  });

  // ─── finalise ──────────────────────────────────────────────────────────────

  describe('finalise', () => {
    beforeEach(() => {
      mockPrisma.reportCardSubjectComment.findFirst.mockResolvedValue(baseComment);
      mockClassesReadFacade.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });
      mockClassesReadFacade.findClassStaffGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockRlsTx.reportCardSubjectComment.update.mockResolvedValue({
        ...baseComment,
        finalised_at: new Date(),
      });
    });

    it('should finalise a non-empty comment', async () => {
      const result = await service.finalise(
        TENANT_ID,
        { userId: TEACHER_ID, isAdmin: false },
        COMMENT_ID,
      );
      expect(result.finalised_at).toBeDefined();
      expect(mockRlsTx.reportCardSubjectComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ finalised_by_user_id: TEACHER_ID }),
        }),
      );
    });

    it('should reject finalising an empty comment', async () => {
      mockPrisma.reportCardSubjectComment.findFirst.mockResolvedValue({
        ...baseComment,
        comment_text: '   ',
      });
      await expect(
        service.finalise(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, COMMENT_ID),
      ).rejects.toMatchObject({ response: { code: 'CANNOT_FINALISE_EMPTY_COMMENT' } });
    });

    it('should reject when window is closed', async () => {
      mockWindowsService.assertWindowOpenForPeriod.mockRejectedValue(
        new ForbiddenException({ code: 'COMMENT_WINDOW_CLOSED', message: 'closed' }),
      );
      await expect(
        service.finalise(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, COMMENT_ID),
      ).rejects.toMatchObject({ response: { code: 'COMMENT_WINDOW_CLOSED' } });
    });

    it('should 404 when the comment does not exist', async () => {
      mockPrisma.reportCardSubjectComment.findFirst.mockResolvedValue(null);
      await expect(
        service.finalise(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, COMMENT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── unfinalise ────────────────────────────────────────────────────────────

  describe('unfinalise', () => {
    beforeEach(() => {
      mockClassesReadFacade.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });
      mockClassesReadFacade.findClassStaffGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockRlsTx.reportCardSubjectComment.update.mockResolvedValue(baseComment);
    });

    it('should allow the original finaliser to unfinalise', async () => {
      mockPrisma.reportCardSubjectComment.findFirst.mockResolvedValue({
        ...baseComment,
        finalised_at: new Date(),
        finalised_by_user_id: TEACHER_ID,
      });
      await service.unfinalise(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, COMMENT_ID);
      expect(mockRlsTx.reportCardSubjectComment.update).toHaveBeenCalled();
    });

    it('should allow an admin to unfinalise someone else', async () => {
      mockPrisma.reportCardSubjectComment.findFirst.mockResolvedValue({
        ...baseComment,
        finalised_at: new Date(),
        finalised_by_user_id: TEACHER_ID,
      });
      await service.unfinalise(TENANT_ID, { userId: ADMIN_ID, isAdmin: true }, COMMENT_ID);
      expect(mockRlsTx.reportCardSubjectComment.update).toHaveBeenCalled();
    });

    it("should reject a teacher unfinalising another teacher's finalisation", async () => {
      mockPrisma.reportCardSubjectComment.findFirst.mockResolvedValue({
        ...baseComment,
        finalised_at: new Date(),
        finalised_by_user_id: OTHER_TEACHER_ID,
      });
      await expect(
        service.unfinalise(TENANT_ID, { userId: TEACHER_ID, isAdmin: false }, COMMENT_ID),
      ).rejects.toMatchObject({ response: { code: 'INVALID_UNFINALISE_ACTOR' } });
    });
  });

  // ─── bulkFinalise ──────────────────────────────────────────────────────────

  describe('bulkFinalise', () => {
    beforeEach(() => {
      mockClassesReadFacade.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });
      mockClassesReadFacade.findClassStaffGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockRlsTx.reportCardSubjectComment.updateMany.mockResolvedValue({ count: 5 });
    });

    it('should finalise all non-empty unfinalised comments for the scope', async () => {
      const count = await service.bulkFinalise(
        TENANT_ID,
        { userId: TEACHER_ID, isAdmin: false },
        { classId: CLASS_ID, subjectId: SUBJECT_ID, academicPeriodId: PERIOD_ID },
      );
      expect(count).toBe(5);
      expect(mockRlsTx.reportCardSubjectComment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            class_id: CLASS_ID,
            subject_id: SUBJECT_ID,
            academic_period_id: PERIOD_ID,
            finalised_at: null,
          }),
        }),
      );
    });

    it('should reject when window is closed', async () => {
      mockWindowsService.assertWindowOpenForPeriod.mockRejectedValue(
        new ForbiddenException({ code: 'COMMENT_WINDOW_CLOSED', message: 'closed' }),
      );
      await expect(
        service.bulkFinalise(
          TENANT_ID,
          { userId: TEACHER_ID, isAdmin: false },
          { classId: CLASS_ID, subjectId: SUBJECT_ID, academicPeriodId: PERIOD_ID },
        ),
      ).rejects.toMatchObject({ response: { code: 'COMMENT_WINDOW_CLOSED' } });
    });
  });

  // ─── list / countByClassSubjectPeriod ──────────────────────────────────────

  describe('list / count', () => {
    it('should paginate and filter by classId and finalised state', async () => {
      mockPrisma.reportCardSubjectComment.findMany.mockResolvedValue([baseComment]);
      mockPrisma.reportCardSubjectComment.count.mockResolvedValue(1);
      const result = await service.list(TENANT_ID, {
        class_id: CLASS_ID,
        finalised: true,
      });
      expect(result.meta.total).toBe(1);
      expect(mockPrisma.reportCardSubjectComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            class_id: CLASS_ID,
            finalised_at: { not: null },
          }),
        }),
      );
    });

    it('should count finalised and total for a class/subject/period', async () => {
      mockPrisma.reportCardSubjectComment.count.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
      const result = await service.countByClassSubjectPeriod(TENANT_ID, {
        classId: CLASS_ID,
        subjectId: SUBJECT_ID,
        academicPeriodId: PERIOD_ID,
      });
      expect(result).toEqual({ total: 10, finalised: 4 });
    });
  });
});
