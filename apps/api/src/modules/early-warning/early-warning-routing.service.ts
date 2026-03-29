import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RoutingResult {
  recipientUserIds: string[];
  routedRole: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class EarlyWarningRoutingService {
  private readonly logger = new Logger(EarlyWarningRoutingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveRecipients(
    tenantId: string,
    studentId: string,
    tier: 'yellow' | 'amber' | 'red',
    routingRulesJson: Record<string, unknown>,
  ): Promise<RoutingResult> {
    const tierRule = routingRulesJson[tier] as Record<string, unknown> | undefined;

    let roleKeys: string[] = [];

    if (tierRule) {
      if (typeof tierRule.role === 'string') {
        roleKeys = [tierRule.role];
      } else if (Array.isArray(tierRule.roles)) {
        roleKeys = tierRule.roles.filter((r): r is string => typeof r === 'string');
      }
    }

    // Fallback defaults
    if (roleKeys.length === 0) {
      switch (tier) {
        case 'yellow':
          roleKeys = ['homeroom_teacher'];
          break;
        case 'amber':
          roleKeys = ['year_head'];
          break;
        case 'red':
          roleKeys = ['principal', 'pastoral_lead'];
          break;
      }
    }

    const userIds: string[] = [];

    for (const roleKey of roleKeys) {
      if (roleKey === 'homeroom_teacher') {
        const ids = await this.resolveHomeroomTeacher(tenantId, studentId);
        userIds.push(...ids);
      } else if (roleKey === 'year_head') {
        const ids = await this.resolveYearHead(tenantId, studentId);
        userIds.push(...ids);
      } else {
        const ids = await this.resolveByRole(tenantId, roleKey);
        userIds.push(...ids);
      }
    }

    return {
      recipientUserIds: [...new Set(userIds)],
      routedRole: roleKeys.join(', '),
    };
  }

  // ─── Resolution strategies ────────────────────────────────────────────────

  private async resolveHomeroomTeacher(
    tenantId: string,
    studentId: string,
  ): Promise<string[]> {
    const enrolment = await this.prisma.classEnrolment.findFirst({
      where: { tenant_id: tenantId, student_id: studentId, status: 'active' },
      select: { class_id: true },
    });

    if (!enrolment) return [];

    const classStaff = await this.prisma.classStaff.findMany({
      where: {
        tenant_id: tenantId,
        class_id: enrolment.class_id,
        assignment_role: 'homeroom',
      },
      select: { staff_profile_id: true },
    });

    if (classStaff.length === 0) return [];

    const staffProfileIds = classStaff.map((cs) => cs.staff_profile_id);
    const staffProfiles = await this.prisma.staffProfile.findMany({
      where: { id: { in: staffProfileIds }, tenant_id: tenantId },
      select: { user_id: true },
    });

    return staffProfiles.map((sp) => sp.user_id);
  }

  private async resolveYearHead(
    tenantId: string,
    studentId: string,
  ): Promise<string[]> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { year_group_id: true },
    });

    if (!student?.year_group_id) return [];

    const memberships = await this.prisma.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: { role_key: 'year_head' },
        membership: { membership_status: 'active' },
      },
      select: { membership: { select: { user_id: true } } },
    });

    return memberships.map((mr) => mr.membership.user_id);
  }

  private async resolveByRole(
    tenantId: string,
    roleKey: string,
  ): Promise<string[]> {
    const memberships = await this.prisma.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: { role_key: roleKey },
        membership: { membership_status: 'active' },
      },
      select: { membership: { select: { user_id: true } } },
    });

    return memberships.map((mr) => mr.membership.user_id);
  }
}
