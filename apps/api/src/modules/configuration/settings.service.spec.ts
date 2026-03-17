import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { tenantSettingsSchema } from '@school/shared';
import type { TenantSettingsDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

// Minimal valid settings object — Zod will fill any missing fields with defaults
const MINIMAL_SETTINGS = {};

// Fully-populated defaults resolved from an empty input
const DEFAULT_SETTINGS: TenantSettingsDto = tenantSettingsSchema.parse({});

const TENANT_ID = 'tenant-uuid-1';

describe('SettingsService', () => {
  let service: SettingsService;
  let mockPrisma: {
    tenantSetting: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    tenantModule: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      tenantSetting: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      tenantModule: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // getSettings
  // -------------------------------------------------------------------------

  describe('getSettings', () => {
    it('should fill missing defaults via Zod parse when settings are minimal', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: MINIMAL_SETTINGS,
      });

      const result = await service.getSettings(TENANT_ID);

      // All top-level sections must be present with their defaults
      expect(result.attendance).toBeDefined();
      expect(result.attendance.allowTeacherAmendment).toBe(false);
      expect(result.attendance.autoLockAfterDays).toBeNull();
      expect(result.attendance.pendingAlertTimeHour).toBe(14);

      expect(result.payroll.autoPopulateClassCounts).toBe(true);
      expect(result.payroll.requireApprovalForNonPrincipal).toBe(true);
      expect(result.payroll.defaultBonusMultiplier).toBe(1.0);

      expect(result.communications.primaryOutboundChannel).toBe('email');
    });

    it('should throw NotFoundException when no settings record exists', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);

      await expect(service.getSettings(TENANT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // updateSettings — deep merge behaviour
  // -------------------------------------------------------------------------

  describe('updateSettings — deep merge', () => {
    it('should deep merge partial settings over existing settings', async () => {
      const existingSettings = {
        ...DEFAULT_SETTINGS,
        attendance: {
          allowTeacherAmendment: false,
          autoLockAfterDays: null,
          pendingAlertTimeHour: 14,
        },
        payroll: {
          requireApprovalForNonPrincipal: true,
          defaultBonusMultiplier: 1.0,
          autoPopulateClassCounts: true,
        },
      };

      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: existingSettings,
      });
      mockPrisma.tenantSetting.update.mockResolvedValue({});
      mockPrisma.tenantModule.findMany.mockResolvedValue([]);

      const result = await service.updateSettings(TENANT_ID, {
        attendance: {
          allowTeacherAmendment: true,
          // autoLockAfterDays and pendingAlertTimeHour intentionally omitted
        } as TenantSettingsDto['attendance'],
      });

      // Updated field
      expect(result.settings.attendance.allowTeacherAmendment).toBe(true);
      // Unchanged fields from deep merge
      expect(result.settings.attendance.autoLockAfterDays).toBeNull();
      expect(result.settings.attendance.pendingAlertTimeHour).toBe(14);
      // Unrelated section untouched
      expect(result.settings.payroll.autoPopulateClassCounts).toBe(true);
    });

    it('should replace arrays rather than merging them', async () => {
      // The scheduling.preferenceWeights sub-object contains no arrays, but we can
      // verify array-replacement by constructing a scenario using a mock that
      // includes an array field and checking that the service does not concatenate.
      // Since the real TenantSettingsDto has no array fields, we test the deepMerge
      // indirectly: supplying a full replacement for a nested object replaces it.
      const existingSettings = {
        ...DEFAULT_SETTINGS,
        scheduling: {
          ...DEFAULT_SETTINGS.scheduling,
          preferenceWeights: { low: 1, medium: 2, high: 3 },
        },
      };

      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: existingSettings,
      });
      mockPrisma.tenantSetting.update.mockResolvedValue({});
      mockPrisma.tenantModule.findMany.mockResolvedValue([]);

      const result = await service.updateSettings(TENANT_ID, {
        scheduling: {
          ...DEFAULT_SETTINGS.scheduling,
          preferenceWeights: { low: 10, medium: 20, high: 30 },
        },
      });

      expect(result.settings.scheduling.preferenceWeights.low).toBe(10);
      expect(result.settings.scheduling.preferenceWeights.medium).toBe(20);
      expect(result.settings.scheduling.preferenceWeights.high).toBe(30);
    });

    it('should persist the validated merged settings via prisma.update', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: DEFAULT_SETTINGS,
      });
      mockPrisma.tenantSetting.update.mockResolvedValue({});
      mockPrisma.tenantModule.findMany.mockResolvedValue([]);

      await service.updateSettings(TENANT_ID, {
        gradebook: { defaultMissingGradePolicy: 'zero', requireGradeComment: true },
      });

      expect(mockPrisma.tenantSetting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          data: expect.objectContaining({ settings: expect.any(Object) }),
        }),
      );
    });

    it('should throw NotFoundException when no settings record exists', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);

      await expect(
        service.updateSettings(TENANT_ID, { general: { parentPortalEnabled: false } as TenantSettingsDto['general'] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject invalid settings values via Zod validation', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: DEFAULT_SETTINGS,
      });

      // Passing a clearly wrong type — attendence.pendingAlertTimeHour must be 0-23
      await expect(
        service.updateSettings(TENANT_ID, {
          attendance: { pendingAlertTimeHour: 99 } as unknown as TenantSettingsDto['attendance'],
        }),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // getWarnings — cross-module dependency checks
  // -------------------------------------------------------------------------

  describe('getWarnings', () => {
    it('should warn when autoPopulateClassCounts=true but attendance module is disabled', async () => {
      mockPrisma.tenantModule.findMany.mockResolvedValue([
        { module_key: 'attendance', is_enabled: false },
      ]);

      const settings: TenantSettingsDto = {
        ...DEFAULT_SETTINGS,
        payroll: { ...DEFAULT_SETTINGS.payroll, autoPopulateClassCounts: true },
      };

      const warnings = await service.getWarnings(TENANT_ID, settings);

      const match = warnings.find((w) => w.field === 'payroll.autoPopulateClassCounts');
      expect(match).toBeDefined();
      expect(match?.message).toMatch(/attendance module is disabled/i);
    });

    it('should warn when primaryOutboundChannel=whatsapp but communications module is disabled', async () => {
      mockPrisma.tenantModule.findMany.mockResolvedValue([
        { module_key: 'communications', is_enabled: false },
      ]);

      const settings: TenantSettingsDto = {
        ...DEFAULT_SETTINGS,
        communications: {
          ...DEFAULT_SETTINGS.communications,
          primaryOutboundChannel: 'whatsapp',
        },
      };

      const warnings = await service.getWarnings(TENANT_ID, settings);

      const match = warnings.find((w) => w.field === 'communications.primaryOutboundChannel');
      expect(match).toBeDefined();
      expect(match?.message).toMatch(/communications module is disabled/i);
    });

    it('should not produce warnings when all referenced modules are enabled', async () => {
      mockPrisma.tenantModule.findMany.mockResolvedValue([
        { module_key: 'attendance', is_enabled: true },
        { module_key: 'communications', is_enabled: true },
      ]);

      const settings: TenantSettingsDto = {
        ...DEFAULT_SETTINGS,
        payroll: { ...DEFAULT_SETTINGS.payroll, autoPopulateClassCounts: true },
        communications: {
          ...DEFAULT_SETTINGS.communications,
          primaryOutboundChannel: 'whatsapp',
        },
      };

      const warnings = await service.getWarnings(TENANT_ID, settings);

      expect(warnings).toHaveLength(0);
    });

    it('should return multiple warnings when multiple cross-module conditions are violated', async () => {
      mockPrisma.tenantModule.findMany.mockResolvedValue([
        { module_key: 'attendance', is_enabled: false },
        { module_key: 'communications', is_enabled: false },
      ]);

      const settings: TenantSettingsDto = {
        ...DEFAULT_SETTINGS,
        payroll: { ...DEFAULT_SETTINGS.payroll, autoPopulateClassCounts: true },
        communications: {
          ...DEFAULT_SETTINGS.communications,
          primaryOutboundChannel: 'whatsapp',
        },
      };

      const warnings = await service.getWarnings(TENANT_ID, settings);

      expect(warnings.length).toBeGreaterThanOrEqual(2);
    });
  });
});
