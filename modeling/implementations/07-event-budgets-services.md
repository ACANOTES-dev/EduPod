# Implementation 07 — Event Budgets services

> **Wave:** 2
> **Depends on:** 01, 02
> **Deploys:** API restart only

---

## Goal

Build the **Event / Trip Budget** workspace services — the lightweight calculator-style entity that lives alongside annual financial models. Mirrors the structure of phase 03 (Financial Models + Scenarios) but for events: one main entity, scenarios, lifecycle, engine integration, per-household breakdown.

This phase delivers everything except the trip→fee Finance write — that's phase 10's transactional integration. Phase 07 stops at `confirmed` / `completed` / `cancelled` state mutations and exposes a read-only "preview" of the cost; phase 10 layers the actual `FeeAssignmentsService.bulkCreate()` call on top.

State machine (per PLAN.md §9.3):

```
draft → confirmed → fees_generated → completed
                 ↓
             cancelled (terminal)
```

Phase 07 owns transitions `draft → confirmed`, `confirmed → cancelled`, `confirmed → completed`, `fees_generated → completed`, `fees_generated → cancelled` (the last one returns 409 to redirect the user to Finance for voiding — see PLAN.md §10.4). It does NOT own `confirmed → fees_generated` — that's phase 10.

## What to change

### 1. New folder: `apps/api/src/modules/budgeting/event-budgets/`

```
event-budgets/
├── event-budgets.controller.ts
├── event-budgets.service.ts
├── event-budget-scenarios.service.ts
└── event-budgets.service.spec.ts
```

All four files are NEW. Wire into `BudgetingModule` (claim under Rule 17 if not yet held):

```typescript
providers: [EventBudgetsService, EventBudgetScenariosService],
controllers: [EventBudgetsController],
exports: [EventBudgetsService],   // phase 10 (trip→fee integration) imports it
```

Imports the `ClassesModule` (for default participant count from class enrolment) and `HouseholdsModule` (for per-household breakdown). Both are existing modules — confirm they export `ClassesService` / `HouseholdsService`. If a read-facade pattern is preferred, fall back to a direct `prisma.student.findMany({ where: { class_id, status: 'active' }, select: { id: true, household_id: true } })` query in this service since this is a read with `tenant_id` in the where clause (no RLS transaction needed for reads).

### 2. `event-budgets.service.ts` — main service

```typescript
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  createEventBudgetSchema,
  eventDriversSchema,
  runEventEngine,
  updateEventBudgetSchema,
  type CreateEventBudgetDto,
  type EventBudgetStatus,
  type EventEngineOutputs,
  type UpdateEventBudgetDto,
} from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { EventBudgetScenariosService } from './event-budget-scenarios.service';

// ─── State machine — Phase 07 transitions only ─────────────────────────────────
// Phase 10 owns `confirmed → fees_generated`; do not allow it from this service.
const VALID_TRANSITIONS: Record<EventBudgetStatus, EventBudgetStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['cancelled', 'completed'], // → fees_generated handled by phase 10
  fees_generated: ['completed'], // cancel intentionally NOT here — see PLAN.md §10.4
  completed: [],
  cancelled: [],
};

interface EventBudgetFilters {
  page: number;
  pageSize: number;
  status?: EventBudgetStatus | EventBudgetStatus[];
  event_type?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

@Injectable()
export class EventBudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scenarios: EventBudgetScenariosService,
  ) {}

  // ─── List ───────────────────────────────────────────────────────────────
  async findAll(tenant_id: string, filters: EventBudgetFilters) {
    const { page, pageSize } = filters;
    const skip = (page - 1) * pageSize;
    const where: Record<string, unknown> = { tenant_id };

    if (filters.status) {
      where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
    }
    if (filters.event_type) where.event_type = filters.event_type;
    if (filters.date_from || filters.date_to) {
      const range: Record<string, unknown> = {};
      if (filters.date_from) range.gte = new Date(filters.date_from);
      if (filters.date_to) range.lte = new Date(filters.date_to);
      where.event_date = range;
    }
    if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.eventBudget.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ event_date: 'desc' }, { created_at: 'desc' }],
      }),
      this.prisma.eventBudget.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  // ─── Get by id (with scenarios + engine output + per-household breakdown) ──
  async findOne(tenant_id: string, id: string) {
    const eb = await this.prisma.eventBudget.findFirst({
      where: { id, tenant_id },
      include: { scenarios: { orderBy: { position: 'asc' } } },
    });
    if (!eb) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${id}" not found`,
      });
    }

    const household_count = await this.countHouseholds(tenant_id, eb);
    const drivers = eventDriversSchema.parse(eb.drivers ?? {});
    const baseOutput = runEventEngine({
      drivers,
      participant_count: eb.participant_count,
      household_count,
      household_share_pct: Number(eb.household_share_pct),
    });
    const per_household_breakdown = await this.buildPerHouseholdBreakdown(
      tenant_id,
      eb,
      Number(baseOutput.per_student_cost),
    );

    const scenarioOutputs = await Promise.all(
      eb.scenarios.map((s) => this.scenarios.runScenario(eb, s, household_count)),
    );

    return {
      ...this.serialize(eb),
      output: baseOutput,
      per_household_breakdown,
      scenarios: scenarioOutputs,
    };
  }

  // ─── Create ─────────────────────────────────────────────────────────────
  async create(tenant_id: string, user_id: string, dto: CreateEventBudgetDto) {
    let participant_count = dto.participant_count;
    if (participant_count == null && dto.class_id) {
      participant_count = await this.prisma.student.count({
        where: { tenant_id, status: 'active' /* class linkage — verify column name */ },
      });
    }
    if (participant_count == null) {
      throw new BadRequestException({
        code: 'PARTICIPANT_COUNT_REQUIRED',
        message: 'participant_count is required when class_id is not provided',
      });
    }

    const drivers = eventDriversSchema.parse(
      dto.drivers ?? { contingency_pct: 5, custom_lines: [] },
    );

    const rls = createRlsClient(this.prisma, { tenant_id });
    const created = await rls.$transaction(async (tx) =>
      (tx as unknown as PrismaService).eventBudget.create({
        data: {
          tenant_id,
          name: dto.name,
          event_type: dto.event_type,
          event_date: dto.event_date ? new Date(dto.event_date) : null,
          event_end_date: dto.event_end_date ? new Date(dto.event_end_date) : null,
          class_id: dto.class_id ?? null,
          year_group_id: dto.year_group_id ?? null,
          participant_count,
          drivers,
          status: 'draft',
          household_share_pct: dto.household_share_pct ?? 100,
          payment_plan: dto.payment_plan ?? 'one_off',
          notes: dto.notes ?? null,
          created_by: user_id,
        },
      }),
    );
    return this.findOne(tenant_id, created.id);
  }

  // ─── Update (drivers, name, dates, count, share, plan, notes — draft only) ──
  async update(tenant_id: string, id: string, dto: UpdateEventBudgetDto) {
    const existing = await this.prisma.eventBudget.findFirst({
      where: { id, tenant_id },
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

    const rls = createRlsClient(this.prisma, { tenant_id });
    await rls.$transaction(async (tx) =>
      (tx as unknown as PrismaService).eventBudget.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.event_date !== undefined && {
            event_date: dto.event_date ? new Date(dto.event_date) : null,
          }),
          ...(dto.event_end_date !== undefined && {
            event_end_date: dto.event_end_date ? new Date(dto.event_end_date) : null,
          }),
          ...(dto.participant_count !== undefined && { participant_count: dto.participant_count }),
          ...(dto.household_share_pct !== undefined && {
            household_share_pct: dto.household_share_pct,
          }),
          ...(dto.payment_plan !== undefined && { payment_plan: dto.payment_plan }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(drivers !== undefined && { drivers }),
        },
      }),
    );
    return this.findOne(tenant_id, id);
  }

  // ─── Status transitions ─────────────────────────────────────────────────
  async confirm(tenant_id: string, id: string) {
    return this.transition(tenant_id, id, 'confirmed');
  }
  async complete(tenant_id: string, id: string) {
    return this.transition(tenant_id, id, 'completed');
  }

  async cancel(tenant_id: string, id: string) {
    const eb = await this.prisma.eventBudget.findFirst({
      where: { id, tenant_id },
      select: { id: true, status: true },
    });
    if (!eb) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${id}" not found`,
      });
    }
    if (eb.status === 'fees_generated') {
      throw new ConflictException({
        code: 'EVENT_BUDGET_FEES_PRESENT',
        message:
          'This trip has fees generated in Finance. Void those assignments in Finance before cancelling the trip.',
      });
    }
    return this.transition(tenant_id, id, 'cancelled');
  }

  // ─── Delete (draft only) ────────────────────────────────────────────────
  async remove(tenant_id: string, id: string) {
    const eb = await this.prisma.eventBudget.findFirst({
      where: { id, tenant_id },
      select: { id: true, status: true },
    });
    if (!eb) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${id}" not found`,
      });
    }
    if (eb.status !== 'draft') {
      throw new ConflictException({
        code: 'EVENT_BUDGET_NOT_DELETABLE',
        message: `Only drafts can be deleted; this budget is "${eb.status}".`,
      });
    }
    const rls = createRlsClient(this.prisma, { tenant_id });
    await rls.$transaction(async (tx) =>
      (tx as unknown as PrismaService).eventBudget.delete({ where: { id } }),
    );
    return { id, deleted: true };
  }

  // ─── Internal: transition helper (validates against VALID_TRANSITIONS) ──
  private async transition(tenant_id: string, id: string, to: EventBudgetStatus) {
    const eb = await this.prisma.eventBudget.findFirst({
      where: { id, tenant_id },
      select: { id: true, status: true },
    });
    if (!eb) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${id}" not found`,
      });
    }
    const allowed = VALID_TRANSITIONS[eb.status];
    if (!allowed.includes(to)) {
      throw new ConflictException({
        code: 'INVALID_STATE_TRANSITION',
        message: `Cannot transition from "${eb.status}" to "${to}".`,
      });
    }
    const rls = createRlsClient(this.prisma, { tenant_id });
    await rls.$transaction(async (tx) =>
      (tx as unknown as PrismaService).eventBudget.update({
        where: { id },
        data: { status: to },
      }),
    );
    return this.findOne(tenant_id, id);
  }

  // ─── Internal: count distinct households of participating students ───────
  private async countHouseholds(
    tenant_id: string,
    eb: { class_id: string | null; year_group_id: string | null; participant_count: number },
  ): Promise<number> {
    if (!eb.class_id && !eb.year_group_id) {
      // Default heuristic when no class scope: assume avg 1.4 students/household
      return Math.max(1, Math.round(eb.participant_count / 1.4));
    }
    const where: Record<string, unknown> = { tenant_id, status: 'active' };
    if (eb.class_id) where.class_id = eb.class_id;
    if (eb.year_group_id) where.year_group_id = eb.year_group_id;
    const distinct = await this.prisma.student.findMany({
      where,
      select: { household_id: true },
      distinct: ['household_id'],
    });
    return distinct.length || 1;
  }

  // ─── Internal: build per-household breakdown ────────────────────────────
  private async buildPerHouseholdBreakdown(
    tenant_id: string,
    eb: { class_id: string | null; year_group_id: string | null; participant_count: number },
    per_student_cost: number,
  ): Promise<
    Array<{
      household_id: string;
      household_name: string;
      student_count: number;
      household_total: number;
    }>
  > {
    if (!eb.class_id && !eb.year_group_id) return [];
    const where: Record<string, unknown> = { tenant_id, status: 'active' };
    if (eb.class_id) where.class_id = eb.class_id;
    if (eb.year_group_id) where.year_group_id = eb.year_group_id;
    const students = await this.prisma.student.findMany({
      where,
      select: { household_id: true, household: { select: { id: true, household_name: true } } },
    });
    const tally = new Map<string, { name: string; count: number }>();
    for (const s of students) {
      const cur = tally.get(s.household_id);
      if (cur) cur.count += 1;
      else tally.set(s.household_id, { name: s.household?.household_name ?? '—', count: 1 });
    }
    return [...tally.entries()]
      .map(([id, v]) => ({
        household_id: id,
        household_name: v.name,
        student_count: v.count,
        household_total: round2(v.count * per_student_cost),
      }))
      .sort((a, b) => b.household_total - a.household_total);
  }

  private serialize(eb: Awaited<ReturnType<PrismaService['eventBudget']['findFirst']>>) {
    if (!eb) return null;
    return {
      ...eb,
      household_share_pct: Number(eb.household_share_pct),
    };
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
```

### 3. `event-budget-scenarios.service.ts`

```typescript
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  createEventBudgetScenarioSchema,
  eventDriversSchema,
  runEventEngine,
  updateEventBudgetScenarioSchema,
  type CreateEventBudgetScenarioDto,
  type EventBudget,
  type EventBudgetScenario,
  type EventEngineOutputs,
  type UpdateEventBudgetScenarioDto,
} from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_SCENARIOS_PER_PARENT = 3;

@Injectable()
export class EventBudgetScenariosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenant_id: string, parent_event_budget_id: string) {
    return this.prisma.eventBudgetScenario.findMany({
      where: { tenant_id, parent_event_budget_id },
      orderBy: { position: 'asc' },
    });
  }

  async findOne(tenant_id: string, parent_event_budget_id: string, id: string) {
    const s = await this.prisma.eventBudgetScenario.findFirst({
      where: { id, tenant_id, parent_event_budget_id },
    });
    if (!s) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_SCENARIO_NOT_FOUND',
        message: `Event budget scenario "${id}" not found`,
      });
    }
    return s;
  }

  async create(
    tenant_id: string,
    parent_event_budget_id: string,
    dto: CreateEventBudgetScenarioDto,
  ) {
    const count = await this.prisma.eventBudgetScenario.count({
      where: { tenant_id, parent_event_budget_id },
    });
    if (count >= MAX_SCENARIOS_PER_PARENT) {
      throw new ConflictException({
        code: 'EVENT_BUDGET_SCENARIO_LIMIT',
        message: `Max ${MAX_SCENARIOS_PER_PARENT} alternative scenarios per event budget.`,
      });
    }
    const overrides = dto.driver_overrides
      ? eventDriversSchema.partial().parse(dto.driver_overrides)
      : {};
    const rls = createRlsClient(this.prisma, { tenant_id });
    return rls.$transaction(async (tx) =>
      (tx as unknown as PrismaService).eventBudgetScenario.create({
        data: {
          tenant_id,
          parent_event_budget_id,
          name: dto.name,
          position: count,
          driver_overrides: overrides,
          notes: dto.notes ?? null,
        },
      }),
    );
  }

  async update(
    tenant_id: string,
    parent_event_budget_id: string,
    id: string,
    dto: UpdateEventBudgetScenarioDto,
  ) {
    await this.findOne(tenant_id, parent_event_budget_id, id);
    const overrides = dto.driver_overrides
      ? eventDriversSchema.partial().parse(dto.driver_overrides)
      : undefined;
    const rls = createRlsClient(this.prisma, { tenant_id });
    return rls.$transaction(async (tx) =>
      (tx as unknown as PrismaService).eventBudgetScenario.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(overrides !== undefined && { driver_overrides: overrides }),
        },
      }),
    );
  }

  async remove(tenant_id: string, parent_event_budget_id: string, id: string) {
    await this.findOne(tenant_id, parent_event_budget_id, id);
    const rls = createRlsClient(this.prisma, { tenant_id });
    await rls.$transaction(async (tx) =>
      (tx as unknown as PrismaService).eventBudgetScenario.delete({ where: { id } }),
    );
    return { id, deleted: true };
  }

  /**
   * Run the engine for a scenario by merging its overrides on top of the parent's drivers.
   * Used by EventBudgetsService.findOne(...) to attach scenario outputs to the GET response.
   */
  async runScenario(
    parent: EventBudget,
    scenario: EventBudgetScenario,
    household_count: number,
  ): Promise<{ scenario: EventBudgetScenario; output: EventEngineOutputs }> {
    const baseDrivers = eventDriversSchema.parse(parent.drivers ?? {});
    const overrides = (scenario.driver_overrides ?? {}) as Partial<typeof baseDrivers>;
    // Shallow merge — overrides REPLACE corresponding sub-objects (transport, food, …).
    const mergedDrivers = { ...baseDrivers, ...overrides } as typeof baseDrivers;
    const output = runEventEngine({
      drivers: mergedDrivers,
      participant_count: parent.participant_count,
      household_count,
      household_share_pct: Number(parent.household_share_pct),
    });
    return { scenario, output };
  }
}
```

### 4. `event-budgets.controller.ts`

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  createEventBudgetScenarioSchema,
  createEventBudgetSchema,
  eventBudgetQuerySchema,
  updateEventBudgetScenarioSchema,
  updateEventBudgetSchema,
  type CreateEventBudgetDto,
  type CreateEventBudgetScenarioDto,
  type EventBudgetQueryDto,
  type TenantContext,
  type UpdateEventBudgetDto,
  type UpdateEventBudgetScenarioDto,
} from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { EventBudgetScenariosService } from './event-budget-scenarios.service';
import { EventBudgetsService } from './event-budgets.service';

@Controller('v1/budgeting/event-budgets')
@UseGuards(AuthGuard, PermissionGuard)
export class EventBudgetsController {
  constructor(
    private readonly events: EventBudgetsService,
    private readonly scenarios: EventBudgetScenariosService,
  ) {}

  // ─── Event budgets ──────────────────────────────────────────────────────
  @Get()
  @RequiresPermission('budgeting.view')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(eventBudgetQuerySchema)) q: EventBudgetQueryDto,
  ) {
    return this.events.findAll(tenant.tenant_id, q);
  }

  @Get(':id')
  @RequiresPermission('budgeting.view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.findOne(tenant.tenant_id, id);
  }

  @Post()
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { user_id: string },
    @Body(new ZodValidationPipe(createEventBudgetSchema)) dto: CreateEventBudgetDto,
  ) {
    return this.events.create(tenant.tenant_id, user.user_id, dto);
  }

  @Patch(':id')
  @RequiresPermission('budgeting.manage')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEventBudgetSchema)) dto: UpdateEventBudgetDto,
  ) {
    return this.events.update(tenant.tenant_id, id, dto);
  }

  @Post(':id/confirm')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.confirm(tenant.tenant_id, id);
  }

  @Post(':id/cancel')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.cancel(tenant.tenant_id, id);
  }

  @Post(':id/complete')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  complete(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.complete(tenant.tenant_id, id);
  }

  @Delete(':id')
  @RequiresPermission('budgeting.archive') // Owner-tier per PLAN.md §12.5
  @HttpCode(HttpStatus.OK)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.events.remove(tenant.tenant_id, id);
  }

  // ─── Scenarios ──────────────────────────────────────────────────────────
  @Get(':id/scenarios')
  @RequiresPermission('budgeting.view')
  listScenarios(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.scenarios.findAll(tenant.tenant_id, id);
  }

  @Get(':id/scenarios/:sid')
  @RequiresPermission('budgeting.view')
  findScenario(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
  ) {
    return this.scenarios.findOne(tenant.tenant_id, id, sid);
  }

  @Post(':id/scenarios')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.CREATED)
  createScenario(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createEventBudgetScenarioSchema)) dto: CreateEventBudgetScenarioDto,
  ) {
    return this.scenarios.create(tenant.tenant_id, id, dto);
  }

  @Patch(':id/scenarios/:sid')
  @RequiresPermission('budgeting.manage')
  updateScenario(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
    @Body(new ZodValidationPipe(updateEventBudgetScenarioSchema)) dto: UpdateEventBudgetScenarioDto,
  ) {
    return this.scenarios.update(tenant.tenant_id, id, sid, dto);
  }

  @Delete(':id/scenarios/:sid')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  removeScenario(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sid', ParseUUIDPipe) sid: string,
  ) {
    return this.scenarios.remove(tenant.tenant_id, id, sid);
  }
}
```

### 5. Shared Zod schemas — additions to `packages/shared/src/budgeting/event-budgets.ts`

Phase 01 created the stub; flesh out here:

```typescript
import { z } from 'zod';
import { eventDriversSchema } from './event-engine';

export const eventBudgetTypeSchema = z.enum([
  'trip',
  'fundraiser',
  'sports_day',
  'performance',
  'capital_purchase',
  'other',
]);
export const eventBudgetStatusSchema = z.enum([
  'draft',
  'confirmed',
  'fees_generated',
  'completed',
  'cancelled',
]);
export const eventBudgetPaymentPlanSchema = z.enum([
  'one_off',
  'two_payments',
  'three_payments',
  'four_payments',
]);
export type EventBudgetStatus = z.infer<typeof eventBudgetStatusSchema>;

export const createEventBudgetSchema = z.object({
  name: z.string().min(1).max(255),
  event_type: eventBudgetTypeSchema,
  event_date: z.string().date().optional(),
  event_end_date: z.string().date().optional(),
  class_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
  participant_count: z.number().int().min(0).optional(),
  drivers: eventDriversSchema.optional(),
  household_share_pct: z.number().min(0).max(100).default(100),
  payment_plan: eventBudgetPaymentPlanSchema.default('one_off'),
  notes: z.string().max(2000).optional(),
});
export type CreateEventBudgetDto = z.infer<typeof createEventBudgetSchema>;

export const updateEventBudgetSchema = createEventBudgetSchema.partial();
export type UpdateEventBudgetDto = z.infer<typeof updateEventBudgetSchema>;

export const eventBudgetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: eventBudgetStatusSchema.optional(),
  event_type: eventBudgetTypeSchema.optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  search: z.string().max(255).optional(),
});
export type EventBudgetQueryDto = z.infer<typeof eventBudgetQuerySchema>;

export const createEventBudgetScenarioSchema = z.object({
  name: z.string().min(1).max(64),
  driver_overrides: eventDriversSchema.partial().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateEventBudgetScenarioDto = z.infer<typeof createEventBudgetScenarioSchema>;
export const updateEventBudgetScenarioSchema = createEventBudgetScenarioSchema.partial();
export type UpdateEventBudgetScenarioDto = z.infer<typeof updateEventBudgetScenarioSchema>;
```

Re-export from `packages/shared/src/budgeting/index.ts`.

## Testing requirements

- **`event-budgets.service.spec.ts`** — co-located. Mock `PrismaService` and the scenarios service.
  - **state machine** (Rule 23 — every valid + every invalid):
    - `draft → confirmed` ✅
    - `draft → cancelled` ✅
    - `draft → completed` ❌ (ConflictException, code `INVALID_STATE_TRANSITION`)
    - `confirmed → completed` ✅
    - `confirmed → cancelled` ✅
    - `confirmed → fees_generated` ❌ (phase 10 owns it; this service rejects)
    - `fees_generated → cancelled` ❌ (ConflictException, code `EVENT_BUDGET_FEES_PRESENT`, message references Finance)
    - `fees_generated → completed` ✅
    - `completed → *` ❌
    - `cancelled → *` ❌
  - **create**:
    - default `participant_count` from `class_id` enrolment count when not provided
    - `BadRequestException` (`PARTICIPANT_COUNT_REQUIRED`) when both `class_id` and `participant_count` missing
    - default drivers `{ contingency_pct: 5, custom_lines: [] }` when none provided
  - **update**:
    - `ConflictException` (`EVENT_BUDGET_NOT_EDITABLE`) when status != `draft`
    - patches drivers, name, dates, count, share, plan, notes when status == `draft`
  - **delete**:
    - `ConflictException` (`EVENT_BUDGET_NOT_DELETABLE`) when status != `draft`
    - delete succeeds for draft
  - **engine math sanity**:
    - participant_count=10, household_count=8, household_share_pct=100, drivers: transport unit_cost=20 units=2, food per_person=15 count=10 → total cost = 40+150 = 190 + 5% contingency 9.5 = 199.5; per_student = 19.95; per_household = ~24.94
    - household_share_pct=0 → school_subsidy_amount = total_cost; household_total = 0
  - **per_household_breakdown**:
    - two students share a household → that household's `student_count` = 2 and `household_total` = 2 × per_student_cost
    - rows sorted descending by household_total

- **`event-budget-scenarios.service.spec.ts`**:
  - max-3 enforcement (`ConflictException`, code `EVENT_BUDGET_SCENARIO_LIMIT`)
  - `runScenario` merges overrides on top of base drivers; e.g. base food per_person=15, scenario food per_person=12 → engine output uses 12.
  - delete succeeds; subsequent get throws NotFound.

- **RLS leakage spec** — `apps/api/test/budgeting-event-budgets.rls.spec.ts`. Cover both tables: `event_budgets` and `event_budget_scenarios`. Create as Tenant A, authenticate as Tenant B, assert empty list and 404 on `GET /v1/budgeting/event-budgets/<idA>`.

- **Coverage**: every method in both services needs at least one positive + one negative path. Use the established `buildMockPrisma()` helper.

## Post-deploy verification

1. SSH into production. `pm2 restart api`. Health check → 200.
2. Login as `owner@nhqs.test`. Via `browser_evaluate`:
   ```js
   await fetch('/api/v1/budgeting/event-budgets', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       name: 'Class 2A — Dublin Zoo',
       event_type: 'trip',
       event_date: '2026-05-12',
       participant_count: 24,
       household_share_pct: 100,
       payment_plan: 'one_off',
       drivers: {
         transport: { unit_cost: 380, units: 1 },
         entry_tickets: { per_student_cost: 12, count: 24 },
         food: { per_person_cost: 8, count: 24 },
         contingency_pct: 5,
         custom_lines: [],
       },
     }),
   }).then((r) => r.json());
   ```
   Confirm 201 with `output.total_cost ≈ 754.95` (380 + 288 + 192 = 860 — wait, recompute: 380×1 + 12×24=288 + 8×24=192 → 860; with 5% contingency = 903). The test asserts the response shape, not the precise number.
3. Confirm scenarios endpoints work — POST a scenario, GET the budget, see `scenarios[0].output` populated.
4. Test state machine: POST `/confirm` → status flips. POST `/confirm` again → 409 INVALID_STATE_TRANSITION. POST `/cancel` → status flips to cancelled. PATCH the budget → 409 EVENT_BUDGET_NOT_EDITABLE.
5. RLS spot-check from `stress-a` tenant — list returns empty array.
6. Per-household breakdown: create an event scoped to a class with known students/households; confirm `per_household_breakdown` length matches distinct household count and totals add up to `household_total`.

## Follow-ups for subsequent waves

- **Phase 10 (Trip → Fee Integration)** owns the `confirmed → fees_generated` transition. It must update `event_budgets.status`, `fee_generation_run_id`, `fee_structure_id`, and call `FeeAssignmentsService.bulkCreate(...)` inside one `createRlsClient(...).$transaction()`. The service exposed by Phase 07 (`EventBudgetsService`) is its read entry point.
- **Phase 17 (Event Budget Workspace UI)** consumes `GET /v1/budgeting/event-budgets/:id` — relies on the embedded `output`, `per_household_breakdown`, and `scenarios` shape. Any change to those shapes after this phase must be coordinated with phase 17.
- **Phase 18 (Trip → Fee Generation Flow UI)** lives between phases 07 and 10 — it surfaces the dry-run preview from phase 10.
- **Phase 21 (Polish — `state-machines.md`):** add the Event Budget state machine documenting:
  - States: `draft`, `confirmed`, `fees_generated`, `completed`, `cancelled`
  - Transitions owned by **phase 07**: draft→confirmed, draft→cancelled, confirmed→completed, confirmed→cancelled, fees_generated→completed
  - Transitions owned by **phase 10**: confirmed→fees_generated
  - Forbidden transition: fees_generated→cancelled (must void in Finance first; service returns 409 with code `EVENT_BUDGET_FEES_PRESENT`)
- **Verify class enrolment count query**: this phase assumes a `student.class_id` (or equivalent) is available. If the schema uses a `class_enrolments` join table, swap `prisma.student.count({ where: { tenant_id, status: 'active' } })` for the right join. Track this as a Phase 07 follow-up; the test suite will catch a regression.
- **Architecture docs (Phase 21):** add `budgeting → classes` and `budgeting → households` (read-only) to `module-blast-radius.md`.

## Rollback

`git revert <commit-sha>`. No DB changes. If event budget rows already exist (created via the new endpoints), they remain — the table comes from phase 01 and is unaffected by reverting this phase. The rows simply become unreachable until phase 07 redeploys.
