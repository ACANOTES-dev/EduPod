import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckinPrerequisiteService } from '../services/checkin-prerequisite.service';

import { CheckinConfigController } from './checkin-config.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

// ─── Mock Services ──────────────────────────────────────────────────────────

const mockPrisma = {
  tenantSetting: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

const mockPrerequisiteService = {
  getPrerequisiteStatus: jest.fn(),
  validatePrerequisites: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CheckinConfigController', () => {
  let controller: CheckinConfigController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckinConfigController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CheckinPrerequisiteService, useValue: mockPrerequisiteService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CheckinConfigController>(CheckinConfigController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, CheckinConfigController);
      expect(moduleKey).toBe('pastoral');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', CheckinConfigController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('endpoint permissions', () => {
    const adminMethods: Array<keyof CheckinConfigController> = [
      'getConfig',
      'prerequisites',
      'updateConfig',
    ];

    it.each(adminMethods)('should have @RequiresPermission("pastoral.admin") on %s', (method) => {
      const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
      expect(permission).toBe('pastoral.admin');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getConfig', () => {
    it('should return default checkin config when no settings exist', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);

      const result = await controller.getConfig(TENANT);

      expect(mockPrisma.tenantSetting.findUnique).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
      expect(result).toHaveProperty('data');
    });

    it('should return stored checkin config when settings exist', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        id: 'settings-1',
        tenant_id: TENANT_ID,
        settings: {
          pastoral: {
            checkins: {
              enabled: true,
              frequency: 'daily',
            },
          },
        },
      });

      const result = await controller.getConfig(TENANT);

      expect(result).toHaveProperty('data');
      expect(result.data).toMatchObject({
        enabled: true,
        frequency: 'daily',
      });
    });
  });

  describe('prerequisites', () => {
    it('should delegate to prerequisiteService.getPrerequisiteStatus', async () => {
      const expected = { all_met: true, checks: [] };
      mockPrerequisiteService.getPrerequisiteStatus.mockResolvedValue(expected);

      const result = await controller.prerequisites(TENANT);

      expect(mockPrerequisiteService.getPrerequisiteStatus).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toBe(expected);
    });
  });

  describe('updateConfig', () => {
    it('should validate prerequisites when enabling check-ins', async () => {
      mockPrerequisiteService.validatePrerequisites.mockResolvedValue(undefined);
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);
      mockPrisma.tenantSetting.upsert.mockResolvedValue({});

      const dto = { enabled: true };

      await controller.updateConfig(TENANT, dto);

      expect(mockPrerequisiteService.validatePrerequisites).toHaveBeenCalledWith(TENANT_ID);
    });

    it('should NOT validate prerequisites when not enabling', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);
      mockPrisma.tenantSetting.upsert.mockResolvedValue({});

      const dto = { frequency: 'weekly' as const };

      await controller.updateConfig(TENANT, dto);

      expect(mockPrerequisiteService.validatePrerequisites).not.toHaveBeenCalled();
    });

    it('should NOT validate prerequisites when enabled is false', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);
      mockPrisma.tenantSetting.upsert.mockResolvedValue({});

      const dto = { enabled: false };

      await controller.updateConfig(TENANT, dto);

      expect(mockPrerequisiteService.validatePrerequisites).not.toHaveBeenCalled();
    });

    it('should merge only provided fields into existing settings', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        id: 'settings-1',
        tenant_id: TENANT_ID,
        settings: {
          pastoral: {
            checkins: {
              enabled: true,
              frequency: 'daily',
              consecutive_low_threshold: 3,
            },
          },
        },
      });
      mockPrisma.tenantSetting.upsert.mockResolvedValue({});

      const dto = { frequency: 'weekly' as const };

      const result = await controller.updateConfig(TENANT, dto);

      expect(mockPrisma.tenantSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          create: expect.objectContaining({ tenant_id: TENANT_ID }),
          update: expect.any(Object),
        }),
      );
      expect(result).toHaveProperty('data');
    });

    it('should upsert settings when none exist', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);
      mockPrisma.tenantSetting.upsert.mockResolvedValue({});

      const dto = { enabled: false, frequency: 'daily' as const };

      await controller.updateConfig(TENANT, dto);

      expect(mockPrisma.tenantSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          create: expect.objectContaining({ tenant_id: TENANT_ID }),
          update: expect.any(Object),
        }),
      );
    });
  });
});
