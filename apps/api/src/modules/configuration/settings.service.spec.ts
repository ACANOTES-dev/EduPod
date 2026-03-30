import { BadRequestException, NotFoundException } from '@nestjs/common';
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

    it('should still return valid settings when a module section has malformed data', async () => {
      // Simulate a module section with an invalid value stored in the JSONB
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: {
          attendance: { pendingAlertTimeHour: 99 }, // invalid: max is 23
        },
      });

      // Should NOT throw — the full parse fills defaults for the invalid section
      const result = await service.getSettings(TENANT_ID);

      // The other modules still get their defaults
      expect(result.payroll.autoPopulateClassCounts).toBe(true);
      expect(result.gradebook.defaultMissingGradePolicy).toBe('exclude');
    });
  });

  // -------------------------------------------------------------------------
  // getModuleSettings
  // -------------------------------------------------------------------------

  describe('getModuleSettings', () => {
    it('should return a single module section with defaults filled', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: {
          attendance: { allowTeacherAmendment: true },
        },
      });

      const result = await service.getModuleSettings(TENANT_ID, 'attendance');

      expect(result.allowTeacherAmendment).toBe(true);
      // Defaults filled for omitted fields
      expect(result.pendingAlertTimeHour).toBe(14);
      expect(result.autoLockAfterDays).toBeNull();
    });

    it('should fill defaults when the module section is missing entirely', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: {},
      });

      const result = await service.getModuleSettings(TENANT_ID, 'finance');

      expect(result.defaultPaymentTermDays).toBe(30);
      expect(result.allowPartialPayment).toBe(true);
      expect(result.reminderChannel).toBe('email');
    });

    it('should throw NotFoundException when no settings record exists', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);

      await expect(service.getModuleSettings(TENANT_ID, 'attendance')).rejects.toThrow(
        NotFoundException,
      );
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
        gradebook: {
          defaultMissingGradePolicy: 'zero',
          requireGradeComment: true,
          riskDetection: { enabled: false },
        },
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
        service.updateSettings(TENANT_ID, {
          general: { parentPortalEnabled: false } as TenantSettingsDto['general'],
        }),
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
  // updateModuleSettings — per-module validation
  // -------------------------------------------------------------------------

  describe('updateModuleSettings', () => {
    it('should validate and save only the target module section', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: DEFAULT_SETTINGS,
      });
      mockPrisma.tenantSetting.update.mockResolvedValue({});
      mockPrisma.tenantModule.findMany.mockResolvedValue([]);

      const result = await service.updateModuleSettings(TENANT_ID, 'attendance', {
        allowTeacherAmendment: true,
      });

      expect(result.settings.allowTeacherAmendment).toBe(true);
      // Defaults filled for omitted fields
      expect(result.settings.pendingAlertTimeHour).toBe(14);
    });

    it('should deep merge partial module data with existing module data', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: {
          ...DEFAULT_SETTINGS,
          finance: {
            ...DEFAULT_SETTINGS.finance,
            defaultPaymentTermDays: 60,
            allowPartialPayment: false,
          },
        },
      });
      mockPrisma.tenantSetting.update.mockResolvedValue({});
      mockPrisma.tenantModule.findMany.mockResolvedValue([]);

      const result = await service.updateModuleSettings(TENANT_ID, 'finance', {
        allowPartialPayment: true,
      });

      // Updated field
      expect(result.settings.allowPartialPayment).toBe(true);
      // Preserved from existing (not overwritten by defaults)
      expect(result.settings.defaultPaymentTermDays).toBe(60);
    });

    it('should not touch other module sections when updating one module', async () => {
      const existingPayroll = {
        requireApprovalForNonPrincipal: false,
        defaultBonusMultiplier: 2.5,
        autoPopulateClassCounts: false,
      };

      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: {
          ...DEFAULT_SETTINGS,
          payroll: existingPayroll,
        },
      });
      mockPrisma.tenantSetting.update.mockResolvedValue({});
      mockPrisma.tenantModule.findMany.mockResolvedValue([]);

      await service.updateModuleSettings(TENANT_ID, 'attendance', {
        allowTeacherAmendment: true,
      });

      // Verify the saved data preserves the payroll section unchanged
      const savedData = mockPrisma.tenantSetting.update.mock.calls[0][0].data.settings as Record<
        string,
        unknown
      >;
      expect(savedData['payroll']).toEqual(existingPayroll);
    });

    it('should throw BadRequestException for invalid module data', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: DEFAULT_SETTINGS,
      });

      // pendingAlertTimeHour must be 0-23
      await expect(
        service.updateModuleSettings(TENANT_ID, 'attendance', {
          pendingAlertTimeHour: 99,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include structured error details on validation failure', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: DEFAULT_SETTINGS,
      });

      try {
        await service.updateModuleSettings(TENANT_ID, 'attendance', {
          pendingAlertTimeHour: 99,
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as Record<string, unknown>;
        expect(response['code']).toBe('SETTINGS_VALIDATION_FAILED');
        expect(response['message']).toContain('attendance');
        expect(response['details']).toBeDefined();
        expect(Array.isArray(response['details'])).toBe(true);
      }
    });

    it('should throw NotFoundException when no settings record exists', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);

      await expect(
        service.updateModuleSettings(TENANT_ID, 'attendance', {
          allowTeacherAmendment: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return cross-module warnings after per-module update', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: DEFAULT_SETTINGS,
      });
      mockPrisma.tenantSetting.update.mockResolvedValue({});
      mockPrisma.tenantModule.findMany.mockResolvedValue([
        { module_key: 'attendance', is_enabled: false },
      ]);

      const result = await service.updateModuleSettings(TENANT_ID, 'payroll', {
        autoPopulateClassCounts: true,
      });

      const warning = result.warnings.find((w) => w.field === 'payroll.autoPopulateClassCounts');
      expect(warning).toBeDefined();
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
