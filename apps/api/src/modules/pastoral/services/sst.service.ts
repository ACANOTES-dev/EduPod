import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { AddSstMemberDto, UpdateSstMemberDto } from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacReadFacade } from '../../rbac/rbac-read.facade';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SstMemberRow {
  id: string;
  tenant_id: string;
  user_id: string;
  role_description: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  user?: { first_name: string; last_name: string } | null;
  user_name?: string | null;
}

export interface TierAccessResult {
  hasTier1: boolean;
  hasTier2: boolean;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class SstService {
  private readonly logger = new Logger(SstService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly eventService: PastoralEventService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── ADD MEMBER ──────────────────────────────────────────────────────────────

  async addMember(
    tenantId: string,
    userId: string,
    data: AddSstMemberDto,
    actorUserId: string,
  ): Promise<SstMemberRow> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const member = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Check for existing member (UNIQUE constraint: tenant_id + user_id)
      const existing = await db.sstMember.findFirst({
        where: {
          tenant_id: tenantId,
          user_id: userId,
        },
      });

      if (existing) {
        throw new ConflictException({
          code: 'SST_MEMBER_EXISTS',
          message: `User "${userId}" is already an SST member`,
        });
      }

      return db.sstMember.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          role_description: data.role_description ?? null,
          active: true,
        },
      });
    })) as SstMemberRow;

    // Fire-and-forget: write sst_member_added audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'sst_member_added',
      entity_type: 'sst_member',
      entity_id: member.id,
      student_id: null,
      actor_user_id: actorUserId,
      tier: 2,
      payload: {
        member_id: member.id,
        user_id: userId,
        role_description: data.role_description ?? null,
        added_by_user_id: actorUserId,
      },
      ip_address: null,
    });

    return member;
  }

  // ─── UPDATE MEMBER ───────────────────────────────────────────────────────────

  async updateMember(
    tenantId: string,
    memberId: string,
    data: UpdateSstMemberDto,
    actorUserId: string,
  ): Promise<SstMemberRow> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    let changes: Array<{ field: string; old_value: unknown; new_value: unknown }> = [];

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.sstMember.findUnique({
        where: { id: memberId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'SST_MEMBER_NOT_FOUND',
          message: `SST member "${memberId}" not found`,
        });
      }

      // Track changes for audit event
      const changeList: Array<{ field: string; old_value: unknown; new_value: unknown }> = [];

      const updateData: Record<string, unknown> = {};

      if (data.role_description !== undefined) {
        changeList.push({
          field: 'role_description',
          old_value: existing.role_description,
          new_value: data.role_description,
        });
        updateData.role_description = data.role_description ?? null;
      }

      if (data.active !== undefined) {
        changeList.push({
          field: 'active',
          old_value: existing.active,
          new_value: data.active,
        });
        updateData.active = data.active;
      }

      changes = changeList;

      return db.sstMember.update({
        where: { id: memberId },
        data: updateData,
      });
    })) as SstMemberRow;

    // Fire-and-forget: write sst_member_updated audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'sst_member_updated',
      entity_type: 'sst_member',
      entity_id: memberId,
      student_id: null,
      actor_user_id: actorUserId,
      tier: 2,
      payload: {
        member_id: memberId,
        user_id: updated.user_id,
        changes,
        updated_by_user_id: actorUserId,
      },
      ip_address: null,
    });

    return updated;
  }

  // ─── REMOVE MEMBER ───────────────────────────────────────────────────────────

  async removeMember(tenantId: string, memberId: string, actorUserId: string): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    let removedUserId = '';

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.sstMember.findUnique({
        where: { id: memberId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'SST_MEMBER_NOT_FOUND',
          message: `SST member "${memberId}" not found`,
        });
      }

      removedUserId = existing.user_id;

      await db.sstMember.delete({
        where: { id: memberId },
      });
    });

    // Fire-and-forget: write sst_member_removed audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'sst_member_removed',
      entity_type: 'sst_member',
      entity_id: memberId,
      student_id: null,
      actor_user_id: actorUserId,
      tier: 2,
      payload: {
        member_id: memberId,
        user_id: removedUserId,
        removed_by_user_id: actorUserId,
      },
      ip_address: null,
    });
  }

  // ─── LIST MEMBERS ────────────────────────────────────────────────────────────

  async listMembers(tenantId: string, filter?: { active?: boolean }): Promise<SstMemberRow[]> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
    };

    if (filter?.active !== undefined) {
      where.active = filter.active;
    }

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const members = await db.sstMember.findMany({
        where,
        include: {
          user: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
        },
        orderBy: { created_at: 'asc' },
      });

      return (members as SstMemberRow[]).map((member) => ({
        ...member,
        user_name: member.user ? `${member.user.first_name} ${member.user.last_name}` : null,
      }));
    }) as Promise<SstMemberRow[]>;
  }

  // ─── GET ACTIVE MEMBER USER IDS ─────────────────────────────────────────────

  async getActiveMembers(tenantId: string): Promise<Array<{ user_id: string; name: string }>> {
    const members = await this.listMembers(tenantId, { active: true });

    return members.map((member) => ({
      user_id: member.user_id,
      name: member.user_name ?? member.user_id,
    }));
  }

  async getActiveMemberUserIds(tenantId: string): Promise<string[]> {
    const members = await this.getActiveMembers(tenantId);
    return members.map((member) => member.user_id);
  }

  // ─── ENSURE TIER ACCESS ──────────────────────────────────────────────────────

  async ensureTierAccess(tenantId: string, userId: string): Promise<TierAccessResult> {
    // Find the user's membership for this tenant
    const membership = await this.rbacReadFacade.findMembershipSummary(tenantId, userId);

    if (!membership) {
      this.logger.warn(`SST member user_id=${userId} has no membership in tenant_id=${tenantId}`);

      // Log warning event
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'sst_tier_access_warning',
        entity_type: 'sst_member',
        entity_id: userId,
        student_id: null,
        actor_user_id: userId,
        tier: 2,
        payload: {
          user_id: userId,
          reason: 'no_membership_found',
          missing_permissions: ['pastoral.view_tier1', 'pastoral.view_tier2'],
        },
        ip_address: null,
      });

      return { hasTier1: false, hasTier2: false };
    }

    const permissions = await this.permissionCacheService.getPermissions(membership.id);

    const hasTier1 = permissions.includes('pastoral.view_tier1');
    const hasTier2 = permissions.includes('pastoral.view_tier2');

    if (!hasTier1 || !hasTier2) {
      const missing: string[] = [];
      if (!hasTier1) missing.push('pastoral.view_tier1');
      if (!hasTier2) missing.push('pastoral.view_tier2');

      this.logger.warn(`SST member user_id=${userId} missing permissions: ${missing.join(', ')}`);

      // Log warning event
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'sst_tier_access_warning',
        entity_type: 'sst_member',
        entity_id: userId,
        student_id: null,
        actor_user_id: userId,
        tier: 2,
        payload: {
          user_id: userId,
          reason: 'missing_permissions',
          missing_permissions: missing,
        },
        ip_address: null,
      });
    }

    return { hasTier1, hasTier2 };
  }
}
