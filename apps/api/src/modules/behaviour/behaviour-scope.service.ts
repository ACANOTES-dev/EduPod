import { Injectable } from '@nestjs/common';

import {
  type BehaviourScope,
  type IncidentScopeFilter,
  buildScopeFilter,
} from '@school/shared/behaviour';

import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

export interface ScopeResult {
  scope: BehaviourScope;
  classStudentIds?: string[];
  yearGroupIds?: string[];
}

@Injectable()
export class BehaviourScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly rbacReadFacade: RbacReadFacade,
  ) {}

  /**
   * Resolve the user's behaviour scope based on permissions.
   *
   * TenantMembership does not have a `behaviour_scope` column,
   * so scope is derived from the user's permissions:
   *   - school_owner / school_principal / school_vice_principal -> 'all'
   *     (leadership bypass — they hold no behaviour.* strings but have
   *     unrestricted access per PermissionGuard owner-bypass)
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

    // Leadership bypass — resolve the user's membership in this tenant and
    // ask PermissionCacheService whether they hold one of the owner-class
    // roles. This mirrors PermissionGuard.isOwner and is cached 5min.
    const membership = await this.rbacReadFacade.findMembershipSummary(tenantId, userId);
    if (membership && (await this.permissionCacheService.isOwner(membership.id))) {
      return { scope: 'all' };
    }

    // Users with view permission see their class students
    if (permissions.includes('behaviour.view')) {
      const staffProfile = await this.staffProfileReadFacade.findByUserId(tenantId, userId);

      if (staffProfile) {
        const classIds = await this.classesReadFacade.findClassIdsByStaff(
          tenantId,
          staffProfile.id,
        );

        if (classIds.length > 0) {
          const studentIdSets = await Promise.all(
            classIds.map((cid) => this.classesReadFacade.findEnrolledStudentIds(tenantId, cid)),
          );
          const allStudentIds = studentIdSets.flat();

          return {
            scope: 'class',
            classStudentIds: [...new Set(allStudentIds)],
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
