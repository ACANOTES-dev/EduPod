import { Decimal } from '@prisma/client/runtime/library';
import { Job } from 'bullmq';

import {
  type ApprovalCallbackPayload,
  PAYROLL_APPROVAL_CALLBACK_JOB,
  PayrollApprovalCallbackProcessor,
} from './approval-callback.processor';

// ─── Wave-2 callback spec ──────────────────────────────────────────────────
//
// The rewritten processor no longer recalculates pay inline. The API side
// (PayrollRunsService.createRun / refreshEntries) now writes the new
// gross_pay / net_pay / *_total columns via the unified
// CalculationService, so the worker just:
//   1. Commits scheduled recurring-deduction applications (Phase 2).
//   2. Generates payslips with `formatPayslipNumber` from
//      `@school/shared/payroll` — the canonical PSL-YYYYMM-NNNNNN format.
//   3. Updates the run to `finalised` using the persisted entry totals.
//   4. Marks the approval request executed.
//
// These tests exercise self-heal, skipped-state, the happy path, and
// the idempotency guard. The fixture mock supplies the new entry
// columns so the run-update assertion can verify totals from
// `net_pay`/`basic_pay`/`bonus_pay`.

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const APPROVAL_REQUEST_ID = '22222222-2222-2222-2222-222222222222';
const PAYROLL_RUN_ID = '33333333-3333-3333-3333-333333333333';
const ENTRY_ID = '44444444-4444-4444-4444-444444444444';
const USER_ID = '55555555-5555-5555-5555-555555555555';
const STAFF_PROFILE_ID = '66666666-6666-6666-6666-666666666666';

function buildEntry(overrides: Record<string, unknown> = {}) {
  return {
    classes_taught: null,
    compensation_type: 'salaried',
    days_worked: 20,
    id: ENTRY_ID,
    snapshot_assigned_class_count: null,
    snapshot_base_salary: new Decimal(3000),
    snapshot_bonus_class_rate: null,
    snapshot_bonus_day_multiplier: null,
    snapshot_per_class_rate: null,
    staff_profile_id: STAFF_PROFILE_ID,
    // Wave-2: pre-computed entry totals
    basic_pay: new Decimal(3000),
    bonus_pay: new Decimal(0),
    total_pay: new Decimal(3000),
    gross_pay: new Decimal(3000),
    net_pay: new Decimal(3000),
    total_deductions: new Decimal(0),
    allowances_total: new Decimal(0),
    deductions_total: new Decimal(0),
    adjustments_total: new Decimal(0),
    one_off_total: new Decimal(0),
    staff_profile: {
      bank_name: 'AIB',
      department: 'Primary',
      employment_type: 'permanent',
      job_title: 'Teacher',
      staff_number: 'STF-001',
      user: {
        first_name: 'Amina',
        last_name: 'OBrien',
      },
    },
    payslip: null,
    ...overrides,
  };
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    approvalRequest: {
      update: jest.fn().mockResolvedValue({ id: APPROVAL_REQUEST_ID }),
    },
    payrollEntry: {
      findMany: jest.fn().mockResolvedValue([buildEntry()]),
    },
    payrollRun: {
      findFirst: jest.fn().mockResolvedValue({
        approval_request_id: APPROVAL_REQUEST_ID,
        headcount: null,
        id: PAYROLL_RUN_ID,
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        status: 'pending_approval',
        total_working_days: 20,
      }),
      update: jest.fn().mockResolvedValue({ id: PAYROLL_RUN_ID }),
    },
    payrollDeductionApplication: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'dedapp-1' }),
    },
    staffRecurringDeduction: {
      update: jest.fn().mockResolvedValue({ id: 'ded-1' }),
    },
    payslip: {
      create: jest.fn().mockResolvedValue({ id: 'payslip-id' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    tenant: {
      findFirst: jest.fn().mockResolvedValue({
        currency_code: 'EUR',
        name: 'EduPod School',
      }),
    },
    tenantBranding: {
      findUnique: jest.fn().mockResolvedValue({
        logo_url: 'https://example.com/logo.png',
        primary_color: '#2563eb',
        school_name_ar: null,
        payslip_prefix: 'PSL',
      }),
    },
    tenantSequence: {
      upsert: jest.fn().mockResolvedValue({ current_value: 1 }),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
  };
}

function buildJob(
  name: string = PAYROLL_APPROVAL_CALLBACK_JOB,
  data: Partial<ApprovalCallbackPayload> = {},
): Job<ApprovalCallbackPayload> {
  return {
    data: {
      approval_request_id: APPROVAL_REQUEST_ID,
      approver_user_id: USER_ID,
      target_entity_id: PAYROLL_RUN_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<ApprovalCallbackPayload>;
}

describe('PayrollApprovalCallbackProcessor (Wave-2)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('payroll:other-job'));

    expect(mockTx.payrollRun.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(PAYROLL_APPROVAL_CALLBACK_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should self-heal when payroll run is already finalised', async () => {
    const mockTx = buildMockTx();
    mockTx.payrollRun.findFirst.mockResolvedValue({
      id: PAYROLL_RUN_ID,
      period_label: 'March 2026',
      period_month: 3,
      period_year: 2026,
      status: 'finalised',
      total_working_days: 20,
    });
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.payrollEntry.findMany).not.toHaveBeenCalled();
    expect(mockTx.payrollRun.update).not.toHaveBeenCalled();
    expect(mockTx.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: APPROVAL_REQUEST_ID },
      data: {
        status: 'executed',
        executed_at: expect.any(Date),
        callback_status: 'already_done',
        callback_error: 'Self-healed: payroll run already finalised',
      },
    });
  });

  it('should mark unexpected state when payroll run is in draft', async () => {
    const mockTx = buildMockTx();
    mockTx.payrollRun.findFirst.mockResolvedValue({
      id: PAYROLL_RUN_ID,
      period_label: 'March 2026',
      period_month: 3,
      period_year: 2026,
      status: 'draft',
      total_working_days: 20,
    });
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.payrollEntry.findMany).not.toHaveBeenCalled();
    expect(mockTx.payrollRun.update).not.toHaveBeenCalled();
    expect(mockTx.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: APPROVAL_REQUEST_ID },
      data: {
        callback_status: 'skipped',
        callback_error:
          'Skipped: run was in unexpected status "draft", expected "pending_approval"',
      },
    });
  });

  it('should commit deductions, generate a payslip with the canonical format, and mark the approval executed', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    // Deductions Phase 2 — checked but no rows in the fixture
    expect(mockTx.payrollDeductionApplication.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, payroll_run_id: PAYROLL_RUN_ID, committed_at: null },
      include: { staff_recurring_deduction: true },
    });

    // Payslip uses the canonical PSL-YYYYMM-NNNNNN format from the shared formatter
    expect(mockTx.payslip.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        issued_by_user_id: USER_ID,
        payroll_entry_id: ENTRY_ID,
        payslip_number: 'PSL-202603-000001',
        tenant_id: TENANT_ID,
      }),
    });

    // Run finalised with totals aggregated from pre-computed entry columns
    const runUpdateCall = mockTx.payrollRun.update.mock.calls[0]?.[0];
    expect(runUpdateCall?.data.status).toBe('finalised');
    expect(runUpdateCall?.data.headcount).toBe(1);
    expect((runUpdateCall?.data.total_pay as Decimal).toString()).toBe('3000');

    // Approval marked executed
    expect(mockTx.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: APPROVAL_REQUEST_ID },
      data: {
        status: 'executed',
        executed_at: expect.any(Date),
        callback_status: 'executed',
        callback_error: null,
      },
    });
  });

  it('should be idempotent when a payslip already exists for the entry', async () => {
    const mockTx = buildMockTx();
    mockTx.payrollEntry.findMany.mockResolvedValue([
      buildEntry({ payslip: { id: 'pre-existing-payslip' } }),
    ]);
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.payslip.create).not.toHaveBeenCalled();
    // Run is still updated to finalised
    const runUpdateCall = mockTx.payrollRun.update.mock.calls[0]?.[0];
    expect(runUpdateCall?.data.status).toBe('finalised');
  });

  it('should commit a scheduled deduction application exactly once', async () => {
    const mockTx = buildMockTx();
    mockTx.payrollDeductionApplication.findMany.mockResolvedValue([
      {
        id: 'dedapp-1',
        applied_amount: new Decimal(100),
        staff_recurring_deduction: {
          id: 'ded-1',
          remaining_amount: new Decimal(500),
          months_remaining: 5,
        },
      },
    ]);
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.staffRecurringDeduction.update).toHaveBeenCalledWith({
      where: { id: 'ded-1' },
      data: {
        remaining_amount: '400',
        months_remaining: 4,
        active: true,
      },
    });
    expect(mockTx.payrollDeductionApplication.update).toHaveBeenCalledWith({
      where: { id: 'dedapp-1' },
      data: { committed_at: expect.any(Date) },
    });
  });

  it('should propagate database errors (not swallow them)', async () => {
    const mockTx = buildMockTx();
    mockTx.payrollEntry.findMany.mockRejectedValue(new Error('DB connection lost'));
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await expect(processor.process(buildJob())).rejects.toThrow('DB connection lost');
  });
});
