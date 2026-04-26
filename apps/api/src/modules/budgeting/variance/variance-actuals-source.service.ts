import { Injectable, Logger } from '@nestjs/common';

import type { VarianceCachePeriodType } from '@school/shared/budgeting';

import { FinanceReadFacade } from '../../finance/finance-read.facade';
import { PayrollReadFacade } from '../../payroll/payroll-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * VarianceActualsSourceService — the read aggregator used by the
 * Phase 08 variance-refresh worker (and any future code path that
 * needs to compose a "live actuals" snapshot for a tenant period).
 *
 * Joins:
 *  - `Payment` / `Refund`            → tuition lines (income.tuition_*).
 *  - `PayrollEntry`                  → staff_costs.<department> lines.
 *  - `variance_cache` manual entries → user-typed actuals for ops /
 *    capital lines that have no upstream source.
 *
 * Returns `{ byLineItemKey, manual_overrides }` keyed by the same
 * composite key the engine emits — `<category>.<subcategory_or_slug>`.
 *
 * The service is colocated with the variance read service to keep all
 * budget→actual joins in one place; Phase 08 imports it directly.
 */

export interface ActualsForPeriod {
  /** `line_item_key` → amount in tenant currency. */
  byLineItemKey: Record<string, number>;
  /** Subset of `byLineItemKey` whose values came from a manual entry
   *  (`drivers_json.manual === true` on the `variance_cache` row). The
   *  Phase 08 worker uses this to skip overwriting manual entries on
   *  refresh. */
  manual_overrides: Record<string, number>;
}

@Injectable()
export class VarianceActualsSourceService {
  private readonly logger = new Logger(VarianceActualsSourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeFacade: FinanceReadFacade,
    private readonly payrollFacade: PayrollReadFacade,
  ) {}

  async getActualsForPeriod(
    tenant_id: string,
    parent_model_id: string,
    period_type: VarianceCachePeriodType,
    period_label: string,
    period_start: Date,
    period_end: Date,
  ): Promise<ActualsForPeriod> {
    const byLineItemKey: Record<string, number> = {};

    // ─── Tuition net + gross ──────────────────────────────────────────────
    const tuition = await this.financeFacade.sumPaymentsForPeriod(
      tenant_id,
      period_start,
      period_end,
    );
    byLineItemKey['income.tuition_gross'] = round2(tuition.received);
    byLineItemKey['income.tuition_net'] = round2(tuition.received - tuition.refunded);

    // ─── Donations / grants ──────────────────────────────────────────────
    // Until a dedicated income-source enum lands, these come from manual
    // actuals only — the auto-derived value is 0 (the variance UI shows
    // a "no upstream source — log a manual actual" hint).
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
    // No upstream source — relies entirely on manual actuals merged in
    // below. The variance worker will write `planned: 0, actual: 0`
    // rows for these keys to keep the variance grid complete.

    // ─── Manual overrides ────────────────────────────────────────────────
    const manualRows = await this.prisma.varianceCache.findMany({
      where: {
        tenant_id,
        parent_model_id,
        period_type,
        period_label,
      },
      select: { line_item_key: true, actual: true, drivers_json: true },
    });
    const manual_overrides: Record<string, number> = {};
    for (const row of manualRows) {
      const meta = row.drivers_json as { manual?: boolean } | null;
      if (meta?.manual === true) {
        const v = Number(row.actual);
        manual_overrides[row.line_item_key] = v;
        // Manual entries take precedence over auto-derived values.
        byLineItemKey[row.line_item_key] = v;
      }
    }

    return { byLineItemKey, manual_overrides };
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
