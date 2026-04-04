import { Logger } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { ACTIVE_INCIDENT_FILTER } from './behaviour-students.constants';

interface MvStudentSummaryRow {
  tenant_id: string;
  student_id: string;
  positive_count: bigint;
  negative_count: bigint;
  neutral_count: bigint;
  total_points: bigint | null;
  last_incident_at: Date | null;
  unique_categories: bigint;
}

export interface WeeklyTrend {
  week_start: string;
  count: number;
}

export interface CategoryBreakdownEntry {
  category_id: string;
  category_name: string;
  polarity: string;
  count: number;
}

export interface PeriodComparisonEntry {
  period_id: string;
  period_name: string;
  incident_count: number;
}

export interface SanctionHistoryEntry {
  type: string;
  total: number;
  served: number;
  no_show: number;
}

export interface AttendanceCorrelation {
  total_days: number;
  absent_days: number;
  present_days: number;
  incidents_on_absent_days: number;
  incidents_on_present_days: number;
}

export class BehaviourStudentAnalyticsService {
  private readonly logger = new Logger(BehaviourStudentAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceReadFacade: AttendanceReadFacade,
  ) {}

  async computeAnalyticsSummary(tenantId: string, studentId: string) {
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    let totalPoints = 0;
    let fromMv = false;

    try {
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- aggregate query on materialized view with tenant filter
      const mvRows = await this.prisma.$queryRaw<MvStudentSummaryRow[]>`
        SELECT positive_count, negative_count, neutral_count, total_points
        FROM mv_student_behaviour_summary
        WHERE tenant_id = ${tenantId}::uuid AND student_id = ${studentId}::uuid
        LIMIT 1
      `;

      const row = mvRows[0];
      if (row) {
        positiveCount = Number(row.positive_count);
        negativeCount = Number(row.negative_count);
        neutralCount = Number(row.neutral_count);
        totalPoints = Number(row.total_points ?? 0);
        fromMv = true;
      }
    } catch {
      this.logger.debug(
        `MV mv_student_behaviour_summary not available for student ${studentId}, falling back to direct query`,
      );
    }

    if (!fromMv) {
      const participantWhere: Prisma.BehaviourIncidentParticipantWhereInput = {
        student_id: studentId,
        tenant_id: tenantId,
        participant_type: 'student',
        incident: ACTIVE_INCIDENT_FILTER,
      };

      const [posCount, negCount, neuCount, pointsAgg] = await Promise.all([
        this.prisma.behaviourIncidentParticipant.count({
          where: {
            ...participantWhere,
            incident: { ...ACTIVE_INCIDENT_FILTER, polarity: 'positive' },
          },
        }),
        this.prisma.behaviourIncidentParticipant.count({
          where: {
            ...participantWhere,
            incident: { ...ACTIVE_INCIDENT_FILTER, polarity: 'negative' },
          },
        }),
        this.prisma.behaviourIncidentParticipant.count({
          where: {
            ...participantWhere,
            incident: { ...ACTIVE_INCIDENT_FILTER, polarity: 'neutral' },
          },
        }),
        this.prisma.behaviourIncidentParticipant.aggregate({
          where: participantWhere,
          _sum: { points_awarded: true },
        }),
      ]);

      positiveCount = posCount;
      negativeCount = negCount;
      neutralCount = neuCount;
      totalPoints = pointsAgg._sum.points_awarded ?? 0;
    }

    const [activeInterventions, pendingSanctions] = await Promise.all([
      this.prisma.behaviourIntervention.count({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          status: {
            in: [
              'active_intervention' as $Enums.InterventionStatus,
              'monitoring' as $Enums.InterventionStatus,
            ],
          },
          retention_status: 'active' as $Enums.RetentionStatus,
        },
      }),
      this.prisma.behaviourSanction.count({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          status: {
            in: ['pending_approval' as $Enums.SanctionStatus, 'scheduled' as $Enums.SanctionStatus],
          },
          retention_status: 'active' as $Enums.RetentionStatus,
        },
      }),
    ]);

    const totalIncidents = positiveCount + negativeCount + neutralCount;
    const positiveRatio = totalIncidents > 0 ? positiveCount / totalIncidents : 0;

    return {
      total_incidents: totalIncidents,
      positive_count: positiveCount,
      negative_count: negativeCount,
      neutral_count: neutralCount,
      positive_ratio: Math.round(positiveRatio * 100) / 100,
      total_points: totalPoints,
      active_interventions: activeInterventions,
      pending_sanctions: pendingSanctions,
    };
  }

  async computeWeeklyTrend(tenantId: string, studentId: string): Promise<WeeklyTrend[]> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const incidents = await this.prisma.behaviourIncidentParticipant.findMany({
      where: {
        student_id: studentId,
        tenant_id: tenantId,
        participant_type: 'student',
        incident: {
          ...ACTIVE_INCIDENT_FILTER,
          occurred_at: { gte: ninetyDaysAgo },
        },
      },
      select: {
        incident: { select: { occurred_at: true } },
      },
    });

    const weekMap = new Map<string, number>();
    for (const entry of incidents) {
      const date = entry.incident.occurred_at;
      const weekStart = this.getWeekStart(date);
      const key = this.toDateString(weekStart);
      weekMap.set(key, (weekMap.get(key) ?? 0) + 1);
    }

    const result: WeeklyTrend[] = [];
    const currentWeek = this.getWeekStart(new Date());
    for (let i = 12; i >= 0; i--) {
      const weekDate = new Date(currentWeek);
      weekDate.setDate(weekDate.getDate() - i * 7);
      const key = this.toDateString(weekDate);
      result.push({
        week_start: key,
        count: weekMap.get(key) ?? 0,
      });
    }

    return result;
  }

  async computeCategoryBreakdown(
    tenantId: string,
    studentId: string,
  ): Promise<CategoryBreakdownEntry[]> {
    const grouped = await this.prisma.behaviourIncidentParticipant.findMany({
      where: {
        student_id: studentId,
        tenant_id: tenantId,
        participant_type: 'student',
        incident: ACTIVE_INCIDENT_FILTER,
      },
      select: {
        incident: {
          select: {
            category_id: true,
            polarity: true,
            category: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    const categoryMap = new Map<string, { name: string; polarity: string; count: number }>();
    for (const entry of grouped) {
      const categoryId = entry.incident.category_id;
      const existing = categoryMap.get(categoryId);
      if (existing) {
        existing.count++;
      } else {
        categoryMap.set(categoryId, {
          name: entry.incident.category?.name ?? 'Unknown',
          polarity: entry.incident.polarity,
          count: 1,
        });
      }
    }

    return Array.from(categoryMap.entries())
      .map(([categoryId, info]) => ({
        category_id: categoryId,
        category_name: info.name,
        polarity: info.polarity,
        count: info.count,
      }))
      .sort((a, b) => b.count - a.count);
  }

  async computePeriodComparison(
    tenantId: string,
    studentId: string,
  ): Promise<PeriodComparisonEntry[]> {
    const incidents = await this.prisma.behaviourIncidentParticipant.findMany({
      where: {
        student_id: studentId,
        tenant_id: tenantId,
        participant_type: 'student',
        incident: {
          ...ACTIVE_INCIDENT_FILTER,
          academic_period_id: { not: null },
        },
      },
      select: {
        incident: {
          select: {
            academic_period_id: true,
            academic_period: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    const periodMap = new Map<string, { name: string; count: number }>();
    for (const entry of incidents) {
      const periodId = entry.incident.academic_period_id;
      if (!periodId) continue;
      const existing = periodMap.get(periodId);
      if (existing) {
        existing.count++;
      } else {
        periodMap.set(periodId, {
          name: entry.incident.academic_period?.name ?? 'Unknown',
          count: 1,
        });
      }
    }

    return Array.from(periodMap.entries()).map(([periodId, info]) => ({
      period_id: periodId,
      period_name: info.name,
      incident_count: info.count,
    }));
  }

  async computeSanctionHistory(
    tenantId: string,
    studentId: string,
  ): Promise<SanctionHistoryEntry[]> {
    const sanctions = await this.prisma.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        retention_status: 'active' as $Enums.RetentionStatus,
      },
      select: {
        type: true,
        status: true,
      },
    });

    const typeMap = new Map<string, { total: number; served: number; no_show: number }>();
    for (const sanction of sanctions) {
      const typeKey = sanction.type;
      const existing = typeMap.get(typeKey) ?? {
        total: 0,
        served: 0,
        no_show: 0,
      };
      existing.total++;
      if (sanction.status === ('served' as $Enums.SanctionStatus)) {
        existing.served++;
      }
      if (sanction.status === ('no_show' as $Enums.SanctionStatus)) {
        existing.no_show++;
      }
      typeMap.set(typeKey, existing);
    }

    return Array.from(typeMap.entries()).map(([type, stats]) => ({
      type,
      ...stats,
    }));
  }

  async computeAttendanceCorrelation(
    tenantId: string,
    studentId: string,
  ): Promise<AttendanceCorrelation | null> {
    const attendanceCount = await this.attendanceReadFacade.countAllDailySummariesForStudent(
      tenantId,
      studentId,
    );

    if (attendanceCount === 0) {
      return null;
    }

    const attendanceDays = await this.attendanceReadFacade.findAllDailySummariesForStudent(
      tenantId,
      studentId,
    );

    const absentDates = new Set<string>();
    const presentDates = new Set<string>();

    for (const day of attendanceDays) {
      const dateKey = this.toDateString(day.summary_date);
      if (day.derived_status === ('absent' as $Enums.DailyAttendanceStatus)) {
        absentDates.add(dateKey);
      } else if (
        day.derived_status === ('present' as $Enums.DailyAttendanceStatus) ||
        day.derived_status === ('late' as $Enums.DailyAttendanceStatus)
      ) {
        presentDates.add(dateKey);
      }
    }

    const incidents = await this.prisma.behaviourIncidentParticipant.findMany({
      where: {
        student_id: studentId,
        tenant_id: tenantId,
        participant_type: 'student',
        incident: ACTIVE_INCIDENT_FILTER,
      },
      select: {
        incident: { select: { occurred_at: true } },
      },
    });

    let incidentsOnAbsentDays = 0;
    let incidentsOnPresentDays = 0;

    for (const entry of incidents) {
      const dateKey = this.toDateString(entry.incident.occurred_at);
      if (absentDates.has(dateKey)) {
        incidentsOnAbsentDays++;
      } else if (presentDates.has(dateKey)) {
        incidentsOnPresentDays++;
      }
    }

    return {
      total_days: attendanceDays.length,
      absent_days: absentDates.size,
      present_days: presentDates.size,
      incidents_on_absent_days: incidentsOnAbsentDays,
      incidents_on_present_days: incidentsOnPresentDays,
    };
  }

  private getWeekStart(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = day === 0 ? 6 : day - 1;
    result.setDate(result.getDate() - diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
