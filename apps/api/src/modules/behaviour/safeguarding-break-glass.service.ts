import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import type { CompleteBreakGlassReviewDto, GrantBreakGlassDto } from '@school/shared';
import { Queue } from 'bullmq';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

export type EffectivePermissionContext = 'normal' | 'break_glass' | 'cp_access_grant';

export interface EffectivePermissionResult {
  allowed: boolean;
  context: EffectivePermissionContext;
  grantId?: string;
}

@Injectable()
export class SafeguardingBreakGlassService {
  private readonly logger = new Logger(SafeguardingBreakGlassService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    // TODO(M-17): Migrate to BehaviourSideEffectsService
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ─── Effective Permission Check (dual source) ──────────────────────────────

  async checkEffectivePermission(
    userId: string,
    tenantId: string,
    membershipId: string,
    concernId?: string,
  ): Promise<EffectivePermissionResult> {
    // 1. Check RBAC for safeguarding.view permission
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, user_id: userId, tenant_id: tenantId },
      include: {
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
      },
    });

    if (membership) {
      const permissions = new Set<string>();
      for (const mr of membership.membership_roles) {
        for (const rp of mr.role.role_permissions) {
          permissions.add(rp.permission.permission_key);
        }
      }
      if (permissions.has('safeguarding.view')) {
        return { allowed: true, context: 'normal' };
      }
    }

    // 2. Check behaviour break-glass grant
    const grantWhere: Prisma.SafeguardingBreakGlassGrantWhereInput = {
      tenant_id: tenantId,
      granted_to_id: userId,
      revoked_at: null,
      expires_at: { gt: new Date() },
    };

    if (concernId) {
      grantWhere.OR = [
        { scope: 'all_concerns' as $Enums.BreakGlassScope },
        {
          scope: 'specific_concerns' as $Enums.BreakGlassScope,
          scoped_concern_ids: { has: concernId },
        },
      ];
    }

    const breakGlassGrant = await this.prisma.safeguardingBreakGlassGrant.findFirst({
      where: grantWhere,
    });

    if (breakGlassGrant) {
      return { allowed: true, context: 'break_glass', grantId: breakGlassGrant.id };
    }

    // 3. Check pastoral cp_access_grants for active grant
    const cpGrant = await this.prisma.cpAccessGrant.findFirst({
      where: {
        user_id: userId,
        tenant_id: tenantId,
        revoked_at: null,
      },
    });

    if (cpGrant) {
      return { allowed: true, context: 'cp_access_grant', grantId: cpGrant.id };
    }

    return { allowed: false, context: 'normal' };
  }

  // ─── Grant Access ──────────────────────────────────────────────────────────

  async grantAccess(tenantId: string, userId: string, dto: GrantBreakGlassDto) {
    if (dto.duration_hours > 72) {
      throw new BadRequestException({
        code: 'DURATION_EXCEEDED',
        message: 'Break-glass grant duration must not exceed 72 hours',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const grantedAt = new Date();
      const expiresAt = new Date(Date.now() + dto.duration_hours * 60 * 60 * 1000);

      // Create break-glass grant record
      const grant = await db.safeguardingBreakGlassGrant.create({
        data: {
          tenant_id: tenantId,
          granted_to_id: dto.granted_to_id,
          granted_by_id: userId,
          reason: dto.reason,
          scope: dto.scope as $Enums.BreakGlassScope,
          scoped_concern_ids: dto.scoped_concern_ids ?? [],
          granted_at: grantedAt,
          expires_at: expiresAt,
        },
      });

      // Create safeguarding action entries for audit trail
      if (dto.scope === 'specific_concerns' && dto.scoped_concern_ids?.length) {
        for (const concernId of dto.scoped_concern_ids) {
          await db.safeguardingAction.create({
            data: {
              tenant_id: tenantId,
              concern_id: concernId,
              action_by_id: userId,
              action_type: 'note_added' as $Enums.SafeguardingActionType,
              description: `Break-glass access granted to user ${dto.granted_to_id} for ${dto.duration_hours}h. Reason: ${dto.reason}`,
              metadata: {
                break_glass_grant_id: grant.id,
                scope: dto.scope,
              } as unknown as Prisma.InputJsonValue,
            },
          });
        }
      } else {
        // Global log entry for all_concerns scope — use a null-safe action
        // We cannot create a safeguardingAction without a concern_id, so log
        // against each active concern or skip if none exist.
        const activeConcerns = await db.safeguardingConcern.findMany({
          where: { tenant_id: tenantId },
          select: { id: true },
          take: 100,
        });

        for (const concern of activeConcerns) {
          await db.safeguardingAction.create({
            data: {
              tenant_id: tenantId,
              concern_id: concern.id,
              action_by_id: userId,
              action_type: 'note_added' as $Enums.SafeguardingActionType,
              description: `Break-glass access granted (all concerns) to user ${dto.granted_to_id} for ${dto.duration_hours}h. Reason: ${dto.reason}`,
              metadata: {
                break_glass_grant_id: grant.id,
                scope: 'all_concerns',
              } as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }

      // Queue notification to DLP + principal
      await this.notificationsQueue.add('safeguarding:break-glass-granted', {
        tenant_id: tenantId,
        grant_id: grant.id,
        granted_to_id: dto.granted_to_id,
        granted_by_id: userId,
        reason: dto.reason,
        scope: dto.scope,
        duration_hours: dto.duration_hours,
        expires_at: expiresAt.toISOString(),
      });

      // Audit log the grant
      void this.auditLogService.write(
        tenantId,
        userId,
        'safeguarding_break_glass_grant',
        grant.id,
        'break_glass_granted',
        {
          granted_to_id: dto.granted_to_id,
          reason: dto.reason,
          scope: dto.scope,
          duration_hours: dto.duration_hours,
          expires_at: expiresAt.toISOString(),
        },
        null,
      );

      return {
        data: {
          id: grant.id,
          expires_at: grant.expires_at.toISOString(),
        },
      };
    }) as Promise<{ data: { id: string; expires_at: string } }>;
  }

  // ─── List Active Grants ────────────────────────────────────────────────────

  async listActiveGrants(tenantId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const grants = await db.safeguardingBreakGlassGrant.findMany({
        where: {
          tenant_id: tenantId,
          revoked_at: null,
          expires_at: { gt: new Date() },
        },
        include: {
          granted_to: { select: { id: true, first_name: true, last_name: true } },
          granted_by: { select: { id: true, first_name: true, last_name: true } },
        },
        orderBy: { granted_at: 'desc' },
      });

      return {
        data: grants.map((g) => ({
          id: g.id,
          granted_to: {
            id: g.granted_to.id,
            name: `${g.granted_to.first_name} ${g.granted_to.last_name}`,
          },
          granted_by: {
            id: g.granted_by.id,
            name: `${g.granted_by.first_name} ${g.granted_by.last_name}`,
          },
          reason: g.reason,
          scope: g.scope,
          granted_at: g.granted_at.toISOString(),
          expires_at: g.expires_at.toISOString(),
        })),
      };
    }) as Promise<{
      data: Array<{
        id: string;
        granted_to: { id: string; name: string };
        granted_by: { id: string; name: string };
        reason: string;
        scope: string;
        granted_at: string;
        expires_at: string;
      }>;
    }>;
  }

  // ─── Complete Review ───────────────────────────────────────────────────────

  async completeReview(
    tenantId: string,
    userId: string,
    grantId: string,
    dto: CompleteBreakGlassReviewDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Load the grant record
      const grant = await db.safeguardingBreakGlassGrant.findFirst({
        where: { id: grantId, tenant_id: tenantId },
      });

      if (!grant) {
        throw new NotFoundException({
          code: 'GRANT_NOT_FOUND',
          message: 'Break-glass grant not found',
        });
      }

      if (grant.after_action_review_completed_at) {
        throw new BadRequestException({
          code: 'REVIEW_ALREADY_COMPLETED',
          message: 'Review already completed',
        });
      }

      // Update grant with review details
      await db.safeguardingBreakGlassGrant.update({
        where: { id: grantId },
        data: {
          after_action_review_completed_at: new Date(),
          after_action_review_by_id: userId,
          after_action_review_notes: dto.notes,
        },
      });

      // Complete the break_glass_review task
      await db.behaviourTask.updateMany({
        where: {
          tenant_id: tenantId,
          entity_type: 'break_glass_grant' as $Enums.BehaviourTaskEntityType,
          entity_id: grantId,
        },
        data: {
          status: 'completed' as $Enums.BehaviourTaskStatus,
          completed_at: new Date(),
          completed_by_id: userId,
          completion_notes: dto.notes,
        },
      });

      // Audit log the review
      void this.auditLogService.write(
        tenantId,
        userId,
        'safeguarding_break_glass_grant',
        grantId,
        'break_glass_review_completed',
        { notes: dto.notes },
        null,
      );

      return {
        data: {
          id: grantId,
          reviewed: true,
        },
      };
    }) as Promise<{ data: { id: string; reviewed: boolean } }>;
  }
}
