import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { FinancialReportsService } from './financial-reports.service';

const TENANT_ID = 'tenant-uuid-1111';

const mockRedisClient = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
};

const mockRedisService = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
};

const mockPrisma = {
  invoice: {
    findMany: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
  },
  invoiceLine: {
    findMany: jest.fn(),
  },
  feeStructure: {
    findMany: jest.fn(),
  },
};

describe('FinancialReportsService', () => {
  let service: FinancialReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialReportsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<FinancialReportsService>(FinancialReportsService);
    jest.clearAllMocks();
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.setex.mockResolvedValue('OK');
    mockRedisService.getClient.mockReturnValue(mockRedisClient);
  });

  describe('agingReport', () => {
    it('should compute aging buckets correctly', async () => {
      const now = new Date();
      const pastDate = new Date(now);
      pastDate.setDate(pastDate.getDate() - 45);

      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          balance_amount: '500.00',
          due_date: pastDate,
          household_id: 'hh-1',
          household: { household_name: 'Smith Family' },
        },
      ]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.overdue_31_60.count).toBe(1);
      expect(result.overdue_31_60.total).toBe(500);
      expect(result.grand_total).toBe(500);
    });

    it('should return cached result on subsequent calls', async () => {
      const cachedData = {
        current: { label: 'test', count: 0, total: 0, households: [] },
        grand_total: 0,
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.agingReport(TENANT_ID, {});

      expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled();
      expect(result.grand_total).toBe(0);
    });
  });

  describe('revenueByPeriod', () => {
    it('should group invoices by YYYY-MM period', async () => {
      const issueDate = new Date('2026-01-15');

      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          issue_date: issueDate,
          total_amount: '1000.00',
          balance_amount: '200.00',
        },
      ]);

      const result = await service.revenueByPeriod(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]?.period).toBe('2026-01');
      expect(result[0]?.invoiced).toBe(1000);
      expect(result[0]?.collected).toBe(800);
      expect(result[0]?.collection_rate).toBe(80);
    });
  });

  describe('paymentMethodBreakdown', () => {
    it('should compute payment method percentages', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        { payment_method: 'stripe', amount: '600.00' },
        { payment_method: 'cash', amount: '400.00' },
      ]);

      const result = await service.paymentMethodBreakdown(TENANT_ID, {});

      const stripe = result.find((r) => r.method === 'stripe');
      const cash = result.find((r) => r.method === 'cash');

      expect(stripe?.amount).toBe(600);
      expect(cash?.pct_of_total).toBe(40);
    });
  });

  describe('feeStructurePerformance', () => {
    it('should compute fee structure performance metrics', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([
        {
          id: 'fs-1',
          name: 'Tuition',
          household_fee_assignments: [{ id: 'a1' }, { id: 'a2' }],
          invoice_lines: [
            {
              line_total: '1000.00',
              invoice: { total_amount: '1000.00', balance_amount: '0.00' },
            },
          ],
        },
      ]);

      const result = await service.feeStructurePerformance(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]?.total_assigned).toBe(2);
      expect(result[0]?.total_billed).toBe(1000);
      expect(result[0]?.total_collected).toBe(1000);
      expect(result[0]?.default_rate).toBe(0);
    });

    it('should handle fee structure with partial collection', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([
        {
          id: 'fs-1',
          name: 'Tuition',
          household_fee_assignments: [{ id: 'a1' }],
          invoice_lines: [
            {
              line_total: '1000.00',
              invoice: { total_amount: '1000.00', balance_amount: '400.00' },
            },
          ],
        },
      ]);

      const result = await service.feeStructurePerformance(TENANT_ID, {});

      expect(result[0]?.total_collected).toBe(600);
      expect(result[0]?.default_rate).toBe(40);
    });

    it('should handle empty invoice lines', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([
        {
          id: 'fs-1',
          name: 'Tuition',
          household_fee_assignments: [],
          invoice_lines: [],
        },
      ]);

      const result = await service.feeStructurePerformance(TENANT_ID, {});

      expect(result[0]?.total_assigned).toBe(0);
      expect(result[0]?.total_billed).toBe(0);
      expect(result[0]?.total_collected).toBe(0);
      expect(result[0]?.default_rate).toBe(0);
    });
  });

  describe('collectionByYearGroup', () => {
    it('should handle invoices without year groups', async () => {
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.collectionByYearGroup(TENANT_ID, {});

      expect(result).toHaveLength(0);
    });

    it('should calculate pro-rata collection for mixed invoice totals', async () => {
      mockPrisma.invoiceLine.findMany.mockResolvedValue([
        {
          line_total: '500.00',
          student: {
            year_group: { id: 'yg-1', name: 'Year 1' },
          },
          invoice: { total_amount: '1000.00', balance_amount: '500.00' },
        },
        {
          line_total: '500.00',
          student: {
            year_group: { id: 'yg-1', name: 'Year 1' },
          },
          invoice: { total_amount: '1000.00', balance_amount: '500.00' },
        },
      ]);

      const result = await service.collectionByYearGroup(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]?.total_billed).toBe(1000);
      expect(result[0]?.total_collected).toBe(500);
      expect(result[0]?.pct_collected).toBe(50);
    });

    it('should group by year group correctly', async () => {
      mockPrisma.invoiceLine.findMany.mockResolvedValue([
        {
          line_total: '1000.00',
          student: {
            year_group: { id: 'yg-1', name: 'Year 1' },
          },
          invoice: { total_amount: '1000.00', balance_amount: '0.00' },
        },
        {
          line_total: '2000.00',
          student: {
            year_group: { id: 'yg-2', name: 'Year 2' },
          },
          invoice: { total_amount: '2000.00', balance_amount: '0.00' },
        },
      ]);

      const result = await service.collectionByYearGroup(TENANT_ID, {});

      expect(result).toHaveLength(2);
      const yg1 = result.find((r) => r.year_group_id === 'yg-1');
      const yg2 = result.find((r) => r.year_group_id === 'yg-2');
      expect(yg1?.total_billed).toBe(1000);
      expect(yg2?.total_billed).toBe(2000);
    });
  });

  describe('revenueByPeriod with date filters', () => {
    it('should filter by date range', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          issue_date: new Date('2026-01-15'),
          created_at: new Date('2026-01-10'),
          total_amount: '1000.00',
          balance_amount: '500.00',
        },
      ]);

      const result = await service.revenueByPeriod(TENANT_ID, {
        date_from: '2026-01-01',
        date_to: '2026-01-31',
      });

      expect(result).toHaveLength(1);
      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            issue_date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should use created_at when issue_date is null', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          issue_date: null,
          created_at: new Date('2026-01-15'),
          total_amount: '1000.00',
          balance_amount: '500.00',
        },
      ]);

      const result = await service.revenueByPeriod(TENANT_ID, {});

      expect(result[0]?.period).toBe('2026-01');
    });

    it('should handle zero collection rate', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          issue_date: new Date('2026-01-15'),
          total_amount: '1000.00',
          balance_amount: '1000.00',
        },
      ]);

      const result = await service.revenueByPeriod(TENANT_ID, {});

      expect(result[0]?.collected).toBe(0);
      expect(result[0]?.collection_rate).toBe(0);
    });
  });

  describe('paymentMethodBreakdown with date filters', () => {
    it('should filter by date range', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([{ payment_method: 'cash', amount: '100.00' }]);

      await service.paymentMethodBreakdown(TENANT_ID, {
        date_from: '2026-01-01',
        date_to: '2026-12-31',
      });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            received_at: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should calculate percentages correctly', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        { payment_method: 'stripe', amount: '750.00' },
        { payment_method: 'cash', amount: '250.00' },
      ]);

      const result = await service.paymentMethodBreakdown(TENANT_ID, {});

      const stripe = result.find((r) => r.method === 'stripe');
      const cash = result.find((r) => r.method === 'cash');
      expect(stripe?.pct_of_total).toBe(75);
      expect(cash?.pct_of_total).toBe(25);
    });
  });

  describe('cache handling', () => {
    it('should handle Redis cache errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis unavailable'));
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result).toBeDefined();
      expect(result.current).toBeDefined();
    });

    it('should handle Redis set errors gracefully', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockRejectedValue(new Error('Redis unavailable'));
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result).toBeDefined();
    });
  });
});
