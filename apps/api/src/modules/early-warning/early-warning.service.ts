import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  AssignStudentDto,
  EarlyWarningSummary,
  EarlyWarningSummaryQuery,
  ListEarlyWarningsQuery,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Role-scoping helper types ──────────────────────────────────────────────

interface RoleScopeFilter {
  studentIds?: string[];
  unrestricted: boolean;
}

@Injectable()
export class EarlyWarningService {
  private readonly logger = new Logger(EarlyWarningService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Role-scoping ────────────────────────────────────────────────────────

  /**
   * Resolves which students the user can see based on their role.
   * - Principal/admin (has early_warning.manage): unrestricted
   * - Year head: students in their year group(s)
   * - Teacher: students in their classes (via class_enrolments)
   *
   * Uses membership_id to look up role assignments.
   */
  private async resolveRoleScope(
    tenantId: string,
    userId: string,
    membershipId: string | null,
  ): Promise<RoleScopeFilter> {
    if (!membershipId) {
      return { unrestricted: false, studentIds: [] };
    }

    // Check if user has manage permission (admin/principal → unrestricted)
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

    const permissions = membership.membership_roles.flatMap((mr) =>
      mr.role.role_permissions.map((rp) => rp.permission.permission_key),
    );

    // Admin / principal with early_warning.manage sees everything
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
        const uniqueStudentIds = [...new Set(enrolments.map((e) => e.student_id))];
        return { unrestricted: false, studentIds: uniqueStudentIds };
      }
    }

    // Fallback: no access
    return { unrestricted: false, studentIds: [] };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getActiveAcademicYearId(tenantId: string): Promise<string> {
    const year = await this.prisma.academicYear.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
      select: { id: true },
    });
    if (!year) {
      throw new NotFoundException({
        code: 'NO_ACTIVE_ACADEMIC_YEAR',
        message: 'No active academic year found for this tenant',
      });
    }
    return year.id;
  }

  private buildStudentScopeWhere(
    tenantId: string,
    academicYearId: string,
    scope: RoleScopeFilter,
  ): Prisma.StudentRiskProfileWhereInput {
    const where: Prisma.StudentRiskProfileWhereInput = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };
    if (!scope.unrestricted) {
      where.student_id = { in: scope.studentIds ?? [] };
    }
    return where;
  }

  // ─── GET /v1/early-warnings — Paginated list ─────────────────────────────

  async listProfiles(
    tenantId: string,
    userId: string,
    membershipId: string | null,
    query: ListEarlyWarningsQuery,
  ) {
    const [scope, academicYearId] = await Promise.all([
      this.resolveRoleScope(tenantId, userId, membershipId),
      this.getActiveAcademicYearId(tenantId),
    ]);

    const where = this.buildStudentScopeWhere(tenantId, academicYearId, scope);

    // Apply optional filters
    if (query.tier) {
      where.risk_tier = query.tier;
    }
    if (query.year_group_id || query.class_id) {
      where.student = {
        ...(query.year_group_id && { year_group_id: query.year_group_id }),
        ...(query.class_id && {
          class_enrolments: {
            some: { class_id: query.class_id, status: 'active' },
          },
        }),
      };
    }
    if (query.search) {
      where.student = {
        ...(where.student as Prisma.StudentWhereInput),
        OR: [
          { first_name: { contains: query.search, mode: 'insensitive' } },
          { last_name: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    // Sort
    const orderBy: Prisma.StudentRiskProfileOrderByWithRelationInput =
      query.sort === 'student_name'
        ? { student: { last_name: query.order } }
        : query.sort === 'tier_entered_at'
          ? { tier_entered_at: query.order }
          : { composite_score: query.order };

    const [total, profiles] = await Promise.all([
      this.prisma.studentRiskProfile.count({ where }),
      this.prisma.studentRiskProfile.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              year_group: { select: { name: true } },
              class_enrolments: {
                where: { status: 'active' },
                take: 1,
                select: { class_entity: { select: { name: true } } },
              },
            },
          },
          assigned_to: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
    ]);

    const data = profiles.map((p) => {
      const summaryJson = p.signal_summary_json as {
        summaryText?: string;
        topSignals?: Array<{ summaryFragment?: string }>;
      } | null;
      const topSignal = summaryJson?.topSignals?.[0]?.summaryFragment ?? null;

      const trendJson = p.trend_json as { dailyScores?: number[] } | null;
      const trendData = trendJson?.dailyScores ?? [];

      const student = p.student as {
        first_name: string;
        last_name: string;
        year_group?: { name: string } | null;
        class_enrolments?: Array<{ class_entity: { name: string } }>;
      } | null;

      return {
        id: p.id,
        student_id: p.student_id,
        student_name: student ? `${student.first_name} ${student.last_name}` : 'Unknown',
        year_group_name: student?.year_group?.name ?? null,
        class_name: student?.class_enrolments?.[0]?.class_entity?.name ?? null,
        composite_score: Number(p.composite_score),
        risk_tier: p.risk_tier,
        top_signal: topSignal,
        trend_data: trendData,
        assigned_to_name: p.assigned_to
          ? `${p.assigned_to.first_name} ${p.assigned_to.last_name}`
          : null,
        last_computed_at: p.last_computed_at.toISOString(),
      };
    });

    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── GET /v1/early-warnings/summary — Tier distribution ───────────────────

  async getTierSummary(
    tenantId: string,
    userId: string,
    membershipId: string | null,
    query: EarlyWarningSummaryQuery,
  ): Promise<EarlyWarningSummary> {
    const [scope, academicYearId] = await Promise.all([
      this.resolveRoleScope(tenantId, userId, membershipId),
      this.getActiveAcademicYearId(tenantId),
    ]);

    const where = this.buildStudentScopeWhere(tenantId, academicYearId, scope);

    if (query.year_group_id || query.class_id) {
      where.student = {
        ...(query.year_group_id && { year_group_id: query.year_group_id }),
        ...(query.class_id && {
          class_enrolments: {
            some: { class_id: query.class_id, status: 'active' },
          },
        }),
      };
    }

    const counts = await this.prisma.studentRiskProfile.groupBy({
      by: ['risk_tier'],
      where,
      _count: { id: true },
    });

    const summary: EarlyWarningSummary = {
      green: 0,
      yellow: 0,
      amber: 0,
      red: 0,
      total: 0,
    };
    for (const row of counts) {
      const tier = row.risk_tier as keyof Omit<EarlyWarningSummary, 'total'>;
      if (tier in summary) {
        summary[tier] = row._count.id;
        summary.total += row._count.id;
      }
    }

    return summary;
  }

  // ─── GET /v1/early-warnings/:studentId — Student detail ───────────────────

  async getStudentDetail(
    tenantId: string,
    userId: string,
    membershipId: string | null,
    studentId: string,
  ) {
    const [scope, academicYearId] = await Promise.all([
      this.resolveRoleScope(tenantId, userId, membershipId),
      this.getActiveAcademicYearId(tenantId),
    ]);

    // Verify the user can see this student
    if (!scope.unrestricted && !(scope.studentIds ?? []).includes(studentId)) {
      throw new ForbiddenException({
        code: 'EARLY_WARNING_ACCESS_DENIED',
        message: "You do not have permission to view this student's risk profile",
      });
    }

    const profile = await this.prisma.studentRiskProfile.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        academic_year_id: academicYearId,
      },
      include: {
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
        assigned_to: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'RISK_PROFILE_NOT_FOUND',
        message: `No risk profile found for student "${studentId}"`,
      });
    }

    // Fetch signals (latest 50)
    const signals = await this.prisma.studentRiskSignal.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        academic_year_id: academicYearId,
      },
      orderBy: { detected_at: 'desc' },
      take: 50,
    });

    // Fetch tier transitions (latest 20)
    const transitions = await this.prisma.earlyWarningTierTransition.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        profile_id: profile.id,
      },
      orderBy: { transitioned_at: 'desc' },
      take: 20,
    });

    const signalItems = signals.map((s) => {
      const details = (s.details_json as { summaryFragment?: string } | null) ?? {};
      return {
        id: s.id,
        domain: s.domain,
        signal_type: s.signal_type,
        severity: s.severity,
        score_contribution: Number(s.score_contribution),
        summary_fragment: details.summaryFragment ?? s.signal_type,
        detected_at: s.detected_at.toISOString(),
      };
    });

    const transitionItems = transitions.map((t) => ({
      id: t.id,
      from_tier: t.from_tier,
      to_tier: t.to_tier,
      composite_score: Number(t.composite_score),
      transitioned_at: t.transitioned_at.toISOString(),
    }));

    const summaryJson = profile.signal_summary_json as {
      summaryText?: string;
    } | null;
    const trendJson = profile.trend_json as { dailyScores?: number[] } | null;

    return {
      id: profile.id,
      student_id: profile.student_id,
      student_name: profile.student
        ? `${profile.student.first_name} ${profile.student.last_name}`
        : 'Unknown',
      composite_score: Number(profile.composite_score),
      risk_tier: profile.risk_tier,
      tier_entered_at: profile.tier_entered_at?.toISOString() ?? new Date().toISOString(),
      attendance_score: Number(profile.attendance_score),
      grades_score: Number(profile.grades_score),
      behaviour_score: Number(profile.behaviour_score),
      wellbeing_score: Number(profile.wellbeing_score),
      engagement_score: Number(profile.engagement_score),
      summary_text: summaryJson?.summaryText ?? '',
      trend_data: trendJson?.dailyScores ?? [],
      assigned_to_user_id: profile.assigned_to_user_id,
      assigned_to_name: profile.assigned_to
        ? `${profile.assigned_to.first_name} ${profile.assigned_to.last_name}`
        : null,
      signals: signalItems,
      transitions: transitionItems,
    };
  }

  // ─── POST /v1/early-warnings/:studentId/acknowledge ───────────────────────

  async acknowledgeProfile(tenantId: string, userId: string, studentId: string): Promise<void> {
    const academicYearId = await this.getActiveAcademicYearId(tenantId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      const profile = await tx.studentRiskProfile.findFirst({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          academic_year_id: academicYearId,
        },
      });

      if (!profile) {
        throw new NotFoundException({
          code: 'RISK_PROFILE_NOT_FOUND',
          message: `No risk profile found for student "${studentId}"`,
        });
      }

      await tx.studentRiskProfile.update({
        where: { id: profile.id },
        data: {
          acknowledged_by_user_id: userId,
          acknowledged_at: new Date(),
        },
      });
    });
  }

  // ─── POST /v1/early-warnings/:studentId/assign ───────────────────────────

  async assignStaff(
    tenantId: string,
    userId: string,
    studentId: string,
    dto: AssignStudentDto,
  ): Promise<{
    id: string;
    assigned_to_user_id: string;
    assigned_at: string;
  }> {
    const academicYearId = await this.getActiveAcademicYearId(tenantId);

    // Verify the target user has an active membership in this tenant
    const targetMembership = await this.prisma.tenantMembership.findFirst({
      where: {
        user_id: dto.assigned_to_user_id,
        tenant_id: tenantId,
        membership_status: 'active',
      },
      select: { id: true },
    });
    if (!targetMembership) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User "${dto.assigned_to_user_id}" not found in this tenant`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    const result = await rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      const profile = await tx.studentRiskProfile.findFirst({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          academic_year_id: academicYearId,
        },
      });

      if (!profile) {
        throw new NotFoundException({
          code: 'RISK_PROFILE_NOT_FOUND',
          message: `No risk profile found for student "${studentId}"`,
        });
      }

      const now = new Date();
      const updated = await tx.studentRiskProfile.update({
        where: { id: profile.id },
        data: {
          assigned_to_user_id: dto.assigned_to_user_id,
          assigned_at: now,
        },
      });

      return {
        id: updated.id,
        assigned_to_user_id: dto.assigned_to_user_id,
        assigned_at: now.toISOString(),
      };
    });

    return result as { id: string; assigned_to_user_id: string; assigned_at: string };
  }
}
