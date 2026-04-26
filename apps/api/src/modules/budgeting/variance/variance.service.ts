import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import type { VarianceCachePeriodType, VarianceRow } from '@school/shared/budgeting';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import type { ManualActualEntryDto } from './dto/manual-actual-entry.dto';

/**
 * VarianceService — read variance rows from the materialised
 * `variance_cache` table; manually upsert ops actuals; enqueue a
 * worker-refresh job. The nightly variance-refresh worker (Phase 08)
 * is the only writer for non-manual rows.
 *
 * Variance rows are composed by joining a model's snapshot/base-case
 * planned values against actuals from Finance + Payroll modules.
 * Phase 06 reads only — Phase 08's worker writes the planned/actual
 * pairs.
 *
 * Empty cache returns `{ data: [], meta: { is_empty: true } }`. We
 * never fabricate zeros (per modeling/PLAN.md §8.4 "No mock fallback"
 * — the UI surfaces an empty-state hint instead).
 */

interface VarianceCacheRow {
  id: string;
  snapshot_id: string | null;
  period_type: VarianceCachePeriodType;
  period_label: string;
  line_item_key: string;
  planned: Prisma.Decimal | number;
  actual: Prisma.Decimal | number;
  variance: Prisma.Decimal | number;
  variance_pct: Prisma.Decimal | number;
  drivers_json: Prisma.JsonValue;
  refreshed_at: Date;
}

export interface VarianceListResponse {
  data: VarianceRow[];
  meta: {
    snapshot_id: string | null;
    refreshed_at: string | null;
    period_type: VarianceCachePeriodType;
    period_label: string | null;
    is_empty: boolean;
  };
}

@Injectable()
export class VarianceService {
  private readonly logger = new Logger(VarianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('budgeting') private readonly budgetingQueue: Queue,
  ) {}

  // ─── getVariance ──────────────────────────────────────────────────────

  async getVariance(
    tenant_id: string,
    model_id: string,
    period_type: VarianceCachePeriodType,
    period_label?: string,
  ): Promise<VarianceListResponse> {
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

    const where: Prisma.VarianceCacheWhereInput = {
      tenant_id,
      parent_model_id: model_id,
      period_type,
    };
    if (period_label) where.period_label = period_label;

    const rows = (await this.prisma.varianceCache.findMany({
      where,
      orderBy: [{ period_label: 'asc' }, { line_item_key: 'asc' }],
      select: {
        id: true,
        snapshot_id: true,
        period_type: true,
        period_label: true,
        line_item_key: true,
        planned: true,
        actual: true,
        variance: true,
        variance_pct: true,
        drivers_json: true,
        refreshed_at: true,
      },
    })) as VarianceCacheRow[];

    const snapshot_id = rows[0]?.snapshot_id ?? model.current_snapshot_id ?? null;
    const refreshed_at = rows.reduce<Date | null>((acc, r) => {
      const t = r.refreshed_at;
      return !acc || t > acc ? t : acc;
    }, null);

    const data: VarianceRow[] = rows.map((r) => {
      const dotIndex = r.line_item_key.indexOf('.');
      const category = dotIndex > 0 ? r.line_item_key.slice(0, dotIndex) : 'unknown';
      const subcategory = dotIndex > 0 ? r.line_item_key.slice(dotIndex + 1) : r.line_item_key;
      return {
        category,
        subcategory,
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
        refreshed_at: refreshed_at ? refreshed_at.toISOString() : null,
        period_type,
        period_label: period_label ?? null,
        is_empty: rows.length === 0,
      },
    };
  }

  // ─── enqueueRefresh ──────────────────────────────────────────────────

  async enqueueRefresh(
    tenant_id: string,
    model_id: string,
  ): Promise<{ run_id: string | null; status: 'queued' }> {
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
    return { run_id: job.id ?? null, status: 'queued' };
  }

  // ─── upsertManualActual ──────────────────────────────────────────────

  async upsertManualActual(
    tenant_id: string,
    model_id: string,
    userId: string,
    dto: ManualActualEntryDto,
  ): Promise<VarianceRow> {
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

    const persisted = await createRlsClient(this.prisma, {
      tenant_id,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      const existing = (await txdb.varianceCache.findFirst({
        where: {
          tenant_id,
          parent_model_id: model_id,
          period_type: dto.period_type,
          period_label: dto.period_label,
          line_item_key: dto.line_item_key,
        },
      })) as VarianceCacheRow | null;

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
        return txdb.varianceCache.update({
          where: { id: existing.id },
          data: {
            actual,
            variance,
            variance_pct,
            drivers_json: drivers_json as unknown as Prisma.InputJsonValue,
            refreshed_at: new Date(),
          },
        });
      }
      return txdb.varianceCache.create({
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
          drivers_json: drivers_json as unknown as Prisma.InputJsonValue,
          refreshed_at: new Date(),
        },
      });
    });

    return toVarianceRow(persisted as VarianceCacheRow);
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toVarianceRow(row: VarianceCacheRow): VarianceRow {
  const dotIndex = row.line_item_key.indexOf('.');
  const category = dotIndex > 0 ? row.line_item_key.slice(0, dotIndex) : 'unknown';
  const subcategory = dotIndex > 0 ? row.line_item_key.slice(dotIndex + 1) : row.line_item_key;
  return {
    category,
    subcategory,
    line_item_key: row.line_item_key,
    period_label: row.period_label,
    planned: Number(row.planned),
    actual: Number(row.actual),
    variance: Number(row.variance),
    variance_pct: Number(row.variance_pct),
    drivers_json: (row.drivers_json as Record<string, unknown> | null) ?? null,
  };
}
