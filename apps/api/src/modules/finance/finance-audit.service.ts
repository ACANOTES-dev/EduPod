import { Injectable } from '@nestjs/common';
import type { FinanceAuditQueryDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

const FINANCE_ENTITY_TYPES = [
  'invoice',
  'payment',
  'refund',
  'fee_structure',
  'fee_assignment',
  'discount',
  'credit_note',
  'late_fee',
  'scholarship',
  'payment_plan_request',
  'recurring_invoice_config',
];

@Injectable()
export class FinanceAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async getAuditTrail(tenantId: string, query: FinanceAuditQueryDto) {
    const { page, pageSize, entity_type, entity_id, search, date_from, date_to } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      entity_type: entity_type
        ? entity_type
        : { in: FINANCE_ENTITY_TYPES },
    };

    if (entity_id) {
      where.entity_id = entity_id;
    }

    if (date_from || date_to) {
      const dateFilter: Record<string, Date> = {};
      if (date_from) dateFilter.gte = new Date(date_from);
      if (date_to) dateFilter.lte = new Date(date_to);
      where.created_at = dateFilter;
    }

    if (search) {
      // Search by entity_id (UUID) or action containing the search term
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entity_type: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          actor: {
            select: { id: true, email: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }
}
