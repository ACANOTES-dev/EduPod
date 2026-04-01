import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { UserListQuery } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  /**
   * List users in a tenant with their memberships and roles, paginated.
   * Supports search by name/email, filter by role, and filter by status.
   */
  async listUsers(tenantId: string, query: UserListQuery) {
    const { page, pageSize, search, role_id, status } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.TenantMembershipWhereInput = {
      tenant_id: tenantId,
    };

    // Status filter
    if (status) {
      where.membership_status = status;
    }

    // Name/email search
    if (search && search.trim()) {
      const term = search.trim();
      where.user = {
        OR: [
          { first_name: { contains: term, mode: 'insensitive' } },
          { last_name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      };
    }

    // Role filter
    if (role_id) {
      where.membership_roles = {
        some: { role_id },
      };
    }

    const [memberships, total] = await Promise.all([
      this.prisma.tenantMembership.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true,
              phone: true,
              global_status: true,
              last_login_at: true,
            },
          },
          membership_roles: {
            include: {
              role: {
                select: {
                  id: true,
                  role_key: true,
                  display_name: true,
                  role_tier: true,
                  is_system_role: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.tenantMembership.count({ where }),
    ]);

    return {
      data: memberships,
      meta: { page, pageSize, total },
    };
  }

  /**
   * Get a user's membership details in a tenant context.
   */
  async getUser(tenantId: string, userId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            phone: true,
            global_status: true,
            last_login_at: true,
            created_at: true,
          },
        },
        membership_roles: {
          include: {
            role: {
              select: {
                id: true,
                role_key: true,
                display_name: true,
                role_tier: true,
                is_system_role: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: `User with id "${userId}" not found in this tenant`,
      });
    }

    return membership;
  }

  /**
   * Replace the roles assigned to a user's membership.
   * Invalidates permission cache.
   */
  async updateMembershipRoles(tenantId: string, userId: string, roleIds: string[]) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: `User with id "${userId}" not found in this tenant`,
      });
    }

    // Verify all roles exist and belong to this tenant (or are system roles)
    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: roleIds },
        OR: [{ tenant_id: tenantId }, { tenant_id: null }],
      },
    });

    if (roles.length !== roleIds.length) {
      const foundIds = new Set(roles.map((r) => r.id));
      const missingIds = roleIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException({
        code: 'ROLE_NOT_FOUND',
        message: `Roles not found: ${missingIds.join(', ')}`,
      });
    }

    // Delete existing and create new membership roles atomically with RLS context
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rlsClient.$transaction(async (tx) => {
      await tx.membershipRole.deleteMany({
        where: { membership_id: membership.id },
      });

      await tx.membershipRole.createMany({
        data: roleIds.map((roleId) => ({
          membership_id: membership.id,
          role_id: roleId,
          tenant_id: tenantId,
        })),
      });
    });

    // Invalidate permission cache
    await this.permissionCacheService.invalidate(membership.id);

    return this.getUser(tenantId, userId);
  }

  /**
   * Suspend a user's membership in a tenant.
   * Guards against suspending the last school_owner.
   * Clears Redis sessions and permission cache.
   */
  async suspendMembership(tenantId: string, userId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
      },
      include: {
        membership_roles: {
          include: { role: true },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: `User with id "${userId}" not found in this tenant`,
      });
    }

    if (membership.membership_status === 'suspended') {
      throw new BadRequestException({
        code: 'ALREADY_SUSPENDED',
        message: 'Membership is already suspended',
      });
    }

    // School Owner accounts can never be suspended
    const hasSchoolOwnerRole = membership.membership_roles.some(
      (mr) => mr.role.role_key === 'school_owner',
    );
    if (hasSchoolOwnerRole) {
      throw new BadRequestException({
        code: 'SCHOOL_OWNER_PROTECTED',
        message: 'The School Owner account cannot be suspended.',
      });
    }

    // Last school principal guard — at least one must remain active
    const hasPrincipalRole = membership.membership_roles.some(
      (mr) => mr.role.role_key === 'school_principal',
    );

    if (hasPrincipalRole) {
      const principalCount = await this.prisma.membershipRole.count({
        where: {
          tenant_id: tenantId,
          role: { role_key: 'school_principal' },
          membership: { membership_status: 'active' },
        },
      });

      if (principalCount <= 1) {
        throw new BadRequestException({
          code: 'LAST_SCHOOL_PRINCIPAL',
          message:
            'Cannot suspend the last school principal. Assign the school_principal role to another user first.',
        });
      }
    }

    await this.prisma.tenantMembership.update({
      where: { id: membership.id },
      data: { membership_status: 'suspended' },
    });

    // Delete all Redis sessions for this user
    await this.clearUserSessions(userId);

    // Invalidate permission cache
    await this.permissionCacheService.invalidate(membership.id);

    return this.getUser(tenantId, userId);
  }

  /**
   * Reactivate a suspended membership.
   */
  async reactivateMembership(tenantId: string, userId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
      },
    });

    if (!membership) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: `User with id "${userId}" not found in this tenant`,
      });
    }

    if (membership.membership_status !== 'suspended') {
      throw new BadRequestException({
        code: 'NOT_SUSPENDED',
        message: 'Only suspended memberships can be reactivated',
      });
    }

    await this.prisma.tenantMembership.update({
      where: { id: membership.id },
      data: { membership_status: 'active' },
    });

    return this.getUser(tenantId, userId);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Clear all Redis sessions for a user.
   */
  private async clearUserSessions(userId: string) {
    const client = this.redis.getClient();
    const sessionIds = await client.smembers(`user_sessions:${userId}`);
    if (sessionIds.length > 0) {
      const keys = sessionIds.map((sid) => `session:${sid}`);
      await client.del(...keys);
    }
    await client.del(`user_sessions:${userId}`);
  }
}
