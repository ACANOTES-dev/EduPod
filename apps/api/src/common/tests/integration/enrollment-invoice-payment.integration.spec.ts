/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { MOCK_FACADE_PROVIDERS } from '../mock-facades';
import { ApprovalRequestsService } from '../../../modules/approvals/approval-requests.service';
import { SettingsService } from '../../../modules/configuration/settings.service';
import { InvoicesService } from '../../../modules/finance/invoices.service';
import { PaymentsService } from '../../../modules/finance/payments.service';
import { ReceiptsService } from '../../../modules/finance/receipts.service';
import { PrismaService } from '../../../modules/prisma/prisma.service';
import { SequenceService } from '../../../modules/sequence/sequence.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-integration-001';
const USER_ID = 'user-uuid-integration-001';
const HOUSEHOLD_ID = 'hh-uuid-integration-001';
const INVOICE_ID = 'inv-uuid-integration-001';
const PAYMENT_ID = 'pay-uuid-integration-001';

// ─── Mock factories ──────────────────────────────────────────────────────────

const buildMockPrisma = () => ({
  invoice: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  invoiceLine: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  household: {
    findFirst: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  tenantBranding: {
    findUnique: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  paymentAllocation: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  receipt: {
    findFirst: jest.fn(),
  },
  installment: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  $queryRawUnsafe: jest.fn(),
});

const makeInvoice = (overrides: Record<string, unknown> = {}) => ({
  id: INVOICE_ID,
  tenant_id: TENANT_ID,
  household_id: HOUSEHOLD_ID,
  invoice_number: 'INV-202604-000001',
  status: 'draft',
  due_date: new Date('2026-05-01'),
  subtotal_amount: '1000.00',
  discount_amount: '0.00',
  total_amount: '1000.00',
  balance_amount: '1000.00',
  write_off_amount: null,
  currency_code: 'EUR',
  created_by_user_id: USER_ID,
  approval_request_id: null,
  household: { id: HOUSEHOLD_ID, household_name: 'Integration Family' },
  lines: [
    {
      id: 'line-1',
      description: 'Tuition',
      quantity: '1',
      unit_amount: '1000.00',
      line_total: '1000.00',
      student_id: null,
    },
  ],
  installments: [],
  payment_allocations: [],
  approval_request: null,
  created_at: new Date(),
  updated_at: new Date(),
  issue_date: null,
  ...overrides,
});

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Enrollment -> Invoice -> Payment flow', () => {
  let invoicesService: InvoicesService;
  let paymentsService: PaymentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  const mockSequenceService = {
    nextNumber: jest.fn(),
  };

  const mockApprovalRequestsService = {
    checkAndCreateIfNeeded: jest.fn(),
    cancel: jest.fn(),
  };

  const mockSettingsService = {
    getSettings: jest.fn(),
  };

  const mockReceiptsService = {
    createForPayment: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        InvoicesService,
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: ApprovalRequestsService, useValue: mockApprovalRequestsService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: ReceiptsService, useValue: mockReceiptsService },
      ],
    }).compile();

    invoicesService = module.get(InvoicesService);
    paymentsService = module.get(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create an invoice with correct totals from line items', async () => {
    mockPrisma.household.findFirst.mockResolvedValue({
      id: HOUSEHOLD_ID,
      household_name: 'Integration Family',
    });
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: TENANT_ID,
      currency_code: 'EUR',
    });
    mockPrisma.tenantBranding.findUnique.mockResolvedValue({
      tenant_id: TENANT_ID,
      invoice_prefix: 'INV',
    });
    mockSequenceService.nextNumber.mockResolvedValue('INV-202604-000001');

    const createdInvoice = makeInvoice();
    mockPrisma.invoice.create.mockResolvedValue(createdInvoice);

    const result = await invoicesService.create(TENANT_ID, USER_ID, {
      household_id: HOUSEHOLD_ID,
      due_date: '2026-05-01',
      lines: [{ description: 'Tuition', quantity: 1, unit_amount: 1000 }],
    });

    expect(result).toBeDefined();
    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          household_id: HOUSEHOLD_ID,
          status: 'draft',
          total_amount: 1000,
          balance_amount: 1000,
        }),
      }),
    );
  });

  it('should transition invoice to paid when full payment is allocated and balance recalculated', async () => {
    // Setup: invoice is issued with balance of 500
    const issuedInvoice = makeInvoice({
      status: 'issued',
      total_amount: '500.00',
      balance_amount: '500.00',
      payment_allocations: [{ allocated_amount: '500.00' }],
    });

    mockPrisma.invoice.findFirst.mockResolvedValue(issuedInvoice);
    mockPrisma.invoice.update.mockResolvedValue({
      ...issuedInvoice,
      status: 'paid',
      balance_amount: '0.00',
    });

    // Act: recalculate balance after full allocation
    await invoicesService.recalculateBalance(TENANT_ID, INVOICE_ID);

    // Assert: invoice updated with status=paid and balance=0
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
      where: { id: INVOICE_ID },
      data: {
        balance_amount: 0,
        status: 'paid',
      },
    });
  });

  it('should transition invoice to partially_paid when partial payment is allocated', async () => {
    const issuedInvoice = makeInvoice({
      status: 'issued',
      total_amount: '1000.00',
      balance_amount: '1000.00',
      payment_allocations: [{ allocated_amount: '300.00' }],
    });

    mockPrisma.invoice.findFirst.mockResolvedValue(issuedInvoice);
    mockPrisma.invoice.update.mockResolvedValue({
      ...issuedInvoice,
      status: 'partially_paid',
      balance_amount: '700.00',
    });

    await invoicesService.recalculateBalance(TENANT_ID, INVOICE_ID);

    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({
      where: { id: INVOICE_ID },
      data: {
        balance_amount: 700,
        status: 'partially_paid',
      },
    });
  });

  it('should reject allocation that exceeds remaining payment amount', async () => {
    const payment = {
      id: PAYMENT_ID,
      tenant_id: TENANT_ID,
      household_id: HOUSEHOLD_ID,
      amount: '100.00',
      status: 'posted',
    };

    mockPrisma.payment.findFirst.mockResolvedValueOnce(payment); // pre-check outside tx

    // Inside tx: $queryRawUnsafe returns payment lock row
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: PAYMENT_ID, amount: '100.00', status: 'posted', household_id: HOUSEHOLD_ID },
    ]);

    // Already allocated 50 of 100
    mockPrisma.paymentAllocation.findMany.mockResolvedValue([{ allocated_amount: '50.00' }]);

    await expect(
      paymentsService.confirmAllocations(TENANT_ID, PAYMENT_ID, USER_ID, {
        allocations: [{ invoice_id: INVOICE_ID, amount: 100 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw when recalculating balance for non-existent invoice', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);

    await expect(invoicesService.recalculateBalance(TENANT_ID, 'non-existent-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
