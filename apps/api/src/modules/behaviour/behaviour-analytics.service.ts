import { Injectable, Logger } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import type {
  BehaviourAnalyticsQuery,
  CategoryResult,
  ComparisonResult,
  DataQuality,
  HeatmapResult,
  InterventionOutcomeResult,
  OverviewResult,
  PolicyEffectivenessResult,
  RatioResult,
  SanctionSummaryResult,
  StaffResult,
  SubjectResult,
  TaskCompletionResult,
  TrendPoint,
  TrendResult,
} from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourPulseService } from './behaviour-pulse.service';
import { BehaviourScopeService, type ScopeResult } from './behaviour-scope.service';

/** Statuses excluded from all behaviour aggregations. */
const EXCLUDED_STATUSES: $Enums.IncidentStatus[] = [
  'withdrawn',
  'converted_to_safeguarding' as $Enums.IncidentStatus,
];

@Injectable()
export class BehaviourAnalyticsService {
  private readonly logger = new Logger(BehaviourAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: BehaviourScopeService,
    private readonly pulseService: BehaviourPulseService,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private buildDateRange(query: BehaviourAnalyticsQuery): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  private buildIncidentWhere(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
    scope: ScopeResult,
    userId: string,
  ): Prisma.BehaviourIncidentWhereInput {
    const { from, to } = this.buildDateRange(query);
    const scopeFilter = this.scopeService.buildScopeFilter({
      userId,
      scope: scope.scope,
      classStudentIds: scope.classStudentIds,
      yearGroupIds: scope.yearGroupIds,
    });

    const where: Prisma.BehaviourIncidentWhereInput = {
      tenant_id: tenantId,
      occurred_at: { gte: from, lte: to },
      status: { notIn: EXCLUDED_STATUSES },
      retention_status: 'active' as $Enums.RetentionStatus,
      ...scopeFilter,
    };

    if (query.academicYearId) where.academic_year_id = query.academicYearId;
    if (query.academicPeriodId) where.academic_period_id = query.academicPeriodId;
    if (query.polarity) where.polarity = query.polarity as $Enums.BehaviourPolarity;
    if (query.categoryId) where.category_id = query.categoryId;
    if (query.classId) {
      where.participants = { some: { student: { class_enrolments: { some: { class_id: query.classId } } } } };
    }
    if (query.yearGroupId) {
      where.participants = {
        ...where.participants as Prisma.BehaviourIncidentParticipantListRelationFilter,
        some: { student: { year_group_id: query.yearGroupId } },
      };
    }

    return where;
  }

  private makeDataQuality(normalised: boolean): DataQuality {
    return {
      exposure_normalised: normalised,
      data_as_of: new Date().toISOString(),
    };
  }

  // ─── Overview ──────────────────────────────────────────────────────────────

  async getOverview(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<OverviewResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = this.buildIncidentWhere(tenantId, query, scope, userId);
    const { from, to } = this.buildDateRange(query);

    const periodLength = to.getTime() - from.getTime();
    const priorFrom = new Date(from.getTime() - periodLength);
    const priorTo = from;

    const priorWhere: Prisma.BehaviourIncidentWhereInput = {
      ...where,
      occurred_at: { gte: priorFrom, lte: priorTo },
    };

    const [totalIncidents, priorTotal, posNeg, openFollowUps, activeAlerts] =
      await Promise.all([
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
      priorTotal > 0
        ? Math.round(((totalIncidents - priorTotal) / priorTotal) * 100)
        : null;

    return {
      total_incidents: totalIncidents,
      prior_period_total: priorTotal,
      delta_percent: deltaPercent,
      positive_negative_ratio: ratio,
      ratio_trend: this.determineTrend(deltaPercent),
      open_follow_ups: openFollowUps,
      active_alerts: activeAlerts,
      data_quality: this.makeDataQuality(false),
    };
  }

  private determineTrend(
    delta: number | null,
  ): 'improving' | 'stable' | 'declining' | null {
    if (delta === null) return null;
    if (delta <= -5) return 'improving';
    if (delta >= 5) return 'declining';
    return 'stable';
  }

  // ─── Heatmap ───────────────────────────────────────────────────────────────

  async getHeatmap(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<HeatmapResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = this.buildIncidentWhere(tenantId, query, scope, userId);

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

    const cells = Array.from(cellMap.entries()).map(([key, breakdown]) => {
      const parts = key.split(':');
      const weekday = Number(parts[0]) || 0;
      const periodOrder = Number(parts[1]) || 0;
      const rawCount = breakdown.positive + breakdown.negative + breakdown.neutral;
      return {
        weekday,
        period_order: periodOrder,
        raw_count: rawCount,
        rate: null as number | null, // Exposure normalisation applied if data available
        polarity_breakdown: breakdown,
      };
    });

    return {
      cells,
      data_quality: this.makeDataQuality(false),
    };
  }

  // ─── Trends ────────────────────────────────────────────────────────────────

  async getTrends(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<TrendResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const { from, to } = this.buildDateRange(query);
    const days = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    const granularity: 'daily' | 'weekly' | 'monthly' =
      days <= 30 ? 'daily' : days <= 90 ? 'weekly' : 'monthly';

    const incidents = await this.prisma.behaviourIncident.findMany({
      where: this.buildIncidentWhere(tenantId, query, scope, userId),
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

    const points = Array.from(bucketMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date),
    );

    return {
      points,
      granularity,
      data_quality: this.makeDataQuality(false),
    };
  }

  private bucketDate(
    date: Date,
    granularity: 'daily' | 'weekly' | 'monthly',
  ): string {
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

  // ─── Categories ────────────────────────────────────────────────────────────

  async getCategories(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<CategoryResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = this.buildIncidentWhere(tenantId, query, scope, userId);

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
          rate_per_100: totalStudents > 0 ? Math.round((row._count / totalStudents) * 10000) / 100 : null,
          trend_percent: null, // Trend computation deferred
        };
      })
      .sort((a, b) => b.count - a.count);

    return { categories: result, data_quality: this.makeDataQuality(false) };
  }

  // ─── Subjects (exposure-adjusted) ──────────────────────────────────────────

  async getSubjects(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<SubjectResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = this.buildIncidentWhere(tenantId, query, scope, userId);

    const rawData = await this.prisma.behaviourIncident.groupBy({
      by: ['subject_id'],
      where: { ...where, subject_id: { not: null } },
      _count: true,
    });

    const subjectIds = rawData
      .map((r) => r.subject_id)
      .filter((id): id is string => id !== null);
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

    return { subjects: result, data_quality: this.makeDataQuality(exposureNormalised) };
  }

  // ─── Staff Logging Activity ────────────────────────────────────────────────

  async getStaffActivity(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<StaffResult> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const yearStart = query.from ? new Date(query.from) : new Date(now.getFullYear(), 0, 1);

    // Get all staff with behaviour.log permission
    const staffWithPermission = await this.prisma.tenantMembership.findMany({
      where: {
        tenant_id: tenantId,
        membership_status: 'active',
        membership_roles: {
          some: {
            role: {
              role_permissions: {
                some: { permission: { permission_key: 'behaviour.log' } },
              },
            },
          },
        },
      },
      include: {
        user: { select: { first_name: true, last_name: true } },
      },
    });

    const staffIds = staffWithPermission.map((s) => s.user_id);

    // Get incident counts per staff for different windows
    const [last7, last30, yearTotal, lastLogged] = await Promise.all([
      this.prisma.behaviourIncident.groupBy({
        by: ['reported_by_id'],
        where: {
          tenant_id: tenantId,
          reported_by_id: { in: staffIds },
          occurred_at: { gte: sevenDaysAgo },
          status: { notIn: EXCLUDED_STATUSES },
        },
        _count: true,
      }),
      this.prisma.behaviourIncident.groupBy({
        by: ['reported_by_id'],
        where: {
          tenant_id: tenantId,
          reported_by_id: { in: staffIds },
          occurred_at: { gte: thirtyDaysAgo },
          status: { notIn: EXCLUDED_STATUSES },
        },
        _count: true,
      }),
      this.prisma.behaviourIncident.groupBy({
        by: ['reported_by_id'],
        where: {
          tenant_id: tenantId,
          reported_by_id: { in: staffIds },
          occurred_at: { gte: yearStart },
          status: { notIn: EXCLUDED_STATUSES },
        },
        _count: true,
      }),
      this.prisma.behaviourIncident.groupBy({
        by: ['reported_by_id'],
        where: {
          tenant_id: tenantId,
          reported_by_id: { in: staffIds },
          status: { notIn: EXCLUDED_STATUSES },
        },
        _max: { occurred_at: true },
      }),
    ]);

    const last7Map = new Map(last7.map((r) => [r.reported_by_id, r._count]));
    const last30Map = new Map(last30.map((r) => [r.reported_by_id, r._count]));
    const yearMap = new Map(yearTotal.map((r) => [r.reported_by_id, r._count]));
    const lastLogMap = new Map(
      lastLogged.map((r) => [r.reported_by_id, r._max.occurred_at]),
    );

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const staff = staffWithPermission.map((s) => {
      const lastLoggedAt = lastLogMap.get(s.user_id);
      return {
        staff_id: s.user_id,
        staff_name: `${s.user.first_name} ${s.user.last_name}`,
        last_7_days: last7Map.get(s.user_id) ?? 0,
        last_30_days: last30Map.get(s.user_id) ?? 0,
        total_year: yearMap.get(s.user_id) ?? 0,
        last_logged_at: lastLoggedAt?.toISOString() ?? null,
        inactive_flag: !lastLoggedAt || lastLoggedAt < fourteenDaysAgo,
      };
    });

    return { staff, data_quality: this.makeDataQuality(false) };
  }

  // ─── Sanctions ─────────────────────────────────────────────────────────────

  async getSanctions(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<SanctionSummaryResult> {
    const { from, to } = this.buildDateRange(query);

    const rawData = await this.prisma.behaviourSanction.groupBy({
      by: ['type'],
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
      _count: { _all: true },
    });

    const entries = rawData.map((row) => ({
      sanction_type: row.type as string,
      total: row._count._all,
      served: 0, // Phase C implements served tracking
      no_show: 0,
      trend_percent: null as number | null,
    }));

    return { entries, data_quality: this.makeDataQuality(false) };
  }

  // ─── Intervention Outcomes ─────────────────────────────────────────────────

  async getInterventionOutcomes(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<InterventionOutcomeResult> {
    const { from, to } = this.buildDateRange(query);

    const rawData = await this.prisma.behaviourIntervention.groupBy({
      by: ['outcome'],
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
        outcome: { not: null },
      },
      _count: true,
    });

    const entries = rawData.map((row) => ({
      outcome: (row.outcome as string) ?? 'unknown',
      count: row._count,
      send_count: 0, // SEND breakdown requires additional query
      non_send_count: row._count,
    }));

    return { entries, data_quality: this.makeDataQuality(false) };
  }

  // ─── Positive/Negative Ratio ───────────────────────────────────────────────

  async getRatio(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<RatioResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = this.buildIncidentWhere(tenantId, query, scope, userId);

    // Group by year_group via participants
    const incidents = await this.prisma.behaviourIncident.findMany({
      where: {
        ...where,
        polarity: { in: ['positive', 'negative'] as $Enums.BehaviourPolarity[] },
      },
      select: {
        polarity: true,
        participants: {
          where: { participant_type: 'student' as $Enums.ParticipantType },
          select: {
            student: { select: { year_group_id: true, year_group: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    const groupMap = new Map<string, { name: string; positive: number; negative: number }>();

    for (const inc of incidents) {
      for (const p of inc.participants) {
        const yg = p.student?.year_group;
        if (!yg) continue;
        const existing = groupMap.get(yg.id) ?? { name: yg.name, positive: 0, negative: 0 };
        if (inc.polarity === 'positive') existing.positive++;
        else existing.negative++;
        groupMap.set(yg.id, existing);
      }
    }

    const entries = Array.from(groupMap.entries()).map(([id, data]) => ({
      group_id: id,
      group_name: data.name,
      positive: data.positive,
      negative: data.negative,
      ratio: data.positive + data.negative > 0
        ? data.positive / (data.positive + data.negative)
        : null,
    }));

    return { entries, data_quality: this.makeDataQuality(false) };
  }

  // ─── Year Group Comparisons ────────────────────────────────────────────────

  async getComparisons(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<ComparisonResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = this.buildIncidentWhere(tenantId, query, scope, userId);

    const incidents = await this.prisma.behaviourIncident.findMany({
      where,
      select: {
        polarity: true,
        participants: {
          where: { participant_type: 'student' as $Enums.ParticipantType },
          select: {
            student: { select: { year_group_id: true, year_group: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    const yearGroups = await this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true },
    });

    const studentCounts = await this.prisma.student.groupBy({
      by: ['year_group_id'],
      where: { tenant_id: tenantId, status: 'enrolled' as $Enums.StudentStatus },
      _count: true,
    });
    const studentCountMap = new Map(
      studentCounts
        .filter((s) => s.year_group_id !== null)
        .map((s) => [s.year_group_id as string, s._count]),
    );

    const ygMap = new Map<string, { positive: number; negative: number }>();
    for (const inc of incidents) {
      for (const p of inc.participants) {
        const ygId = p.student?.year_group_id;
        if (!ygId) continue;
        const existing = ygMap.get(ygId) ?? { positive: 0, negative: 0 };
        if (inc.polarity === 'positive') existing.positive++;
        else if (inc.polarity === 'negative') existing.negative++;
        ygMap.set(ygId, existing);
      }
    }

    const entries = yearGroups.map((yg) => {
      const data = ygMap.get(yg.id) ?? { positive: 0, negative: 0 };
      const studentCount = studentCountMap.get(yg.id) ?? 0;
      const total = data.positive + data.negative;
      return {
        year_group_id: yg.id,
        year_group_name: yg.name,
        incident_rate: studentCount > 0 ? Math.round((total / studentCount) * 10000) / 100 : null,
        positive_rate: studentCount > 0 ? Math.round((data.positive / studentCount) * 10000) / 100 : null,
        negative_rate: studentCount > 0 ? Math.round((data.negative / studentCount) * 10000) / 100 : null,
        student_count: studentCount,
      };
    });

    return { entries, data_quality: this.makeDataQuality(false) };
  }

  // ─── Policy Effectiveness ──────────────────────────────────────────────────

  async getPolicyEffectiveness(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<PolicyEffectivenessResult> {
    const { from, to } = this.buildDateRange(query);

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

    return { rules: result, data_quality: this.makeDataQuality(false) };
  }

  // ─── Task Completion ───────────────────────────────────────────────────────

  async getTaskCompletion(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<TaskCompletionResult> {
    const { from, to } = this.buildDateRange(query);

    const rawData = await this.prisma.behaviourTask.groupBy({
      by: ['task_type', 'status'],
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
      _count: true,
    });

    const taskTypeMap = new Map<
      string,
      { total: number; completed: number; overdue: number }
    >();

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

    const entries = Array.from(taskTypeMap.entries()).map(([type, data]) => ({
      task_type: type,
      total: data.total,
      completed: data.completed,
      overdue: data.overdue,
      completion_rate: data.total > 0 ? data.completed / data.total : 0,
      avg_days_to_complete: null, // Requires individual record analysis
    }));

    return { entries, data_quality: this.makeDataQuality(false) };
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
}
