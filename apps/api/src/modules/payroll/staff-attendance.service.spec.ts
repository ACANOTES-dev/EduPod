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
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn({
      staffAttendanceRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockRecord),
        update: jest.fn().mockResolvedValue(mockRecord),
      },
    })),
    ...overrides,
  };
}

describe('StaffAttendanceService', () => {
  let service: StaffAttendanceService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffAttendanceService,
        { provide: PrismaService, useValue: prisma },
      ],
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

    await expect(
      service.getRecord(TENANT_ID, RECORD_ID),
    ).rejects.toThrow(NotFoundException);
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
});
