import { createHash, randomBytes } from 'crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlatformAuditActionType } from '@prisma/client';
import type { Queue } from 'bullmq';

import type { ListAuditActionsQuery, ListUsersQuery } from '@school/shared';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
import { AuthService } from '../auth/auth.service';
import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

type SupportLedgerAction =
  | 'user_password_reset_triggered'
  | 'user_account_unlocked'
  | 'user_disabled'
  | 'user_enabled'
  | 'tenant_ownership_transferred';

const SUPPORT_TO_LEDGER_ACTION: Record<PlatformAuditActionType, SupportLedgerAction | null> = {
  password_reset: 'user_password_reset_triggered',
  mfa_reset: null,
  resend_invite: null,
  unlock_account: 'user_account_unlocked',
  transfer_ownership: 'tenant_ownership_transferred',
  disable_user: 'user_disabled',
  enable_user: 'user_enabled',
};

@Injectable()
export class PlatformSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly platformAuditService: PlatformAuditService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  async resetPassword(
    targetUserId: string,
    actorId: string,
    audit?: PlatformAuditContext,
  ): Promise<{ message: string }> {
    const user = await this.findUserOrThrow(targetUserId);

    await this.authService.requestPasswordReset(user.email);
    await this.writeSupportAudit({
      actionType: 'password_reset',
      actorId,
      audit,
      targetUserId,
      metadata: { email: user.email },
    });

    return { message: 'Password reset email triggered' };
  }

  async resendInvite(
    targetUserId: string,
    actorId: string,
    audit?: PlatformAuditContext,
  ): Promise<{ message: string }> {
    const user = await this.findUserOrThrow(targetUserId);
    // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform support needs the latest pending invitation for a global user; no owning facade exposes token regeneration.
    const invitation = await this.prisma.invitation.findFirst({
      where: { email: user.email, status: 'pending' },
      orderBy: { created_at: 'desc' },
    });

    if (!invitation) {
      throw new BadRequestException({
        code: 'NO_PENDING_INVITATION',
        message: `No pending invitation was found for "${user.email}".`,
      });
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform support regenerates an existing pending invite token and records the action in the support audit trail.
    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { token_hash: tokenHash, expires_at: expiresAt },
    });

    await this.notificationsQueue.add(
      'communications:send-invitation',
      {
        tenant_id: invitation.tenant_id,
        invitation_id: invitation.id,
        token,
        email: user.email,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
    );

    await this.writeSupportAudit({
      actionType: 'resend_invite',
      actorId,
      audit,
      targetTenantId: invitation.tenant_id,
      targetUserId,
      metadata: { email: user.email, invitation_id: invitation.id },
    });

    return { message: 'Invitation re-sent' };
  }

  async unlockAccount(
    targetUserId: string,
    actorId: string,
    audit?: PlatformAuditContext,
  ): Promise<{ message: string }> {
    const user = await this.findUserOrThrow(targetUserId);

    await this.authService.clearBruteForce(user.email);
    // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform support account repair updates global user lock fields and writes a support audit action.
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { failed_login_attempts: 0, locked_until: null },
    });
    await this.writeSupportAudit({
      actionType: 'unlock_account',
      actorId,
      audit,
      targetUserId,
      metadata: { email: user.email },
    });

    return { message: 'Account unlocked' };
  }

  async disableUser(
    targetUserId: string,
    actorId: string,
    audit?: PlatformAuditContext,
  ): Promise<{ message: string }> {
    const user = await this.findUserOrThrow(targetUserId);

    if (targetUserId === actorId) {
      throw new BadRequestException({
        code: 'CANNOT_DISABLE_SELF',
        message: 'You cannot disable your own account.',
      });
    }
    if (user.global_status === 'disabled') {
      throw new BadRequestException({
        code: 'ALREADY_DISABLED',
        message: 'This user is already disabled.',
      });
    }

    // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform support may disable global user access after permission checks and support audit logging.
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { global_status: 'disabled' },
    });
    await this.authService.deleteAllUserSessions(targetUserId);
    await this.writeSupportAudit({
      actionType: 'disable_user',
      actorId,
      audit,
      targetUserId,
      metadata: { email: user.email, previous_status: user.global_status },
    });

    return { message: 'User disabled' };
  }

  async enableUser(
    targetUserId: string,
    actorId: string,
    audit?: PlatformAuditContext,
  ): Promise<{ message: string }> {
    const user = await this.findUserOrThrow(targetUserId);

    if (user.global_status !== 'disabled') {
      throw new BadRequestException({
        code: 'NOT_DISABLED',
        message: 'Only disabled users can be enabled.',
      });
    }

    // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform support may restore global user access after permission checks and support audit logging.
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { global_status: 'active' },
    });
    await this.writeSupportAudit({
      actionType: 'enable_user',
      actorId,
      audit,
      targetUserId,
      metadata: { email: user.email, previous_status: user.global_status },
    });

    return { message: 'User enabled' };
  }

  async transferOwnership(
    tenantId: string,
    newOwnerUserId: string,
    actorId: string,
    audit?: PlatformAuditContext,
  ): Promise<{ message: string }> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${tenantId}" not found`,
      });
    }

    // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform support ownership transfer needs the current school owner role before entering the RLS-aware mutation.
    const currentOwner = await this.prisma.membershipRole.findFirst({
      where: {
        tenant_id: tenantId,
        role: { role_key: 'school_owner' },
      },
      include: {
        membership: {
          select: { id: true, user_id: true },
        },
        role: { select: { id: true } },
      },
    });

    if (!currentOwner) {
      throw new BadRequestException({
        code: 'NO_CURRENT_OWNER',
        message: 'No current school owner was found for this tenant.',
      });
    }

    // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform support validates the proposed owner membership before the RLS-aware ownership mutation.
    const newOwnerMembership = await this.prisma.tenantMembership.findUnique({
      where: {
        idx_tenant_memberships_tenant_user: {
          tenant_id: tenantId,
          user_id: newOwnerUserId,
        },
      },
      select: { id: true, membership_status: true },
    });

    if (!newOwnerMembership || newOwnerMembership.membership_status !== 'active') {
      throw new BadRequestException({
        code: 'NEW_OWNER_NOT_MEMBER',
        message: 'The new owner must have an active membership at this tenant.',
      });
    }

    await runWithRlsContext(this.prisma, { tenant_id: tenantId, user_id: actorId }, async (tx) => {
      await tx.membershipRole.upsert({
        where: {
          membership_id_role_id: {
            membership_id: newOwnerMembership.id,
            role_id: currentOwner.role.id,
          },
        },
        update: {},
        create: {
          membership_id: newOwnerMembership.id,
          role_id: currentOwner.role.id,
          tenant_id: tenantId,
        },
      });

      await tx.membershipRole.deleteMany({
        where: {
          membership_id: currentOwner.membership.id,
          role_id: currentOwner.role.id,
          tenant_id: tenantId,
        },
      });
    });

    await this.writeSupportAudit({
      actionType: 'transfer_ownership',
      actorId,
      audit,
      targetTenantId: tenantId,
      targetUserId: newOwnerUserId,
      metadata: {
        previous_owner_user_id: currentOwner.membership.user_id,
        new_owner_user_id: newOwnerUserId,
        tenant_name: tenant.name,
      },
    });

    return { message: 'Ownership transferred' };
  }

  async listAuditActions(query: ListAuditActionsQuery) {
    const where: Prisma.PlatformSupportAuditActionWhereInput = {};
    if (query.action_type) where.action_type = query.action_type;
    if (query.actor_id) where.actor_id = query.actor_id;
    if (query.target_user_id) where.target_user_id = query.target_user_id;
    if (query.target_tenant_id) where.target_tenant_id = query.target_tenant_id;

    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.platformSupportAuditAction.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: query.pageSize,
        include: {
          actor: { select: userSelect },
          target_tenant: { select: { id: true, name: true, slug: true } },
          target_user: { select: userSelect },
        },
      }),
      this.prisma.platformSupportAuditAction.count({ where }),
    ]);

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async listUsers(query: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {};
    if (query.global_status) where.global_status = query.global_status;
    if (query.tenant_id) {
      where.memberships = { some: { tenant_id: query.tenant_id } };
    }
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { first_name: { contains: query.search, mode: 'insensitive' } },
        { last_name: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform support user search is a guarded cross-tenant operator workflow backed by support audit actions.
      this.prisma.user.findMany({
        where,
        orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }],
        skip,
        take: query.pageSize,
        select: {
          ...userSelect,
          created_at: true,
          global_status: true,
          last_login_at: true,
          locked_until: true,
          mfa_enabled: true,
          memberships: {
            select: membershipSelect,
            orderBy: { created_at: 'desc' },
          },
        },
      }),
      // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform support user search is a guarded cross-tenant operator workflow backed by support audit actions.
      this.prisma.user.count({ where }),
    ]);

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async getUser(userId: string) {
    // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform support user detail is a guarded cross-tenant operator workflow backed by support audit actions.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...userSelect,
        created_at: true,
        email_verified_at: true,
        failed_login_attempts: true,
        global_status: true,
        last_login_at: true,
        locked_until: true,
        mfa_enabled: true,
        memberships: {
          select: membershipSelect,
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User with id "${userId}" not found`,
      });
    }

    return user;
  }

  private async findUserOrThrow(userId: string) {
    // eslint-disable-next-line school/no-cross-module-prisma-access -- Platform support actions validate global users before guarded mutations and audit writes.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        first_name: true,
        global_status: true,
        id: true,
        last_name: true,
        mfa_enabled: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User with id "${userId}" not found`,
      });
    }

    return user;
  }

  private async writeSupportAudit(input: {
    actionType: PlatformAuditActionType;
    actorId: string;
    audit?: PlatformAuditContext;
    metadata: Record<string, unknown>;
    targetTenantId?: string;
    targetUserId?: string;
  }): Promise<void> {
    await this.prisma.platformSupportAuditAction.create({
      data: {
        actor_id: input.actorId,
        action_type: input.actionType,
        target_tenant_id: input.targetTenantId,
        target_user_id: input.targetUserId,
        metadata: toJson(input.metadata),
      },
    });

    const ledgerAction = SUPPORT_TO_LEDGER_ACTION[input.actionType];
    if (input.audit && ledgerAction) {
      await this.platformAuditService.log({
        ...input.audit,
        action: ledgerAction,
        target_resource_type: input.targetTenantId ? 'tenant' : 'user',
        target_resource_id: input.targetTenantId ?? input.targetUserId,
        target_tenant_id: input.targetTenantId,
        payload: { extra: input.metadata },
      });
    }
  }
}

const userSelect = {
  email: true,
  first_name: true,
  id: true,
  last_name: true,
} satisfies Prisma.UserSelect;

const membershipSelect = {
  id: true,
  membership_status: true,
  tenant: { select: { id: true, name: true, slug: true, status: true } },
  tenant_id: true,
  user_id: true,
  membership_roles: {
    select: {
      role: { select: { display_name: true, id: true, role_key: true } },
      role_id: true,
    },
  },
} satisfies Prisma.TenantMembershipSelect;

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {}, jsonReplacer)) as Prisma.InputJsonValue;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
