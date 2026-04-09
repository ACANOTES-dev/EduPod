import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { ReportCardOverallCommentsController } from './report-card-overall-comments.controller';
import { ReportCardOverallCommentsService } from './report-card-overall-comments.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CLASS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PERIOD_ID = '11111111-1111-1111-1111-111111111111';
const COMMENT_ID = '22222222-2222-2222-2222-222222222222';

const tenantContext = { tenant_id: TENANT_ID };
const jwtUser: JwtPayload = {
  sub: USER_ID,
  email: 'homeroom@school.test',
  tenant_id: TENANT_ID,
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockCommentsService = {
  list: jest.fn(),
  findById: jest.fn(),
  upsert: jest.fn(),
  finalise: jest.fn(),
  unfinalise: jest.fn(),
};

const mockPermissionCacheService = {
  getPermissions: jest.fn(),
};

describe('ReportCardOverallCommentsController', () => {
  let controller: ReportCardOverallCommentsController;

  beforeEach(async () => {
    Object.values(mockCommentsService).forEach((fn) => fn.mockReset());
    mockPermissionCacheService.getPermissions
      .mockReset()
      .mockResolvedValue(['report_cards.comment']);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportCardOverallCommentsController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ReportCardOverallCommentsService, useValue: mockCommentsService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportCardOverallCommentsController>(
      ReportCardOverallCommentsController,
    );
  });

  describe('list', () => {
    it('delegates to service.list', async () => {
      mockCommentsService.list.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 50, total: 0 },
      });
      await controller.list(tenantContext, { page: 1, pageSize: 50 });
      expect(mockCommentsService.list).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 50 });
    });
  });

  describe('upsert', () => {
    const dto = {
      student_id: STUDENT_ID,
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
      comment_text: 'A well-rounded student.',
    };

    it('passes isAdmin=false for non-admins', async () => {
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
      expect(mockCommentsService.finalise).toHaveBeenCalled();
    });

    it('unfinalise delegates to service', async () => {
      mockCommentsService.unfinalise.mockResolvedValue({ id: COMMENT_ID });
      await controller.unfinalise(tenantContext, jwtUser, COMMENT_ID);
      expect(mockCommentsService.unfinalise).toHaveBeenCalled();
    });
  });
});
