import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralAdminController } from './pastoral-admin.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID_A = '11111111-1111-1111-1111-111111111111';
const USER_ID_B = '22222222-2222-2222-2222-222222222222';
const CONCERN_URGENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONCERN_CRITICAL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

// ─── Mock Prisma ────────────────────────────────────────────────────────────

const mockPrisma = {
  tenantSetting: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  pastoralConcern: {
    count: jest.fn(),
    findFirst: jest.fn(),
  },
  pastoralEvent: {
    count: jest.fn(),
  },
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralAdminController', () => {
  let controller: PastoralAdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PastoralAdminController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PastoralAdminController>(PastoralAdminController);

    jest.clearAllMocks();
  });

  // ─── GET /pastoral/admin/escalation-settings ──────────────────────────────

  describe('getEscalationSettings', () => {
    it('should return default escalation settings when no settings exist', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);

      const result = await controller.getEscalationSettings(TENANT);

      expect(result.data).toEqual({
        escalation_enabled: true,
        escalation_urgent_timeout_minutes: 120,
        escalation_critical_timeout_minutes: 30,
        escalation_urgent_recipients: [],
        escalation_critical_recipients: [],
      });

      expect(mockPrisma.tenantSetting.findUnique).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });

    it('should return stored escalation settings when they exist', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        id: 'settings-1',
        tenant_id: TENANT_ID,
        settings: {
          pastoral: {
            escalation_enabled: false,
            escalation: {
              urgent_timeout_minutes: 60,
              critical_timeout_minutes: 15,
            },
            escalation_urgent_recipients: [USER_ID_A],
            escalation_critical_recipients: [USER_ID_A, USER_ID_B],
          },
        },
      });

      const result = await controller.getEscalationSettings(TENANT);

      expect(result.data).toEqual({
        escalation_enabled: false,
        escalation_urgent_timeout_minutes: 60,
        escalation_critical_timeout_minutes: 15,
        escalation_urgent_recipients: [USER_ID_A],
        escalation_critical_recipients: [USER_ID_A, USER_ID_B],
      });
    });
  });

  // ─── PATCH /pastoral/admin/escalation-settings ────────────────────────────

  describe('updateEscalationSettings', () => {
    it('should merge and persist updated escalation settings', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        id: 'settings-1',
        tenant_id: TENANT_ID,
        settings: {
          pastoral: {
            escalation: {
              urgent_timeout_minutes: 120,
              critical_timeout_minutes: 30,
            },
          },
        },
      });
      mockPrisma.tenantSetting.upsert.mockResolvedValue({});

      const dto = {
        escalation_enabled: false,
        escalation_urgent_timeout_minutes: 60,
        escalation_critical_recipients: [USER_ID_A],
      };

      const result = await controller.updateEscalationSettings(TENANT, dto);

      // Verify upsert was called
      expect(mockPrisma.tenantSetting.upsert).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        create: expect.objectContaining({
          tenant_id: TENANT_ID,
          settings: expect.objectContaining({
            pastoral: expect.objectContaining({
              escalation_enabled: false,
              escalation: expect.objectContaining({
                urgent_timeout_minutes: 60,
                critical_timeout_minutes: 30,
              }),
              escalation_critical_recipients: [USER_ID_A],
            }),
          }),
        }),
        update: expect.objectContaining({
          settings: expect.objectContaining({
            pastoral: expect.objectContaining({
              escalation_enabled: false,
              escalation: expect.objectContaining({
                urgent_timeout_minutes: 60,
                critical_timeout_minutes: 30,
              }),
              escalation_critical_recipients: [USER_ID_A],
            }),
          }),
        }),
      });

      // Verify response shape
      expect(result.data.escalation_enabled).toBe(false);
      expect(result.data.escalation_urgent_timeout_minutes).toBe(60);
      expect(result.data.escalation_critical_timeout_minutes).toBe(30);
      expect(result.data.escalation_critical_recipients).toEqual([USER_ID_A]);
    });

    it('should create settings when none exist', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);
      mockPrisma.tenantSetting.upsert.mockResolvedValue({});

      const dto = {
        escalation_urgent_timeout_minutes: 90,
      };

      const result = await controller.updateEscalationSettings(TENANT, dto);

      expect(mockPrisma.tenantSetting.upsert).toHaveBeenCalled();
      expect(result.data.escalation_urgent_timeout_minutes).toBe(90);
      // Non-updated fields should have defaults
      expect(result.data.escalation_enabled).toBe(true);
      expect(result.data.escalation_critical_timeout_minutes).toBe(30);
    });
  });

  // ─── GET /pastoral/admin/escalation-dashboard ─────────────────────────────

  describe('getEscalationDashboard', () => {
    it('should return correct unacknowledged counts and escalation stats', async () => {
      const urgentCreatedAt = new Date(Date.now() - 90 * 60_000); // 90 min ago
      const criticalCreatedAt = new Date(Date.now() - 20 * 60_000); // 20 min ago

      // Mock counts in the order the Promise.all calls them
      mockPrisma.pastoralConcern.count
        .mockResolvedValueOnce(3)   // unacknowledged urgent
        .mockResolvedValueOnce(1);  // unacknowledged critical

      mockPrisma.pastoralConcern.findFirst
        .mockResolvedValueOnce({ id: CONCERN_URGENT_ID, created_at: urgentCreatedAt })
        .mockResolvedValueOnce({ id: CONCERN_CRITICAL_ID, created_at: criticalCreatedAt });

      mockPrisma.pastoralEvent.count
        .mockResolvedValueOnce(2)   // 7d escalations
        .mockResolvedValueOnce(5);  // 30d escalations

      const result = await controller.getEscalationDashboard(TENANT);

      expect(result.data.unacknowledged_urgent).toBe(3);
      expect(result.data.unacknowledged_critical).toBe(1);

      // Oldest urgent
      expect(result.data.oldest_unacknowledged_urgent).not.toBeNull();
      expect(result.data.oldest_unacknowledged_urgent!.concern_id).toBe(CONCERN_URGENT_ID);
      expect(result.data.oldest_unacknowledged_urgent!.minutes_elapsed).toBeGreaterThanOrEqual(89);
      expect(result.data.oldest_unacknowledged_urgent!.minutes_elapsed).toBeLessThanOrEqual(91);

      // Oldest critical
      expect(result.data.oldest_unacknowledged_critical).not.toBeNull();
      expect(result.data.oldest_unacknowledged_critical!.concern_id).toBe(CONCERN_CRITICAL_ID);
      expect(result.data.oldest_unacknowledged_critical!.minutes_elapsed).toBeGreaterThanOrEqual(19);
      expect(result.data.oldest_unacknowledged_critical!.minutes_elapsed).toBeLessThanOrEqual(21);

      // Escalation counts
      expect(result.data.escalations_last_7d).toBe(2);
      expect(result.data.escalations_last_30d).toBe(5);
    });

    it('should return null for oldest when no unacknowledged concerns exist', async () => {
      mockPrisma.pastoralConcern.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      mockPrisma.pastoralConcern.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      mockPrisma.pastoralEvent.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await controller.getEscalationDashboard(TENANT);

      expect(result.data.unacknowledged_urgent).toBe(0);
      expect(result.data.unacknowledged_critical).toBe(0);
      expect(result.data.oldest_unacknowledged_urgent).toBeNull();
      expect(result.data.oldest_unacknowledged_critical).toBeNull();
      expect(result.data.escalations_last_7d).toBe(0);
      expect(result.data.escalations_last_30d).toBe(0);
    });

    it('should query concerns with correct severity and tenant filters', async () => {
      mockPrisma.pastoralConcern.count
        .mockResolvedValue(0);
      mockPrisma.pastoralConcern.findFirst
        .mockResolvedValue(null);
      mockPrisma.pastoralEvent.count
        .mockResolvedValue(0);

      await controller.getEscalationDashboard(TENANT);

      // Verify concern count queries include severity and tenant_id
      expect(mockPrisma.pastoralConcern.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          severity: 'urgent',
          acknowledged_at: null,
        },
      });
      expect(mockPrisma.pastoralConcern.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          severity: 'critical',
          acknowledged_at: null,
        },
      });

      // Verify event count queries filter by event_type and date range
      expect(mockPrisma.pastoralEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            event_type: 'concern_auto_escalated',
            created_at: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });
  });

  // ─── Guard / Decorator Checks ─────────────────────────────────────────────

  describe('guard metadata', () => {
    it('should have all three endpoint methods defined', () => {
      expect(controller.getEscalationSettings).toBeDefined();
      expect(controller.updateEscalationSettings).toBeDefined();
      expect(controller.getEscalationDashboard).toBeDefined();
    });
  });
});
