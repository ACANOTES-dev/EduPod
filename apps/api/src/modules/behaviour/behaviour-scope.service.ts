import { Injectable } from '@nestjs/common';

import { type BehaviourScope, type IncidentScopeFilter, buildScopeFilter } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

export interface ScopeResult {
  scope: BehaviourScope;
  classStudentIds?: string[];
  yearGroupIds?: string[];
}

@Injectable()
export class BehaviourScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the user's behaviour scope based on permissions.
   *
   * TenantMembership does not have a `behaviour_scope` column,
   * so scope is derived from the user's permissions:
   *   - behaviour.admin or behaviour.manage -> 'all'
   *   - behaviour.view -> 'class' (scoped to classes they teach)
   *   - behaviour.log only -> 'own'
   */
  async getUserScope(
    tenantId: string,
    userId: string,
    permissions: string[] = [],
  ): Promise<ScopeResult> {
    // Admin or manager sees everything
    if (permissions.includes('behaviour.admin') || permissions.includes('behaviour.manage')) {
      return { scope: 'all' };
    }

    // Users with view permission see their class students
    if (permissions.includes('behaviour.view')) {
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
            classStudentIds: [...new Set(enrolments.map((e) => e.student_id))],
          };
        }
      }

      // Staff with view permission but no class assignments -> own
      return { scope: 'own' };
    }

    // Default: own incidents only
    return { scope: 'own' };
  }

  /**
   * Build a Prisma WHERE filter based on the resolved scope context.
   */
  buildScopeFilter(ctx: {
    userId: string;
    scope: BehaviourScope;
    classStudentIds?: string[];
    yearGroupIds?: string[];
  }): IncidentScopeFilter | Record<string, never> {
    return buildScopeFilter(ctx);
  }
}
