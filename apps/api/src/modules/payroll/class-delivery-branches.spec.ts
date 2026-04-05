/**
 * Additional branch coverage for ClassDeliveryService.
 * Targets: autoPopulateFromSchedule branches (no schedules, closures, skipped existing,
 * null teacher_staff_id), getDeliveryRecords filter branches (date_from/date_to vs month/year),
 * calculateClassesTaught status breakdowns, confirmDelivery optional fields.
 */
/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import {
  MOCK_FACADE_PROVIDERS,
  SchedulesReadFacade,
  SchoolClosuresReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { ClassDeliveryService } from './class-delivery.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_ID = 'staff-1';
const USER_ID = 'user-1';
const RECORD_ID = 'rec-1';
const SCHEDULE_ID = 'sched-1';

describe('ClassDeliveryService — branch coverage', () => {
  let service: ClassDeliveryService;
  let mockPrisma: {
    classDeliveryRecord: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
  };
  let mockSchedulesFacade: { findEffectiveInRange: jest.Mock };
  let mockClosuresFacade: { getClosureDateSet: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      classDeliveryRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockSchedulesFacade = {
      findEffectiveInRange: jest.fn().mockResolvedValue([]),
    };
    mockClosuresFacade = {
      getClosureDateSet: jest.fn().mockResolvedValue(new Set()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: SchedulesReadFacade, useValue: mockSchedulesFacade },
        { provide: SchoolClosuresReadFacade, useValue: mockClosuresFacade },
        ClassDeliveryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClassDeliveryService>(ClassDeliveryService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── autoPopulateFromSchedule — no schedules ──────────────────────────────

  describe('ClassDeliveryService — autoPopulateFromSchedule', () => {
    it('should return 0 when no schedules found', async () => {
      const result = await service.autoPopulateFromSchedule(TENANT_ID, USER_ID, {
        month: 3,
        year: 2026,
      });

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.message).toContain('No active schedules');
    });

    it('should skip schedules with null teacher_staff_id', async () => {
      mockSchedulesFacade.findEffectiveInRange.mockResolvedValue([
        { id: SCHEDULE_ID, weekday: 1, teacher_staff_id: null },
      ]);

      const result = await service.autoPopulateFromSchedule(TENANT_ID, USER_ID, {
        month: 3,
        year: 2026,
      });

      expect(result.created).toBe(0);
    });

    it('should skip dates that are school closures', async () => {
      // Schedule on Monday (weekday 1)
      mockSchedulesFacade.findEffectiveInRange.mockResolvedValue([
        { id: SCHEDULE_ID, weekday: 1, teacher_staff_id: STAFF_ID },
      ]);
      // Close all dates — use the set of all Mondays in March 2026
      const closureDates = new Set<string>();
      for (let day = 1; day <= 31; day++) {
        const d = new Date(2026, 2, day);
        if (d.getMonth() === 2) {
          closureDates.add(d.toISOString().split('T')[0] as string);
        }
      }
      mockClosuresFacade.getClosureDateSet.mockResolvedValue(closureDates);

      const result = await service.autoPopulateFromSchedule(TENANT_ID, USER_ID, {
        month: 3,
        year: 2026,
      });

      expect(result.created).toBe(0);
    });

    it('should skip existing records (idempotent)', async () => {
      mockSchedulesFacade.findEffectiveInRange.mockResolvedValue([
        { id: SCHEDULE_ID, weekday: 1, teacher_staff_id: STAFF_ID },
      ]);
      // All existing records found
      mockPrisma.classDeliveryRecord.findUnique.mockResolvedValue({ id: RECORD_ID });

      const result = await service.autoPopulateFromSchedule(TENANT_ID, USER_ID, {
        month: 3,
        year: 2026,
      });

      // Should have skipped, not created
      expect(result.skipped).toBeGreaterThan(0);
      expect(result.created).toBe(0);
    });

    it('should create records for matching dates', async () => {
      // Schedule on Monday
      mockSchedulesFacade.findEffectiveInRange.mockResolvedValue([
        { id: SCHEDULE_ID, weekday: 1, teacher_staff_id: STAFF_ID },
      ]);
      // No existing records
      mockPrisma.classDeliveryRecord.findUnique.mockResolvedValue(null);
      mockPrisma.classDeliveryRecord.create.mockResolvedValue({ id: 'new-rec' });

      const result = await service.autoPopulateFromSchedule(TENANT_ID, USER_ID, {
        month: 3,
        year: 2026,
      });

      // March 2026 has Mondays on: 2, 9, 16, 23, 30
      expect(result.created).toBe(5);
    });
  });

  // ─── confirmDelivery — not found and optional fields ──────────────────────

  describe('ClassDeliveryService — confirmDelivery', () => {
    it('should throw NotFoundException when record not found', async () => {
      await expect(
        service.confirmDelivery(TENANT_ID, 'nonexistent', USER_ID, { status: 'delivered' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should pass substitute_staff_id and notes when provided', async () => {
      mockPrisma.classDeliveryRecord.findFirst.mockResolvedValue({ id: RECORD_ID });
      mockPrisma.classDeliveryRecord.update.mockResolvedValue({ id: RECORD_ID });

      await service.confirmDelivery(TENANT_ID, RECORD_ID, USER_ID, {
        status: 'absent_covered',
        substitute_staff_id: 'sub-staff-1',
        notes: 'Covered by supply teacher',
      });

      expect(mockPrisma.classDeliveryRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'absent_covered',
            substitute_staff_id: 'sub-staff-1',
            notes: 'Covered by supply teacher',
          }),
        }),
      );
    });

    it('should set null when optional fields omitted', async () => {
      mockPrisma.classDeliveryRecord.findFirst.mockResolvedValue({ id: RECORD_ID });
      mockPrisma.classDeliveryRecord.update.mockResolvedValue({ id: RECORD_ID });

      await service.confirmDelivery(TENANT_ID, RECORD_ID, USER_ID, {
        status: 'cancelled',
      });

      expect(mockPrisma.classDeliveryRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            substitute_staff_id: null,
            notes: null,
          }),
        }),
      );
    });
  });

  // ─── getDeliveryRecords — filter branches ─────────────────────────────────

  describe('ClassDeliveryService — getDeliveryRecords', () => {
    it('should filter by date_from and date_to', async () => {
      mockPrisma.classDeliveryRecord.findMany.mockResolvedValue([]);
      mockPrisma.classDeliveryRecord.count.mockResolvedValue(0);

      await service.getDeliveryRecords(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      });

      expect(mockPrisma.classDeliveryRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            delivery_date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should filter by month and year when no date_from/date_to', async () => {
      mockPrisma.classDeliveryRecord.findMany.mockResolvedValue([]);
      mockPrisma.classDeliveryRecord.count.mockResolvedValue(0);

      await service.getDeliveryRecords(TENANT_ID, {
        page: 1,
        pageSize: 20,
        month: 3,
        year: 2026,
      });

      expect(mockPrisma.classDeliveryRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            delivery_date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should filter by staff_profile_id', async () => {
      mockPrisma.classDeliveryRecord.findMany.mockResolvedValue([]);
      mockPrisma.classDeliveryRecord.count.mockResolvedValue(0);

      await service.getDeliveryRecords(TENANT_ID, {
        page: 1,
        pageSize: 20,
        staff_profile_id: STAFF_ID,
      });

      expect(mockPrisma.classDeliveryRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ staff_profile_id: STAFF_ID }),
        }),
      );
    });

    it('should not add date filter when neither date range nor month/year provided', async () => {
      mockPrisma.classDeliveryRecord.findMany.mockResolvedValue([]);
      mockPrisma.classDeliveryRecord.count.mockResolvedValue(0);

      await service.getDeliveryRecords(TENANT_ID, { page: 1, pageSize: 20 });

      const callArgs = mockPrisma.classDeliveryRecord.findMany.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      const where = callArgs.where as Record<string, unknown>;
      expect(where.delivery_date).toBeUndefined();
    });

    it('should filter by date_from only', async () => {
      mockPrisma.classDeliveryRecord.findMany.mockResolvedValue([]);
      mockPrisma.classDeliveryRecord.count.mockResolvedValue(0);

      await service.getDeliveryRecords(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-03-01',
      });

      const callArgs = mockPrisma.classDeliveryRecord.findMany.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      const where = callArgs.where as Record<string, unknown>;
      const dateFilter = where.delivery_date as Record<string, unknown>;
      expect(dateFilter.gte).toBeDefined();
      expect(dateFilter.lte).toBeUndefined();
    });
  });

  // ─── calculateClassesTaught — status breakdowns ──────────────────────────

  describe('ClassDeliveryService — calculateClassesTaught', () => {
    it('should correctly break down all status types', async () => {
      mockPrisma.classDeliveryRecord.findMany.mockResolvedValue([
        { status: 'delivered' },
        { status: 'delivered' },
        { status: 'absent_covered' },
        { status: 'absent_uncovered' },
        { status: 'cancelled' },
        { status: 'cancelled' },
      ]);

      const result = await service.calculateClassesTaught(TENANT_ID, {
        staff_profile_id: STAFF_ID,
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      });

      expect(result.classes_taught).toBe(2);
      expect(result.breakdown.delivered).toBe(2);
      expect(result.breakdown.absent_covered).toBe(1);
      expect(result.breakdown.absent_uncovered).toBe(1);
      expect(result.breakdown.cancelled).toBe(2);
      expect(result.breakdown.total_scheduled).toBe(6);
    });

    it('should return all zeros when no records', async () => {
      mockPrisma.classDeliveryRecord.findMany.mockResolvedValue([]);

      const result = await service.calculateClassesTaught(TENANT_ID, {
        staff_profile_id: STAFF_ID,
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      });

      expect(result.classes_taught).toBe(0);
      expect(result.breakdown.total_scheduled).toBe(0);
    });
  });
});
