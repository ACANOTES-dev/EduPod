import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { FinanceDashboardController } from './finance-dashboard.controller';
import { FinanceDashboardService } from './finance-dashboard.service';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockService = {
  getDashboardData: jest.fn(),
};

describe('FinanceDashboardController', () => {
  let controller: FinanceDashboardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinanceDashboardController],
      providers: [{ provide: FinanceDashboardService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<FinanceDashboardController>(FinanceDashboardController);
    jest.clearAllMocks();
  });

  it('should call service.getDashboardData with tenant_id', async () => {
    const dashData = { total_revenue: 50000 };
    mockService.getDashboardData.mockResolvedValue(dashData);
    const result = await controller.getDashboard(TENANT);
    expect(mockService.getDashboardData).toHaveBeenCalledWith('tenant-uuid');
    expect(result).toEqual(dashData);
  });

  it('should return dashboard data from service', async () => {
    const expected = { total_revenue: 100000, outstanding: 25000 };
    mockService.getDashboardData.mockResolvedValue(expected);
    const result = await controller.getDashboard(TENANT);
    expect(result).toEqual(expected);
  });

  it('should propagate errors from service', async () => {
    mockService.getDashboardData.mockRejectedValue(new Error('DB error'));
    await expect(controller.getDashboard(TENANT)).rejects.toThrow('DB error');
  });
});
