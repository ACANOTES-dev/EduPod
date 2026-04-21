import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

export interface AcknowledgementListQuery {
  incident_id?: string;
  sanction_id?: string;
  amendment_notice_id?: string;
  parent_id?: string;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'acknowledged';
  page: number;
  pageSize: number;
}

/**
 * Append-only read surface over `behaviour_parent_acknowledgements`.
 * Rows are inserted (never mutated) as delivery progresses through
 * sent → delivered → read → acknowledged. The acknowledge action on
 * the parent portal is the only permitted mutator.
 */
@Injectable()
export class BehaviourAcknowledgementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: AcknowledgementListQuery) {
    const where: Prisma.BehaviourParentAcknowledgementWhereInput = {
      tenant_id: tenantId,
    };

    if (query.incident_id) where.incident_id = query.incident_id;
    if (query.sanction_id) where.sanction_id = query.sanction_id;
    if (query.amendment_notice_id) where.amendment_notice_id = query.amendment_notice_id;
    if (query.parent_id) where.parent_id = query.parent_id;

    if (query.status) {
      switch (query.status) {
        case 'pending':
        case 'sent':
          where.acknowledged_at = null;
          where.read_at = null;
          where.delivered_at = null;
          break;
        case 'delivered':
          where.acknowledged_at = null;
          where.read_at = null;
          where.delivered_at = { not: null };
          break;
        case 'read':
          where.acknowledged_at = null;
          where.read_at = { not: null };
          break;
        case 'acknowledged':
          where.acknowledged_at = { not: null };
          break;
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.behaviourParentAcknowledgement.findMany({
        where,
        orderBy: { sent_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          parent: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourParentAcknowledgement.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        incident_id: row.incident_id,
        sanction_id: row.sanction_id,
        amendment_notice_id: row.amendment_notice_id,
        parent_id: row.parent_id,
        parent_name: row.parent ? `${row.parent.first_name} ${row.parent.last_name}`.trim() : null,
        channel: row.channel as $Enums.AcknowledgementChannel | null,
        sent_at: row.sent_at.toISOString(),
        delivered_at: row.delivered_at?.toISOString() ?? null,
        read_at: row.read_at?.toISOString() ?? null,
        acknowledged_at: row.acknowledged_at?.toISOString() ?? null,
        acknowledgement_method: row.acknowledgement_method as $Enums.AcknowledgementMethod | null,
        status: deriveStatus(row),
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getById(tenantId: string, id: string) {
    const row = await this.prisma.behaviourParentAcknowledgement.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        parent: {
          select: { id: true, first_name: true, last_name: true },
        },
        amendment_notice: {
          select: { id: true, amendment_type: true, change_reason: true },
        },
      },
    });

    if (!row) {
      throw new NotFoundException({
        code: 'ACKNOWLEDGEMENT_NOT_FOUND',
        message: `Acknowledgement with id "${id}" not found`,
      });
    }

    return {
      data: {
        id: row.id,
        incident_id: row.incident_id,
        sanction_id: row.sanction_id,
        amendment_notice_id: row.amendment_notice_id,
        amendment_notice: row.amendment_notice,
        parent_id: row.parent_id,
        parent: row.parent,
        channel: row.channel,
        sent_at: row.sent_at.toISOString(),
        delivered_at: row.delivered_at?.toISOString() ?? null,
        read_at: row.read_at?.toISOString() ?? null,
        acknowledged_at: row.acknowledged_at?.toISOString() ?? null,
        acknowledgement_method: row.acknowledgement_method,
        status: deriveStatus(row),
      },
    };
  }

  /**
   * Stamps `read_at` on an acknowledgement the first time the owning parent
   * opens the incident that holds it. Idempotent: subsequent calls return the
   * existing row untouched. Identity check forbids a user marking another
   * parent's acknowledgement as read.
   */
  async markAsRead(tenantId: string, id: string, currentUserId: string) {
    const row = await this.prisma.behaviourParentAcknowledgement.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        parent: { select: { id: true, user_id: true } },
      },
    });

    if (!row) {
      throw new NotFoundException({
        code: 'ACKNOWLEDGEMENT_NOT_FOUND',
        message: `Acknowledgement with id "${id}" not found`,
      });
    }

    if (row.parent?.user_id !== currentUserId) {
      throw new ForbiddenException({
        code: 'ACKNOWLEDGEMENT_NOT_YOURS',
        message: 'This acknowledgement belongs to a different parent',
      });
    }

    if (row.read_at) {
      return {
        data: {
          id: row.id,
          read_at: row.read_at.toISOString(),
          already_read: true,
        },
      };
    }

    const now = new Date();
    const updated = await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(
      async (tx) => {
        return tx.behaviourParentAcknowledgement.update({
          where: { id },
          data: { read_at: now },
          select: { id: true, read_at: true },
        });
      },
    );

    return {
      data: {
        id: updated.id,
        read_at: updated.read_at?.toISOString() ?? null,
        already_read: false,
      },
    };
  }
}

function deriveStatus(row: {
  acknowledged_at: Date | null;
  read_at: Date | null;
  delivered_at: Date | null;
  sent_at: Date;
}): 'sent' | 'delivered' | 'read' | 'acknowledged' {
  if (row.acknowledged_at) return 'acknowledged';
  if (row.read_at) return 'read';
  if (row.delivered_at) return 'delivered';
  return 'sent';
}
