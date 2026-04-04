import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { BehaviourPointsService } from './behaviour-points.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { BehaviourStudentAnalyticsService } from './behaviour-student-analytics.service';
import { ACTIVE_INCIDENT_FILTER } from './behaviour-students.constants';
import { mapParentIncidentToDto } from './behaviour-students.helpers';

export type {
  AttendanceCorrelation,
  CategoryBreakdownEntry,
  PeriodComparisonEntry,
  SanctionHistoryEntry,
  WeeklyTrend,
} from './behaviour-student-analytics.service';

@Injectable()
export class BehaviourStudentsService {
  private readonly analyticsService: BehaviourStudentAnalyticsService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: BehaviourScopeService,
    private readonly pointsService: BehaviourPointsService,
    private readonly attendanceReadFacade: AttendanceReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
  ) {
    this.analyticsService = new BehaviourStudentAnalyticsService(
      this.prisma,
      this.attendanceReadFacade,
    );
  }

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
      this.studentReadFacade.findManyGeneric(tenantId, {
        where: studentFilter,
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
        orderBy: { last_name: 'asc' },
      }) as Promise<Array<{
        id: string;
        first_name: string;
        last_name: string;
        student_number: string | null;
        year_group: { id: string; name: string } | null;
        _count: { bh_incident_participants: number };
      }>>,
      this.studentReadFacade.count(tenantId, studentFilter),
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
    const student = await this.studentReadFacade.findById(tenantId, studentId);
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
    const studentExists = await this.studentReadFacade.exists(tenantId, studentId);
    if (!studentExists) {
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
      this.analyticsService.computeAnalyticsSummary(tenantId, studentId),
      this.analyticsService.computeWeeklyTrend(tenantId, studentId),
      this.analyticsService.computeCategoryBreakdown(tenantId, studentId),
      this.analyticsService.computePeriodComparison(tenantId, studentId),
      this.analyticsService.computeSanctionHistory(tenantId, studentId),
      this.analyticsService.computeAttendanceCorrelation(tenantId, studentId),
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
    const student = await this.studentReadFacade.findById(tenantId, studentId);
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
    const parentIncidents = incidents.map(mapParentIncidentToDto);

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
}
