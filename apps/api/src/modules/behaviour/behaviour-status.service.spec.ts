import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourStatusService } from './behaviour-status.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const INCIDENT_ID = 'incident-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourIncident: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  behaviourTask: {
    updateMany: jest.fn(),
  },
  behaviourSanction: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  behaviourEntityHistory: {
    create: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Factories ────────────────────────────────────────────────────────────────

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  tenant_id: TENANT_ID,
  status: 'active',
  parent_notification_status: 'not_required',
  ...overrides,
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BehaviourStatusService', () => {
  let service: BehaviourStatusService;
  let mockHistory: { recordHistory: jest.Mock };

  beforeEach(async () => {
    mockHistory = { recordHistory: jest.fn().mockResolvedValue(undefined) };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourStatusService,
        { provide: PrismaService, useValue: {} },
        { provide: BehaviourHistoryService, useValue: mockHistory },
      ],
    }).compile();

    service = module.get<BehaviourStatusService>(BehaviourStatusService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── transitionStatus ──────────────────────────────────────────────────────

  describe('BehaviourStatusService — transitionStatus', () => {
    it('should throw NotFoundException when incident not found', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, {
          status: 'active',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid transition', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await expect(
        service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, {
          status: 'active',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should transition active -> investigating and record history', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident({ status: 'active' }));
      mockRlsTx.behaviourIncident.update.mockResolvedValue(
        makeIncident({ status: 'investigating' }),
      );

      const result = await service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, {
        status: 'investigating',
      });

      expect(result.status).toBe('investigating');
      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'status_changed',
        { status: 'active' },
        { status: 'investigating' },
        undefined,
      );
    });

    it('should pass reason to history when provided', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident({ status: 'active' }));
      mockRlsTx.behaviourIncident.update.mockResolvedValue(
        makeIncident({ status: 'investigating' }),
      );

      await service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, {
        status: 'investigating',
        reason: 'Verified by senior staff',
      });

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'Verified by senior staff',
      );
    });

    it('should reject withdrawn -> any (terminal status)', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await expect(
        service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, {
          status: 'active',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject closed -> active (terminal status)', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident({ status: 'closed' }));

      await expect(
        service.transitionStatus(TENANT_ID, INCIDENT_ID, USER_ID, {
          status: 'active',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── withdrawIncident ──────────────────────────────────────────────────────

  describe('BehaviourStatusService — withdrawIncident', () => {
    it('should throw NotFoundException when incident not found', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.withdrawIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
          reason: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid transition to withdrawn', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await expect(
        service.withdrawIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
          reason: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should withdraw incident from active status', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ status: 'active', parent_notification_status: 'not_required' }),
      );
      mockRlsTx.behaviourIncident.update.mockResolvedValue(makeIncident({ status: 'withdrawn' }));
      mockRlsTx.behaviourTask.updateMany.mockResolvedValue({ count: 0 });
      mockRlsTx.behaviourSanction.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncident.findUnique.mockResolvedValue(
        makeIncident({ status: 'withdrawn', category: {}, participants: [] }),
      );

      const result = await service.withdrawIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        reason: 'Mistake',
      });

      expect(result).toBeDefined();
      expect(mockRlsTx.behaviourIncident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: expect.objectContaining({ status: 'withdrawn' }),
      });
    });

    it('should cancel pending tasks linked to the incident', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident({ status: 'active' }));
      mockRlsTx.behaviourIncident.update.mockResolvedValue({});
      mockRlsTx.behaviourTask.updateMany.mockResolvedValue({ count: 2 });
      mockRlsTx.behaviourSanction.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncident.findUnique.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await service.withdrawIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        reason: 'Mistake',
      });

      expect(mockRlsTx.behaviourTask.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          entity_type: 'incident',
          entity_id: INCIDENT_ID,
          status: { in: ['pending', 'in_progress', 'overdue'] },
        }),
        data: { status: 'cancelled' },
      });
    });

    it('should cancel linked sanctions and their tasks', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident({ status: 'active' }));
      mockRlsTx.behaviourIncident.update.mockResolvedValue({});
      mockRlsTx.behaviourTask.updateMany.mockResolvedValue({ count: 0 });
      mockRlsTx.behaviourSanction.findMany.mockResolvedValue([
        { id: 'sanction-1' },
        { id: 'sanction-2' },
      ]);
      mockRlsTx.behaviourSanction.updateMany.mockResolvedValue({ count: 2 });
      mockRlsTx.behaviourIncident.findUnique.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await service.withdrawIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        reason: 'Mistake',
      });

      // Sanctions should be cancelled
      expect(mockRlsTx.behaviourSanction.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['sanction-1', 'sanction-2'] } },
        data: { status: 'cancelled' },
      });

      // Tasks linked to those sanctions should also be cancelled
      const taskCancelCalls = mockRlsTx.behaviourTask.updateMany.mock.calls;
      const sanctionTaskCancel = taskCancelCalls.find(
        (call: [{ where: { entity_type: string } }]) => call[0].where.entity_type === 'sanction',
      );
      expect(sanctionTaskCancel).toBeDefined();
    });

    it('should NOT cancel sanctions when none are linked', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident({ status: 'active' }));
      mockRlsTx.behaviourIncident.update.mockResolvedValue({});
      mockRlsTx.behaviourTask.updateMany.mockResolvedValue({ count: 0 });
      mockRlsTx.behaviourSanction.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncident.findUnique.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await service.withdrawIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        reason: 'Mistake',
      });

      expect(mockRlsTx.behaviourSanction.updateMany).not.toHaveBeenCalled();
    });

    it('should change parent_notification_status from pending to not_required on withdrawal', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ status: 'active', parent_notification_status: 'pending' }),
      );
      mockRlsTx.behaviourIncident.update.mockResolvedValue({});
      mockRlsTx.behaviourTask.updateMany.mockResolvedValue({ count: 0 });
      mockRlsTx.behaviourSanction.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncident.findUnique.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await service.withdrawIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        reason: 'Mistake',
      });

      expect(mockRlsTx.behaviourIncident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: expect.objectContaining({
          status: 'withdrawn',
          parent_notification_status: 'not_required',
        }),
      });
    });

    it('should NOT change parent_notification_status when not pending', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(
        makeIncident({ status: 'active', parent_notification_status: 'sent' }),
      );
      mockRlsTx.behaviourIncident.update.mockResolvedValue({});
      mockRlsTx.behaviourTask.updateMany.mockResolvedValue({ count: 0 });
      mockRlsTx.behaviourSanction.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncident.findUnique.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await service.withdrawIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        reason: 'Mistake',
      });

      expect(mockRlsTx.behaviourIncident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { status: 'withdrawn' },
      });
    });

    it('should include cancelled_sanctions count in history', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident({ status: 'active' }));
      mockRlsTx.behaviourIncident.update.mockResolvedValue({});
      mockRlsTx.behaviourTask.updateMany.mockResolvedValue({ count: 0 });
      mockRlsTx.behaviourSanction.findMany.mockResolvedValue([{ id: 'sanction-1' }]);
      mockRlsTx.behaviourSanction.updateMany.mockResolvedValue({ count: 1 });
      mockRlsTx.behaviourIncident.findUnique.mockResolvedValue(
        makeIncident({ status: 'withdrawn' }),
      );

      await service.withdrawIncident(TENANT_ID, INCIDENT_ID, USER_ID, {
        reason: 'Mistake',
      });

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        expect.anything(),
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'status_changed',
        expect.objectContaining({ status: 'active' }),
        expect.objectContaining({
          status: 'withdrawn',
          cancelled_tasks: true,
          cancelled_sanctions: 1,
        }),
        'Mistake',
      );
    });
  });
});
