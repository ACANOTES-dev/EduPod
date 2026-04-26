import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { StudentReadFacade } from '../../students/student-read.facade';

import { EventBudgetScenariosService } from './event-budget-scenarios.service';
import { EventBudgetsService } from './event-budgets.service';

// ─── createRlsClient mock ────────────────────────────────────────────────

const mockRlsTx: Record<string, unknown> = {};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Constants ───────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const CLASS_ID = '44444444-4444-4444-8444-444444444444';

// ─── Mock prisma factory ──────────────────────────────────────────────────

function buildMockPrisma() {
  const mock = {
    eventBudget: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    eventBudgetScenario: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
  Object.assign(mockRlsTx, mock);
  return mock;
}

function buildMockStudentFacade() {
  return {
    countActiveByYearGroup: jest.fn().mockResolvedValue(0),
    countDistinctParticipantHouseholds: jest.fn().mockResolvedValue(1),
    findActiveParticipantsWithHousehold: jest.fn().mockResolvedValue([]),
  } as unknown as StudentReadFacade;
}

function buildMockClassesFacade() {
  return {
    countActiveEnrolmentsByClass: jest.fn().mockResolvedValue(0),
  } as unknown as ClassesReadFacade;
}

// ─── Builders ─────────────────────────────────────────────────────────────

function buildEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    tenant_id: TENANT_ID,
    name: 'Class 2A — Dublin Zoo',
    event_type: 'trip' as const,
    event_date: new Date('2026-05-12'),
    event_end_date: null,
    class_id: null,
    year_group_id: null,
    participant_count: 10,
    drivers: {
      transport: { unit_cost: 20, units: 2 },
      food: { per_person_cost: 15, count: 10 },
      contingency_pct: 5,
      custom_lines: [],
    },
    status: 'draft' as const,
    household_share_pct: 100,
    payment_plan: 'one_off' as const,
    fee_generation_run_id: null,
    fee_structure_id: null,
    notes: null,
    created_by: USER_ID,
    created_at: new Date(),
    updated_at: new Date(),
    scenarios: [],
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────

describe('EventBudgetsService', () => {
  let service: EventBudgetsService;
  let scenariosService: EventBudgetScenariosService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let studentFacade: StudentReadFacade;
  let classesFacade: ClassesReadFacade;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    studentFacade = buildMockStudentFacade();
    classesFacade = buildMockClassesFacade();
    scenariosService = new EventBudgetScenariosService(mockPrisma as never);
    service = new EventBudgetsService(
      mockPrisma as never,
      scenariosService,
      studentFacade,
      classesFacade,
    );
    jest.clearAllMocks();
  });

  // ─── findOne ─────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns engine output and per-household breakdown', async () => {
      mockPrisma.eventBudget.findFirst.mockResolvedValue(buildEventRow());
      const result = await service.findOne(TENANT_ID, EVENT_ID);
      // 40 (transport) + 150 (food) = 190 + 9.5 contingency = 199.5
      expect(result.output.total_cost).toBe(199.5);
      expect(result.output.per_student_cost).toBe(19.95);
    });

    it('returns scenarios array with per-scenario engine outputs', async () => {
      mockPrisma.eventBudget.findFirst.mockResolvedValue(
        buildEventRow({
          scenarios: [
            {
              id: 'scenario-1',
              tenant_id: TENANT_ID,
              parent_event_budget_id: EVENT_ID,
              name: 'Cheaper food',
              position: 0,
              driver_overrides: {
                food: { per_person_cost: 10, count: 10 },
              },
              notes: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        }),
      );
      const result = await service.findOne(TENANT_ID, EVENT_ID);
      expect(result.scenarios).toHaveLength(1);
      // Override: 40 transport + 100 food = 140 + 7 contingency = 147
      expect(result.scenarios[0]!.output.total_cost).toBe(147);
    });

    it('throws NotFoundException when event missing', async () => {
      mockPrisma.eventBudget.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT_ID, EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────

  describe('create', () => {
    it('defaults participant_count from class enrolment when class_id provided', async () => {
      (classesFacade.countActiveEnrolmentsByClass as jest.Mock).mockResolvedValueOnce(24);
      mockPrisma.eventBudget.create.mockResolvedValue({ id: EVENT_ID });
      mockPrisma.eventBudget.findFirst.mockResolvedValue(
        buildEventRow({ participant_count: 24, class_id: CLASS_ID }),
      );

      await service.create(TENANT_ID, USER_ID, {
        name: 'Trip',
        event_type: 'trip',
        class_id: CLASS_ID,
        household_share_pct: 100,
        payment_plan: 'one_off',
      });

      const args = mockPrisma.eventBudget.create.mock.calls[0]![0];
      expect(args.data.participant_count).toBe(24);
    });

    it('throws BadRequest when neither class_id, year_group_id, nor explicit count provided', async () => {
      await expect(
        service.create(TENANT_ID, USER_ID, {
          name: 'Bad',
          event_type: 'trip',
          household_share_pct: 100,
          payment_plan: 'one_off',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('seeds defaults when drivers omitted', async () => {
      mockPrisma.eventBudget.create.mockResolvedValue({ id: EVENT_ID });
      mockPrisma.eventBudget.findFirst.mockResolvedValue(buildEventRow());

      await service.create(TENANT_ID, USER_ID, {
        name: 'Trip',
        event_type: 'trip',
        participant_count: 10,
        household_share_pct: 100,
        payment_plan: 'one_off',
      });
      const args = mockPrisma.eventBudget.create.mock.calls[0]![0];
      expect(args.data.drivers.contingency_pct).toBe(5);
      expect(args.data.drivers.custom_lines).toEqual([]);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────

  describe('update', () => {
    it('rejects when status is not draft', async () => {
      mockPrisma.eventBudget.findFirst.mockResolvedValueOnce({
        id: EVENT_ID,
        status: 'confirmed',
      });
      await expect(
        service.update(TENANT_ID, USER_ID, EVENT_ID, { name: 'New' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('patches drivers when supplied', async () => {
      mockPrisma.eventBudget.findFirst
        .mockResolvedValueOnce({ id: EVENT_ID, status: 'draft' })
        .mockResolvedValueOnce(buildEventRow());

      await service.update(TENANT_ID, USER_ID, EVENT_ID, {
        drivers: {
          transport: { unit_cost: 100, units: 1 },
          contingency_pct: 10,
          custom_lines: [],
        },
      });
      const args = mockPrisma.eventBudget.update.mock.calls[0]![0];
      expect(args.data.drivers.contingency_pct).toBe(10);
    });

    it('patches name without touching drivers', async () => {
      mockPrisma.eventBudget.findFirst
        .mockResolvedValueOnce({ id: EVENT_ID, status: 'draft' })
        .mockResolvedValueOnce(buildEventRow());

      await service.update(TENANT_ID, USER_ID, EVENT_ID, { name: 'Renamed' });
      const args = mockPrisma.eventBudget.update.mock.calls[0]![0];
      expect(args.data.name).toBe('Renamed');
      expect(args.data.drivers).toBeUndefined();
    });
  });

  // ─── State machine ──────────────────────────────────────────────────

  describe('state transitions', () => {
    function expectTransition(
      from: string,
      action: 'confirm' | 'complete' | 'cancel',
      shouldAllow: boolean,
    ) {
      it(`${from} → ${action} ${shouldAllow ? '✅ allowed' : '❌ blocked'}`, async () => {
        // Default for any uncovered findFirst — keeps lookups returning `{id, status}`.
        mockPrisma.eventBudget.findFirst.mockResolvedValue({ id: EVENT_ID, status: from });
        mockPrisma.eventBudget.update.mockResolvedValue({});
        if (shouldAllow) {
          // The cancel path runs three findFirst calls (cancel-precheck →
          // transition-precheck → findOne); confirm/complete run two.
          // The last call must return a full row for findOne()'s response
          // builder. Earlier calls just need `{id, status}` — the default
          // mockResolvedValue covers them.
          mockPrisma.eventBudget.findFirst.mockResolvedValueOnce({
            id: EVENT_ID,
            status: from,
          });
          if (action === 'cancel') {
            mockPrisma.eventBudget.findFirst.mockResolvedValueOnce({
              id: EVENT_ID,
              status: from,
            });
          }
          mockPrisma.eventBudget.findFirst.mockResolvedValueOnce(buildEventRow({ status: from }));
        }
        const promise = service[action](TENANT_ID, USER_ID, EVENT_ID);
        if (shouldAllow) {
          await expect(promise).resolves.toBeDefined();
        } else {
          await expect(promise).rejects.toBeInstanceOf(ConflictException);
        }
      });
    }

    expectTransition('draft', 'confirm', true);
    expectTransition('draft', 'cancel', true);
    expectTransition('draft', 'complete', false);
    expectTransition('confirmed', 'complete', true);
    expectTransition('confirmed', 'cancel', true);
    expectTransition('completed', 'cancel', false);
    expectTransition('cancelled', 'confirm', false);

    it('fees_generated → cancel returns 409 with EVENT_BUDGET_FEES_PRESENT', async () => {
      mockPrisma.eventBudget.findFirst.mockResolvedValue({
        id: EVENT_ID,
        status: 'fees_generated',
      });
      await expect(service.cancel(TENANT_ID, USER_ID, EVENT_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EVENT_BUDGET_FEES_PRESENT' }),
      });
    });

    it('fees_generated → complete is allowed', async () => {
      mockPrisma.eventBudget.findFirst
        .mockResolvedValueOnce({ id: EVENT_ID, status: 'fees_generated' })
        .mockResolvedValueOnce(buildEventRow({ status: 'fees_generated' }));
      await expect(service.complete(TENANT_ID, USER_ID, EVENT_ID)).resolves.toBeDefined();
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────

  describe('remove', () => {
    it('rejects when status != draft', async () => {
      mockPrisma.eventBudget.findFirst.mockResolvedValue({
        id: EVENT_ID,
        status: 'confirmed',
      });
      await expect(service.remove(TENANT_ID, USER_ID, EVENT_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('deletes a draft', async () => {
      mockPrisma.eventBudget.findFirst.mockResolvedValue({
        id: EVENT_ID,
        status: 'draft',
      });
      const out = await service.remove(TENANT_ID, USER_ID, EVENT_ID);
      expect(out).toEqual({ id: EVENT_ID });
    });

    it('returns 404 when missing', async () => {
      mockPrisma.eventBudget.findFirst.mockResolvedValue(null);
      await expect(service.remove(TENANT_ID, USER_ID, EVENT_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── Per-household breakdown ────────────────────────────────────────

  describe('per_household_breakdown', () => {
    it('groups siblings into one household with student_count = 2', async () => {
      mockPrisma.eventBudget.findFirst.mockResolvedValue(
        buildEventRow({ class_id: CLASS_ID, participant_count: 2 }),
      );
      (studentFacade.findActiveParticipantsWithHousehold as jest.Mock).mockResolvedValueOnce([
        { household_id: 'h1', household: { id: 'h1', household_name: 'Doe' } },
        { household_id: 'h1', household: { id: 'h1', household_name: 'Doe' } },
      ]);
      (studentFacade.countDistinctParticipantHouseholds as jest.Mock).mockResolvedValueOnce(1);
      const result = await service.findOne(TENANT_ID, EVENT_ID);
      expect(result.per_household_breakdown).toHaveLength(1);
      expect(result.per_household_breakdown[0]!.student_count).toBe(2);
    });

    it('returns empty array when no class_id or year_group_id is set', async () => {
      mockPrisma.eventBudget.findFirst.mockResolvedValue(buildEventRow());
      const result = await service.findOne(TENANT_ID, EVENT_ID);
      expect(result.per_household_breakdown).toEqual([]);
    });
  });
});
