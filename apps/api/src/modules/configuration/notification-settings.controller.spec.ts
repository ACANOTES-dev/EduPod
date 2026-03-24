import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';

const TENANT_ID = 'tenant-uuid-1';
const tenantCtx: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('NotificationSettingsController', () => {
  let controller: NotificationSettingsController;
  let mockService: {
    listSettings: jest.Mock;
    updateSetting: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      listSettings: jest.fn(),
      updateSetting: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationSettingsController],
      providers: [
        { provide: NotificationSettingsService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationSettingsController>(NotificationSettingsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call notificationSettingsService.listSettings with tenant_id', async () => {
    const expected = [
      { id: '1', notification_type: 'invoice.issued', is_enabled: true },
    ];
    mockService.listSettings.mockResolvedValue(expected);

    const result = await controller.listSettings(tenantCtx);

    expect(mockService.listSettings).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(expected);
  });

  it('should call notificationSettingsService.updateSetting with tenant_id, type, and dto', async () => {
    const dto = { is_enabled: false };
    const expected = { id: '1', notification_type: 'invoice.issued', is_enabled: false };
    mockService.updateSetting.mockResolvedValue(expected);

    const result = await controller.updateSetting(tenantCtx, 'invoice.issued', dto);

    expect(mockService.updateSetting).toHaveBeenCalledWith(TENANT_ID, 'invoice.issued', dto);
    expect(result).toEqual(expected);
  });

  it('should propagate errors from service', async () => {
    mockService.listSettings.mockRejectedValue(new Error('Database error'));

    await expect(controller.listSettings(tenantCtx)).rejects.toThrow('Database error');
  });
});
