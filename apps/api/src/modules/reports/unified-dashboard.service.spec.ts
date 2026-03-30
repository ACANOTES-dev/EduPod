import { Test, TestingModule } from '@nestjs/testing';

import { RedisService } from '../redis/redis.service';

import { ReportsDataAccessService } from './reports-data-access.service';
import { UnifiedDashboardService } from './unified-dashboard.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('UnifiedDashboardService', () => {
  let service: UnifiedDashboardService;
  let mockDataAccess: {
    countStudents: jest.Mock;
    countStaff: jest.Mock;
    groupAttendanceRecordsBy: jest.Mock;
    countInvoices: jest.Mock;
    aggregateInvoices: jest.Mock;
    aggregateGrades: jest.Mock;
    countStudentAcademicRiskAlerts: jest.Mock;
    countApplications: jest.Mock;
    countSchedules: jest.Mock;
  };
  let mockRedisClient: { get: jest.Mock; setex: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    mockRedisClient = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    mockDataAccess = {
      countStudents: jest.fn().mockResolvedValue(100),
      countStaff: jest.fn().mockResolvedValue(20),
      groupAttendanceRecordsBy: jest.fn().mockResolvedValue([
        { status: 'present', _count: 80 },
        { status: 'absent', _count: 20 },
      ]),
      countInvoices: jest.fn().mockResolvedValue(5),
      aggregateInvoices: jest
        .fn()
        .mockResolvedValueOnce({ _sum: { balance_amount: 2000 } }) // outstanding balance
        .mockResolvedValueOnce({ _sum: { total_amount: 10000, balance_amount: 2000 } }), // collection rate
      aggregateGrades: jest.fn().mockResolvedValue({ _avg: { raw_score: 75.5 } }),
      countStudentAcademicRiskAlerts: jest.fn().mockResolvedValue(3),
      countApplications: jest.fn().mockResolvedValue(12),
      countSchedules: jest.fn().mockResolvedValue(10),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedDashboardService,
        { provide: ReportsDataAccessService, useValue: mockDataAccess },
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
    mockDataAccess.groupAttendanceRecordsBy.mockResolvedValue([]);

    const result = await service.getKpiDashboard(TENANT_ID);

    expect(result.attendance_rate).toBeNull();
  });

  it('should return null fee_collection_rate when total_amount is zero', async () => {
    mockDataAccess.aggregateInvoices.mockReset();
    mockDataAccess.aggregateInvoices.mockResolvedValue({
      _sum: { balance_amount: null, total_amount: null },
    });

    const result = await service.getKpiDashboard(TENANT_ID);

    expect(result.fee_collection_rate).toBeNull();
  });

  it('should return cached result when cache has data', async () => {
    const cachedData = { total_students: 999, generated_at: new Date().toISOString() };
    mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

    const result = await service.getKpiDashboard(TENANT_ID);

    expect(result.total_students).toBe(999);
    expect(mockDataAccess.countStudents).not.toHaveBeenCalled();
  });

  it('should invalidate cache on invalidateCache call', async () => {
    await service.invalidateCache(TENANT_ID);

    expect(mockRedisClient.del).toHaveBeenCalledWith(`kpi_dashboard:${TENANT_ID}`);
  });
});
