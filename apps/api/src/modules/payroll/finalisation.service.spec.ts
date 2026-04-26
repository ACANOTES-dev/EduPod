import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Decimal from 'decimal.js';

import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';

import { CalculationService } from './calculation.service';
import { FinalisationService } from './finalisation.service';
import { PayrollDeductionsService } from './payroll-deductions.service';
import { PayrollInputResolver } from './payroll-input-resolver.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const ACTOR_USER_ID = '33333333-3333-3333-3333-333333333333';
const ENTRY_ID = '44444444-4444-4444-4444-444444444444';
const STAFF_PROFILE_ID = '55555555-5555-5555-5555-555555555555';

// Mock createRlsClient — runs the callback inline against the mock tx
const mockTx = {
  payrollRun: {
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    update: jest.fn(),
  },
  payrollEntry: {
    update: jest.fn(),
  },
  payslip: {
    create: jest.fn(),
  },
  approvalRequest: {
    update: jest.fn(),
  },
  tenantBranding: {
    findUnique: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  tenantSequence: {
    upsert: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(() => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  })),
}));

describe('FinalisationService', () => {
  let service: FinalisationService;

  const mockPrisma = {} as unknown as PrismaService;

  const mockResolver = {
    resolveForRun: jest.fn(),
  };

  const mockEngine = {
    compute: jest.fn(),
  };

  const mockDeductions = {
    commitApplications: jest.fn(),
  };

  const mockApprovals = {} as unknown as ApprovalRequestsService;

  const mockEncryption = {
    decrypt: jest.fn(() => '1234567890'),
  } as unknown as EncryptionService;

  const buildEntry = (overrides: Record<string, unknown> = {}) => ({
    id: ENTRY_ID,
    staff_profile_id: STAFF_PROFILE_ID,
    compensation_type: 'salaried' as const,
    snapshot_base_salary: new Decimal(3000),
    snapshot_per_class_rate: null,
    snapshot_assigned_class_count: null,
    snapshot_bonus_day_multiplier: null,
    days_worked: 20,
    classes_taught: null,
    basic_pay: new Decimal(3000),
    bonus_pay: new Decimal(0),
    gross_pay: new Decimal(3000),
    total_deductions: new Decimal(0),
    net_pay: new Decimal(3000),
    allowances_total: new Decimal(0),
    deductions_total: new Decimal(0),
    adjustments_total: new Decimal(0),
    one_off_total: new Decimal(0),
    payslip: null,
    staff_profile: {
      staff_number: 'STF-001',
      bank_account_number_encrypted: null,
      bank_encryption_key_ref: null,
      user: { first_name: 'Amina', last_name: 'OBrien' },
    },
    ...overrides,
  });

  const buildCalcInput = () => ({
    compensationType: 'salaried' as const,
    baseSalary: new Decimal(3000),
    daysWorked: new Decimal(20),
    totalWorkingDays: 22,
    perClassRate: null,
    classesDelivered: 0,
    bonusClasses: 0,
    bonusClassMultiplier: null,
    allowancesTotal: new Decimal(0),
    oneOffPositiveTotal: new Decimal(0),
    oneOffNegativeTotal: new Decimal(0),
    adjustmentPositiveTotal: new Decimal(0),
    adjustmentNegativeTotal: new Decimal(0),
    scheduledDeductionsTotal: new Decimal(0),
  });

  const buildCalcResult = () => ({
    basePay: new Decimal('2727.27'),
    bonusPay: new Decimal(0),
    grossPay: new Decimal('2727.27'),
    allowancesTotal: new Decimal(0),
    deductionsTotal: new Decimal(0),
    adjustmentsTotal: new Decimal(0),
    oneOffTotal: new Decimal(0),
    totalDeductions: new Decimal(0),
    netPay: new Decimal('2727.27'),
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        FinalisationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PayrollInputResolver, useValue: mockResolver },
        { provide: CalculationService, useValue: mockEngine },
        { provide: PayrollDeductionsService, useValue: mockDeductions },
        { provide: ApprovalRequestsService, useValue: mockApprovals },
        { provide: EncryptionService, useValue: mockEncryption },
      ],
    }).compile();

    service = module.get(FinalisationService);

    // Sensible defaults so the happy path runs
    mockTx.payrollRun.findFirstOrThrow.mockResolvedValue({
      id: RUN_ID,
      tenant_id: TENANT_ID,
      period_year: 2026,
      period_month: 4,
      total_working_days: 22,
      entries: [buildEntry()],
    });
    mockTx.tenantBranding.findUnique.mockResolvedValue({ payslip_prefix: 'PSL' });
    mockTx.tenant.findUnique.mockResolvedValue({ currency_code: 'USD' });
    mockTx.tenantSequence.upsert.mockResolvedValue({ current_value: 1n });
    mockTx.payrollEntry.update.mockResolvedValue({ id: ENTRY_ID });
    mockTx.payslip.create.mockResolvedValue({ id: 'payslip-1' });
    mockTx.payrollRun.update.mockResolvedValue({ id: RUN_ID });
    mockTx.approvalRequest.update.mockResolvedValue({ id: 'approval-1' });
  });

  describe('finaliseAtomic — preconditions', () => {
    it('should throw NotFoundException when run does not exist', async () => {
      mockTx.payrollRun.findFirst.mockResolvedValue(null);

      await expect(
        service.finaliseAtomic({
          tenantId: TENANT_ID,
          runId: RUN_ID,
          actorUserId: ACTOR_USER_ID,
          expectedFromState: 'draft',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should self-heal — second invocation on a finalised run is a no-op', async () => {
      mockTx.payrollRun.findFirst.mockResolvedValue({ status: 'finalised' });

      await expect(
        service.finaliseAtomic({
          tenantId: TENANT_ID,
          runId: RUN_ID,
          actorUserId: ACTOR_USER_ID,
          expectedFromState: 'pending_approval',
        }),
      ).resolves.toBeUndefined();

      expect(mockResolver.resolveForRun).not.toHaveBeenCalled();
      expect(mockTx.payrollEntry.update).not.toHaveBeenCalled();
      expect(mockDeductions.commitApplications).not.toHaveBeenCalled();
      expect(mockTx.payslip.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when run is in an unexpected state', async () => {
      mockTx.payrollRun.findFirst.mockResolvedValue({ status: 'cancelled' });

      await expect(
        service.finaliseAtomic({
          tenantId: TENANT_ID,
          runId: RUN_ID,
          actorUserId: ACTOR_USER_ID,
          expectedFromState: 'draft',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('finaliseAtomic — happy path', () => {
    beforeEach(() => {
      mockTx.payrollRun.findFirst.mockResolvedValue({ status: 'draft', approval_request_id: null });
      const inputs = new Map();
      inputs.set(ENTRY_ID, buildCalcInput());
      mockResolver.resolveForRun.mockResolvedValue(inputs);
      mockEngine.compute.mockReturnValue(buildCalcResult());
    });

    it('should re-resolve inputs, compute totals, persist new entry columns, commit deductions, generate payslips, and finalise the run', async () => {
      await service.finaliseAtomic({
        tenantId: TENANT_ID,
        runId: RUN_ID,
        actorUserId: ACTOR_USER_ID,
        expectedFromState: 'draft',
      });

      expect(mockResolver.resolveForRun).toHaveBeenCalledWith(TENANT_ID, RUN_ID, mockTx);
      expect(mockEngine.compute).toHaveBeenCalledWith(
        expect.objectContaining({ compensationType: 'salaried' }),
      );

      // New entry columns persisted
      expect(mockTx.payrollEntry.update).toHaveBeenCalledWith({
        where: { id: ENTRY_ID },
        data: expect.objectContaining({
          gross_pay: '2727.27',
          net_pay: '2727.27',
          basic_pay: '2727.27', // legacy column still populated
        }),
      });

      // Deductions committed (Phase 2)
      expect(mockDeductions.commitApplications).toHaveBeenCalledWith(TENANT_ID, RUN_ID, mockTx);

      // Payslip created with canonical PSL-202604-000001 number
      expect(mockTx.payslip.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          payslip_number: 'PSL-202604-000001',
          payroll_entry_id: ENTRY_ID,
        }),
      });

      // Run flipped to finalised
      expect(mockTx.payrollRun.update).toHaveBeenCalledWith({
        where: { id: RUN_ID },
        data: expect.objectContaining({
          status: 'finalised',
          finalised_by_user_id: ACTOR_USER_ID,
          headcount: 1,
        }),
      });
    });

    it('should mark the supplied approvalRequestId as executed (worker path)', async () => {
      await service.finaliseAtomic({
        tenantId: TENANT_ID,
        runId: RUN_ID,
        actorUserId: ACTOR_USER_ID,
        expectedFromState: 'draft',
        approvalRequestId: 'approval-explicit',
      });

      expect(mockTx.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: 'approval-explicit' },
        data: expect.objectContaining({ status: 'executed', callback_status: 'executed' }),
      });
    });
  });

  describe('finaliseAtomic — payslip idempotency', () => {
    it('should skip payslip creation for entries that already have a payslip', async () => {
      mockTx.payrollRun.findFirst.mockResolvedValue({ status: 'draft', approval_request_id: null });
      mockTx.payrollRun.findFirstOrThrow.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        period_year: 2026,
        period_month: 4,
        total_working_days: 22,
        entries: [buildEntry({ payslip: { id: 'existing-payslip' } })],
      });
      const inputs = new Map();
      inputs.set(ENTRY_ID, buildCalcInput());
      mockResolver.resolveForRun.mockResolvedValue(inputs);
      mockEngine.compute.mockReturnValue(buildCalcResult());

      await service.finaliseAtomic({
        tenantId: TENANT_ID,
        runId: RUN_ID,
        actorUserId: ACTOR_USER_ID,
        expectedFromState: 'draft',
      });

      expect(mockTx.payslip.create).not.toHaveBeenCalled();
    });
  });
});
