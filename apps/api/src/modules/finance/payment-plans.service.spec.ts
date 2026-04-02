import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PaymentPlansService } from './payment-plans.service';

const TENANT_ID = 'tenant-uuid-1111';
const USER_ID = 'user-uuid-1111';
const PARENT_ID = 'parent-uuid-1111';
const INVOICE_ID = 'invoice-uuid-1111';
const REQUEST_ID = 'request-uuid-1111';
const HOUSEHOLD_ID = 'household-uuid-1111';

const proposedInstallments = [
  { due_date: '2026-04-01', amount: 300 },
  { due_date: '2026-05-01', amount: 300 },
  { due_date: '2026-06-01', amount: 400 },
];

const mockPrisma = {
  paymentPlanRequest: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  invoice: {
    findFirst: jest.fn(),
  },
  installment: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
};

describe('PaymentPlansService', () => {
  let service: PaymentPlansService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentPlansService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<PaymentPlansService>(PaymentPlansService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated payment plan requests', async () => {
      mockPrisma.paymentPlanRequest.findMany.mockResolvedValue([{ id: REQUEST_ID }]);
      mockPrisma.paymentPlanRequest.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });
      expect(result.meta.total).toBe(1);
    });
  });

  describe('requestPlan', () => {
    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.requestPlan(TENANT_ID, PARENT_ID, INVOICE_ID, {
          proposed_installments: proposedInstallments,
          reason: 'Financial difficulty',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid invoice status', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'draft',
        balance_amount: '1000.00',
        household_id: HOUSEHOLD_ID,
      });

      await expect(
        service.requestPlan(TENANT_ID, PARENT_ID, INVOICE_ID, {
          proposed_installments: proposedInstallments,
          reason: 'Financial difficulty',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when installments do not sum to balance', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '500.00',
        household_id: HOUSEHOLD_ID,
      });
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.requestPlan(TENANT_ID, PARENT_ID, INVOICE_ID, {
          proposed_installments: proposedInstallments, // total: 1000, but balance: 500
          reason: 'Financial difficulty',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a pending request', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '1000.00',
        household_id: HOUSEHOLD_ID,
      });
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue(null);
      mockPrisma.paymentPlanRequest.create.mockResolvedValue({
        id: REQUEST_ID,
        status: 'pending',
        proposed_installments_json: proposedInstallments,
      });

      const result = await service.requestPlan(TENANT_ID, PARENT_ID, INVOICE_ID, {
        proposed_installments: proposedInstallments,
        reason: 'Financial difficulty',
      });

      expect(result.status).toBe('pending');
    });
  });

  describe('approvePlan', () => {
    it('should throw NotFoundException when request not found', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue(null);

      await expect(service.approvePlan(TENANT_ID, USER_ID, REQUEST_ID, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for non-pending request', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'approved',
      });

      await expect(service.approvePlan(TENANT_ID, USER_ID, REQUEST_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('counterOffer', () => {
    it('should transition request to counter_offered status', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'pending',
      });
      mockPrisma.paymentPlanRequest.update.mockResolvedValue({
        id: REQUEST_ID,
        status: 'counter_offered',
      });

      const result = await service.counterOffer(TENANT_ID, USER_ID, REQUEST_ID, {
        proposed_installments: proposedInstallments,
        admin_notes: 'Adjusted amounts',
      });

      expect(result.status).toBe('counter_offered');
    });
  });

  describe('acceptCounterOffer', () => {
    it('should throw ForbiddenException when wrong parent accepts', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'counter_offered',
        requested_by_parent_id: 'different-parent-id',
        invoice_id: INVOICE_ID,
        proposed_installments_json: proposedInstallments,
      });

      await expect(service.acceptCounterOffer(TENANT_ID, PARENT_ID, REQUEST_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should accept counter-offer successfully', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'counter_offered',
        requested_by_parent_id: PARENT_ID,
        invoice_id: INVOICE_ID,
        proposed_installments_json: proposedInstallments,
        household_id: HOUSEHOLD_ID,
        invoice: { total_amount: '1000.00' },
        household: { id: HOUSEHOLD_ID, household_name: 'Smith' },
      });
      mockPrisma.paymentPlanRequest.update.mockResolvedValue({
        id: REQUEST_ID,
        status: 'approved',
      });
      mockPrisma.installment.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.installment.createMany.mockResolvedValue({ count: 3 });

      const result = await service.acceptCounterOffer(TENANT_ID, PARENT_ID, REQUEST_ID);

      expect(result.status).toBe('approved');
    });

    it('should throw NotFoundException when request not found', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue(null);

      await expect(service.acceptCounterOffer(TENANT_ID, PARENT_ID, REQUEST_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when not in counter_offered status', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'pending',
        requested_by_parent_id: PARENT_ID,
      });

      await expect(service.acceptCounterOffer(TENANT_ID, PARENT_ID, REQUEST_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should filter by status', async () => {
      mockPrisma.paymentPlanRequest.findMany.mockResolvedValue([]);
      mockPrisma.paymentPlanRequest.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, status: 'pending' });

      expect(mockPrisma.paymentPlanRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'pending' }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException when request not found', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, REQUEST_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return request with serialized amounts', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'pending',
        invoice_id: INVOICE_ID,
        household_id: HOUSEHOLD_ID,
        proposed_installments_json: proposedInstallments,
        invoice: {
          id: INVOICE_ID,
          invoice_number: 'INV-001',
          total_amount: '1000.00',
          due_date: new Date(),
        },
        household: { id: HOUSEHOLD_ID, household_name: 'Smith' },
      });

      const result = await service.findOne(TENANT_ID, REQUEST_ID);

      expect(result.status).toBe('pending');
      expect(result.invoice?.total_amount).toBe(1000);
    });
  });

  describe('rejectPlan', () => {
    it('should reject a pending request', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'pending',
      });
      mockPrisma.paymentPlanRequest.update.mockResolvedValue({
        id: REQUEST_ID,
        status: 'rejected',
      });

      const result = await service.rejectPlan(TENANT_ID, USER_ID, REQUEST_ID, {
        admin_notes: 'Not approved',
      });

      expect(result.status).toBe('rejected');
    });

    it('should reject a counter_offered request', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'counter_offered',
      });
      mockPrisma.paymentPlanRequest.update.mockResolvedValue({
        id: REQUEST_ID,
        status: 'rejected',
      });

      const result = await service.rejectPlan(TENANT_ID, USER_ID, REQUEST_ID, {
        admin_notes: 'Rejected',
      });

      expect(result.status).toBe('rejected');
    });

    it('should throw NotFoundException when request not found', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.rejectPlan(TENANT_ID, USER_ID, REQUEST_ID, { admin_notes: 'No' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for already approved request', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'approved',
      });

      await expect(
        service.rejectPlan(TENANT_ID, USER_ID, REQUEST_ID, { admin_notes: 'No' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approvePlan', () => {
    it('should approve plan and create installments', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'pending',
        invoice_id: INVOICE_ID,
        proposed_installments_json: proposedInstallments,
        household_id: HOUSEHOLD_ID,
      });
      mockPrisma.paymentPlanRequest.update.mockResolvedValue({
        id: REQUEST_ID,
        status: 'approved',
        invoice_id: INVOICE_ID,
        household_id: HOUSEHOLD_ID,
      });
      mockPrisma.installment.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.installment.createMany.mockResolvedValue({ count: 3 });

      const result = await service.approvePlan(TENANT_ID, USER_ID, REQUEST_ID, {
        admin_notes: 'Approved',
      });

      expect(result.status).toBe('approved');
      expect(mockPrisma.installment.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.installment.createMany).toHaveBeenCalled();
    });

    it('should throw NotFoundException when request not found', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue(null);

      await expect(service.approvePlan(TENANT_ID, USER_ID, REQUEST_ID, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for non-pending request', async () => {
      mockPrisma.paymentPlanRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'approved',
      });

      await expect(service.approvePlan(TENANT_ID, USER_ID, REQUEST_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
