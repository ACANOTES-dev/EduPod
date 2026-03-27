import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { CheckinPrerequisiteService } from './checkin-prerequisite.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  user: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockRlsTx),
      ),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeTenantSettingsRecord = (
  checkinOverrides: Record<string, unknown> = {},
) => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      checkins: {
        enabled: false,
        frequency: 'weekly',
        monitoring_owner_user_ids: [],
        monitoring_hours_start: '08:00',
        monitoring_hours_end: '16:00',
        monitoring_days: [1, 2, 3, 4, 5],
        flagged_keywords: ['suicide', 'self-harm'],
        consecutive_low_threshold: 3,
        min_cohort_for_aggregate: 10,
        prerequisites_acknowledged: false,
        ...checkinOverrides,
      },
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

const makeFullyConfiguredSettings = () =>
  makeTenantSettingsRecord({
    monitoring_owner_user_ids: [USER_ID_A],
    monitoring_hours_start: '08:00',
    monitoring_hours_end: '16:00',
    prerequisites_acknowledged: true,
  });

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CheckinPrerequisiteService', () => {
  let service: CheckinPrerequisiteService;
  let mockPrisma: {
    tenantSetting: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      tenantSetting: {
        findUnique: jest.fn().mockResolvedValue(makeTenantSettingsRecord()),
      },
    };

    // Reset RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinPrerequisiteService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CheckinPrerequisiteService>(
      CheckinPrerequisiteService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getPrerequisiteStatus ────────────────────────────────────────────────

  describe('getPrerequisiteStatus', () => {
    it('should return all-false when no prerequisites configured', async () => {
      // Default settings have empty monitoring_owner_user_ids and
      // prerequisites_acknowledged = false
      const result = await service.getPrerequisiteStatus(TENANT_ID);

      expect(result.monitoring_ownership_defined).toBe(false);
      expect(result.monitoring_hours_defined).toBe(true); // defaults are set
      expect(result.escalation_protocol_defined).toBe(false); // tied to ownership
      expect(result.prerequisites_acknowledged).toBe(false);
      expect(result.all_met).toBe(false);
    });

    it('should return monitoring_ownership_defined = true when owners assigned', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsRecord({
          monitoring_owner_user_ids: [USER_ID_A],
        }),
      );

      const result = await service.getPrerequisiteStatus(TENANT_ID);

      expect(result.monitoring_ownership_defined).toBe(true);
      expect(result.escalation_protocol_defined).toBe(true);
    });

    it('should return monitoring_hours_defined = false when hours are empty strings', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsRecord({
          monitoring_hours_start: '',
          monitoring_hours_end: '',
        }),
      );

      const result = await service.getPrerequisiteStatus(TENANT_ID);

      expect(result.monitoring_hours_defined).toBe(false);
    });

    it('should return prerequisites_acknowledged = true when acknowledged', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsRecord({
          prerequisites_acknowledged: true,
        }),
      );

      const result = await service.getPrerequisiteStatus(TENANT_ID);

      expect(result.prerequisites_acknowledged).toBe(true);
    });

    it('should return all_met = true when all prerequisites are satisfied', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeFullyConfiguredSettings(),
      );

      const result = await service.getPrerequisiteStatus(TENANT_ID);

      expect(result.monitoring_ownership_defined).toBe(true);
      expect(result.monitoring_hours_defined).toBe(true);
      expect(result.escalation_protocol_defined).toBe(true);
      expect(result.prerequisites_acknowledged).toBe(true);
      expect(result.all_met).toBe(true);
    });

    it('should handle missing tenant settings gracefully (defaults)', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);

      const result = await service.getPrerequisiteStatus(TENANT_ID);

      // All defaults: no owners, default hours are set, not acknowledged
      expect(result.monitoring_ownership_defined).toBe(false);
      expect(result.monitoring_hours_defined).toBe(true);
      expect(result.escalation_protocol_defined).toBe(false);
      expect(result.prerequisites_acknowledged).toBe(false);
      expect(result.all_met).toBe(false);
    });
  });

  // ─── validatePrerequisites ────────────────────────────────────────────────

  describe('validatePrerequisites', () => {
    it('should throw 400 when monitoring ownership is missing', async () => {
      // Default has no monitoring owners
      await expect(
        service.validatePrerequisites(TENANT_ID),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.validatePrerequisites(TENANT_ID);
      } catch (err) {
        const error = err as BadRequestException;
        const response = error.getResponse() as Record<string, unknown>;
        expect(response.code).toBe('CHECKIN_PREREQUISITES_NOT_MET');
        const details = response.details as { unmet_prerequisites: string[] };
        expect(details.unmet_prerequisites).toEqual(
          expect.arrayContaining([
            expect.stringContaining('Monitoring ownership'),
          ]),
        );
      }
    });

    it('should throw 400 when acknowledgement is false', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsRecord({
          monitoring_owner_user_ids: [USER_ID_A],
          prerequisites_acknowledged: false,
        }),
      );

      await expect(
        service.validatePrerequisites(TENANT_ID),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.validatePrerequisites(TENANT_ID);
      } catch (err) {
        const error = err as BadRequestException;
        const response = error.getResponse() as Record<string, unknown>;
        const details = response.details as { unmet_prerequisites: string[] };
        expect(details.unmet_prerequisites).toEqual(
          expect.arrayContaining([
            expect.stringContaining('Acknowledgement'),
          ]),
        );
      }
    });

    it('should throw 400 when monitoring hours are empty', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeTenantSettingsRecord({
          monitoring_owner_user_ids: [USER_ID_A],
          monitoring_hours_start: '',
          monitoring_hours_end: '',
          prerequisites_acknowledged: true,
        }),
      );

      await expect(
        service.validatePrerequisites(TENANT_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pass when all prerequisites are met', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeFullyConfiguredSettings(),
      );

      await expect(
        service.validatePrerequisites(TENANT_ID),
      ).resolves.toBeUndefined();
    });
  });

  // ─── validateMonitoringOwners ─────────────────────────────────────────────

  describe('validateMonitoringOwners', () => {
    it('should throw when user does not exist', async () => {
      mockRlsTx.user.findFirst.mockResolvedValue(null);

      await expect(
        service.validateMonitoringOwners(TENANT_ID, [USER_ID_A]),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.validateMonitoringOwners(TENANT_ID, [USER_ID_A]);
      } catch (err) {
        const error = err as BadRequestException;
        const response = error.getResponse() as Record<string, unknown>;
        expect(response.code).toBe('INVALID_MONITORING_OWNER');
      }
    });

    it('should pass when all user IDs exist', async () => {
      mockRlsTx.user.findFirst
        .mockResolvedValueOnce({ id: USER_ID_A, email: 'a@school.ie' })
        .mockResolvedValueOnce({ id: USER_ID_B, email: 'b@school.ie' });

      await expect(
        service.validateMonitoringOwners(TENANT_ID, [USER_ID_A, USER_ID_B]),
      ).resolves.toBeUndefined();

      expect(mockRlsTx.user.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should skip validation when userIds array is empty', async () => {
      await expect(
        service.validateMonitoringOwners(TENANT_ID, []),
      ).resolves.toBeUndefined();

      expect(mockRlsTx.user.findFirst).not.toHaveBeenCalled();
    });

    it('should throw on second invalid user when first is valid', async () => {
      mockRlsTx.user.findFirst
        .mockResolvedValueOnce({ id: USER_ID_A, email: 'a@school.ie' })
        .mockResolvedValueOnce(null);

      await expect(
        service.validateMonitoringOwners(TENANT_ID, [USER_ID_A, USER_ID_B]),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
