import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { pastoralEventPayloadMap } from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PastoralEventInput {
  tenant_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  student_id: string | null;
  actor_user_id: string;
  tier: number;
  payload: Record<string, unknown>;
  ip_address: string | null;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class PastoralEventService {
  private readonly logger = new Logger(PastoralEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Core immutable audit event writer. INSERT-only into pastoral_events.
   * Non-blocking: wraps INSERT in try/catch, logs errors, NEVER throws to caller.
   */
  async write(event: PastoralEventInput): Promise<void> {
    try {
      // 1. Validate payload against the Zod schema for this event_type
      const schema =
        pastoralEventPayloadMap[event.event_type as keyof typeof pastoralEventPayloadMap];

      if (!schema) {
        this.logger.error(`Unknown pastoral event type: ${event.event_type} — discarding event`);
        return;
      }

      const result = schema.safeParse(event.payload);

      if (!result.success) {
        this.logger.error(
          `Payload validation failed for event_type=${event.event_type}: ${result.error.message}`,
        );
        return;
      }

      // 2. Create RLS-scoped client
      const rlsClient = createRlsClient(this.prisma, {
        tenant_id: event.tenant_id,
        user_id: event.actor_user_id,
      });

      // 3. Insert within interactive transaction
      await rlsClient.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        await db.pastoralEvent.create({
          data: {
            tenant_id: event.tenant_id,
            event_type: event.event_type,
            entity_type: event.entity_type,
            entity_id: event.entity_id,
            student_id: event.student_id ?? undefined,
            actor_user_id: event.actor_user_id,
            tier: event.tier,
            payload: event.payload as Prisma.InputJsonValue,
            ip_address: event.ip_address,
          },
        });
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to write pastoral event: event_type=${event.event_type} entity_type=${event.entity_type} entity_id=${event.entity_id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Get all pastoral events for a student, ordered by created_at DESC.
   * RLS handles tier filtering automatically.
   */
  async getStudentChronology(
    tenantId: string,
    userId: string,
    studentId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    data: {
      id: string;
      event_type: string;
      entity_type: string;
      entity_id: string;
      student_id: string | null;
      actor_user_id: string;
      tier: number;
      payload: Prisma.JsonValue;
      ip_address: string | null;
      created_at: Date;
    }[];
    meta: PaginationMeta;
  }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const skip = (page - 1) * pageSize;

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [data, total] = await Promise.all([
        db.pastoralEvent.findMany({
          where: { tenant_id: tenantId, student_id: studentId },
          orderBy: { created_at: 'desc' },
          skip,
          take: pageSize,
        }),
        db.pastoralEvent.count({
          where: { tenant_id: tenantId, student_id: studentId },
        }),
      ]);

      return { data, meta: { page, pageSize, total } };
    }) as Promise<{
      data: {
        id: string;
        event_type: string;
        entity_type: string;
        entity_id: string;
        student_id: string | null;
        actor_user_id: string;
        tier: number;
        payload: Prisma.JsonValue;
        ip_address: string | null;
        created_at: Date;
      }[];
      meta: PaginationMeta;
    }>;
  }

  /**
   * Get all events for a specific entity (e.g., all events for concern X).
   */
  async getEntityHistory(
    tenantId: string,
    userId: string,
    entityType: string,
    entityId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    data: {
      id: string;
      event_type: string;
      entity_type: string;
      entity_id: string;
      student_id: string | null;
      actor_user_id: string;
      tier: number;
      payload: Prisma.JsonValue;
      ip_address: string | null;
      created_at: Date;
    }[];
    meta: PaginationMeta;
  }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const skip = (page - 1) * pageSize;

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [data, total] = await Promise.all([
        db.pastoralEvent.findMany({
          where: {
            tenant_id: tenantId,
            entity_type: entityType,
            entity_id: entityId,
          },
          orderBy: { created_at: 'desc' },
          skip,
          take: pageSize,
        }),
        db.pastoralEvent.count({
          where: {
            tenant_id: tenantId,
            entity_type: entityType,
            entity_id: entityId,
          },
        }),
      ]);

      return { data, meta: { page, pageSize, total } };
    }) as Promise<{
      data: {
        id: string;
        event_type: string;
        entity_type: string;
        entity_id: string;
        student_id: string | null;
        actor_user_id: string;
        tier: number;
        payload: Prisma.JsonValue;
        ip_address: string | null;
        created_at: Date;
      }[];
      meta: PaginationMeta;
    }>;
  }
}
