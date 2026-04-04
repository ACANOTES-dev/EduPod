import { Decimal } from '@prisma/client/runtime/library';
import { Job } from 'bullmq';

import {
  type ApprovalCallbackPayload,
  PAYROLL_APPROVAL_CALLBACK_JOB,
  PayrollApprovalCallbackProcessor,
} from './approval-callback.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const APPROVAL_REQUEST_ID = '22222222-2222-2222-2222-222222222222';
const PAYROLL_RUN_ID = '33333333-3333-3333-3333-333333333333';
const ENTRY_ID = '44444444-4444-4444-4444-444444444444';
const USER_ID = '55555555-5555-5555-5555-555555555555';

function buildEntry() {
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
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        basic_pay: new Decimal(3000),
        bonus_pay: new Decimal(0),
        classes_taught: null,
        days_worked: 20,
        total_pay: new Decimal(3000),
      }),
      update: jest.fn().mockResolvedValue({ id: ENTRY_ID }),
    },
    payrollRun: {
      findFirst: jest.fn().mockResolvedValue({
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

describe('PayrollApprovalCallbackProcessor', () => {
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
        callback_error: 'Self-healed: payroll run already in status "finalised"',
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
          'Skipped: payroll run was in unexpected status "draft", expected "pending_approval"',
      },
    });
  });

  it('should finalise the payroll run, generate a payslip, and mark the approval executed', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    const entryUpdateCall = mockTx.payrollEntry.update.mock.calls[0]?.[0];
    const runUpdateCall = mockTx.payrollRun.update.mock.calls[0]?.[0];
    const totalPay = runUpdateCall?.data.total_pay as Decimal;

    expect(entryUpdateCall?.data.basic_pay.toString()).toBe('3000');
    expect(entryUpdateCall?.data.total_pay.toString()).toBe('3000');
    expect(mockTx.payslip.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        issued_by_user_id: USER_ID,
        payroll_entry_id: ENTRY_ID,
        payslip_number: 'PS-202603-00001',
        tenant_id: TENANT_ID,
      }),
    });
    expect(totalPay.toString()).toBe('3000');
    expect(runUpdateCall?.data.status).toBe('finalised');
    expect(runUpdateCall?.data.headcount).toBe(1);
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

  it('should be idempotent when a payslip already exists for the payroll entry', async () => {
    const mockTx = buildMockTx();
    mockTx.payslip.findFirst.mockResolvedValue({ id: 'existing-payslip' });
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.payslip.create).not.toHaveBeenCalled();
    expect(mockTx.payrollRun.update).toHaveBeenCalled();
    expect(mockTx.approvalRequest.update).toHaveBeenCalled();
  });

  // ─── Failure contract tests ───────────────────────────────────────────────

  it('should throw when target entity is not found', async () => {
    const mockTx = buildMockTx();
    mockTx.payrollRun.findFirst.mockResolvedValue(null);
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await expect(processor.process(buildJob())).rejects.toThrow(
      `Payroll run ${PAYROLL_RUN_ID} not found for tenant ${TENANT_ID}`,
    );
  });

  it('should propagate database errors (not swallow them)', async () => {
    const mockTx = buildMockTx();
    mockTx.payrollRun.update.mockRejectedValue(new Error('DB connection lost'));
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await expect(processor.process(buildJob())).rejects.toThrow('DB connection lost');
  });

  it('should throw when salaried entry has no snapshot_base_salary', async () => {
    const mockTx = buildMockTx();
    const entry = buildEntry();
    entry.snapshot_base_salary = null as unknown as Decimal;
    entry.compensation_type = 'salaried';
    mockTx.payrollEntry.findMany.mockResolvedValue([entry]);
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await expect(processor.process(buildJob())).rejects.toThrow(
      `Entry ${ENTRY_ID} is salaried but has no snapshot_base_salary`,
    );
  });

  it('should calculate per_class correctly with bonus classes', async () => {
    const mockTx = buildMockTx();
    const perClassEntry = {
      ...buildEntry(),
      classes_taught: 12,
      compensation_type: 'per_class',
      snapshot_assigned_class_count: 10,
      snapshot_base_salary: null,
      snapshot_bonus_class_rate: new Decimal(50),
      snapshot_per_class_rate: new Decimal(100),
    };
    mockTx.payrollEntry.findMany.mockResolvedValue([perClassEntry]);
    const processor = new PayrollApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    // basic_pay = per_class_rate * min(classes_taught, assigned) = 100 * 10 = 1000
    // bonus_pay = bonus_class_rate * extra_classes = 50 * 2 = 100
    const entryUpdateCall = mockTx.payrollEntry.update.mock.calls[0]?.[0] as {
      data: { basic_pay: Decimal; bonus_pay: Decimal; total_pay: Decimal };
    };
    expect(entryUpdateCall.data.basic_pay.toString()).toBe('1000');
    expect(entryUpdateCall.data.bonus_pay.toString()).toBe('100');
    expect(entryUpdateCall.data.total_pay.toString()).toBe('1100');
  });
});
