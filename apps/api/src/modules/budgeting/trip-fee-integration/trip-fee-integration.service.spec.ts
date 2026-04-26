import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import {
  TripFeeIntegrationService,
  aggregateByHousehold,
  computeMode,
  countHouseholds,
  derivePaymentDates,
} from './trip-fee-integration.service';

// ─── createRlsClient mock — runs the callback with a `tx` proxying mockPrisma ───

const mockRlsTx: Record<string, unknown> = {};
jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_ID = '55555555-5555-4555-8555-555555555555';

const FULL_PERMS = ['budgeting.view', 'budgeting.generate_fees', 'finance.manage'];

const sampleParticipants = [
  { student_id: 's1', student_name: 'Alice Doe', household_id: 'h1', household_name: 'Doe Family' },
  { student_id: 's2', student_name: 'Bob Doe', household_id: 'h1', household_name: 'Doe Family' },
];

type EventStatus = 'draft' | 'confirmed' | 'fees_generated' | 'completed' | 'cancelled';
type PaymentPlan = 'one_off' | 'two_payments' | 'three_payments' | 'four_payments';

interface EventLike {
  id: string;
  tenant_id: string;
  name: string;
  status: EventStatus;
  household_share_pct: number;
  payment_plan: PaymentPlan;
  participant_count: number;
  class_id: string | null;
  year_group_id: string | null;
  event_date: Date;
  drivers: Record<string, unknown>;
}

const baseEvent: EventLike = {
  id: EVENT_ID,
  tenant_id: TENANT_A,
  name: 'Class 2A — Dublin Zoo',
  status: 'confirmed',
  household_share_pct: 100,
  payment_plan: 'one_off',
  participant_count: 2,
  class_id: 'c1',
  year_group_id: null,
  event_date: new Date('2026-06-15T00:00:00Z'),
  drivers: {
    transport: { unit_cost: 200, units: 1 },
    entry_tickets: { per_student_cost: 15, count: 2 },
    contingency_pct: 5,
    custom_lines: [],
  },
};

function build({
  event = baseEvent,
  participants = sampleParticipants,
  perms = FULL_PERMS,
  isOwner = false,
}: {
  event?: EventLike | null;
  participants?: typeof sampleParticipants;
  perms?: string[];
  isOwner?: boolean;
} = {}) {
  const prisma = {
    eventBudget: {
      findFirst: jest.fn().mockResolvedValue(event),
      update: jest.fn().mockResolvedValue({}),
    },
    feeStructure: {
      create: jest.fn().mockResolvedValue({ id: 'fs1' }),
    },
  };
  const eventBudgetsService = {
    runEngineForId: jest.fn().mockImplementation(async () => {
      if (!event) {
        throw new NotFoundException({
          code: 'EVENT_BUDGET_NOT_FOUND',
          message: 'Event budget not found',
        });
      }
      return {
        row: event,
        output: {
          line_items: [],
          total_cost: 250,
          contingency_amount: 12.5,
          per_student_cost: 131.25,
          per_household_cost: 262.5,
          household_total: 250,
          school_subsidy_amount: 0,
          breakeven_participants: 2,
        },
        householdCount: countHouseholds(participants),
      };
    }),
  };
  const feeStructuresService = {};
  const feeAssignmentsService = {
    bulkCreate: jest.fn().mockResolvedValue({ run_id: 'run1', count: participants.length }),
  };
  const studentReadFacade = {
    findActiveParticipantStudentsWithHousehold: jest.fn().mockResolvedValue(participants),
  };
  const permissionCacheService = {
    isOwner: jest.fn().mockResolvedValue(isOwner),
    getPermissions: jest.fn().mockResolvedValue(perms),
  };
  Object.assign(mockRlsTx, prisma);

  const svc = new TripFeeIntegrationService(
    prisma as never,
    eventBudgetsService as never,
    feeStructuresService as never,
    feeAssignmentsService as never,
    studentReadFacade as never,
    permissionCacheService as never,
  );
  return {
    svc,
    prisma,
    eventBudgetsService,
    feeAssignmentsService,
    studentReadFacade,
    permissionCacheService,
  };
}

// ─── preview ─────────────────────────────────────────────────────────────────

describe('TripFeeIntegrationService — preview', () => {
  it('returns mode=cost_recovery and sums households', async () => {
    const { svc } = build();
    const out = await svc.previewGenerateFees(TENANT_A, EVENT_ID);
    expect(out.mode).toBe('cost_recovery');
    expect(out.totals.household_count).toBe(1);
    expect(out.totals.student_count).toBe(2);
    expect(out.households[0]!.students).toHaveLength(2);
  });

  it('returns mode=free when household_share_pct = 0', async () => {
    const { svc } = build({ event: { ...baseEvent, household_share_pct: 0 } });
    const out = await svc.previewGenerateFees(TENANT_A, EVENT_ID);
    expect(out.mode).toBe('free');
  });

  it('returns mode=subsidised when 0 < pct < 100', async () => {
    const { svc } = build({ event: { ...baseEvent, household_share_pct: 60 } });
    const out = await svc.previewGenerateFees(TENANT_A, EVENT_ID);
    expect(out.mode).toBe('subsidised');
  });

  it('returns mode=payment_plan when payment_plan != one_off', async () => {
    const { svc } = build({ event: { ...baseEvent, payment_plan: 'three_payments' } });
    const out = await svc.previewGenerateFees(TENANT_A, EVENT_ID);
    expect(out.mode).toBe('payment_plan');
    expect(out.households[0]!.payment_plan_dates).toHaveLength(3);
  });

  it('throws NotFound when event missing in tenant', async () => {
    const { svc } = build({ event: null });
    await expect(svc.previewGenerateFees(TENANT_A, EVENT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not write to Finance when previewing', async () => {
    const { svc, feeAssignmentsService } = build();
    await svc.previewGenerateFees(TENANT_A, EVENT_ID);
    expect(feeAssignmentsService.bulkCreate).not.toHaveBeenCalled();
  });

  it('returns NotFound when Tenant B previews Tenant A event (event-budgets service throws)', async () => {
    const { svc } = build({ event: null });
    await expect(svc.previewGenerateFees(TENANT_B, EVENT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ─── generateFees ────────────────────────────────────────────────────────────

describe('TripFeeIntegrationService — generateFees', () => {
  it('rejects when status is not confirmed', async () => {
    const { svc } = build({ event: { ...baseEvent, status: 'draft' as const } });
    await expect(
      svc.generateFees(TENANT_A, MEMBERSHIP_ID, USER_ID, EVENT_ID, { confirm: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when household_share_pct = 0 (use mark-school-funded)', async () => {
    const { svc } = build({ event: { ...baseEvent, household_share_pct: 0 } });
    await expect(
      svc.generateFees(TENANT_A, MEMBERSHIP_ID, USER_ID, EVENT_ID, { confirm: true }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EVENT_BUDGET_FREE_TRIP' }),
    });
  });

  it('rejects when permission stack is incomplete', async () => {
    const { svc } = build({ perms: ['budgeting.view'] });
    await expect(
      svc.generateFees(TENANT_A, MEMBERSHIP_ID, USER_ID, EVENT_ID, { confirm: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when membership_id is null', async () => {
    const { svc } = build();
    await expect(
      svc.generateFees(TENANT_A, null, USER_ID, EVENT_ID, { confirm: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('owner bypass — passes even with no permissions', async () => {
    const { svc } = build({ perms: [], isOwner: true });
    const out = await svc.generateFees(TENANT_A, MEMBERSHIP_ID, USER_ID, EVENT_ID, {
      confirm: true,
    });
    expect(out.status).toBe('fees_generated');
  });

  it('commits in one transaction and updates the event row', async () => {
    const { svc, prisma, feeAssignmentsService } = build();
    const out = await svc.generateFees(TENANT_A, MEMBERSHIP_ID, USER_ID, EVENT_ID, {
      confirm: true,
    });
    expect(feeAssignmentsService.bulkCreate).toHaveBeenCalledTimes(1);
    expect(prisma.eventBudget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EVENT_ID },
        data: expect.objectContaining({
          status: 'fees_generated',
          fee_structure_id: 'fs1',
          fee_generation_run_id: 'run1',
        }),
      }),
    );
    expect(out.status).toBe('fees_generated');
    expect(out.household_count).toBe(1);
    expect(out.student_count).toBe(2);
  });

  it('throws when no participants', async () => {
    const { svc } = build({ participants: [] });
    await expect(
      svc.generateFees(TENANT_A, MEMBERSHIP_ID, USER_ID, EVENT_ID, { confirm: true }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NO_PARTICIPANTS' }),
    });
  });
});

// ─── markSchoolFunded ────────────────────────────────────────────────────────

describe('TripFeeIntegrationService — markSchoolFunded', () => {
  it('flips status when event is confirmed and free', async () => {
    const { svc, prisma } = build({ event: { ...baseEvent, household_share_pct: 0 } });
    const out = await svc.markSchoolFunded(TENANT_A, MEMBERSHIP_ID, USER_ID, EVENT_ID);
    expect(out.status).toBe('fees_generated');
    expect(out.reason).toBe('free_trip');
    expect(prisma.eventBudget.update).toHaveBeenCalled();
  });

  it('rejects when event is not free', async () => {
    const { svc } = build();
    await expect(
      svc.markSchoolFunded(TENANT_A, MEMBERSHIP_ID, USER_ID, EVENT_ID),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EVENT_BUDGET_NOT_FREE' }),
    });
  });

  it('requires permission stack', async () => {
    const { svc } = build({
      event: { ...baseEvent, household_share_pct: 0 },
      perms: ['budgeting.view'],
    });
    await expect(
      svc.markSchoolFunded(TENANT_A, MEMBERSHIP_ID, USER_ID, EVENT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('computeMode', () => {
  it.each([
    [0, 'one_off' as const, 'free' as const],
    [100, 'one_off' as const, 'cost_recovery' as const],
    [50, 'one_off' as const, 'subsidised' as const],
    [100, 'three_payments' as const, 'payment_plan' as const],
  ])('hhPct=%d plan=%s → %s', (pct, plan, mode) => {
    expect(computeMode(pct, plan)).toBe(mode);
  });
});

describe('derivePaymentDates', () => {
  const event = {
    event_date: new Date('2026-06-15T00:00:00Z'),
    payment_plan: 'three_payments' as const,
  };
  it('returns 3 dates ascending', () => {
    const dates = derivePaymentDates(event, null)!;
    expect(dates).toHaveLength(3);
    expect(dates[0]! < dates[1]!).toBe(true);
    expect(dates[1]! < dates[2]!).toBe(true);
  });

  it('returns null when event has no date and no override', () => {
    expect(derivePaymentDates({ event_date: null, payment_plan: 'one_off' }, null)).toBeNull();
  });

  it('one_off returns single due date', () => {
    expect(
      derivePaymentDates({ event_date: event.event_date, payment_plan: 'one_off' }, null),
    ).toHaveLength(1);
  });

  it('respects override due date', () => {
    const override = new Date('2026-08-01');
    const dates = derivePaymentDates(event, override)!;
    expect(dates[2]!.getTime()).toBe(override.getTime());
  });
});

describe('countHouseholds + aggregateByHousehold', () => {
  it('groups siblings into one household payment', () => {
    const breakdown = aggregateByHousehold(
      [
        { student_id: 's1', student_name: 'A', household_id: 'h1', household_name: 'H1' },
        { student_id: 's2', student_name: 'B', household_id: 'h1', household_name: 'H1' },
        { student_id: 's3', student_name: 'C', household_id: 'h2', household_name: 'H2' },
      ],
      100,
    );
    expect(breakdown).toHaveLength(2);
    expect(breakdown.find((h) => h.household_id === 'h1')?.amount).toBe(200);
    expect(
      countHouseholds([
        { student_id: 's1', student_name: 'A', household_id: 'h1', household_name: 'H1' },
        { student_id: 's2', student_name: 'B', household_id: 'h1', household_name: 'H1' },
      ]),
    ).toBe(1);
  });

  it('sorts breakdown rows by amount descending', () => {
    const breakdown = aggregateByHousehold(
      [
        { student_id: 's1', student_name: 'A', household_id: 'h1', household_name: 'H1' },
        { student_id: 's2', student_name: 'B', household_id: 'h2', household_name: 'H2' },
        { student_id: 's3', student_name: 'C', household_id: 'h2', household_name: 'H2' },
      ],
      50,
    );
    expect(breakdown[0]!.household_id).toBe('h2');
    expect(breakdown[0]!.amount).toBe(100);
    expect(breakdown[1]!.household_id).toBe('h1');
  });
});
