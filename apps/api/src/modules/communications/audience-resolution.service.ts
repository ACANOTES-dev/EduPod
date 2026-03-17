import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface AudienceTarget {
  user_id: string;
  locale: string;
  channels: string[];
}

@Injectable()
export class AudienceResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    tenantId: string,
    scope: string,
    targetPayload: Record<string, unknown>,
  ): Promise<AudienceTarget[]> {
    let parentIds: string[] = [];

    switch (scope) {
      case 'school':
        parentIds = await this.getAllParentIds(tenantId);
        break;
      case 'year_group': {
        const yearGroupIds = targetPayload.year_group_ids as string[];
        parentIds = await this.getParentIdsByYearGroups(tenantId, yearGroupIds);
        break;
      }
      case 'class': {
        const classIds = targetPayload.class_ids as string[];
        parentIds = await this.getParentIdsByClasses(tenantId, classIds);
        break;
      }
      case 'household': {
        const householdIds = targetPayload.household_ids as string[];
        parentIds = await this.getParentIdsByHouseholds(tenantId, householdIds);
        break;
      }
      case 'custom': {
        const userIds = targetPayload.user_ids as string[];
        return this.resolveCustomUsers(userIds);
      }
      default:
        return [];
    }

    return this.resolveParentsToTargets(tenantId, parentIds);
  }

  private async getAllParentIds(tenantId: string): Promise<string[]> {
    const parents = await this.prisma.parent.findMany({
      where: { tenant_id: tenantId, user_id: { not: null }, status: 'active' },
      select: { id: true },
    });
    return parents.map((p) => p.id);
  }

  private async getParentIdsByYearGroups(tenantId: string, yearGroupIds: string[]): Promise<string[]> {
    const students = await this.prisma.student.findMany({
      where: {
        tenant_id: tenantId,
        year_group_id: { in: yearGroupIds },
        status: 'active',
      },
      select: { id: true },
    });

    return this.getParentIdsFromStudents(tenantId, students.map((s) => s.id));
  }

  private async getParentIdsByClasses(tenantId: string, classIds: string[]): Promise<string[]> {
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: { in: classIds },
        status: 'active',
      },
      select: { student_id: true },
    });

    const studentIds = [...new Set(enrolments.map((e) => e.student_id))];
    return this.getParentIdsFromStudents(tenantId, studentIds);
  }

  private async getParentIdsByHouseholds(tenantId: string, householdIds: string[]): Promise<string[]> {
    const householdParents = await this.prisma.householdParent.findMany({
      where: {
        tenant_id: tenantId,
        household_id: { in: householdIds },
      },
      select: { parent_id: true },
    });

    return [...new Set(householdParents.map((hp) => hp.parent_id))];
  }

  private async getParentIdsFromStudents(tenantId: string, studentIds: string[]): Promise<string[]> {
    if (studentIds.length === 0) return [];

    const studentParents = await this.prisma.studentParent.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
      },
      select: { parent_id: true },
    });

    return [...new Set(studentParents.map((sp) => sp.parent_id))];
  }

  private async resolveParentsToTargets(tenantId: string, parentIds: string[]): Promise<AudienceTarget[]> {
    if (parentIds.length === 0) return [];

    const uniqueParentIds = [...new Set(parentIds)];

    const parents = await this.prisma.parent.findMany({
      where: {
        id: { in: uniqueParentIds },
        tenant_id: tenantId,
        user_id: { not: null },
        status: 'active',
      },
      select: {
        user_id: true,
        preferred_contact_channels: true,
      },
    });

    // Check tenant notification settings for announcement.published
    const notifSetting = await this.prisma.tenantNotificationSetting.findFirst({
      where: {
        tenant_id: tenantId,
        notification_type: 'announcement.published',
      },
    });

    const enabledChannels: string[] = notifSetting?.is_enabled
      ? ((notifSetting.channels as string[]) ?? ['email'])
      : [];

    const targets: AudienceTarget[] = [];
    const seenUserIds = new Set<string>();

    for (const parent of parents) {
      if (!parent.user_id || seenUserIds.has(parent.user_id)) continue;
      seenUserIds.add(parent.user_id);

      const parentChannels = (parent.preferred_contact_channels as string[]) ?? ['email'];

      // Intersect parent preferences with enabled channels
      const channels = parentChannels.filter((c) => enabledChannels.includes(c));

      // Always add in_app if user has an account
      if (!channels.includes('in_app')) {
        channels.push('in_app');
      }

      targets.push({
        user_id: parent.user_id,
        locale: 'en', // Default; would resolve from user.preferred_locale in production
        channels,
      });
    }

    return targets;
  }

  private async resolveCustomUsers(userIds: string[]): Promise<AudienceTarget[]> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, preferred_locale: true },
    });

    return users.map((u) => ({
      user_id: u.id,
      locale: u.preferred_locale ?? 'en',
      channels: ['in_app'],
    }));
  }
}
