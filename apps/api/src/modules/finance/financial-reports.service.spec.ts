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
      const cachedData = { current: { label: 'test', count: 0, total: 0, households: [] }, grand_total: 0 };
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
  });
});
