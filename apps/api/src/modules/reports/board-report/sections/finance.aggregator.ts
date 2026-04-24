import { Injectable } from '@nestjs/common';

import type { FinanceSection } from '@school/shared/reports';

import type {
  FinanceAggregator,
  PrismaTransaction,
  ResolvedTerm,
  SectionAggregatorOptions,
} from './section-aggregator.types';
import { round, toNumber } from './section-aggregator.types';

/**
 * Finance aggregator.
 *
 * Reports the term's invoicing activity, using `Invoice.issue_date` as
 * the term-window filter. Collection rate = (total_invoiced −
 * outstanding) / total_invoiced. Write-offs are invoices with
 * `status='written_off'`; the overdue bucket is invoices past their
 * `due_date` with `balance_amount > 0`.
 *
 * Prisma's Decimal is coerced to plain number via `toNumber` — monetary
 * precision is preserved at the stored scale (NUMERIC(12,2)) and the
 * API contract uses plain `number` for cheap JSON roundtrip.
 */
@Injectable()
export class FinanceSectionAggregator implements FinanceAggregator {
  readonly key = 'finance' as const;

  async aggregate(
    tx: PrismaTransaction,
    tenantId: string,
    term: ResolvedTerm,
    _options: SectionAggregatorOptions,
  ): Promise<FinanceSection> {
    const issuedInTerm = {
      tenant_id: tenantId,
      issue_date: { gte: term.term_start, lte: term.term_end },
    };

    const [termAgg, overdueAgg, writeOffAgg, sampleInvoice] = await Promise.all([
      tx.invoice.aggregate({
        where: issuedInTerm,
        _count: { _all: true },
        _sum: { total_amount: true, balance_amount: true },
      }),
      tx.invoice.aggregate({
        where: {
          ...issuedInTerm,
          due_date: { lt: new Date() },
          balance_amount: { gt: 0 },
        },
        _count: { _all: true },
        _sum: { balance_amount: true },
      }),
      tx.invoice.aggregate({
        where: { ...issuedInTerm, status: 'written_off' },
        _count: { _all: true },
        _sum: { write_off_amount: true },
      }),
      tx.invoice.findFirst({
        where: { tenant_id: tenantId },
        select: { currency_code: true },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const totalInvoiced = toNumber(termAgg._sum.total_amount);
    const outstanding = toNumber(termAgg._sum.balance_amount);
    const collected = Math.max(totalInvoiced - outstanding, 0);
    const collectionRatePct = totalInvoiced > 0 ? round((collected / totalInvoiced) * 100, 1) : 0;

    return {
      type: 'finance',
      invoices_issued_count: termAgg._count._all,
      total_invoiced_amount: round(totalInvoiced, 2),
      total_collected_amount: round(collected, 2),
      collection_rate_pct: collectionRatePct,
      overdue_count: overdueAgg._count._all,
      overdue_amount: round(toNumber(overdueAgg._sum.balance_amount), 2),
      write_off_count: writeOffAgg._count._all,
      write_off_amount: round(toNumber(writeOffAgg._sum.write_off_amount), 2),
      currency_code: sampleInvoice?.currency_code ?? 'GBP',
    };
  }
}
