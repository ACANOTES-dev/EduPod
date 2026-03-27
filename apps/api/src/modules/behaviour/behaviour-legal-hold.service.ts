import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import type {
  CreateLegalHoldDto,
  LegalHoldListItem,
  LegalHoldListQuery,
  ReleaseLegalHoldDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';

@Injectable()
export class BehaviourLegalHoldService {
  private readonly logger = new Logger(BehaviourLegalHoldService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly historyService: BehaviourHistoryService,
  ) {}

  // ─── Create Hold ──────────────────────────────────────────────────────────

  async createHold(
    tenantId: string,
    userId: string,
    dto: CreateLegalHoldDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      // Idempotency: if an active hold with same entity + legal_basis exists, return it
      if (dto.legal_basis) {
        const existing = await tx.behaviourLegalHold.findFirst({
          where: {
            tenant_id: tenantId,
            entity_type: dto.entity_type as $Enums.LegalHoldEntityType,
            entity_id: dto.entity_id,
            legal_basis: dto.legal_basis,
            status: 'active_hold' as $Enums.LegalHoldStatus,
          },
        });
        if (existing) {
          return existing;
        }
      }

      // Create the hold record
      const hold = await tx.behaviourLegalHold.create({
        data: {
          tenant_id: tenantId,
          entity_type: dto.entity_type as $Enums.LegalHoldEntityType,
          entity_id: dto.entity_id,
          hold_reason: dto.hold_reason,
          legal_basis: dto.legal_basis ?? null,
          set_by_id: userId,
          status: 'active_hold' as $Enums.LegalHoldStatus,
        },
      });

      // Log to entity history
      await this.historyService.recordHistory(
        tx,
        tenantId,
        dto.entity_type as string,
        dto.entity_id,
        userId,
        'legal_hold_set',
        null,
        {
          hold_id: hold.id,
          hold_reason: dto.hold_reason,
          legal_basis: dto.legal_basis ?? null,
        },
      );

      // Propagate to linked entities
      if (dto.propagate !== false) {
        await this.propagateHold(tx, tenantId, userId, dto, hold.id);
      }

      this.logger.log(
        `Legal hold ${hold.id} set on ${dto.entity_type} ${dto.entity_id} by user ${userId}`,
      );

      return hold;
    });
  }

  // ─── Release Hold ─────────────────────────────────────────────────────────

  async releaseHold(
    tenantId: string,
    userId: string,
    holdId: string,
    dto: ReleaseLegalHoldDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      const hold = await tx.behaviourLegalHold.findFirst({
        where: { id: holdId, tenant_id: tenantId },
      });
      if (!hold) {
        throw new NotFoundException({ code: 'HOLD_NOT_FOUND', message: 'Legal hold not found' });
      }

      if ((hold.status as string) === 'released') {
        return; // Already released — idempotent
      }

      // Release the hold
      await tx.behaviourLegalHold.update({
        where: { id: holdId },
        data: {
          status: 'released' as $Enums.LegalHoldStatus,
          released_by_id: userId,
          released_at: new Date(),
          release_reason: dto.release_reason,
        },
      });

      // Log to entity history
      await this.historyService.recordHistory(
        tx,
        tenantId,
        hold.entity_type as string,
        hold.entity_id,
        userId,
        'legal_hold_released',
        { hold_id: holdId, status: 'active' },
        { hold_id: holdId, status: 'released', release_reason: dto.release_reason },
      );

      // If releaseLinked: release all holds with the same legal_basis
      if (dto.release_linked && hold.legal_basis) {
        const linkedHolds = await tx.behaviourLegalHold.findMany({
          where: {
            tenant_id: tenantId,
            legal_basis: hold.legal_basis,
            status: 'active_hold' as $Enums.LegalHoldStatus,
            id: { not: holdId },
          },
        });

        for (const linked of linkedHolds) {
          await tx.behaviourLegalHold.update({
            where: { id: linked.id },
            data: {
              status: 'released' as $Enums.LegalHoldStatus,
              released_by_id: userId,
              released_at: new Date(),
              release_reason: `Released linked to hold ${holdId}: ${dto.release_reason}`,
            },
          });

          await this.historyService.recordHistory(
            tx,
            tenantId,
            linked.entity_type as string,
            linked.entity_id,
            userId,
            'legal_hold_released',
            { hold_id: linked.id, status: 'active' },
            { hold_id: linked.id, status: 'released', release_reason: dto.release_reason, released_via: holdId },
          );
        }

        this.logger.log(`Released ${linkedHolds.length} linked holds for legal_basis "${hold.legal_basis}"`);
      }

      this.logger.log(`Legal hold ${holdId} released by user ${userId}`);
    });
  }

  // ─── List Holds ───────────────────────────────────────────────────────────

  async listHolds(
    tenantId: string,
    query: LegalHoldListQuery,
  ): Promise<{ data: LegalHoldListItem[]; meta: { page: number; pageSize: number; total: number } }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      const where: Prisma.BehaviourLegalHoldWhereInput = {
        tenant_id: tenantId,
      };

      if (query.status === 'active') {
        where.status = 'active_hold' as $Enums.LegalHoldStatus;
      } else if (query.status === 'released') {
        where.status = 'released' as $Enums.LegalHoldStatus;
      }

      if (query.entity_type) {
        where.entity_type = query.entity_type as $Enums.LegalHoldEntityType;
      }

      const [total, holds] = await Promise.all([
        tx.behaviourLegalHold.count({ where }),
        tx.behaviourLegalHold.findMany({
          where,
          include: {
            set_by: { select: { id: true, first_name: true, last_name: true } },
            released_by: { select: { id: true, first_name: true, last_name: true } },
          },
          orderBy: { set_at: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);

      const data: LegalHoldListItem[] = holds.map((h) => ({
        id: h.id,
        entity_type: h.entity_type as string,
        entity_id: h.entity_id,
        hold_reason: h.hold_reason,
        legal_basis: h.legal_basis,
        status: (h.status as string) === 'active_hold' ? 'active' : (h.status as string),
        set_by: h.set_by,
        set_at: h.set_at.toISOString(),
        released_by: h.released_by,
        released_at: h.released_at?.toISOString() ?? null,
        release_reason: h.release_reason,
      }));

      return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
    }) as Promise<{ data: LegalHoldListItem[]; meta: { page: number; pageSize: number; total: number } }>;
  }

  // ─── Has Active Hold ──────────────────────────────────────────────────────

  async hasActiveHold(
    tx: PrismaService,
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<{ held: boolean; hold_reason?: string; legal_basis?: string | null; hold_id?: string }> {
    const activeHold = await tx.behaviourLegalHold.findFirst({
      where: {
        tenant_id: tenantId,
        entity_type: entityType as $Enums.LegalHoldEntityType,
        entity_id: entityId,
        status: 'active_hold' as $Enums.LegalHoldStatus,
      },
    });

    if (activeHold) {
      return {
        held: true,
        hold_reason: activeHold.hold_reason,
        legal_basis: activeHold.legal_basis,
        hold_id: activeHold.id,
      };
    }

    return { held: false };
  }

  // ─── Count Active Holds ───────────────────────────────────────────────────

  async countActiveHolds(tenantId: string): Promise<number> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;
      return tx.behaviourLegalHold.count({
        where: {
          tenant_id: tenantId,
          status: 'active_hold' as $Enums.LegalHoldStatus,
        },
      });
    }) as Promise<number>;
  }

  // ─── Propagation ──────────────────────────────────────────────────────────

  private async propagateHold(
    tx: PrismaService,
    tenantId: string,
    userId: string,
    dto: CreateLegalHoldDto,
    anchorHoldId: string,
  ): Promise<void> {
    const propagatedReason = `${dto.hold_reason} [Propagated from ${dto.entity_type} ${dto.entity_id}]`;
    const linkedEntityIds: Array<{ type: string; id: string }> = [];

    switch (dto.entity_type) {
      case 'incident':
        await this.collectIncidentLinkedEntities(tx, tenantId, dto.entity_id, linkedEntityIds);
        break;

      case 'appeal': {
        // Appeal propagates to its incident + all incident-linked entities
        const appeal = await tx.behaviourAppeal.findFirst({
          where: { id: dto.entity_id, tenant_id: tenantId },
          select: { incident_id: true },
        });
        if (appeal) {
          linkedEntityIds.push({ type: 'incident', id: appeal.incident_id });
          await this.collectIncidentLinkedEntities(tx, tenantId, appeal.incident_id, linkedEntityIds);
        }
        break;
      }

      case 'exclusion_case': {
        // Exclusion propagates to linked sanction + incident + incident-linked entities
        const excCase = await tx.behaviourExclusionCase.findFirst({
          where: { id: dto.entity_id, tenant_id: tenantId },
          select: { sanction_id: true, incident_id: true },
        });
        if (excCase) {
          linkedEntityIds.push({ type: 'sanction', id: excCase.sanction_id });
          linkedEntityIds.push({ type: 'incident', id: excCase.incident_id });
          await this.collectIncidentLinkedEntities(tx, tenantId, excCase.incident_id, linkedEntityIds);

          // Documents linked to the exclusion case (entity_type is a plain string)
          const excDocs = await tx.behaviourDocument.findMany({
            where: { tenant_id: tenantId, entity_type: 'exclusion_case', entity_id: dto.entity_id },
            select: { id: true },
          });
          for (const doc of excDocs) {
            linkedEntityIds.push({ type: 'attachment', id: doc.id });
          }
        }
        break;
      }

      default:
        // No propagation for other entity types
        break;
    }

    // Create hold records for each linked entity (no recursive propagation)
    for (const linked of linkedEntityIds) {
      // Skip if this is the same as the anchor
      if (linked.type === dto.entity_type && linked.id === dto.entity_id) continue;

      // Idempotency: check for existing active hold with same legal_basis
      if (dto.legal_basis) {
        const existing = await tx.behaviourLegalHold.findFirst({
          where: {
            tenant_id: tenantId,
            entity_type: linked.type as $Enums.LegalHoldEntityType,
            entity_id: linked.id,
            legal_basis: dto.legal_basis,
            status: 'active_hold' as $Enums.LegalHoldStatus,
          },
        });
        if (existing) continue;
      }

      // Only create if entity_type is valid for LegalHoldEntityType
      const validTypes = ['incident', 'sanction', 'intervention', 'appeal', 'exclusion_case', 'task', 'attachment'];
      if (!validTypes.includes(linked.type)) continue;

      await tx.behaviourLegalHold.create({
        data: {
          tenant_id: tenantId,
          entity_type: linked.type as $Enums.LegalHoldEntityType,
          entity_id: linked.id,
          hold_reason: propagatedReason,
          legal_basis: dto.legal_basis ?? null,
          set_by_id: userId,
          status: 'active_hold' as $Enums.LegalHoldStatus,
        },
      });
    }

    this.logger.log(
      `Propagated hold from ${dto.entity_type} ${dto.entity_id} to ${linkedEntityIds.length} linked entities`,
    );
  }

  /**
   * Collect all entities linked to an incident for hold propagation.
   */
  private async collectIncidentLinkedEntities(
    tx: PrismaService,
    tenantId: string,
    incidentId: string,
    out: Array<{ type: string; id: string }>,
  ): Promise<void> {
    // Sanctions linked to this incident
    const sanctions = await tx.behaviourSanction.findMany({
      where: { tenant_id: tenantId, incident_id: incidentId },
      select: { id: true },
    });
    for (const s of sanctions) out.push({ type: 'sanction', id: s.id });

    // Tasks linked to this incident
    const tasks = await tx.behaviourTask.findMany({
      where: { tenant_id: tenantId, entity_id: incidentId, entity_type: 'incident' as $Enums.BehaviourTaskEntityType },
      select: { id: true },
    });
    for (const t of tasks) out.push({ type: 'task', id: t.id });

    // Attachments linked to this incident (entity_type is a plain string, not enum)
    const attachments = await tx.behaviourAttachment.findMany({
      where: { tenant_id: tenantId, entity_type: 'incident', entity_id: incidentId },
      select: { id: true },
    });
    for (const a of attachments) out.push({ type: 'attachment', id: a.id });

    // Documents for this incident (entity_type is a plain string, not enum)
    const docs = await tx.behaviourDocument.findMany({
      where: { tenant_id: tenantId, entity_type: 'incident', entity_id: incidentId },
      select: { id: true },
    });
    for (const d of docs) out.push({ type: 'attachment', id: d.id });
  }
}
