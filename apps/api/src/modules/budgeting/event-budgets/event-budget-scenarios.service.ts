import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  eventDriversSchema,
  runEventEngine,
  type CreateEventBudgetScenarioDto,
  type EventDrivers,
  type UpdateEventBudgetScenarioDto,
} from '@school/shared/budgeting';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import {
  toScenarioResponse,
  type EventBudgetRow,
  type EventBudgetScenarioComputed,
  type EventBudgetScenarioResponse,
  type EventBudgetScenarioRow,
} from './event-budgets.types';

/**
 * EventBudgetScenariosService — child scenarios on an event budget.
 *
 * Mirrors the annual-model `ScenariosService` shape: at most 3 scenarios
 * per parent, identified by position, with driver_overrides merged on
 * top of the parent's drivers when running the engine.
 */

const MAX_SCENARIOS_PER_PARENT = 3;

@Injectable()
export class EventBudgetScenariosService {
  private readonly logger = new Logger(EventBudgetScenariosService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── findAll ───────────────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    parentEventBudgetId: string,
  ): Promise<EventBudgetScenarioResponse[]> {
    await this.assertParentEventBudgetExists(tenantId, parentEventBudgetId);
    const rows = await this.prisma.eventBudgetScenario.findMany({
      where: { tenant_id: tenantId, parent_event_budget_id: parentEventBudgetId },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => toScenarioResponse(row as EventBudgetScenarioRow));
  }

  // ─── findOne ───────────────────────────────────────────────────────────

  async findOne(
    tenantId: string,
    parentEventBudgetId: string,
    scenarioId: string,
  ): Promise<EventBudgetScenarioResponse> {
    const row = await this.prisma.eventBudgetScenario.findFirst({
      where: {
        id: scenarioId,
        tenant_id: tenantId,
        parent_event_budget_id: parentEventBudgetId,
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_SCENARIO_NOT_FOUND',
        message: `Event budget scenario "${scenarioId}" not found`,
      });
    }
    return toScenarioResponse(row as EventBudgetScenarioRow);
  }

  // ─── create ────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    parentEventBudgetId: string,
    dto: CreateEventBudgetScenarioDto,
  ): Promise<EventBudgetScenarioResponse> {
    await this.assertParentEventBudgetExists(tenantId, parentEventBudgetId);

    const count = await this.prisma.eventBudgetScenario.count({
      where: { tenant_id: tenantId, parent_event_budget_id: parentEventBudgetId },
    });
    if (count >= MAX_SCENARIOS_PER_PARENT) {
      throw new ConflictException({
        code: 'EVENT_BUDGET_SCENARIO_LIMIT',
        message: `Maximum of ${MAX_SCENARIOS_PER_PARENT} alternative scenarios per event budget.`,
      });
    }

    const overrides = dto.driver_overrides
      ? eventDriversSchema.partial().parse(dto.driver_overrides)
      : {};

    const row = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.eventBudgetScenario.create({
        data: {
          tenant_id: tenantId,
          parent_event_budget_id: parentEventBudgetId,
          name: dto.name,
          position: count,
          driver_overrides: overrides,
          notes: dto.notes ?? null,
        },
      });
    });

    return toScenarioResponse(row as EventBudgetScenarioRow);
  }

  // ─── update ────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    userId: string,
    parentEventBudgetId: string,
    scenarioId: string,
    dto: UpdateEventBudgetScenarioDto,
  ): Promise<EventBudgetScenarioResponse> {
    await this.findOne(tenantId, parentEventBudgetId, scenarioId);
    const overrides = dto.driver_overrides
      ? eventDriversSchema.partial().parse(dto.driver_overrides)
      : undefined;

    const row = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.eventBudgetScenario.update({
        where: { id: scenarioId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(overrides !== undefined && { driver_overrides: overrides }),
        },
      });
    });

    return toScenarioResponse(row as EventBudgetScenarioRow);
  }

  // ─── remove ────────────────────────────────────────────────────────────

  async remove(
    tenantId: string,
    userId: string,
    parentEventBudgetId: string,
    scenarioId: string,
  ): Promise<{ id: string }> {
    await this.findOne(tenantId, parentEventBudgetId, scenarioId);

    await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.eventBudgetScenario.delete({ where: { id: scenarioId } });
    });

    return { id: scenarioId };
  }

  // ─── runScenario (used by EventBudgetsService.findOne) ─────────────────

  /**
   * Run the event engine for a scenario row by merging its
   * `driver_overrides` shallowly on top of the parent's drivers. The
   * scenarios service owns this so the engine call site lives near the
   * scenario data.
   */
  runScenario(
    parent: Pick<EventBudgetRow, 'drivers' | 'participant_count' | 'household_share_pct'>,
    scenario: EventBudgetScenarioRow,
    householdCount: number,
  ): EventBudgetScenarioComputed {
    const baseDrivers = eventDriversSchema.parse(parent.drivers ?? {});
    const overrides = (scenario.driver_overrides ?? {}) as Partial<EventDrivers>;
    // Shallow merge — overrides REPLACE corresponding sub-objects (transport,
    // food, …) when present. `contingency_pct` and `custom_lines` follow the
    // same rule.
    const merged = { ...baseDrivers, ...overrides } as EventDrivers;
    const output = runEventEngine({
      drivers: merged,
      participant_count: parent.participant_count,
      household_count: householdCount,
      household_share_pct: Number(parent.household_share_pct),
    });
    return {
      scenario: toScenarioResponse(scenario),
      output,
    };
  }

  // ─── Internal helpers ──────────────────────────────────────────────────

  private async assertParentEventBudgetExists(
    tenantId: string,
    parentEventBudgetId: string,
  ): Promise<void> {
    const parent = await this.prisma.eventBudget.findFirst({
      where: { id: parentEventBudgetId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!parent) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${parentEventBudgetId}" not found`,
      });
    }
  }
}
