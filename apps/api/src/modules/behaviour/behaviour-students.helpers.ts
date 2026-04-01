import { Logger } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type {
  AttendanceCorrelation,
  CategoryBreakdownEntry,
  PeriodComparisonEntry,
  SanctionHistoryEntry,
  WeeklyTrend,
} from './behaviour-students.service';

// ─── Shared filter constant ───────────────────────────────────────────────────

/** Common incident status filter for active, non-withdrawn incidents. */
export const ACTIVE_INCIDENT_FILTER = {
  retention_status: 'active' as $Enums.RetentionStatus,
  status: {
    notIn: ['draft', 'withdrawn'] as $Enums.IncidentStatus[],
  },
};

// ─── Shape returned by the mv_student_behaviour_summary materialized view ─────

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

// ─── Date utilities ───────────────────────────────────────────────────────────

/**
 * Get the Monday start of the ISO week for a given date.
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Sunday = 0, Monday = 1, ... Saturday = 6
  // Shift so Monday = 0
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Extract YYYY-MM-DD date string from a Date object.
 * Safe alternative to `date.toISOString().split('T')[0]` which returns
 * `string | undefined` under strict TypeScript.
 */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─── Mapping: parent incident projection ─────────────────────────────────────

/** Input shape from the Prisma select used in getParentView. */
interface ParentIncidentRow {
  id: string;
  incident_number: string;
  polarity: string;
  severity: number;
  parent_description: string | null;
  parent_description_ar: string | null;
  occurred_at: Date;
  category: {
    id: string;
    name: string;
    name_ar: string | null;
    polarity: string;
  } | null;
}

/**
 * Maps a raw parent-visible incident row to the parent-facing DTO shape,
 * substituting parent_description over internal description and falling back to
 * the category name if no parent description is set.
 */
export function mapParentIncidentToDto(inc: ParentIncidentRow) {
  return {
    id: inc.id,
    incident_number: inc.incident_number,
    polarity: inc.polarity,
    severity: inc.severity,
    description: inc.parent_description ?? inc.category?.name ?? 'Incident',
    description_ar: inc.parent_description_ar ?? inc.category?.name_ar ?? null,
    occurred_at: inc.occurred_at,
    category: inc.category
      ? {
          id: inc.category.id,
          name: inc.category.name,
          name_ar: inc.category.name_ar,
          polarity: inc.category.polarity,
        }
      : null,
  };
}

// ─── Analytics helpers ────────────────────────────────────────────────────────

/**
 * Compute summary stats: total incidents by polarity, positive ratio,
 * total points, active interventions, pending sanctions.
 * Tries the mv_student_behaviour_summary materialized view first,
 * falls back to direct queries if the MV is not available.
 */
export async function computeAnalyticsSummary(
  prisma: PrismaService,
  logger: Logger,
  tenantId: string,
  studentId: string,
) {
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let totalPoints = 0;
  let fromMv = false;

  // Try materialized view first
  try {
    // eslint-disable-next-line school/no-raw-sql-outside-rls -- student behaviour statistics query
    const mvRows = await prisma.$queryRaw<MvStudentSummaryRow[]>`
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
    logger.debug(
      `MV mv_student_behaviour_summary not available for student ${studentId}, falling back to direct query`,
    );
  }

  // Fallback: compute directly
  if (!fromMv) {
    const participantWhere: Prisma.BehaviourIncidentParticipantWhereInput = {
      student_id: studentId,
      tenant_id: tenantId,
      participant_type: 'student',
      incident: ACTIVE_INCIDENT_FILTER,
    };

    const [posCount, negCount, neuCount, pointsAgg] = await Promise.all([
      prisma.behaviourIncidentParticipant.count({
        where: {
          ...participantWhere,
          incident: { ...ACTIVE_INCIDENT_FILTER, polarity: 'positive' },
        },
      }),
      prisma.behaviourIncidentParticipant.count({
        where: {
          ...participantWhere,
          incident: { ...ACTIVE_INCIDENT_FILTER, polarity: 'negative' },
        },
      }),
      prisma.behaviourIncidentParticipant.count({
        where: {
          ...participantWhere,
          incident: { ...ACTIVE_INCIDENT_FILTER, polarity: 'neutral' },
        },
      }),
      prisma.behaviourIncidentParticipant.aggregate({
        where: participantWhere,
        _sum: { points_awarded: true },
      }),
    ]);

    positiveCount = posCount;
    negativeCount = negCount;
    neutralCount = neuCount;
    totalPoints = pointsAgg._sum.points_awarded ?? 0;
  }

  // Always compute active interventions and pending sanctions directly
  const [activeInterventions, pendingSanctions] = await Promise.all([
    prisma.behaviourIntervention.count({
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
    prisma.behaviourSanction.count({
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

/**
 * Weekly incident counts for the last 90 days, bucketed by ISO week (Monday start).
 * Returns a full 13-week range with zeros for weeks with no incidents.
 */
export async function computeWeeklyTrend(
  prisma: PrismaService,
  tenantId: string,
  studentId: string,
): Promise<WeeklyTrend[]> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const incidents = await prisma.behaviourIncidentParticipant.findMany({
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

  // Bucket by ISO week (Monday start)
  const weekMap = new Map<string, number>();
  for (const entry of incidents) {
    const date = entry.incident.occurred_at;
    const weekStart = getWeekStart(date);
    const key = toDateString(weekStart);
    weekMap.set(key, (weekMap.get(key) ?? 0) + 1);
  }

  // Build full 13-week range
  const result: WeeklyTrend[] = [];
  const currentWeek = getWeekStart(new Date());
  for (let i = 12; i >= 0; i--) {
    const weekDate = new Date(currentWeek);
    weekDate.setDate(weekDate.getDate() - i * 7);
    const key = toDateString(weekDate);
    result.push({
      week_start: key,
      count: weekMap.get(key) ?? 0,
    });
  }

  return result;
}

/**
 * Top categories for a student's incidents, sorted by frequency descending.
 */
export async function computeCategoryBreakdown(
  prisma: PrismaService,
  tenantId: string,
  studentId: string,
): Promise<CategoryBreakdownEntry[]> {
  const grouped = await prisma.behaviourIncidentParticipant.findMany({
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

  // Aggregate in application code
  const categoryMap = new Map<string, { name: string; polarity: string; count: number }>();
  for (const entry of grouped) {
    const catId = entry.incident.category_id;
    const existing = categoryMap.get(catId);
    if (existing) {
      existing.count++;
    } else {
      categoryMap.set(catId, {
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

/**
 * Incident counts per academic period for a student.
 */
export async function computePeriodComparison(
  prisma: PrismaService,
  tenantId: string,
  studentId: string,
): Promise<PeriodComparisonEntry[]> {
  // Get all incidents for this student that have an academic_period_id
  const incidents = await prisma.behaviourIncidentParticipant.findMany({
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

  // Aggregate by period
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

/**
 * Sanction history grouped by sanction type, with served and no-show counts.
 */
export async function computeSanctionHistory(
  prisma: PrismaService,
  tenantId: string,
  studentId: string,
): Promise<SanctionHistoryEntry[]> {
  const sanctions = await prisma.behaviourSanction.findMany({
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

  // Group by type
  const typeMap = new Map<string, { total: number; served: number; no_show: number }>();
  for (const s of sanctions) {
    const typeKey = s.type;
    const existing = typeMap.get(typeKey) ?? {
      total: 0,
      served: 0,
      no_show: 0,
    };
    existing.total++;
    if (s.status === ('served' as $Enums.SanctionStatus)) {
      existing.served++;
    }
    if (s.status === ('no_show' as $Enums.SanctionStatus)) {
      existing.no_show++;
    }
    typeMap.set(typeKey, existing);
  }

  return Array.from(typeMap.entries()).map(([type, stats]) => ({
    type,
    ...stats,
  }));
}

/**
 * Attendance correlation: compare incident counts on absent vs present days.
 * Returns null if no attendance data exists for this student.
 */
export async function computeAttendanceCorrelation(
  prisma: PrismaService,
  tenantId: string,
  studentId: string,
): Promise<AttendanceCorrelation | null> {
  // Check if any attendance data exists
  const attendanceCount = await prisma.dailyAttendanceSummary.count({
    where: {
      tenant_id: tenantId,
      student_id: studentId,
    },
  });

  if (attendanceCount === 0) {
    return null;
  }

  // Get all attendance summaries
  const attendanceDays = await prisma.dailyAttendanceSummary.findMany({
    where: {
      tenant_id: tenantId,
      student_id: studentId,
    },
    select: {
      summary_date: true,
      derived_status: true,
    },
  });

  // Build sets of absent and present dates
  const absentDates = new Set<string>();
  const presentDates = new Set<string>();

  for (const day of attendanceDays) {
    const dateKey = toDateString(day.summary_date);
    if (day.derived_status === ('absent' as $Enums.DailyAttendanceStatus)) {
      absentDates.add(dateKey);
    } else if (
      day.derived_status === ('present' as $Enums.DailyAttendanceStatus) ||
      day.derived_status === ('late' as $Enums.DailyAttendanceStatus)
    ) {
      presentDates.add(dateKey);
    }
  }

  // Get all incident dates for this student
  const incidents = await prisma.behaviourIncidentParticipant.findMany({
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
    const dateKey = toDateString(entry.incident.occurred_at);
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
