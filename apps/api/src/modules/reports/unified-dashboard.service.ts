import { Injectable, Logger } from '@nestjs/common';

import {
  kpiDashboardResponseSchema,
  REPORT_KPI_KEYS,
  type KpiCard,
  type KpiDashboardResponse,
  type ReportKpiKey,
} from '@school/shared/reports';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  calculateAtRiskStudentsNew,
  calculateAttendanceToday,
  calculateBehaviourIncidentsWeek,
  calculateCoverGapsWeek,
  calculateGradesSubmissionLag,
  calculateNewApplicationsWeek,
  calculateOpenSafeguardingConcerns,
  calculateOverdueInvoices,
  calculateParentEscalations,
  calculateTeacherSubmissionCompliance,
  type KpiCalculatorResult,
  type PrismaTransaction,
} from './kpi-calculators';

/**
 * Static per-KPI metadata: the i18n label/tooltip keys and the drill-down
 * route. Ordered in the dashboard's display order (matches
 * `REPORT_KPI_KEYS`).
 */
const KPI_DEFINITIONS: ReadonlyArray<{
  key: ReportKpiKey;
  label_key: string;
  tooltip_key: string;
  drill_down_href: string;
}> = [
  {
    key: 'attendance_today',
    label_key: 'reports.kpis.attendance_today.label',
    tooltip_key: 'reports.kpis.attendance_today.tooltip',
    drill_down_href: '/reports/attendance',
  },
  {
    key: 'teacher_submission_compliance',
    label_key: 'reports.kpis.teacher_submission_compliance.label',
    tooltip_key: 'reports.kpis.teacher_submission_compliance.tooltip',
    drill_down_href: '/reports/attendance#compliance',
  },
  {
    key: 'at_risk_students',
    label_key: 'reports.kpis.at_risk_students.label',
    tooltip_key: 'reports.kpis.at_risk_students.tooltip',
    drill_down_href: '/reports/student-progress',
  },
  {
    key: 'behaviour_incidents_this_week',
    label_key: 'reports.kpis.behaviour_incidents_this_week.label',
    tooltip_key: 'reports.kpis.behaviour_incidents_this_week.tooltip',
    drill_down_href: '/behaviour',
  },
  {
    key: 'open_safeguarding_concerns',
    label_key: 'reports.kpis.open_safeguarding_concerns.label',
    tooltip_key: 'reports.kpis.open_safeguarding_concerns.tooltip',
    drill_down_href: '/safeguarding',
  },
  {
    key: 'overdue_invoices',
    label_key: 'reports.kpis.overdue_invoices.label',
    tooltip_key: 'reports.kpis.overdue_invoices.tooltip',
    drill_down_href: '/finance/invoices?status=overdue',
  },
  {
    key: 'grades_submission_lag',
    label_key: 'reports.kpis.grades_submission_lag.label',
    tooltip_key: 'reports.kpis.grades_submission_lag.tooltip',
    drill_down_href: '/gradebook',
  },
  {
    key: 'new_applications_this_week',
    label_key: 'reports.kpis.new_applications_this_week.label',
    tooltip_key: 'reports.kpis.new_applications_this_week.tooltip',
    drill_down_href: '/admissions',
  },
  {
    key: 'parent_escalations',
    label_key: 'reports.kpis.parent_escalations.label',
    tooltip_key: 'reports.kpis.parent_escalations.tooltip',
    drill_down_href: '/inbox',
  },
  {
    key: 'cover_gaps_this_week',
    label_key: 'reports.kpis.cover_gaps_this_week.label',
    tooltip_key: 'reports.kpis.cover_gaps_this_week.tooltip',
    drill_down_href: '/schedules/cover',
  },
];

// Safety check — if someone adds a KPI to shared/reports/kpi.ts and forgets
// to add it here, fail fast at module load rather than quietly omit it.
(() => {
  const declared = new Set<string>(KPI_DEFINITIONS.map((d) => d.key));
  for (const key of REPORT_KPI_KEYS) {
    if (!declared.has(key)) {
      throw new Error(`UnifiedDashboardService: missing KPI definition for '${key}'`);
    }
  }
})();

@Injectable()
export class UnifiedDashboardService {
  private readonly logger = new Logger(UnifiedDashboardService.name);
  private readonly CACHE_TTL_SECONDS = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Return the full KPI dashboard response for a tenant.
   *
   * Caches the full payload per-tenant for 5 minutes. `refresh=true`
   * bypasses the cache and recomputes.
   */
  async getKpiDashboard(tenantId: string, refresh = false): Promise<KpiDashboardResponse> {
    if (!refresh) {
      const cached = await this.readCache(tenantId);
      if (cached) {
        return {
          ...cached,
          meta: { cache_hit: true },
        };
      }
    }

    const payload = await this.computeDashboard(tenantId);
    await this.writeCache(tenantId, payload);

    return payload;
  }

  async invalidateCache(tenantId: string): Promise<void> {
    await this.redis.getClient().del(this.cacheKey(tenantId));
  }

  private cacheKey(tenantId: string): string {
    return `reports:kpi-dashboard:${tenantId}`;
  }

  private async readCache(tenantId: string): Promise<KpiDashboardResponse | null> {
    try {
      const cached = await this.redis.getClient().get(this.cacheKey(tenantId));
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      const result = kpiDashboardResponseSchema.safeParse(parsed);
      if (!result.success) {
        this.logger.warn(
          `[getKpiDashboard] cached payload for tenant ${tenantId} failed schema; recomputing`,
        );
        return null;
      }
      return result.data;
    } catch (err) {
      this.logger.warn(`[getKpiDashboard] failed to read cache for tenant ${tenantId}: ${err}`);
      return null;
    }
  }

  private async writeCache(tenantId: string, payload: KpiDashboardResponse): Promise<void> {
    try {
      await this.redis
        .getClient()
        .setex(this.cacheKey(tenantId), this.CACHE_TTL_SECONDS, JSON.stringify(payload));
    } catch (err) {
      this.logger.warn(`[getKpiDashboard] failed to write cache for tenant ${tenantId}: ${err}`);
    }
  }

  private async computeDashboard(tenantId: string): Promise<KpiDashboardResponse> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const { kpiResults, trends, hiddenKpis } = await (prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaTransaction;

      const [results, trendsData, prefs] = await Promise.all([
        this.runCalculators(txClient, tenantId),
        this.computeTrends(txClient, tenantId),
        txClient.reportsKpiTenantPreferences.findUnique({
          where: { tenant_id: tenantId },
          select: { hidden_kpi_keys: true },
        }),
      ]);

      return {
        kpiResults: results,
        trends: trendsData,
        hiddenKpis: new Set<string>(prefs?.hidden_kpi_keys ?? []),
      };
    }) as unknown as Promise<{
      kpiResults: Record<ReportKpiKey, KpiCalculatorResult>;
      trends: KpiDashboardResponse['data']['trends'];
      hiddenKpis: Set<string>;
    }>);

    const kpis: KpiCard[] = KPI_DEFINITIONS.filter((def) => !hiddenKpis.has(def.key)).map(
      (def) => ({
        key: def.key,
        label_key: def.label_key,
        tooltip_key: def.tooltip_key,
        drill_down_href: def.drill_down_href,
        value: kpiResults[def.key].value,
        value_raw: kpiResults[def.key].value_raw,
        delta: kpiResults[def.key].delta,
        sparkline: kpiResults[def.key].sparkline,
        severity: kpiResults[def.key].severity,
      }),
    );

    return {
      data: {
        generated_at: new Date().toISOString(),
        kpis,
        trends,
      },
      meta: { cache_hit: false },
    };
  }

  private async runCalculators(
    tx: PrismaTransaction,
    tenantId: string,
  ): Promise<Record<ReportKpiKey, KpiCalculatorResult>> {
    const [
      attendanceToday,
      teacherCompliance,
      atRisk,
      behaviourWeek,
      safeguardingOpen,
      overdue,
      gradeLag,
      newApplications,
      parentEscalations,
      coverGaps,
    ] = await Promise.all([
      calculateAttendanceToday(tx, tenantId),
      calculateTeacherSubmissionCompliance(tx, tenantId),
      calculateAtRiskStudentsNew(tx, tenantId),
      calculateBehaviourIncidentsWeek(tx, tenantId),
      calculateOpenSafeguardingConcerns(tx, tenantId),
      calculateOverdueInvoices(tx, tenantId),
      calculateGradesSubmissionLag(tx, tenantId),
      calculateNewApplicationsWeek(tx, tenantId),
      calculateParentEscalations(tx, tenantId),
      calculateCoverGapsWeek(tx, tenantId),
    ]);

    return {
      attendance_today: attendanceToday,
      teacher_submission_compliance: teacherCompliance,
      at_risk_students: atRisk,
      behaviour_incidents_this_week: behaviourWeek,
      open_safeguarding_concerns: safeguardingOpen,
      overdue_invoices: overdue,
      grades_submission_lag: gradeLag,
      new_applications_this_week: newApplications,
      parent_escalations: parentEscalations,
      cover_gaps_this_week: coverGaps,
    };
  }

  private async computeTrends(
    tx: PrismaTransaction,
    tenantId: string,
  ): Promise<KpiDashboardResponse['data']['trends']> {
    const now = new Date();
    const weeks: string[] = [];
    const attendance: number[] = [];
    const grades: number[] = [];
    const collection: number[] = [];

    for (let i = 11; i >= 0; i -= 1) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      weeks.push((weekStart.toISOString().split('T')[0] as string) ?? weekStart.toISOString());

      const [attStats, gradeAgg, invStats] = await Promise.all([
        tx.attendanceRecord.groupBy({
          by: ['status'],
          where: {
            tenant_id: tenantId,
            session: { session_date: { gte: weekStart, lt: weekEnd } },
          },
          _count: true,
        }),
        tx.grade.aggregate({
          where: {
            tenant_id: tenantId,
            created_at: { gte: weekStart, lt: weekEnd },
            raw_score: { not: null },
          },
          _avg: { raw_score: true },
        }),
        tx.invoice.aggregate({
          where: {
            tenant_id: tenantId,
            created_at: { gte: weekStart, lt: weekEnd },
          },
          _sum: { total_amount: true, balance_amount: true },
        }),
      ]);

      const presentStatuses = new Set(['present', 'late', 'left_early']);
      const total = attStats.reduce((sum, g) => sum + g._count, 0);
      const present = attStats
        .filter((g) => presentStatuses.has(g.status))
        .reduce((sum, g) => sum + g._count, 0);
      attendance.push(total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0);

      const avg = Number(gradeAgg._avg.raw_score ?? 0);
      grades.push(Number(avg.toFixed(1)));

      const invoiced = Number(invStats._sum.total_amount ?? 0);
      const outstanding = Number(invStats._sum.balance_amount ?? 0);
      const rate = invoiced > 0 ? ((invoiced - outstanding) / invoiced) * 100 : 0;
      collection.push(Number(rate.toFixed(1)));
    }

    return { weeks, attendance, grades, collection };
  }
}

// Historical re-exports for consumers that imported these types from this
// module. Prefer `@school/shared/reports` going forward.
export type { KpiCard, KpiDashboardResponse } from '@school/shared/reports';
export type { KpiDelta } from '@school/shared/reports';
