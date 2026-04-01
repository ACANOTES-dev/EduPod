import { Injectable, Logger } from '@nestjs/common';
import { $Enums } from '@prisma/client';

import type { BehaviourAnalyticsQuery, StaffResult, TeacherAnalyticsResult } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { EXCLUDED_STATUSES, buildDateRange, makeDataQuality } from './behaviour-analytics-helpers';

@Injectable()
export class BehaviourStaffAnalyticsService {
  private readonly logger = new Logger(BehaviourStaffAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Staff Logging Activity ────────────────────────────────────────────────

  async getStaffActivity(tenantId: string, query: BehaviourAnalyticsQuery): Promise<StaffResult> {
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
    const lastLogMap = new Map(lastLogged.map((r) => [r.reported_by_id, r._max.occurred_at]));

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

    return { staff, data_quality: makeDataQuality(false) };
  }

  // ─── Teacher Analytics ─────────────────────────────────────────────────────

  async getTeacherAnalytics(
    tenantId: string,
    query: BehaviourAnalyticsQuery,
  ): Promise<TeacherAnalyticsResult> {
    const { from, to } = buildDateRange(query);

    // Get incidents grouped by reporter (teacher)
    const rawData = await this.prisma.behaviourIncident.groupBy({
      by: ['reported_by_id', 'polarity'],
      where: {
        tenant_id: tenantId,
        occurred_at: { gte: from, lte: to },
        status: { notIn: EXCLUDED_STATUSES },
        retention_status: 'active' as $Enums.RetentionStatus,
      },
      _count: true,
    });

    // Gather unique teacher IDs
    const teacherIds = [...new Set(rawData.map((r) => r.reported_by_id))];

    // Get teacher names
    const teachers = await this.prisma.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, first_name: true, last_name: true },
    });
    const teacherNameMap = new Map(teachers.map((t) => [t.id, `${t.first_name} ${t.last_name}`]));

    // Build teacher stats map
    const teacherMap = new Map<string, { positive: number; negative: number; neutral: number }>();

    for (const row of rawData) {
      const existing = teacherMap.get(row.reported_by_id) ?? {
        positive: 0,
        negative: 0,
        neutral: 0,
      };
      const polarity = row.polarity as string;
      if (polarity === 'positive') existing.positive += row._count;
      else if (polarity === 'negative') existing.negative += row._count;
      else existing.neutral += row._count;
      teacherMap.set(row.reported_by_id, existing);
    }

    // Try to get exposure (teaching periods) per teacher from MV
    let exposureNormalised = false;
    const exposureTeacherMap = new Map<string, number>();

    try {
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- aggregate query on materialized view with tenant filter
      const exposureRows = await this.prisma.$queryRaw<
        Array<{ teacher_id: string; total_teaching_periods: bigint }>
      >`SELECT teacher_id, SUM(total_teaching_periods) as total_teaching_periods
        FROM mv_behaviour_exposure_rates
        WHERE tenant_id = ${tenantId}::uuid
        GROUP BY teacher_id`;

      for (const row of exposureRows) {
        exposureTeacherMap.set(row.teacher_id, Number(row.total_teaching_periods));
      }
      if (exposureTeacherMap.size > 0) exposureNormalised = true;
    } catch {
      this.logger.warn('Exposure rate MV not available for teacher analytics');
    }

    const entries = Array.from(teacherMap.entries()).map(([teacherId, data]) => {
      const total = data.positive + data.negative + data.neutral;
      const posNeg = data.positive + data.negative;
      const exposure = exposureTeacherMap.get(teacherId);
      return {
        teacher_id: teacherId,
        teacher_name: teacherNameMap.get(teacherId) ?? 'Unknown',
        incident_count: total,
        positive_count: data.positive,
        negative_count: data.negative,
        neutral_count: data.neutral,
        positive_ratio: posNeg > 0 ? data.positive / posNeg : null,
        logging_rate_per_period:
          exposureNormalised && exposure && exposure > 0
            ? Math.round((total / exposure) * 10000) / 100
            : null,
        total_teaching_periods: exposure ?? null,
      };
    });

    // Sort by incident count descending
    entries.sort((a, b) => b.incident_count - a.incident_count);

    return { entries, data_quality: makeDataQuality(exposureNormalised) };
  }
}
