import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuditLogService } from '../audit-log/audit-log.service';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';

import { AdmissionsFinanceBridgeService } from './admissions-finance-bridge.service';
import { AdmissionsPaymentService } from './admissions-payment.service';
import { ApplicationConversionService } from './application-conversion.service';
import { ApplicationStateMachineService } from './application-state-machine.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT_ID = '99999999-9999-9999-9999-999999999999';
const APPLICATION_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_USER_ID = '66666666-6666-6666-6666-666666666666';
const PRINCIPAL_MEMBERSHIP_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OVERRIDE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const DEFAULT_ADMISSIONS_SETTINGS = {
  requireApprovalForAcceptance: true,
  earlyBirdDiscounts: [] as unknown[],
  cashPaymentDeadlineDays: 14,
  upfront_percentage: 100,
  payment_window_days: 7,
  max_application_horizon_years: 2,
  allow_cash: true,
  allow_bank_transfer: true,
  bank_iban: 'IE12BOFI90001234567890',
  require_override_approval_role: 'school_principal' as const,
};

interface LockedRow {
  id: string;
  tenant_id: string;
  status: string;
  payment_amount_cents: number | null;
  currency_code: string | null;
  reviewed_by_user_id: string | null;
}

function lockedRow(overrides: Partial<LockedRow> = {}): LockedRow {
  return {
    id: APPLICATION_ID,
    tenant_id: TENANT_ID,
    status: 'conditional_approval',
    payment_amount_cents: 700_00,
    currency_code: 'EUR',
    reviewed_by_user_id: ADMIN_USER_ID,
    ...overrides,
  };
}

interface MockTx {
  application: { update: jest.Mock };
  applicationNote: { create: jest.Mock };
  admissionOverride: { create: jest.Mock };
  $queryRaw: jest.Mock;
}

function buildMockTx(): MockTx {
  return {
    application: { update: jest.fn().mockResolvedValue({}) },
    applicationNote: { create: jest.fn().mockResolvedValue({}) },
    admissionOverride: {
      create: jest.fn().mockResolvedValue({ id: OVERRIDE_ID }),
    },
    $queryRaw: jest.fn(),
  };
}

function buildRlsStub(tx: MockTx) {
  return {
    $transaction: jest.fn(async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  };
}

// ─── Harness ─────────────────────────────────────────────────────────────────

function buildService() {
  const prisma = {
    admissionOverride: { findMany: jest.fn(), count: jest.fn() },
  } as unknown as PrismaService;

  const conversionService = {
    convertToStudent: jest.fn().mockResolvedValue({
      student_id: STUDENT_ID,
      household_id: 'hh',
      primary_parent_id: 'p1',
      secondary_parent_id: null,
      created: true,
    }),
  } as unknown as jest.Mocked<ApplicationConversionService>;

  const stateMachine = {
    markApproved: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<ApplicationStateMachineService>;

  const settingsService = {
    getModuleSettings: jest.fn().mockResolvedValue(DEFAULT_ADMISSIONS_SETTINGS),
  } as unknown as jest.Mocked<SettingsService>;

  const auditLogService = {
    write: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AuditLogService>;

  const rbacReadFacade = {
    findMembershipByUserWithPermissions: jest.fn(),
  } as unknown as jest.Mocked<RbacReadFacade>;

  const financeBridge = {
    createFinancialRecords: jest.fn().mockResolvedValue({
      invoiceId: 'inv-1',
      invoiceNumber: 'INV-202604-0001',
      paymentId: 'pay-1',
      invoiceTotalCents: 600000,
      paymentCents: 600000,
      balanceCents: 0,
    }),
  } as unknown as jest.Mocked<AdmissionsFinanceBridgeService>;

  const service = new AdmissionsPaymentService(
    prisma,
    conversionService,
    stateMachine,
    settingsService,
    auditLogService,
    rbacReadFacade,
    financeBridge,
  );

  return {
    service,
    prisma,
    conversionService,
    stateMachine,
    settingsService,
    auditLogService,
    rbacReadFacade,
  };
}

describe('AdmissionsPaymentService', () => {
  const mockedCreateRlsClient = createRlsClient as jest.MockedFunction<typeof createRlsClient>;
  let tx: MockTx;

  beforeEach(() => {
    tx = buildMockTx();
    mockedCreateRlsClient.mockReturnValue(buildRlsStub(tx) as never);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── recordCashPayment ──────────────────────────────────────────────────────

  describe('recordCashPayment', () => {
    it('approves the application when the paid amount meets the expected upfront', async () => {
      const harness = buildService();
      tx.$queryRaw.mockResolvedValueOnce([lockedRow()]);

      const result = await harness.service.recordCashPayment(TENANT_ID, APPLICATION_ID, {
        actingUserId: ADMIN_USER_ID,
        amountCents: 700_00,
        receiptNumber: 'R-42',
      });

      expect(result).toEqual({ approved: true, student_id: STUDENT_ID });
      expect(harness.conversionService.convertToStudent).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          tenantId: TENANT_ID,
          applicationId: APPLICATION_ID,
          triggerUserId: ADMIN_USER_ID,
        }),
      );
      expect(harness.stateMachine.markApproved).toHaveBeenCalledWith(
        TENANT_ID,
        APPLICATION_ID,
        expect.objectContaining({
          actingUserId: ADMIN_USER_ID,
          paymentSource: 'cash',
          overrideRecordId: null,
        }),
        tx,
      );
      expect(tx.applicationNote.create).toHaveBeenCalled();
      expect(harness.auditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ADMIN_USER_ID,
        'application',
        APPLICATION_ID,
        'admissions_payment_cash',
        expect.objectContaining({ amount_cents: 700_00, receipt_number: 'R-42', channel: 'cash' }),
        null,
      );
    });

    it('accepts an overpayment without treating the excess as a credit', async () => {
      const harness = buildService();
      tx.$queryRaw.mockResolvedValueOnce([lockedRow({ payment_amount_cents: 700_00 })]);

      const result = await harness.service.recordCashPayment(TENANT_ID, APPLICATION_ID, {
        actingUserId: ADMIN_USER_ID,
        amountCents: 750_00,
      });

      expect(result.approved).toBe(true);
    });

    it('throws PAYMENT_BELOW_THRESHOLD with structured detail when underpaid', async () => {
      const harness = buildService();
      tx.$queryRaw.mockResolvedValueOnce([lockedRow({ payment_amount_cents: 700_00 })]);

      await expect(
        harness.service.recordCashPayment(TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          amountCents: 500_00,
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'PAYMENT_BELOW_THRESHOLD',
          details: expect.objectContaining({ expected_cents: 700_00, received_cents: 500_00 }),
        },
      });
      expect(harness.conversionService.convertToStudent).not.toHaveBeenCalled();
    });

    it('rejects with INVALID_STATUS when application is not in conditional_approval', async () => {
      const harness = buildService();
      tx.$queryRaw.mockResolvedValueOnce([lockedRow({ status: 'ready_to_admit' })]);

      await expect(
        harness.service.recordCashPayment(TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          amountCents: 700_00,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects with APPLICATION_NOT_FOUND when the row-lock query returns empty', async () => {
      const harness = buildService();
      tx.$queryRaw.mockResolvedValueOnce([]);

      await expect(
        harness.service.recordCashPayment(TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          amountCents: 700_00,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects with CASH_PAYMENT_DISABLED when tenant settings forbid cash', async () => {
      const harness = buildService();
      (harness.settingsService.getModuleSettings as jest.Mock).mockResolvedValueOnce({
        ...DEFAULT_ADMISSIONS_SETTINGS,
        allow_cash: false,
      });

      await expect(
        harness.service.recordCashPayment(TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          amountCents: 700_00,
        }),
      ).rejects.toMatchObject({ response: { code: 'CASH_PAYMENT_DISABLED' } });
      expect(mockedCreateRlsClient).not.toHaveBeenCalled();
    });

    it('scopes the row-lock SQL to the caller tenant (cross-tenant leakage guard)', async () => {
      const harness = buildService();
      tx.$queryRaw.mockResolvedValueOnce([]);

      await expect(
        harness.service.recordCashPayment(OTHER_TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          amountCents: 700_00,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockedCreateRlsClient).toHaveBeenCalledWith(expect.anything(), {
        tenant_id: OTHER_TENANT_ID,
      });
    });
  });

  // ─── recordBankTransfer ────────────────────────────────────────────────────

  describe('recordBankTransfer', () => {
    it('approves the application on full payment and stores the transfer reference in the note', async () => {
      const harness = buildService();
      tx.$queryRaw.mockResolvedValueOnce([lockedRow()]);

      const result = await harness.service.recordBankTransfer(TENANT_ID, APPLICATION_ID, {
        actingUserId: ADMIN_USER_ID,
        amountCents: 700_00,
        transferReference: 'TRX-12345',
        transferDate: '2026-04-11T12:00:00.000Z',
      });

      expect(result.approved).toBe(true);
      expect(tx.applicationNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            note: expect.stringContaining('TRX-12345'),
          }),
        }),
      );
      expect(harness.stateMachine.markApproved).toHaveBeenCalledWith(
        TENANT_ID,
        APPLICATION_ID,
        expect.objectContaining({ paymentSource: 'bank_transfer', overrideRecordId: null }),
        tx,
      );
    });

    it('throws BANK_TRANSFER_DISABLED when tenant settings forbid bank transfer', async () => {
      const harness = buildService();
      (harness.settingsService.getModuleSettings as jest.Mock).mockResolvedValueOnce({
        ...DEFAULT_ADMISSIONS_SETTINGS,
        allow_bank_transfer: false,
      });

      await expect(
        harness.service.recordBankTransfer(TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          amountCents: 700_00,
          transferReference: 'REF',
          transferDate: '2026-04-11T00:00:00Z',
        }),
      ).rejects.toMatchObject({ response: { code: 'BANK_TRANSFER_DISABLED' } });
    });

    it('applies the same below-threshold guard as cash', async () => {
      const harness = buildService();
      tx.$queryRaw.mockResolvedValueOnce([lockedRow({ payment_amount_cents: 700_00 })]);

      await expect(
        harness.service.recordBankTransfer(TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          amountCents: 699_99,
          transferReference: 'REF',
          transferDate: '2026-04-11T00:00:00Z',
        }),
      ).rejects.toMatchObject({ response: { code: 'PAYMENT_BELOW_THRESHOLD' } });
    });
  });

  // ─── forceApproveWithOverride ──────────────────────────────────────────────

  describe('forceApproveWithOverride', () => {
    function mockMembershipWithRoles(
      harness: ReturnType<typeof buildService>,
      roleKeys: string[],
      membershipStatus: 'active' | 'invited' | 'left' = 'active',
    ) {
      (harness.rbacReadFacade.findMembershipByUserWithPermissions as jest.Mock).mockResolvedValue({
        id: PRINCIPAL_MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: ADMIN_USER_ID,
        membership_status: membershipStatus,
        membership_roles: roleKeys.map((role_key) => ({
          membership_id: PRINCIPAL_MEMBERSHIP_ID,
          role_id: `role-${role_key}`,
          tenant_id: TENANT_ID,
          role: {
            id: `role-${role_key}`,
            tenant_id: TENANT_ID,
            role_key,
            display_name: role_key,
            is_system_role: true,
            role_tier: 'leadership',
            role_permissions: [],
          },
        })),
      });
    }

    it('writes an override row and approves the application when the acting user is a principal', async () => {
      const harness = buildService();
      mockMembershipWithRoles(harness, ['school_principal']);
      tx.$queryRaw.mockResolvedValueOnce([lockedRow()]);

      const result = await harness.service.forceApproveWithOverride(TENANT_ID, APPLICATION_ID, {
        actingUserId: ADMIN_USER_ID,
        overrideType: 'full_waiver',
        actualAmountCollectedCents: 0,
        justification: 'Family lost income due to redundancy — board approved',
      });

      expect(result).toEqual({
        approved: true,
        student_id: STUDENT_ID,
        override_id: OVERRIDE_ID,
      });
      expect(tx.admissionOverride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            application_id: APPLICATION_ID,
            approved_by_user_id: ADMIN_USER_ID,
            expected_amount_cents: 700_00,
            actual_amount_cents: 0,
            override_type: 'full_waiver',
          }),
        }),
      );
      expect(tx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { override_record_id: OVERRIDE_ID },
        }),
      );
      expect(harness.stateMachine.markApproved).toHaveBeenCalledWith(
        TENANT_ID,
        APPLICATION_ID,
        expect.objectContaining({
          paymentSource: 'override',
          overrideRecordId: OVERRIDE_ID,
        }),
        tx,
      );
      expect(harness.auditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        ADMIN_USER_ID,
        'application',
        APPLICATION_ID,
        'admissions_override',
        expect.objectContaining({
          override_id: OVERRIDE_ID,
          override_type: 'full_waiver',
          expected_cents: 700_00,
          actual_cents: 0,
        }),
        null,
      );
    });

    it('rejects JUSTIFICATION_TOO_SHORT when justification is under 20 characters', async () => {
      const harness = buildService();

      await expect(
        harness.service.forceApproveWithOverride(TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          overrideType: 'partial_waiver',
          actualAmountCollectedCents: 50_00,
          justification: 'short',
        }),
      ).rejects.toMatchObject({ response: { code: 'JUSTIFICATION_TOO_SHORT' } });
      expect(harness.rbacReadFacade.findMembershipByUserWithPermissions).not.toHaveBeenCalled();
    });

    it('rejects OVERRIDE_ROLE_REQUIRED when the acting user holds no accepted role', async () => {
      const harness = buildService();
      mockMembershipWithRoles(harness, ['teacher']);

      await expect(
        harness.service.forceApproveWithOverride(TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          overrideType: 'full_waiver',
          actualAmountCollectedCents: 0,
          justification: 'Long enough justification to pass the min-length guard',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.admissionOverride.create).not.toHaveBeenCalled();
    });

    it('rejects OVERRIDE_ROLE_REQUIRED when the membership is missing or inactive', async () => {
      const harness = buildService();
      mockMembershipWithRoles(harness, ['school_principal'], 'invited');
      await expect(
        harness.service.forceApproveWithOverride(TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          overrideType: 'full_waiver',
          actualAmountCollectedCents: 0,
          justification: 'Long enough justification to pass the min-length guard',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      (
        harness.rbacReadFacade.findMembershipByUserWithPermissions as jest.Mock
      ).mockResolvedValueOnce(null);
      await expect(
        harness.service.forceApproveWithOverride(TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          overrideType: 'deferred_payment',
          actualAmountCollectedCents: 100_00,
          justification: 'Parent agreed to a 30-day deferral per principal',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks override on applications that are not in conditional_approval', async () => {
      const harness = buildService();
      mockMembershipWithRoles(harness, ['school_principal']);
      tx.$queryRaw.mockResolvedValueOnce([lockedRow({ status: 'approved' })]);

      await expect(
        harness.service.forceApproveWithOverride(TENANT_ID, APPLICATION_ID, {
          actingUserId: ADMIN_USER_ID,
          overrideType: 'full_waiver',
          actualAmountCollectedCents: 0,
          justification: 'Long enough justification to pass the min-length guard',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('accepts school_owner role even when principal is configured as the required role', async () => {
      const harness = buildService();
      mockMembershipWithRoles(harness, ['school_owner']);
      tx.$queryRaw.mockResolvedValueOnce([lockedRow()]);

      const result = await harness.service.forceApproveWithOverride(TENANT_ID, APPLICATION_ID, {
        actingUserId: ADMIN_USER_ID,
        overrideType: 'deferred_payment',
        actualAmountCollectedCents: 350_00,
        justification: 'Owner authorised 30-day deferral per email thread',
      });

      expect(result.approved).toBe(true);
    });
  });

  // ─── listOverrides ─────────────────────────────────────────────────────────

  describe('listOverrides', () => {
    it('returns tenant-scoped rows with a meta block', async () => {
      const harness = buildService();
      (harness.prisma.admissionOverride.findMany as jest.Mock).mockResolvedValue([
        {
          id: OVERRIDE_ID,
          application_id: APPLICATION_ID,
          expected_amount_cents: 700_00,
          actual_amount_cents: 0,
          justification: 'just',
          override_type: 'full_waiver',
          created_at: new Date('2026-04-11T10:00:00Z'),
          approved_by_user_id: ADMIN_USER_ID,
          application: {
            application_number: 'APP-202604-000001',
            student_first_name: 'Alice',
            student_last_name: 'Applicant',
          },
          approved_by: { first_name: 'Peter', last_name: 'Principal' },
        },
      ]);
      (harness.prisma.admissionOverride.count as jest.Mock).mockResolvedValue(1);

      const result = await harness.service.listOverrides(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: OVERRIDE_ID,
        application_number: 'APP-202604-000001',
        approved_by_name: 'Peter Principal',
      });
      expect((harness.prisma.admissionOverride.findMany as jest.Mock).mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ where: { tenant_id: TENANT_ID } }),
      );
    });

    it('scopes reads to the caller tenant and does not leak other tenants', async () => {
      const harness = buildService();
      (harness.prisma.admissionOverride.findMany as jest.Mock).mockResolvedValue([]);
      (harness.prisma.admissionOverride.count as jest.Mock).mockResolvedValue(0);

      await harness.service.listOverrides(OTHER_TENANT_ID, { page: 2, pageSize: 10 });

      expect((harness.prisma.admissionOverride.findMany as jest.Mock).mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          where: { tenant_id: OTHER_TENANT_ID },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('applies approved_by_user_id filter to where clause', async () => {
      const harness = buildService();
      (harness.prisma.admissionOverride.findMany as jest.Mock).mockResolvedValue([]);
      (harness.prisma.admissionOverride.count as jest.Mock).mockResolvedValue(0);

      await harness.service.listOverrides(TENANT_ID, {
        page: 1,
        pageSize: 20,
        approved_by_user_id: ADMIN_USER_ID,
      });

      expect((harness.prisma.admissionOverride.findMany as jest.Mock).mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, approved_by_user_id: ADMIN_USER_ID },
        }),
      );
      expect((harness.prisma.admissionOverride.count as jest.Mock).mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, approved_by_user_id: ADMIN_USER_ID },
        }),
      );
    });

    it('applies created_at_from and created_at_to date range filters', async () => {
      const harness = buildService();
      (harness.prisma.admissionOverride.findMany as jest.Mock).mockResolvedValue([]);
      (harness.prisma.admissionOverride.count as jest.Mock).mockResolvedValue(0);

      const from = '2026-04-01T00:00:00.000Z';
      const to = '2026-04-10T23:59:59.999Z';

      await harness.service.listOverrides(TENANT_ID, {
        page: 1,
        pageSize: 20,
        created_at_from: from,
        created_at_to: to,
      });

      const findManyArgs = (harness.prisma.admissionOverride.findMany as jest.Mock).mock
        .calls[0]?.[0];
      expect(findManyArgs.where.tenant_id).toBe(TENANT_ID);
      expect(findManyArgs.where.created_at).toEqual({
        gte: new Date(from),
        lte: new Date(to),
      });
    });

    it('applies only created_at_from when created_at_to is not provided', async () => {
      const harness = buildService();
      (harness.prisma.admissionOverride.findMany as jest.Mock).mockResolvedValue([]);
      (harness.prisma.admissionOverride.count as jest.Mock).mockResolvedValue(0);

      const from = '2026-04-01T00:00:00.000Z';

      await harness.service.listOverrides(TENANT_ID, {
        page: 1,
        pageSize: 20,
        created_at_from: from,
      });

      const findManyArgs = (harness.prisma.admissionOverride.findMany as jest.Mock).mock
        .calls[0]?.[0];
      expect(findManyArgs.where.created_at).toEqual({ gte: new Date(from) });
    });

    it('combines all filters when provided together', async () => {
      const harness = buildService();
      (harness.prisma.admissionOverride.findMany as jest.Mock).mockResolvedValue([]);
      (harness.prisma.admissionOverride.count as jest.Mock).mockResolvedValue(0);

      const from = '2026-04-01T00:00:00.000Z';
      const to = '2026-04-10T23:59:59.999Z';

      await harness.service.listOverrides(TENANT_ID, {
        page: 1,
        pageSize: 20,
        approved_by_user_id: ADMIN_USER_ID,
        created_at_from: from,
        created_at_to: to,
      });

      const findManyArgs = (harness.prisma.admissionOverride.findMany as jest.Mock).mock
        .calls[0]?.[0];
      expect(findManyArgs.where).toEqual({
        tenant_id: TENANT_ID,
        approved_by_user_id: ADMIN_USER_ID,
        created_at: { gte: new Date(from), lte: new Date(to) },
      });
    });
  });
});
