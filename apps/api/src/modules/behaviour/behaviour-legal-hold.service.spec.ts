import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourLegalHoldService } from './behaviour-legal-hold.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const INCIDENT_ID = 'incident-1';
const HOLD_ID = 'hold-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourLegalHold: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  behaviourSanction: {
    findMany: jest.fn(),
  },
  behaviourTask: {
    findMany: jest.fn(),
  },
  behaviourAttachment: {
    findMany: jest.fn(),
  },
  behaviourDocument: {
    findMany: jest.fn(),
  },
  behaviourAppeal: {
    findFirst: jest.fn(),
  },
  behaviourExclusionCase: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BehaviourLegalHoldService', () => {
  let service: BehaviourLegalHoldService;
  let mockHistory: { recordHistory: jest.Mock };

  beforeEach(async () => {
    mockHistory = {
      recordHistory: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourLegalHoldService,
        { provide: PrismaService, useValue: {} },
        { provide: BehaviourHistoryService, useValue: mockHistory },
      ],
    }).compile();

    service = module.get<BehaviourLegalHoldService>(BehaviourLegalHoldService);

    // Reset RLS tx mocks
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => fn.mockReset()),
    );
  });

  // ─── createHold ─────────────────────────────────────────────────────────

  describe('createHold', () => {
    it('should create a hold and log history', async () => {
      const holdRecord = {
        id: HOLD_ID,
        tenant_id: TENANT_ID,
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        hold_reason: 'Active appeal',
        legal_basis: 'Appeal AP-000001',
        set_by_id: USER_ID,
        status: 'active_hold',
      };

      mockRlsTx.behaviourLegalHold.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourLegalHold.create.mockResolvedValue(holdRecord);
      // Propagation queries return empty
      mockRlsTx.behaviourSanction.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourTask.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourAttachment.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourDocument.findMany.mockResolvedValue([]);

      const result = await service.createHold(TENANT_ID, USER_ID, {
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        hold_reason: 'Active appeal',
        legal_basis: 'Appeal AP-000001',
        propagate: true,
      }) as { id: string };

      expect(result.id).toBe(HOLD_ID);
      expect(mockRlsTx.behaviourLegalHold.create).toHaveBeenCalledTimes(1);
      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'legal_hold_set',
        null,
        expect.objectContaining({ hold_id: HOLD_ID }),
      );
    });

    it('should return existing hold on duplicate legal_basis (idempotent)', async () => {
      const existingHold = {
        id: 'existing-hold',
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        hold_reason: 'Active appeal',
        legal_basis: 'Appeal AP-000001',
        status: 'active_hold',
      };

      mockRlsTx.behaviourLegalHold.findFirst.mockResolvedValue(existingHold);

      const result = await service.createHold(TENANT_ID, USER_ID, {
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        hold_reason: 'Active appeal',
        legal_basis: 'Appeal AP-000001',
        propagate: true,
      }) as { id: string };

      expect(result.id).toBe('existing-hold');
      expect(mockRlsTx.behaviourLegalHold.create).not.toHaveBeenCalled();
    });

    it('should propagate hold to linked sanctions and tasks for incident', async () => {
      const holdRecord = {
        id: HOLD_ID,
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        hold_reason: 'Active appeal',
        legal_basis: null,
        status: 'active_hold',
      };

      // findFirst for idempotency check returns null (no duplicate)
      mockRlsTx.behaviourLegalHold.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourLegalHold.create.mockResolvedValue(holdRecord);

      // Linked entities
      mockRlsTx.behaviourSanction.findMany.mockResolvedValue([{ id: 'sanction-1' }]);
      mockRlsTx.behaviourTask.findMany.mockResolvedValue([{ id: 'task-1' }]);
      mockRlsTx.behaviourAttachment.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);

      await service.createHold(TENANT_ID, USER_ID, {
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        hold_reason: 'Active appeal',
        propagate: true,
      });

      // Hold created for anchor + 3 linked entities (sanction, task, doc)
      // 1 create for anchor + 3 creates for propagation = 4 total
      expect(mockRlsTx.behaviourLegalHold.create).toHaveBeenCalledTimes(4);
    });

    it('should NOT propagate when propagate=false', async () => {
      mockRlsTx.behaviourLegalHold.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourLegalHold.create.mockResolvedValue({
        id: HOLD_ID,
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        status: 'active_hold',
      });

      await service.createHold(TENANT_ID, USER_ID, {
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        hold_reason: 'Manual hold',
        propagate: false,
      });

      // Only 1 create for the anchor
      expect(mockRlsTx.behaviourLegalHold.create).toHaveBeenCalledTimes(1);
      // No propagation queries
      expect(mockRlsTx.behaviourSanction.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── releaseHold ────────────────────────────────────────────────────────

  describe('releaseHold', () => {
    it('should release a hold and log history', async () => {
      const existingHold = {
        id: HOLD_ID,
        tenant_id: TENANT_ID,
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        status: 'active_hold',
        hold_reason: 'Active appeal',
        legal_basis: 'Appeal AP-000001',
      };

      mockRlsTx.behaviourLegalHold.findFirst.mockResolvedValue(existingHold);
      mockRlsTx.behaviourLegalHold.update.mockResolvedValue({});

      await service.releaseHold(TENANT_ID, USER_ID, HOLD_ID, {
        release_reason: 'Appeal resolved',
        release_linked: false,
      });

      expect(mockRlsTx.behaviourLegalHold.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: HOLD_ID },
          data: expect.objectContaining({ status: 'released' }),
        }),
      );
      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'legal_hold_released',
        expect.anything(),
        expect.objectContaining({ status: 'released' }),
      );
    });

    it('should be idempotent for already-released holds', async () => {
      mockRlsTx.behaviourLegalHold.findFirst.mockResolvedValue({
        id: HOLD_ID,
        status: 'released',
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
      });

      await service.releaseHold(TENANT_ID, USER_ID, HOLD_ID, {
        release_reason: 'Already done',
        release_linked: false,
      });

      expect(mockRlsTx.behaviourLegalHold.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent hold', async () => {
      mockRlsTx.behaviourLegalHold.findFirst.mockResolvedValue(null);

      await expect(
        service.releaseHold(TENANT_ID, USER_ID, 'non-existent', {
          release_reason: 'Test',
          release_linked: false,
        }),
      ).rejects.toThrow();
    });

    it('should release linked holds when releaseLinked=true', async () => {
      const existingHold = {
        id: HOLD_ID,
        tenant_id: TENANT_ID,
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        status: 'active_hold',
        hold_reason: 'Active appeal',
        legal_basis: 'Appeal AP-000001',
      };

      const linkedHold = {
        id: 'linked-hold-1',
        entity_type: 'sanction',
        entity_id: 'sanction-1',
        status: 'active_hold',
        legal_basis: 'Appeal AP-000001',
      };

      mockRlsTx.behaviourLegalHold.findFirst.mockResolvedValue(existingHold);
      mockRlsTx.behaviourLegalHold.findMany.mockResolvedValue([linkedHold]);
      mockRlsTx.behaviourLegalHold.update.mockResolvedValue({});

      await service.releaseHold(TENANT_ID, USER_ID, HOLD_ID, {
        release_reason: 'Appeal resolved',
        release_linked: true,
      });

      // Should update the primary hold + the linked hold
      expect(mockRlsTx.behaviourLegalHold.update).toHaveBeenCalledTimes(2);
    });
  });

  // ─── hasActiveHold ──────────────────────────────────────────────────────

  describe('hasActiveHold', () => {
    it('should return held=true when an active hold exists', async () => {
      mockRlsTx.behaviourLegalHold.findFirst.mockResolvedValue({
        id: HOLD_ID,
        hold_reason: 'Active appeal',
        legal_basis: 'Appeal AP-000001',
      });

      const result = await service.hasActiveHold(
        mockRlsTx as unknown as PrismaService,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
      );

      expect(result.held).toBe(true);
      expect(result.hold_reason).toBe('Active appeal');
    });

    it('should return held=false when no active hold exists', async () => {
      mockRlsTx.behaviourLegalHold.findFirst.mockResolvedValue(null);

      const result = await service.hasActiveHold(
        mockRlsTx as unknown as PrismaService,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
      );

      expect(result.held).toBe(false);
    });
  });

  // ─── listHolds ──────────────────────────────────────────────────────────

  describe('listHolds', () => {
    it('should return paginated holds', async () => {
      mockRlsTx.behaviourLegalHold.count.mockResolvedValue(1);
      mockRlsTx.behaviourLegalHold.findMany.mockResolvedValue([{
        id: HOLD_ID,
        entity_type: 'incident',
        entity_id: INCIDENT_ID,
        hold_reason: 'Test',
        legal_basis: null,
        status: 'active_hold',
        set_by: { id: USER_ID, first_name: 'Admin', last_name: 'User' },
        set_at: new Date('2026-03-27'),
        released_by: null,
        released_at: null,
        release_reason: null,
      }]);

      const result = await service.listHolds(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'active',
      }) as { data: { status: string }[]; meta: { total: number } };

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.status).toBe('active');
      expect(result.meta.total).toBe(1);
    });
  });
});
