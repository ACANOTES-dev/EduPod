import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateRoleDto, UpdateRoleDto } from '@school/shared';
import type { RoleTier } from '@school/shared';

import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tier hierarchy: platform > admin > staff > parent
 * A role at tier X can only include permissions at tier X or below.
 */
const TIER_RANK: Record<RoleTier, number> = {
  platform: 4,
  admin: 3,
  staff: 2,
  parent: 1,
};

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  /**
   * List all roles for a tenant (including system roles where tenant_id IS NULL).
   * Includes permission count.
   */
  async listRoles(tenantId: string) {
    const roles = await this.prisma.role.findMany({
      where: {
        OR: [{ tenant_id: tenantId }, { tenant_id: null }],
      },
      include: {
        _count: {
          select: { role_permissions: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return { data: roles };
  }

  /**
   * Create a custom role for a tenant.
   * Validates tier enforcement on permission assignment.
   */
  async createRole(tenantId: string, data: CreateRoleDto) {
    // Validate tier enforcement for the requested permissions
    await this.validateTierEnforcement(data.role_tier, data.permission_ids);

    // Check for duplicate role_key within tenant
    const existing = await this.prisma.role.findFirst({
      where: {
        tenant_id: tenantId,
        role_key: data.role_key,
      },
    });

    if (existing) {
      throw new BadRequestException({
        code: 'ROLE_KEY_EXISTS',
        message: `Role key "${data.role_key}" already exists for this tenant`,
      });
    }

    const role = await this.prisma.role.create({
      data: {
        tenant_id: tenantId,
        role_key: data.role_key,
        display_name: data.display_name,
        is_system_role: false,
        role_tier: data.role_tier,
      },
    });

    // Assign permissions
    if (data.permission_ids.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: data.permission_ids.map((permId) => ({
          role_id: role.id,
          permission_id: permId,
          tenant_id: tenantId,
        })),
      });
    }

    // Invalidate permission cache for all memberships in this tenant
    await this.permissionCacheService.invalidateAllForTenant(tenantId);

    return this.getRole(tenantId, role.id);
  }

  /**
   * Get a role with its permissions.
   */
  async getRole(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        OR: [{ tenant_id: tenantId }, { tenant_id: null }],
      },
      include: {
        role_permissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: `Role with id "${roleId}" not found`,
      });
    }

    return role;
  }

  /**
   * Update a custom role. System roles cannot be modified.
   */
  async updateRole(tenantId: string, roleId: string, data: UpdateRoleDto) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        tenant_id: tenantId,
      },
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: `Role with id "${roleId}" not found`,
      });
    }

    if (role.is_system_role) {
      throw new BadRequestException({
        code: 'SYSTEM_ROLE_IMMUTABLE',
        message: 'System roles cannot be modified',
      });
    }

    // If permission_ids are provided, validate tier enforcement
    if (data.permission_ids) {
      await this.validateTierEnforcement(
        role.role_tier as RoleTier,
        data.permission_ids,
      );

      // Replace permissions
      await this.prisma.rolePermission.deleteMany({
        where: { role_id: roleId },
      });

      if (data.permission_ids.length > 0) {
        await this.prisma.rolePermission.createMany({
          data: data.permission_ids.map((permId) => ({
            role_id: roleId,
            permission_id: permId,
            tenant_id: tenantId,
          })),
        });
      }
    }

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(data.display_name !== undefined
          ? { display_name: data.display_name }
          : {}),
      },
    });

    // Invalidate permission cache for all memberships in this tenant
    await this.permissionCacheService.invalidateAllForTenant(tenantId);

    return this.getRole(tenantId, updated.id);
  }

  /**
   * Delete a custom role. System roles and in-use roles are blocked.
   */
  async deleteRole(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        tenant_id: tenantId,
      },
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: `Role with id "${roleId}" not found`,
      });
    }

    if (role.is_system_role) {
      throw new BadRequestException({
        code: 'SYSTEM_ROLE_IMMUTABLE',
        message: 'System roles cannot be deleted',
      });
    }

    // Check if any memberships have this role assigned
    const membershipCount = await this.prisma.membershipRole.count({
      where: { role_id: roleId },
    });

    if (membershipCount > 0) {
      throw new BadRequestException({
        code: 'ROLE_IN_USE',
        message: `Cannot delete role: it is assigned to ${membershipCount} membership(s)`,
      });
    }

    // Delete role_permissions first, then the role
    await this.prisma.rolePermission.deleteMany({
      where: { role_id: roleId },
    });

    await this.prisma.role.delete({
      where: { id: roleId },
    });

    return { deleted: true };
  }

  /**
   * Assign permissions to a role (replace all).
   * Validates tier enforcement.
   */
  async assignPermissions(
    tenantId: string,
    roleId: string,
    permissionIds: string[],
  ) {
    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        OR: [{ tenant_id: tenantId }, { tenant_id: null }],
      },
    });

    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: `Role with id "${roleId}" not found`,
      });
    }

    if (role.is_system_role) {
      throw new BadRequestException({
        code: 'SYSTEM_ROLE_IMMUTABLE',
        message: 'System role permissions cannot be modified directly',
      });
    }

    await this.validateTierEnforcement(
      role.role_tier as RoleTier,
      permissionIds,
    );

    // Replace all permissions
    await this.prisma.rolePermission.deleteMany({
      where: { role_id: roleId },
    });

    if (permissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: permissionIds.map((permId) => ({
          role_id: roleId,
          permission_id: permId,
          tenant_id: tenantId,
        })),
      });
    }

    // Invalidate permission cache for all memberships in this tenant
    await this.permissionCacheService.invalidateAllForTenant(tenantId);

    return this.getRole(tenantId, roleId);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Validate that all permissions are at or below the role's tier level.
   *
   * Tier hierarchy: platform > admin > staff > parent
   * A `staff` tier role can include `staff` and `parent` permissions,
   * but NOT `admin` or `platform` permissions.
   */
  private async validateTierEnforcement(
    roleTier: RoleTier,
    permissionIds: string[],
  ) {
    if (permissionIds.length === 0) {
      return;
    }

    const permissions = await this.prisma.permission.findMany({
      where: {
        id: { in: permissionIds },
      },
    });

    // Check that all IDs are valid
    if (permissions.length !== permissionIds.length) {
      const foundIds = new Set(permissions.map((p) => p.id));
      const missingIds = permissionIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException({
        code: 'PERMISSION_NOT_FOUND',
        message: `Permissions not found: ${missingIds.join(', ')}`,
      });
    }

    const roleRank = TIER_RANK[roleTier];

    const violations: string[] = [];
    for (const perm of permissions) {
      const permRank = TIER_RANK[perm.permission_tier as RoleTier];
      if (permRank > roleRank) {
        violations.push(
          `${perm.permission_key} (tier: ${perm.permission_tier})`,
        );
      }
    }

    if (violations.length > 0) {
      throw new BadRequestException({
        code: 'TIER_VIOLATION',
        message: `Role tier "${roleTier}" cannot include permissions of a higher tier: ${violations.join(', ')}`,
      });
    }
  }
}
