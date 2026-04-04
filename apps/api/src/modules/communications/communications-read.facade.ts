/**
 * CommunicationsReadFacade — Centralized read-only access to communications data.
 *
 * PURPOSE:
 * Other modules (compliance, reports, early-warning, engagement, pastoral)
 * query notification and announcement records for DSAR traversal, reporting,
 * engagement signal analysis, and cross-module data collection. This facade
 * provides a single entry point for those reads.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a single record is not found (callers decide whether to throw).
 * - Batch methods return arrays (empty = nothing found).
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface NotificationRow {
  id: string;
  tenant_id: string;
  recipient_user_id: string;
  channel: string;
  template_key: string | null;
  locale: string;
  status: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  created_at: Date;
  sent_at: Date | null;
  read_at: Date | null;
}

export interface NotificationMinimalRow {
  id: string;
  recipient_user_id: string;
  read_at: Date | null;
  created_at: Date;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class CommunicationsReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find notifications by source entity — used by DSAR traversal for student data.
   * Returns all notifications where source_entity_type and source_entity_id match.
   */
  async findNotificationsBySourceEntity(
    tenantId: string,
    sourceEntityType: string,
    sourceEntityId: string,
  ): Promise<NotificationRow[]> {
    return this.prisma.notification.findMany({
      where: {
        tenant_id: tenantId,
        source_entity_type: sourceEntityType,
        source_entity_id: sourceEntityId,
      },
      select: {
        id: true,
        tenant_id: true,
        recipient_user_id: true,
        channel: true,
        template_key: true,
        locale: true,
        status: true,
        source_entity_type: true,
        source_entity_id: true,
        created_at: true,
        sent_at: true,
        read_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Find notifications by recipient user ID — used by DSAR parent/staff data.
   * Returns all notifications sent to a specific user.
   */
  async findNotificationsByRecipient(
    tenantId: string,
    recipientUserId: string,
  ): Promise<NotificationRow[]> {
    return this.prisma.notification.findMany({
      where: {
        tenant_id: tenantId,
        recipient_user_id: recipientUserId,
      },
      select: {
        id: true,
        tenant_id: true,
        recipient_user_id: true,
        channel: true,
        template_key: true,
        locale: true,
        status: true,
        source_entity_type: true,
        source_entity_id: true,
        created_at: true,
        sent_at: true,
        read_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Count notifications before a cutoff date — used by retention policies.
   */
  async countNotificationsBeforeDate(tenantId: string, cutoffDate: Date): Promise<number> {
    return this.prisma.notification.count({
      where: {
        tenant_id: tenantId,
        created_at: { lt: cutoffDate },
      },
    });
  }

  /**
   * Find in-app notifications for multiple users since a date — used by
   * early-warning engagement signal collector to measure notification open rates.
   */
  async findInAppNotificationsForUsers(
    tenantId: string,
    userIds: string[],
    since: Date,
  ): Promise<NotificationMinimalRow[]> {
    if (userIds.length === 0) return [];

    return this.prisma.notification.findMany({
      where: {
        tenant_id: tenantId,
        recipient_user_id: { in: userIds },
        channel: 'in_app',
        created_at: { gte: since },
      },
      select: {
        id: true,
        recipient_user_id: true,
        read_at: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Generic reporting methods ──────────────────────────────────────────────

  /**
   * Generic findMany for notifications. Used by reports-data-access.
   */
  async findNotificationsGeneric(
    tenantId: string,
    where?: Prisma.NotificationWhereInput,
    select?: Prisma.NotificationSelect,
  ): Promise<unknown[]> {
    return this.prisma.notification.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
    });
  }
}
