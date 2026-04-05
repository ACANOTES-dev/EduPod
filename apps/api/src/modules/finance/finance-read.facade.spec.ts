import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { FinanceReadFacade } from './finance-read.facade';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const mockPrisma = {
  invoice: {
    findMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
  },
  refund: {
    findMany: jest.fn(),
  },
  creditNote: {
    findMany: jest.fn(),
  },
  paymentPlanRequest: {
    findMany: jest.fn(),
  },
  scholarship: {
    findMany: jest.fn(),
  },
  feeStructure: {
    findMany: jest.fn(),
  },
  discount: {
    findMany: jest.fn(),
  },
  householdFeeAssignment: {
    findMany: jest.fn(),
  },
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOUSEHOLD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FinanceReadFacade', () => {
  let facade: FinanceReadFacade;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FinanceReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<FinanceReadFacade>(FinanceReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findInvoicesByHousehold ───────────────────────────────────────────────

  describe('FinanceReadFacade — findInvoicesByHousehold', () => {
    it('should query invoices with tenant_id and household_id', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await facade.findInvoicesByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            household_id: HOUSEHOLD_ID,
          }),
        }),
      );
    });

    it('should return invoice rows when found', async () => {
      const invoice = {
        id: 'inv-001',
        household_id: HOUSEHOLD_ID,
        invoice_number: 'INV-2024-001',
        status: 'paid',
        total_amount: '500.00',
        created_at: new Date(),
      };
      mockPrisma.invoice.findMany.mockResolvedValue([invoice]);

      const result = await facade.findInvoicesByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'inv-001' });
    });
  });

  // ─── countInvoicesBeforeDate ───────────────────────────────────────────────

  describe('FinanceReadFacade — countInvoicesBeforeDate', () => {
    it('should count invoices with tenant_id and created_at < cutoffDate', async () => {
      const cutoff = new Date('2024-01-01');
      mockPrisma.invoice.count.mockResolvedValue(42);

      const result = await facade.countInvoicesBeforeDate(TENANT_ID, cutoff);

      expect(result).toBe(42);
      expect(mockPrisma.invoice.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            created_at: { lt: cutoff },
          }),
        }),
      );
    });

    it('should return 0 when no invoices exist before the cutoff', async () => {
      mockPrisma.invoice.count.mockResolvedValue(0);

      const result = await facade.countInvoicesBeforeDate(TENANT_ID, new Date('2000-01-01'));

      expect(result).toBe(0);
    });
  });

  // ─── findPaymentsByHousehold ───────────────────────────────────────────────

  describe('FinanceReadFacade — findPaymentsByHousehold', () => {
    it('should query payments with tenant_id and household_id', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await facade.findPaymentsByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            household_id: HOUSEHOLD_ID,
          }),
        }),
      );
    });
  });

  // ─── findRefundsByHousehold ────────────────────────────────────────────────

  describe('FinanceReadFacade — findRefundsByHousehold', () => {
    it('should query refunds via payment.household_id relation', async () => {
      mockPrisma.refund.findMany.mockResolvedValue([]);

      const result = await facade.findRefundsByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.refund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            payment: { household_id: HOUSEHOLD_ID },
          }),
        }),
      );
    });
  });

  // ─── findCreditNotesByHousehold ────────────────────────────────────────────

  describe('FinanceReadFacade — findCreditNotesByHousehold', () => {
    it('should query credit notes with tenant_id and household_id', async () => {
      mockPrisma.creditNote.findMany.mockResolvedValue([]);

      const result = await facade.findCreditNotesByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.creditNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            household_id: HOUSEHOLD_ID,
          }),
        }),
      );
    });
  });

  // ─── findPaymentPlanRequestsByHousehold ───────────────────────────────────

  describe('FinanceReadFacade — findPaymentPlanRequestsByHousehold', () => {
    it('should query payment plan requests with tenant_id and household_id', async () => {
      mockPrisma.paymentPlanRequest.findMany.mockResolvedValue([]);

      const result = await facade.findPaymentPlanRequestsByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.paymentPlanRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            household_id: HOUSEHOLD_ID,
          }),
        }),
      );
    });
  });

  // ─── findScholarshipsByStudent ─────────────────────────────────────────────

  describe('FinanceReadFacade — findScholarshipsByStudent', () => {
    it('should query scholarships with tenant_id and student_id', async () => {
      mockPrisma.scholarship.findMany.mockResolvedValue([]);

      const result = await facade.findScholarshipsByStudent(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.scholarship.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });
  });

  // ─── findScholarshipsByHouseholds ──────────────────────────────────────────

  describe('FinanceReadFacade — findScholarshipsByHouseholds', () => {
    it('should return empty array when householdIds is empty', async () => {
      const result = await facade.findScholarshipsByHouseholds(TENANT_ID, []);

      expect(result).toEqual([]);
      expect(mockPrisma.scholarship.findMany).not.toHaveBeenCalled();
    });

    it('should query scholarships for students in given households', async () => {
      mockPrisma.scholarship.findMany.mockResolvedValue([{ id: 'sch-1' }]);

      const result = await facade.findScholarshipsByHouseholds(TENANT_ID, ['hh-1', 'hh-2']);

      expect(result).toHaveLength(1);
      expect(mockPrisma.scholarship.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student: { household_id: { in: ['hh-1', 'hh-2'] } },
          }),
        }),
      );
    });
  });

  // ─── findActiveFeeStructures ───────────────────────────────────────────────

  describe('FinanceReadFacade — findActiveFeeStructures', () => {
    it('should query active fee structures without year group filter', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([]);

      const result = await facade.findActiveFeeStructures(TENANT_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.feeStructure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            active: true,
          }),
        }),
      );
    });

    it('should filter by year_group_id when provided', async () => {
      mockPrisma.feeStructure.findMany.mockResolvedValue([]);

      await facade.findActiveFeeStructures(TENANT_ID, YEAR_GROUP_ID);

      expect(mockPrisma.feeStructure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            active: true,
            year_group_id: YEAR_GROUP_ID,
          }),
        }),
      );
    });
  });

  // ─── findActiveDiscounts ───────────────────────────────────────────────────

  describe('FinanceReadFacade — findActiveDiscounts', () => {
    it('should query active discounts with tenant_id', async () => {
      mockPrisma.discount.findMany.mockResolvedValue([]);

      const result = await facade.findActiveDiscounts(TENANT_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.discount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            active: true,
          }),
        }),
      );
    });
  });

  // ─── findFeeAssignmentsByHousehold ────────────────────────────────────────

  describe('FinanceReadFacade — findFeeAssignmentsByHousehold', () => {
    it('should query fee assignments with tenant_id and household_id', async () => {
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([]);

      const result = await facade.findFeeAssignmentsByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.householdFeeAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            household_id: HOUSEHOLD_ID,
          }),
        }),
      );
    });

    it('should return fee assignment rows when found', async () => {
      const assignment = { id: 'hfa-1', household_id: HOUSEHOLD_ID, effective_from: new Date() };
      mockPrisma.householdFeeAssignment.findMany.mockResolvedValue([assignment]);

      const result = await facade.findFeeAssignmentsByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toHaveLength(1);
    });
  });

  // ─── findInvoicesGeneric ──────────────────────────────────────────────────

  describe('FinanceReadFacade — findInvoicesGeneric', () => {
    it('should query invoices with minimal options', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const result = await facade.findInvoicesGeneric(TENANT_ID, {});

      expect(result).toEqual([]);
      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_ID }),
        }),
      );
    });

    it('should pass select option when provided', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      await facade.findInvoicesGeneric(TENANT_ID, {
        select: { id: true, status: true },
      });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, status: true },
        }),
      );
    });

    it('should pass orderBy option when provided', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      await facade.findInvoicesGeneric(TENANT_ID, {
        orderBy: { created_at: 'desc' },
      });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('should pass skip option when provided', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      await facade.findInvoicesGeneric(TENANT_ID, { skip: 10 });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10 }),
      );
    });

    it('should pass take option when provided', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      await facade.findInvoicesGeneric(TENANT_ID, { take: 5 });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
    });

    it('should merge where option with tenant_id', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      await facade.findInvoicesGeneric(TENANT_ID, {
        where: { status: 'issued' },
      });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'issued',
          }),
        }),
      );
    });

    it('should pass all options together', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      await facade.findInvoicesGeneric(TENANT_ID, {
        where: { status: 'overdue' },
        select: { id: true },
        orderBy: { due_date: 'asc' },
        skip: 0,
        take: 20,
      });

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'overdue' }),
          select: { id: true },
          orderBy: { due_date: 'asc' },
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  // ─── countInvoices ────────────────────────────────────────────────────────

  describe('FinanceReadFacade — countInvoices', () => {
    it('should count invoices with tenant_id only when no where provided', async () => {
      mockPrisma.invoice.count.mockResolvedValue(10);

      const result = await facade.countInvoices(TENANT_ID);

      expect(result).toBe(10);
      expect(mockPrisma.invoice.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_ID }),
        }),
      );
    });

    it('should merge where option with tenant_id for count', async () => {
      mockPrisma.invoice.count.mockResolvedValue(5);

      const result = await facade.countInvoices(TENANT_ID, { status: 'overdue' });

      expect(result).toBe(5);
      expect(mockPrisma.invoice.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'overdue',
          }),
        }),
      );
    });
  });

  // ─── aggregateInvoices ────────────────────────────────────────────────────

  describe('FinanceReadFacade — aggregateInvoices', () => {
    it('should aggregate invoices with tenant_id only when no where provided', async () => {
      const aggregateResult = {
        _sum: { total_amount: 5000, balance_amount: 1000 },
      };
      mockPrisma.invoice.aggregate.mockResolvedValue(aggregateResult);

      const result = await facade.aggregateInvoices(TENANT_ID);

      expect(result._sum.total_amount).toBe(5000);
      expect(result._sum.balance_amount).toBe(1000);
    });

    it('should merge where option with tenant_id for aggregate', async () => {
      mockPrisma.invoice.aggregate.mockResolvedValue({
        _sum: { total_amount: 2000, balance_amount: 500 },
      });

      await facade.aggregateInvoices(TENANT_ID, { status: 'issued' });

      expect(mockPrisma.invoice.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'issued',
          }),
        }),
      );
    });

    it('should handle null sums', async () => {
      mockPrisma.invoice.aggregate.mockResolvedValue({
        _sum: { total_amount: null, balance_amount: null },
      });

      const result = await facade.aggregateInvoices(TENANT_ID);

      expect(result._sum.total_amount).toBeNull();
      expect(result._sum.balance_amount).toBeNull();
    });
  });

  // ─── findPaymentsGeneric ──────────────────────────────────────────────────

  describe('FinanceReadFacade — findPaymentsGeneric', () => {
    it('should query payments with minimal options', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await facade.findPaymentsGeneric(TENANT_ID, {});

      expect(result).toEqual([]);
      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_ID }),
        }),
      );
    });

    it('should pass select option when provided', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await facade.findPaymentsGeneric(TENANT_ID, {
        select: { id: true, amount: true },
      });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, amount: true },
        }),
      );
    });

    it('should pass orderBy option when provided', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await facade.findPaymentsGeneric(TENANT_ID, {
        orderBy: { received_at: 'desc' },
      });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { received_at: 'desc' },
        }),
      );
    });

    it('should pass take option when provided', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await facade.findPaymentsGeneric(TENANT_ID, { take: 10 });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });

    it('should merge where option with tenant_id', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await facade.findPaymentsGeneric(TENANT_ID, {
        where: { status: 'posted' },
      });

      expect(mockPrisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'posted',
          }),
        }),
      );
    });

    it('should not include select/orderBy/take when not provided', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      await facade.findPaymentsGeneric(TENANT_ID, {});

      const callArgs = mockPrisma.payment.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty('select');
      expect(callArgs).not.toHaveProperty('orderBy');
      expect(callArgs).not.toHaveProperty('take');
    });
  });
});
