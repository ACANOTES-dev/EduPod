import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import {
  notifyConcernJobPayloadSchema,
  pastoralEscalationTimeoutJobPayloadSchema,
} from '@school/shared';
import type {
  CreateConcernDto,
  EscalateConcernTierDto,
  ShareConcernWithParentDto,
  UpdateConcernMetadataDto,
} from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { addValidatedJob } from '../../../common/utils/validated-job.util';
import { PrismaService } from '../../prisma/prisma.service';

import { ConcernAccessService } from './concern-access.service';
import { ConcernProjectionService } from './concern-projection.service';
import { ConcernRelationsService } from './concern-relations.service';
import { ConcernVersionService } from './concern-version.service';
import type { ConcernDetailDto, ConcernRow } from './concern.types';
import { PastoralEventService } from './pastoral-event.service';

export type {
  ConcernCategory,
  ConcernDetailDto,
  ConcernListItemDto,
  ConcernRow,
  PaginationMeta,
} from './concern.types';

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ConcernService {
  private readonly logger = new Logger(ConcernService.name);
  private readonly accessService: ConcernAccessService;
  private readonly projectionService = new ConcernProjectionService();
  private readonly relationsService = new ConcernRelationsService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly versionService: ConcernVersionService,
    private readonly eventService: PastoralEventService,
    private readonly permissionCacheService: PermissionCacheService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectQueue('pastoral') private readonly pastoralQueue: Queue,
  ) {
    this.accessService = new ConcernAccessService(this.prisma);
  }

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    dto: CreateConcernDto,
    ipAddress: string | null,
  ): Promise<{ data: ConcernRow }> {
    // 1. Validate category against tenant settings
    const categoryResult = await this.accessService.validateCategory(tenantId, dto.category);
    const involvedStudentIds = this.relationsService.extractInvolvedStudentIds(
      dto.students_involved,
    );

    // 2. Compute effective tier
    const dtoTier = dto.tier ?? 1;
    const autoTier = categoryResult.auto_tier;
    const effectiveTier = autoTier ? Math.max(dtoTier, autoTier) : dtoTier;

    // 3. Check masked authorship
    if (dto.author_masked) {
      const settings = await this.accessService.loadPastoralSettings(tenantId);
      if (!settings.masked_authorship_enabled) {
        throw new BadRequestException({
          code: 'MASKED_AUTHORSHIP_DISABLED',
          message: 'Masked authorship is not enabled for this tenant',
        });
      }
    }

    // 4. Create RLS client and run transaction
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const { concern, cpRecordId } = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await this.relationsService.assertInvolvedStudentsExist(
        db,
        tenantId,
        dto.student_id,
        involvedStudentIds,
      );

      // Create the concern row
      const created = await db.pastoralConcern.create({
        data: {
          tenant_id: tenantId,
          student_id: dto.student_id,
          logged_by_user_id: userId,
          author_masked: dto.author_masked ?? false,
          category: dto.category,
          severity: dto.severity,
          tier: effectiveTier,
          occurred_at: new Date(dto.occurred_at),
          location: dto.location ?? null,
          witnesses: dto.witnesses
            ? (dto.witnesses as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          actions_taken: dto.actions_taken ?? null,
          follow_up_needed: dto.follow_up_needed ?? false,
          follow_up_suggestion: dto.follow_up_suggestion ?? null,
          case_id: dto.case_id ?? null,
          behaviour_incident_id: dto.behaviour_incident_id ?? null,
        },
      });

      if (involvedStudentIds.length > 0) {
        await db.pastoralConcernInvolvedStudent.createMany({
          data: involvedStudentIds.map((studentId) => ({
            concern_id: created.id,
            student_id: studentId,
            tenant_id: tenantId,
          })),
        });
      }

      // Create initial v1 narrative version within the same transaction
      await this.versionService.createInitialVersion(
        tx as unknown as Prisma.TransactionClient,
        tenantId,
        created.id,
        userId,
        dto.narrative,
      );

      let createdCpRecordId: string | null = null;

      if (effectiveTier === 3) {
        const cpRecord = await db.cpRecord.create({
          data: {
            tenant_id: tenantId,
            student_id: dto.student_id,
            concern_id: created.id,
            record_type: 'concern',
            logged_by_user_id: userId,
            narrative: dto.narrative,
          },
          select: {
            id: true,
          },
        });

        createdCpRecordId = cpRecord.id;
      }

      const concernWithRelations = await this.relationsService.loadConcernWithRelations(
        db,
        created.id,
      );

      if (!concernWithRelations) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: `Concern "${created.id}" not found`,
        });
      }

      return {
        concern: concernWithRelations,
        cpRecordId: createdCpRecordId,
      };
    })) as { concern: ConcernRow; cpRecordId: string | null };

    // 5. Fire-and-forget: write concern_created audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'concern_created',
      entity_type: 'concern',
      entity_id: concern.id,
      student_id: concern.student_id,
      actor_user_id: userId,
      tier: concern.tier,
      payload: {
        concern_id: concern.id,
        student_id: concern.student_id,
        category: concern.category,
        severity: concern.severity,
        tier: concern.tier,
        narrative_version: 1,
        narrative_snapshot: dto.narrative,
        source: 'manual' as const,
      },
      ip_address: ipAddress,
    });

    if (cpRecordId) {
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'cp_record_accessed',
        entity_type: 'cp_record',
        entity_id: cpRecordId,
        student_id: concern.student_id,
        actor_user_id: userId,
        tier: 3,
        payload: {
          cp_record_id: cpRecordId,
          student_id: concern.student_id,
        },
        ip_address: ipAddress,
      });
    }

    // 6. Enqueue notification dispatch job
    await addValidatedJob(
      this.notificationsQueue,
      'pastoral:notify-concern',
      notifyConcernJobPayloadSchema,
      {
        tenant_id: tenantId,
        concern_id: concern.id,
        severity: dto.severity,
        student_id: dto.student_id,
        category: dto.category,
        logged_by_user_id: userId,
      },
    );

    // 7. Enqueue delayed escalation timeout for urgent/critical concerns
    if (dto.severity === 'urgent' || dto.severity === 'critical') {
      const delayMs =
        dto.severity === 'critical'
          ? 30 * 60 * 1000 // 30 minutes (critical default)
          : 120 * 60 * 1000; // 120 minutes (urgent default)
      const escalationType =
        dto.severity === 'critical' ? 'critical_second_round' : 'urgent_to_critical';

      await addValidatedJob(
        this.pastoralQueue,
        'pastoral:escalation-timeout',
        pastoralEscalationTimeoutJobPayloadSchema,
        {
          tenant_id: tenantId,
          concern_id: concern.id,
          escalation_type: escalationType,
        },
        {
          delay: delayMs,
          jobId: `pastoral:escalation:${tenantId}:${concern.id}:${escalationType}`,
        },
      );
    }

    return { data: concern };
  }

  // ─── LIST (delegated to ConcernQueriesService — M-16 CQRS-lite split) ─────

  // ─── GET BY ID ──────────────────────────────────────────────────────────────

  async getById(
    tenantId: string,
    userId: string,
    permissions: string[],
    concernId: string,
    ipAddress: string | null,
  ): Promise<{ data: ConcernDetailDto }> {
    const hasCpAccess = await this.accessService.checkCpAccess(tenantId, userId);
    const callerMaxTier = this.accessService.resolveCallerTierAccess(permissions, hasCpAccess);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const concern = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralConcern.findUnique({
        where: { id: concernId },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
          logged_by: { select: { first_name: true, last_name: true } },
          involved_students: {
            include: {
              student: { select: { id: true, first_name: true, last_name: true } },
            },
            orderBy: { added_at: 'asc' },
          },
          versions: { orderBy: { version_number: 'asc' } },
        },
      });
    })) as ConcernRow | null;

    if (!concern) {
      throw new NotFoundException({
        code: 'CONCERN_NOT_FOUND',
        message: `Concern "${concernId}" not found`,
      });
    }

    // Check tier access at the application layer
    if (concern.tier > callerMaxTier) {
      throw new NotFoundException({
        code: 'CONCERN_NOT_FOUND',
        message: `Concern "${concernId}" not found`,
      });
    }

    // Fire access event for tier >= 3 or if tenant has access logging for this tier
    const settings = await this.accessService.loadPastoralSettings(tenantId);
    const shouldLogAccess =
      concern.tier >= 3 ||
      (concern.tier === 2 && settings.tier2_access_logging) ||
      (concern.tier === 1 && settings.tier1_access_logging);

    if (shouldLogAccess) {
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'concern_accessed',
        entity_type: 'concern',
        entity_id: concern.id,
        student_id: concern.student_id,
        actor_user_id: userId,
        tier: concern.tier,
        payload: {
          concern_id: concern.id,
          tier: concern.tier,
        },
        ip_address: ipAddress,
      });
    }

    // Auto-acknowledge on first view by non-author
    if (!concern.acknowledged_at && concern.logged_by_user_id !== userId) {
      void this.acknowledge(tenantId, userId, concern.id, ipAddress);
    }

    const data = this.projectionService.toConcernDetail(concern, hasCpAccess);

    return { data };
  }

  // ─── UPDATE METADATA ────────────────────────────────────────────────────────

  async updateMetadata(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: UpdateConcernMetadataDto,
  ): Promise<{ data: ConcernRow }> {
    const involvedStudentIds =
      dto.students_involved !== undefined
        ? this.relationsService.extractInvolvedStudentIds(dto.students_involved)
        : undefined;

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralConcern.findUnique({
        where: { id: concernId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: `Concern "${concernId}" not found`,
        });
      }

      const updateData: Prisma.PastoralConcernUpdateInput = {};
      if (dto.severity !== undefined) updateData.severity = dto.severity;
      if (dto.follow_up_needed !== undefined) updateData.follow_up_needed = dto.follow_up_needed;
      if (dto.follow_up_suggestion !== undefined)
        updateData.follow_up_suggestion = dto.follow_up_suggestion;
      if (dto.case_id !== undefined) {
        updateData.case = dto.case_id ? { connect: { id: dto.case_id } } : { disconnect: true };
      }

      if (involvedStudentIds !== undefined) {
        await this.relationsService.assertInvolvedStudentsExist(
          db,
          tenantId,
          existing.student_id,
          involvedStudentIds,
        );
      }

      await db.pastoralConcern.update({
        where: { id: concernId },
        data: updateData,
      });

      if (involvedStudentIds !== undefined) {
        await this.relationsService.syncInvolvedStudents(
          db,
          tenantId,
          concernId,
          involvedStudentIds,
        );
      }

      const updatedConcern = await this.relationsService.loadConcernWithRelations(db, concernId);
      if (!updatedConcern) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: `Concern "${concernId}" not found`,
        });
      }

      return updatedConcern;
    })) as ConcernRow;

    return { data: updated };
  }

  // ─── ESCALATE TIER ──────────────────────────────────────────────────────────

  async escalateTier(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: EscalateConcernTierDto,
    ipAddress: string | null,
  ): Promise<{ data: ConcernRow }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralConcern.findUnique({
        where: { id: concernId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: `Concern "${concernId}" not found`,
        });
      }

      if (dto.new_tier <= existing.tier) {
        throw new BadRequestException({
          code: 'TIER_NOT_ESCALATED',
          message: `New tier (${dto.new_tier}) must be higher than current tier (${existing.tier})`,
        });
      }

      const result = await db.pastoralConcern.update({
        where: { id: concernId },
        data: { tier: dto.new_tier },
      });

      // Fire-and-forget: write concern_tier_escalated audit event
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'concern_tier_escalated',
        entity_type: 'concern',
        entity_id: concernId,
        student_id: existing.student_id,
        actor_user_id: userId,
        tier: dto.new_tier,
        payload: {
          concern_id: concernId,
          old_tier: existing.tier,
          new_tier: dto.new_tier,
          reason: dto.reason,
          authorised_by_user_id: userId,
        },
        ip_address: ipAddress,
      });

      return result;
    })) as ConcernRow;

    return { data: updated };
  }

  // ─── MARK SHAREABLE ─────────────────────────────────────────────────────────

  async markShareable(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: ShareConcernWithParentDto,
  ): Promise<{ data: ConcernRow }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralConcern.findUnique({
        where: { id: concernId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: `Concern "${concernId}" not found`,
        });
      }

      const now = new Date();
      const result = await db.pastoralConcern.update({
        where: { id: concernId },
        data: {
          parent_shareable: true,
          parent_share_level: dto.share_level,
          shared_by_user_id: userId,
          shared_at: now,
        },
      });

      // Fire-and-forget: write concern_shared_with_parent audit event
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'concern_shared_with_parent',
        entity_type: 'concern',
        entity_id: concernId,
        student_id: existing.student_id,
        actor_user_id: userId,
        tier: existing.tier,
        payload: {
          concern_id: concernId,
          share_level: dto.share_level,
          shared_by_user_id: userId,
        },
        ip_address: null,
      });

      return result;
    })) as ConcernRow;

    return { data: updated };
  }

  // ─── SHARE WITH PARENT (SW-2C) ──────────────────────────────────────────────

  /**
   * Mark a concern as shareable with parents, with permission checks and audit.
   *
   * Permission rules:
   * - The logging teacher (concern.logged_by_user_id === userId) can share
   * - Any user with pastoral.view_tier2 can share
   * - Year head for the student's year group can share
   *
   * Tier 3 concerns cannot be shared with parents (hard rule).
   * When share_level is omitted, falls back to tenant_settings.parent_share_default_level.
   */
  async shareConcernWithParent(
    tenantId: string,
    userId: string,
    membershipId: string,
    concernId: string,
    dto: ShareConcernWithParentDto,
  ): Promise<{
    data: { id: string; parent_shareable: boolean; parent_share_level: string; shared_at: string };
  }> {
    // 1. Permission checks (outside transaction — read-only, cache-based)
    const permissions = await this.permissionCacheService.getPermissions(membershipId);
    const hasTier2 = permissions.includes('pastoral.view_tier2');
    const isYearHead = await this.accessService.checkIsYearHead(tenantId, membershipId);

    // 2. Resolve share_level (fallback to tenant default if omitted)
    let shareLevel = dto.share_level;
    if (!shareLevel) {
      const settings = await this.accessService.loadPastoralSettings(tenantId);
      shareLevel = settings.parent_share_default_level;
    }

    // 3. Single atomic transaction: read + validate + update
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const now = new Date();
    const { concern, updated } = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const c = await db.pastoralConcern.findUnique({ where: { id: concernId } });
      if (!c) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: `Concern "${concernId}" not found`,
        });
      }

      if (c.tier === 3) {
        throw new ForbiddenException({
          code: 'TIER3_SHARE_BLOCKED',
          message: 'Tier 3 concerns cannot be shared with parents',
        });
      }

      const isLoggingTeacher = c.logged_by_user_id === userId;
      if (!isLoggingTeacher && !hasTier2 && !isYearHead) {
        throw new ForbiddenException({
          code: 'SHARE_NOT_PERMITTED',
          message: 'You do not have permission to share this concern with parents',
        });
      }

      const u = await db.pastoralConcern.update({
        where: { id: concernId },
        data: {
          parent_shareable: true,
          parent_share_level: shareLevel,
          shared_by_user_id: userId,
          shared_at: now,
        },
      });

      return { concern: c, updated: u };
    })) as { concern: ConcernRow; updated: ConcernRow };

    // 4. Write immutable audit event (outside transaction — fire-and-forget)
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'concern_shared_with_parent',
      entity_type: 'concern',
      entity_id: concernId,
      student_id: concern.student_id,
      actor_user_id: userId,
      tier: concern.tier,
      payload: {
        concern_id: concernId,
        share_level: shareLevel,
        shared_by_user_id: userId,
      },
      ip_address: null,
    });

    // 5. Optionally enqueue parent notification
    if (dto.notify_parent) {
      await this.notificationsQueue.add('pastoral:notify-parent-share', {
        tenant_id: tenantId,
        concern_id: concernId,
        student_id: concern.student_id,
        category: concern.category,
      });
    }

    return {
      data: {
        id: updated.id,
        parent_shareable: updated.parent_shareable,
        parent_share_level: updated.parent_share_level ?? shareLevel,
        shared_at: (updated.shared_at ?? now).toISOString(),
      },
    };
  }

  /**
   * Revoke parent sharing on a concern.
   * Requires pastoral.view_tier2 (enforced at the controller layer).
   * Generates immutable `concern_unshared_from_parent` audit event.
   */
  async unshareConcernFromParent(
    tenantId: string,
    userId: string,
    concernId: string,
  ): Promise<{ data: { id: string; parent_shareable: boolean } }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralConcern.findUnique({
        where: { id: concernId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: `Concern "${concernId}" not found`,
        });
      }

      const result = await db.pastoralConcern.update({
        where: { id: concernId },
        data: { parent_shareable: false },
      });

      // Write immutable audit event
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'concern_unshared_from_parent',
        entity_type: 'concern',
        entity_id: concernId,
        student_id: existing.student_id,
        actor_user_id: userId,
        tier: existing.tier,
        payload: {
          concern_id: concernId,
          unshared_by_user_id: userId,
        },
        ip_address: null,
      });

      return result;
    })) as ConcernRow;

    return {
      data: {
        id: updated.id,
        parent_shareable: updated.parent_shareable,
      },
    };
  }

  // ─── GET CATEGORIES (delegated to ConcernQueriesService — M-16 CQRS-lite split) ─

  // ─── ACKNOWLEDGE ────────────────────────────────────────────────────────────

  async acknowledge(
    tenantId: string,
    userId: string,
    concernId: string,
    ipAddress: string | null,
  ): Promise<void> {
    try {
      const rlsClient = createRlsClient(this.prisma, {
        tenant_id: tenantId,
        user_id: userId,
      });

      await rlsClient.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        const concern = await db.pastoralConcern.findUnique({
          where: { id: concernId },
        });

        if (!concern || concern.acknowledged_at) {
          return; // Already acknowledged or not found — no-op
        }

        await db.pastoralConcern.update({
          where: { id: concernId },
          data: {
            acknowledged_at: new Date(),
            acknowledged_by_user_id: userId,
          },
        });

        // Cancel any pending escalation timeout jobs for this concern
        const escalationTypes = ['urgent_to_critical', 'critical_second_round'] as const;
        for (const type of escalationTypes) {
          const jobId = `pastoral:escalation:${tenantId}:${concernId}:${type}`;
          const job = await this.pastoralQueue.getJob(jobId);
          if (job) {
            await job.remove();
          }
        }

        // Fire-and-forget: write concern_acknowledged audit event
        void this.eventService.write({
          tenant_id: tenantId,
          event_type: 'concern_acknowledged',
          entity_type: 'concern',
          entity_id: concernId,
          student_id: concern.student_id,
          actor_user_id: userId,
          tier: concern.tier,
          payload: {
            concern_id: concernId,
            acknowledged_by_user_id: userId,
          },
          ip_address: ipAddress,
        });
      });
    } catch (error: unknown) {
      // Acknowledge is best-effort — log but do not propagate
      this.logger.error(
        `Failed to acknowledge concern ${concernId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
