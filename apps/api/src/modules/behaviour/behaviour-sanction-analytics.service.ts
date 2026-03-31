import { Injectable, Logger } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import type {
  BehaviourAnalyticsQuery,
  BenchmarkQuery,
  BenchmarkResult,
  InterventionOutcomeResult,
  PolicyEffectivenessResult,
  SanctionSummaryResult,
  TaskCompletionResult,
} from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { buildDateRange, makeDataQuality } from './behaviour-analytics-helpers';

@Injectable()
export class BehaviourSanctionAnalyticsService {
  private readonly logger = new Logger(BehaviourSanctionAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Sanctions ─────────────────────────────────────────────────────────────

  async getSanctions(
    tenantId: string,
    _userId: string,
    _permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<SanctionSummaryResult> {
    const { from, to } = buildDateRange(query);

    const rawData = await this.prisma.behaviourSanction.groupBy({
      by: ['type', 'status'],
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
      _count: { _all: true },
    });

    // Aggregate by type, computing served/no-show from status
    const typeMap = new Map<string, { total: number; served: number; no_show: number }>();

    for (const row of rawData) {
      const sanctionType = row.type as string;
      const existing = typeMap.get(sanctionType) ?? { total: 0, served: 0, no_show: 0 };
      existing.total += row._count._all;
      const status = row.status as string;
      if (status === 'served' || status === 'partially_served') {
        existing.served += row._count._all;
      }
      if (status === 'no_show' || status === 'not_served_absent') {
        existing.no_show += row._count._all;
      }
      typeMap.set(sanctionType, existing);
    }

    const entries = Array.from(typeMap.entries()).map(([sanctionType, data]) => ({
      sanction_type: sanctionType,
      total: data.total,
      served: data.served,
      no_show: data.no_show,
      trend_percent: null as number | null,
    }));

    return { entries, data_quality: makeDataQuality(false) };
  }

  // ─── Intervention Outcomes ─────────────────────────────────────────────────

  async getInterventionOutcomes(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<InterventionOutcomeResult> {
    const { from, to } = buildDateRange(query);

    const rawData = await this.prisma.behaviourIntervention.groupBy({
      by: ['outcome', 'send_aware'],
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
        outcome: { not: null },
      },
      _count: true,
    });

    // Aggregate by outcome, splitting send/non-send counts
    const outcomeMap = new Map<
      string,
      { count: number; send_count: number; non_send_count: number }
    >();

    for (const row of rawData) {
      const outcome = (row.outcome as string) ?? 'unknown';
      const existing = outcomeMap.get(outcome) ?? { count: 0, send_count: 0, non_send_count: 0 };
      existing.count += row._count;
      if (row.send_aware) {
        existing.send_count += row._count;
      } else {
        existing.non_send_count += row._count;
      }
      outcomeMap.set(outcome, existing);
    }

    const entries = Array.from(outcomeMap.entries()).map(([outcome, data]) => ({
      outcome,
      count: data.count,
      send_count: data.send_count,
      non_send_count: data.non_send_count,
    }));

    return { entries, data_quality: makeDataQuality(false) };
  }

  // ─── Policy Effectiveness ──────────────────────────────────────────────────

  async getPolicyEffectiveness(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<PolicyEffectivenessResult> {
    const { from, to } = buildDateRange(query);

    const rules = await this.prisma.behaviourPolicyRule.findMany({
      where: { tenant_id: tenantId, is_active: true },
      select: { id: true, name: true },
    });

    const evaluations = await this.prisma.behaviourPolicyEvaluation.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
        rule_version_id: { not: null },
      },
      select: {
        evaluation_result: true,
        rule_version: { select: { rule_id: true } },
      },
    });

    const evalMap = new Map<string, { match: number; fire: number }>();

    for (const row of evaluations) {
      const ruleId = row.rule_version?.rule_id;
      if (!ruleId) continue;
      const existing = evalMap.get(ruleId) ?? { match: 0, fire: 0 };
      existing.match++;
      if (row.evaluation_result === 'matched') {
        existing.fire++;
      }
      evalMap.set(ruleId, existing);
    }

    const result = rules.map((rule) => {
      const data = evalMap.get(rule.id) ?? { match: 0, fire: 0 };
      return {
        rule_id: rule.id,
        rule_name: rule.name,
        match_count: data.match,
        fire_count: data.fire,
        fire_rate: data.match > 0 ? data.fire / data.match : 0,
      };
    });

    return { rules: result, data_quality: makeDataQuality(false) };
  }

  // ─── Task Completion ───────────────────────────────────────────────────────

  async getTaskCompletion(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<TaskCompletionResult> {
    const { from, to } = buildDateRange(query);

    const rawData = await this.prisma.behaviourTask.groupBy({
      by: ['task_type', 'status'],
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
      _count: true,
    });

    const taskTypeMap = new Map<string, { total: number; completed: number; overdue: number }>();

    for (const row of rawData) {
      const existing = taskTypeMap.get(row.task_type as string) ?? {
        total: 0,
        completed: 0,
        overdue: 0,
      };
      existing.total += row._count;
      if (row.status === 'completed') existing.completed += row._count;
      taskTypeMap.set(row.task_type as string, existing);
    }

    // Count overdue tasks
    const overdueTasks = await this.prisma.behaviourTask.groupBy({
      by: ['task_type'],
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
        due_date: { lt: new Date() },
        status: { notIn: ['completed', 'cancelled'] as $Enums.BehaviourTaskStatus[] },
      },
      _count: true,
    });

    for (const row of overdueTasks) {
      const existing = taskTypeMap.get(row.task_type as string);
      if (existing) existing.overdue = row._count;
    }

    // Compute avg days to complete per task_type for completed tasks
    const avgDaysRows = await this.prisma.$queryRaw<
      Array<{ task_type: string; avg_days: number }>
    >`SELECT task_type::text AS task_type,
            ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400)::numeric, 1) AS avg_days
       FROM behaviour_tasks
       WHERE tenant_id = ${tenantId}::uuid
         AND created_at >= ${from}
         AND created_at <= ${to}
         AND completed_at IS NOT NULL
       GROUP BY task_type`;

    const avgDaysMap = new Map<string, number>();
    for (const row of avgDaysRows) {
      avgDaysMap.set(row.task_type, Number(row.avg_days));
    }

    const entries = Array.from(taskTypeMap.entries()).map(([type, data]) => ({
      task_type: type,
      total: data.total,
      completed: data.completed,
      overdue: data.overdue,
      completion_rate: data.total > 0 ? data.completed / data.total : 0,
      avg_days_to_complete: avgDaysMap.get(type) ?? null,
    }));

    return { entries, data_quality: makeDataQuality(false) };
  }

  // ─── ETB Benchmarks ────────────────────────────────────────────────────────

  async getBenchmarks(tenantId: string, query: BenchmarkQuery): Promise<BenchmarkResult> {
    // Check if cross-school benchmarking is enabled for this tenant
    const tenantSettings = await this.prisma.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });
    const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const behaviourSettings = (settings?.behaviour as Record<string, unknown>) ?? {};
    const benchmarkingEnabled = behaviourSettings?.cross_school_benchmarking_enabled === true;

    if (!benchmarkingEnabled) {
      return {
        entries: [],
        benchmarking_enabled: false,
        data_quality: makeDataQuality(false),
      };
    }

    try {
      const categoryFilter = query.benchmarkCategory
        ? Prisma.sql`AND benchmark_category = ${query.benchmarkCategory}`
        : Prisma.empty;

      const rows = await this.prisma.$queryRaw<
        Array<{
          benchmark_category: string;
          metric_name: string;
          tenant_value: number | null;
          etb_average: number | null;
          percentile: number | null;
          sample_size: bigint;
        }>
      >`
        WITH benchmark_source AS (
          SELECT
            bi.tenant_id,
            bc.benchmark_category,
            COUNT(DISTINCT bi_p.student_id) AS student_count,
            COUNT(DISTINCT bi.id) AS incident_count,
            ROUND(
              COUNT(DISTINCT bi.id)::numeric
                / NULLIF(COUNT(DISTINCT bi_p.student_id), 0)
                * 100,
              2
            ) AS rate_per_100
          FROM behaviour_incidents bi
          JOIN behaviour_categories bc
            ON bc.id = bi.category_id
            AND bc.tenant_id = bi.tenant_id
          JOIN behaviour_incident_participants bi_p
            ON bi_p.incident_id = bi.id
            AND bi_p.tenant_id = bi.tenant_id
          JOIN consent_records cr
            ON cr.tenant_id = bi.tenant_id
            AND cr.subject_type = 'student'
            AND cr.subject_id = bi_p.student_id
            AND cr.consent_type = 'cross_school_benchmarking'
            AND cr.status = 'granted'
          WHERE bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
            AND bi.retention_status = 'active'
            AND bi_p.participant_type = 'student'
            AND bi.academic_period_id IS NOT NULL
            ${categoryFilter}
          GROUP BY bi.tenant_id, bc.benchmark_category
          HAVING COUNT(DISTINCT bi_p.student_id) >= COALESCE(
            (
              SELECT (ts.settings->'behaviour'->>'benchmark_min_cohort_size')::int
              FROM tenant_settings ts
              WHERE ts.tenant_id = bi.tenant_id
            ),
            10
          )
        ),
        ranked_benchmarks AS (
          SELECT
            benchmark_category,
            tenant_id,
            rate_per_100,
            AVG(rate_per_100) OVER (PARTITION BY benchmark_category) AS etb_average,
            PERCENT_RANK() OVER (
              PARTITION BY benchmark_category
              ORDER BY rate_per_100
            ) * 100 AS percentile,
            COUNT(*) OVER (PARTITION BY benchmark_category) AS sample_size
          FROM benchmark_source
        )
        SELECT
          benchmark_category,
          'rate_per_100' AS metric_name,
          rate_per_100 AS tenant_value,
          etb_average,
          percentile,
          sample_size
        FROM ranked_benchmarks
        WHERE tenant_id = ${tenantId}::uuid
        ORDER BY benchmark_category, metric_name
      `;

      const entries = rows.map((row) => ({
        benchmark_category: row.benchmark_category,
        metric_name: row.metric_name,
        tenant_value: row.tenant_value !== null ? Number(row.tenant_value) : null,
        etb_average: row.etb_average !== null ? Number(row.etb_average) : null,
        percentile: row.percentile !== null ? Number(row.percentile) : null,
        sample_size: Number(row.sample_size),
      }));

      return {
        entries,
        benchmarking_enabled: true,
        data_quality: makeDataQuality(false),
      };
    } catch {
      this.logger.warn('Benchmark MV not available, returning empty');
      return {
        entries: [],
        benchmarking_enabled: true,
        data_quality: makeDataQuality(false),
      };
    }
  }
}
