import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  SchedulesReadFacade,
  SchoolClosuresReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { ClassDeliveryService } from './class-delivery.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';
const RECORD_ID = '44444444-4444-4444-4444-444444444444';
const SCHEDULE_ID = '55555555-5555-5555-5555-555555555555';

const mockDeliveryRecord = {
  id: RECORD_ID,
  tenant_id: TENANT_ID,
  staff_profile_id: STAFF_ID,
  schedule_id: SCHEDULE_ID,
  delivery_date: new Date('2026-03-03'),
  status: 'delivered',
  substitute_staff_id: null,
  notes: null,
  confirmed_by_user_id: USER_ID,
  created_at: new Date(),
  updated_at: new Date(),
  staff_profile: {
    id: STAFF_ID,
    staff_number: 'S001',
    user: { first_name: 'Alice', last_name: 'Smith' },
  },
};

function buildPrisma() {
  return {
    classDeliveryRecord: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(mockDeliveryRecord),
      findMany: jest.fn().mockResolvedValue([mockDeliveryRecord]),
      create: jest.fn().mockResolvedValue(mockDeliveryRecord),
      update: jest.fn().mockResolvedValue(mockDeliveryRecord),
      count: jest.fn().mockResolvedValue(1),
    },
    schedule: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: SCHEDULE_ID, teacher_staff_id: STAFF_ID, day_of_week: 1 }]),
    },
    schoolClosure: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $extends: jest.fn().mockReturnThis(),
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        classDeliveryRecord: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(mockDeliveryRecord),
        },
      }),
    ),
  };
}

describe('ClassDeliveryService', () => {
  let service: ClassDeliveryService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ClassDeliveryService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: SchedulesReadFacade,
          useValue: {
            findEffectiveInRange: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: SchoolClosuresReadFacade,
          useValue: {
            getClosureDateSet: jest.fn().mockResolvedValue(new Set<string>()),
          },
        },
      ],
    }).compile();

    service = module.get<ClassDeliveryService>(ClassDeliveryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return message when no schedules found', async () => {
    prisma.schedule.findMany = jest.fn().mockResolvedValue([]);
    const result = await service.autoPopulateFromSchedule(TENANT_ID, USER_ID, {
      month: 3,
      year: 2026,
    });
    expect(result).toMatchObject({ created: 0, skipped: 0 });
    expect(result.message).toBeDefined();
  });

  it('should confirm delivery record', async () => {
    const result = await service.confirmDelivery(TENANT_ID, RECORD_ID, USER_ID, {
      status: 'delivered',
    });
    expect(result).toMatchObject({ id: RECORD_ID });
  });

  it('should throw NotFoundException when confirming non-existent record', async () => {
    prisma.classDeliveryRecord.findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      service.confirmDelivery(TENANT_ID, RECORD_ID, USER_ID, { status: 'delivered' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should return delivery records with pagination', async () => {
    const result = await service.getDeliveryRecords(TENANT_ID, {
      month: 3,
      year: 2026,
      page: 1,
      pageSize: 20,
    });
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('should calculate classes taught correctly', async () => {
    prisma.classDeliveryRecord.findMany = jest
      .fn()
      .mockResolvedValue([
        { status: 'delivered' },
        { status: 'delivered' },
        { status: 'absent_covered' },
        { status: 'absent_uncovered' },
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
    expect(result.breakdown.cancelled).toBe(1);
    expect(result.breakdown.total_scheduled).toBe(5);
  });

  it('should filter records by date range when provided', async () => {
    await service.getDeliveryRecords(TENANT_ID, {
      date_from: '2026-03-01',
      date_to: '2026-03-31',
      page: 1,
      pageSize: 20,
    });
    expect(prisma.classDeliveryRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          delivery_date: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });

  // ─── Additional branch coverage ──────────────────────────────────────────

  it('should filter by staff_profile_id when provided', async () => {
    await service.getDeliveryRecords(TENANT_ID, {
      staff_profile_id: STAFF_ID,
      page: 1,
      pageSize: 20,
    });
    expect(prisma.classDeliveryRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          staff_profile_id: STAFF_ID,
        }),
      }),
    );
  });

  it('should filter by date_from only when date_to is not provided', async () => {
    await service.getDeliveryRecords(TENANT_ID, {
      date_from: '2026-03-01',
      page: 1,
      pageSize: 20,
    });
    expect(prisma.classDeliveryRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          delivery_date: { gte: new Date('2026-03-01') },
        }),
      }),
    );
  });

  it('should filter by date_to only when date_from is not provided', async () => {
    await service.getDeliveryRecords(TENANT_ID, {
      date_to: '2026-03-31',
      page: 1,
      pageSize: 20,
    });
    expect(prisma.classDeliveryRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          delivery_date: { lte: new Date('2026-03-31') },
        }),
      }),
    );
  });

  it('should skip pagination correctly on page 2', async () => {
    await service.getDeliveryRecords(TENANT_ID, {
      page: 2,
      pageSize: 10,
    });
    expect(prisma.classDeliveryRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
  });

  it('should pass substitute_staff_id and notes in confirmDelivery dto', async () => {
    await service.confirmDelivery(TENANT_ID, RECORD_ID, USER_ID, {
      status: 'absent_covered',
      substitute_staff_id: STAFF_ID,
      notes: 'Covered by colleague',
    });
    expect(prisma.classDeliveryRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'absent_covered',
          substitute_staff_id: STAFF_ID,
          notes: 'Covered by colleague',
        }),
      }),
    );
  });

  it('should set substitute_staff_id to null when not provided', async () => {
    await service.confirmDelivery(TENANT_ID, RECORD_ID, USER_ID, {
      status: 'delivered',
    });
    expect(prisma.classDeliveryRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          substitute_staff_id: null,
          notes: null,
        }),
      }),
    );
  });

  it('should return zero counts when no records match in calculateClassesTaught', async () => {
    prisma.classDeliveryRecord.findMany = jest.fn().mockResolvedValue([]);

    const result = await service.calculateClassesTaught(TENANT_ID, {
      staff_profile_id: STAFF_ID,
      date_from: '2026-03-01',
      date_to: '2026-03-31',
    });

    expect(result.classes_taught).toBe(0);
    expect(result.breakdown.total_scheduled).toBe(0);
    expect(result.breakdown.delivered).toBe(0);
    expect(result.breakdown.absent_covered).toBe(0);
    expect(result.breakdown.absent_uncovered).toBe(0);
    expect(result.breakdown.cancelled).toBe(0);
  });

  it('should use month/year when no date_from/date_to is provided', async () => {
    await service.getDeliveryRecords(TENANT_ID, {
      month: 2,
      year: 2026,
      page: 1,
      pageSize: 20,
    });
    expect(prisma.classDeliveryRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          delivery_date: expect.objectContaining({
            gte: new Date(2026, 1, 1),
            lte: new Date(2026, 2, 0),
          }),
        }),
      }),
    );
  });
});
