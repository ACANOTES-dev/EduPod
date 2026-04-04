/**
 * RbacReadFacade — Centralized read service for RBAC data: memberships, roles,
 * permissions, and membership-roles.
 *
 * PURPOSE:
 * Many modules (compliance, pastoral, behaviour, early-warning, communications,
 * safeguarding, approvals, engagement, reports) need to look up membership details,
 * check user permissions, and resolve role information. This facade provides a
 * single, well-typed entry point for all cross-module RBAC reads.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a single record is not found — callers decide whether to throw.
 * - Permission checks return the full role→permission chain for callers to evaluate.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Common select shapes ─────────────────────────────────────────────────────

/** Minimal membership fields for existence/status checks. */
const MEMBERSHIP_SUMMARY_SELECT = {
  id: true,
  tenant_id: true,
  user_id: true,
  membership_status: true,
} as const;

/** The include chain for full role→permission resolution. */
const MEMBERSHIP_ROLES_INCLUDE = {
  membership_roles: {
    include: {
      role: {
        include: {
          role_permissions: {
            include: { permission: true },
          },
        },
      },
    },
  },
} as const;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface PermissionRow {
  id: string;
  permission_key: string;
  description: string;
  permission_tier: string;
}

export interface RolePermissionRow {
  role_id: string;
  permission_id: string;
  tenant_id: string | null;
  permission: PermissionRow;
}

export interface RoleRow {
  id: string;
  tenant_id: string | null;
  role_key: string;
  display_name: string;
  is_system_role: boolean;
  role_tier: string;
  role_permissions: RolePermissionRow[];
}

export interface MembershipRoleRow {
  membership_id: string;
  role_id: string;
  tenant_id: string;
  role: RoleRow;
}

export interface MembershipWithPermissionsRow {
  id: string;
  tenant_id: string;
  user_id: string;
  membership_status: string;
  membership_roles: MembershipRoleRow[];
}

export interface MembershipSummaryRow {
  id: string;
  tenant_id: string;
  user_id: string;
  membership_status: string;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class RbacReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Memberships ────────────────────────────────────────────────────────────

  /**
   * Find a membership by ID with the full role→permission chain.
   * Used by safeguarding, early-warning, pastoral for permission resolution.
   */
  async findMembershipWithPermissions(
    tenantId: string,
    membershipId: string,
  ): Promise<MembershipWithPermissionsRow | null> {
    return this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenant_id: tenantId },
      include: MEMBERSHIP_ROLES_INCLUDE,
    }) as Promise<MembershipWithPermissionsRow | null>;
  }

  /**
   * Find a membership by user ID with the full role→permission chain.
   * Used when the caller has userId but not membershipId.
   */
  async findMembershipByUserWithPermissions(
    tenantId: string,
    userId: string,
  ): Promise<MembershipWithPermissionsRow | null> {
    return this.prisma.tenantMembership.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      include: MEMBERSHIP_ROLES_INCLUDE,
    }) as Promise<MembershipWithPermissionsRow | null>;
  }

  /**
   * Find a membership by membership ID and user ID with the full role→permission chain.
   * Used by safeguarding break-glass and early-warning where both IDs are known.
   */
  async findMembershipByIdAndUser(
    tenantId: string,
    membershipId: string,
    userId: string,
  ): Promise<MembershipWithPermissionsRow | null> {
    return this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, user_id: userId, tenant_id: tenantId },
      include: MEMBERSHIP_ROLES_INCLUDE,
    }) as Promise<MembershipWithPermissionsRow | null>;
  }

  /**
   * Find a membership summary (no role chain) by user ID.
   * Used for simple existence and status checks.
   */
  async findMembershipSummary(
    tenantId: string,
    userId: string,
  ): Promise<MembershipSummaryRow | null> {
    return this.prisma.tenantMembership.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: MEMBERSHIP_SUMMARY_SELECT,
    });
  }

  /**
   * Find all memberships for a user across all tenants (DSAR data export).
   * No tenant_id filter — returns all memberships for the user.
   */
  async findAllMembershipsForUser(userId: string): Promise<MembershipSummaryRow[]> {
    return this.prisma.tenantMembership.findMany({
      where: { user_id: userId },
      select: MEMBERSHIP_SUMMARY_SELECT,
    });
  }

  /**
   * Count active memberships that have a specific permission key.
   * Used by behaviour pulse to compute reporting confidence.
   */
  async countMembershipsWithPermission(tenantId: string, permissionKey: string): Promise<number> {
    return this.prisma.tenantMembership.count({
      where: {
        tenant_id: tenantId,
        membership_status: 'active',
        membership_roles: {
          some: {
            role: {
              role_permissions: {
                some: {
                  permission: { permission_key: permissionKey },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find active memberships that have a specific permission key, with user display names.
   * Used by behaviour staff analytics.
   */
  async findMembershipsWithPermissionAndUser(
    tenantId: string,
    permissionKey: string,
  ): Promise<Array<{ user_id: string; user: { first_name: string; last_name: string } }>> {
    return this.prisma.tenantMembership.findMany({
      where: {
        tenant_id: tenantId,
        membership_status: 'active',
        membership_roles: {
          some: {
            role: {
              role_permissions: {
                some: {
                  permission: { permission_key: permissionKey },
                },
              },
            },
          },
        },
      },
      select: {
        user_id: true,
        user: { select: { first_name: true, last_name: true } },
      },
    });
  }

  async countActiveMemberships(tenantId: string): Promise<number> {
    return this.prisma.tenantMembership.count({
      where: { tenant_id: tenantId, membership_status: 'active' },
    });
  }

  /**
   * Find the user_id of the oldest active membership for a tenant.
   * Used by recurring invoices to attribute system-generated invoices.
   */
  async findFirstActiveMembershipUserId(tenantId: string): Promise<string | null> {
    const row = await this.prisma.tenantMembership.findFirst({
      where: { tenant_id: tenantId, membership_status: 'active' },
      orderBy: { created_at: 'asc' },
      select: { user_id: true },
    });
    return row?.user_id ?? null;
  }

  // ─── Membership Roles ───────────────────────────────────────────────────────

  /**
   * Find membership roles by role key for a tenant.
   * Used by pastoral notification service and early-warning routing to find users with specific roles.
   */
  async findMembershipsByRoleKey(
    tenantId: string,
    roleKey: string,
  ): Promise<
    { membership_id: string; role_id: string; tenant_id: string; membership: { user_id: string } }[]
  > {
    return this.prisma.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: { role_key: roleKey },
      },
      select: {
        membership_id: true,
        role_id: true,
        tenant_id: true,
        membership: { select: { user_id: true } },
      },
    });
  }

  // ─── Roles ──────────────────────────────────────────────────────────────────

  /**
   * Find a role by ID for a tenant (includes system roles with null tenant_id).
   * Used by approval workflows to validate approver role existence.
   */
  async findRoleById(
    tenantId: string,
    roleId: string,
  ): Promise<{
    id: string;
    role_key: string;
    display_name: string;
    is_system_role: boolean;
    role_tier: string;
  } | null> {
    return this.prisma.role.findFirst({
      where: {
        id: roleId,
        OR: [{ tenant_id: tenantId }, { tenant_id: null }],
      },
      select: {
        id: true,
        role_key: true,
        display_name: true,
        is_system_role: true,
        role_tier: true,
      },
    });
  }

  /**
   * Find a role by key for a tenant (includes system roles with null tenant_id).
   * Used by approval workflows to resolve approver roles.
   */
  async findRoleByKey(
    tenantId: string,
    roleKey: string,
  ): Promise<{
    id: string;
    role_key: string;
    display_name: string;
    is_system_role: boolean;
    role_tier: string;
  } | null> {
    return this.prisma.role.findFirst({
      where: {
        role_key: roleKey,
        OR: [{ tenant_id: tenantId }, { tenant_id: null }],
      },
      select: {
        id: true,
        role_key: true,
        display_name: true,
        is_system_role: true,
        role_tier: true,
      },
    });
  }

  /**
   * Count all active memberships across all tenants (platform-level).
   * Used by platform admin dashboard.
   */
  async countAllActiveMemberships(): Promise<number> {
    return this.prisma.tenantMembership.count({
      where: { membership_status: 'active' },
    });
  }

  /**
   * Find a membership by user ID with full user details.
   * Used by impersonation to verify and retrieve user info at a specific tenant.
   */
  async findMembershipWithUser(
    tenantId: string,
    userId: string,
  ): Promise<{
    id: string;
    tenant_id: string;
    user_id: string;
    membership_status: string;
    user: { id: string; email: string; first_name: string; last_name: string };
  } | null> {
    return this.prisma.tenantMembership.findFirst({
      where: { tenant_id: tenantId, user_id: userId, membership_status: 'active' },
      select: {
        id: true,
        tenant_id: true,
        user_id: true,
        membership_status: true,
        user: { select: { id: true, email: true, first_name: true, last_name: true } },
      },
    });
  }

  /**
   * Find all membership user IDs for a tenant.
   * Used by tenant session invalidation.
   */
  async findMembershipUserIds(tenantId: string): Promise<Array<{ id: string; user_id: string }>> {
    return this.prisma.tenantMembership.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, user_id: true },
    });
  }

  /**
   * Find user IDs of active members with a specific role key.
   * Used by early-warning routing to resolve recipients by role.
   */
  async findActiveUserIdsByRoleKey(tenantId: string, roleKey: string): Promise<string[]> {
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

  /**
   * Find active memberships across ALL tenants that hold any of the given role keys.
   * Returns tenant_id, user_id, and user preferred_locale.
   * Used by GDPR platform-legal for sub-processor update notifications.
   */
  async findActiveMembershipsByRoleKeys(roleKeys: string[]): Promise<
    Array<{
      tenant_id: string;
      user_id: string;
      user: { preferred_locale: string | null };
    }>
  > {
    return this.prisma.tenantMembership.findMany({
      where: {
        membership_status: 'active',
        membership_roles: {
          some: {
            role: { role_key: { in: roleKeys } },
          },
        },
      },
      select: {
        tenant_id: true,
        user_id: true,
        user: { select: { preferred_locale: true } },
      },
    });
  }

  /**
   * Find active memberships for a specific tenant with user locale info.
   * Used by GDPR privacy notice notifications.
   */
  async findActiveMembershipsWithLocale(tenantId: string): Promise<
    Array<{
      user_id: string;
      user: { preferred_locale: string | null };
    }>
  > {
    return this.prisma.tenantMembership.findMany({
      where: {
        tenant_id: tenantId,
        membership_status: 'active',
      },
      select: {
        user_id: true,
        user: { select: { preferred_locale: true } },
      },
    });
  }

  /**
   * Find a system role by key (global role with tenant_id = null).
   * Used by platform-owner guard to check platform admin status.
   */
  async findSystemRoleByKey(roleKey: string): Promise<{ id: string; role_key: string } | null> {
    return this.prisma.role.findFirst({
      where: { role_key: roleKey, tenant_id: null },
      select: { id: true, role_key: true },
    });
  }
}
