import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { FinanceDashboardService } from './finance-dashboard.service';

const TENANT_ID = 'tenant-uuid-1111';

const mockPrisma = {
  invoice: {
    findMany: jest.fn(),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  payment: {
    findMany: jest.fn(),
  },
  paymentPlanRequest: {
    count: jest.fn().mockResolvedValue(0),
  },
  refund: {
    count: jest.fn(),
  },
};

describe('FinanceDashboardService', () => {
  let service: FinanceDashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FinanceDashboardService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<FinanceDashboardService>(FinanceDashboardService);
    jest.clearAllMocks();
  });

  describe('getDashboardData', () => {
    it('should return dashboard data with revenue, payments, and rates', async () => {
      // First findMany = all invoices (for revenue/outstanding); later calls (overdue,
      // current, outstanding, etc.) return [] to keep aging/breakdown computations inert.
      mockPrisma.invoice.findMany
        .mockResolvedValueOnce([
          { id: 'inv-1', household_id: 'hh-1', total_amount: '1000.00', balance_amount: '500.00' },
          { id: 'inv-2', household_id: 'hh-2', total_amount: '2000.00', balance_amount: '0.00' },
        ])
        .mockResolvedValue([]);
      mockPrisma.payment.findMany
        .mockResolvedValueOnce([{ amount: '2500.00' }]) // receivedPayments query
        .mockResolvedValueOnce([
          {
            id: 'pay-1',
            payment_reference: 'PAY-001',
            amount: '2500.00',
            received_at: new Date(),
            status: 'posted',
            household: { id: 'hh-1', household_name: 'Smith' },
          },
        ]); // recentPayments query
      mockPrisma.refund.count.mockResolvedValue(3);

      const result = await service.getDashboardData(TENANT_ID);

      expect(result.expected_revenue).toBe(3000);
      expect(result.received_payments).toBe(2500);
      expect(result.outstanding).toBe(500);
      expect(result.collection_rate).toBe(83.33);
      expect(result.pending_refund_approvals).toBe(3);
      expect(result.recent_payments).toHaveLength(1);
    });

    it('should return zero collection rate when no revenue', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany
        .mockResolvedValueOnce([]) // receivedPayments
        .mockResolvedValueOnce([]); // recentPayments
      mockPrisma.refund.count.mockResolvedValue(0);

      const result = await service.getDashboardData(TENANT_ID);

      expect(result.expected_revenue).toBe(0);
      expect(result.received_payments).toBe(0);
      expect(result.collection_rate).toBe(0);
      expect(result.outstanding).toBe(0);
    });

    it('should compute household debt breakdown correctly', async () => {
      // hh-1: 1000 total, 50 balance = 5% => pct_0_10
      // hh-2: 1000 total, 200 balance = 20% => pct_10_30
      // hh-3: 1000 total, 400 balance = 40% => pct_30_50
      // hh-4: 1000 total, 800 balance = 80% => pct_50_plus
      mockPrisma.invoice.findMany
        .mockResolvedValueOnce([
          { id: 'inv-1', household_id: 'hh-1', total_amount: '1000.00', balance_amount: '50.00' },
          { id: 'inv-2', household_id: 'hh-2', total_amount: '1000.00', balance_amount: '200.00' },
          { id: 'inv-3', household_id: 'hh-3', total_amount: '1000.00', balance_amount: '400.00' },
          { id: 'inv-4', household_id: 'hh-4', total_amount: '1000.00', balance_amount: '800.00' },
        ])
        .mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.refund.count.mockResolvedValue(0);

      const result = await service.getDashboardData(TENANT_ID);

      expect(result.household_debt_breakdown.pct_0_10).toBe(1);
      expect(result.household_debt_breakdown.pct_10_30).toBe(1);
      expect(result.household_debt_breakdown.pct_30_50).toBe(1);
      expect(result.household_debt_breakdown.pct_50_plus).toBe(1);
    });

    it('should skip fully paid households in breakdown', async () => {
      mockPrisma.invoice.findMany
        .mockResolvedValueOnce([
          { id: 'inv-1', household_id: 'hh-1', total_amount: '1000.00', balance_amount: '0.00' },
        ])
        .mockResolvedValue([]);
      mockPrisma.payment.findMany
        .mockResolvedValueOnce([{ amount: '1000.00' }])
        .mockResolvedValueOnce([]);
      mockPrisma.refund.count.mockResolvedValue(0);

      const result = await service.getDashboardData(TENANT_ID);

      expect(result.household_debt_breakdown.pct_0_10).toBe(0);
      expect(result.household_debt_breakdown.pct_10_30).toBe(0);
      expect(result.household_debt_breakdown.pct_30_50).toBe(0);
      expect(result.household_debt_breakdown.pct_50_plus).toBe(0);
    });

    it('should serialize recent payments with numeric amounts', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.payment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'pay-1',
          payment_reference: 'PAY-001',
          amount: '1234.56',
          received_at: new Date('2026-03-24T10:00:00Z'),
          status: 'posted',
          household: { id: 'hh-1', household_name: 'Smith' },
        },
      ]);
      mockPrisma.refund.count.mockResolvedValue(0);

      const result = await service.getDashboardData(TENANT_ID);

      expect(result.recent_payments[0]?.amount).toBe(1234.56);
      expect(typeof result.recent_payments[0]?.amount).toBe('number');
      expect(result.recent_payments[0]?.household_name).toBe('Smith');
    });
  });
});
