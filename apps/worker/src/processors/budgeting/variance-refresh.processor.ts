import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job names ────────────────────────────────────────────────────────────────

export const BUDGETING_VARIANCE_REFRESH_JOB = 'budgeting:variance-refresh';
export const BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB = 'budgeting:variance-refresh-bootstrap';

// ─── Payload types ────────────────────────────────────────────────────────────

export interface VarianceRefreshPayload {
  tenant_id?: string;
  /**
   * When set: refresh only that model. Otherwise refresh every published
   * model whose fiscal year is in progress.
   */
  parent_model_id?: string;
  triggered_by?: 'cron' | 'manual';
  /**
   * Phase 06's `enqueueRefresh` posts `{ tenant_id, parent_model_id, manual: true }`.
   * Treat the legacy `manual` flag as `triggered_by: 'manual'`.
   */
  manual?: boolean;
}

interface ScopedVarianceRefreshPayload extends TenantJobPayload {
  parent_model_id?: string;
  triggered_by?: 'cron' | 'manual';
}

// ─── Processor (queue boundary, delegates to TenantAwareJob) ──────────────────

@Injectable()
export class VarianceRefreshProcessor {
  private readonly logger = new Logger(VarianceRefreshProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.BUDGETING) private readonly budgetingQueue: Queue,
  ) {}

  async process(job: Job<VarianceRefreshPayload>): Promise<void> {
    if (job.name === BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB) {
      await this.bootstrapPerTenantJobs();
      return;
    }
    if (job.name !== BUDGETING_VARIANCE_REFRESH_JOB) return;

    const { tenant_id, parent_model_id, triggered_by, manual } = job.data;
    if (!tenant_id) {
      this.logger.warn(`${BUDGETING_VARIANCE_REFRESH_JOB} received without tenant_id — rejected`);
      return;
    }

    const refreshJob = new VarianceRefreshJob(this.prisma);
    await refreshJob.execute({
      tenant_id,
      parent_model_id,
      triggered_by: triggered_by ?? (manual ? 'manual' : 'cron'),
    });
  }

  /**
   * Cross-tenant bootstrap — ensures every active tenant has a per-tenant
   * `cron:budgeting:variance-refresh:<tenant_id>` repeatable registered.
   *
   * Runs daily at 01:50 UTC (the registration in `CronSchedulerService`)
   * so newly-onboarded tenants are picked up the next morning. Idempotent
   * — re-adding a repeatable with the same `jobId` is a no-op in BullMQ.
   */
  private async bootstrapPerTenantJobs(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, timezone: true },
    });

    this.logger.log(
      `Bootstrapping variance-refresh repeatables for ${tenants.length} active tenants`,
    );

    for (const tenant of tenants) {
      const jobId = `cron:${BUDGETING_VARIANCE_REFRESH_JOB}:${tenant.id}`;
      await this.budgetingQueue.add(
        BUDGETING_VARIANCE_REFRESH_JOB,
        { tenant_id: tenant.id, triggered_by: 'cron' as const },
        {
          repeat: { pattern: '0 2 * * *', tz: tenant.timezone || 'Europe/Dublin' },
          jobId,
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      );
    }
  }
}

// ─── TenantAwareJob — RLS-bound execution ─────────────────────────────────────

class VarianceRefreshJob extends TenantAwareJob<ScopedVarianceRefreshPayload> {
  private readonly logger = new Logger(VarianceRefreshJob.name);

  protected async processJob(data: ScopedVarianceRefreshPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, parent_model_id, triggered_by } = data;
    const now = new Date();

    // Find published models whose fiscal year covers the current date. If
    // `parent_model_id` is supplied (manual-refresh endpoint), narrow to that
    // single model — but still enforce the same active-published predicate
    // so we never materialise variance for a model that has no useful
    // planned/actual semantics.
    const where: Prisma.FinancialModelWhereInput = {
      tenant_id,
      status: 'published',
      fiscal_year_start: { lte: now },
      fiscal_year_end: { gte: now },
      ...(parent_model_id ? { id: parent_model_id } : {}),
    };
    const models = await tx.financialModel.findMany({
      where,
      select: {
        id: true,
        name: true,
        fiscal_year_start: true,
        fiscal_year_end: true,
        current_snapshot_id: true,
      },
    });

    if (models.length === 0) {
      this.logger.log(
        `No active published models for tenant ${tenant_id} — refresh is a no-op (${triggered_by})`,
      );
      return;
    }

    let totalRowsWritten = 0;
    for (const model of models) {
      const written = await this.refreshModel(tx, tenant_id, model);
      totalRowsWritten += written;
    }

    this.logger.log(
      `${BUDGETING_VARIANCE_REFRESH_JOB} done — tenant=${tenant_id} ` +
        `models=${models.length} rows_written=${totalRowsWritten} ` +
        `triggered_by=${triggered_by}`,
    );
  }

  private async refreshModel(
    tx: PrismaClient,
    tenant_id: string,
    model: {
      id: string;
      name: string;
      fiscal_year_start: Date;
      fiscal_year_end: Date;
      current_snapshot_id: string | null;
    },
  ): Promise<number> {
    // 1. Wipe the model's existing variance rows so this run is fully
    //    idempotent — re-running a refresh produces the same final state.
    await tx.varianceCache.deleteMany({
      where: { tenant_id, parent_model_id: model.id },
    });

    if (!model.current_snapshot_id) {
      this.logger.warn(
        `Model ${model.id} has no current_snapshot_id — skipping (cannot derive planned values)`,
      );
      return 0;
    }

    // 2. Load the snapshot's payload.
    const snapshot = await tx.financialModelSnapshot.findUnique({
      where: { id: model.current_snapshot_id },
      select: { id: true, payload: true },
    });
    if (!snapshot) {
      this.logger.warn(
        `Snapshot ${model.current_snapshot_id} not found for model ${model.id} — skipping`,
      );
      return 0;
    }

    const planned = extractPlannedLineItemsFromSnapshot(snapshot.payload);
    if (planned.length === 0) {
      this.logger.warn(`Snapshot ${snapshot.id} has no line_items in payload — skipping`);
      return 0;
    }

    // 3. For each (period_type, period_label) determine the period range and
    //    fetch actuals via the same SQL contract as Phase 06's
    //    VarianceActualsSourceService. The mapping is deliberately mirrored
    //    here — workers cannot DI API services across the process boundary.
    const today = new Date();
    const rowsToInsert: Prisma.VarianceCacheCreateManyInput[] = [];

    for (const periodType of ['month', 'term', 'year'] as const) {
      const periods = generatePeriods(
        periodType,
        model.fiscal_year_start,
        model.fiscal_year_end,
        today,
      );
      for (const period of periods) {
        const actuals = await fetchActualsForPeriod(tx, tenant_id, period.start, period.end);
        for (const item of planned) {
          const plannedAmount = prorate(item.amount, periodType);
          const actualAmount = actuals[item.line_item_key] ?? 0;
          const variance = round2(actualAmount - plannedAmount);
          const variancePct =
            plannedAmount === 0 ? 0 : round2((variance / Math.abs(plannedAmount)) * 100);
          rowsToInsert.push({
            tenant_id,
            parent_model_id: model.id,
            snapshot_id: snapshot.id,
            period_type: periodType,
            period_label: period.label,
            line_item_key: item.line_item_key,
            planned: new Prisma.Decimal(plannedAmount),
            actual: new Prisma.Decimal(actualAmount),
            variance: new Prisma.Decimal(variance),
            variance_pct: new Prisma.Decimal(variancePct),
            drivers_json: item.drivers_json !== null ? item.drivers_json : Prisma.JsonNull,
          });
        }
      }
    }

    if (rowsToInsert.length > 0) {
      await tx.varianceCache.createMany({ data: rowsToInsert });
    }

    return rowsToInsert.length;
  }
}

// ─── Helpers (pure — exported for spec coverage) ──────────────────────────────

interface PlannedLineItem {
  line_item_key: string;
  amount: number;
  drivers_json: Prisma.InputJsonValue | null;
}

interface SnapshotLineItemShape {
  category?: string;
  subcategory?: string;
  fiscal_year?: number;
  amount?: number | string;
  computed_from?: unknown;
}

interface BaseCaseShape {
  line_items?: SnapshotLineItemShape[];
}

interface PayloadShape {
  base_case?: BaseCaseShape;
  line_items?: SnapshotLineItemShape[];
}

/**
 * Pull a flat planned-line-item array out of a snapshot's serialised
 * payload. Phase 05's payload nests live line items under `base_case.line_items`;
 * we also accept a flat `line_items` (older snapshots / a future flatter
 * payload) so a mid-flight schema bump doesn't break refresh runs.
 *
 * Composite `line_item_key = `${category}.${subcategory}` — matches the
 * lookup key used by Phase 06's `VarianceActualsSourceService` and the
 * variance dashboard.
 */
export function extractPlannedLineItemsFromSnapshot(payload: unknown): PlannedLineItem[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as PayloadShape;
  const items: SnapshotLineItemShape[] = obj.base_case?.line_items ?? obj.line_items ?? [];
  if (!Array.isArray(items)) return [];

  return items
    .filter(
      (li) =>
        typeof li === 'object' &&
        li !== null &&
        typeof li.category === 'string' &&
        typeof li.subcategory === 'string' &&
        // Variance is computed against fiscal_year=1 only — the active year.
        // Multi-year horizons are visualised by the dashboard's year toggle
        // but only year 1 has live planned↔actual semantics.
        li.fiscal_year === 1,
    )
    .map((li) => ({
      line_item_key: `${li.category}.${li.subcategory}`,
      amount: Number(li.amount) || 0,
      drivers_json:
        li.computed_from !== undefined && li.computed_from !== null
          ? (li.computed_from as Prisma.InputJsonValue)
          : null,
    }));
}

/**
 * Generate the labelled period ranges for a given period_type up to and
 * including today. Beyond today: not generated (no actuals to compare against).
 */
export function generatePeriods(
  periodType: 'month' | 'term' | 'year',
  fyStart: Date,
  fyEnd: Date,
  today: Date,
): Array<{ label: string; start: Date; end: Date }> {
  const cutoff = today < fyEnd ? today : fyEnd;
  if (periodType === 'year') {
    return [
      {
        label: formatYearLabel(fyStart, fyEnd),
        start: fyStart,
        end: cutoff,
      },
    ];
  }
  if (periodType === 'month') {
    const out: Array<{ label: string; start: Date; end: Date }> = [];
    let cursor = new Date(Date.UTC(fyStart.getUTCFullYear(), fyStart.getUTCMonth(), 1));
    while (cursor <= cutoff) {
      const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      out.push({
        label: formatMonthLabel(cursor),
        start: cursor,
        end: new Date(Math.min(next.getTime() - 1, cutoff.getTime())),
      });
      cursor = next;
    }
    return out;
  }
  // term — three even thirds of the fiscal year
  const totalMs = fyEnd.getTime() - fyStart.getTime();
  const thirdMs = totalMs / 3;
  const out: Array<{ label: string; start: Date; end: Date }> = [];
  for (let t = 0; t < 3; t++) {
    const start = new Date(fyStart.getTime() + t * thirdMs);
    const end = new Date(fyStart.getTime() + (t + 1) * thirdMs - 1);
    if (start > cutoff) break;
    out.push({
      label: `Term ${t + 1} ${formatYearLabel(fyStart, fyEnd)}`,
      start,
      end: end > cutoff ? cutoff : end,
    });
  }
  return out;
}

/** Annual planned → period planned. Monthly = ÷12, Term = ÷3, Year = unchanged. */
export function prorate(annualAmount: number, periodType: 'month' | 'term' | 'year'): number {
  if (periodType === 'month') return round2(annualAmount / 12);
  if (periodType === 'term') return round2(annualAmount / 3);
  return round2(annualAmount);
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatYearLabel(start: Date, end: Date): string {
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();
  return sy === ey ? String(sy) : `${sy}/${String(ey).slice(2)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Fetch actuals for a period. The mapping must stay in lock-step with
 * Phase 06's `VarianceActualsSourceService` — when that service adds a
 * category, mirror the same join here so cron and on-demand variance
 * agree byte-for-byte.
 */
async function fetchActualsForPeriod(
  tx: PrismaClient,
  tenant_id: string,
  start: Date,
  end: Date,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};

  // Tuition — sum payments received in the period (matches PLAN.md §8.1).
  const paymentsAgg = await tx.payment.aggregate({
    where: {
      tenant_id,
      status: 'posted',
      received_at: { gte: start, lte: end },
    },
    _sum: { amount: true },
  });
  const refundsAgg = await tx.refund.aggregate({
    where: {
      tenant_id,
      status: 'executed',
      executed_at: { gte: start, lte: end },
    },
    _sum: { amount: true },
  });
  const received = Number(paymentsAgg._sum.amount ?? 0);
  const refunded = Number(refundsAgg._sum.amount ?? 0);
  out['income.tuition_gross'] = round2(received);
  out['income.tuition_net'] = round2(received - refunded);

  // Staff costs by department — mirrors PayrollReadFacade.sumPayrollEntriesByDepartmentForPeriod.
  const months = enumerateMonthsInRange(start, end);
  if (months.length > 0) {
    const runs = await tx.payrollRun.findMany({
      where: {
        tenant_id,
        OR: months.map((cursor) => ({
          period_year: cursor.year,
          period_month: cursor.month,
        })),
      },
      select: { id: true },
    });
    if (runs.length > 0) {
      const entries = await tx.payrollEntry.findMany({
        where: {
          tenant_id,
          payroll_run_id: { in: runs.map((r) => r.id) },
        },
        select: {
          total_pay: true,
          override_total_pay: true,
          staff_profile: { select: { department: true } },
        },
      });
      const tally = new Map<string, number>();
      for (const e of entries) {
        const dept = e.staff_profile?.department ?? null;
        const slug = slugifyDepartment(dept);
        const pay = Number(e.override_total_pay ?? e.total_pay);
        tally.set(slug, (tally.get(slug) ?? 0) + pay);
      }
      for (const [slug, total] of tally.entries()) {
        out[`staff_costs.${slug}`] = round2(total);
      }
    }
  }

  return out;
}

function enumerateMonthsInRange(start: Date, end: Date): Array<{ year: number; month: number }> {
  if (start > end) return [];
  const out: Array<{ year: number; month: number }> = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function slugifyDepartment(dept: string | null): string {
  if (!dept) return 'unassigned';
  const slug = dept
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'unassigned';
}
