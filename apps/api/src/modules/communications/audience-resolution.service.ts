import { Injectable } from '@nestjs/common';

import { AuthReadFacade } from '../auth/auth-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { ConfigurationReadFacade } from '../configuration/configuration-read.facade';
import { HouseholdReadFacade } from '../households/household-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

export interface AudienceTarget {
  user_id: string;
  locale: string;
  channels: string[];
}

@Injectable()
export class AudienceResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parentReadFacade: ParentReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly householdReadFacade: HouseholdReadFacade,
    private readonly configurationReadFacade: ConfigurationReadFacade,
    private readonly authReadFacade: AuthReadFacade,
  ) {}

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
    return this.parentReadFacade.findAllActiveIds(tenantId);
  }

  private async getParentIdsByYearGroups(tenantId: string, yearGroupIds: string[]): Promise<string[]> {
    const students = await this.studentReadFacade.findManyGeneric(tenantId, {
      where: { year_group_id: { in: yearGroupIds }, status: 'active' },
      select: { id: true },
    }) as Array<{ id: string }>;

    return this.getParentIdsFromStudents(tenantId, students.map((s) => s.id));
  }

  private async getParentIdsByClasses(tenantId: string, classIds: string[]): Promise<string[]> {
    // Collect enrolled student IDs across all class IDs
    const studentIdArrays = await Promise.all(
      classIds.map((classId) => this.classesReadFacade.findEnrolledStudentIds(tenantId, classId)),
    );
    const studentIds = [...new Set(studentIdArrays.flat())];
    return this.getParentIdsFromStudents(tenantId, studentIds);
  }

  private async getParentIdsByHouseholds(tenantId: string, householdIds: string[]): Promise<string[]> {
    return this.householdReadFacade.findParentIdsByHouseholdIds(tenantId, householdIds);
  }

  private async getParentIdsFromStudents(tenantId: string, studentIds: string[]): Promise<string[]> {
    if (studentIds.length === 0) return [];

    return this.parentReadFacade.findParentIdsByStudentIds(tenantId, studentIds);
  }

  private async resolveParentsToTargets(tenantId: string, parentIds: string[]): Promise<AudienceTarget[]> {
    if (parentIds.length === 0) return [];

    const uniqueParentIds = [...new Set(parentIds)];

    const parents = await this.parentReadFacade.findActiveContactsByIds(tenantId, uniqueParentIds);

    // Check tenant notification settings for announcement.published
    const notifSetting = await this.configurationReadFacade.findNotificationSettingByType(
      tenantId,
      'announcement.published',
    );

    const enabledChannels: string[] = notifSetting?.is_enabled
      ? ((notifSetting.channels as string[]) ?? ['email'])
      : [];

    const targets: AudienceTarget[] = [];
    const seenUserIds = new Set<string>();

    for (const parent of parents) {
      if (seenUserIds.has(parent.user_id)) continue;
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
    // tenantId not used for platform-level user table, but pass empty for facade consistency
    const users = await this.authReadFacade.findUsersByIds('', userIds);

    return users.map((u) => ({
      user_id: u.id,
      locale: 'en', // UserSummaryRow doesn't include preferred_locale; default to 'en'
      channels: ['in_app'],
    }));
  }
}
