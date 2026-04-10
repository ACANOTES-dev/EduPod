import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import {
  AdmissionsCapacityService,
  type AvailableSeatsResult,
} from './admissions-capacity.service';
import { AdmissionsDashboardService } from './admissions-dashboard.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

// eslint-disable-next-line import/order -- jest.mock must precede mocked imports
import { createRlsClient } from '../../common/middleware/rls.middleware';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ACADEMIC_YEAR_1 = 'a1111111-1111-1111-1111-111111111111';
const ACADEMIC_YEAR_2 = 'a2222222-2222-2222-2222-222222222222';
const YEAR_GROUP_1 = 'b1111111-1111-1111-1111-111111111111';
const YEAR_GROUP_2 = 'b2222222-2222-2222-2222-222222222222';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

interface MockTx {
  application: {
    count: jest.Mock;
    groupBy: jest.Mock;
  };
  admissionOverride: {
    count: jest.Mock;
  };
  yearGroup: {
    findMany: jest.Mock;
  };
}

function buildMockTx(): MockTx {
  return {
    application: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    admissionOverride: {
      count: jest.fn(),
    },
    yearGroup: {
      findMany: jest.fn(),
    },
  };
}

function mockRlsTransaction(tx: MockTx): void {
  (createRlsClient as jest.Mock).mockReturnValue({
    $transaction: async <T>(cb: (client: MockTx) => Promise<T>): Promise<T> => cb(tx),
  });
}

function availableSeats(
  total: number,
  enrolled: number,
  conditional: number,
): AvailableSeatsResult {
  return {
    total_capacity: total,
    enrolled_student_count: enrolled,
    conditional_approval_count: conditional,
    available_seats: Math.max(0, total - enrolled - conditional),
    configured: total > 0,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AdmissionsDashboardService', () => {
  let service: AdmissionsDashboardService;
  let capacityService: { getAvailableSeatsBatch: jest.Mock };

  beforeEach(async () => {
    capacityService = {
      getAvailableSeatsBatch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdmissionsDashboardService,
        { provide: PrismaService, useValue: {} },
        { provide: AdmissionsCapacityService, useValue: capacityService },
      ],
    }).compile();

    service = module.get(AdmissionsDashboardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── getSummary — counts ──────────────────────────────────────────────────

  describe('getSummary — counts', () => {
    it('returns all counts plus capacity pressure for a populated tenant', async () => {
      const tx = buildMockTx();

      // Order matches service: readyToAdmit, waitingList, waitingListAwaitingYearSetup,
      // conditionalApproval, conditionalNearExpiry, rejectedTotal, approvedThisMonth,
      // rejectedThisMonth, overridesTotal
      tx.application.count
        .mockResolvedValueOnce(7) // ready_to_admit
        .mockResolvedValueOnce(12) // waiting_list
        .mockResolvedValueOnce(3) // waiting_list awaiting year setup
        .mockResolvedValueOnce(5) // conditional_approval
        .mockResolvedValueOnce(2) // conditional near expiry
        .mockResolvedValueOnce(4) // rejected total
        .mockResolvedValueOnce(9) // approved this month
        .mockResolvedValueOnce(1); // rejected this month
      tx.admissionOverride.count.mockResolvedValueOnce(6);

      tx.application.groupBy.mockResolvedValue([
        {
          target_academic_year_id: ACADEMIC_YEAR_1,
          target_year_group_id: YEAR_GROUP_1,
          _count: { _all: 8 },
        },
        {
          target_academic_year_id: ACADEMIC_YEAR_2,
          target_year_group_id: YEAR_GROUP_2,
          _count: { _all: 4 },
        },
      ]);

      tx.yearGroup.findMany.mockResolvedValue([
        { id: YEAR_GROUP_1, name: 'Year 1' },
        { id: YEAR_GROUP_2, name: 'Year 2' },
      ]);

      capacityService.getAvailableSeatsBatch.mockResolvedValue(
        new Map([
          [`${ACADEMIC_YEAR_1}:${YEAR_GROUP_1}`, availableSeats(25, 20, 3)],
          [`${ACADEMIC_YEAR_2}:${YEAR_GROUP_2}`, availableSeats(25, 18, 5)],
        ]),
      );

      mockRlsTransaction(tx);

      const result = await service.getSummary(TENANT_A);

      expect(result.counts).toEqual({
        ready_to_admit: 7,
        waiting_list: 12,
        waiting_list_awaiting_year_setup: 3,
        conditional_approval: 5,
        conditional_approval_near_expiry: 2,
        rejected_total: 4,
        approved_this_month: 9,
        rejected_this_month: 1,
        overrides_total: 6,
      });

      expect(result.capacity_pressure).toEqual([
        {
          year_group_id: YEAR_GROUP_1,
          year_group_name: 'Year 1',
          waiting_list_count: 8,
          total_capacity: 25,
          enrolled_count: 20,
          conditional_count: 3,
        },
        {
          year_group_id: YEAR_GROUP_2,
          year_group_name: 'Year 2',
          waiting_list_count: 4,
          total_capacity: 25,
          enrolled_count: 18,
          conditional_count: 5,
        },
      ]);

      expect(createRlsClient).toHaveBeenCalledWith(expect.anything(), { tenant_id: TENANT_A });
    });

    it('scopes the RLS transaction to the requested tenant only', async () => {
      const tx = buildMockTx();
      tx.application.count.mockResolvedValue(0);
      tx.admissionOverride.count.mockResolvedValue(0);
      tx.application.groupBy.mockResolvedValue([]);
      mockRlsTransaction(tx);

      await service.getSummary(TENANT_B);

      expect(createRlsClient).toHaveBeenCalledWith(expect.anything(), { tenant_id: TENANT_B });
      // Every count where-clause should include the tenant filter.
      for (const call of tx.application.count.mock.calls) {
        const arg = call[0] as { where: { tenant_id: string } };
        expect(arg.where.tenant_id).toBe(TENANT_B);
      }
      const overrideArg = tx.admissionOverride.count.mock.calls[0]?.[0] as {
        where: { tenant_id: string };
      };
      expect(overrideArg.where.tenant_id).toBe(TENANT_B);
    });

    it('returns zero counts and empty capacity pressure for an empty tenant', async () => {
      const tx = buildMockTx();
      tx.application.count.mockResolvedValue(0);
      tx.admissionOverride.count.mockResolvedValue(0);
      tx.application.groupBy.mockResolvedValue([]);
      mockRlsTransaction(tx);

      const result = await service.getSummary(TENANT_A);

      expect(result.counts).toEqual({
        ready_to_admit: 0,
        waiting_list: 0,
        waiting_list_awaiting_year_setup: 0,
        conditional_approval: 0,
        conditional_approval_near_expiry: 0,
        rejected_total: 0,
        approved_this_month: 0,
        rejected_this_month: 0,
        overrides_total: 0,
      });
      expect(result.capacity_pressure).toEqual([]);
      expect(capacityService.getAvailableSeatsBatch).not.toHaveBeenCalled();
    });

    it('filters waiting-list aggregates with null year group or academic year', async () => {
      const tx = buildMockTx();
      tx.application.count.mockResolvedValue(0);
      tx.admissionOverride.count.mockResolvedValue(0);
      tx.application.groupBy.mockResolvedValue([
        {
          target_academic_year_id: null,
          target_year_group_id: YEAR_GROUP_1,
          _count: { _all: 2 },
        },
        {
          target_academic_year_id: ACADEMIC_YEAR_1,
          target_year_group_id: null,
          _count: { _all: 1 },
        },
      ]);
      mockRlsTransaction(tx);

      const result = await service.getSummary(TENANT_A);

      expect(capacityService.getAvailableSeatsBatch).not.toHaveBeenCalled();
      expect(result.capacity_pressure).toEqual([]);
    });

    it('labels a year group as Unknown when findMany does not return it', async () => {
      const tx = buildMockTx();
      tx.application.count.mockResolvedValue(0);
      tx.admissionOverride.count.mockResolvedValue(0);
      tx.application.groupBy.mockResolvedValue([
        {
          target_academic_year_id: ACADEMIC_YEAR_1,
          target_year_group_id: YEAR_GROUP_1,
          _count: { _all: 5 },
        },
      ]);
      tx.yearGroup.findMany.mockResolvedValue([]);
      capacityService.getAvailableSeatsBatch.mockResolvedValue(
        new Map([[`${ACADEMIC_YEAR_1}:${YEAR_GROUP_1}`, availableSeats(25, 25, 0)]]),
      );
      mockRlsTransaction(tx);

      const result = await service.getSummary(TENANT_A);

      expect(result.capacity_pressure[0]).toMatchObject({
        year_group_id: YEAR_GROUP_1,
        year_group_name: 'Unknown',
        waiting_list_count: 5,
      });
    });

    it('near-expiry count filters by payment_deadline within 2 days', async () => {
      const tx = buildMockTx();
      tx.application.count.mockResolvedValue(0);
      tx.admissionOverride.count.mockResolvedValue(0);
      tx.application.groupBy.mockResolvedValue([]);
      mockRlsTransaction(tx);

      await service.getSummary(TENANT_A);

      // near-expiry call is the 5th application.count call (0-indexed 4).
      const nearExpiryCall = tx.application.count.mock.calls[4]?.[0] as {
        where: {
          status: string;
          payment_deadline: { not: null; lte: Date };
        };
      };
      expect(nearExpiryCall.where.status).toBe('conditional_approval');
      expect(nearExpiryCall.where.payment_deadline.lte).toBeInstanceOf(Date);

      // The deadline should be approximately 2 days from now.
      const deltaMs = nearExpiryCall.where.payment_deadline.lte.getTime() - Date.now();
      expect(deltaMs).toBeGreaterThan(47 * 60 * 60 * 1000);
      expect(deltaMs).toBeLessThan(49 * 60 * 60 * 1000);
    });
  });
});
