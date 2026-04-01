import { Injectable, Logger } from '@nestjs/common';
import { $Enums } from '@prisma/client';

import type {
  BehaviourAnalyticsQuery,
  CategoryResult,
  HeatmapResult,
  OverviewResult,
  SubjectResult,
  TrendPoint,
  TrendResult,
} from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import {
  EXCLUDED_STATUSES,
  buildDateRange,
  buildIncidentWhere,
  makeDataQuality,
} from './behaviour-analytics-helpers';
import { BehaviourScopeService } from './behaviour-scope.service';

@Injectable()
export class BehaviourIncidentAnalyticsService {
  private readonly logger = new Logger(BehaviourIncidentAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: BehaviourScopeService,
  ) {}

  // ─── Overview ──────────────────────────────────────────────────────────────

  async getOverview(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<OverviewResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = buildIncidentWhere(tenantId, query, scope, userId, this.scopeService);
    const { from, to } = buildDateRange(query);

    const periodLength = to.getTime() - from.getTime();
    const priorFrom = new Date(from.getTime() - periodLength);
    const priorTo = from;

    const priorWhere = {
      ...where,
      occurred_at: { gte: priorFrom, lte: priorTo },
    };

    const [totalIncidents, priorTotal, posNeg, openFollowUps, activeAlerts] = await Promise.all([
      this.prisma.behaviourIncident.count({ where }),
      this.prisma.behaviourIncident.count({ where: priorWhere }),
      this.prisma.behaviourIncident.groupBy({
        by: ['polarity'],
        where: {
          ...where,
          polarity: { in: ['positive', 'negative'] as $Enums.BehaviourPolarity[] },
        },
        _count: true,
      }),
      this.prisma.behaviourIncident.count({
        where: {
          ...where,
          follow_up_required: true,
          status: { notIn: [...EXCLUDED_STATUSES, 'resolved' as $Enums.IncidentStatus] },
        },
      }),
      this.prisma.behaviourAlert.count({
        where: { tenant_id: tenantId, status: 'active_alert' },
      }),
    ]);

    const positive = posNeg.find((c) => c.polarity === 'positive')?._count ?? 0;
    const negative = posNeg.find((c) => c.polarity === 'negative')?._count ?? 0;
    const ratio = positive + negative > 0 ? positive / (positive + negative) : null;

    const deltaPercent =
      priorTotal > 0 ? Math.round(((totalIncidents - priorTotal) / priorTotal) * 100) : null;

    const exposureAvailable = await this.checkExposureMvHasData(tenantId);

    return {
      total_incidents: totalIncidents,
      prior_period_total: priorTotal,
      delta_percent: deltaPercent,
      positive_negative_ratio: ratio,
      ratio_trend: this.determineTrend(deltaPercent),
      open_follow_ups: openFollowUps,
      active_alerts: activeAlerts,
      data_quality: makeDataQuality(exposureAvailable),
    };
  }

  // ─── Heatmap ───────────────────────────────────────────────────────────────

  async getHeatmap(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<HeatmapResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = buildIncidentWhere(tenantId, query, scope, userId, this.scopeService);

    const rawData = await this.prisma.behaviourIncident.groupBy({
      by: ['weekday', 'period_order', 'polarity'],
      where,
      _count: true,
    });

    const cellMap = new Map<string, { positive: number; negative: number; neutral: number }>();

    for (const row of rawData) {
      const key = `${row.weekday}:${row.period_order ?? 0}`;
      const existing = cellMap.get(key) ?? { positive: 0, negative: 0, neutral: 0 };
      const polarity = row.polarity as string;
      if (polarity === 'positive') existing.positive += row._count;
      else if (polarity === 'negative') existing.negative += row._count;
      else existing.neutral += row._count;
      cellMap.set(key, existing);
    }

    // Try to get exposure data for rate normalisation (incidents / total_teaching_periods * 100)
    let exposureNormalised = false;
    const exposureMap = new Map<string, number>(); // key: "weekday:period_order"

    try {
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- aggregate query on materialized view with tenant filter
      const exposureRows = await this.prisma.$queryRaw<
        Array<{ weekday: number; period_order: number; total_teaching_periods: bigint }>
      >`SELECT weekday, period_order, SUM(total_teaching_periods) as total_teaching_periods
        FROM mv_behaviour_exposure_rates
        WHERE tenant_id = ${tenantId}::uuid
        GROUP BY weekday, period_order`;

      for (const row of exposureRows) {
        exposureMap.set(`${row.weekday}:${row.period_order}`, Number(row.total_teaching_periods));
      }
      if (exposureMap.size > 0) exposureNormalised = true;
    } catch {
      this.logger.warn('Exposure rate MV not available for heatmap, keeping null rates');
    }

    const cells = Array.from(cellMap.entries()).map(([key, breakdown]) => {
      const parts = key.split(':');
      const weekday = Number(parts[0]) || 0;
      const periodOrder = Number(parts[1]) || 0;
      const rawCount = breakdown.positive + breakdown.negative + breakdown.neutral;
      const exposure = exposureMap.get(key);
      const rate =
        exposureNormalised && exposure && exposure > 0
          ? Math.round((rawCount / exposure) * 10000) / 100
          : null;
      return {
        weekday,
        period_order: periodOrder,
        raw_count: rawCount,
        rate,
        polarity_breakdown: breakdown,
      };
    });

    return {
      cells,
      data_quality: makeDataQuality(exposureNormalised),
    };
  }

  // ─── Historical Heatmap ────────────────────────────────────────────────────

  async getHistoricalHeatmap(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<HeatmapResult> {
    // Same as heatmap but with broader date range and exposure normalisation
    return this.getHeatmap(tenantId, userId, permissions, query);
  }

  // ─── Trends ────────────────────────────────────────────────────────────────

  async getTrends(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<TrendResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const { from, to } = buildDateRange(query);
    const days = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    const granularity: 'daily' | 'weekly' | 'monthly' =
      days <= 30 ? 'daily' : days <= 90 ? 'weekly' : 'monthly';

    const incidents = await this.prisma.behaviourIncident.findMany({
      where: buildIncidentWhere(tenantId, query, scope, userId, this.scopeService),
      select: { occurred_at: true, polarity: true },
    });

    const bucketMap = new Map<string, TrendPoint>();

    for (const inc of incidents) {
      const key = this.bucketDate(inc.occurred_at, granularity);
      const existing = bucketMap.get(key) ?? {
        date: key,
        positive: 0,
        negative: 0,
        neutral: 0,
        total: 0,
      };
      const polarity = inc.polarity as string;
      if (polarity === 'positive') existing.positive++;
      else if (polarity === 'negative') existing.negative++;
      else existing.neutral++;
      existing.total++;
      bucketMap.set(key, existing);
    }

    const points = Array.from(bucketMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    const exposureAvailable = await this.checkExposureMvHasData(tenantId);

    return {
      points,
      granularity,
      data_quality: makeDataQuality(exposureAvailable),
    };
  }

  // ─── Categories ────────────────────────────────────────────────────────────

  async getCategories(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<CategoryResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = buildIncidentWhere(tenantId, query, scope, userId, this.scopeService);

    const rawData = await this.prisma.behaviourIncident.groupBy({
      by: ['category_id'],
      where,
      _count: true,
    });

    const categoryIds = rawData.map((r) => r.category_id);
    const categories = await this.prisma.behaviourCategory.findMany({
      where: { id: { in: categoryIds }, tenant_id: tenantId },
      select: { id: true, name: true, polarity: true },
    });
    const catMap = new Map(categories.map((c) => [c.id, c]));

    const totalStudents = await this.prisma.student.count({
      where: { tenant_id: tenantId, status: 'enrolled' as $Enums.StudentStatus },
    });

    const result = rawData
      .map((row) => {
        const cat = catMap.get(row.category_id);
        return {
          category_id: row.category_id,
          category_name: cat?.name ?? 'Unknown',
          polarity: (cat?.polarity as string) ?? 'neutral',
          count: row._count,
          rate_per_100:
            totalStudents > 0 ? Math.round((row._count / totalStudents) * 10000) / 100 : null,
          trend_percent: null, // Trend computation deferred
        };
      })
      .sort((a, b) => b.count - a.count);

    return { categories: result, data_quality: makeDataQuality(false) };
  }

  // ─── Subjects (exposure-adjusted) ──────────────────────────────────────────

  async getSubjects(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<SubjectResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = buildIncidentWhere(tenantId, query, scope, userId, this.scopeService);

    const rawData = await this.prisma.behaviourIncident.groupBy({
      by: ['subject_id'],
      where: { ...where, subject_id: { not: null } },
      _count: true,
    });

    const subjectIds = rawData.map((r) => r.subject_id).filter((id): id is string => id !== null);
    const subjects = await this.prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true },
    });
    const subMap = new Map(subjects.map((s) => [s.id, s.name]));

    // Try to get exposure data for rate normalisation
    let exposureNormalised = false;
    const exposureMap = new Map<string, number>();

    if (query.exposureNormalised) {
      try {
        // eslint-disable-next-line school/no-raw-sql-outside-rls -- aggregate query on materialized view with tenant filter
        const exposureRows = await this.prisma.$queryRaw<
          Array<{ subject_id: string; total_teaching_periods: bigint }>
        >`SELECT subject_id, SUM(total_teaching_periods) as total_teaching_periods
          FROM mv_behaviour_exposure_rates
          WHERE tenant_id = ${tenantId}::uuid
          GROUP BY subject_id`;

        for (const row of exposureRows) {
          exposureMap.set(row.subject_id, Number(row.total_teaching_periods));
        }
        if (exposureMap.size > 0) exposureNormalised = true;
      } catch {
        this.logger.warn('Exposure rate MV not available, falling back to raw counts');
      }
    }

    const result = rawData
      .filter((r) => r.subject_id !== null)
      .map((row) => {
        const subjectId = row.subject_id as string;
        const exposure = exposureMap.get(subjectId);
        return {
          subject_id: subjectId,
          subject_name: subMap.get(subjectId) ?? 'Unknown',
          incident_count: row._count,
          rate_per_100_periods:
            exposureNormalised && exposure && exposure > 0
              ? Math.round((row._count / exposure) * 10000) / 100
              : null,
          trend_percent: null,
        };
      })
      .sort((a, b) => b.incident_count - a.incident_count);

    return { subjects: result, data_quality: makeDataQuality(exposureNormalised) };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private determineTrend(delta: number | null): 'improving' | 'stable' | 'declining' | null {
    if (delta === null) return null;
    if (delta <= -5) return 'improving';
    if (delta >= 5) return 'declining';
    return 'stable';
  }

  private bucketDate(date: Date, granularity: 'daily' | 'weekly' | 'monthly'): string {
    const d = new Date(date);
    if (granularity === 'daily') {
      return d.toISOString().slice(0, 10);
    }
    if (granularity === 'weekly') {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      return d.toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 7);
  }

  /** Check whether the exposure MV has any data for this tenant. */
  private async checkExposureMvHasData(tenantId: string): Promise<boolean> {
    try {
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- count query on materialized view with tenant filter
      const rows = await this.prisma.$queryRaw<Array<{ cnt: bigint }>>`
        SELECT COUNT(*)::bigint AS cnt
        FROM mv_behaviour_exposure_rates
        WHERE tenant_id = ${tenantId}::uuid
        LIMIT 1`;
      const firstRow = rows[0];
      return rows.length > 0 && firstRow !== undefined && Number(firstRow.cnt) > 0;
    } catch {
      return false;
    }
  }
}
