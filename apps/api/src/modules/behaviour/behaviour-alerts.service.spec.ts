import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAlertsService } from './behaviour-alerts.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const ALERT_ID = 'alert-1';
const RECIPIENT_ID = 'recipient-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourAlert: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  behaviourAlertRecipient: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BehaviourAlertsService', () => {
  let service: BehaviourAlertsService;
  let mockPrisma: {
    behaviourAlertRecipient: {
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    behaviourAlert: {
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      behaviourAlertRecipient: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      behaviourAlert: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourAlertsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BehaviourAlertsService>(BehaviourAlertsService);

    // Reset RLS tx mocks
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => fn.mockReset()),
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getBadgeCount ──────────────────────────────────────────────────────

  describe('getBadgeCount', () => {
    it('should return badge count for unseen and seen alerts', async () => {
      mockPrisma.behaviourAlertRecipient.count.mockResolvedValue(5);

      const result = await service.getBadgeCount(TENANT_ID, USER_ID);

      expect(result).toBe(5);
      expect(mockPrisma.behaviourAlertRecipient.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          recipient_id: USER_ID,
          status: {
            in: ['unseen', 'seen'],
          },
        },
      });
    });
  });

  // ─── acknowledge ────────────────────────────────────────────────────────

  describe('acknowledge', () => {
    it('should acknowledge an alert recipient', async () => {
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue({
        id: RECIPIENT_ID,
        tenant_id: TENANT_ID,
        alert_id: ALERT_ID,
        recipient_id: USER_ID,
        status: 'seen',
      });
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({
        id: RECIPIENT_ID,
        status: 'acknowledged',
      });

      await service.acknowledge(TENANT_ID, USER_ID, ALERT_ID);

      expect(mockRlsTx.behaviourAlertRecipient.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          alert_id: ALERT_ID,
          recipient_id: USER_ID,
        },
      });
      expect(mockRlsTx.behaviourAlertRecipient.update).toHaveBeenCalledWith({
        where: { id: RECIPIENT_ID },
        data: expect.objectContaining({
          status: 'acknowledged',
        }),
      });
    });

    it('should throw NotFoundException when recipient not found', async () => {
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue(null);

      await expect(
        service.acknowledge(TENANT_ID, USER_ID, ALERT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── auto-resolve ───────────────────────────────────────────────────────

  describe('checkAndAutoResolve (via resolve)', () => {
    it('should auto-resolve alert when all recipients are resolved or dismissed', async () => {
      // The recipient lookup succeeds
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue({
        id: RECIPIENT_ID,
        tenant_id: TENANT_ID,
        alert_id: ALERT_ID,
        recipient_id: USER_ID,
        status: 'seen',
      });
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({
        id: RECIPIENT_ID,
        status: 'resolved_recipient',
      });
      // No unresolved recipients remain
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(0);
      mockRlsTx.behaviourAlert.update.mockResolvedValue({
        id: ALERT_ID,
        status: 'resolved_alert',
      });

      await service.resolve(TENANT_ID, USER_ID, ALERT_ID);

      expect(mockRlsTx.behaviourAlertRecipient.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          alert_id: ALERT_ID,
          status: {
            notIn: ['resolved_recipient', 'dismissed'],
          },
        },
      });
      expect(mockRlsTx.behaviourAlert.update).toHaveBeenCalledWith({
        where: { id: ALERT_ID },
        data: expect.objectContaining({
          status: 'resolved_alert',
        }),
      });
    });

    it('should not auto-resolve alert when some recipients are still active', async () => {
      // The recipient lookup succeeds
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue({
        id: RECIPIENT_ID,
        tenant_id: TENANT_ID,
        alert_id: ALERT_ID,
        recipient_id: USER_ID,
        status: 'seen',
      });
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({
        id: RECIPIENT_ID,
        status: 'resolved_recipient',
      });
      // 1 unresolved recipient remains
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(1);

      await service.resolve(TENANT_ID, USER_ID, ALERT_ID);

      expect(mockRlsTx.behaviourAlert.update).not.toHaveBeenCalled();
    });
  });
});
