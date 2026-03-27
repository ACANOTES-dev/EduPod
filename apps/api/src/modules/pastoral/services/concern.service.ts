import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateConcernDto,
  EscalateConcernTierDto,
  ListConcernsQuery,
  ShareConcernWithParentDto,
  UpdateConcernMetadataDto,
} from '@school/shared';
import { pastoralTenantSettingsSchema } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { PrismaService } from '../../prisma/prisma.service';

import { ConcernVersionService } from './concern-version.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ConcernCategory {
  key: string;
  label: string;
  auto_tier?: number;
  active: boolean;
}

interface ValidatedCategory {
  auto_tier?: number;
}

export interface ConcernRow {
  id: string;
  tenant_id: string;
  student_id: string;
  logged_by_user_id: string;
  author_masked: boolean;
  category: string;
  severity: string;
  tier: number;
  occurred_at: Date;
  location: string | null;
  witnesses: Prisma.JsonValue;
  actions_taken: string | null;
  follow_up_needed: boolean;
  follow_up_suggestion: string | null;
  case_id: string | null;
  behaviour_incident_id: string | null;
  parent_shareable: boolean;
  parent_share_level: string | null;
  shared_by_user_id: string | null;
  shared_at: Date | null;
  legal_hold: boolean;
  imported: boolean;
  acknowledged_at: Date | null;
  acknowledged_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  logged_by?: { first_name: string; last_name: string } | null;
  versions?: Array<{
    id: string;
    concern_id: string;
    version_number: number;
    narrative: string;
    amended_by_user_id: string;
    amendment_reason: string | null;
    created_at: Date;
  }>;
}

export interface ConcernListItemDto {
  id: string;
  student_id: string;
  category: string;
  severity: string;
  tier: number;
  occurred_at: Date;
  created_at: Date;
  follow_up_needed: boolean;
  case_id: string | null;
  author_name: string | null;
  author_masked_for_viewer: boolean;
  logged_by_user_id: string | null;
}

export interface ConcernDetailDto extends ConcernListItemDto {
  witnesses: Prisma.JsonValue;
  actions_taken: string | null;
  follow_up_suggestion: string | null;
  location: string | null;
  behaviour_incident_id: string | null;
  parent_shareable: boolean;
  parent_share_level: string | null;
  acknowledged_at: Date | null;
  acknowledged_by_user_id: string | null;
  versions: Array<{
    id: string;
    concern_id: string;
    version_number: number;
    narrative: string;
    amended_by_user_id: string;
    amendment_reason: string | null;
    created_at: Date;
  }>;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ConcernService {
  private readonly logger = new Logger(ConcernService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly versionService: ConcernVersionService,
    private readonly eventService: PastoralEventService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    dto: CreateConcernDto,
    ipAddress: string | null,
  ): Promise<{ data: ConcernRow }> {
    // 1. Validate category against tenant settings
    const categoryResult = await this.validateCategory(tenantId, dto.category);

    // 2. Compute effective tier
    const dtoTier = dto.tier ?? 1;
    const autoTier = categoryResult.auto_tier;
    const effectiveTier = autoTier ? Math.max(dtoTier, autoTier) : dtoTier;

    // 3. Check masked authorship
    if (dto.author_masked) {
      const settings = await this.loadPastoralSettings(tenantId);
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

    const concern = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

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

      // Create initial v1 narrative version within the same transaction
      await this.versionService.createInitialVersion(
        tx as unknown as Prisma.TransactionClient,
        tenantId,
        created.id,
        userId,
        dto.narrative,
      );

      return created;
    })) as ConcernRow;

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

    return { data: concern };
  }

  // ─── LIST ───────────────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: ListConcernsQuery,
  ): Promise<{ data: ConcernListItemDto[]; meta: PaginationMeta }> {
    const hasCpAccess = await this.checkCpAccess(tenantId, userId);
    const callerMaxTier = this.resolveCallerTierAccess(permissions, hasCpAccess);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const skip = (query.page - 1) * query.pageSize;

    // Build where clause
    const where: Prisma.PastoralConcernWhereInput = {
      tenant_id: tenantId,
    };

    // Tier filtering: if caller cannot see tier 2, filter to tier 1 only
    // Tier 3 is already handled by RLS (only visible to DLP users)
    if (callerMaxTier < 2) {
      where.tier = 1;
    } else if (callerMaxTier < 3) {
      where.tier = { in: [1, 2] };
    }
    // If user-requested tier filter, apply it within allowed range
    if (query.tier !== undefined) {
      if (query.tier <= callerMaxTier) {
        where.tier = query.tier;
      } else {
        // Requested tier exceeds access — return empty
        return { data: [], meta: { page: query.page, pageSize: query.pageSize, total: 0 } };
      }
    }

    if (query.student_id) where.student_id = query.student_id;
    if (query.category) where.category = query.category;
    if (query.severity) where.severity = query.severity;
    if (query.case_id) where.case_id = query.case_id;

    // Date range filtering
    if (query.from || query.to) {
      where.created_at = {};
      if (query.from) where.created_at.gte = new Date(query.from);
      if (query.to) where.created_at.lte = new Date(query.to);
    }

    // Build orderBy
    const orderBy: Prisma.PastoralConcernOrderByWithRelationInput = {};
    if (query.sort === 'occurred_at') orderBy.occurred_at = query.order;
    else if (query.sort === 'severity') orderBy.severity = query.order;
    else orderBy.created_at = query.order;

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [concerns, total] = await Promise.all([
        db.pastoralConcern.findMany({
          where,
          include: {
            logged_by: { select: { first_name: true, last_name: true } },
          },
          orderBy,
          skip,
          take: query.pageSize,
        }),
        db.pastoralConcern.count({ where }),
      ]);

      const data = (concerns as ConcernRow[]).map((c) =>
        this.toConcernListItem(c, hasCpAccess),
      );

      return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
    }) as Promise<{ data: ConcernListItemDto[]; meta: PaginationMeta }>;
  }

  // ─── GET BY ID ──────────────────────────────────────────────────────────────

  async getById(
    tenantId: string,
    userId: string,
    permissions: string[],
    concernId: string,
    ipAddress: string | null,
  ): Promise<{ data: ConcernDetailDto }> {
    const hasCpAccess = await this.checkCpAccess(tenantId, userId);
    const callerMaxTier = this.resolveCallerTierAccess(permissions, hasCpAccess);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const concern = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralConcern.findUnique({
        where: { id: concernId },
        include: {
          logged_by: { select: { first_name: true, last_name: true } },
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
    const settings = await this.loadPastoralSettings(tenantId);
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

    const data = this.toConcernDetail(concern, hasCpAccess);

    return { data };
  }

  // ─── UPDATE METADATA ────────────────────────────────────────────────────────

  async updateMetadata(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: UpdateConcernMetadataDto,
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

      const updateData: Prisma.PastoralConcernUpdateInput = {};
      if (dto.severity !== undefined) updateData.severity = dto.severity;
      if (dto.follow_up_needed !== undefined) updateData.follow_up_needed = dto.follow_up_needed;
      if (dto.follow_up_suggestion !== undefined) updateData.follow_up_suggestion = dto.follow_up_suggestion;
      if (dto.case_id !== undefined) {
        updateData.case = dto.case_id ? { connect: { id: dto.case_id } } : { disconnect: true };
      }

      return db.pastoralConcern.update({
        where: { id: concernId },
        data: updateData,
      });
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

  // ─── GET CATEGORIES ─────────────────────────────────────────────────────────

  async getCategories(
    tenantId: string,
  ): Promise<{ data: ConcernCategory[] }> {
    const settings = await this.loadPastoralSettings(tenantId);

    const activeCategories = settings.concern_categories.filter(
      (c) => c.active,
    );

    return { data: activeCategories };
  }

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

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  /**
   * Validates a concern category against the tenant's active categories.
   * Returns the auto_tier if the category has one.
   */
  private async validateCategory(
    tenantId: string,
    categoryKey: string,
  ): Promise<ValidatedCategory> {
    const settings = await this.loadPastoralSettings(tenantId);

    const category = settings.concern_categories.find(
      (c) => c.key === categoryKey && c.active,
    );

    if (!category) {
      throw new BadRequestException({
        code: 'INVALID_CATEGORY',
        message: `Invalid or inactive concern category: ${categoryKey}`,
      });
    }

    return { auto_tier: category.auto_tier };
  }

  /**
   * Applies author masking to a concern DTO.
   * If author_masked is true and the viewer does NOT have DLP (CP access),
   * the author information is redacted.
   */
  private applyAuthorMasking(
    concern: ConcernRow,
    hasCpAccess: boolean,
  ): { author_name: string | null; logged_by_user_id: string | null; author_masked_for_viewer: boolean } {
    if (!concern.author_masked) {
      const authorName = concern.logged_by
        ? `${concern.logged_by.first_name} ${concern.logged_by.last_name}`
        : null;
      return {
        author_name: authorName,
        logged_by_user_id: concern.logged_by_user_id,
        author_masked_for_viewer: false,
      };
    }

    // DLP users see everything
    if (hasCpAccess) {
      const authorName = concern.logged_by
        ? `${concern.logged_by.first_name} ${concern.logged_by.last_name}`
        : null;
      return {
        author_name: authorName,
        logged_by_user_id: concern.logged_by_user_id,
        author_masked_for_viewer: false,
      };
    }

    // Non-DLP viewers see masked author
    return {
      author_name: 'Author masked',
      logged_by_user_id: null,
      author_masked_for_viewer: true,
    };
  }

  /**
   * Resolves the maximum tier level a caller can access.
   * - pastoral.view_tier1 only -> max tier 1
   * - pastoral.view_tier2 -> max tier 2
   * - CP access grant -> max tier 3 (handled by RLS, but useful for app-layer)
   */
  private resolveCallerTierAccess(
    permissions: string[],
    hasCpAccess: boolean,
  ): number {
    if (hasCpAccess) return 3;
    if (permissions.includes('pastoral.view_tier2')) return 2;
    if (permissions.includes('pastoral.view_tier1')) return 1;
    return 0;
  }

  // ─── INTERNAL UTILITY METHODS ─────────────────────────────────────────────

  /**
   * Loads and parses the pastoral section of tenant settings.
   * Uses the Zod schema to fill in defaults for any missing fields.
   */
  private async loadPastoralSettings(tenantId: string) {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};

    return pastoralTenantSettingsSchema.parse(pastoralRaw);
  }

  /**
   * Checks whether a user has an active (non-revoked) CP access grant.
   */
  private async checkCpAccess(
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    const grant = await this.prisma.cpAccessGrant.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        revoked_at: null,
      },
      select: { id: true },
    });

    return !!grant;
  }

  /**
   * Maps a raw concern row to a list item DTO with author masking applied.
   */
  private toConcernListItem(
    concern: ConcernRow,
    hasCpAccess: boolean,
  ): ConcernListItemDto {
    const masking = this.applyAuthorMasking(concern, hasCpAccess);

    return {
      id: concern.id,
      student_id: concern.student_id,
      category: concern.category,
      severity: concern.severity,
      tier: concern.tier,
      occurred_at: concern.occurred_at,
      created_at: concern.created_at,
      follow_up_needed: concern.follow_up_needed,
      case_id: concern.case_id,
      author_name: masking.author_name,
      author_masked_for_viewer: masking.author_masked_for_viewer,
      logged_by_user_id: masking.logged_by_user_id,
    };
  }

  /**
   * Maps a raw concern row (with versions) to a detail DTO with author masking.
   */
  private toConcernDetail(
    concern: ConcernRow,
    hasCpAccess: boolean,
  ): ConcernDetailDto {
    const listItem = this.toConcernListItem(concern, hasCpAccess);

    return {
      ...listItem,
      witnesses: concern.witnesses,
      actions_taken: concern.actions_taken,
      follow_up_suggestion: concern.follow_up_suggestion,
      location: concern.location,
      behaviour_incident_id: concern.behaviour_incident_id,
      parent_shareable: concern.parent_shareable,
      parent_share_level: concern.parent_share_level,
      acknowledged_at: concern.acknowledged_at,
      acknowledged_by_user_id: concern.acknowledged_by_user_id,
      versions: concern.versions ?? [],
    };
  }
}
