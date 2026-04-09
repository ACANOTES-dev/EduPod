import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { ReportCardAiDraftService } from './report-card-ai-draft.service';
import { ReportCardSubjectCommentsController } from './report-card-subject-comments.controller';
import { ReportCardSubjectCommentsService } from './report-card-subject-comments.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CLASS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SUBJECT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const PERIOD_ID = '11111111-1111-1111-1111-111111111111';
const COMMENT_ID = '22222222-2222-2222-2222-222222222222';

const tenantContext = { tenant_id: TENANT_ID };
const jwtUser: JwtPayload = {
  sub: USER_ID,
  email: 'teacher@school.test',
  tenant_id: TENANT_ID,
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockCommentsService = {
  list: jest.fn(),
  findById: jest.fn(),
  countByClassSubjectPeriod: jest.fn(),
  upsert: jest.fn(),
  finalise: jest.fn(),
  unfinalise: jest.fn(),
  bulkFinalise: jest.fn(),
};

const mockAiDraftService = {
  draftSubjectComment: jest.fn(),
};

const mockPermissionCacheService = {
  getPermissions: jest.fn(),
};

describe('ReportCardSubjectCommentsController', () => {
  let controller: ReportCardSubjectCommentsController;

  beforeEach(async () => {
    mockCommentsService.list.mockReset();
    mockCommentsService.findById.mockReset();
    mockCommentsService.countByClassSubjectPeriod.mockReset();
    mockCommentsService.upsert.mockReset();
    mockCommentsService.finalise.mockReset();
    mockCommentsService.unfinalise.mockReset();
    mockCommentsService.bulkFinalise.mockReset();
    mockAiDraftService.draftSubjectComment.mockReset();
    mockPermissionCacheService.getPermissions
      .mockReset()
      .mockResolvedValue(['report_cards.comment']);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportCardSubjectCommentsController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ReportCardSubjectCommentsService, useValue: mockCommentsService },
        { provide: ReportCardAiDraftService, useValue: mockAiDraftService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportCardSubjectCommentsController>(
      ReportCardSubjectCommentsController,
    );
  });

  describe('list', () => {
    it('delegates to service with query', async () => {
      mockCommentsService.list.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 50, total: 0 },
      });
      await controller.list(tenantContext, { page: 1, pageSize: 50 });
      expect(mockCommentsService.list).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 50 });
    });
  });

  describe('count', () => {
    it('delegates to countByClassSubjectPeriod', async () => {
      mockCommentsService.countByClassSubjectPeriod.mockResolvedValue({ total: 5, finalised: 2 });
      const result = await controller.count(tenantContext, CLASS_ID, SUBJECT_ID, PERIOD_ID);
      expect(result).toEqual({ total: 5, finalised: 2 });
    });
  });

  describe('findOne', () => {
    it('returns the comment', async () => {
      mockCommentsService.findById.mockResolvedValue({ id: COMMENT_ID });
      const result = await controller.findOne(tenantContext, COMMENT_ID);
      expect(result).toEqual({ id: COMMENT_ID });
    });
  });

  describe('upsert', () => {
    const dto = {
      student_id: STUDENT_ID,
      subject_id: SUBJECT_ID,
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
      comment_text: 'Great work!',
    };

    it('passes isAdmin=false when user lacks manage perm', async () => {
      mockCommentsService.upsert.mockResolvedValue({ id: COMMENT_ID });
      await controller.upsert(tenantContext, jwtUser, dto);
      expect(mockCommentsService.upsert).toHaveBeenCalledWith(
        TENANT_ID,
        { userId: USER_ID, isAdmin: false },
        dto,
      );
    });

    it('passes isAdmin=true when user has manage perm', async () => {
      mockPermissionCacheService.getPermissions.mockResolvedValue([
        'report_cards.comment',
        'report_cards.manage',
      ]);
      mockCommentsService.upsert.mockResolvedValue({ id: COMMENT_ID });
      await controller.upsert(tenantContext, jwtUser, dto);
      expect(mockCommentsService.upsert).toHaveBeenCalledWith(
        TENANT_ID,
        { userId: USER_ID, isAdmin: true },
        dto,
      );
    });
  });

  describe('finalise / unfinalise', () => {
    it('finalise delegates to service', async () => {
      mockCommentsService.finalise.mockResolvedValue({ id: COMMENT_ID });
      await controller.finalise(tenantContext, jwtUser, COMMENT_ID);
      expect(mockCommentsService.finalise).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ userId: USER_ID }),
        COMMENT_ID,
      );
    });

    it('unfinalise delegates to service', async () => {
      mockCommentsService.unfinalise.mockResolvedValue({ id: COMMENT_ID });
      await controller.unfinalise(tenantContext, jwtUser, COMMENT_ID);
      expect(mockCommentsService.unfinalise).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ userId: USER_ID }),
        COMMENT_ID,
      );
    });
  });

  describe('aiDraft', () => {
    it('delegates to ai draft service', async () => {
      mockAiDraftService.draftSubjectComment.mockResolvedValue({
        comment_text: 'Solid progress.',
        model: 'claude-test',
        tokens_used: 120,
      });
      const result = await controller.aiDraft(tenantContext, jwtUser, {
        student_id: STUDENT_ID,
        subject_id: SUBJECT_ID,
        class_id: CLASS_ID,
        academic_period_id: PERIOD_ID,
      });
      expect(result.comment_text).toBe('Solid progress.');
      expect(mockAiDraftService.draftSubjectComment).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ userId: USER_ID }),
        {
          studentId: STUDENT_ID,
          subjectId: SUBJECT_ID,
          classId: CLASS_ID,
          academicPeriodId: PERIOD_ID,
        },
      );
    });
  });

  describe('bulkFinalise', () => {
    it('returns the count', async () => {
      mockCommentsService.bulkFinalise.mockResolvedValue(7);
      const result = await controller.bulkFinalise(tenantContext, jwtUser, {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        academic_period_id: PERIOD_ID,
      });
      expect(result).toEqual({ count: 7 });
      expect(mockCommentsService.bulkFinalise).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ userId: USER_ID }),
        { classId: CLASS_ID, subjectId: SUBJECT_ID, academicPeriodId: PERIOD_ID },
      );
    });
  });
});
