import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  eventDriversSchema,
  runEventEngine,
  type CreateEventBudgetDto,
  type EventBudgetQueryDto,
  type EventBudgetStatus,
  type EventDrivers,
  type EventEngineOutputs,
  type UpdateEventBudgetDto,
} from '@school/shared/budgeting';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';

import { EventBudgetScenariosService } from './event-budget-scenarios.service';
import {
  round2,
  toSummary,
  type EventBudgetDetail,
  type EventBudgetRow,
  type EventBudgetScenarioRow,
  type EventBudgetSummary,
  type PerHouseholdBreakdownRow,
} from './event-budgets.types';

/**
 * EventBudgetsService — CRUD + state machine for the event/trip budget
 * workspace. Phase 07 of the modeling rebuild (PLAN.md §9).
 *
 * State machine — Phase 07 transitions only:
 *   draft → confirmed
 *   draft → cancelled
 *   confirmed → completed
 *   confirmed → cancelled
 *   fees_generated → completed
 *
 * Phase 10 (trip → fee integration) owns `confirmed → fees_generated`.
 * `fees_generated → cancelled` is intentionally rejected here; the user
 * is redirected to Finance to void the assignments first (PLAN.md §10.4).
 */

const VALID_TRANSITIONS: Record<EventBudgetStatus, readonly EventBudgetStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  fees_generated: ['completed'],
  completed: [],
  cancelled: [],
};

const DEFAULT_DRIVERS: EventDrivers = eventDriversSchema.parse({
  contingency_pct: 5,
  custom_lines: [],
});

@Injectable()
export class EventBudgetsService {
  private readonly logger = new Logger(EventBudgetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scenariosService: EventBudgetScenariosService,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  // ─── findAll ───────────────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    query: EventBudgetQueryDto,
  ): Promise<{
    data: EventBudgetSummary[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.EventBudgetWhereInput = { tenant_id: tenantId };
    if (query.status) where.status = query.status;
    if (query.event_type) where.event_type = query.event_type;
    if (query.date_from || query.date_to) {
      const range: Prisma.DateTimeNullableFilter = {};
      if (query.date_from) range.gte = new Date(query.date_from);
      if (query.date_to) range.lte = new Date(query.date_to);
      where.event_date = range;
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [rows, total] = await Promise.all([
      this.prisma.eventBudget.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ event_date: 'desc' }, { created_at: 'desc' }],
      }),
      this.prisma.eventBudget.count({ where }),
    ]);
    return {
      data: rows.map((row) => toSummary(row as EventBudgetRow)),
      meta: { page, pageSize, total },
    };
  }

  // ─── findOne ───────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string): Promise<EventBudgetDetail> {
    const row = await this.prisma.eventBudget.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        scenarios: { orderBy: { position: 'asc' } },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${id}" not found`,
      });
    }

    const drivers = eventDriversSchema.parse(row.drivers ?? {});
    const householdCount = await this.countHouseholds(tenantId, row as EventBudgetRow);
    const baseOutput = runEventEngine({
      drivers,
      participant_count: row.participant_count,
      household_count: householdCount,
      household_share_pct: Number(row.household_share_pct),
    });
    const perHouseholdBreakdown = await this.buildPerHouseholdBreakdown(
      tenantId,
      row as EventBudgetRow,
      baseOutput.per_student_cost,
    );

    const scenarioRows = (row.scenarios ?? []) as EventBudgetScenarioRow[];
    const scenarios = scenarioRows.map((scenario) =>
      this.scenariosService.runScenario(row as EventBudgetRow, scenario, householdCount),
    );

    return {
      ...toSummary(row as EventBudgetRow),
      drivers,
      output: baseOutput,
      per_household_breakdown: perHouseholdBreakdown,
      scenarios,
    };
  }

  // ─── create ────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    dto: CreateEventBudgetDto,
  ): Promise<EventBudgetDetail> {
    let participantCount = dto.participant_count;
    if (participantCount == null && dto.class_id) {
      participantCount = await this.classesReadFacade.countActiveEnrolmentsByClass(
        tenantId,
        dto.class_id,
      );
    }
    if (participantCount == null && dto.year_group_id) {
      participantCount = await this.studentReadFacade.countActiveByYearGroup(
        tenantId,
        dto.year_group_id,
      );
    }
    if (participantCount == null) {
      throw new BadRequestException({
        code: 'PARTICIPANT_COUNT_REQUIRED',
        message:
          'participant_count is required when neither class_id nor year_group_id is provided',
      });
    }

    const drivers = eventDriversSchema.parse(dto.drivers ?? DEFAULT_DRIVERS);

    const created = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.eventBudget.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          event_type: dto.event_type,
          event_date: dto.event_date ? new Date(dto.event_date) : null,
          event_end_date: dto.event_end_date ? new Date(dto.event_end_date) : null,
          class_id: dto.class_id ?? null,
          year_group_id: dto.year_group_id ?? null,
          participant_count: participantCount,
          drivers,
          status: 'draft',
          household_share_pct: dto.household_share_pct,
          payment_plan: dto.payment_plan,
          notes: dto.notes ?? null,
          created_by: userId,
        },
      });
    });
    return this.findOne(tenantId, created.id);
  }

  // ─── update ────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateEventBudgetDto,
  ): Promise<EventBudgetDetail> {
    const existing = await this.prisma.eventBudget.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${id}" not found`,
      });
    }
    if (existing.status !== 'draft') {
      throw new ConflictException({
        code: 'EVENT_BUDGET_NOT_EDITABLE',
        message: `Event budget is in status "${existing.status}"; only drafts are editable. Cancel it or revert to draft to edit.`,
      });
    }

    const drivers = dto.drivers ? eventDriversSchema.parse(dto.drivers) : undefined;

    await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      const data: Prisma.EventBudgetUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.event_date !== undefined) {
        data.event_date = dto.event_date ? new Date(dto.event_date) : null;
      }
      if (dto.event_end_date !== undefined) {
        data.event_end_date = dto.event_end_date ? new Date(dto.event_end_date) : null;
      }
      if (dto.participant_count !== undefined) {
        data.participant_count = dto.participant_count;
      }
      if (dto.household_share_pct !== undefined) {
        data.household_share_pct = dto.household_share_pct;
      }
      if (dto.payment_plan !== undefined) data.payment_plan = dto.payment_plan;
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (drivers !== undefined) data.drivers = drivers;

      await txdb.eventBudget.update({ where: { id }, data });
    });
    return this.findOne(tenantId, id);
  }

  // ─── State transitions ────────────────────────────────────────────────

  async confirm(tenantId: string, userId: string, id: string): Promise<EventBudgetDetail> {
    return this.transition(tenantId, userId, id, 'confirmed');
  }

  async complete(tenantId: string, userId: string, id: string): Promise<EventBudgetDetail> {
    return this.transition(tenantId, userId, id, 'completed');
  }

  async cancel(tenantId: string, userId: string, id: string): Promise<EventBudgetDetail> {
    const existing = await this.prisma.eventBudget.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${id}" not found`,
      });
    }
    if (existing.status === 'fees_generated') {
      throw new ConflictException({
        code: 'EVENT_BUDGET_FEES_PRESENT',
        message:
          'This trip has fees generated in Finance. Void those assignments in Finance before cancelling the trip.',
      });
    }
    return this.transition(tenantId, userId, id, 'cancelled');
  }

  // ─── delete ────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string): Promise<{ id: string }> {
    const existing = await this.prisma.eventBudget.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${id}" not found`,
      });
    }
    if (existing.status !== 'draft') {
      throw new ConflictException({
        code: 'EVENT_BUDGET_NOT_DELETABLE',
        message: `Only drafts can be deleted; this budget is "${existing.status}".`,
      });
    }

    await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.eventBudget.delete({ where: { id } });
    });
    return { id };
  }

  // ─── Internal: state-machine helper ───────────────────────────────────

  private async transition(
    tenantId: string,
    userId: string,
    id: string,
    to: EventBudgetStatus,
  ): Promise<EventBudgetDetail> {
    const existing = await this.prisma.eventBudget.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${id}" not found`,
      });
    }
    const allowed = VALID_TRANSITIONS[existing.status];
    if (!allowed.includes(to)) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot transition event budget from "${existing.status}" to "${to}".`,
      });
    }

    await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.eventBudget.update({ where: { id }, data: { status: to } });
    });
    return this.findOne(tenantId, id);
  }

  // ─── Internal: count distinct households of participating students ────

  private async countHouseholds(tenantId: string, row: EventBudgetRow): Promise<number> {
    if (!row.class_id && !row.year_group_id) {
      // Without a class / year-group scope, fall back to a heuristic:
      // assume the average school has ~1.4 students per household. This
      // gives the engine a useful per_household_cost without requiring
      // the caller to pass the count explicitly.
      return Math.max(1, Math.round(row.participant_count / 1.4));
    }
    const distinctCount = await this.studentReadFacade.countDistinctParticipantHouseholds(
      tenantId,
      { class_id: row.class_id, year_group_id: row.year_group_id },
    );
    return distinctCount || 1;
  }

  // ─── Internal: per-household breakdown ────────────────────────────────

  private async buildPerHouseholdBreakdown(
    tenantId: string,
    row: EventBudgetRow,
    perStudentCost: number,
  ): Promise<PerHouseholdBreakdownRow[]> {
    if (!row.class_id && !row.year_group_id) return [];
    const students = await this.studentReadFacade.findActiveParticipantsWithHousehold(tenantId, {
      class_id: row.class_id,
      year_group_id: row.year_group_id,
    });
    const tally = new Map<string, { household_name: string; count: number }>();
    for (const s of students) {
      const existing = tally.get(s.household_id);
      if (existing) {
        existing.count += 1;
      } else {
        tally.set(s.household_id, {
          household_name: s.household?.household_name ?? '—',
          count: 1,
        });
      }
    }
    return Array.from(tally.entries())
      .map(([id, v]) => ({
        household_id: id,
        household_name: v.household_name,
        student_count: v.count,
        household_total: round2(v.count * perStudentCost),
      }))
      .sort((a, b) => b.household_total - a.household_total);
  }

  // ─── Helper for trip → fee integration (Phase 10 reuses these) ────────

  /**
   * Returns the engine output and household count for a given event
   * budget. Phase 10's `TripFeeIntegrationService` calls this so the
   * preview and commit paths share a single math source of truth with
   * the `findOne` GET response.
   */
  async runEngineForId(
    tenantId: string,
    id: string,
  ): Promise<{ row: EventBudgetRow; output: EventEngineOutputs; householdCount: number }> {
    const row = await this.prisma.eventBudget.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${id}" not found`,
      });
    }
    const drivers = eventDriversSchema.parse(row.drivers ?? {});
    const householdCount = await this.countHouseholds(tenantId, row as EventBudgetRow);
    const output = runEventEngine({
      drivers,
      participant_count: row.participant_count,
      household_count: householdCount,
      household_share_pct: Number(row.household_share_pct),
    });
    return { row: row as EventBudgetRow, output, householdCount };
  }
}
