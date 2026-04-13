import type { AdmissionsFinanceParams } from './admissions-finance-bridge.service';
import { AdmissionsFinanceBridgeService } from './admissions-finance-bridge.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const HOUSEHOLD_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const YEAR_GROUP_ID = '44444444-4444-4444-4444-444444444444';
const ACADEMIC_YEAR_ID = '55555555-5555-5555-5555-555555555555';
const ACTING_USER_ID = '66666666-6666-6666-6666-666666666666';
const INVOICE_ID = '77777777-7777-7777-7777-777777777777';
const PAYMENT_ID = '88888888-8888-8888-8888-888888888888';

function buildFeeStructure(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fs-1',
    tenant_id: TENANT_ID,
    name: 'Tuition Fee',
    amount: 5000,
    billing_frequency: 'annual',
    active: true,
    ...overrides,
  };
}

// ─── Mock builders ──────────────────────────────────────────────────────────

function buildMockDb() {
  return {
    tenantBranding: {
      findUnique: jest.fn().mockResolvedValue({ invoice_prefix: 'INV' }),
    },
    feeStructure: {
      findMany: jest.fn().mockResolvedValue([buildFeeStructure()]),
    },
    academicYear: {
      findFirst: jest.fn().mockResolvedValue({
        id: ACADEMIC_YEAR_ID,
        periods: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
      }),
    },
    householdFeeAssignment: {
      create: jest.fn().mockResolvedValue({}),
    },
    invoice: {
      create: jest.fn().mockResolvedValue({ id: INVOICE_ID }),
      findFirst: jest.fn().mockResolvedValue({ id: INVOICE_ID, balance_amount: 0 }),
    },
    payment: {
      create: jest.fn().mockResolvedValue({ id: PAYMENT_ID }),
    },
    paymentAllocation: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

function buildHarness(defaultLocale = 'en') {
  const invoicesService = {
    recalculateBalance: jest.fn().mockResolvedValue(undefined),
  };

  const sequenceService = {
    nextNumber: jest.fn().mockResolvedValue('INV-202604-0001'),
  };

  const tenantReadFacade = {
    findCurrencyCode: jest.fn().mockResolvedValue('EUR'),
    findDefaultLocale: jest.fn().mockResolvedValue(defaultLocale),
  };

  const db = buildMockDb();

  const service = new AdmissionsFinanceBridgeService(
    invoicesService as never,
    sequenceService as never,
    tenantReadFacade as never,
  );

  return { service, invoicesService, sequenceService, tenantReadFacade, db };
}

function buildParams(
  db: ReturnType<typeof buildMockDb>,
  overrides: Partial<AdmissionsFinanceParams> = {},
): AdmissionsFinanceParams {
  return {
    tenantId: TENANT_ID,
    householdId: HOUSEHOLD_ID,
    studentId: STUDENT_ID,
    studentFirstName: 'Alice',
    studentLastName: 'Smith',
    yearGroupId: YEAR_GROUP_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    paymentAmountCents: 500_000,
    paymentSource: 'cash',
    actingUserId: ACTING_USER_ID,
    db: db as never,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AdmissionsFinanceBridgeService — createFinancialRecords', () => {
  afterEach(() => jest.clearAllMocks());

  it('uses English invoice line description when tenant locale is "en"', async () => {
    const { service, db } = buildHarness('en');
    await service.createFinancialRecords(buildParams(db));

    const invoiceCreateCall = db.invoice.create.mock.calls[0]?.[0];
    const lines = invoiceCreateCall.data.lines.create;
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe('Tuition Fee — Alice Smith');
  });

  it('uses Arabic invoice line description when tenant locale is "ar"', async () => {
    const { service, db } = buildHarness('ar');
    await service.createFinancialRecords(buildParams(db));

    const invoiceCreateCall = db.invoice.create.mock.calls[0]?.[0];
    const lines = invoiceCreateCall.data.lines.create;
    expect(lines).toHaveLength(1);
    // Arabic template: '{feeName} — {studentName}' — same structure, tenant-managed fee name
    expect(lines[0].description).toBe('Tuition Fee — Alice Smith');
  });

  it('uses Arabic fee name in invoice line when fee structure has Arabic name', async () => {
    const { service, db } = buildHarness('ar');
    db.feeStructure.findMany.mockResolvedValue([buildFeeStructure({ name: 'رسوم التسجيل' })]);

    await service.createFinancialRecords(
      buildParams(db, {
        studentFirstName: 'أحمد',
        studentLastName: 'محمد',
      }),
    );

    const invoiceCreateCall = db.invoice.create.mock.calls[0]?.[0];
    const lines = invoiceCreateCall.data.lines.create;
    expect(lines[0].description).toBe('رسوم التسجيل — أحمد محمد');
  });

  it('uses English payment reason when tenant locale is "en"', async () => {
    const { service, db } = buildHarness('en');
    await service.createFinancialRecords(buildParams(db));

    const paymentCreateCall = db.payment.create.mock.calls[0]?.[0];
    expect(paymentCreateCall.data.reason).toBe('Admissions payment (cash)');
  });

  it('uses Arabic payment reason when tenant locale is "ar"', async () => {
    const { service, db } = buildHarness('ar');
    await service.createFinancialRecords(buildParams(db));

    const paymentCreateCall = db.payment.create.mock.calls[0]?.[0];
    expect(paymentCreateCall.data.reason).toBe('دفعة القبول (cash)');
  });

  it('uses English payment reason with reference when locale is "en"', async () => {
    const { service, db } = buildHarness('en');
    await service.createFinancialRecords(buildParams(db, { externalReference: 'R-42' }));

    const paymentCreateCall = db.payment.create.mock.calls[0]?.[0];
    expect(paymentCreateCall.data.reason).toBe('Admissions payment (cash) — ref: R-42');
  });

  it('uses Arabic payment reason with reference when locale is "ar"', async () => {
    const { service, db } = buildHarness('ar');
    await service.createFinancialRecords(buildParams(db, { externalReference: 'TRX-123' }));

    const paymentCreateCall = db.payment.create.mock.calls[0]?.[0];
    expect(paymentCreateCall.data.reason).toBe('دفعة القبول (cash) — المرجع: TRX-123');
  });

  it('falls back to English for unknown locale', async () => {
    const { service, db } = buildHarness('fr');
    await service.createFinancialRecords(buildParams(db));

    const invoiceCreateCall = db.invoice.create.mock.calls[0]?.[0];
    const lines = invoiceCreateCall.data.lines.create;
    expect(lines[0].description).toBe('Tuition Fee — Alice Smith');

    const paymentCreateCall = db.payment.create.mock.calls[0]?.[0];
    expect(paymentCreateCall.data.reason).toBe('Admissions payment (cash)');
  });

  it('fetches the tenant locale via TenantReadFacade.findDefaultLocale', async () => {
    const { service, tenantReadFacade, db } = buildHarness('en');
    await service.createFinancialRecords(buildParams(db));

    expect(tenantReadFacade.findDefaultLocale).toHaveBeenCalledWith(TENANT_ID);
  });

  it('skips payment creation when paymentAmountCents is 0', async () => {
    const { service, db } = buildHarness('en');
    await service.createFinancialRecords(buildParams(db, { paymentAmountCents: 0 }));

    expect(db.payment.create).not.toHaveBeenCalled();
  });
});
