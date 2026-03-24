import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AdmissionsAnalyticsService } from './admissions-analytics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('AdmissionsAnalyticsService', () => {
  let service: AdmissionsAnalyticsService;
  let mockPrisma: {
    application: { count: jest.Mock; findMany: jest.Mock; groupBy: jest.Mock };
    student: { count: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      application: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      student: { count: jest.fn().mockResolvedValue(0) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdmissionsAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
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
      mockPrisma.application.count
        .mockResolvedValueOnce(100) // applied
        .mockResolvedValueOnce(60) // under review
        .mockResolvedValueOnce(40); // accepted
      mockPrisma.student.count.mockResolvedValue(35); // enrolled

      const result = await service.pipelineFunnel(TENANT_ID);

      expect(result.applied_count).toBe(100);
      expect(result.accepted_count).toBe(40);
      expect(result.enrolled_count).toBe(35);
      // overall: enrolled / applied * 100 = 35%
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
      const reviewedAt = new Date('2026-01-11'); // 10 days later

      mockPrisma.application.findMany.mockResolvedValue([
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
      mockPrisma.application.findMany.mockResolvedValue([
        { submitted_at: new Date('2026-01-15'), status: 'accepted' },
        { submitted_at: new Date('2026-01-20'), status: 'rejected' },
        { submitted_at: new Date('2026-02-05'), status: 'under_review' },
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

  describe('RLS isolation', () => {
    it('should scope pipeline funnel queries to tenantId', async () => {
      await service.pipelineFunnel(TENANT_ID);

      expect(mockPrisma.application.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_ID }),
        }),
      );
    });
  });
});
