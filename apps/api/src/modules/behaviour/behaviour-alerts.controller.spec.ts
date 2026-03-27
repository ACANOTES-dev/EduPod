import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { BehaviourAlertsController } from './behaviour-alerts.controller';
import { BehaviourAlertsService } from './behaviour-alerts.service';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'user-uuid',
  tenant_id: 'tenant-uuid',
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockService = {
  listAlerts: jest.fn(),
  getBadgeCount: jest.fn(),
  getAlert: jest.fn(),
  markSeen: jest.fn(),
  acknowledge: jest.fn(),
  snooze: jest.fn(),
  resolve: jest.fn(),
  dismiss: jest.fn(),
};

describe('BehaviourAlertsController', () => {
  let controller: BehaviourAlertsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourAlertsController],
      providers: [
        { provide: BehaviourAlertsService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<BehaviourAlertsController>(BehaviourAlertsController);
    jest.clearAllMocks();
  });

  it('should call alertsService.listAlerts with tenant_id, user sub, and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockService.listAlerts.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.listAlerts(TENANT, USER, query as never);

    expect(mockService.listAlerts).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', query);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call alertsService.getBadgeCount and return wrapped count', async () => {
    mockService.getBadgeCount.mockResolvedValue(5);

    const result = await controller.getBadgeCount(TENANT, USER);

    expect(mockService.getBadgeCount).toHaveBeenCalledWith('tenant-uuid', 'user-uuid');
    expect(result).toEqual({ count: 5 });
  });

  it('should call alertsService.getAlert with tenant_id, user sub, and id', async () => {
    mockService.getAlert.mockResolvedValue({ id: 'alert-1', type: 'threshold' });

    const result = await controller.getAlert(TENANT, USER, 'alert-1');

    expect(mockService.getAlert).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', 'alert-1');
    expect(result).toEqual({ id: 'alert-1', type: 'threshold' });
  });

  it('should call alertsService.markSeen with tenant_id, user sub, and id', async () => {
    mockService.markSeen.mockResolvedValue(undefined);

    await controller.markSeen(TENANT, USER, 'alert-1');

    expect(mockService.markSeen).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', 'alert-1');
  });

  it('should call alertsService.acknowledge with tenant_id, user sub, and id', async () => {
    mockService.acknowledge.mockResolvedValue(undefined);

    await controller.acknowledge(TENANT, USER, 'alert-1');

    expect(mockService.acknowledge).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', 'alert-1');
  });

  it('should call alertsService.snooze with tenant_id, user sub, id, and Date', async () => {
    mockService.snooze.mockResolvedValue(undefined);
    const dto = { snoozed_until: '2026-04-01T00:00:00.000Z' };

    await controller.snooze(TENANT, USER, 'alert-1', dto as never);

    expect(mockService.snooze).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'alert-1', new Date('2026-04-01T00:00:00.000Z'),
    );
  });

  it('should call alertsService.resolve with tenant_id, user sub, and id', async () => {
    mockService.resolve.mockResolvedValue(undefined);

    await controller.resolve(TENANT, USER, 'alert-1');

    expect(mockService.resolve).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', 'alert-1');
  });

  it('should call alertsService.dismiss with tenant_id, user sub, id, and reason', async () => {
    mockService.dismiss.mockResolvedValue(undefined);
    const dto = { reason: 'False positive' };

    await controller.dismiss(TENANT, USER, 'alert-1', dto as never);

    expect(mockService.dismiss).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', 'alert-1', 'False positive');
  });
});
