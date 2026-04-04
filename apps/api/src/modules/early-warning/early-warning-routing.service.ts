import { Injectable, Logger } from '@nestjs/common';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RoutingResult {
  recipientUserIds: string[];
  routedRole: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class EarlyWarningRoutingService {
  private readonly logger = new Logger(EarlyWarningRoutingService.name);

  constructor(
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly rbacReadFacade: RbacReadFacade,
  ) {}

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
    const classIds = await this.classesReadFacade.findClassIdsForStudent(tenantId, studentId);
    if (classIds.length === 0) return [];

    // Find homeroom staff in the student's first class
    const firstClassId = classIds[0];
    if (!firstClassId) return [];

    const classStaff = await this.classesReadFacade.findStaffByClass(tenantId, firstClassId);
    const homeroomStaff = classStaff.filter((cs) => cs.assignment_role === 'homeroom');

    if (homeroomStaff.length === 0) return [];

    const staffProfileIds = homeroomStaff.map((cs) => cs.staff_profile_id);
    const staffProfiles = await this.staffProfileReadFacade.findByIds(tenantId, staffProfileIds);

    return staffProfiles.map((sp) => sp.user_id);
  }

  private async resolveYearHead(
    tenantId: string,
    studentId: string,
  ): Promise<string[]> {
    const student = await this.studentReadFacade.findById(tenantId, studentId);
    if (!student?.year_group_id) return [];

    // Step 1: Get all year_head user IDs in this tenant
    const allYearHeadUserIds = await this.resolveByRole(tenantId, 'year_head');
    if (allYearHeadUserIds.length === 0) return [];

    // Step 2: Find classes in the student's year group
    const yearGroupClasses = await this.classesReadFacade.findByYearGroup(
      tenantId,
      student.year_group_id,
    );
    const classIds = yearGroupClasses.map((c) => c.id);

    if (classIds.length === 0) return allYearHeadUserIds;

    // Step 3: Find which year heads have staff assignments in those classes
    const classStaffRows = await this.classesReadFacade.findStaffByClasses(tenantId, classIds);

    // Resolve staff profile user IDs
    const staffProfileIds = [...new Set(classStaffRows.map((cs) => cs.staff_profile_id))];
    const staffProfiles = await this.staffProfileReadFacade.findByIds(tenantId, staffProfileIds);
    const staffUserIds = new Set(staffProfiles.map((sp) => sp.user_id));

    const scopedUserIds = allYearHeadUserIds.filter((uid) => staffUserIds.has(uid));
    return scopedUserIds.length > 0 ? scopedUserIds : allYearHeadUserIds;
  }

  private async resolveByRole(
    tenantId: string,
    roleKey: string,
  ): Promise<string[]> {
    return this.rbacReadFacade.findActiveUserIdsByRoleKey(tenantId, roleKey);
  }
}
