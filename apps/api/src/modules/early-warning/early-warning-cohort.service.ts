import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { CohortQuery } from '@school/shared/early-warning';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CohortResponseRow {
  group_id: string;
  group_name: string;
  student_count: number;
  avg_composite: number;
  avg_attendance: number;
  avg_grades: number;
  avg_behaviour: number;
  avg_wellbeing: number;
  avg_engagement: number;
}

interface RoleScopeFilter {
  studentIds?: string[];
  unrestricted: boolean;
}

interface ProfileRow {
  id: string;
  student_id: string;
  composite_score: number;
  attendance_score: number;
  grades_score: number;
  behaviour_score: number;
  wellbeing_score: number;
  engagement_score: number;
  risk_tier: string;
  student: {
    id: string;
    year_group_id: string | null;
    year_group?: { id: string; name: string } | null;
    class_enrolments?: Array<{
      class_entity: {
        id: string;
        name: string;
        subject_id: string | null;
        subject?: { id: string; name: string } | null;
      };
    }>;
  };
}

@Injectable()
export class EarlyWarningCohortService {
  private readonly logger = new Logger(EarlyWarningCohortService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
  ) {}

  // ─── Role-scoping (mirrors EarlyWarningService logic) ─────────────────────

  private async resolveRoleScope(
    tenantId: string,
    userId: string,
    membershipId: string | null,
  ): Promise<RoleScopeFilter> {
    if (!membershipId) {
      return { unrestricted: false, studentIds: [] };
    }

    const membership = await this.rbacReadFacade.findMembershipByIdAndUser(
      tenantId,
      membershipId,
      userId,
    );

    if (!membership) {
      return { unrestricted: false, studentIds: [] };
    }

    const permissions = membership.membership_roles.flatMap((mr) =>
      mr.role.role_permissions.map((rp) => rp.permission.permission_key),
    );

    if (permissions.includes('early_warning.manage')) {
      return { unrestricted: true };
    }

    // Staff: find students in classes via staff profile
    const staffProfile = await this.staffProfileReadFacade.findByUserId(tenantId, userId);

    if (staffProfile) {
      const classStaffRows = await this.classesReadFacade.findClassesByStaff(
        tenantId,
        staffProfile.id,
      );

      if (classStaffRows.length > 0) {
        const classIds = classStaffRows.map((cs) => cs.class_id);
        const studentIdSets = await Promise.all(
          classIds.map((classId) => this.classesReadFacade.findEnrolledStudentIds(tenantId, classId)),
        );
        const uniqueStudentIds = [...new Set(studentIdSets.flat())];
        return { unrestricted: false, studentIds: uniqueStudentIds };
      }
    }

    return { unrestricted: false, studentIds: [] };
  }

  // ─── GET /v1/early-warnings/cohort ────────────────────────────────────────

  async getCohortPivot(
    tenantId: string,
    userId: string,
    membershipId: string | null,
    query: CohortQuery,
  ): Promise<{ data: CohortResponseRow[] }> {
    const [scope, academicYear] = await Promise.all([
      this.resolveRoleScope(tenantId, userId, membershipId),
      this.academicReadFacade.findCurrentYear(tenantId),
    ]);

    if (!academicYear) {
      throw new NotFoundException({
        code: 'NO_ACTIVE_ACADEMIC_YEAR',
        message: 'No active academic year found for this tenant',
      });
    }

    // Fetch profiles with student relationships needed for grouping
    const whereClause: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id: academicYear.id,
    };
    if (!scope.unrestricted) {
      whereClause.student_id = { in: scope.studentIds ?? [] };
    }
    if (query.tier) {
      whereClause.risk_tier = query.tier;
    }
    if (query.year_group_id) {
      whereClause.student = { year_group_id: query.year_group_id };
    }
    if (query.class_id) {
      whereClause.student = {
        ...(whereClause.student as Record<string, unknown>),
        class_enrolments: {
          some: { class_id: query.class_id, status: 'active' },
        },
      };
    }

    const profiles = (await this.prisma.studentRiskProfile.findMany({
      where: whereClause,
      include: {
        student: {
          select: {
            id: true,
            year_group_id: true,
            year_group: { select: { id: true, name: true } },
            class_enrolments: {
              where: { status: 'active' },
              select: {
                class_entity: {
                  select: {
                    id: true,
                    name: true,
                    subject_id: true,
                    subject: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    })) as unknown as ProfileRow[];

    // Group profiles by the requested dimension
    const groups = new Map<string, { groupId: string; groupKey: string; profiles: ProfileRow[] }>();

    for (const profile of profiles) {
      const entries = this.getGroupEntries(query.group_by, profile);
      for (const entry of entries) {
        const existing = groups.get(entry.groupId);
        if (existing) {
          existing.profiles.push(profile);
        } else {
          groups.set(entry.groupId, {
            groupId: entry.groupId,
            groupKey: entry.groupKey,
            profiles: [profile],
          });
        }
      }
    }

    // Compute aggregates per group
    const isDomainPivot = query.group_by === 'domain';
    const data: CohortResponseRow[] = [];
    for (const group of groups.values()) {
      const n = group.profiles.length;
      if (n === 0) continue;

      const tierDist = { green: 0, yellow: 0, amber: 0, red: 0 };
      let sumComposite = 0;
      let sumAttendance = 0;
      let sumGrades = 0;
      let sumBehaviour = 0;
      let sumWellbeing = 0;
      let sumEngagement = 0;

      for (const p of group.profiles) {
        sumComposite += Number(p.composite_score);
        sumAttendance += Number(p.attendance_score);
        sumGrades += Number(p.grades_score);
        sumBehaviour += Number(p.behaviour_score);
        sumWellbeing += Number(p.wellbeing_score);
        sumEngagement += Number(p.engagement_score);
        const tier = p.risk_tier as keyof typeof tierDist;
        if (tier in tierDist) tierDist[tier]++;
      }

      // When pivoting by domain, use the domain-specific score as the composite
      // so each row's "avg score" reflects that domain, not the overall composite.
      const domainAvg = isDomainPivot
        ? this.getDomainAvg(
            group.groupId,
            { sumAttendance, sumGrades, sumBehaviour, sumWellbeing, sumEngagement },
            n,
          )
        : Math.round((sumComposite / n) * 100) / 100;

      data.push({
        group_id: group.groupId,
        group_name: group.groupKey,
        student_count: n,
        avg_composite: domainAvg,
        avg_attendance: Math.round((sumAttendance / n) * 100) / 100,
        avg_grades: Math.round((sumGrades / n) * 100) / 100,
        avg_behaviour: Math.round((sumBehaviour / n) * 100) / 100,
        avg_wellbeing: Math.round((sumWellbeing / n) * 100) / 100,
        avg_engagement: Math.round((sumEngagement / n) * 100) / 100,
      });
    }

    // Sort by avg_composite descending
    data.sort((a, b) => b.avg_composite - a.avg_composite);

    return { data };
  }

  // ─── Grouping helpers ─────────────────────────────────────────────────────

  private getGroupEntries(
    groupBy: 'year_group' | 'class' | 'subject' | 'domain',
    profile: ProfileRow,
  ): Array<{ groupId: string; groupKey: string }> {
    switch (groupBy) {
      case 'year_group': {
        const yg = profile.student.year_group;
        if (!yg) return [];
        return [{ groupId: yg.id, groupKey: yg.name }];
      }
      case 'class': {
        const enrolments = profile.student.class_enrolments ?? [];
        return enrolments.map((e) => ({
          groupId: e.class_entity.id,
          groupKey: e.class_entity.name,
        }));
      }
      case 'subject': {
        const enrolments = profile.student.class_enrolments ?? [];
        const seen = new Set<string>();
        const entries: Array<{ groupId: string; groupKey: string }> = [];
        for (const e of enrolments) {
          if (e.class_entity.subject && !seen.has(e.class_entity.subject.id)) {
            seen.add(e.class_entity.subject.id);
            entries.push({
              groupId: e.class_entity.subject.id,
              groupKey: e.class_entity.subject.name,
            });
          }
        }
        return entries;
      }
      case 'domain': {
        // Each profile contributes to every domain bucket — the aggregation
        // step uses the domain-specific score rather than the composite.
        return [
          { groupId: 'attendance', groupKey: 'Attendance' },
          { groupId: 'grades', groupKey: 'Grades' },
          { groupId: 'behaviour', groupKey: 'Behaviour' },
          { groupId: 'wellbeing', groupKey: 'Wellbeing' },
          { groupId: 'engagement', groupKey: 'Engagement' },
        ];
      }
    }
  }

  private getDomainAvg(
    domainId: string,
    sums: {
      sumAttendance: number;
      sumGrades: number;
      sumBehaviour: number;
      sumWellbeing: number;
      sumEngagement: number;
    },
    n: number,
  ): number {
    const map: Record<string, number> = {
      attendance: sums.sumAttendance,
      grades: sums.sumGrades,
      behaviour: sums.sumBehaviour,
      wellbeing: sums.sumWellbeing,
      engagement: sums.sumEngagement,
    };
    const sum = map[domainId] ?? 0;
    return Math.round((sum / n) * 100) / 100;
  }
}
