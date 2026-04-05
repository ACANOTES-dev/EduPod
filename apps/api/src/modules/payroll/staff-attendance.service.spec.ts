import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { StaffAttendanceService } from './staff-attendance.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';
const RECORD_ID = '44444444-4444-4444-4444-444444444444';

const mockRecord = {
  id: RECORD_ID,
  tenant_id: TENANT_ID,
  staff_profile_id: STAFF_ID,
  date: new Date('2026-03-01'),
  status: 'present',
  marked_by_user_id: USER_ID,
  notes: null,
  created_at: new Date(),
  updated_at: new Date(),
};

function buildPrisma(overrides: Record<string, unknown> = {}) {
  return {
    staffAttendanceRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(mockRecord),
      findMany: jest.fn().mockResolvedValue([mockRecord]),
      create: jest.fn().mockResolvedValue(mockRecord),
      update: jest.fn().mockResolvedValue(mockRecord),
      delete: jest.fn().mockResolvedValue(mockRecord),
      count: jest.fn().mockResolvedValue(1),
    },
    $extends: jest.fn().mockReturnThis(),
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        staffAttendanceRecord: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(mockRecord),
          update: jest.fn().mockResolvedValue(mockRecord),
        },
      }),
    ),
    ...overrides,
  };
}

describe('StaffAttendanceService', () => {
  let service: StaffAttendanceService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [StaffAttendanceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<StaffAttendanceService>(StaffAttendanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should mark attendance (create new)', async () => {
    const result = await service.markAttendance(TENANT_ID, USER_ID, {
      staff_profile_id: STAFF_ID,
      date: '2026-03-01',
      status: 'present',
    });

    expect(result).toMatchObject({ id: RECORD_ID, status: 'present' });
  });

  it('should return daily attendance with pagination', async () => {
    const result = await service.getDailyAttendance(TENANT_ID, {
      date: '2026-03-01',
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('should throw NotFoundException when getting non-existent record', async () => {
    prisma.staffAttendanceRecord.findFirst = jest.fn().mockResolvedValue(null);

    await expect(service.getRecord(TENANT_ID, RECORD_ID)).rejects.toThrow(NotFoundException);
  });

  it('should calculate days worked correctly', async () => {
    const records = [
      { status: 'present' },
      { status: 'present' },
      { status: 'half_day' },
      { status: 'absent' },
      { status: 'paid_leave' },
      { status: 'sick_leave' },
      { status: 'unpaid_leave' },
    ];
    prisma.staffAttendanceRecord.findMany = jest.fn().mockResolvedValue(records);

    const result = await service.calculateDaysWorked(TENANT_ID, {
      staff_profile_id: STAFF_ID,
      date_from: '2026-03-01',
      date_to: '2026-03-31',
    });

    // present(2) + half_day(0.5) + paid_leave(1) + sick_leave(1) = 4.5
    expect(result.days_worked).toBe(4.5);
    expect(result.breakdown.present).toBe(2);
    expect(result.breakdown.half_day).toBe(1);
    expect(result.breakdown.absent).toBe(1);
  });

  it('should throw NotFoundException when date is missing for daily view', async () => {
    await expect(
      service.getDailyAttendance(TENANT_ID, {
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should delete an attendance record', async () => {
    const result = await service.deleteRecord(TENANT_ID, RECORD_ID);
    expect(result).toMatchObject({ id: RECORD_ID, deleted: true });
  });

  // ─── markAttendance — update existing ─────────────────────────────────────────

  describe('markAttendance — update existing', () => {
    it('should update when record already exists', async () => {
      const updatedRecord = { ...mockRecord, status: 'absent', notes: 'Late notice' };

      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          staffAttendanceRecord: {
            findUnique: jest.fn().mockResolvedValue(mockRecord), // existing record found
            update: jest.fn().mockResolvedValue(updatedRecord),
            create: jest.fn(),
          },
        }),
      );

      const result = await service.markAttendance(TENANT_ID, USER_ID, {
        staff_profile_id: STAFF_ID,
        date: '2026-03-01',
        status: 'absent',
        notes: 'Late notice',
      });

      expect(result).toMatchObject({ status: 'absent', notes: 'Late notice' });
    });
  });

  // ─── bulkMarkAttendance ──────────────────────────────────────────────────────

  describe('bulkMarkAttendance', () => {
    it('should handle mix of new and existing records', async () => {
      const existingRecord = { ...mockRecord, id: 'existing-1' };
      const newRecord = { ...mockRecord, id: 'new-1', staff_profile_id: 'staff-2' };

      let findCallCount = 0;
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          staffAttendanceRecord: {
            findUnique: jest.fn().mockImplementation(() => {
              findCallCount++;
              // First call: record exists, second call: no record
              return findCallCount === 1 ? Promise.resolve(existingRecord) : Promise.resolve(null);
            }),
            update: jest.fn().mockResolvedValue(existingRecord),
            create: jest.fn().mockResolvedValue(newRecord),
          },
        }),
      );

      const result = await service.bulkMarkAttendance(TENANT_ID, USER_ID, {
        date: '2026-03-01',
        records: [
          { staff_profile_id: STAFF_ID, status: 'present' },
          { staff_profile_id: 'staff-2', status: 'absent' },
        ],
      });

      expect(result.processed).toBe(2);
      expect(result.records).toHaveLength(2);
      expect(result.date).toBe('2026-03-01');
    });

    it('should create all records when none exist', async () => {
      prisma.$transaction = jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          staffAttendanceRecord: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(mockRecord),
            update: jest.fn(),
          },
        }),
      );

      const result = await service.bulkMarkAttendance(TENANT_ID, USER_ID, {
        date: '2026-03-01',
        records: [{ staff_profile_id: STAFF_ID, status: 'present' }],
      });

      expect(result.processed).toBe(1);
    });
  });

  // ─��─ getMonthlyAttendance ────────────────────────────────────────────────────

  describe('getMonthlyAttendance', () => {
    it('should filter by staff_profile_id when provided', async () => {
      const result = await service.getMonthlyAttendance(TENANT_ID, {
        month: 3,
        year: 2026,
        staff_profile_id: STAFF_ID,
        page: 1,
        pageSize: 20,
      });

      expect(prisma.staffAttendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            staff_profile_id: STAFF_ID,
          }),
        }),
      );
      expect(result.data).toHaveLength(1);
    });

    it('should default to current month/year when not provided', async () => {
      const now = new Date();

      await service.getMonthlyAttendance(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(prisma.staffAttendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              gte: new Date(now.getFullYear(), now.getMonth(), 1),
              lte: new Date(now.getFullYear(), now.getMonth() + 1, 0),
            }),
          }),
        }),
      );
    });

    it('should include month and year in meta', async () => {
      const result = await service.getMonthlyAttendance(TENANT_ID, {
        month: 6,
        year: 2026,
        page: 1,
        pageSize: 20,
      });

      expect(result.meta).toEqual(
        expect.objectContaining({
          month: 6,
          year: 2026,
        }),
      );
    });
  });

  // ─── getRecord — success path ──────────────────────────────────────────────

  describe('getRecord — success', () => {
    it('should return serialized record when found', async () => {
      prisma.staffAttendanceRecord.findFirst = jest.fn().mockResolvedValue({
        ...mockRecord,
        staff_profile: {
          id: STAFF_ID,
          staff_number: 'STF-001',
          user: { first_name: 'Ali', last_name: 'Khan' },
        },
      });

      const result = await service.getRecord(TENANT_ID, RECORD_ID);

      expect(result).toHaveProperty('id', RECORD_ID);
      expect(result).toHaveProperty('status', 'present');
    });
  });

  // ─── getDailyAttendance — with staff_profile_id filter ───────────────────────

  describe('getDailyAttendance — staff_profile_id filter', () => {
    it('should filter by staff_profile_id when provided', async () => {
      await service.getDailyAttendance(TENANT_ID, {
        date: '2026-03-01',
        staff_profile_id: STAFF_ID,
        page: 1,
        pageSize: 20,
      });

      expect(prisma.staffAttendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            staff_profile_id: STAFF_ID,
          }),
        }),
      );
    });
  });

  // ─── deleteRecord — not found ────────────────────────────────────────────────

  describe('deleteRecord — not found', () => {
    it('should throw NotFoundException when record does not exist', async () => {
      prisma.staffAttendanceRecord.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.deleteRecord(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── calculateDaysWorked — edge cases ─────────────────────────────────────────

  describe('calculateDaysWorked — edge cases', () => {
    it('edge: should handle empty records array', async () => {
      prisma.staffAttendanceRecord.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.calculateDaysWorked(TENANT_ID, {
        staff_profile_id: STAFF_ID,
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      });

      expect(result.days_worked).toBe(0);
      expect(result.breakdown.total_records).toBe(0);
    });

    it('edge: should count all status types correctly', async () => {
      const records = [
        { status: 'present' },
        { status: 'present' },
        { status: 'half_day' },
        { status: 'half_day' },
        { status: 'paid_leave' },
        { status: 'sick_leave' },
        { status: 'absent' },
        { status: 'absent' },
        { status: 'unpaid_leave' },
      ];
      prisma.staffAttendanceRecord.findMany = jest.fn().mockResolvedValue(records);

      const result = await service.calculateDaysWorked(TENANT_ID, {
        staff_profile_id: STAFF_ID,
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      });

      // present(2) + half_day(0.5*2) + paid_leave(1) + sick_leave(1) = 5
      expect(result.days_worked).toBe(5);
      expect(result.breakdown.present).toBe(2);
      expect(result.breakdown.half_day).toBe(2);
      expect(result.breakdown.paid_leave).toBe(1);
      expect(result.breakdown.sick_leave).toBe(1);
      expect(result.breakdown.absent).toBe(2);
      expect(result.breakdown.unpaid_leave).toBe(1);
      expect(result.breakdown.total_records).toBe(9);
    });
  });
});
