import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

const TENANT_ID = 'tenant-uuid-1';
const tenantCtx: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('SettingsController', () => {
  let controller: SettingsController;
  let mockService: {
    getSettings: jest.Mock;
    updateSettings: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        { provide: SettingsService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call settingsService.getSettings with tenant_id', async () => {
    const expected = { academic_year_start: 9, grading_scale: 'percentage' };
    mockService.getSettings.mockResolvedValue(expected);

    const result = await controller.getSettings(tenantCtx);

    expect(mockService.getSettings).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(expected);
  });

  it('should call settingsService.updateSettings with tenant_id and dto', async () => {
    const dto = { academic_year_start: 1 };
    const expected = { academic_year_start: 1, grading_scale: 'percentage' };
    mockService.updateSettings.mockResolvedValue(expected);

    const result = await controller.updateSettings(tenantCtx, dto);

    expect(mockService.updateSettings).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual(expected);
  });

  it('should propagate errors from service', async () => {
    mockService.getSettings.mockRejectedValue(new Error('DB failure'));

    await expect(controller.getSettings(tenantCtx)).rejects.toThrow('DB failure');
  });
});
