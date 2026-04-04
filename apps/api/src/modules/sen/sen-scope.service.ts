import { Injectable } from '@nestjs/common';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

export interface SenScopeResult {
  scope: 'all' | 'class' | 'none';
  studentIds?: string[];
}

@Injectable()
export class SenScopeService {
  constructor(
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  /**
   * Resolve the user's SEN scope based on permissions.
   *
   * Scope is derived from the user's permissions:
   *   - sen.admin or sen.manage -> 'all' (SEN coordinator sees everything)
   *   - sen.view -> 'class' (class teacher sees their class students)
   *   - No SEN permission -> 'none'
   */
  async getUserScope(
    tenantId: string,
    userId: string,
    permissions: string[] = [],
  ): Promise<SenScopeResult> {
    // Admin or manager sees everything
    if (permissions.includes('sen.admin') || permissions.includes('sen.manage')) {
      return { scope: 'all' };
    }

    // Users with view permission see their class students
    if (permissions.includes('sen.view')) {
      const staffProfile = await this.staffProfileReadFacade.findByUserId(tenantId, userId);

      if (staffProfile) {
        const classIds = await this.classesReadFacade.findClassIdsByStaff(
          tenantId,
          staffProfile.id,
        );

        if (classIds.length > 0) {
          // Collect enrolled student IDs across all assigned classes
          const studentIdSets = await Promise.all(
            classIds.map((classId) =>
              this.classesReadFacade.findEnrolledStudentIds(tenantId, classId),
            ),
          );

          return {
            scope: 'class',
            studentIds: [...new Set(studentIdSets.flat())],
          };
        }
      }

      // Staff with view permission but no class assignments -> none
      return { scope: 'none' };
    }

    // No SEN permission -> nothing
    return { scope: 'none' };
  }
}
