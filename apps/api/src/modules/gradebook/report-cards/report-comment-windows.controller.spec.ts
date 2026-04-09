import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { ReportCommentWindowsController } from './report-comment-windows.controller';
import { ReportCommentWindowsService } from './report-comment-windows.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const WINDOW_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PERIOD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const tenantContext = { tenant_id: TENANT_ID };
const jwtUser: Pick<JwtPayload, 'sub' | 'email'> = {
  sub: USER_ID,
  email: 'admin@school.test',
};

const mockWindowsService = {
  list: jest.fn(),
  findActive: jest.fn(),
  findById: jest.fn(),
  open: jest.fn(),
  closeNow: jest.fn(),
  extend: jest.fn(),
  reopen: jest.fn(),
  updateInstructions: jest.fn(),
};

const mockPrisma = {};
const mockPermissionCacheService = { getPermissions: jest.fn() };

describe('ReportCommentWindowsController', () => {
  let controller: ReportCommentWindowsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportCommentWindowsController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ReportCommentWindowsService, useValue: mockWindowsService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportCommentWindowsController>(ReportCommentWindowsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('delegates to service with query', async () => {
      const paginated = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockWindowsService.list.mockResolvedValue(paginated);

      const result = await controller.list(tenantContext, { page: 1, pageSize: 20 });
      expect(mockWindowsService.list).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual(paginated);
    });
  });

  describe('active', () => {
    it('returns the currently active window or null', async () => {
      mockWindowsService.findActive.mockResolvedValue(null);
      const result = await controller.active(tenantContext);
      expect(result).toBeNull();
    });
  });

  describe('findOne', () => {
    it('returns the window by id', async () => {
      const window = { id: WINDOW_ID };
      mockWindowsService.findById.mockResolvedValue(window);
      const result = await controller.findOne(tenantContext, WINDOW_ID);
      expect(mockWindowsService.findById).toHaveBeenCalledWith(TENANT_ID, WINDOW_ID);
      expect(result).toEqual(window);
    });
  });

  describe('open', () => {
    it('delegates to service.open with the actor id', async () => {
      const dto = {
        academic_period_id: PERIOD_ID,
        opens_at: '2030-01-01T00:00:00Z',
        closes_at: '2030-01-10T00:00:00Z',
      };
      const created = { id: WINDOW_ID };
      mockWindowsService.open.mockResolvedValue(created);

      const result = await controller.open(tenantContext, jwtUser as JwtPayload, dto);
      expect(mockWindowsService.open).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual(created);
    });
  });

  describe('closeNow', () => {
    it('delegates to service.closeNow', async () => {
      mockWindowsService.closeNow.mockResolvedValue({ id: WINDOW_ID, status: 'closed' });
      await controller.closeNow(tenantContext, jwtUser as JwtPayload, WINDOW_ID);
      expect(mockWindowsService.closeNow).toHaveBeenCalledWith(TENANT_ID, USER_ID, WINDOW_ID);
    });
  });

  describe('extend', () => {
    it('delegates with a parsed Date', async () => {
      mockWindowsService.extend.mockResolvedValue({ id: WINDOW_ID });
      await controller.extend(tenantContext, jwtUser as JwtPayload, WINDOW_ID, {
        closes_at: '2030-05-01T00:00:00Z',
      });
      expect(mockWindowsService.extend).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        WINDOW_ID,
        new Date('2030-05-01T00:00:00Z'),
      );
    });
  });

  describe('reopen', () => {
    it('delegates to service.reopen', async () => {
      mockWindowsService.reopen.mockResolvedValue({ id: WINDOW_ID, status: 'open' });
      await controller.reopen(tenantContext, jwtUser as JwtPayload, WINDOW_ID);
      expect(mockWindowsService.reopen).toHaveBeenCalledWith(TENANT_ID, USER_ID, WINDOW_ID);
    });
  });

  describe('update', () => {
    it('delegates to service.updateInstructions', async () => {
      mockWindowsService.updateInstructions.mockResolvedValue({ id: WINDOW_ID });
      await controller.update(tenantContext, jwtUser as JwtPayload, WINDOW_ID, {
        instructions: 'new instructions',
      });
      expect(mockWindowsService.updateInstructions).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        WINDOW_ID,
        { instructions: 'new instructions' },
      );
    });
  });
});
