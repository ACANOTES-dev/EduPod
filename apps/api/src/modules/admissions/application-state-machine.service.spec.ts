import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Application, ApplicationStatus } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';
import { SequenceService } from '../sequence/sequence.service';

import { AdmissionsCapacityService } from './admissions-capacity.service';
import {
  ADMISSIONS_APPLICATION_RECEIVED_JOB,
  ADMISSIONS_PAYMENT_LINK_JOB,
  ApplicationStateMachineService,
} from './application-state-machine.service';
import { FinanceFeesFacade } from './finance-fees.facade';

// The state machine service opens an RLS client internally. Mock
// createRlsClient so the tests can control the transaction callback and
// assert on the mock Prisma passed into the work.
jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const APPLICATION_ID = '22222222-2222-2222-2222-222222222222';
const FORM_DEF_ID = '33333333-3333-3333-3333-333333333333';
const ACADEMIC_YEAR_ID = '44444444-4444-4444-4444-444444444444';
const YEAR_GROUP_ID = '55555555-5555-5555-5555-555555555555';
const ADMIN_USER_ID = '66666666-6666-6666-6666-666666666666';
const PARENT_USER_ID = '77777777-7777-7777-7777-777777777777';
const PARENT_ID = '88888888-8888-8888-8888-888888888888';

const APPLY_DATE = new Date('2026-05-01T09:00:00Z');

const DEFAULT_ADMISSIONS_SETTINGS = {
  requireApprovalForAcceptance: true,
  earlyBirdDiscounts: [] as unknown[],
  cashPaymentDeadlineDays: 14,
  upfront_percentage: 100,
  payment_window_days: 7,
  max_application_horizon_years: 2,
  allow_cash: true,
  allow_bank_transfer: false,
  bank_iban: null,
  require_override_approval_role: 'school_principal' as const,
};

// ─── Mock builders ───────────────────────────────────────────────────────────

interface MockTx {
  application: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  applicationNote: { create: jest.Mock };
  parent: { findFirst: jest.Mock };
  $queryRaw: jest.Mock;
}

function buildMockTx(): MockTx {
  return {
    application: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    applicationNote: { create: jest.fn() },
    parent: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  };
}

function buildRlsStub(tx: MockTx) {
  return {
    $transaction: jest.fn(async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx)),
  };
}

function sampleApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: APPLICATION_ID,
    tenant_id: TENANT_ID,
    form_definition_id: FORM_DEF_ID,
    application_number: 'APP-202604-000001',
    submitted_by_parent_id: null,
    student_first_name: 'Alice',
    student_last_name: 'Applicant',
    date_of_birth: new Date('2018-01-01'),
    status: 'ready_to_admit',
    submitted_at: APPLY_DATE,
    reviewed_at: null,
    reviewed_by_user_id: null,
    payload_json: {},
    payment_status: 'pending',
    payment_amount: null,
    payment_amount_cents: null,
    currency_code: null,
    discount_applied: null,
    payment_deadline: null,
    stripe_payment_intent_id: null,
    stripe_checkout_session_id: null,
    rejection_reason: null,
    target_academic_year_id: ACADEMIC_YEAR_ID,
    target_year_group_id: YEAR_GROUP_ID,
    apply_date: APPLY_DATE,
    waiting_list_substatus: null,
    override_record_id: null,
    created_at: APPLY_DATE,
    updated_at: APPLY_DATE,
    ...overrides,
  } as unknown as Application;
}

// ─── Harness ─────────────────────────────────────────────────────────────────

function buildService() {
  const capacityService = {
    getAvailableSeats: jest.fn(),
  } as unknown as jest.Mocked<AdmissionsCapacityService>;

  const financeFeesFacade = {
    resolveAnnualNetFeeCents: jest.fn(),
  } as unknown as jest.Mocked<FinanceFeesFacade>;

  const sequenceService = {
    nextNumber: jest.fn().mockResolvedValue('APP-202604-000001'),
  } as unknown as jest.Mocked<SequenceService>;

  const settingsService = {
    getModuleSettings: jest.fn().mockResolvedValue(DEFAULT_ADMISSIONS_SETTINGS),
  } as unknown as jest.Mocked<SettingsService>;

  const searchIndexService = {
    indexEntity: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SearchIndexService>;

  const notificationsQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };

  const service = new ApplicationStateMachineService(
    {} as PrismaService,
    capacityService,
    financeFeesFacade,
    sequenceService,
    settingsService,
    searchIndexService,
    notificationsQueue as never,
  );

  return {
    service,
    capacityService,
    financeFeesFacade,
    sequenceService,
    settingsService,
    searchIndexService,
    notificationsQueue,
  };
}

describe('ApplicationStateMachineService', () => {
  const mockedCreateRlsClient = createRlsClient as jest.MockedFunction<typeof createRlsClient>;
  let tx: MockTx;

  beforeEach(() => {
    tx = buildMockTx();
    mockedCreateRlsClient.mockReturnValue(buildRlsStub(tx) as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── submit() ──────────────────────────────────────────────────────────────

  describe('submit', () => {
    const submitParams = {
      formDefinitionId: FORM_DEF_ID,
      studentFirstName: 'Alice',
      studentLastName: 'Applicant',
      dateOfBirth: new Date('2018-01-01'),
      targetAcademicYearId: ACADEMIC_YEAR_ID,
      targetYearGroupId: YEAR_GROUP_ID,
      payloadJson: { parent_email: 'a@b.com' },
      submittedByParentId: null,
      applyDate: APPLY_DATE,
    };

    it('routes to ready_to_admit when the year group has free seats', async () => {
      const harness = buildService();
      (harness.capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
        total_capacity: 25,
        enrolled_student_count: 10,
        conditional_approval_count: 0,
        available_seats: 15,
        configured: true,
      });
      tx.application.create.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve(sampleApplication({ status: args.data.status as ApplicationStatus })),
      );

      const result = await harness.service.submit(TENANT_ID, submitParams);

      expect(result.status).toBe('ready_to_admit');
      expect(tx.application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ready_to_admit',
            waiting_list_substatus: null,
            application_number: 'APP-202604-000001',
            tenant_id: TENANT_ID,
            target_academic_year_id: ACADEMIC_YEAR_ID,
            target_year_group_id: YEAR_GROUP_ID,
            apply_date: APPLY_DATE,
          }),
        }),
      );
      expect(harness.searchIndexService.indexEntity).toHaveBeenCalledWith(
        'applications',
        expect.objectContaining({ id: APPLICATION_ID }),
      );
      expect(harness.notificationsQueue.add).toHaveBeenCalledWith(
        ADMISSIONS_APPLICATION_RECEIVED_JOB,
        expect.objectContaining({ tenant_id: TENANT_ID, application_id: APPLICATION_ID }),
        expect.anything(),
      );
    });

    it('routes to waiting_list when the year group is configured but full', async () => {
      const harness = buildService();
      (harness.capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
        total_capacity: 25,
        enrolled_student_count: 25,
        conditional_approval_count: 0,
        available_seats: 0,
        configured: true,
      });
      tx.application.create.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve(sampleApplication({ status: args.data.status as ApplicationStatus })),
      );

      const result = await harness.service.submit(TENANT_ID, submitParams);

      expect(result.status).toBe('waiting_list');
      expect(tx.application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'waiting_list',
            waiting_list_substatus: null,
          }),
        }),
      );
    });

    it('routes to waiting_list + awaiting_year_setup when the target year is unconfigured', async () => {
      const harness = buildService();
      (harness.capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
        total_capacity: 0,
        enrolled_student_count: 0,
        conditional_approval_count: 0,
        available_seats: 0,
        configured: false,
      });
      tx.application.create.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve(
          sampleApplication({
            status: args.data.status as ApplicationStatus,
            waiting_list_substatus: args.data.waiting_list_substatus as
              | 'awaiting_year_setup'
              | null,
          }),
        ),
      );

      const result = await harness.service.submit(TENANT_ID, submitParams);

      expect(result.status).toBe('waiting_list');
      expect(result.waiting_list_substatus).toBe('awaiting_year_setup');
    });
  });

  // ─── moveToConditionalApproval() ──────────────────────────────────────────

  describe('moveToConditionalApproval', () => {
    beforeEach(() => {
      tx.$queryRaw.mockResolvedValue([
        {
          id: APPLICATION_ID,
          tenant_id: TENANT_ID,
          status: 'ready_to_admit' as ApplicationStatus,
          target_academic_year_id: ACADEMIC_YEAR_ID,
          target_year_group_id: YEAR_GROUP_ID,
        },
      ]);
    });

    it('stamps payment amount + deadline and enqueues the payment-link job', async () => {
      const harness = buildService();
      (harness.capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
        total_capacity: 25,
        enrolled_student_count: 10,
        conditional_approval_count: 0,
        available_seats: 15,
        configured: true,
      });
      (harness.financeFeesFacade.resolveAnnualNetFeeCents as jest.Mock).mockResolvedValue({
        amount_cents: 700_000,
        currency_code: 'AED',
      });
      tx.application.update.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve(sampleApplication({ ...args.data, status: 'conditional_approval' })),
      );

      const result = await harness.service.moveToConditionalApproval(
        TENANT_ID,
        APPLICATION_ID,
        ADMIN_USER_ID,
      );

      expect(result.status).toBe('conditional_approval');
      expect(tx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'conditional_approval',
            payment_amount_cents: 700_000,
            currency_code: 'AED',
            reviewed_by_user_id: ADMIN_USER_ID,
          }),
        }),
      );
      const updateCall = tx.application.update.mock.calls[0]![0] as {
        data: { payment_deadline: Date };
      };
      expect(updateCall.data.payment_deadline).toBeInstanceOf(Date);
      expect(tx.applicationNote.create).toHaveBeenCalled();
      expect(harness.notificationsQueue.add).toHaveBeenCalledWith(
        ADMISSIONS_PAYMENT_LINK_JOB,
        { tenant_id: TENANT_ID, application_id: APPLICATION_ID },
        expect.anything(),
      );
    });

    it('applies the tenant upfront_percentage to the fee total', async () => {
      const harness = buildService();
      (harness.settingsService.getModuleSettings as jest.Mock).mockResolvedValue({
        ...DEFAULT_ADMISSIONS_SETTINGS,
        upfront_percentage: 40,
      });
      (harness.capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
        total_capacity: 25,
        enrolled_student_count: 0,
        conditional_approval_count: 0,
        available_seats: 25,
        configured: true,
      });
      (harness.financeFeesFacade.resolveAnnualNetFeeCents as jest.Mock).mockResolvedValue({
        amount_cents: 1_000_000,
        currency_code: 'AED',
      });
      tx.application.update.mockResolvedValue(
        sampleApplication({ status: 'conditional_approval', payment_amount_cents: 400_000 }),
      );

      await harness.service.moveToConditionalApproval(TENANT_ID, APPLICATION_ID, ADMIN_USER_ID);

      expect(tx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payment_amount_cents: 400_000 }),
        }),
      );
    });

    it('throws CAPACITY_EXHAUSTED when no seats remain at the re-check', async () => {
      const harness = buildService();
      (harness.capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
        total_capacity: 25,
        enrolled_student_count: 20,
        conditional_approval_count: 5,
        available_seats: 0,
        configured: true,
      });

      await expect(
        harness.service.moveToConditionalApproval(TENANT_ID, APPLICATION_ID, ADMIN_USER_ID),
      ).rejects.toThrow(ConflictException);

      expect(tx.application.update).not.toHaveBeenCalled();
      expect(harness.notificationsQueue.add).not.toHaveBeenCalled();
    });

    it('throws INVALID_STATUS_TRANSITION when the application is not in ready_to_admit', async () => {
      const harness = buildService();
      tx.$queryRaw.mockResolvedValueOnce([
        {
          id: APPLICATION_ID,
          tenant_id: TENANT_ID,
          status: 'waiting_list' as ApplicationStatus,
          target_academic_year_id: ACADEMIC_YEAR_ID,
          target_year_group_id: YEAR_GROUP_ID,
        },
      ]);

      await expect(
        harness.service.moveToConditionalApproval(TENANT_ID, APPLICATION_ID, ADMIN_USER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(harness.financeFeesFacade.resolveAnnualNetFeeCents).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the row lock returns nothing', async () => {
      const harness = buildService();
      tx.$queryRaw.mockResolvedValueOnce([]);

      await expect(
        harness.service.moveToConditionalApproval(TENANT_ID, APPLICATION_ID, ADMIN_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── reject() ──────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('transitions ready_to_admit → rejected with a reason and writes a note', async () => {
      const harness = buildService();
      tx.application.findFirst.mockResolvedValue(sampleApplication({ status: 'ready_to_admit' }));
      tx.application.update.mockResolvedValue(sampleApplication({ status: 'rejected' }));

      const result = await harness.service.reject(TENANT_ID, APPLICATION_ID, {
        reason: 'Out of catchment area',
        actingUserId: ADMIN_USER_ID,
      });

      expect(result.status).toBe('rejected');
      expect(tx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'rejected',
            rejection_reason: 'Out of catchment area',
            reviewed_by_user_id: ADMIN_USER_ID,
          }),
        }),
      );
      const noteCall = tx.applicationNote.create.mock.calls[0]![0] as {
        data: { note: string };
      };
      expect(noteCall.data.note).toContain('Out of catchment area');
      expect(noteCall.data.note).not.toContain('Seat released');
    });

    it('flags the seat release in the note when transitioning from conditional_approval', async () => {
      const harness = buildService();
      tx.application.findFirst.mockResolvedValue(
        sampleApplication({ status: 'conditional_approval' }),
      );
      tx.application.update.mockResolvedValue(sampleApplication({ status: 'rejected' }));

      await harness.service.reject(TENANT_ID, APPLICATION_ID, {
        reason: 'Cheque bounced',
        actingUserId: ADMIN_USER_ID,
      });

      const noteCall = tx.applicationNote.create.mock.calls[0]![0] as {
        data: { note: string };
      };
      expect(noteCall.data.note).toContain('Seat released');
    });

    it('requires a non-empty reason', async () => {
      const harness = buildService();

      await expect(
        harness.service.reject(TENANT_ID, APPLICATION_ID, {
          reason: '   ',
          actingUserId: ADMIN_USER_ID,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(tx.application.findFirst).not.toHaveBeenCalled();
    });

    it('is idempotent on already-rejected rows — throws INVALID_STATUS_TRANSITION', async () => {
      const harness = buildService();
      tx.application.findFirst.mockResolvedValue(sampleApplication({ status: 'rejected' }));

      await expect(
        harness.service.reject(TENANT_ID, APPLICATION_ID, {
          reason: 'duplicate click',
          actingUserId: ADMIN_USER_ID,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(tx.application.update).not.toHaveBeenCalled();
    });
  });

  // ─── withdraw() ────────────────────────────────────────────────────────────

  describe('withdraw', () => {
    it('allows a parent to withdraw their own ready_to_admit application', async () => {
      const harness = buildService();
      tx.application.findFirst.mockResolvedValue(
        sampleApplication({ status: 'ready_to_admit', submitted_by_parent_id: PARENT_ID }),
      );
      tx.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      tx.application.update.mockResolvedValue(sampleApplication({ status: 'withdrawn' }));

      const result = await harness.service.withdraw(TENANT_ID, APPLICATION_ID, {
        actingUserId: PARENT_USER_ID,
        isParent: true,
      });

      expect(result.status).toBe('withdrawn');
    });

    it('rejects a parent trying to withdraw someone else’s application', async () => {
      const harness = buildService();
      tx.application.findFirst.mockResolvedValue(
        sampleApplication({ status: 'ready_to_admit', submitted_by_parent_id: 'other-parent-id' }),
      );
      tx.parent.findFirst.mockResolvedValue({ id: PARENT_ID });

      await expect(
        harness.service.withdraw(TENANT_ID, APPLICATION_ID, {
          actingUserId: PARENT_USER_ID,
          isParent: true,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(tx.application.update).not.toHaveBeenCalled();
    });

    it('flags the seat release in the note when withdrawing from conditional_approval', async () => {
      const harness = buildService();
      tx.application.findFirst.mockResolvedValue(
        sampleApplication({ status: 'conditional_approval' }),
      );
      tx.application.update.mockResolvedValue(sampleApplication({ status: 'withdrawn' }));

      await harness.service.withdraw(TENANT_ID, APPLICATION_ID, {
        actingUserId: ADMIN_USER_ID,
        isParent: false,
      });

      const noteCall = tx.applicationNote.create.mock.calls[0]![0] as {
        data: { note: string };
      };
      expect(noteCall.data.note).toContain('Seat released');
    });
  });

  // ─── markApproved() ────────────────────────────────────────────────────────

  describe('markApproved', () => {
    it('transitions conditional_approval → approved with the payment source recorded', async () => {
      const harness = buildService();
      tx.application.findFirst.mockResolvedValue(
        sampleApplication({ status: 'conditional_approval' }),
      );
      tx.application.update.mockResolvedValue(sampleApplication({ status: 'approved' }));

      const result = await harness.service.markApproved(TENANT_ID, APPLICATION_ID, {
        actingUserId: null,
        paymentSource: 'stripe',
        overrideRecordId: null,
      });

      expect(result.status).toBe('approved');
      expect(tx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'approved',
            override_record_id: null,
            payment_deadline: null,
          }),
        }),
      );
      const noteCall = tx.applicationNote.create.mock.calls[0]![0] as {
        data: { note: string };
      };
      expect(noteCall.data.note).toContain('stripe');
    });

    it('stores the override record id when the caller passes one', async () => {
      const harness = buildService();
      tx.application.findFirst.mockResolvedValue(
        sampleApplication({ status: 'conditional_approval' }),
      );
      tx.application.update.mockResolvedValue(sampleApplication({ status: 'approved' }));

      await harness.service.markApproved(TENANT_ID, APPLICATION_ID, {
        actingUserId: ADMIN_USER_ID,
        paymentSource: 'override',
        overrideRecordId: '99999999-9999-9999-9999-999999999999',
      });

      expect(tx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            override_record_id: '99999999-9999-9999-9999-999999999999',
            reviewed_by_user_id: ADMIN_USER_ID,
          }),
        }),
      );
    });

    it('refuses to approve from any state other than conditional_approval', async () => {
      const harness = buildService();
      tx.application.findFirst.mockResolvedValue(sampleApplication({ status: 'ready_to_admit' }));

      await expect(
        harness.service.markApproved(TENANT_ID, APPLICATION_ID, {
          actingUserId: null,
          paymentSource: 'stripe',
          overrideRecordId: null,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('runs on the caller-supplied transaction when one is provided', async () => {
      const harness = buildService();
      const callerTx = buildMockTx();
      callerTx.application.findFirst.mockResolvedValue(
        sampleApplication({ status: 'conditional_approval' }),
      );
      callerTx.application.update.mockResolvedValue(sampleApplication({ status: 'approved' }));

      await harness.service.markApproved(
        TENANT_ID,
        APPLICATION_ID,
        {
          actingUserId: null,
          paymentSource: 'cash',
          overrideRecordId: null,
        },
        callerTx as unknown as PrismaService,
      );

      // Caller's tx was used directly, not a fresh RLS client
      expect(callerTx.application.update).toHaveBeenCalled();
      expect(mockedCreateRlsClient).not.toHaveBeenCalled();
    });
  });

  // ─── revertToWaitingList() ────────────────────────────────────────────────

  describe('revertToWaitingList', () => {
    it('transitions conditional_approval → waiting_list and nulls the deadline', async () => {
      const harness = buildService();
      tx.application.findFirst.mockResolvedValue(
        sampleApplication({
          status: 'conditional_approval',
          payment_amount_cents: 700_000,
          payment_deadline: new Date(),
        }),
      );
      tx.application.update.mockResolvedValue(sampleApplication({ status: 'waiting_list' }));

      const result = await harness.service.revertToWaitingList(
        TENANT_ID,
        APPLICATION_ID,
        'payment_expired',
      );

      expect(result.status).toBe('waiting_list');
      expect(tx.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'waiting_list',
            waiting_list_substatus: null,
            payment_amount_cents: null,
            payment_deadline: null,
          }),
        }),
      );
      const noteCall = tx.applicationNote.create.mock.calls[0]![0] as {
        data: { note: string };
      };
      expect(noteCall.data.note).toContain('payment_expired');
      expect(noteCall.data.note).toContain('Seat released');
    });

    it('refuses to revert rows that are not in conditional_approval', async () => {
      const harness = buildService();
      tx.application.findFirst.mockResolvedValue(sampleApplication({ status: 'approved' }));

      await expect(
        harness.service.revertToWaitingList(TENANT_ID, APPLICATION_ID, 'payment_expired'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
