import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';

const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'admin@school.com',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 1000000,
  exp: 2000000,
};

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
    getModuleSettings: jest.Mock;
    updateModuleSettings: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
      getModuleSettings: jest.fn(),
      updateModuleSettings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── GET /v1/settings ───────────────────────────────────────────────────────

  it('should call settingsService.getSettings with tenant_id', async () => {
    const expected = { academic_year_start: 9, grading_scale: 'percentage' };
    mockService.getSettings.mockResolvedValue(expected);

    const result = await controller.getSettings(tenantCtx);

    expect(mockService.getSettings).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(expected);
  });

  // ─── PATCH /v1/settings ─────────────────────────────────────────────────────

  it('should call settingsService.updateSettings with tenant_id, dto, and actor user ID', async () => {
    const dto = { academic_year_start: 1 };
    const expected = { academic_year_start: 1, grading_scale: 'percentage' };
    mockService.updateSettings.mockResolvedValue(expected);

    const result = await controller.updateSettings(tenantCtx, mockUser, dto);

    expect(mockService.updateSettings).toHaveBeenCalledWith(TENANT_ID, dto, USER_ID);
    expect(result).toEqual(expected);
  });

  it('should propagate errors from service', async () => {
    mockService.getSettings.mockRejectedValue(new Error('DB failure'));

    await expect(controller.getSettings(tenantCtx)).rejects.toThrow('DB failure');
  });

  // ─── GET /v1/settings/:moduleKey ────────────────────────────────────────────

  describe('getModuleSettings', () => {
    it('should call settingsService.getModuleSettings with valid module key', async () => {
      const expected = { allowTeacherAmendment: true };
      mockService.getModuleSettings.mockResolvedValue(expected);

      const result = await controller.getModuleSettings(tenantCtx, 'attendance');

      expect(mockService.getModuleSettings).toHaveBeenCalledWith(TENANT_ID, 'attendance');
      expect(result).toEqual(expected);
    });

    it('should throw BadRequestException for invalid module key', async () => {
      await expect(controller.getModuleSettings(tenantCtx, 'nonexistent')).rejects.toThrow(
        BadRequestException,
      );

      expect(mockService.getModuleSettings).not.toHaveBeenCalled();
    });
  });

  // ─── PATCH /v1/settings/:moduleKey ──────────────────────────────────────────

  describe('updateModuleSettings', () => {
    it('should call settingsService.updateModuleSettings with valid module key', async () => {
      const dto = { allowTeacherAmendment: true };
      const expected = { settings: { allowTeacherAmendment: true }, warnings: [] };
      mockService.updateModuleSettings.mockResolvedValue(expected);

      const result = await controller.updateModuleSettings(tenantCtx, mockUser, 'attendance', dto);

      expect(mockService.updateModuleSettings).toHaveBeenCalledWith(
        TENANT_ID,
        'attendance',
        dto,
        USER_ID,
      );
      expect(result).toEqual(expected);
    });

    it('should throw BadRequestException for invalid module key', async () => {
      await expect(
        controller.updateModuleSettings(tenantCtx, mockUser, 'nonexistent', {}),
      ).rejects.toThrow(BadRequestException);

      expect(mockService.updateModuleSettings).not.toHaveBeenCalled();
    });
  });
});
