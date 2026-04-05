import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { FinancialReportsService } from './financial-reports.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

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

  afterEach(() => jest.clearAllMocks());

  // ─── agingReport ─────────────────────────────────────────────────────────

  describe('FinancialReportsService — agingReport', () => {
    it('should return cached result when cache hit', async () => {
      const cachedData = {
        current: { label: 'Current (not yet due)', count: 0, total: 0, households: [] },
        overdue_1_30: { label: '1-30 days overdue', count: 0, total: 0, households: [] },
        overdue_31_60: { label: '31-60 days overdue', count: 0, total: 0, households: [] },
        overdue_61_90: { label: '61-90 days overdue', count: 0, total: 0, households: [] },
        overdue_90_plus: { label: '90+ days overdue', count: 0, total: 0, households: [] },
        grand_total: 0,
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.agingReport(TENANT_ID, {});

      expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled();
      expect(result.grand_total).toBe(0);
    });

    it('should skip invoices with balance <= 0', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          balance_amount: '0.00',
          due_date: new Date(),
          household_id: 'hh-1',
          household: { household_name: 'Zero Family' },
        },
        {
          balance_amount: '-5.00',
          due_date: new Date(),
          household_id: 'hh-2',
          household: { household_name: 'Negative Family' },
        },
      ]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.grand_total).toBe(0);
      expect(result.current.count).toBe(0);
    });

    it('should place invoices in the current bucket when not yet due', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          balance_amount: '300.00',
          due_date: futureDate,
          household_id: 'hh-1',
          household: { household_name: 'Future Family' },
        },
      ]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.current.count).toBe(1);
      expect(result.current.total).toBe(300);
      expect(result.grand_total).toBe(300);
    });

    it('should place invoices in the 1-30 day overdue bucket', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 15);

      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          balance_amount: '200.00',
          due_date: pastDate,
          household_id: 'hh-1',
          household: { household_name: 'Overdue15 Family' },
        },
      ]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.overdue_1_30.count).toBe(1);
      expect(result.overdue_1_30.total).toBe(200);
    });

    it('should place invoices in the 31-60 day overdue bucket', async () => {
      const pastDate = new Date();
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

    it('should place invoices in the 61-90 day overdue bucket', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 75);

      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          balance_amount: '750.00',
          due_date: pastDate,
          household_id: 'hh-1',
          household: { household_name: 'Late Family' },
        },
      ]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.overdue_61_90.count).toBe(1);
      expect(result.overdue_61_90.total).toBe(750);
    });

    it('should place invoices in the 90+ day overdue bucket', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 120);

      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          balance_amount: '1000.00',
          due_date: pastDate,
          household_id: 'hh-1',
          household: { household_name: 'Very Late Family' },
        },
      ]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.overdue_90_plus.count).toBe(1);
      expect(result.overdue_90_plus.total).toBe(1000);
    });

    it('should return empty buckets when no invoices exist', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.grand_total).toBe(0);
      expect(result.current.count).toBe(0);
      expect(result.overdue_90_plus.count).toBe(0);
    });

    it('should distribute multiple invoices across different buckets', async () => {
      const now = new Date();
      const future = new Date(now);
      future.setDate(future.getDate() + 5);
      const past10 = new Date(now);
      past10.setDate(past10.getDate() - 10);
      const past100 = new Date(now);
      past100.setDate(past100.getDate() - 100);

      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          balance_amount: '100.00',
          due_date: future,
          household_id: 'hh-1',
          household: { household_name: 'A Family' },
        },
        {
          balance_amount: '200.00',
          due_date: past10,
          household_id: 'hh-2',
          household: { household_name: 'B Family' },
        },
        {
          balance_amount: '300.00',
          due_date: past100,
          household_id: 'hh-3',
          household: { household_name: 'C Family' },
        },
      ]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.current.count).toBe(1);
      expect(result.overdue_1_30.count).toBe(1);
      expect(result.overdue_90_plus.count).toBe(1);
      expect(result.grand_total).toBe(600);
    });
  });

  // ─── revenueByPeriod ─────────────────────────────────────────────────────

  describe('FinancialReportsService — revenueByPeriod', () => {
    it('should return cached result when cache hit', async () => {
      const cachedData = [
        { period: '2026-01', invoiced: 100, collected: 50, outstanding: 50, collection_rate: 50 },
      ];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.revenueByPeriod(TENANT_ID, {});

      expect(mockPrisma.invoice.findMany).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should group invoices by YYYY-MM period', async () => {
      const issueDate = new Date('2026-01-15');

      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          issue_date: issueDate,
          created_at: issueDate,
          total_amount: '1000.00',
          balance_amount: '200.00',
        },
      ]);

      const result = await service.revenueByPeriod(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.period).toBe('2026-01');
      expect(result[0]!.invoiced).toBe(1000);
      expect(result[0]!.collected).toBe(800);
      expect(result[0]!.outstanding).toBe(200);
      expect(result[0]!.collection_rate).toBe(80);
    });

    it('should fall back to created_at when issue_date is null', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          issue_date: null,
          created_at: new Date('2026-03-20'),
          total_amount: '500.00',
          balance_amount: '500.00',
        },
      ]);

      const result = await service.revenueByPeriod(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.period).toBe('2026-03');
      expect(result[0]!.collected).toBe(0);
    });

    it('should apply date_from filter only', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      await service.revenueByPeriod(TENANT_ID, { date_from: '2026-01-01' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            issue_date: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should apply date_to filter only', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      await service.revenueByPeriod(TENANT_ID, { date_to: '2026-12-31' });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            issue_date: expect.objectContaining({
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should apply both date_from and date_to filters', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      await service.revenueByPeriod(TENANT_ID, { date_from: '2026-01-01', date_to: '2026-12-31' });

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

    it('should return collection_rate of 0 when invoiced is 0', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          issue_date: new Date('2026-02-01'),
          created_at: new Date('2026-02-01'),
          total_amount: '0.00',
          balance_amount: '0.00',
        },
      ]);

      const result = await service.revenueByPeriod(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.collection_rate).toBe(0);
    });

    it('should aggregate multiple invoices in the same period', async () => {
      const date = new Date('2026-05-10');
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          issue_date: date,
          created_at: date,
          total_amount: '400.00',
          balance_amount: '100.00',
        },
        {
          issue_date: date,
          created_at: date,
          total_amount: '600.00',
          balance_amount: '200.00',
        },
      ]);

      const result = await service.revenueByPeriod(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.invoiced).toBe(1000);
      expect(result[0]!.collected).toBe(700);
    });

    it('should return empty array when no invoices exist', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.revenueByPeriod(TENANT_ID, {});

      expect(result).toEqual([]);
    });

    it('should sort periods chronologically', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          issue_date: new Date('2026-06-01'),
          created_at: new Date('2026-06-01'),
          total_amount: '100.00',
          balance_amount: '0.00',
        },
        {
          issue_date: new Date('2026-01-01'),
          created_at: new Date('2026-01-01'),
          total_amount: '200.00',
          balance_amount: '0.00',
        },
      ]);

      const result = await service.revenueByPeriod(TENANT_ID, {});

      expect(result).toHaveLength(2);
      expect(result[0]!.period).toBe('2026-01');
      expect(result[1]!.period).toBe('2026-06');
    });
  });

  // ─── collectionByYearGroup ────────────────────────────────────────────────

  describe('FinancialReportsService — collectionByYearGroup', () => {
    it('should return cached result when cache hit', async () => {
      const cachedData = [
        {
          year_group_id: 'yg-1',
          year_group_name: 'Year 1',
          total_billed: 100,
          total_collected: 50,
          pct_collected: 50,
        },
      ];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.collectionByYearGroup(TENANT_ID, {});

      expect(mockPrisma.invoiceLine.findMany).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should group lines by year group', async () => {
      mockPrisma.invoiceLine.findMany.mockResolvedValue([
        {
          line_total: '500.00',
          student: { year_group: { id: 'yg-1', name: 'Year 1' } },
          invoice: { total_amount: '500.00', balance_amount: '100.00' },
        },
      ]);

      const result = await service.collectionByYearGroup(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.year_group_id).toBe('yg-1');
      expect(result[0]!.year_group_name).toBe('Year 1');
      expect(result[0]!.total_billed).toBe(500);
      expect(result[0]!.total_collected).toBe(400);
    });

    it('should handle null year_group (student without year group)', async () => {
      mockPrisma.invoiceLine.findMany.mockResolvedValue([
        {
          line_total: '300.00',
          student: { year_group: null },
          invoice: { total_amount: '300.00', balance_amount: '0.00' },
        },
      ]);

      const result = await service.collectionByYearGroup(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.year_group_id).toBeNull();
      expect(result[0]!.year_group_name).toBeNull();
    });

    it('should handle null student on invoice line', async () => {
      mockPrisma.invoiceLine.findMany.mockResolvedValue([
        {
          line_total: '200.00',
          student: null,
          invoice: { total_amount: '200.00', balance_amount: '50.00' },
        },
      ]);

      const result = await service.collectionByYearGroup(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.year_group_id).toBeNull();
    });

    it('should return lineFraction of 0 when invoice total is 0', async () => {
      mockPrisma.invoiceLine.findMany.mockResolvedValue([
        {
          line_total: '0.00',
          student: { year_group: { id: 'yg-1', name: 'Year 1' } },
          invoice: { total_amount: '0.00', balance_amount: '0.00' },
        },
      ]);

      const result = await service.collectionByYearGroup(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.total_collected).toBe(0);
    });

    it('should return pct_collected of 0 when total_billed is 0', async () => {
      mockPrisma.invoiceLine.findMany.mockResolvedValue([
        {
          line_total: '0.00',
          student: { year_group: { id: 'yg-2', name: 'Year 2' } },
          invoice: { total_amount: '1000.00', balance_amount: '1000.00' },
        },
      ]);

      const result = await service.collectionByYearGroup(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.pct_collected).toBe(0);
    });

    it('should return empty array when no invoice lines exist', async () => {
      mockPrisma.invoiceLine.findMany.mockResolvedValue([]);

      const result = await service.collectionByYearGroup(TENANT_ID, {});

      expect(result).toEqual([]);
    });

    it('should aggregate multiple lines into the same year group', async () => {
      mockPrisma.invoiceLine.findMany.mockResolvedValue([
        {
          line_total: '200.00',
          student: { year_group: { id: 'yg-1', name: 'Year 1' } },
          invoice: { total_amount: '500.00', balance_amount: '100.00' },
        },
        {
          line_total: '300.00',
          student: { year_group: { id: 'yg-1', name: 'Year 1' } },
          invoice: { total_amount: '500.00', balance_amount: '100.00' },
        },
      ]);

      const result = await service.collectionByYearGroup(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.total_billed).toBe(500);
    });
  });

  // ─── paymentMethodBreakdown ──────────────────────────────────────────────

  describe('FinancialReportsService — paymentMethodBreakdown', () => {
    it('should return cached result when cache hit', async () => {
      const cachedData = [{ method: 'cash', amount: 100, count: 1, pct_of_total: 100 }];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.paymentMethodBreakdown(TENANT_ID, {});

      expect(mockPrisma.payment.findMany).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should compute payment method percentages', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        { payment_method: 'stripe', amount: '600.00' },
        { payment_method: 'cash', amount: '400.00' },
      ]);

      const result = await service.paymentMethodBreakdown(TENANT_ID, {});

      const stripe = result.find((r) => r.method === 'stripe');
      const cash = result.find((r) => r.method === 'cash');

      expect(stripe!.amount).toBe(600);
      expect(stripe!.pct_of_total).toBe(60);
      expect(cash!.pct_of_total).toBe(40);
    });

    it('should apply date_from filter for payments', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await service.paymentMethodBreakdown(TENANT_ID, { date_from: '2026-01-01' });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            received_at: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should apply date_to filter for payments', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await service.paymentMethodBreakdown(TENANT_ID, { date_to: '2026-12-31' });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            received_at: expect.objectContaining({
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should apply both date filters for payments', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

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

    it('should return pct_of_total of 0 when grandTotal is 0', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([{ payment_method: 'stripe', amount: '0.00' }]);

      const result = await service.paymentMethodBreakdown(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.pct_of_total).toBe(0);
    });

    it('should return empty array when no payments exist', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await service.paymentMethodBreakdown(TENANT_ID, {});

      expect(result).toEqual([]);
    });

    it('should aggregate multiple payments of the same method', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        { payment_method: 'cash', amount: '100.00' },
        { payment_method: 'cash', amount: '200.00' },
      ]);

      const result = await service.paymentMethodBreakdown(TENANT_ID, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.amount).toBe(300);
      expect(result[0]!.count).toBe(2);
    });
  });

  // ─── feeStructurePerformance ─────────────────────────────────────────────

  describe('FinancialReportsService — feeStructurePerformance', () => {
    it('should return cached result when cache hit', async () => {
      const cachedData = [
        {
          fee_structure_id: 'fs-1',
          name: 'Tuition',
          total_assigned: 1,
          total_billed: 100,
          total_collected: 100,
          default_rate: 0,
        },
      ];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.feeStructurePerformance(TENANT_ID, {});

      expect(mockPrisma.feeStructure.findMany).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

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
      expect(result[0]!.total_assigned).toBe(2);
      expect(result[0]!.total_billed).toBe(1000);
      expect(result[0]!.total_collected).toBe(1000);
      expect(result[0]!.default_rate).toBe(0);
    });

    it('should return fraction of 0 when invoiceTotal is 0', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([
        {
          id: 'fs-1',
          name: 'Free Tuition',
          household_fee_assignments: [],
          invoice_lines: [
            {
              line_total: '0.00',
              invoice: { total_amount: '0.00', balance_amount: '0.00' },
            },
          ],
        },
      ]);

      const result = await service.feeStructurePerformance(TENANT_ID, {});

      expect(result[0]!.total_collected).toBe(0);
      expect(result[0]!.default_rate).toBe(0);
    });

    it('should return default_rate of 0 when totalBilled is 0', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([
        {
          id: 'fs-2',
          name: 'Empty',
          household_fee_assignments: [],
          invoice_lines: [],
        },
      ]);

      const result = await service.feeStructurePerformance(TENANT_ID, {});

      expect(result[0]!.total_billed).toBe(0);
      expect(result[0]!.default_rate).toBe(0);
    });

    it('should compute default_rate when there is partial collection', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([
        {
          id: 'fs-3',
          name: 'Partially Collected',
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

      expect(result[0]!.total_billed).toBe(1000);
      expect(result[0]!.total_collected).toBe(600);
      expect(result[0]!.default_rate).toBe(40);
    });

    it('should return empty array when no fee structures exist', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([]);

      const result = await service.feeStructurePerformance(TENANT_ID, {});

      expect(result).toEqual([]);
    });

    it('should compute performance across multiple invoice lines', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([
        {
          id: 'fs-4',
          name: 'Multi-line',
          household_fee_assignments: [],
          invoice_lines: [
            {
              line_total: '400.00',
              invoice: { total_amount: '1000.00', balance_amount: '0.00' },
            },
            {
              line_total: '600.00',
              invoice: { total_amount: '1000.00', balance_amount: '0.00' },
            },
          ],
        },
      ]);

      const result = await service.feeStructurePerformance(TENANT_ID, {});

      expect(result[0]!.total_billed).toBe(1000);
      expect(result[0]!.total_collected).toBe(1000);
    });
  });

  // ─── tryGetCache / trySetCache error handling ─────────────────────────────

  describe('FinancialReportsService — cache error handling', () => {
    it('should handle Redis get error gracefully and proceed with DB query', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.grand_total).toBe(0);
    });

    it('should handle Redis set error gracefully and still return data', async () => {
      mockRedisClient.setex.mockRejectedValue(new Error('Redis write failed'));
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.grand_total).toBe(0);
    });

    it('should handle Redis getClient throwing error during get', async () => {
      mockRedisService.getClient.mockImplementationOnce(() => {
        throw new Error('Client unavailable');
      });
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.grand_total).toBe(0);
    });

    it('should handle Redis getClient throwing error during set', async () => {
      // get succeeds (returns null), but set throws
      mockRedisService.getClient
        .mockReturnValueOnce(mockRedisClient) // for tryGetCache
        .mockImplementationOnce(() => {
          throw new Error('Client unavailable for set');
        });
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.agingReport(TENANT_ID, {});

      expect(result.grand_total).toBe(0);
    });

    it('edge: should handle Redis returning non-JSON string', async () => {
      mockRedisClient.get.mockResolvedValue('not-valid-json');
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      // JSON.parse will throw, which is caught by tryGetCache
      const result = await service.agingReport(TENANT_ID, {});

      expect(result.grand_total).toBe(0);
    });
  });
});
