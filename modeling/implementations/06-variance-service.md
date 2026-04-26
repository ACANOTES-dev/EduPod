# Implementation 06 — Variance Service

> **Wave:** 2
> **Depends on:** 01, 02
> **Deploys:** API restart only

---

## Goal

Build the read-side variance service that tells a principal "where are we vs the plan?" — joining each line item from the model's latest published snapshot (or its base case if nothing has been published yet) against actuals from the existing **Finance** and **Payroll** modules. Reads from the materialised `variance_cache` table for speed; supports a manual-refresh action that enqueues the worker shipped in phase 08; supports a manual-actuals upsert path for ops categories that have no Finance/Payroll source (e.g. Operations → Maintenance).

This phase **reads** the cache and **writes only** when manual actuals come in; the nightly materialisation worker is phase 08's responsibility. Phase 06 must therefore tolerate empty cache rows without inventing zeros — see PLAN.md §8.4 ("No mock fallback").

The service also exposes the read-facade aggregator (`variance-actuals-source.service.ts`) that the phase 08 worker imports — co-locating it here keeps the budget→actual joins in one file regardless of who triggers them.

## What to change

### 1. New folder: `apps/api/src/modules/budgeting/variance/`

```
variance/
├── variance.controller.ts
├── variance.service.ts
├── variance-actuals-source.service.ts
└── variance.service.spec.ts
```

All four files are NEW. Wire into `BudgetingModule` (claimed under Rule 17 in `budgeting.module.ts`):

```typescript
providers: [VarianceService, VarianceActualsSourceService],
controllers: [VarianceController],
exports: [VarianceActualsSourceService],   // phase 08 worker imports it
```

Imports the existing `FinanceModule` (for `FinanceReadFacade`) and `PayrollModule` (for `PayrollReadFacade`). If those facades are not exported, that's a Phase 06 dependency to flag — but per `feature-map.md` they exist already (`apps/api/src/modules/finance/finance-read.facade.ts`, `apps/api/src/modules/payroll/payroll-read.facade.ts`).

### 2. `variance-actuals-source.service.ts` — read facade aggregator

Pure read service. Joins the live `Invoice`, `Payment`, `PayrollEntry` tables into a `Record<line_item_key, number>` keyed by the same composite line-item key the engine emits (`income.tuition_net`, `staff_costs.<department_id>`, `operations.utilities`, etc.).

```typescript
import { Injectable, Logger } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { FinanceReadFacade } from '../../finance/finance-read.facade';
import { PayrollReadFacade } from '../../payroll/payroll-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

import type { VarianceCachePeriodType } from '@school/shared';

export interface ActualsForPeriod {
  // line_item_key (e.g. "income.tuition_net") → amount in tenant currency
  byLineItemKey: Record<string, number>;
  manual_overrides: Record<string, number>; // keys where the user logged a manual actual
}

@Injectable()
export class VarianceActualsSourceService {
  private readonly logger = new Logger(VarianceActualsSourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeFacade: FinanceReadFacade,
    private readonly payrollFacade: PayrollReadFacade,
  ) {}

  /**
   * For one tenant + one period, return actuals indexed by line_item_key.
   * Manual entries in `variance_cache` (where the user typed the actual directly)
   * take precedence over auto-derived numbers for the same key.
   */
  async getActualsForPeriod(
    tenant_id: string,
    parent_model_id: string,
    period_type: VarianceCachePeriodType,
    period_label: string,
    period_start: Date,
    period_end: Date,
  ): Promise<ActualsForPeriod> {
    const byLineItemKey: Record<string, number> = {};

    // ─── Tuition net ──────────────────────────────────────────────────────
    // Tuition revenue ≈ sum of Payment.amount where Payment.status = 'received'
    // and received_at falls inside the period — net of any refunds executed
    // in the same window.
    const tuition = await this.financeFacade.sumPaymentsForPeriod(
      tenant_id,
      period_start,
      period_end,
    );
    byLineItemKey['income.tuition_net'] = round2(tuition.received - tuition.refunded);
    byLineItemKey['income.tuition_gross'] = round2(tuition.received);

    // ─── Donations / grants ──────────────────────────────────────────────
    // Until we ship a dedicated income-source enum, these come from manual
    // actuals only — auto value is 0.
    byLineItemKey['income.donations'] = 0;
    byLineItemKey['income.grants'] = 0;

    // ─── Staff costs by department ───────────────────────────────────────
    const staffByDept = await this.payrollFacade.sumPayrollEntriesByDepartmentForPeriod(
      tenant_id,
      period_start,
      period_end,
    );
    for (const row of staffByDept) {
      byLineItemKey[`staff_costs.${row.department_id}`] = round2(row.total_pay);
    }

    // ─── Operations / capital ────────────────────────────────────────────
    // No Finance/Payroll source — relies entirely on manual actuals merged in below.

    // ─── Manual override merge ───────────────────────────────────────────
    const manualRows = await this.prisma.varianceCache.findMany({
      where: {
        tenant_id,
        parent_model_id,
        period_type,
        period_label,
        // We tag manual entries by setting drivers_json.manual = true in writes.
      },
      select: { line_item_key: true, actual: true, drivers_json: true },
    });
    const manual_overrides: Record<string, number> = {};
    for (const row of manualRows) {
      const isManual = (row.drivers_json as { manual?: boolean } | null)?.manual === true;
      if (isManual) {
        const v = Number(row.actual);
        manual_overrides[row.line_item_key] = v;
        byLineItemKey[row.line_item_key] = v; // override auto-derived
      }
    }

    return { byLineItemKey, manual_overrides };
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
```

**Facade methods this service depends on**:

- `FinanceReadFacade.sumPaymentsForPeriod(tenant_id, from, to): Promise<{ received: number; refunded: number }>` — verify it exists; if not, add it as a one-line aggregation. The facade pattern is `prisma.payment.aggregate({ _sum: { amount: true }, where: { tenant_id, status: 'received', received_at: { gte, lte } } })` paired with a refunds aggregate.
- `PayrollReadFacade.sumPayrollEntriesByDepartmentForPeriod(tenant_id, from, to): Promise<Array<{ department_id: string; total_pay: number }>>` — joins `PayrollEntry` to `StaffProfile.department_id` and groups. If the facade lacks this, add it; else build it inside this service via a direct read (no RLS transaction needed for reads, per the FinanceReadFacade convention).

If either facade method is missing, the budgeting service file may add it directly to the facade in the same commit. Update `feature-map.md` is **not** required at this phase (Rule 14).

### 3. `variance.service.ts` — main service

```typescript
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import {
  manualActualEntrySchema,
  varianceQuerySchema,
  type ManualActualEntryDto,
  type VarianceCachePeriodType,
  type VarianceRow,
} from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { VarianceActualsSourceService } from './variance-actuals-source.service';

@Injectable()
export class VarianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actualsSource: VarianceActualsSourceService,
    @InjectQueue('budgeting') private readonly budgetingQueue: Queue,
  ) {}

  // GET /v1/budgeting/financial-models/:id/variance
  async getVariance(
    tenant_id: string,
    model_id: string,
    period_type: VarianceCachePeriodType,
    period_label?: string,
  ) {
    const model = await this.prisma.financialModel.findFirst({
      where: { id: model_id, tenant_id },
      select: { id: true, current_snapshot_id: true, status: true },
    });
    if (!model) {
      throw new NotFoundException({
        code: 'FINANCIAL_MODEL_NOT_FOUND',
        message: `Financial model "${model_id}" not found`,
      });
    }

    const where: Record<string, unknown> = {
      tenant_id,
      parent_model_id: model_id,
      period_type,
    };
    if (period_label) where.period_label = period_label;

    const rows = await this.prisma.varianceCache.findMany({
      where,
      orderBy: [{ period_label: 'asc' }, { line_item_key: 'asc' }],
    });

    const snapshot_id = rows[0]?.snapshot_id ?? model.current_snapshot_id ?? null;
    const refreshed_at = rows.reduce<Date | null>((acc, r) => {
      const t = r.refreshed_at;
      return !acc || t > acc ? t : acc;
    }, null);

    const data: VarianceRow[] = rows.map((r) => {
      const [category, subcategory] = r.line_item_key.split('.');
      return {
        category: category ?? 'unknown',
        subcategory: subcategory ?? r.line_item_key,
        line_item_key: r.line_item_key,
        period_label: r.period_label,
        planned: Number(r.planned),
        actual: Number(r.actual),
        variance: Number(r.variance),
        variance_pct: Number(r.variance_pct),
        drivers_json: (r.drivers_json as Record<string, unknown> | null) ?? null,
      };
    });

    return {
      data,
      meta: {
        snapshot_id,
        refreshed_at: refreshed_at?.toISOString() ?? null,
        period_type,
        period_label: period_label ?? null,
        is_empty: rows.length === 0,
      },
    };
  }

  // POST /v1/budgeting/financial-models/:id/variance/refresh
  async enqueueRefresh(tenant_id: string, model_id: string) {
    const model = await this.prisma.financialModel.findFirst({
      where: { id: model_id, tenant_id },
      select: { id: true },
    });
    if (!model) {
      throw new NotFoundException({
        code: 'FINANCIAL_MODEL_NOT_FOUND',
        message: `Financial model "${model_id}" not found`,
      });
    }

    const job = await this.budgetingQueue.add(
      'budgeting:variance-refresh',
      { tenant_id, parent_model_id: model_id, manual: true },
      { removeOnComplete: 10, removeOnFail: 50 },
    );
    return { run_id: job.id, status: 'queued' as const };
  }

  // POST /v1/budgeting/financial-models/:id/variance/manual-actuals
  async upsertManualActual(tenant_id: string, model_id: string, dto: ManualActualEntryDto) {
    const model = await this.prisma.financialModel.findFirst({
      where: { id: model_id, tenant_id },
      select: { id: true, current_snapshot_id: true },
    });
    if (!model) {
      throw new NotFoundException({
        code: 'FINANCIAL_MODEL_NOT_FOUND',
        message: `Financial model "${model_id}" not found`,
      });
    }

    // Look up existing planned value to recompute variance + variance_pct.
    const rls = createRlsClient(this.prisma, { tenant_id });
    return rls.$transaction(async (tx) => {
      const existing = await (tx as unknown as PrismaService).varianceCache.findFirst({
        where: {
          tenant_id,
          parent_model_id: model_id,
          period_type: dto.period_type,
          period_label: dto.period_label,
          line_item_key: dto.line_item_key,
        },
      });
      const planned = existing ? Number(existing.planned) : 0;
      const actual = Number(dto.amount);
      const variance = round2(actual - planned);
      const variance_pct = planned !== 0 ? round2(((actual - planned) / planned) * 100) : 0;

      const drivers_json = {
        ...((existing?.drivers_json as Record<string, unknown> | null) ?? {}),
        manual: true,
        manual_entered_at: new Date().toISOString(),
      };

      if (existing) {
        return (tx as unknown as PrismaService).varianceCache.update({
          where: { id: existing.id },
          data: {
            actual,
            variance,
            variance_pct,
            drivers_json,
            refreshed_at: new Date(),
          },
        });
      }
      return (tx as unknown as PrismaService).varianceCache.create({
        data: {
          tenant_id,
          parent_model_id: model_id,
          snapshot_id: model.current_snapshot_id ?? null,
          period_type: dto.period_type,
          period_label: dto.period_label,
          line_item_key: dto.line_item_key,
          planned,
          actual,
          variance,
          variance_pct,
          drivers_json,
          refreshed_at: new Date(),
        },
      });
    });
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
```

### 4. `variance.controller.ts`

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
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  manualActualEntrySchema,
  varianceQuerySchema,
  type ManualActualEntryDto,
  type TenantContext,
  type VarianceQueryDto,
} from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { VarianceService } from './variance.service';

@Controller('v1/budgeting/financial-models/:id/variance')
@UseGuards(AuthGuard, PermissionGuard)
export class VarianceController {
  constructor(private readonly variance: VarianceService) {}

  // GET /v1/budgeting/financial-models/:id/variance
  @Get()
  @RequiresPermission('budgeting.view')
  async getVariance(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Query(new ZodValidationPipe(varianceQuerySchema)) query: VarianceQueryDto,
  ) {
    return this.variance.getVariance(
      tenant.tenant_id,
      modelId,
      query.period_type,
      query.period_label,
    );
  }

  // POST /v1/budgeting/financial-models/:id/variance/refresh
  @Post('refresh')
  @RequiresPermission('budgeting.view')
  @HttpCode(HttpStatus.ACCEPTED)
  async refresh(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
  ) {
    return this.variance.enqueueRefresh(tenant.tenant_id, modelId);
  }

  // POST /v1/budgeting/financial-models/:id/variance/manual-actuals
  @Post('manual-actuals')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  async upsertManual(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Body(new ZodValidationPipe(manualActualEntrySchema)) dto: ManualActualEntryDto,
  ) {
    return this.variance.upsertManualActual(tenant.tenant_id, modelId, dto);
  }
}
```

### 5. Shared Zod schemas — additions to `packages/shared/src/budgeting/variance.ts`

Phase 01 created the stub; this phase fleshes it out:

```typescript
export const varianceQuerySchema = z.object({
  period_type: varianceCachePeriodTypeSchema.default('month'),
  period_label: z.string().max(32).optional(),
});
export type VarianceQueryDto = z.infer<typeof varianceQuerySchema>;

export const manualActualEntrySchema = z.object({
  period_type: varianceCachePeriodTypeSchema,
  period_label: z.string().max(32),
  line_item_key: z
    .string()
    .max(128)
    .regex(/^[a-z_]+\.[a-zA-Z0-9_-]+$/),
  amount: z.number().min(0).max(1e10),
});
export type ManualActualEntryDto = z.infer<typeof manualActualEntrySchema>;

export type VarianceRow = {
  category: string;
  subcategory: string;
  line_item_key: string;
  period_label: string;
  planned: number;
  actual: number;
  variance: number;
  variance_pct: number;
  drivers_json: Record<string, unknown> | null;
};
```

Re-export from `packages/shared/src/budgeting/index.ts`.

### 6. Wiring

`apps/api/src/modules/budgeting/budgeting.module.ts` (claimed under Rule 17) registers the BullMQ queue and imports finance + payroll:

```typescript
@Module({
  imports: [
    BullModule.registerQueue({ name: 'budgeting' }),
    FinanceModule, // exports FinanceReadFacade
    PayrollModule, // exports PayrollReadFacade
  ],
  providers: [VarianceService, VarianceActualsSourceService],
  controllers: [VarianceController],
  exports: [VarianceActualsSourceService],
})
export class BudgetingModule {}
```

Per Rule 6, run the AppModule DI smoke after wiring before pushing.

## Testing requirements

- **`variance.service.spec.ts`** — co-located. Mock `PrismaService`, `VarianceActualsSourceService`, and the BullMQ queue (`getQueueToken('budgeting')`).
  - **happy path**: `getVariance` returns rows; meta includes `snapshot_id`, `refreshed_at`.
  - **empty cache**: returns `{ data: [], meta: { is_empty: true } }` — does NOT fabricate zeros.
  - **404**: model not found → `NotFoundException` with code `FINANCIAL_MODEL_NOT_FOUND`.
  - **`enqueueRefresh`**: calls `budgetingQueue.add` with the right job name + payload; returns `{ run_id, status: 'queued' }`.
  - **`upsertManualActual`** when no existing row: creates a row with `planned = 0`, `actual = dto.amount`, `variance = actual`, `variance_pct = 0`, `drivers_json.manual = true`.
  - **`upsertManualActual`** when existing row: keeps the original `planned`, recomputes variance + pct, sets `manual: true`.
  - **variance % math**: planned=100, actual=120 → variance=20, variance_pct=20. planned=0, actual=50 → variance=50, variance_pct=0 (no division by zero).

- **`variance-actuals-source.service.spec.ts`** — separate spec.
  - mocks `FinanceReadFacade.sumPaymentsForPeriod` returning `{ received: 50000, refunded: 1000 }` → `byLineItemKey['income.tuition_net']` = 49000.
  - mocks `PayrollReadFacade.sumPayrollEntriesByDepartmentForPeriod` returning two department rows → emits `staff_costs.<dept_id>` keys.
  - existing `varianceCache` row with `drivers_json.manual = true` overrides the auto-derived value for the same key.
  - operations / capital keys absent when no manual entries — they don't appear in the result map.

- **RLS leakage spec** — `apps/api/test/budgeting-variance.rls.spec.ts`. Create a `variance_cache` row as Tenant A, authenticate as Tenant B, hit `GET /v1/budgeting/financial-models/<modelA>/variance` → 404 (the model isn't visible) AND a direct cache read with Tenant B's RLS context returns no rows.

- **Reuse the existing test fixtures** in `apps/api/test/setup-env.ts` and the established `buildMockPrisma()` / `buildMockRedis()` helpers from neighbouring specs.

- **Coverage**: per-impl floor — every method in both services needs at least one positive + one negative path before deploying (Rule 23).

## Post-deploy verification

1. SSH into production. `pm2 restart api`. Health check → 200.
2. Login to NHQS as `owner@nhqs.test`. Hit `GET /api/v1/budgeting/financial-models/<seed-model-id>/variance?period_type=month` via `browser_evaluate` (Rule 27a) — confirm a `200` and `meta.is_empty: true` (no cache yet, no worker has run).
3. POST a manual actual:
   ```
   curl -X POST .../variance/manual-actuals \
     -H "Authorization: Bearer <token>" \
     -d '{"period_type":"month","period_label":"Sep 2026","line_item_key":"operations.maintenance","amount":1250.00}'
   ```
   Confirm 200 and a row landed in `variance_cache` (`SELECT * FROM variance_cache WHERE drivers_json->>'manual' = 'true' LIMIT 1`).
4. Re-fetch the GET endpoint — the manual row should now appear with `planned: 0`, `actual: 1250`, `variance: 1250`.
5. POST `/refresh` — confirm a job lands in BullMQ (`SELECT * FROM bull WHERE queue = 'budgeting'` via redis-cli `LRANGE bull:budgeting:wait 0 -1`). Job will sit unprocessed until phase 08 ships the worker — that's expected.
6. RLS spot-check: connect as `stress-a` tenant context and confirm no rows from NHQS leak.

## Follow-ups for subsequent waves

- **Phase 08 (variance-refresh worker)** consumes `VarianceActualsSourceService` and writes the materialised rows. The worker MUST preserve manual entries — its dedupe rule is "wipe non-manual rows for the model, then upsert". Add a comment in the worker code referencing this implementation.
- **Phase 15 (Variance Dashboard UI)** consumes `GET /variance` and surfaces `meta.is_empty` as the "Variance will be available once the model is published and the academic year begins" empty-state copy from PLAN.md §8.4.
- **Phase 09 (PDF/Excel export)** uses `getVariance(...)` to populate the variance summary appendix — confirm the row shape suits the renderer.
- **Architecture docs (Phase 21):** add `budgeting → finance.FinanceReadFacade` and `budgeting → payroll.PayrollReadFacade` to `module-blast-radius.md`. State machines do not change in this phase.
- **`drivers_json` shape note for phase 08:** the worker computes the "drivers of variance" decomposition for tuition lines (`enrollment_delta_amount`, `fee_delta_amount`, `discount_delta_amount`) by reading `computed_from` from each line item in the published snapshot. Phase 06 does **not** compute this — it only persists what's there. This is intentional separation.

## Rollback

`git revert <commit-sha>`. No DB changes. Manual actuals already written via the endpoint stay in `variance_cache`; if reverting after such writes, leave the rows in place — they're tenant-owned data and the next deploy of phase 06 will pick them up unchanged. If reverting before any manual actual is written, the rollback is a clean code-only revert.
