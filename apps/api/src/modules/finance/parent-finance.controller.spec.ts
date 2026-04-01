import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PrismaService } from '../prisma/prisma.service';

import { InvoicesService } from './invoices.service';
import { ParentFinanceController } from './parent-finance.controller';
import { PaymentPlansService } from './payment-plans.service';
import { StripeService } from './stripe.service';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'user-uuid',
  tenant_id: 'tenant-uuid',
  email: 'parent@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
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

describe('ParentFinanceController', () => {
  let controller: ParentFinanceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentFinanceController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: StripeService, useValue: mockStripeService },
        { provide: PaymentPlansService, useValue: mockPaymentPlansService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ParentFinanceController>(ParentFinanceController);
    jest.clearAllMocks();
  });

  it('should get student finances for a parent', async () => {
    const parentRecord = { id: 'parent-1', user_id: 'user-uuid', tenant_id: 'tenant-uuid' };
    const studentParentRecord = {
      student_id: 'student-1',
      parent_id: 'parent-1',
      tenant_id: 'tenant-uuid',
      student: { household_id: 'hh-1' },
    };
    const household = { id: 'hh-1', household_name: 'Smith Family', tenant_id: 'tenant-uuid' };

    mockPrisma.parent.findFirst.mockResolvedValue(parentRecord);
    mockPrisma.studentParent.findUnique.mockResolvedValue(studentParentRecord);
    mockPrisma.household.findFirst.mockResolvedValue(household);
    mockInvoicesService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
    mockPrisma.payment.findMany.mockResolvedValue([]);

    const result = await controller.getStudentFinances(TENANT, USER, 'student-1');

    expect(result.household_id).toBe('hh-1');
    expect(result.household_name).toBe('Smith Family');
    expect(result.total_outstanding_balance).toBe(0);
  });

  it('should call stripeService.createCheckoutSession on payInvoice', async () => {
    const parentRecord = { id: 'parent-1', user_id: 'user-uuid', tenant_id: 'tenant-uuid' };
    const studentParents = [
      { parent_id: 'parent-1', tenant_id: 'tenant-uuid', student: { household_id: 'hh-1' } },
    ];
    const invoice = { id: 'inv-1', tenant_id: 'tenant-uuid', household_id: 'hh-1' };

    mockPrisma.parent.findFirst.mockResolvedValue(parentRecord);
    mockPrisma.studentParent.findMany.mockResolvedValue(studentParents);
    mockPrisma.invoice.findFirst.mockResolvedValue(invoice);
    mockStripeService.createCheckoutSession.mockResolvedValue({
      session_id: 'sess-1',
      checkout_url: 'https://stripe.com/checkout',
    });

    const dto = { success_url: 'https://app/success', cancel_url: 'https://app/cancel' };
    const result = await controller.payInvoice(TENANT, USER, 'inv-1', dto);

    expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
      'tenant-uuid',
      'inv-1',
      dto,
    );
    expect(result.session_id).toBe('sess-1');
  });

  it('should call paymentPlansService.acceptCounterOffer', async () => {
    mockPaymentPlansService.acceptCounterOffer.mockResolvedValue({
      id: 'pp-1',
      status: 'accepted',
    });
    const result = await controller.acceptCounterOffer(TENANT, USER, 'pp-1');
    expect(mockPaymentPlansService.acceptCounterOffer).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      'pp-1',
    );
    expect((result as Record<string, unknown>).status).toBe('accepted');
  });

  it('should call paymentPlansService.requestPlan for requestPaymentPlan', async () => {
    const parentRecord = { id: 'parent-1', user_id: 'user-uuid', tenant_id: 'tenant-uuid' };
    const studentParents = [
      { parent_id: 'parent-1', tenant_id: 'tenant-uuid', student: { household_id: 'hh-1' } },
    ];
    const invoice = { id: 'inv-1', tenant_id: 'tenant-uuid', household_id: 'hh-1' };

    mockPrisma.parent.findFirst.mockResolvedValue(parentRecord);
    mockPrisma.studentParent.findMany.mockResolvedValue(studentParents);
    mockPrisma.invoice.findFirst.mockResolvedValue(invoice);
    mockPaymentPlansService.requestPlan.mockResolvedValue({ id: 'pp-new' });

    const dto = { number_of_installments: 3 } as never;
    await controller.requestPaymentPlan(TENANT, USER, 'inv-1', dto);

    expect(mockPaymentPlansService.requestPlan).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      'inv-1',
      dto,
    );
  });
});
