import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourSanctionsLifecycleService } from './behaviour-sanctions-lifecycle.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const SANCTION_ID = 'sanction-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourSanction: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  behaviourAppeal: {
    findFirst: jest.fn(),
  },
  schoolClosure: {
    findFirst: jest.fn(),
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

const makeSanction = (overrides: Record<string, unknown> = {}) => ({
  id: SANCTION_ID,
  tenant_id: TENANT_ID,
  sanction_number: 'SN-202603-000001',
  status: 'scheduled',
  type: 'detention',
  scheduled_date: new Date('2026-03-20'),
  suspension_start_date: null,
  suspension_end_date: null,
  retention_status: 'active',
  ...overrides,
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BehaviourSanctionsLifecycleService', () => {
  let service: BehaviourSanctionsLifecycleService;
  let mockPrisma: {
    behaviourSanction: { findMany: jest.Mock; count: jest.Mock };
    schoolClosure: { findFirst: jest.Mock };
  };
  let mockHistory: { recordHistory: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      behaviourSanction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      schoolClosure: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    mockHistory = { recordHistory: jest.fn().mockResolvedValue(undefined) };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourSanctionsLifecycleService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourHistoryService, useValue: mockHistory },
      ],
    }).compile();

    service = module.get<BehaviourSanctionsLifecycleService>(BehaviourSanctionsLifecycleService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── transitionStatus ──────────────────────────────────────────────────────

  describe('BehaviourSanctionsLifecycleService — transitionStatus', () => {
    it('should throw NotFoundException when sanction not found', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(null);

      await expect(
        service.transitionStatus(TENANT_ID, SANCTION_ID, 'served', undefined, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid transition', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(makeSanction({ status: 'served' }));

      await expect(
        service.transitionStatus(TENANT_ID, SANCTION_ID, 'scheduled', undefined, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should transition scheduled -> served and set served_at/served_by', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(
        makeSanction({ status: 'scheduled' }),
      );
      mockRlsTx.behaviourSanction.update.mockResolvedValue(makeSanction({ status: 'served' }));

      await service.transitionStatus(TENANT_ID, SANCTION_ID, 'served', undefined, USER_ID);

      expect(mockRlsTx.behaviourSanction.update).toHaveBeenCalledWith({
        where: { id: SANCTION_ID },
        data: expect.objectContaining({
          status: 'served',
          served_at: expect.any(Date),
          served_by: { connect: { id: USER_ID } },
        }),
      });
    });

    it('should verify appeal exists before transitioning to appealed', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(
        makeSanction({ status: 'scheduled' }),
      );
      mockRlsTx.behaviourAppeal.findFirst.mockResolvedValue(null);

      await expect(
        service.transitionStatus(TENANT_ID, SANCTION_ID, 'appealed', undefined, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow transition to appealed when appeal exists', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(
        makeSanction({ status: 'scheduled' }),
      );
      mockRlsTx.behaviourAppeal.findFirst.mockResolvedValue({
        id: 'appeal-1',
        status: 'submitted',
      });
      mockRlsTx.behaviourSanction.update.mockResolvedValue(makeSanction({ status: 'appealed' }));

      await service.transitionStatus(TENANT_ID, SANCTION_ID, 'appealed', undefined, USER_ID);

      expect(mockRlsTx.behaviourSanction.update).toHaveBeenCalledWith({
        where: { id: SANCTION_ID },
        data: expect.objectContaining({ status: 'appealed' }),
      });
    });

    it('should record history with reason when provided', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(
        makeSanction({ status: 'scheduled' }),
      );
      mockRlsTx.behaviourSanction.update.mockResolvedValue(makeSanction({ status: 'served' }));

      await service.transitionStatus(TENANT_ID, SANCTION_ID, 'served', 'Student attended', USER_ID);

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'sanction',
        SANCTION_ID,
        USER_ID,
        'status_changed',
        { status: 'scheduled' },
        { status: 'served' },
        'Student attended',
      );
    });
  });

  // ─── getTodaySanctions ─────────────────────────────────────────────────────

  describe('BehaviourSanctionsLifecycleService — getTodaySanctions', () => {
    it('should group sanctions by type', async () => {
      const sanctions = [
        makeSanction({ id: 's1', type: 'detention' }),
        makeSanction({ id: 's2', type: 'detention' }),
        makeSanction({ id: 's3', type: 'internal_exclusion' }),
      ];
      mockPrisma.behaviourSanction.findMany.mockResolvedValue(sanctions);

      const result = await service.getTodaySanctions(TENANT_ID);

      expect(result.total).toBe(3);
      expect(result.data['detention']).toHaveLength(2);
      expect(result.data['internal_exclusion']).toHaveLength(1);
    });

    it('should return empty when no sanctions today', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([]);

      const result = await service.getTodaySanctions(TENANT_ID);

      expect(result.total).toBe(0);
      expect(Object.keys(result.data)).toHaveLength(0);
    });
  });

  // ─── bulkMarkServed ────────────────────────────────────────────────────────

  describe('BehaviourSanctionsLifecycleService — bulkMarkServed', () => {
    it('should succeed for all valid sanctions', async () => {
      mockRlsTx.behaviourSanction.findFirst
        .mockResolvedValueOnce(
          makeSanction({ id: 's1', sanction_number: 'SN-001', status: 'scheduled' }),
        )
        .mockResolvedValueOnce(
          makeSanction({ id: 's2', sanction_number: 'SN-002', status: 'scheduled' }),
        );
      mockRlsTx.behaviourSanction.update.mockResolvedValue({});

      const result = await service.bulkMarkServed(
        TENANT_ID,
        { sanction_ids: ['s1', 's2'] },
        USER_ID,
      );

      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it('should report not found sanctions in failed', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(null);

      const result = await service.bulkMarkServed(
        TENANT_ID,
        { sanction_ids: ['nonexistent'] },
        USER_ID,
      );

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.reason).toContain('not found');
    });

    it('should report invalid transition sanctions in failed', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(
        makeSanction({ id: 's1', sanction_number: 'SN-001', status: 'served' }),
      );

      const result = await service.bulkMarkServed(TENANT_ID, { sanction_ids: ['s1'] }, USER_ID);

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.reason).toContain('served');
    });

    it('should use served_at from dto when provided', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(
        makeSanction({ id: 's1', sanction_number: 'SN-001', status: 'scheduled' }),
      );
      mockRlsTx.behaviourSanction.update.mockResolvedValue({});

      await service.bulkMarkServed(
        TENANT_ID,
        { sanction_ids: ['s1'], served_at: '2026-03-20T10:00:00Z' },
        USER_ID,
      );

      expect(mockRlsTx.behaviourSanction.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({
          served_at: new Date('2026-03-20T10:00:00Z'),
        }),
      });
    });

    it('should use current date when served_at is not in dto', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(
        makeSanction({ id: 's1', sanction_number: 'SN-001', status: 'scheduled' }),
      );
      mockRlsTx.behaviourSanction.update.mockResolvedValue({});

      await service.bulkMarkServed(TENANT_ID, { sanction_ids: ['s1'] }, USER_ID);

      expect(mockRlsTx.behaviourSanction.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({
          served_at: expect.any(Date),
        }),
      });
    });

    it('edge: mixed valid and invalid sanctions', async () => {
      mockRlsTx.behaviourSanction.findFirst
        .mockResolvedValueOnce(
          makeSanction({ id: 's1', sanction_number: 'SN-001', status: 'scheduled' }),
        )
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          makeSanction({ id: 's3', sanction_number: 'SN-003', status: 'cancelled' }),
        );
      mockRlsTx.behaviourSanction.update.mockResolvedValue({});

      const result = await service.bulkMarkServed(
        TENANT_ID,
        { sanction_ids: ['s1', 's2', 's3'] },
        USER_ID,
      );

      expect(result.succeeded).toHaveLength(1);
      expect(result.succeeded[0]!.id).toBe('s1');
      expect(result.failed).toHaveLength(2);
    });
  });

  // ─── getReturningSoon ──────────────────────────────────────────────────────

  describe('BehaviourSanctionsLifecycleService — getReturningSoon', () => {
    it('should filter out sanctions with no suspension_end_date', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([
        makeSanction({
          id: 's1',
          type: 'suspension_external',
          suspension_end_date: null,
        }),
      ]);
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      const result = await service.getReturningSoon(TENANT_ID);

      expect(result.data).toHaveLength(0);
    });

    it('should include sanctions returning within 5 school days', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(threeDaysLater.getDate() + 1);

      mockPrisma.behaviourSanction.findMany.mockResolvedValue([
        makeSanction({
          id: 's1',
          type: 'suspension_external',
          suspension_end_date: threeDaysLater,
        }),
      ]);
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      const result = await service.getReturningSoon(TENANT_ID);

      expect(result.data).toHaveLength(1);
    });
  });

  // ─── getMySupervision ──────────────────────────────────────────────────────

  describe('BehaviourSanctionsLifecycleService — getMySupervision', () => {
    it('should return sanctions supervised by the given user', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([
        makeSanction({ supervised_by_id: USER_ID }),
      ]);

      const result = await service.getMySupervision(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(1);
    });
  });

  // ─── getCalendarView ───────────────────────────────────────────────────────

  describe('BehaviourSanctionsLifecycleService — getCalendarView', () => {
    it('should return sanctions within date range', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([makeSanction()]);

      const result = await service.getCalendarView(TENANT_ID, {
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      });

      expect(result.data).toHaveLength(1);
    });
  });

  // ─── getActiveSuspensions ──────────────────────────────────────────────────

  describe('BehaviourSanctionsLifecycleService — getActiveSuspensions', () => {
    it('should return active suspensions', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([
        makeSanction({ type: 'suspension_external', status: 'scheduled' }),
      ]);

      const result = await service.getActiveSuspensions(TENANT_ID);

      expect(result.data).toHaveLength(1);
    });
  });
});
