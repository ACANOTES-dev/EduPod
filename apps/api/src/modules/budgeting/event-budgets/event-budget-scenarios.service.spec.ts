import { ConflictException, NotFoundException } from '@nestjs/common';

import { EventBudgetScenariosService } from './event-budget-scenarios.service';

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
const SCENARIO_ID = '44444444-4444-4444-8444-444444444444';

// ─── Mock prisma factory ──────────────────────────────────────────────────

function buildMockPrisma() {
  const mock = {
    eventBudget: {
      findFirst: jest.fn().mockResolvedValue({ id: EVENT_ID }),
    },
    eventBudgetScenario: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  Object.assign(mockRlsTx, mock);
  return mock;
}

function buildScenarioRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SCENARIO_ID,
    tenant_id: TENANT_ID,
    parent_event_budget_id: EVENT_ID,
    name: 'Cheaper food',
    position: 0,
    driver_overrides: {},
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('EventBudgetScenariosService', () => {
  let service: EventBudgetScenariosService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
    service = new EventBudgetScenariosService(mockPrisma as never);
    jest.clearAllMocks();
    // The buildMockPrisma resets the parent mock — re-seed for assertParent calls.
    mockPrisma.eventBudget.findFirst.mockResolvedValue({ id: EVENT_ID });
  });

  // ─── findAll ─────────────────────────────────────────────────────────

  it('findAll returns scenarios in position order', async () => {
    mockPrisma.eventBudgetScenario.findMany.mockResolvedValue([
      buildScenarioRow({ position: 0, name: 'A' }),
      buildScenarioRow({ id: 'sid-2', position: 1, name: 'B' }),
    ]);
    const out = await service.findAll(TENANT_ID, EVENT_ID);
    expect(out).toHaveLength(2);
    expect(out[0]!.position).toBe(0);
  });

  // ─── create ──────────────────────────────────────────────────────────

  it('create rejects when 3 scenarios already exist (limit reached)', async () => {
    mockPrisma.eventBudgetScenario.count.mockResolvedValue(3);
    await expect(
      service.create(TENANT_ID, USER_ID, EVENT_ID, { name: 'Fourth' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create assigns position = current count', async () => {
    mockPrisma.eventBudgetScenario.count.mockResolvedValue(1);
    mockPrisma.eventBudgetScenario.create.mockResolvedValue(buildScenarioRow({ position: 1 }));
    const out = await service.create(TENANT_ID, USER_ID, EVENT_ID, { name: 'Plan B' });
    const args = mockPrisma.eventBudgetScenario.create.mock.calls[0]![0];
    expect(args.data.position).toBe(1);
    expect(out.position).toBe(1);
  });

  // ─── update ──────────────────────────────────────────────────────────

  it('update patches name + driver_overrides', async () => {
    mockPrisma.eventBudgetScenario.findFirst.mockResolvedValue(buildScenarioRow());
    mockPrisma.eventBudgetScenario.update.mockResolvedValue(
      buildScenarioRow({
        name: 'Renamed',
        driver_overrides: { food: { per_person_cost: 12, count: 10 } },
      }),
    );
    const out = await service.update(TENANT_ID, USER_ID, EVENT_ID, SCENARIO_ID, {
      name: 'Renamed',
      driver_overrides: { food: { per_person_cost: 12, count: 10 } },
    });
    expect(out.name).toBe('Renamed');
  });

  // ─── remove ──────────────────────────────────────────────────────────

  it('remove deletes the row and subsequent get throws NotFound', async () => {
    mockPrisma.eventBudgetScenario.findFirst
      .mockResolvedValueOnce(buildScenarioRow())
      .mockResolvedValueOnce(null);
    await service.remove(TENANT_ID, USER_ID, EVENT_ID, SCENARIO_ID);
    expect(mockPrisma.eventBudgetScenario.delete).toHaveBeenCalledWith({
      where: { id: SCENARIO_ID },
    });
    await expect(service.findOne(TENANT_ID, EVENT_ID, SCENARIO_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ─── runScenario ─────────────────────────────────────────────────────

  it('runScenario merges overrides on top of parent drivers', () => {
    const parent = {
      drivers: {
        transport: { unit_cost: 20, units: 2 },
        food: { per_person_cost: 15, count: 10 },
        contingency_pct: 5,
        custom_lines: [],
      },
      participant_count: 10,
      household_share_pct: 100,
    };
    const scenario = buildScenarioRow({
      driver_overrides: { food: { per_person_cost: 10, count: 10 } },
    });
    const out = service.runScenario(parent as never, scenario, 8);
    // Overridden food: 100 + transport 40 = 140 + 5% = 147
    expect(out.output.total_cost).toBe(147);
  });
});
