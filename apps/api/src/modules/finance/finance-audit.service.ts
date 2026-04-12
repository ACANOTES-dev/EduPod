import { Injectable } from '@nestjs/common';

import type { FinanceAuditQueryDto } from '@school/shared';

import { AuditLogReadFacade } from '../audit-log/audit-log-read.facade';
import { PrismaService } from '../prisma/prisma.service';

// Entity types recorded by AuditLogInterceptor when parsing URLs of the form
// /v1/finance/{resource}. These are kebab-cased because that's how they appear
// in the URL; the interceptor now preserves that casing verbatim.
const FINANCE_ENTITY_TYPES = [
  'invoices',
  'invoice',
  'payments',
  'payment',
  'refunds',
  'refund',
  'fee-structures',
  'fee_structure',
  'fee-assignments',
  'fee_assignment',
  'fee-types',
  'fee_type',
  'discounts',
  'discount',
  'credit-notes',
  'credit_note',
  'late-fee-configs',
  'late_fee',
  'scholarships',
  'scholarship',
  'payment-plans',
  'payment_plan_request',
  'recurring-configs',
  'recurring_invoice_config',
  'fee-generation',
  'reports',
  'receipts',
  'receipt',
  'allocations',
  'bulk',
  'reminders',
];

@Injectable()
export class FinanceAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogReadFacade: AuditLogReadFacade,
  ) {}

  async getAuditTrail(tenantId: string, query: FinanceAuditQueryDto) {
    const { page, pageSize, entity_type, entity_id, search, date_from, date_to } = query;
    const skip = (page - 1) * pageSize;

    const filterOptions = {
      entityType: entity_type ?? undefined,
      entityTypes: entity_type ? undefined : FINANCE_ENTITY_TYPES,
      entityId: entity_id ?? undefined,
      search: search ?? undefined,
      dateFrom: date_from ? new Date(date_from) : undefined,
      dateTo: date_to ? new Date(date_to) : undefined,
    };

    const [data, total] = await Promise.all([
      this.auditLogReadFacade.findManyWithActor(tenantId, {
        ...filterOptions,
        skip,
        take: pageSize,
      }),
      this.auditLogReadFacade.countWithFilters(tenantId, filterOptions),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }
}
