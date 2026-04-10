import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import type { CreateOverallCommentDto } from './dto/overall-comment.dto';
import { ReportCardOverallCommentsService } from './report-card-overall-comments.service';
import { ReportCommentWindowsService } from './report-comment-windows.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOMEROOM_TEACHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const HOMEROOM_STAFF_ID = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2';
const OTHER_TEACHER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ADMIN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CLASS_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const PERIOD_ID = '11111111-1111-1111-1111-111111111111';
const YEAR_ID = '99999999-9999-9999-9999-999999999999';
const COMMENT_ID = '22222222-2222-2222-2222-222222222222';
const WINDOW_ID = '33333333-3333-3333-3333-333333333333';

const mockRlsTx = {
  reportCardOverallComment: {
    findFirst: jest.fn(),
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
    reportCardOverallComment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

const mockWindowsService = {
  resolveCommentScope: jest.fn(),
  assertWindowOpen: jest.fn(),
  // Round-2 QA: homeroom assignment is per-window, not per-class. Default to
  // returning the canonical homeroom teacher; tests override per case.
  getHomeroomTeacherForClass: jest.fn(),
};

const baseComment = {
  id: COMMENT_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  class_id: CLASS_ID,
  academic_period_id: PERIOD_ID as string | null,
  academic_year_id: YEAR_ID,
  author_user_id: HOMEROOM_TEACHER_ID,
  comment_text: 'A strong student overall.',
  finalised_at: null,
  finalised_by_user_id: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const HOMEROOM_RESULT = {
  staff_profile_id: HOMEROOM_STAFF_ID,
  user_id: HOMEROOM_TEACHER_ID,
  comment_window_id: WINDOW_ID,
};

describe('ReportCardOverallCommentsService', () => {
  let service: ReportCardOverallCommentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardOverallComment.findFirst.mockReset();
    mockRlsTx.reportCardOverallComment.create.mockReset();
    mockRlsTx.reportCardOverallComment.update.mockReset();
    mockWindowsService.assertWindowOpen.mockReset().mockResolvedValue(undefined);
    mockWindowsService.getHomeroomTeacherForClass.mockReset().mockResolvedValue(HOMEROOM_RESULT);
    // Default: per-period scope. Tests that exercise full-year override
    // this on a per-test basis.
    mockWindowsService.resolveCommentScope
      .mockReset()
      .mockImplementation(
        async (
          _tenantId: string,
          input: { academic_period_id?: string | null; academic_year_id?: string | null },
        ) => {
          if (input.academic_period_id) {
            return { periodId: input.academic_period_id, yearId: 'year-from-period' };
          }
          if (input.academic_year_id) {
            return { periodId: null, yearId: input.academic_year_id };
          }
          throw new Error('PERIOD_OR_YEAR_REQUIRED');
        },
      );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardOverallCommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ReportCommentWindowsService, useValue: mockWindowsService },
      ],
    }).compile();

    service = module.get<ReportCardOverallCommentsService>(ReportCardOverallCommentsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('upsert', () => {
    const dto: CreateOverallCommentDto = {
      student_id: STUDENT_ID,
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
      comment_text: 'Excellent work this term.',
    };

    it('should create a new overall comment as homeroom teacher', async () => {
      mockRlsTx.reportCardOverallComment.findFirst.mockResolvedValue(null);
      mockRlsTx.reportCardOverallComment.create.mockResolvedValue(baseComment);

      const result = await service.upsert(
        TENANT_ID,
        { userId: HOMEROOM_TEACHER_ID, isAdmin: false },
        dto,
      );
      expect(result).toEqual(baseComment);
      expect(mockWindowsService.assertWindowOpen).toHaveBeenCalled();
      expect(mockWindowsService.getHomeroomTeacherForClass).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ periodId: PERIOD_ID }),
        CLASS_ID,
      );
    });

    it('should reject a non-homeroom teacher', async () => {
      // Window is open and a different teacher is the assigned homeroom for
      // this class. The actor should be rejected with INVALID_AUTHOR.
      mockWindowsService.getHomeroomTeacherForClass.mockResolvedValueOnce(HOMEROOM_RESULT);
      await expect(
        service.upsert(TENANT_ID, { userId: OTHER_TEACHER_ID, isAdmin: false }, dto),
      ).rejects.toMatchObject({ response: { code: 'INVALID_AUTHOR' } });
    });

    it('should reject when no homeroom is assigned for this class on the open window', async () => {
      // Admin opened the window without picking a teacher for this class.
      mockWindowsService.getHomeroomTeacherForClass.mockResolvedValueOnce(null);
      await expect(
        service.upsert(TENANT_ID, { userId: HOMEROOM_TEACHER_ID, isAdmin: false }, dto),
      ).rejects.toMatchObject({ response: { code: 'INVALID_AUTHOR' } });
    });

    it('should allow admins to override homeroom check', async () => {
      mockRlsTx.reportCardOverallComment.findFirst.mockResolvedValue(null);
      mockRlsTx.reportCardOverallComment.create.mockResolvedValue(baseComment);
      await service.upsert(TENANT_ID, { userId: ADMIN_ID, isAdmin: true }, dto);
      // Admins bypass — the homeroom lookup should never fire.
      expect(mockWindowsService.getHomeroomTeacherForClass).not.toHaveBeenCalled();
      expect(mockRlsTx.reportCardOverallComment.create).toHaveBeenCalled();
    });

    it('should reject when window is closed', async () => {
      mockWindowsService.assertWindowOpen.mockRejectedValueOnce(
        new ForbiddenException({ code: 'COMMENT_WINDOW_CLOSED', message: 'closed' }),
      );
      await expect(
        service.upsert(TENANT_ID, { userId: HOMEROOM_TEACHER_ID, isAdmin: false }, dto),
      ).rejects.toMatchObject({ response: { code: 'COMMENT_WINDOW_CLOSED' } });
      // Window check is now ordered before the homeroom lookup, so the
      // homeroom helper should not have been called.
      expect(mockWindowsService.getHomeroomTeacherForClass).not.toHaveBeenCalled();
    });

    it('should update and clear finalisation when comment exists', async () => {
      mockRlsTx.reportCardOverallComment.findFirst.mockResolvedValue({
        ...baseComment,
        finalised_at: new Date(),
        finalised_by_user_id: HOMEROOM_TEACHER_ID,
      });
      mockRlsTx.reportCardOverallComment.update.mockResolvedValue(baseComment);

      await service.upsert(TENANT_ID, { userId: HOMEROOM_TEACHER_ID, isAdmin: false }, dto);
      expect(mockRlsTx.reportCardOverallComment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            finalised_at: null,
            finalised_by_user_id: null,
          }),
        }),
      );
    });
  });

  describe('finalise', () => {
    it('should finalise a non-empty comment', async () => {
      mockPrisma.reportCardOverallComment.findFirst.mockResolvedValue(baseComment);
      mockRlsTx.reportCardOverallComment.update.mockResolvedValue({
        ...baseComment,
        finalised_at: new Date(),
      });

      const result = await service.finalise(
        TENANT_ID,
        { userId: HOMEROOM_TEACHER_ID, isAdmin: false },
        COMMENT_ID,
      );
      expect(result.finalised_at).toBeDefined();
    });

    it('should reject finalising empty text', async () => {
      mockPrisma.reportCardOverallComment.findFirst.mockResolvedValue({
        ...baseComment,
        comment_text: '',
      });
      await expect(
        service.finalise(TENANT_ID, { userId: HOMEROOM_TEACHER_ID, isAdmin: false }, COMMENT_ID),
      ).rejects.toMatchObject({ response: { code: 'CANNOT_FINALISE_EMPTY_COMMENT' } });
    });

    it('should 404 when comment missing', async () => {
      mockPrisma.reportCardOverallComment.findFirst.mockResolvedValue(null);
      await expect(
        service.finalise(TENANT_ID, { userId: HOMEROOM_TEACHER_ID, isAdmin: false }, COMMENT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('unfinalise', () => {
    it("should reject a teacher unfinalising someone else's finalisation", async () => {
      mockPrisma.reportCardOverallComment.findFirst.mockResolvedValue({
        ...baseComment,
        finalised_at: new Date(),
        finalised_by_user_id: OTHER_TEACHER_ID,
      });
      await expect(
        service.unfinalise(TENANT_ID, { userId: HOMEROOM_TEACHER_ID, isAdmin: false }, COMMENT_ID),
      ).rejects.toMatchObject({ response: { code: 'INVALID_UNFINALISE_ACTOR' } });
    });
  });
});
