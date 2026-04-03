import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { FinanceReadFacade } from './finance-read.facade';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const mockPrisma = {
  invoice: {
    findMany: jest.fn(),
    count: jest.fn(),
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
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-0001';
const HOUSEHOLD_ID = 'household-uuid-0001';
const STUDENT_ID = 'student-uuid-0001';
const YEAR_GROUP_ID = 'year-group-uuid-0001';

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

  describe('findInvoicesByHousehold', () => {
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

  describe('countInvoicesBeforeDate', () => {
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

  describe('findPaymentsByHousehold', () => {
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

    it('should return payment rows when found', async () => {
      const payment = {
        id: 'pay-001',
        household_id: HOUSEHOLD_ID,
        payment_reference: 'PAY-001',
        amount: '200.00',
        status: 'completed',
        created_at: new Date(),
      };
      mockPrisma.payment.findMany.mockResolvedValue([payment]);

      const result = await facade.findPaymentsByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'pay-001' });
    });
  });

  // ─── findRefundsByHousehold ────────────────────────────────────────────────

  describe('findRefundsByHousehold', () => {
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

    it('should return refund rows when found', async () => {
      const refund = {
        id: 'ref-001',
        payment_id: 'pay-001',
        amount: '50.00',
        status: 'completed',
        created_at: new Date(),
      };
      mockPrisma.refund.findMany.mockResolvedValue([refund]);

      const result = await facade.findRefundsByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'ref-001' });
    });
  });

  // ─── findCreditNotesByHousehold ────────────────────────────────────────────

  describe('findCreditNotesByHousehold', () => {
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

    it('should return credit note rows when found', async () => {
      const cn = {
        id: 'cn-001',
        household_id: HOUSEHOLD_ID,
        credit_note_number: 'CN-001',
        amount: '100.00',
        status: 'open',
        created_at: new Date(),
      };
      mockPrisma.creditNote.findMany.mockResolvedValue([cn]);

      const result = await facade.findCreditNotesByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'cn-001' });
    });
  });

  // ─── findPaymentPlanRequestsByHousehold ───────────────────────────────────

  describe('findPaymentPlanRequestsByHousehold', () => {
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

    it('should return payment plan request rows when found', async () => {
      const ppr = {
        id: 'ppr-001',
        household_id: HOUSEHOLD_ID,
        status: 'pending',
        created_at: new Date(),
      };
      mockPrisma.paymentPlanRequest.findMany.mockResolvedValue([ppr]);

      const result = await facade.findPaymentPlanRequestsByHousehold(TENANT_ID, HOUSEHOLD_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'ppr-001' });
    });
  });

  // ─── findScholarshipsByStudent ─────────────────────────────────────────────

  describe('findScholarshipsByStudent', () => {
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

    it('should return scholarship rows when found', async () => {
      const scholarship = {
        id: 'sch-001',
        student_id: STUDENT_ID,
        name: 'Merit Award',
        status: 'active',
        value: '500.00',
        created_at: new Date(),
      };
      mockPrisma.scholarship.findMany.mockResolvedValue([scholarship]);

      const result = await facade.findScholarshipsByStudent(TENANT_ID, STUDENT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'sch-001' });
    });
  });

  // ─── findActiveFeeStructures ───────────────────────────────────────────────

  describe('findActiveFeeStructures', () => {
    it('should query active fee structures with tenant_id', async () => {
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

    it('should return fee structure rows when found', async () => {
      const feeStructure = {
        id: 'fs-001',
        name: 'Tuition Fee',
        amount: '1000.00',
        active: true,
        billing_frequency: 'monthly',
      };
      mockPrisma.feeStructure.findMany.mockResolvedValue([feeStructure]);

      const result = await facade.findActiveFeeStructures(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'fs-001' });
    });
  });

  // ─── findActiveDiscounts ───────────────────────────────────────────────────

  describe('findActiveDiscounts', () => {
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

    it('should return discount rows when found', async () => {
      const discount = {
        id: 'disc-001',
        name: 'Sibling Discount',
        discount_type: 'percent',
        value: '10.00',
        active: true,
      };
      mockPrisma.discount.findMany.mockResolvedValue([discount]);

      const result = await facade.findActiveDiscounts(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'disc-001' });
    });
  });
});
