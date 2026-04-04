/* eslint-disable import/order -- jest.mock must precede mocked imports */
/**
 * Prisma Query Structure Snapshots
 *
 * These tests capture the exact `include`, `select`, and `where` shapes passed
 * to Prisma for key service methods. When someone refactors a service, a change
 * to any query structure will produce a snapshot diff that must be reviewed and
 * explicitly accepted — preventing silent regressions during refactoring.
 *
 * To update snapshots after an intentional query change:
 *   pnpm --filter api test -- --updateSnapshot apps/api/src/common/tests/prisma-query-snapshots.spec.ts
 */

import { Test, TestingModule } from '@nestjs/testing';

// ─── RLS mock (must precede service imports) ──────────────────────────────────

jest.mock('../middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { MOCK_FACADE_PROVIDERS } from './mock-facades';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';
import { SequenceService } from '../../modules/sequence/sequence.service';
import { StudentsService } from '../../modules/students/students.service';
import { InvoicesService } from '../../modules/finance/invoices.service';
import { PaymentsService } from '../../modules/finance/payments.service';
import { ReceiptsService } from '../../modules/finance/receipts.service';
import { ApprovalRequestsService } from '../../modules/approvals/approval-requests.service';
import { SettingsService } from '../../modules/configuration/settings.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INVOICE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PAYMENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const HOUSEHOLD_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Mock builders ────────────────────────────────────────────────────────────

function buildCapturingPrisma() {
  const calls: Record<string, unknown[]> = {};

  function captureMethod(model: string, method: string) {
    return jest.fn().mockImplementation((args: unknown) => {
      const key = `${model}.${method}`;
      if (!calls[key]) calls[key] = [];
      calls[key].push(args);
      // Return a never-resolving promise by default — tests override per-case
      return Promise.resolve(null);
    });
  }

  const prisma = {
    student: {
      findMany: captureMethod('student', 'findMany'),
      findFirst: captureMethod('student', 'findFirst'),
      count: captureMethod('student', 'count').mockResolvedValue(0),
      create: captureMethod('student', 'create'),
      update: captureMethod('student', 'update'),
    },
    household: {
      findFirst: captureMethod('household', 'findFirst'),
    },
    yearGroup: {
      findFirst: captureMethod('yearGroup', 'findFirst'),
    },
    class: {
      findFirst: captureMethod('class', 'findFirst'),
    },
    parent: {
      findFirst: captureMethod('parent', 'findFirst'),
    },
    consentRecord: {
      findMany: captureMethod('consentRecord', 'findMany'),
    },
    invoice: {
      findMany: captureMethod('invoice', 'findMany'),
      findFirst: captureMethod('invoice', 'findFirst'),
      count: captureMethod('invoice', 'count').mockResolvedValue(0),
      create: captureMethod('invoice', 'create'),
      update: captureMethod('invoice', 'update'),
    },
    invoiceLine: {
      deleteMany: captureMethod('invoiceLine', 'deleteMany'),
      createMany: captureMethod('invoiceLine', 'createMany'),
    },
    installment: {
      findMany: captureMethod('installment', 'findMany'),
      deleteMany: captureMethod('installment', 'deleteMany'),
      createMany: captureMethod('installment', 'createMany'),
    },
    payment: {
      findMany: captureMethod('payment', 'findMany'),
      findFirst: captureMethod('payment', 'findFirst'),
      count: captureMethod('payment', 'count').mockResolvedValue(0),
      create: captureMethod('payment', 'create'),
      update: captureMethod('payment', 'update'),
    },
    paymentAllocation: {
      findMany: captureMethod('paymentAllocation', 'findMany'),
      create: captureMethod('paymentAllocation', 'create'),
    },
    receipt: {
      findFirst: captureMethod('receipt', 'findFirst'),
      create: captureMethod('receipt', 'create'),
    },
    tenant: {
      findUnique: captureMethod('tenant', 'findUnique'),
    },
    tenantBranding: {
      findUnique: captureMethod('tenantBranding', 'findUnique'),
    },
    approvalRequest: {
      findFirst: captureMethod('approvalRequest', 'findFirst'),
      create: captureMethod('approvalRequest', 'create'),
      update: captureMethod('approvalRequest', 'update'),
      findMany: captureMethod('approvalRequest', 'findMany'),
    },
    tenantSetting: {
      findUnique: captureMethod('tenantSetting', 'findUnique'),
    },
    _calls: calls,
  };

  return prisma;
}

function buildMockRedis() {
  const client = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  return { getClient: jest.fn().mockReturnValue(client) };
}

// ─── StudentsService query snapshots ──────────────────────────────────────────

describe('Prisma Query Snapshots — StudentsService', () => {
  let service: StudentsService;
  let mockPrisma: ReturnType<typeof buildCapturingPrisma>;

  beforeEach(async () => {
    mockPrisma = buildCapturingPrisma();
    const mockRedis = buildMockRedis();
    const mockSequence = { nextNumber: jest.fn().mockResolvedValue('STU-202601-0001') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get(StudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('findAll include shape matches snapshot', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);
    mockPrisma.student.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    const callArgs = mockPrisma.student.findMany.mock.calls[0][0] as Record<string, unknown>;
    // Snapshot the include clause — the part most likely to drift during refactoring
    expect(callArgs['include']).toMatchSnapshot('student.findMany include');
  });

  it('findOne include shape matches snapshot', async () => {
    const baseStudent = {
      id: STUDENT_ID,
      tenant_id: TENANT_ID,
      household_id: HOUSEHOLD_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
      full_name: 'Ali Hassan',
      first_name_ar: null,
      last_name_ar: null,
      full_name_ar: null,
      student_number: 'STU-202601-0001',
      date_of_birth: new Date('2012-03-10'),
      gender: 'male',
      status: 'active',
      entry_date: null,
      exit_date: null,
      year_group_id: null,
      class_homeroom_id: null,
      medical_notes: null,
      has_allergy: false,
      allergy_details: null,
      created_at: new Date(),
      updated_at: new Date(),
      household: { id: HOUSEHOLD_ID, household_name: 'Hassan Family' },
      year_group: null,
      homeroom_class: null,
      student_parents: [],
      class_enrolments: [],
      consent_records: [],
    };

    mockPrisma.student.findFirst.mockResolvedValue(baseStudent);

    await service.findOne(TENANT_ID, STUDENT_ID);

    const callArgs = mockPrisma.student.findFirst.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['include']).toMatchSnapshot('student.findFirst include');
    expect(callArgs['where']).toMatchSnapshot('student.findFirst where');
  });
});

// ─── InvoicesService query snapshots ──────────────────────────────────────────

describe('Prisma Query Snapshots — InvoicesService', () => {
  let service: InvoicesService;
  let mockPrisma: ReturnType<typeof buildCapturingPrisma>;

  beforeEach(async () => {
    mockPrisma = buildCapturingPrisma();
    const mockSequence = { nextNumber: jest.fn().mockResolvedValue('INV-202601-000001') };
    const mockApprovals = { checkAndCreateIfNeeded: jest.fn(), cancel: jest.fn() };
    const mockSettings = {
      getSettings: jest.fn().mockResolvedValue({
        finance: { requireApprovalAbove: null, currency: 'EUR' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        InvoicesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequence },
        { provide: ApprovalRequestsService, useValue: mockApprovals },
        { provide: SettingsService, useValue: mockSettings },
      ],
    }).compile();

    service = module.get(InvoicesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('findAll include shape matches snapshot', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.invoice.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    const callArgs = mockPrisma.invoice.findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['include']).toMatchSnapshot('invoice.findMany include');
  });

  it('findOne include shape matches snapshot', async () => {
    const baseInvoice = {
      id: INVOICE_ID,
      tenant_id: TENANT_ID,
      household_id: HOUSEHOLD_ID,
      invoice_number: 'INV-202601-000001',
      status: 'draft',
      due_date: new Date('2026-04-01'),
      subtotal_amount: '500.00',
      discount_amount: '0.00',
      total_amount: '500.00',
      balance_amount: '500.00',
      write_off_amount: null,
      currency_code: 'EUR',
      notes: null,
      created_at: new Date(),
      updated_at: new Date(),
      household: { id: HOUSEHOLD_ID, household_name: 'Test Family' },
      lines: [],
      installments: [],
      payment_allocations: [],
      approval_request: null,
    };

    mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice);

    await service.findOne(TENANT_ID, INVOICE_ID);

    const callArgs = mockPrisma.invoice.findFirst.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['include']).toMatchSnapshot('invoice.findFirst include');
    expect(callArgs['where']).toMatchSnapshot('invoice.findFirst where');
  });
});

// ─── PaymentsService query snapshots ──────────────────────────────────────────

describe('Prisma Query Snapshots — PaymentsService', () => {
  let service: PaymentsService;
  let mockPrisma: ReturnType<typeof buildCapturingPrisma>;

  beforeEach(async () => {
    mockPrisma = buildCapturingPrisma();
    const mockSequence = { nextNumber: jest.fn().mockResolvedValue('REC-202601-000001') };
    const mockInvoicesService = { recalculateBalance: jest.fn() };
    const mockReceiptsService = { createForPayment: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequence },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: ReceiptsService, useValue: mockReceiptsService },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('findAll include shape matches snapshot', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);
    mockPrisma.payment.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    const callArgs = mockPrisma.payment.findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['include']).toMatchSnapshot('payment.findMany include');
  });

  it('findOne include shape matches snapshot', async () => {
    const basePayment = {
      id: PAYMENT_ID,
      tenant_id: TENANT_ID,
      household_id: HOUSEHOLD_ID,
      payment_reference: 'PAY-REF-001',
      payment_method: 'bank_transfer',
      status: 'posted',
      amount: '500.00',
      currency_code: 'EUR',
      received_at: new Date(),
      posted_by_user_id: null,
      notes: null,
      stripe_payment_intent_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      household: { id: HOUSEHOLD_ID, household_name: 'Test Family' },
      posted_by: null,
      allocations: [],
      receipt: null,
      refunds: [],
    };

    mockPrisma.payment.findFirst.mockResolvedValue(basePayment);

    await service.findOne(TENANT_ID, PAYMENT_ID);

    const callArgs = mockPrisma.payment.findFirst.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs['include']).toMatchSnapshot('payment.findFirst include');
    expect(callArgs['where']).toMatchSnapshot('payment.findFirst where');
  });
});
