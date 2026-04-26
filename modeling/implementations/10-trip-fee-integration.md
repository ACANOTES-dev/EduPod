# Implementation 10 — Trip → Fee Integration service

> **Wave:** 3
> **Depends on:** 01, 07
> **Deploys:** API restart only

---

## Goal

Build the cross-module write that pushes a confirmed event budget's per-student cost into Finance via `FeeAssignmentsService.bulkCreate()`. This is the **only** path the budgeting module uses to mutate Finance state (`PLAN.md §10`, IMPLEMENTATION_LOG.md Rule 11). It is gated by a three-permission stack and runs end-to-end inside one RLS-bound interactive transaction so the trip is either fully invoiced or fully rolled back — no partial state.

This phase ships:

1. A **dry-run preview** endpoint that computes the per-household breakdown without writing anything (UI uses this to render the confirmation modal).
2. A **commit** endpoint that issues the fee assignments transactionally.
3. A separate **mark-school-funded** endpoint that handles the `household_share_pct = 0` branch (trip is school-paid; no households invoiced).
4. The state-machine transitions: `confirmed → fees_generated` (via either endpoint).

## What to change

### 1. `apps/api/src/modules/budgeting/budgeting.module.ts` — UPDATE

Import `FinanceModule` so `FeeAssignmentsService` and `FeeStructuresService` can be injected. Add `TripFeeIntegrationController` and `TripFeeIntegrationService` to controllers/providers. The `FinanceModule` must already export `FeeAssignmentsService` and `FeeStructuresService` — if it does not, the missing exports go on `FinanceModule` in the same commit (this is a one-line addition; coordinate with Wave 3 sibling impls per Rule 17 if anything else touches that file).

```typescript
// budgeting.module.ts (excerpt)
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    // ...existing imports
    FinanceModule,
  ],
  controllers: [
    // ...existing
    TripFeeIntegrationController,
  ],
  providers: [
    // ...existing
    TripFeeIntegrationService,
  ],
  // exports unchanged
})
export class BudgetingModule {}
```

### 2. `apps/api/src/modules/budgeting/trip-fee-integration/trip-fee-integration.controller.ts` — NEW

Three endpoints. All under `/v1/budgeting/event-budgets/:id`. Permission stack guarded both at the decorator and re-checked in the service body.

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { TenantContext } from '../../../common/types/tenant-context';
import type { CurrentUserContext } from '../../../common/types/current-user-context';

import {
  generateFeesBodySchema,
  type GenerateFeesBodyDto,
  type GenerateFeesPreviewResponse,
  type GenerateFeesResponse,
  type MarkSchoolFundedResponse,
} from './trip-fee-integration.types';
import { TripFeeIntegrationService } from './trip-fee-integration.service';

@Controller('v1/budgeting/event-budgets/:id')
@UseGuards(AuthGuard, PermissionGuard)
export class TripFeeIntegrationController {
  constructor(private readonly service: TripFeeIntegrationService) {}

  // GET /v1/budgeting/event-budgets/:id/generate-fees/preview
  // Dry-run. No DB writes. Returns the per-household breakdown that the UI shows in the confirm modal.
  @Get('generate-fees/preview')
  @RequiresPermission('budgeting.view')
  async preview(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GenerateFeesPreviewResponse> {
    return this.service.previewGenerateFees(ctx.tenant_id, id);
  }

  // POST /v1/budgeting/event-budgets/:id/generate-fees
  // Permission stack: budgeting.view (implicit via PermissionGuard) + budgeting.generate_fees + finance.manage.
  @Post('generate-fees')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('budgeting.generate_fees')
  @RequiresPermission('finance.manage')
  async generateFees(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: CurrentUserContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(generateFeesBodySchema)) body: GenerateFeesBodyDto,
  ): Promise<GenerateFeesResponse> {
    return this.service.generateFees(ctx.tenant_id, user, id, body);
  }

  // POST /v1/budgeting/event-budgets/:id/mark-school-funded
  // Used when household_share_pct = 0. Replaces the GENERATE button in the UI for that mode.
  @Post('mark-school-funded')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('budgeting.generate_fees')
  async markSchoolFunded(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: CurrentUserContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MarkSchoolFundedResponse> {
    return this.service.markSchoolFunded(ctx.tenant_id, user, id);
  }
}
```

If the `RequiresPermission` decorator does not stack (project convention may vary), a single `@RequiresPermissions(['budgeting.generate_fees', 'finance.manage'])` array form is the alternative. Match the existing repo pattern — check `apps/api/src/common/decorators/requires-permission.decorator.ts` and the `PermissionGuard` to confirm whether stacking is supported. **Both encodings produce the same guard outcome** but the project uses one consistently — pick the existing one.

### 3. `apps/api/src/modules/budgeting/trip-fee-integration/trip-fee-integration.types.ts` — NEW

Shared schema lives in `@school/shared/budgeting` per project conventions; this types file re-exports for ergonomic local imports.

```typescript
import { z } from 'zod';

// Shared with @school/shared/budgeting — define once, import here.
export const generateFeesBodySchema = z.object({
  confirm: z.literal(true), // explicit confirmation flag
  due_date: z.string().datetime().optional(), // optional override; defaults to (event_date - 14d)
});
export type GenerateFeesBodyDto = z.infer<typeof generateFeesBodySchema>;

export interface GenerateFeesPreviewResponse {
  event_budget_id: string;
  mode: 'free' | 'cost_recovery' | 'subsidised' | 'payment_plan';
  household_share_pct: number;
  payment_plan: 'one_off' | 'two_payments' | 'three_payments' | 'four_payments';
  totals: {
    total_to_invoice: number;
    total_school_subsidy: number;
    household_count: number;
    student_count: number;
  };
  households: Array<{
    household_id: string;
    household_name: string;
    students: Array<{ student_id: string; student_name: string }>;
    total_amount: number;
    payment_plan_dates: string[] | null; // ISO strings; null when one_off
  }>;
}

export interface GenerateFeesResponse {
  event_budget_id: string;
  status: 'fees_generated';
  fee_structure_id: string;
  fee_generation_run_id: string;
  total_invoiced: number;
  household_count: number;
  student_count: number;
}

export interface MarkSchoolFundedResponse {
  event_budget_id: string;
  status: 'fees_generated'; // status semantically reused — "no further fee action needed"
  reason: 'free_trip';
}
```

### 4. `apps/api/src/modules/budgeting/trip-fee-integration/trip-fee-integration.service.ts` — NEW

Service does the heavy lifting. Key points:

- Permission re-check at the top of every public method. The guards already enforce, but the service double-checks for safety per `IMPLEMENTATION_LOG.md` Rule 12. Use `ctx.user.permissions` exposed by the auth pipeline.
- The dry-run is pure compute against the event's drivers + the participating-student → household join. No mutation.
- The commit path uses `createRlsClient(this.prisma, { tenant_id }).$transaction(async (tx) => { ... })` per `CLAUDE.md` and Rule 9.
- Inside the transaction, run all writes via `FeeAssignmentsService.bulkCreate()` and `FeeStructuresService.findOrCreateForEvent()` — no direct DB writes that bypass those services.

```typescript
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { runEventEngine, type EventDrivers } from '@school/shared/budgeting';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { CurrentUserContext } from '../../../common/types/current-user-context';
import { FeeAssignmentsService } from '../../finance/fee-assignments.service';
import { FeeStructuresService } from '../../finance/fee-structures.service';

import type {
  GenerateFeesBodyDto,
  GenerateFeesPreviewResponse,
  GenerateFeesResponse,
  MarkSchoolFundedResponse,
} from './trip-fee-integration.types';

@Injectable()
export class TripFeeIntegrationService {
  private readonly logger = new Logger(TripFeeIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly feeStructures: FeeStructuresService,
    private readonly feeAssignments: FeeAssignmentsService,
  ) {}

  // ─── Preview (dry-run, no writes) ────────────────────────────────────────

  async previewGenerateFees(
    tenantId: string,
    eventBudgetId: string,
  ): Promise<GenerateFeesPreviewResponse> {
    const event = await this.prisma.eventBudget.findFirst({
      where: { tenant_id: tenantId, id: eventBudgetId },
    });
    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${eventBudgetId}" not found.`,
      });
    }

    const participants = await this.loadParticipantsWithHouseholds(tenantId, event);
    const drivers = event.drivers as unknown as EventDrivers;
    const engineOut = runEventEngine({
      drivers,
      participant_count: event.participant_count,
      household_count: countHouseholds(participants),
      household_share_pct: Number(event.household_share_pct),
    });

    const mode = computeMode(Number(event.household_share_pct), event.payment_plan);
    const paymentDates = derivePaymentDates(event, /* due_date_override */ null);
    const breakdown = aggregateByHousehold(participants, engineOut.per_student_cost);
    return {
      event_budget_id: event.id,
      mode,
      household_share_pct: Number(event.household_share_pct),
      payment_plan: event.payment_plan,
      totals: {
        total_to_invoice: engineOut.household_total,
        total_school_subsidy: engineOut.school_subsidy_amount,
        household_count: breakdown.length,
        student_count: participants.length,
      },
      households: breakdown.map((h) => ({
        household_id: h.household_id,
        household_name: h.household_name,
        students: h.students,
        total_amount: h.amount,
        payment_plan_dates: paymentDates ? paymentDates.map((d) => d.toISOString()) : null,
      })),
    };
  }

  // ─── Generate fees (transactional, the cross-module write) ───────────────

  async generateFees(
    tenantId: string,
    user: CurrentUserContext,
    eventBudgetId: string,
    body: GenerateFeesBodyDto,
  ): Promise<GenerateFeesResponse> {
    // ── 1. Pre-validate (outside the transaction) ─────────────────────────
    this.assertPermissionStack(user);

    const event = await this.prisma.eventBudget.findFirst({
      where: { tenant_id: tenantId, id: eventBudgetId },
    });
    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${eventBudgetId}" not found.`,
      });
    }
    if (event.status !== 'confirmed') {
      throw new ForbiddenException({
        code: 'EVENT_BUDGET_NOT_CONFIRMED',
        message: `Event budget must be in "confirmed" status to generate fees (current: "${event.status}").`,
      });
    }
    if (Number(event.household_share_pct) === 0) {
      // The free-trip branch is owned by markSchoolFunded; reject here so the UI never confuses the two.
      throw new ForbiddenException({
        code: 'EVENT_BUDGET_FREE_TRIP',
        message: 'Trip has household_share_pct = 0 — use POST /mark-school-funded instead.',
      });
    }
    if (body.confirm !== true) {
      throw new ForbiddenException({
        code: 'CONFIRMATION_REQUIRED',
        message: 'Generate-fees body must include `confirm: true`.',
      });
    }

    const participants = await this.loadParticipantsWithHouseholds(tenantId, event);
    const drivers = event.drivers as unknown as EventDrivers;
    const engineOut = runEventEngine({
      drivers,
      participant_count: event.participant_count,
      household_count: countHouseholds(participants),
      household_share_pct: Number(event.household_share_pct),
    });

    const paymentDates = derivePaymentDates(event, body.due_date ? new Date(body.due_date) : null);
    if (!paymentDates || paymentDates.length === 0) {
      throw new ForbiddenException({
        code: 'PAYMENT_DATES_INVALID',
        message: 'Could not derive payment plan dates from the trip configuration.',
      });
    }

    // ── 2. Transactional write — single RLS-bound interactive transaction ──
    // Every mutation runs inside this scope. If any FeeAssignmentsService.bulkCreate
    // call throws, the whole batch rolls back — no half-invoiced households.
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const result = await rls.$transaction(async (tx) => {
      // 2a. Mint or fetch the trip's fee structure (one fee_structures row per event).
      const feeStructure = await this.feeStructures.findOrCreateForEvent(tx as never, tenantId, {
        event_budget_id: event.id,
        name: `Event: ${event.name}`,
        // Per-student amount; FeeAssignmentsService re-multiplies by sibling count when issuing.
        amount: engineOut.per_student_cost,
        billing_frequency: 'one_off',
      });

      // 2b. Bulk create one assignment per (household, student) pair.
      const assignments = participants.map((p) => ({
        household_id: p.household_id,
        student_id: p.student_id,
        fee_structure_id: feeStructure.id,
        // FeeAssignmentsService payment-plan support: pass `installments` when payment_plan != 'one_off'.
        installments: paymentDates.map((due_date) => ({
          due_date,
          amount_pct: round2(100 / paymentDates.length),
        })),
        notes: `Auto-generated from event budget "${event.name}" (${event.id})`,
      }));

      const bulk = await this.feeAssignments.bulkCreate(tx as never, tenantId, assignments);

      // 2c. Update the event budget row with the new fee structure + run id and flip status.
      const run_id = bulk.run_id;
      await tx.eventBudget.update({
        where: { id: event.id },
        data: {
          status: 'fees_generated',
          fee_structure_id: feeStructure.id,
          fee_generation_run_id: run_id,
        },
      });

      return {
        fee_structure_id: feeStructure.id,
        fee_generation_run_id: run_id,
        total_invoiced: engineOut.household_total,
      };
    });

    this.logger.log(
      `Generated fees for event ${event.id} (tenant ${tenantId}) — ` +
        `total_invoiced=${result.total_invoiced} household_count=${countHouseholds(participants)} ` +
        `student_count=${participants.length} run_id=${result.fee_generation_run_id}`,
    );

    return {
      event_budget_id: event.id,
      status: 'fees_generated',
      fee_structure_id: result.fee_structure_id,
      fee_generation_run_id: result.fee_generation_run_id,
      total_invoiced: result.total_invoiced,
      household_count: countHouseholds(participants),
      student_count: participants.length,
    };
  }

  // ─── Mark school-funded (free trip branch) ───────────────────────────────

  async markSchoolFunded(
    tenantId: string,
    user: CurrentUserContext,
    eventBudgetId: string,
  ): Promise<MarkSchoolFundedResponse> {
    this.assertPermissionStack(user);

    const event = await this.prisma.eventBudget.findFirst({
      where: { tenant_id: tenantId, id: eventBudgetId },
    });
    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_BUDGET_NOT_FOUND',
        message: `Event budget "${eventBudgetId}" not found.`,
      });
    }
    if (event.status !== 'confirmed') {
      throw new ForbiddenException({
        code: 'EVENT_BUDGET_NOT_CONFIRMED',
        message: `Event budget must be in "confirmed" status (current: "${event.status}").`,
      });
    }
    if (Number(event.household_share_pct) !== 0) {
      throw new ForbiddenException({
        code: 'EVENT_BUDGET_NOT_FREE',
        message: 'mark-school-funded only applies when household_share_pct = 0.',
      });
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      await tx.eventBudget.update({
        where: { id: event.id },
        data: { status: 'fees_generated' }, // semantic re-use: "no fees to issue, transition complete"
      });
    });

    this.logger.log(`Marked event ${event.id} as school-funded (tenant ${tenantId})`);
    return {
      event_budget_id: event.id,
      status: 'fees_generated',
      reason: 'free_trip',
    };
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private assertPermissionStack(user: CurrentUserContext): void {
    const required = ['budgeting.view', 'budgeting.generate_fees', 'finance.manage'] as const;
    const missing = required.filter((p) => !user.permissions?.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'PERMISSION_STACK_DENIED',
        message: `Missing required permissions: ${missing.join(', ')}.`,
        details: { required, missing },
      });
    }
  }

  private async loadParticipantsWithHouseholds(
    tenantId: string,
    event: { class_id: string | null; year_group_id: string | null; participant_count: number },
  ): Promise<
    Array<{
      student_id: string;
      student_name: string;
      household_id: string;
      household_name: string;
    }>
  > {
    // The participating students are derived from class_id or year_group_id (whichever is set).
    // If both are null the event row is malformed — we treat that as zero participants and let
    // the calling endpoint surface a friendly error.
    const where = event.class_id
      ? { class_id: event.class_id }
      : event.year_group_id
        ? { year_group_id: event.year_group_id }
        : { id: '00000000-0000-0000-0000-000000000000' }; // sentinel — empty result
    const students = await this.prisma.student.findMany({
      where: { tenant_id: tenantId, ...where, status: 'active' },
      select: {
        id: true,
        full_name: true,
        household: { select: { id: true, household_name: true } },
      },
      take: event.participant_count,
    });
    return students
      .filter((s) => s.household)
      .map((s) => ({
        student_id: s.id,
        student_name: s.full_name,
        household_id: s.household!.id,
        household_name: s.household!.household_name,
      }));
  }
}

// ─── Pure helpers (exported for spec coverage) ─────────────────────────────

interface ParticipantRow {
  student_id: string;
  student_name: string;
  household_id: string;
  household_name: string;
}

export function countHouseholds(participants: ParticipantRow[]): number {
  return new Set(participants.map((p) => p.household_id)).size;
}

export function aggregateByHousehold(
  participants: ParticipantRow[],
  perStudentCost: number,
): Array<{
  household_id: string;
  household_name: string;
  students: Array<{ student_id: string; student_name: string }>;
  amount: number;
}> {
  const byHh = new Map<
    string,
    {
      household_id: string;
      household_name: string;
      students: Array<{ student_id: string; student_name: string }>;
      amount: number;
    }
  >();
  for (const p of participants) {
    if (!byHh.has(p.household_id)) {
      byHh.set(p.household_id, {
        household_id: p.household_id,
        household_name: p.household_name,
        students: [],
        amount: 0,
      });
    }
    const entry = byHh.get(p.household_id)!;
    entry.students.push({ student_id: p.student_id, student_name: p.student_name });
    entry.amount = round2(entry.amount + perStudentCost);
  }
  return [...byHh.values()];
}

export function computeMode(
  hhSharePct: number,
  paymentPlan: 'one_off' | 'two_payments' | 'three_payments' | 'four_payments',
): 'free' | 'cost_recovery' | 'subsidised' | 'payment_plan' {
  if (hhSharePct === 0) return 'free';
  if (paymentPlan !== 'one_off') return 'payment_plan';
  if (hhSharePct === 100) return 'cost_recovery';
  return 'subsidised';
}

export function derivePaymentDates(
  event: {
    event_date: Date | null;
    payment_plan: 'one_off' | 'two_payments' | 'three_payments' | 'four_payments';
  },
  override: Date | null,
): Date[] | null {
  if (!event.event_date && !override) return null;
  const final = override ?? defaultDueDate(event.event_date!);
  switch (event.payment_plan) {
    case 'one_off':
      return [final];
    case 'two_payments':
      return [addMonths(final, -2), final];
    case 'three_payments':
      return [addMonths(final, -3), addMonths(final, -1), final];
    case 'four_payments':
      return [addMonths(final, -4), addMonths(final, -2), addMonths(final, -1), final];
    default:
      return [final];
  }
}

function defaultDueDate(eventDate: Date): Date {
  // 14 days before the event by default — gives finance time to chase late households.
  const d = new Date(eventDate);
  d.setUTCDate(d.getUTCDate() - 14);
  return d;
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + n);
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

### 5. `apps/api/src/modules/budgeting/trip-fee-integration/trip-fee-integration.service.spec.ts` — NEW

Co-located. Mocks `FeeAssignmentsService`, `FeeStructuresService`, and Prisma. Asserts the four mode branches, the rollback semantics, and the permission stack.

```typescript
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import {
  TripFeeIntegrationService,
  computeMode,
  countHouseholds,
  aggregateByHousehold,
  derivePaymentDates,
} from './trip-fee-integration.service';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const EVENT_ID = '33333333-3333-3333-3333-333333333333';

const FULL_USER = {
  id: 'u1',
  permissions: ['budgeting.view', 'budgeting.generate_fees', 'finance.manage'],
} as unknown as Parameters<TripFeeIntegrationService['generateFees']>[1];

function build({ studentRows = [], event }: { studentRows?: unknown[]; event?: unknown } = {}) {
  const prisma = {
    eventBudget: {
      findFirst: jest.fn().mockResolvedValue(event ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
    student: {
      findMany: jest.fn().mockResolvedValue(studentRows),
    },
  };
  const feeStructures = {
    findOrCreateForEvent: jest.fn().mockResolvedValue({ id: 'fs1' }),
  };
  const feeAssignments = {
    bulkCreate: jest.fn().mockResolvedValue({ run_id: 'run1', count: 2 }),
  };
  const svc = new TripFeeIntegrationService(
    prisma as never,
    feeStructures as never,
    feeAssignments as never,
  );
  return { svc, prisma, feeStructures, feeAssignments };
}

const baseEvent = {
  id: EVENT_ID,
  tenant_id: TENANT_A,
  name: 'Class 2A — Dublin Zoo',
  status: 'confirmed' as const,
  household_share_pct: 100,
  payment_plan: 'one_off' as const,
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

const sampleStudents = [
  { id: 's1', full_name: 'Alice Doe', household: { id: 'h1', household_name: 'Doe Family' } },
  { id: 's2', full_name: 'Bob Doe', household: { id: 'h1', household_name: 'Doe Family' } },
];

describe('TripFeeIntegrationService — preview', () => {
  it('returns a per-household breakdown for cost-recovery mode', async () => {
    const { svc } = build({ event: baseEvent, studentRows: sampleStudents });
    const out = await svc.previewGenerateFees(TENANT_A, EVENT_ID);
    expect(out.mode).toBe('cost_recovery');
    expect(out.totals.household_count).toBe(1);
    expect(out.totals.student_count).toBe(2);
    expect(out.households[0].students).toHaveLength(2);
  });

  it('returns mode=free when household_share_pct = 0', async () => {
    const { svc } = build({
      event: { ...baseEvent, household_share_pct: 0 },
      studentRows: sampleStudents,
    });
    const out = await svc.previewGenerateFees(TENANT_A, EVENT_ID);
    expect(out.mode).toBe('free');
    expect(out.totals.total_to_invoice).toBe(0);
  });

  it('returns mode=subsidised when 0 < pct < 100', async () => {
    const { svc } = build({
      event: { ...baseEvent, household_share_pct: 60 },
      studentRows: sampleStudents,
    });
    const out = await svc.previewGenerateFees(TENANT_A, EVENT_ID);
    expect(out.mode).toBe('subsidised');
    expect(out.totals.total_school_subsidy).toBeGreaterThan(0);
  });

  it('returns mode=payment_plan when payment_plan != one_off', async () => {
    const { svc } = build({
      event: { ...baseEvent, payment_plan: 'three_payments' },
      studentRows: sampleStudents,
    });
    const out = await svc.previewGenerateFees(TENANT_A, EVENT_ID);
    expect(out.mode).toBe('payment_plan');
    expect(out.households[0].payment_plan_dates).toHaveLength(3);
  });

  it('throws NotFound when event missing in tenant', async () => {
    const { svc } = build({ event: null });
    await expect(svc.previewGenerateFees(TENANT_A, EVENT_ID)).rejects.toThrow(NotFoundException);
  });

  it('does not write to Finance when previewing', async () => {
    const { svc, feeAssignments } = build({ event: baseEvent, studentRows: sampleStudents });
    await svc.previewGenerateFees(TENANT_A, EVENT_ID);
    expect(feeAssignments.bulkCreate).not.toHaveBeenCalled();
  });
});

describe('TripFeeIntegrationService — generateFees', () => {
  it('rejects when status is not confirmed', async () => {
    const { svc } = build({
      event: { ...baseEvent, status: 'draft' },
      studentRows: sampleStudents,
    });
    await expect(
      svc.generateFees(TENANT_A, FULL_USER, EVENT_ID, { confirm: true }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects when household_share_pct = 0 (use mark-school-funded)', async () => {
    const { svc } = build({
      event: { ...baseEvent, household_share_pct: 0 },
      studentRows: sampleStudents,
    });
    await expect(
      svc.generateFees(TENANT_A, FULL_USER, EVENT_ID, { confirm: true }),
    ).rejects.toThrow(/EVENT_BUDGET_FREE_TRIP|free/);
  });

  it('rejects when permission stack is incomplete', async () => {
    const { svc } = build({ event: baseEvent, studentRows: sampleStudents });
    const partialUser = { id: 'u', permissions: ['budgeting.view'] } as never;
    await expect(
      svc.generateFees(TENANT_A, partialUser, EVENT_ID, { confirm: true }),
    ).rejects.toThrow(/PERMISSION_STACK_DENIED|Missing/);
  });

  it('commits inside one transaction and updates the event row', async () => {
    const { svc, prisma, feeAssignments } = build({
      event: baseEvent,
      studentRows: sampleStudents,
    });
    const out = await svc.generateFees(TENANT_A, FULL_USER, EVENT_ID, { confirm: true });
    expect(feeAssignments.bulkCreate).toHaveBeenCalledTimes(1);
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
  });

  it('rolls back fully when bulkCreate throws — no partial state', async () => {
    const { svc, prisma, feeAssignments } = build({
      event: baseEvent,
      studentRows: sampleStudents,
    });
    feeAssignments.bulkCreate.mockRejectedValueOnce(new Error('payment provider down'));
    await expect(
      svc.generateFees(TENANT_A, FULL_USER, EVENT_ID, { confirm: true }),
    ).rejects.toThrow();
    // The transaction wrapper would roll back DB writes — confirm event row was NOT updated.
    expect(prisma.eventBudget.update).not.toHaveBeenCalled();
  });

  it('does not leak across tenants', async () => {
    // Tenant B asking for an event that exists in Tenant A → preview returns NotFound.
    const { svc } = build({ event: null }); // event findFirst returns null on cross-tenant query
    await expect(svc.previewGenerateFees(TENANT_B, EVENT_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('TripFeeIntegrationService — markSchoolFunded', () => {
  it('flips status when event is confirmed and free', async () => {
    const { svc, prisma } = build({
      event: { ...baseEvent, household_share_pct: 0 },
      studentRows: sampleStudents,
    });
    const out = await svc.markSchoolFunded(TENANT_A, FULL_USER, EVENT_ID);
    expect(out.status).toBe('fees_generated');
    expect(prisma.eventBudget.update).toHaveBeenCalled();
  });

  it('rejects when event is not free', async () => {
    const { svc } = build({ event: baseEvent, studentRows: sampleStudents });
    await expect(svc.markSchoolFunded(TENANT_A, FULL_USER, EVENT_ID)).rejects.toThrow(
      /EVENT_BUDGET_NOT_FREE/,
    );
  });

  it('requires permission stack', async () => {
    const { svc } = build({
      event: { ...baseEvent, household_share_pct: 0 },
      studentRows: sampleStudents,
    });
    const partialUser = { id: 'u', permissions: [] } as never;
    await expect(svc.markSchoolFunded(TENANT_A, partialUser, EVENT_ID)).rejects.toThrow(
      /PERMISSION_STACK_DENIED|Missing/,
    );
  });
});

// ─── Pure helper coverage ─────────────────────────────────────────────────

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
    expect(dates[0] < dates[1]).toBe(true);
    expect(dates[1] < dates[2]).toBe(true);
  });

  it('returns null when event has no date and no override', () => {
    expect(derivePaymentDates({ event_date: null, payment_plan: 'one_off' }, null)).toBeNull();
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
});
```

### 6. State machine — UPDATE

`docs/architecture/state-machines.md` — append the event-budget machine transitions added/modified by this phase:

- `confirmed → fees_generated` via `POST /generate-fees` (when `household_share_pct > 0`).
- `confirmed → fees_generated` via `POST /mark-school-funded` (when `household_share_pct = 0`).
- Side effects: writes `event_budgets.fee_structure_id`, `event_budgets.fee_generation_run_id`, transitions `event_budgets.status` to `fees_generated`. Also writes one `fee_structures` row and N `household_fee_assignments` rows (via `FeeAssignmentsService.bulkCreate`).
- Validation lives in `TripFeeIntegrationService` — guards both status and permission stack.

### 7. Architecture docs — UPDATE

- `docs/architecture/module-blast-radius.md` — add the new dependency: `BudgetingModule → FinanceModule (FeeAssignmentsService, FeeStructuresService)`. Note that this is the **only** budgeting → finance write edge.
- `docs/architecture/danger-zones.md` — add a danger-zone entry titled "Trip → Fee generation must be permission-stacked AND transactionally bounded" with the rationale (any drop of either guard creates a financial-mutation bypass) and the mitigation (the test suite asserts both invariants; `IMPLEMENTATION_LOG.md` Rule 11 + Rule 12 are the policy).

### 8. AppModule DI smoke

Required because the Budgeting module now imports `FinanceModule`. Run the smoke from `CLAUDE.md` before pushing.

## Testing requirements

- **`trip-fee-integration.service.spec.ts`** — every test in §5. Cover all four modes (free / cost_recovery / subsidised / payment_plan), the rollback path (bulkCreate throws → no event row update), the permission stack (each missing perm → 403), and the cross-tenant safety (Tenant B querying Tenant A's event → 404).
- **`trip-fee-integration.controller.spec.ts`** — optional but recommended one-liner spec confirming each route delegates with the right tenant/user wiring.
- **AppModule DI smoke** — required.
- **Regression** — `pnpm turbo run test --filter=@school/api` must pass.

## Post-deploy verification

1. Rsync to production. `chown -R edupod:edupod`. Build api. `pm2 restart api`.
2. Confirm `pm2 logs api --lines 100` shows the new module routes loaded (no NestJS DI errors at startup).
3. Hit the dry-run preview against an existing NHQS test trip:
   ```bash
   curl https://nhqs.edupod.app/api/v1/budgeting/event-budgets/<event-id>/generate-fees/preview \
     -H "Authorization: Bearer <owner-jwt>"
   ```
   Expect a 200 with `{mode, totals, households: [...]}`. **Confirm no DB writes** by re-checking the event row's `status` (should still be `confirmed`) and the `household_fee_assignments` count (unchanged).
4. The actual generate-fees flow is verified during Wave 4 impl 18 (Trip → Fee Generation Flow UI) — do not run a live generate against a real production tenant from this phase. NHQS test tenants are acceptable per project memory but coordinate with the user before pushing real invoice rows.

## Follow-ups for subsequent waves

- Phase 18 (Trip → Fee Generation Flow UI) builds the confirmation modal that consumes `GET /preview` and the confirm-button that fires `POST /generate-fees`. The dry-run shape returned here is the contract.
- Phase 21 (polish) will write the smoke test that covers the dry-run preview end-to-end (no live invoice issue).
- The `FeeAssignmentsService.bulkCreate()` signature is assumed to accept `(tx, tenantId, assignments[])` and return `{ run_id, count }`. If the existing service uses a different shape, adapt this implementation to it in the same commit — do not modify `FeeAssignmentsService`'s public API. If the existing service does not yet have a `bulkCreate` method, add it as a thin wrapper around its existing `create` loop in this commit (still inside one transaction).
- `FeeStructuresService.findOrCreateForEvent()` is also assumed; if missing, add it as a thin idempotent helper that uses `event_budget_id` as the dedup key and writes a `fee_structures` row tagged `key = event:<event_id>`.

## Rollback

`git revert <commit-sha>`. The schema is unchanged — Phase 01 owns those columns. Already-issued invoices via this phase persist (per `PLAN.md §10.4` — voiding goes through Finance, not Budgeting). If you need to roll back the in-flight invoices for a specific test trip, use the existing Finance UI's bulk-void.

The audit-log entries from `AuditLogInterceptor` remain — that's the canonical record of what happened.
