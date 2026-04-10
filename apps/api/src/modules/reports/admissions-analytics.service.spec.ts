import { Test, TestingModule } from '@nestjs/testing';

import { AdmissionsAnalyticsService } from './admissions-analytics.service';
import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('AdmissionsAnalyticsService', () => {
  let service: AdmissionsAnalyticsService;
  let mockDataAccess: {
    countApplications: jest.Mock;
    findApplications: jest.Mock;
    countStudents: jest.Mock;
  };

  beforeEach(async () => {
    mockDataAccess = {
      countApplications: jest.fn().mockResolvedValue(0),
      findApplications: jest.fn().mockResolvedValue([]),
      countStudents: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdmissionsAnalyticsService,
        { provide: ReportsDataAccessService, useValue: mockDataAccess },
      ],
    }).compile();

    service = module.get<AdmissionsAnalyticsService>(AdmissionsAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('pipelineFunnel', () => {
    it('should return zero counts when no applications', async () => {
      const result = await service.pipelineFunnel(TENANT_ID);

      expect(result.applied_count).toBe(0);
      expect(result.under_review_count).toBe(0);
      expect(result.accepted_count).toBe(0);
      expect(result.enrolled_count).toBe(0);
      expect(result.overall_conversion_rate).toBe(0);
    });

    it('should compute conversion rates correctly', async () => {
      mockDataAccess.countApplications
        .mockResolvedValueOnce(100) // applied
        .mockResolvedValueOnce(60) // under review
        .mockResolvedValueOnce(40); // accepted
      mockDataAccess.countStudents.mockResolvedValue(35); // enrolled

      const result = await service.pipelineFunnel(TENANT_ID);

      expect(result.applied_count).toBe(100);
      expect(result.accepted_count).toBe(40);
      expect(result.enrolled_count).toBe(35);
      expect(result.overall_conversion_rate).toBe(35);
    });
  });

  describe('processingTime', () => {
    it('should return null averages when no decided applications', async () => {
      const result = await service.processingTime(TENANT_ID);

      expect(result.average_days_to_decision).toBeNull();
      expect(result.sample_size).toBe(0);
    });

    it('should compute average days from submitted_at to reviewed_at', async () => {
      const submittedAt = new Date('2026-01-01');
      const reviewedAt = new Date('2026-01-11');

      mockDataAccess.findApplications.mockResolvedValue([
        { submitted_at: submittedAt, reviewed_at: reviewedAt },
      ]);

      const result = await service.processingTime(TENANT_ID);

      expect(result.sample_size).toBe(1);
      expect(result.average_days_to_decision).toBe(10);
      expect(result.min_days).toBe(10);
      expect(result.max_days).toBe(10);
    });
  });

  describe('monthlyApplications', () => {
    it('should return empty array when no applications', async () => {
      const result = await service.monthlyApplications(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should group applications by month', async () => {
      mockDataAccess.findApplications.mockResolvedValue([
        { submitted_at: new Date('2026-01-15'), status: 'approved' },
        { submitted_at: new Date('2026-01-20'), status: 'rejected' },
        { submitted_at: new Date('2026-02-05'), status: 'ready_to_admit' },
      ]);

      const result = await service.monthlyApplications(TENANT_ID);

      expect(result).toHaveLength(2);
      const jan = result.find((r) => r.month === '2026-01');
      expect(jan?.count).toBe(2);
      expect(jan?.accepted_count).toBe(1);
      expect(jan?.rejected_count).toBe(1);
    });
  });

  describe('yearGroupDemand', () => {
    it('should return empty array when no applications', async () => {
      const result = await service.yearGroupDemand(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('pipelineFunnel — edge cases', () => {
    it('should apply date filters when startDate and endDate are provided', async () => {
      mockDataAccess.countApplications.mockResolvedValue(0);
      mockDataAccess.countStudents.mockResolvedValue(0);

      await service.pipelineFunnel(TENANT_ID, '2026-01-01', '2026-06-30');

      const callArg = mockDataAccess.countApplications.mock.calls[0]?.[1];
      expect(callArg?.submitted_at).toBeDefined();
    });

    it('should return 0 rates when denominators are zero', async () => {
      mockDataAccess.countApplications.mockResolvedValue(0);
      mockDataAccess.countStudents.mockResolvedValue(0);

      const result = await service.pipelineFunnel(TENANT_ID);

      expect(result.applied_to_review_rate).toBe(0);
      expect(result.review_to_accepted_rate).toBe(0);
      expect(result.accepted_to_enrolled_rate).toBe(0);
      expect(result.overall_conversion_rate).toBe(0);
    });
  });

  describe('processingTime — edge cases', () => {
    it('should apply date filters when provided', async () => {
      mockDataAccess.findApplications.mockResolvedValue([]);

      await service.processingTime(TENANT_ID, '2026-01-01', '2026-06-30');

      expect(mockDataAccess.findApplications).toHaveBeenCalledWith(TENANT_ID, expect.any(Object));
    });

    it('edge: should handle applications where dates are null after filter', async () => {
      mockDataAccess.findApplications.mockResolvedValue([
        { submitted_at: null, reviewed_at: null },
      ]);

      const result = await service.processingTime(TENANT_ID);

      expect(result.average_days_to_decision).toBeNull();
      expect(result.sample_size).toBe(0);
    });

    it('should compute min and max days correctly with multiple applications', async () => {
      mockDataAccess.findApplications.mockResolvedValue([
        { submitted_at: new Date('2026-01-01'), reviewed_at: new Date('2026-01-06') }, // 5 days
        { submitted_at: new Date('2026-01-01'), reviewed_at: new Date('2026-01-21') }, // 20 days
      ]);

      const result = await service.processingTime(TENANT_ID);

      expect(result.min_days).toBe(5);
      expect(result.max_days).toBe(20);
      expect(result.average_days_to_decision).toBe(12.5);
      expect(result.sample_size).toBe(2);
    });
  });

  describe('rejectionReasons', () => {
    it('should return empty array when no rejections', async () => {
      const result = await service.rejectionReasons(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should group rejection reasons with counts and percentages', async () => {
      mockDataAccess.findApplications.mockResolvedValue([
        { rejection_reason: 'Age not met' },
        { rejection_reason: 'Age not met' },
        { rejection_reason: 'Capacity full' },
        { rejection_reason: null },
      ]);

      const result = await service.rejectionReasons(TENANT_ID);

      expect(result).toHaveLength(3);
      expect(result[0]?.reason).toBe('Age not met');
      expect(result[0]?.count).toBe(2);
      expect(result[0]?.percentage).toBe(50);
    });

    it('should apply date filters', async () => {
      mockDataAccess.findApplications.mockResolvedValue([]);

      await service.rejectionReasons(TENANT_ID, '2026-01-01', '2026-06-30');

      const callArg = mockDataAccess.findApplications.mock.calls[0]?.[1];
      expect(callArg?.where?.decided_at).toBeDefined();
    });

    it('should label null reason as "No reason provided"', async () => {
      mockDataAccess.findApplications.mockResolvedValue([{ rejection_reason: null }]);

      const result = await service.rejectionReasons(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.reason).toBe('No reason provided');
    });
  });

  describe('monthlyApplications — edge cases', () => {
    it('should skip applications with null submitted_at', async () => {
      mockDataAccess.findApplications.mockResolvedValue([
        { submitted_at: null, status: 'approved' },
        { submitted_at: new Date('2026-02-05'), status: 'ready_to_admit' },
      ]);

      const result = await service.monthlyApplications(TENANT_ID);

      expect(result).toHaveLength(1);
    });

    it('should apply date filters', async () => {
      mockDataAccess.findApplications.mockResolvedValue([]);

      await service.monthlyApplications(TENANT_ID, '2026-01-01', '2026-06-30');

      const callArg = mockDataAccess.findApplications.mock.calls[0]?.[1];
      expect(callArg?.where?.submitted_at).toBeDefined();
    });
  });

  describe('yearGroupDemand', () => {
    it('should group applications by year_group from payload_json', async () => {
      mockDataAccess.findApplications.mockResolvedValue([
        { payload_json: { year_group: 'Grade 5' }, status: 'approved' },
        { payload_json: { year_group: 'Grade 5' }, status: 'ready_to_admit' },
        { payload_json: { year_group: 'Grade 6' }, status: 'approved' },
      ]);

      const result = await service.yearGroupDemand(TENANT_ID);

      expect(result).toHaveLength(2);
      const grade5 = result.find((r) => r.year_group_name === 'Grade 5');
      expect(grade5?.application_count).toBe(2);
      expect(grade5?.accepted_count).toBe(1);
      expect(grade5?.conversion_rate).toBe(50);
    });

    it('should use "Not specified" when payload has no year_group', async () => {
      mockDataAccess.findApplications.mockResolvedValue([
        { payload_json: {}, status: 'under_review' },
      ]);

      const result = await service.yearGroupDemand(TENANT_ID);

      expect(result[0]?.year_group_name).toBe('Not specified');
    });

    it('should apply date filters', async () => {
      mockDataAccess.findApplications.mockResolvedValue([]);

      await service.yearGroupDemand(TENANT_ID, '2026-01-01', '2026-06-30');

      const callArg = mockDataAccess.findApplications.mock.calls[0]?.[1];
      expect(callArg?.where?.submitted_at).toBeDefined();
    });
  });

  describe('RLS isolation', () => {
    it('should pass tenantId to countApplications', async () => {
      await service.pipelineFunnel(TENANT_ID);

      expect(mockDataAccess.countApplications).toHaveBeenCalledWith(TENANT_ID, expect.any(Object));
    });
  });
});
