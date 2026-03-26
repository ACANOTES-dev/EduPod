import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourPointsService } from './behaviour-points.service';
import { BehaviourScopeService } from './behaviour-scope.service';

/** Common incident status filter for active, non-withdrawn incidents. */
const ACTIVE_INCIDENT_FILTER = {
  retention_status: 'active' as $Enums.RetentionStatus,
  status: {
    notIn: [
      'draft',
      'withdrawn',
    ] as $Enums.IncidentStatus[],
  },
};

@Injectable()
export class BehaviourStudentsService {
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
    const scopeCtx = await this.scopeService.getUserScope(
      tenantId,
      userId,
      permissions,
    );

    const studentFilter: Prisma.StudentWhereInput = {
      tenant_id: tenantId,
      status: 'active',
    };

    if (scopeCtx.scope === 'class' && scopeCtx.classStudentIds) {
      studentFilter.id = { in: scopeCtx.classStudentIds };
    } else if (
      scopeCtx.scope === 'year_group' &&
      scopeCtx.yearGroupIds
    ) {
      studentFilter.year_group_id = { in: scopeCtx.yearGroupIds };
    } else if (scopeCtx.scope === 'own') {
      // For 'own' scope, show students from user's incidents
      const participantStudentIds =
        await this.prisma.behaviourIncidentParticipant.findMany({
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
    const pointAggregates =
      await this.prisma.behaviourIncidentParticipant.groupBy({
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
      pointAggregates.map((p) => [
        p.student_id,
        p._sum.points_awarded ?? 0,
      ]),
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
    const [pointsResult, incidentCount, positiveCounts, negativeCounts] =
      await Promise.all([
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
  async getStudentTimeline(
    tenantId: string,
    studentId: string,
    page: number,
    pageSize: number,
  ) {
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
    const points =
      await this.prisma.behaviourIncidentParticipant.aggregate({
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
  async getStudentTasks(
    tenantId: string,
    studentId: string,
    page: number,
    pageSize: number,
  ) {
    const incidentIds =
      await this.prisma.behaviourIncidentParticipant.findMany({
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
}
