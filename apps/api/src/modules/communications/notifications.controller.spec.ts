import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const NOTIFICATION_ID = 'notification-uuid-1';

const tenantCtx: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const userCtx: JwtPayload = {
  sub: USER_ID,
  email: 'user@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let mockService: {
    listForUser: jest.Mock;
    getUnreadCount: jest.Mock;
    listFailed: jest.Mock;
    markAsRead: jest.Mock;
    markAllAsRead: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      listForUser: jest.fn(),
      getUnreadCount: jest.fn(),
      listFailed: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call service.listForUser with tenant_id, user_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockService.listForUser.mockResolvedValue(expected);

    const result = await controller.list(tenantCtx, userCtx, query);

    expect(mockService.listForUser).toHaveBeenCalledWith(TENANT_ID, USER_ID, query);
    expect(result).toEqual(expected);
  });

  it('should call service.getUnreadCount with tenant_id and user_id', async () => {
    const expected = { count: 5 };
    mockService.getUnreadCount.mockResolvedValue(expected);

    const result = await controller.getUnreadCount(tenantCtx, userCtx);

    expect(mockService.getUnreadCount).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toEqual(expected);
  });

  it('should call service.listFailed with tenant_id and default pagination', async () => {
    const expected = { data: [], meta: { page: 1, pageSize: 100, total: 0 } };
    mockService.listFailed.mockResolvedValue(expected);

    const result = await controller.listFailed(tenantCtx);

    expect(mockService.listFailed).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 100 });
    expect(result).toEqual(expected);
  });

  it('should call service.markAsRead with tenant_id, user_id and notification id', async () => {
    const expected = { id: NOTIFICATION_ID, read_at: new Date() };
    mockService.markAsRead.mockResolvedValue(expected);

    const result = await controller.markRead(tenantCtx, userCtx, NOTIFICATION_ID);

    expect(mockService.markAsRead).toHaveBeenCalledWith(TENANT_ID, USER_ID, NOTIFICATION_ID);
    expect(result).toEqual(expected);
  });

  it('should call service.markAllAsRead with tenant_id and user_id', async () => {
    const expected = { count: 3 };
    mockService.markAllAsRead.mockResolvedValue(expected);

    const result = await controller.markAllRead(tenantCtx, userCtx);

    expect(mockService.markAllAsRead).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toEqual(expected);
  });
});
