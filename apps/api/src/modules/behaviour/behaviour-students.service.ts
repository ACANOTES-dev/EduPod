import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourPointsService } from './behaviour-points.service';
import { BehaviourScopeService } from './behaviour-scope.service';

/** Common incident status filter for active, non-withdrawn incidents. */
const ACTIVE_INCIDENT_FILTER = {
  retention_status: 'active' as $Enums.RetentionStatus,
  status: {
    notIn: ['draft', 'withdrawn'] as $Enums.IncidentStatus[],
  },
};

/** Shape returned by the mv_student_behaviour_summary materialized view. */
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

/** Weekly trend bucket for student analytics. */
export interface WeeklyTrend {
  week_start: string;
  count: number;
}

/** Category breakdown entry. */
export interface CategoryBreakdownEntry {
  category_id: string;
  category_name: string;
  polarity: string;
  count: number;
}

/** Period comparison entry. */
export interface PeriodComparisonEntry {
  period_id: string;
  period_name: string;
  incident_count: number;
}

/** Sanction history grouped entry. */
export interface SanctionHistoryEntry {
  type: string;
  total: number;
  served: number;
  no_show: number;
}

/** Attendance correlation data. */
export interface AttendanceCorrelation {
  total_days: number;
  absent_days: number;
  present_days: number;
  incidents_on_absent_days: number;
  incidents_on_present_days: number;
}

@Injectable()
export class BehaviourStudentsService {
  private readonly logger = new Logger(BehaviourStudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: BehaviourScopeService,
    private readonly pointsService: BehaviourPointsService,
  ) {}

  /**
   * List students with behaviour summary, scoped to the user's visibility.
   */
  async listStudents(
    tenantId: string,
    userId: string,
    permissions: string[],
    page: number,
    pageSize: number,
  ) {
    const scopeCtx = await this.scopeService.getUserScope(tenantId, userId, permissions);

    const studentFilter: Prisma.StudentWhereInput = {
      tenant_id: tenantId,
      status: 'active',
    };

    if (scopeCtx.scope === 'class' && scopeCtx.classStudentIds) {
      studentFilter.id = { in: scopeCtx.classStudentIds };
    } else if (scopeCtx.scope === 'year_group' && scopeCtx.yearGroupIds) {
      studentFilter.year_group_id = { in: scopeCtx.yearGroupIds };
    } else if (scopeCtx.scope === 'own') {
      // For 'own' scope, show students from user's incidents
      const participantStudentIds = await this.prisma.behaviourIncidentParticipant.findMany({
        where: {
          tenant_id: tenantId,
          participant_type: 'student',
          student_id: { not: null },
          incident: { reported_by_id: userId },
        },
        select: { student_id: true },
        distinct: ['student_id'],
      });
      studentFilter.id = {
        in: participantStudentIds
          .map((p) => p.student_id)
          .filter((id): id is string => id !== null),
      };
    }

    const [students, total] = await Promise.all([
      this.prisma.student.findMany({
        where: studentFilter,
        orderBy: { last_name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          first_name: true,
          last_name: true,
          student_number: true,
          year_group: { select: { id: true, name: true } },
          _count: {
            select: {
              bh_incident_participants: {
                where: { incident: ACTIVE_INCIDENT_FILTER },
              },
            },
          },
        },
      }),
      this.prisma.student.count({ where: studentFilter }),
    ]);

    // Get point totals for returned students
    const studentIds = students.map((s) => s.id);
    const pointAggregates = await this.prisma.behaviourIncidentParticipant.groupBy({
      by: ['student_id'],
      where: {
        student_id: { in: studentIds },
        tenant_id: tenantId,
        participant_type: 'student',
        incident: ACTIVE_INCIDENT_FILTER,
      },
      _sum: { points_awarded: true },
    });

    const pointsMap = new Map(
      pointAggregates.map((p) => [p.student_id, p._sum.points_awarded ?? 0]),
    );

    const data = students.map((s) => ({
      ...s,
      total_points: pointsMap.get(s.id) ?? 0,
      incident_count: s._count.bh_incident_participants,
    }));

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * Full student behaviour profile.
   */
  async getStudentProfile(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      include: { year_group: { select: { id: true, name: true } } },
    });
    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found',
      });
    }

    // Points via scope-aware service (respects points_reset_frequency)
    const [pointsResult, incidentCount, positiveCounts, negativeCounts] = await Promise.all([
      this.pointsService.getStudentPoints(tenantId, studentId),
      this.prisma.behaviourIncidentParticipant.count({
        where: {
          student_id: studentId,
          tenant_id: tenantId,
          participant_type: 'student',
          incident: ACTIVE_INCIDENT_FILTER,
        },
      }),
      this.prisma.behaviourIncidentParticipant.count({
        where: {
          student_id: studentId,
          tenant_id: tenantId,
          participant_type: 'student',
          incident: { ...ACTIVE_INCIDENT_FILTER, polarity: 'positive' },
        },
      }),
      this.prisma.behaviourIncidentParticipant.count({
        where: {
          student_id: studentId,
          tenant_id: tenantId,
          participant_type: 'student',
          incident: { ...ACTIVE_INCIDENT_FILTER, polarity: 'negative' },
        },
      }),
    ]);

    return {
      student,
      points: {
        total: pointsResult.total,
        fromCache: pointsResult.fromCache,
      },
      summary: {
        total_points: pointsResult.total,
        total_incidents: incidentCount,
        positive_count: positiveCounts,
        negative_count: negativeCounts,
      },
    };
  }

  /**
   * Paginated timeline of behaviour incidents for a student.
   */
  async getStudentTimeline(tenantId: string, studentId: string, page: number, pageSize: number) {
    const where: Prisma.BehaviourIncidentParticipantWhereInput = {
      tenant_id: tenantId,
      student_id: studentId,
      participant_type: 'student',
      incident: {
        retention_status: 'active',
        status: { not: 'withdrawn' },
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourIncidentParticipant.findMany({
        where,
        orderBy: { incident: { occurred_at: 'desc' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          incident: {
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                  name_ar: true,
                  color: true,
                  icon: true,
                  polarity: true,
                },
              },
              reported_by: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.behaviourIncidentParticipant.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * Get total points for a student.
   */
  async getStudentPoints(tenantId: string, studentId: string) {
    const points = await this.prisma.behaviourIncidentParticipant.aggregate({
      where: {
        student_id: studentId,
        tenant_id: tenantId,
        participant_type: 'student',
        incident: ACTIVE_INCIDENT_FILTER,
      },
      _sum: { points_awarded: true },
    });
    return { total_points: points._sum.points_awarded ?? 0 };
  }

  /**
   * Get tasks related to a student's incidents.
   */
  async getStudentTasks(tenantId: string, studentId: string, page: number, pageSize: number) {
    const incidentIds = await this.prisma.behaviourIncidentParticipant.findMany({
      where: {
        student_id: studentId,
        tenant_id: tenantId,
        participant_type: 'student',
      },
      select: { incident_id: true },
    });

    const where: Prisma.BehaviourTaskWhereInput = {
      tenant_id: tenantId,
      entity_type: 'incident',
      entity_id: { in: incidentIds.map((i) => i.incident_id) },
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourTask.findMany({
        where,
        orderBy: { due_date: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.behaviourTask.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * Lightweight preview for student hover/tooltip cards.
   */
  async getStudentPreview(tenantId: string, studentId: string) {
    const profile = await this.getStudentProfile(tenantId, studentId);
    return {
      id: profile.student.id,
      first_name: profile.student.first_name,
      last_name: profile.student.last_name,
      year_group: profile.student.year_group?.name ?? null,
      ...profile.summary,
    };
  }

  // ─── 1. Student Analytics ──────────────────────────────────────────────────

  /**
   * Full analytics for a student: summary, trends, category breakdown,
   * period comparison, sanction history, and attendance correlation.
   */
  async getStudentAnalytics(tenantId: string, studentId: string) {
    // Validate student exists
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found',
      });
    }

    const [
      summary,
      trend,
      categoryBreakdown,
      periodComparison,
      sanctionHistory,
      attendanceCorrelation,
    ] = await Promise.all([
      this.computeAnalyticsSummary(tenantId, studentId),
      this.computeWeeklyTrend(tenantId, studentId),
      this.computeCategoryBreakdown(tenantId, studentId),
      this.computePeriodComparison(tenantId, studentId),
      this.computeSanctionHistory(tenantId, studentId),
      this.computeAttendanceCorrelation(tenantId, studentId),
    ]);

    return {
      data: {
        summary,
        trend,
        category_breakdown: categoryBreakdown,
        period_comparison: periodComparison,
        sanction_history: sanctionHistory,
        attendance_correlation: attendanceCorrelation,
      },
    };
  }

  // ─── 2. Student Sanctions ──────────────────────────────────────────────────

  /**
   * Paginated sanctions for a student, sorted by scheduled_date DESC.
   */
  async getStudentSanctions(tenantId: string, studentId: string, page: number, pageSize: number) {
    const where: Prisma.BehaviourSanctionWhereInput = {
      tenant_id: tenantId,
      student_id: studentId,
      retention_status: 'active' as $Enums.RetentionStatus,
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourSanction.findMany({
        where,
        orderBy: { scheduled_date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          sanction_number: true,
          type: true,
          status: true,
          scheduled_date: true,
          scheduled_start_time: true,
          scheduled_end_time: true,
          suspension_start_date: true,
          suspension_end_date: true,
          suspension_days: true,
          served_at: true,
          notes: true,
          created_at: true,
          incident: {
            select: {
              id: true,
              incident_number: true,
              polarity: true,
              severity: true,
              occurred_at: true,
              category: {
                select: { id: true, name: true, name_ar: true },
              },
            },
          },
          supervised_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      }),
      this.prisma.behaviourSanction.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── 3. Student Interventions ──────────────────────────────────────────────

  /**
   * Paginated interventions for a student, with assigned user and latest review.
   */
  async getStudentInterventions(
    tenantId: string,
    studentId: string,
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.BehaviourInterventionWhereInput = {
      tenant_id: tenantId,
      student_id: studentId,
      retention_status: 'active' as $Enums.RetentionStatus,
    };

    const [rawData, total] = await Promise.all([
      this.prisma.behaviourIntervention.findMany({
        where,
        orderBy: { start_date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          intervention_number: true,
          title: true,
          type: true,
          status: true,
          trigger_description: true,
          goals: true,
          strategies: true,
          start_date: true,
          target_end_date: true,
          actual_end_date: true,
          review_frequency_days: true,
          next_review_date: true,
          outcome: true,
          outcome_notes: true,
          created_at: true,
          assigned_to: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
          reviews: {
            orderBy: { review_date: 'desc' as const },
            take: 1,
            select: {
              id: true,
              review_date: true,
              progress: true,
              notes: true,
              reviewed_by: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.behaviourIntervention.count({ where }),
    ]);

    // Reshape to include latest_review at top level
    const data = rawData.map((intervention) => {
      const { reviews, ...rest } = intervention;
      return {
        ...rest,
        latest_review: reviews[0] ?? null,
      };
    });

    return { data, meta: { page, pageSize, total } };
  }

  // ─── 4. Student Awards ─────────────────────────────────────────────────────

  /**
   * Paginated recognition awards for a student, with award type details.
   */
  async getStudentAwards(tenantId: string, studentId: string, page: number, pageSize: number) {
    const where: Prisma.BehaviourRecognitionAwardWhereInput = {
      tenant_id: tenantId,
      student_id: studentId,
      superseded_by_id: null, // Only show non-superseded awards
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourRecognitionAward.findMany({
        where,
        orderBy: { awarded_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          points_at_award: true,
          awarded_at: true,
          notes: true,
          created_at: true,
          award_type: {
            select: {
              id: true,
              name: true,
              name_ar: true,
              icon: true,
              color: true,
              tier_group: true,
              tier_level: true,
            },
          },
          awarded_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      }),
      this.prisma.behaviourRecognitionAward.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── 5. Student AI Summary ─────────────────────────────────────────────────

  /**
   * Returns null data with a message — the AI service handles NL queries,
   * not per-student summaries. A dedicated student summary endpoint
   * would require a separate AI prompt pipeline.
   */
  async getStudentAiSummary(_tenantId: string, _studentId: string) {
    return { data: null, message: 'AI summary not available' };
  }

  // ─── 7. Parent View ────────────────────────────────────────────────────────

  /**
   * Return PARENT-class filtered data: only parent-visible incidents
   * (using parent_description), sanctions (type + date only), awards,
   * and acknowledgement status. No context_notes, SEND data, or
   * safeguarding data.
   */
  async getParentView(tenantId: string, studentId: string) {
    // Validate student exists
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        student_number: true,
      },
    });
    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found',
      });
    }

    const [incidents, sanctions, awards, acknowledgements] = await Promise.all([
      // Parent-visible incidents only, using parent_description
      this.prisma.behaviourIncident.findMany({
        where: {
          tenant_id: tenantId,
          category: { parent_visible: true },
          retention_status: 'active' as $Enums.RetentionStatus,
          status: {
            notIn: ['draft' as $Enums.IncidentStatus, 'withdrawn' as $Enums.IncidentStatus],
          },
          participants: {
            some: { student_id: studentId, participant_type: 'student' },
          },
        },
        orderBy: { occurred_at: 'desc' },
        take: 50,
        select: {
          id: true,
          incident_number: true,
          polarity: true,
          severity: true,
          parent_description: true,
          parent_description_ar: true,
          occurred_at: true,
          category: {
            select: {
              id: true,
              name: true,
              name_ar: true,
              polarity: true,
            },
          },
        },
      }),

      // Sanctions: type + date only, no staff notes
      this.prisma.behaviourSanction.findMany({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          retention_status: 'active' as $Enums.RetentionStatus,
          status: {
            notIn: ['cancelled' as $Enums.SanctionStatus, 'superseded' as $Enums.SanctionStatus],
          },
        },
        orderBy: { scheduled_date: 'desc' },
        take: 20,
        select: {
          id: true,
          sanction_number: true,
          type: true,
          status: true,
          scheduled_date: true,
          suspension_start_date: true,
          suspension_end_date: true,
        },
      }),

      // Awards
      this.prisma.behaviourRecognitionAward.findMany({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          superseded_by_id: null,
        },
        orderBy: { awarded_at: 'desc' },
        take: 20,
        select: {
          id: true,
          awarded_at: true,
          points_at_award: true,
          award_type: {
            select: { name: true, name_ar: true, icon: true, tier_level: true },
          },
        },
      }),

      // Acknowledgement status
      this.prisma.behaviourParentAcknowledgement.findMany({
        where: {
          tenant_id: tenantId,
          incident: {
            participants: {
              some: { student_id: studentId, participant_type: 'student' },
            },
          },
        },
        orderBy: { sent_at: 'desc' },
        take: 50,
        select: {
          id: true,
          incident_id: true,
          sent_at: true,
          acknowledged_at: true,
          acknowledgement_method: true,
        },
      }),
    ]);

    // Map incidents to use parent_description instead of description
    const parentIncidents = incidents.map((inc) => ({
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
    }));

    return {
      data: {
        student: {
          id: student.id,
          first_name: student.first_name,
          last_name: student.last_name,
        },
        incidents: parentIncidents,
        sanctions,
        awards,
        acknowledgements,
      },
    };
  }

  // ─── Private Analytics Helpers ─────────────────────────────────────────────

  /**
   * Compute summary stats: total incidents by polarity, positive ratio,
   * total points, active interventions, pending sanctions.
   * Tries MV first, falls back to direct queries.
   */
  private async computeAnalyticsSummary(tenantId: string, studentId: string) {
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    let totalPoints = 0;
    let fromMv = false;

    // Try materialized view first
    try {
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- student behaviour statistics query
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

    // Fallback: compute directly
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

    // Always compute active interventions and pending sanctions directly
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

  /**
   * Weekly incident counts for the last 90 days.
   */
  private async computeWeeklyTrend(tenantId: string, studentId: string): Promise<WeeklyTrend[]> {
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

    // Bucket by ISO week (Monday start)
    const weekMap = new Map<string, number>();
    for (const entry of incidents) {
      const date = entry.incident.occurred_at;
      const weekStart = this.getWeekStart(date);
      const key = this.toDateString(weekStart);
      weekMap.set(key, (weekMap.get(key) ?? 0) + 1);
    }

    // Build full 13-week range
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

  /**
   * Top categories for this student's incidents.
   */
  private async computeCategoryBreakdown(
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
   * Incident counts per academic period.
   */
  private async computePeriodComparison(
    tenantId: string,
    studentId: string,
  ): Promise<PeriodComparisonEntry[]> {
    // Get all incidents for this student that have an academic_period_id
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
   * Sanction history grouped by type with served/no_show counts.
   */
  private async computeSanctionHistory(
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
   * Attendance correlation (Gap 10): compare incident counts on absent vs present days.
   * Returns null if no attendance data exists for this student.
   */
  private async computeAttendanceCorrelation(
    tenantId: string,
    studentId: string,
  ): Promise<AttendanceCorrelation | null> {
    // Check if any attendance data exists
    const attendanceCount = await this.prisma.dailyAttendanceSummary.count({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
      },
    });

    if (attendanceCount === 0) {
      return null;
    }

    // Get all attendance summaries
    const attendanceDays = await this.prisma.dailyAttendanceSummary.findMany({
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

    // Get all incident dates for this student
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

  /**
   * Get the Monday start of the ISO week for a given date.
   */
  private getWeekStart(date: Date): Date {
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
  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
