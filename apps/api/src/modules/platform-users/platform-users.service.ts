import { createHash, randomBytes, randomUUID } from 'crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlatformRoleKey } from '@prisma/client';
import { hash } from 'bcryptjs';

import type { InvitePlatformUserDto, UpdatePlatformUserRolesDto } from '@school/shared';

import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

type PlatformPermissionKey = string;

type PlatformRoleLookupRow = {
  id: string;
  role_key: PlatformRoleKey;
};

type PlatformRoleRow = PlatformRoleLookupRow & {
  created_at: Date;
  description: string | null;
  display_name: string;
  updated_at: Date;
};

type PlatformPermissionRow = {
  category: string;
  created_at: Date;
  description: string;
  display_name: string;
  id: string;
  is_destructive: boolean;
  permission_key: string;
  requires_two_person: boolean;
};

export type PlatformUserListRow = {
  activated_at: Date | null;
  id: string;
  invited_at: Date;
  invited_by_user_id: string | null;
  notes: string | null;
  revoked_at: Date | null;
  roles: Array<{
    granted_at: Date;
    granted_by_user_id: string | null;
    platform_user_id: string;
    role: PlatformRoleRow;
    role_id: string;
  }>;
  user: {
    email: string;
    first_name: string;
    global_status: string;
    id: string;
    last_login_at: Date | null;
    last_name: string;
  };
  user_id: string;
};

export type PlatformPermissionMatrix = {
  permissions: PlatformPermissionRow[];
  roles: Array<
    PlatformRoleRow & {
      permissions: Array<{
        permission: PlatformPermissionRow;
        permission_id: string;
        role_id: string;
      }>;
    }
  >;
};

@Injectable()
export class PlatformUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async isMember(userId: string): Promise<boolean> {
    const row = await this.prisma.platformUser.findFirst({
      where: {
        user_id: userId,
        revoked_at: null,
        roles: { some: {} },
        user: { global_status: 'active' },
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async hasPermission(userId: string, permission: PlatformPermissionKey): Promise<boolean> {
    const row = await this.prisma.platformUser.findFirst({
      where: {
        user_id: userId,
        revoked_at: null,
        user: { global_status: 'active' },
        roles: {
          some: {
            role: {
              permissions: {
                some: {
                  permission: { permission_key: permission },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async listUsers(): Promise<PlatformUserListRow[]> {
    return this.prisma.platformUser.findMany({
      select: {
        activated_at: true,
        id: true,
        invited_at: true,
        invited_by_user_id: true,
        notes: true,
        revoked_at: true,
        roles: {
          orderBy: { granted_at: 'asc' },
          select: {
            granted_at: true,
            granted_by_user_id: true,
            platform_user_id: true,
            role_id: true,
            role: {
              select: {
                created_at: true,
                description: true,
                display_name: true,
                id: true,
                role_key: true,
                updated_at: true,
              },
            },
          },
        },
        user: {
          select: {
            email: true,
            first_name: true,
            global_status: true,
            id: true,
            last_login_at: true,
            last_name: true,
          },
        },
        user_id: true,
      },
      orderBy: { invited_at: 'desc' },
    });
  }

  async getUser(id: string): Promise<PlatformUserListRow> {
    const row = await this.prisma.platformUser.findUnique({
      where: { id },
      select: {
        activated_at: true,
        id: true,
        invited_at: true,
        invited_by_user_id: true,
        notes: true,
        revoked_at: true,
        roles: {
          orderBy: { granted_at: 'asc' },
          select: {
            granted_at: true,
            granted_by_user_id: true,
            platform_user_id: true,
            role_id: true,
            role: {
              select: {
                created_at: true,
                description: true,
                display_name: true,
                id: true,
                role_key: true,
                updated_at: true,
              },
            },
          },
        },
        user: {
          select: {
            email: true,
            first_name: true,
            global_status: true,
            id: true,
            last_login_at: true,
            last_name: true,
          },
        },
        user_id: true,
      },
    });

    if (!row) {
      throw new NotFoundException({
        code: 'PLATFORM_USER_NOT_FOUND',
        message: `Platform user "${id}" not found`,
      });
    }

    return row;
  }

  async invite(dto: InvitePlatformUserDto, actorUserId: string, audit?: PlatformAuditContext) {
    const roles = await this.getRolesOrThrow(dto.role_keys);
    // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform RBAC invitations must attach to or create the platform-level users row atomically with the platform_users row; no auth write facade exists for this admin workflow.
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const rawSetupToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawSetupToken).digest('hex');
    const generatedPasswordHash = await hash(randomUUID(), 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const user =
        existingUser ??
        // eslint-disable-next-line school/no-cross-module-prisma-access -- Same atomic platform invitation transaction as above; the created account receives no tenant membership.
        (await tx.user.create({
          data: {
            email: dto.email,
            password_hash: generatedPasswordHash,
            first_name: dto.first_name,
            last_name: dto.last_name,
            global_status: 'active',
            email_verified_at: new Date(),
          },
        }));

      const platformUser = await tx.platformUser.upsert({
        where: { user_id: user.id },
        update: {
          invited_by_user_id: actorUserId,
          notes: dto.notes ?? null,
          revoked_at: null,
        },
        create: {
          user_id: user.id,
          invited_by_user_id: actorUserId,
          activated_at: existingUser ? new Date() : null,
          notes: dto.notes ?? null,
        },
      });

      for (const role of roles) {
        await tx.platformUserRole.upsert({
          where: {
            platform_user_id_role_id: {
              platform_user_id: platformUser.id,
              role_id: role.id,
            },
          },
          update: {},
          create: {
            platform_user_id: platformUser.id,
            role_id: role.id,
            granted_by_user_id: actorUserId,
          },
        });
      }

      await tx.passwordResetToken.create({
        data: {
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000),
        },
      });

      return platformUser;
    });

    const platformUser = await this.getUser(result.id);
    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'platform_user_invited',
        target_resource_type: 'platform_user',
        target_resource_id: result.id,
        payload: { after: platformUser },
      });
    }

    return {
      platform_user: platformUser,
      setup_url: this.buildSetupUrl(rawSetupToken),
    };
  }

  async updateRoles(
    id: string,
    dto: UpdatePlatformUserRolesDto,
    actorUserId: string,
    audit?: PlatformAuditContext,
  ): Promise<PlatformUserListRow> {
    const platformUser = await this.getUser(id);
    const roles = await this.getRolesOrThrow(dto.role_keys);
    const currentRoleKeys = platformUser.roles.map((role) => role.role.role_key);

    if (
      platformUser.user_id === actorUserId &&
      currentRoleKeys.includes('platform_owner') &&
      !dto.role_keys.includes('platform_owner')
    ) {
      throw new BadRequestException({
        code: 'CANNOT_REVOKE_OWN_PLATFORM_OWNER',
        message: 'You cannot remove your own platform_owner role.',
      });
    }

    const desiredRoleIds = new Set(roles.map((role) => role.id));
    await this.prisma.$transaction(async (tx) => {
      for (const role of roles) {
        await tx.platformUserRole.upsert({
          where: {
            platform_user_id_role_id: {
              platform_user_id: id,
              role_id: role.id,
            },
          },
          update: {},
          create: {
            platform_user_id: id,
            role_id: role.id,
            granted_by_user_id: actorUserId,
          },
        });
      }

      const rolesToRemove = platformUser.roles.filter((role) => !desiredRoleIds.has(role.role_id));
      for (const role of rolesToRemove) {
        await tx.platformUserRole.delete({
          where: {
            platform_user_id_role_id: {
              platform_user_id: id,
              role_id: role.role_id,
            },
          },
        });
      }
    });

    const updated = await this.getUser(id);
    if (audit) {
      const removedRoles = currentRoleKeys.filter((role) => !dto.role_keys.includes(role));
      const addedRoles = dto.role_keys.filter((role) => !currentRoleKeys.includes(role));
      await this.platformAuditService.log({
        ...audit,
        action: addedRoles.length > 0 ? 'platform_role_granted' : 'platform_role_revoked',
        target_resource_type: 'platform_user',
        target_resource_id: id,
        payload: {
          before: platformUser,
          after: updated,
          extra: { added_roles: addedRoles, removed_roles: removedRoles },
        },
      });
    }

    return updated;
  }

  async revoke(id: string, actorUserId: string, audit?: PlatformAuditContext): Promise<void> {
    const platformUser = await this.getUser(id);
    const roleKeys = platformUser.roles.map((role) => role.role.role_key);
    if (platformUser.user_id === actorUserId && roleKeys.includes('platform_owner')) {
      throw new BadRequestException({
        code: 'CANNOT_REVOKE_OWN_PLATFORM_OWNER',
        message: 'You cannot revoke your own platform_owner access.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.platformUserRole.deleteMany({ where: { platform_user_id: id } });
      await tx.platformUser.update({
        where: { id },
        data: { revoked_at: new Date() },
      });
    });
    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'platform_user_revoked',
        target_resource_type: 'platform_user',
        target_resource_id: id,
        payload: { before: platformUser },
      });
    }
  }

  async listPermissions(): Promise<PlatformPermissionMatrix> {
    const [roles, permissions] = await Promise.all([
      this.prisma.platformRole.findMany({
        orderBy: { role_key: 'asc' },
        select: {
          created_at: true,
          description: true,
          display_name: true,
          id: true,
          permissions: {
            select: {
              permission_id: true,
              role_id: true,
              permission: {
                select: {
                  category: true,
                  created_at: true,
                  description: true,
                  display_name: true,
                  id: true,
                  is_destructive: true,
                  permission_key: true,
                  requires_two_person: true,
                },
              },
            },
          },
          role_key: true,
          updated_at: true,
        },
      }),
      this.prisma.platformPermission.findMany({
        orderBy: [{ category: 'asc' }, { permission_key: 'asc' }],
        select: {
          category: true,
          created_at: true,
          description: true,
          display_name: true,
          id: true,
          is_destructive: true,
          permission_key: true,
          requires_two_person: true,
        },
      }),
    ]);

    return { roles, permissions };
  }

  private async getRolesOrThrow(roleKeys: PlatformRoleKey[]): Promise<PlatformRoleLookupRow[]> {
    const roles = await this.prisma.platformRole.findMany({
      where: { role_key: { in: roleKeys } },
      select: { id: true, role_key: true },
    });

    if (roles.length !== roleKeys.length) {
      throw new BadRequestException({
        code: 'PLATFORM_ROLE_NOT_FOUND',
        message: 'One or more platform roles are invalid.',
      });
    }

    return roles;
  }

  private buildSetupUrl(token: string): string {
    const appUrl = this.configService.get<string>('APP_URL') ?? 'https://edupod.app';
    return `${appUrl.replace(/\/$/, '')}/en/reset-password?token=${encodeURIComponent(token)}`;
  }
}
