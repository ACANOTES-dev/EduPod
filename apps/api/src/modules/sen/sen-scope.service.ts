import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface SenScopeResult {
  scope: 'all' | 'class' | 'none';
  studentIds?: string[];
}

@Injectable()
export class SenScopeService {
  constructor(private readonly prisma: PrismaService) {}

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
      const staffProfile = await this.prisma.staffProfile.findFirst({
        where: { user_id: userId, tenant_id: tenantId },
        select: { id: true },
      });

      if (staffProfile) {
        const classStaff = await this.prisma.classStaff.findMany({
          where: {
            staff_profile_id: staffProfile.id,
            tenant_id: tenantId,
          },
          select: { class_id: true },
        });

        if (classStaff.length > 0) {
          const classIds = classStaff.map((cs) => cs.class_id);
          const enrolments = await this.prisma.classEnrolment.findMany({
            where: {
              class_id: { in: classIds },
              tenant_id: tenantId,
              status: 'active',
            },
            select: { student_id: true },
          });

          return {
            scope: 'class',
            studentIds: [...new Set(enrolments.map((e) => e.student_id))],
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
