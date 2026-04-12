import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  MOCK_FACADE_PROVIDERS,
  ParentReadFacade,
  StudentReadFacade,
  HouseholdReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { InvoicesService } from './invoices.service';
import { ParentFinanceController } from './parent-finance.controller';
import { PaymentPlansService } from './payment-plans.service';
import { ReceiptsService } from './receipts.service';
import { StripeService } from './stripe.service';

const TENANT: TenantContext = {
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  email: 'parent@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const PARENT_RECORD = { id: 'parent-1', user_id: USER.sub, tenant_id: TENANT.tenant_id };
const STUDENT_RECORD = { id: 'student-1', household_id: 'hh-1' };
const HOUSEHOLD_RECORD = {
  id: 'hh-1',
  household_name: 'Smith Family',
  tenant_id: TENANT.tenant_id,
};

const mockPrisma = {
  parent: { findFirst: jest.fn() },
  studentParent: { findUnique: jest.fn(), findMany: jest.fn() },
  household: { findFirst: jest.fn() },
  payment: { findMany: jest.fn() },
  invoice: { findFirst: jest.fn() },
};

const mockInvoicesService = {
  findAll: jest.fn(),
};

const mockStripeService = {
  createCheckoutSession: jest.fn(),
};

const mockPaymentPlansService = {
  requestPlan: jest.fn(),
  acceptCounterOffer: jest.fn(),
};

const mockReceiptsService = {
  renderPdf: jest.fn(),
  findByPayment: jest.fn(),
};

describe('ParentFinanceController', () => {
  let controller: ParentFinanceController;
  let parentReadFacade: Record<string, jest.Mock>;
  let studentReadFacade: Record<string, jest.Mock>;
  let householdReadFacade: Record<string, jest.Mock>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentFinanceController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: StripeService, useValue: mockStripeService },
        { provide: PaymentPlansService, useValue: mockPaymentPlansService },
        { provide: ReceiptsService, useValue: mockReceiptsService },
        {
          provide: ParentReadFacade,
          useValue: {
            findByUserId: jest.fn().mockResolvedValue(PARENT_RECORD),
            findLinkedStudentIds: jest.fn().mockResolvedValue(['student-1']),
          },
        },
        {
          provide: StudentReadFacade,
          useValue: {
            isParentLinked: jest.fn().mockResolvedValue(true),
            findById: jest.fn().mockResolvedValue(STUDENT_RECORD),
            findByIds: jest.fn().mockResolvedValue([STUDENT_RECORD]),
          },
        },
        {
          provide: HouseholdReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(HOUSEHOLD_RECORD),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentFinanceController>(ParentFinanceController);
    parentReadFacade = module.get(ParentReadFacade);
    studentReadFacade = module.get(StudentReadFacade);
    householdReadFacade = module.get(HouseholdReadFacade);
    jest.clearAllMocks();

    // Re-establish defaults after clearAllMocks
    parentReadFacade.findByUserId!.mockResolvedValue(PARENT_RECORD);
    parentReadFacade.findLinkedStudentIds!.mockResolvedValue(['student-1']);
    studentReadFacade.isParentLinked!.mockResolvedValue(true);
    studentReadFacade.findById!.mockResolvedValue(STUDENT_RECORD);
    studentReadFacade.findByIds!.mockResolvedValue([STUDENT_RECORD]);
    householdReadFacade.findById!.mockResolvedValue(HOUSEHOLD_RECORD);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getStudentFinances ───────────────────────────────────────────────────

  describe('ParentFinanceController — getStudentFinances', () => {
    it('should return student finances with balance and payment history', async () => {
      mockInvoicesService.findAll.mockResolvedValue({
        data: [
          { id: 'inv-1', balance_amount: '150.00' },
          { id: 'inv-2', balance_amount: '50.00' },
        ],
        meta: { total: 2 },
      });
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          payment_reference: 'PAY-001',
          payment_method: 'cash',
          amount: '100.00',
          received_at: new Date(),
          status: 'posted',
        },
      ]);

      const result = await controller.getStudentFinances(TENANT, USER, 'student-1');

      expect(result.household_id).toBe('hh-1');
      expect(result.household_name).toBe('Smith Family');
      expect(result.total_outstanding_balance).toBe(200);
      expect(result.invoices).toHaveLength(2);
      expect(result.payment_history).toHaveLength(1);
      expect(result.payment_history[0]!.amount).toBe(100);
    });

    it('should handle invoices without balance_amount', async () => {
      mockInvoicesService.findAll.mockResolvedValue({
        data: [{ id: 'inv-1' }], // no balance_amount field
        meta: { total: 1 },
      });
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const result = await controller.getStudentFinances(TENANT, USER, 'student-1');

      expect(result.total_outstanding_balance).toBe(0);
    });

    it('should throw NotFoundException when parent profile not found', async () => {
      parentReadFacade.findByUserId!.mockResolvedValue(null);

      await expect(controller.getStudentFinances(TENANT, USER, 'student-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when parent is not linked to student', async () => {
      studentReadFacade.isParentLinked!.mockResolvedValue(false);

      await expect(controller.getStudentFinances(TENANT, USER, 'student-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when student has no household_id', async () => {
      studentReadFacade.findById!.mockResolvedValue({ id: 'student-1', household_id: null });

      await expect(controller.getStudentFinances(TENANT, USER, 'student-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when student not found', async () => {
      studentReadFacade.findById!.mockResolvedValue(null);

      await expect(controller.getStudentFinances(TENANT, USER, 'student-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when household not found', async () => {
      householdReadFacade.findById!.mockResolvedValue(null);

      await expect(controller.getStudentFinances(TENANT, USER, 'student-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── payInvoice ───────────────────────────────────────────────────────────

  describe('ParentFinanceController — payInvoice', () => {
    it('should call stripeService.createCheckoutSession on payInvoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        tenant_id: TENANT.tenant_id,
        household_id: 'hh-1',
      });
      mockStripeService.createCheckoutSession.mockResolvedValue({
        session_id: 'sess-1',
        checkout_url: 'https://stripe.com/checkout',
      });

      const dto = { success_url: 'https://app/success', cancel_url: 'https://app/cancel' };
      const result = await controller.payInvoice(TENANT, USER, 'inv-1', dto);

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        TENANT.tenant_id,
        'inv-1',
        dto,
      );
      expect(result.session_id).toBe('sess-1');
    });

    it('should throw NotFoundException when parent not found for payInvoice', async () => {
      parentReadFacade.findByUserId!.mockResolvedValue(null);

      const dto = { success_url: 'https://app/success', cancel_url: 'https://app/cancel' };
      await expect(controller.payInvoice(TENANT, USER, 'inv-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when invoice not found for parent', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      const dto = { success_url: 'https://app/success', cancel_url: 'https://app/cancel' };
      await expect(controller.payInvoice(TENANT, USER, 'inv-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should handle parent with no linked students gracefully', async () => {
      parentReadFacade.findLinkedStudentIds!.mockResolvedValue([]);
      studentReadFacade.findByIds!.mockResolvedValue([]);
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      const dto = { success_url: 'https://app/success', cancel_url: 'https://app/cancel' };
      await expect(controller.payInvoice(TENANT, USER, 'inv-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should handle students with null household_id in access verification', async () => {
      studentReadFacade.findByIds!.mockResolvedValue([
        { id: 'student-1', household_id: null },
        { id: 'student-2', household_id: 'hh-1' },
      ]);
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        tenant_id: TENANT.tenant_id,
        household_id: 'hh-1',
      });
      mockStripeService.createCheckoutSession.mockResolvedValue({
        session_id: 'sess-1',
        checkout_url: 'https://stripe.com/checkout',
      });

      const dto = { success_url: 'https://app/success', cancel_url: 'https://app/cancel' };
      const result = await controller.payInvoice(TENANT, USER, 'inv-1', dto);

      expect(result.session_id).toBe('sess-1');
    });
  });

  // ─── requestPaymentPlan ───────────────────────────────────────────────────

  describe('ParentFinanceController — requestPaymentPlan', () => {
    it('should call paymentPlansService.requestPlan', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        tenant_id: TENANT.tenant_id,
        household_id: 'hh-1',
      });
      mockPaymentPlansService.requestPlan.mockResolvedValue({ id: 'pp-new' });

      const dto = { number_of_installments: 3 } as never;
      await controller.requestPaymentPlan(TENANT, USER, 'inv-1', dto);

      expect(mockPaymentPlansService.requestPlan).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        'inv-1',
        dto,
      );
    });

    it('should throw NotFoundException when parent not found for requestPaymentPlan', async () => {
      parentReadFacade.findByUserId!.mockResolvedValue(null);

      const dto = { number_of_installments: 3 } as never;
      await expect(controller.requestPaymentPlan(TENANT, USER, 'inv-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when invoice not accessible', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      const dto = { number_of_installments: 3 } as never;
      await expect(controller.requestPaymentPlan(TENANT, USER, 'inv-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── acceptCounterOffer ───────────────────────────────────────────────────

  describe('ParentFinanceController — acceptCounterOffer', () => {
    it('should call paymentPlansService.acceptCounterOffer', async () => {
      mockPaymentPlansService.acceptCounterOffer.mockResolvedValue({
        id: 'pp-1',
        status: 'accepted',
      });
      const result = await controller.acceptCounterOffer(TENANT, USER, 'pp-1');
      expect(mockPaymentPlansService.acceptCounterOffer).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        'pp-1',
      );
      expect((result as Record<string, unknown>).status).toBe('accepted');
    });
  });
});
