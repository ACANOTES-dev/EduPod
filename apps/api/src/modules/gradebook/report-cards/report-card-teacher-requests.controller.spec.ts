import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import type { SubmitTeacherRequestDto } from './dto/teacher-request.dto';
import { ReportCardTeacherRequestsController } from './report-card-teacher-requests.controller';
import { ReportCardTeacherRequestsService } from './report-card-teacher-requests.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PERIOD_ID = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = '22222222-2222-2222-2222-222222222222';

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

const mockService = {
  list: jest.fn(),
  listPendingForReviewer: jest.fn(),
  findById: jest.fn(),
  submit: jest.fn(),
  cancel: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
  markCompleted: jest.fn(),
};

const mockPermissionCacheService = {
  getPermissions: jest.fn(),
};

describe('ReportCardTeacherRequestsController', () => {
  let controller: ReportCardTeacherRequestsController;

  beforeEach(async () => {
    Object.values(mockService).forEach((fn) => fn.mockReset());
    mockPermissionCacheService.getPermissions
      .mockReset()
      .mockResolvedValue(['report_cards.comment']);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ReportCardTeacherRequestsController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ReportCardTeacherRequestsService, useValue: mockService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get<ReportCardTeacherRequestsController>(
      ReportCardTeacherRequestsController,
    );
  });

  describe('list', () => {
    it('delegates to service.list with the resolved actor', async () => {
      mockService.list.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });

      await controller.list(tenantContext, jwtUser, { page: 1, pageSize: 20 });
      expect(mockService.list).toHaveBeenCalledWith(
        TENANT_ID,
        { userId: USER_ID, isAdmin: false },
        { page: 1, pageSize: 20 },
      );
    });

    it('passes isAdmin=true when user holds report_cards.manage', async () => {
      mockPermissionCacheService.getPermissions.mockResolvedValue([
        'report_cards.comment',
        'report_cards.manage',
      ]);
      mockService.list.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });

      await controller.list(tenantContext, jwtUser, { page: 1, pageSize: 20 });
      expect(mockService.list).toHaveBeenCalledWith(
        TENANT_ID,
        { userId: USER_ID, isAdmin: true },
        { page: 1, pageSize: 20 },
      );
    });
  });

  describe('listPending', () => {
    it('delegates to service.listPendingForReviewer', async () => {
      mockService.listPendingForReviewer.mockResolvedValue([]);
      await controller.listPending(tenantContext);
      expect(mockService.listPendingForReviewer).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  describe('findOne', () => {
    it('delegates to service.findById', async () => {
      mockService.findById.mockResolvedValue({ id: REQUEST_ID });
      await controller.findOne(tenantContext, jwtUser, REQUEST_ID);
      expect(mockService.findById).toHaveBeenCalledWith(
        TENANT_ID,
        { userId: USER_ID, isAdmin: false },
        REQUEST_ID,
      );
    });
  });

  describe('submit', () => {
    const dto: SubmitTeacherRequestDto = {
      request_type: 'open_comment_window',
      academic_period_id: PERIOD_ID,
      reason: 'Two students were absent.',
    };

    it('delegates to service.submit', async () => {
      mockService.submit.mockResolvedValue({ id: REQUEST_ID });
      await controller.submit(tenantContext, jwtUser, dto);
      expect(mockService.submit).toHaveBeenCalledWith(
        TENANT_ID,
        { userId: USER_ID, isAdmin: false },
        dto,
      );
    });
  });

  describe('cancel', () => {
    it('delegates to service.cancel with the actor', async () => {
      mockService.cancel.mockResolvedValue({ id: REQUEST_ID });
      await controller.cancel(tenantContext, jwtUser, REQUEST_ID);
      expect(mockService.cancel).toHaveBeenCalledWith(
        TENANT_ID,
        { userId: USER_ID, isAdmin: false },
        REQUEST_ID,
      );
    });
  });

  describe('approve', () => {
    it('delegates to service.approve with the DTO payload', async () => {
      mockPermissionCacheService.getPermissions.mockResolvedValue(['report_cards.manage']);
      mockService.approve.mockResolvedValue({
        request: { id: REQUEST_ID },
        resulting_window_id: null,
        resulting_run_id: null,
      });

      await controller.approve(tenantContext, jwtUser, REQUEST_ID, {
        review_note: 'ok',
        auto_execute: false,
      });
      expect(mockService.approve).toHaveBeenCalledWith(
        TENANT_ID,
        { userId: USER_ID, isAdmin: true },
        REQUEST_ID,
        { review_note: 'ok', auto_execute: false },
      );
    });
  });

  describe('reject', () => {
    it('delegates to service.reject with the review note', async () => {
      mockPermissionCacheService.getPermissions.mockResolvedValue(['report_cards.manage']);
      mockService.reject.mockResolvedValue({ id: REQUEST_ID });
      await controller.reject(tenantContext, jwtUser, REQUEST_ID, {
        review_note: 'out of scope',
      });
      expect(mockService.reject).toHaveBeenCalledWith(
        TENANT_ID,
        { userId: USER_ID, isAdmin: true },
        REQUEST_ID,
        { review_note: 'out of scope' },
      );
    });
  });

  describe('complete', () => {
    it('delegates to service.markCompleted', async () => {
      mockPermissionCacheService.getPermissions.mockResolvedValue(['report_cards.manage']);
      mockService.markCompleted.mockResolvedValue({ id: REQUEST_ID });
      await controller.complete(tenantContext, jwtUser, REQUEST_ID);
      expect(mockService.markCompleted).toHaveBeenCalledWith(
        TENANT_ID,
        { userId: USER_ID, isAdmin: true },
        REQUEST_ID,
      );
    });
  });
});
