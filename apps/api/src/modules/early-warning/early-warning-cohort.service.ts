import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { CohortCell, CohortQuery } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

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
      class_entity: { id: string; name: string; subject_id: string | null; subject?: { id: string; name: string } | null };
    }>;
  };
}

@Injectable()
export class EarlyWarningCohortService {
  private readonly logger = new Logger(EarlyWarningCohortService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Role-scoping (mirrors EarlyWarningService logic) ─────────────────────

  private async resolveRoleScope(
    tenantId: string,
    userId: string,
    membershipId: string | null,
  ): Promise<RoleScopeFilter> {
    if (!membershipId) {
      return { unrestricted: false, studentIds: [] };
    }

    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenant_id: tenantId, user_id: userId },
      include: {
        membership_roles: {
          include: {
            role: {
              include: {
                role_permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!membership) {
      return { unrestricted: false, studentIds: [] };
    }

    const permissions = membership.membership_roles.flatMap(
      (mr) => mr.role.role_permissions.map((rp) => rp.permission.permission_key),
    );

    if (permissions.includes('early_warning.manage')) {
      return { unrestricted: true };
    }

    // Staff: find students in classes via staff profile
    const staffProfile = await this.prisma.staffProfile.findFirst({
      where: { tenant_id: tenantId, user_id: userId },
      select: { id: true },
    });

    if (staffProfile) {
      const classStaffRows = await this.prisma.classStaff.findMany({
        where: { tenant_id: tenantId, staff_profile_id: staffProfile.id },
        select: { class_id: true },
      });

      if (classStaffRows.length > 0) {
        const classIds = classStaffRows.map((cs) => cs.class_id);
        const enrolments = await this.prisma.classEnrolment.findMany({
          where: {
            tenant_id: tenantId,
            class_id: { in: classIds },
            status: 'active',
          },
          select: { student_id: true },
        });
        const uniqueStudentIds = [
          ...new Set(enrolments.map((e) => e.student_id)),
        ];
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
  ): Promise<{ data: CohortCell[] }> {
    const [scope, academicYear] = await Promise.all([
      this.resolveRoleScope(tenantId, userId, membershipId),
      this.prisma.academicYear.findFirst({
        where: { tenant_id: tenantId, status: 'active' },
        select: { id: true },
      }),
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

    const profiles = await this.prisma.studentRiskProfile.findMany({
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
    }) as unknown as ProfileRow[];

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
    const data: CohortCell[] = [];
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

      data.push({
        groupKey: group.groupKey,
        groupId: group.groupId,
        studentCount: n,
        avgCompositeScore: Math.round((sumComposite / n) * 100) / 100,
        avgAttendanceScore: Math.round((sumAttendance / n) * 100) / 100,
        avgGradesScore: Math.round((sumGrades / n) * 100) / 100,
        avgBehaviourScore: Math.round((sumBehaviour / n) * 100) / 100,
        avgWellbeingScore: Math.round((sumWellbeing / n) * 100) / 100,
        avgEngagementScore: Math.round((sumEngagement / n) * 100) / 100,
        tierDistribution: tierDist,
      });
    }

    // Sort by avgCompositeScore descending
    data.sort((a, b) => b.avgCompositeScore - a.avgCompositeScore);

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
            entries.push({ groupId: e.class_entity.subject.id, groupKey: e.class_entity.subject.name });
          }
        }
        return entries;
      }
      case 'domain': {
        // When grouping by domain, each profile produces 5 entries (one per domain)
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
}
