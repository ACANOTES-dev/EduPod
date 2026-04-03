import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PastoralConcernVersion } from '@prisma/client';

import type { AmendNarrativeDto } from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

@Injectable()
export class ConcernVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pastoralEventService: PastoralEventService,
  ) {}

  // ─── Create Initial Version (within existing tx) ──────────────────────────

  /**
   * Creates v1 narrative version within an existing transaction.
   * Called by ConcernService.create() — receives the tx client, not creating its own.
   */
  async createInitialVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    concernId: string,
    userId: string,
    narrative: string,
  ): Promise<PastoralConcernVersion> {
    return tx.pastoralConcernVersion.create({
      data: {
        tenant_id: tenantId,
        concern_id: concernId,
        version_number: 1,
        narrative,
        amended_by_user_id: userId,
        amendment_reason: null,
      },
    });
  }

  // ─── Amend Narrative ──────────────────────────────────────────────────────

  /**
   * Amends a concern narrative. Creates new version with mandatory reason.
   * Uses SELECT ... FOR UPDATE on the concern to prevent concurrent amendments.
   */
  async amendNarrative(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: AmendNarrativeDto,
    ipAddress: string | null,
  ): Promise<{ data: PastoralConcernVersion }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const newVersion = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Lock the concern row to prevent concurrent amendments
      // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE within RLS transaction
      const concerns = await db.$queryRaw<Array<{ id: string; student_id: string; tier: number }>>`
        SELECT id, student_id, tier FROM pastoral_concerns
        WHERE id = ${concernId}::uuid AND tenant_id = ${tenantId}::uuid
        FOR UPDATE
      `;

      if (!concerns || concerns.length === 0) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: `Concern "${concernId}" not found`,
        });
      }

      const concern = concerns[0]!;

      // Find the latest version
      const latestVersion = await db.pastoralConcernVersion.findFirst({
        where: { concern_id: concernId, tenant_id: tenantId },
        orderBy: { version_number: 'desc' },
      });

      if (!latestVersion) {
        throw new NotFoundException({
          code: 'NO_VERSIONS_FOUND',
          message: `No versions found for concern "${concernId}"`,
        });
      }

      const nextVersionNumber = latestVersion.version_number + 1;

      // Insert the new version
      const created = await db.pastoralConcernVersion.create({
        data: {
          tenant_id: tenantId,
          concern_id: concernId,
          version_number: nextVersionNumber,
          narrative: dto.new_narrative,
          amended_by_user_id: userId,
          amendment_reason: dto.amendment_reason,
        },
      });

      // Fire-and-forget: write concern_narrative_amended event
      void this.pastoralEventService.write({
        tenant_id: tenantId,
        event_type: 'concern_narrative_amended',
        entity_type: 'concern',
        entity_id: concernId,
        student_id: concern.student_id,
        actor_user_id: userId,
        tier: concern.tier as 1 | 2 | 3,
        payload: {
          concern_id: concernId,
          version_number: nextVersionNumber,
          previous_narrative: latestVersion.narrative,
          new_narrative: dto.new_narrative,
          reason: dto.amendment_reason,
        },
        ip_address: ipAddress,
      });

      return created;
    });

    return { data: newVersion as PastoralConcernVersion };
  }

  // ─── List Versions ────────────────────────────────────────────────────────

  /**
   * Lists all versions for a concern in chronological order.
   */
  async listVersions(
    tenantId: string,
    concernId: string,
  ): Promise<{ data: PastoralConcernVersion[] }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const versions = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralConcernVersion.findMany({
        where: { concern_id: concernId, tenant_id: tenantId },
        orderBy: { version_number: 'asc' },
      });
    });

    return { data: versions as PastoralConcernVersion[] };
  }
}
