import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { UnifiedDashboardService } from './unified-dashboard.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('UnifiedDashboardService', () => {
  let service: UnifiedDashboardService;
  let mockPrisma: {
    student: { count: jest.Mock };
    staffProfile: { count: jest.Mock };
    attendanceRecord: { groupBy: jest.Mock };
    invoice: { count: jest.Mock; aggregate: jest.Mock };
    grade: { aggregate: jest.Mock };
    studentAcademicRiskAlert: { count: jest.Mock };
    application: { count: jest.Mock };
    schedule: { count: jest.Mock };
  };
  let mockRedisClient: { get: jest.Mock; setex: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    mockRedisClient = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    mockPrisma = {
      student: { count: jest.fn().mockResolvedValue(100) },
      staffProfile: { count: jest.fn().mockResolvedValue(20) },
      attendanceRecord: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'present', _count: 80 },
          { status: 'absent', _count: 20 },
        ]),
      },
      invoice: {
        count: jest.fn().mockResolvedValue(5),
        aggregate: jest.fn()
          .mockResolvedValueOnce({ _sum: { balance_amount: 2000 } }) // outstanding balance
          .mockResolvedValueOnce({ _sum: { total_amount: 10000, balance_amount: 2000 } }), // collection rate
      },
      grade: {
        aggregate: jest.fn().mockResolvedValue({ _avg: { raw_score: 75.5 } }),
      },
      studentAcademicRiskAlert: { count: jest.fn().mockResolvedValue(3) },
      application: { count: jest.fn().mockResolvedValue(12) },
      schedule: { count: jest.fn().mockResolvedValue(10) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedDashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
      ],
    }).compile();

    service = module.get<UnifiedDashboardService>(UnifiedDashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return total_students and active_staff_count from DB', async () => {
    const result = await service.getKpiDashboard(TENANT_ID);

    expect(result.total_students).toBe(100);
    expect(result.active_staff_count).toBe(20);
  });

  it('should compute attendance_rate as present / total * 100', async () => {
    const result = await service.getKpiDashboard(TENANT_ID);

    // 80 present out of 100 total = 80%
    expect(result.attendance_rate).toBe(80);
  });

  it('should compute fee_collection_rate from invoiced vs balance', async () => {
    const result = await service.getKpiDashboard(TENANT_ID);

    // collected = 10000 - 2000 = 8000; rate = 8000/10000 = 80%
    expect(result.fee_collection_rate).toBe(80);
  });

  it('should return overdue_invoices_count', async () => {
    const result = await service.getKpiDashboard(TENANT_ID);

    expect(result.overdue_invoices_count).toBe(5);
  });

  it('should return average_grade from grades aggregate', async () => {
    const result = await service.getKpiDashboard(TENANT_ID);

    expect(result.average_grade).toBe(75.5);
  });

  it('should return at_risk_students_count', async () => {
    const result = await service.getKpiDashboard(TENANT_ID);

    expect(result.at_risk_students_count).toBe(3);
  });

  it('should return null attendance_rate when no attendance records', async () => {
    mockPrisma.attendanceRecord.groupBy.mockResolvedValue([]);

    const result = await service.getKpiDashboard(TENANT_ID);

    expect(result.attendance_rate).toBeNull();
  });

  it('should return null fee_collection_rate when total_amount is zero', async () => {
    // Reset the mock fully to override the Once queue from beforeEach
    mockPrisma.invoice.aggregate.mockReset();
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { balance_amount: null, total_amount: null } });

    const result = await service.getKpiDashboard(TENANT_ID);

    expect(result.fee_collection_rate).toBeNull();
  });

  it('should return cached result when cache has data', async () => {
    const cachedData = { total_students: 999, generated_at: new Date().toISOString() };
    mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

    const result = await service.getKpiDashboard(TENANT_ID);

    // Should return cached value without hitting DB
    expect(result.total_students).toBe(999);
    expect(mockPrisma.student.count).not.toHaveBeenCalled();
  });

  it('should invalidate cache on invalidateCache call', async () => {
    await service.invalidateCache(TENANT_ID);

    expect(mockRedisClient.del).toHaveBeenCalledWith(`kpi_dashboard:${TENANT_ID}`);
  });
});
