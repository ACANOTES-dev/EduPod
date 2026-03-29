import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { EarlyWarningConfigService } from './early-warning-config.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONFIG_ID = 'config-uuid-1';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  earlyWarningConfig: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
  }),
}));

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('EarlyWarningConfigService', () => {
  let service: EarlyWarningConfigService;
  let mockPrisma: {
    earlyWarningConfig: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      earlyWarningConfig: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarlyWarningConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EarlyWarningConfigService>(EarlyWarningConfigService);

    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => fn.mockReset()),
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getConfig ────────────────────────────────────────────────────────

  describe('getConfig', () => {
    it('should return existing config from database', async () => {
      const existing = {
        id: CONFIG_ID,
        tenant_id: TENANT_ID,
        is_enabled: true,
        weights_json: { attendance: 30, grades: 30, behaviour: 20, wellbeing: 10, engagement: 10 },
        thresholds_json: { green: 0, yellow: 30, amber: 50, red: 75 },
        hysteresis_buffer: 10,
        routing_rules_json: { yellow: { role: 'homeroom_teacher' } },
        digest_day: 1,
        digest_recipients_json: ['user-1'],
        high_severity_events_json: ['suspension'],
      };
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue(existing);

      const result = await service.getConfig(TENANT_ID);

      expect(result.id).toBe(CONFIG_ID);
      expect(result.is_enabled).toBe(true);
      expect(result.weights_json).toEqual(existing.weights_json);
    });

    it('should return defaults when no config exists', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue(null);

      const result = await service.getConfig(TENANT_ID);

      expect(result.id).toBeNull();
      expect(result.is_enabled).toBe(false);
      expect(result.weights_json).toEqual({
        attendance: 25,
        grades: 25,
        behaviour: 20,
        wellbeing: 20,
        engagement: 10,
      });
      expect(result.thresholds_json).toEqual({
        green: 0,
        yellow: 30,
        amber: 50,
        red: 75,
      });
      expect(result.hysteresis_buffer).toBe(10);
    });
  });

  // ─── updateConfig ─────────────────────────────────────────────────────

  describe('updateConfig', () => {
    it('should update existing config', async () => {
      mockRlsTx.earlyWarningConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        tenant_id: TENANT_ID,
      });
      const updated = { id: CONFIG_ID, is_enabled: true };
      mockRlsTx.earlyWarningConfig.update.mockResolvedValue(updated);

      const result = await service.updateConfig(TENANT_ID, { is_enabled: true });

      expect(result).toEqual(updated);
      expect(mockRlsTx.earlyWarningConfig.update).toHaveBeenCalledWith({
        where: { id: CONFIG_ID },
        data: { is_enabled: true },
      });
    });

    it('should create config with defaults when no existing config', async () => {
      mockRlsTx.earlyWarningConfig.findFirst.mockResolvedValue(null);
      const created = { id: 'new-cfg', tenant_id: TENANT_ID, is_enabled: true };
      mockRlsTx.earlyWarningConfig.create.mockResolvedValue(created);

      const result = await service.updateConfig(TENANT_ID, { is_enabled: true });

      expect(result).toEqual(created);
      expect(mockRlsTx.earlyWarningConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          is_enabled: true,
          hysteresis_buffer: 10,
          digest_day: 1,
        }),
      });
    });

    it('should only include fields present in the dto', async () => {
      mockRlsTx.earlyWarningConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        tenant_id: TENANT_ID,
      });
      mockRlsTx.earlyWarningConfig.update.mockResolvedValue({});

      await service.updateConfig(TENANT_ID, { hysteresis_buffer: 15 });

      expect(mockRlsTx.earlyWarningConfig.update).toHaveBeenCalledWith({
        where: { id: CONFIG_ID },
        data: { hysteresis_buffer: 15 },
      });
    });
  });
});
