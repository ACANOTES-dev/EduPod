import type { Aggregator } from '../aggregator.types';

/**
 * Current outstanding balance across all invoices for this tenant —
 * sum of `invoices.balance_amount` for rows still owing. Balance is
 * kept up to date as payments are allocated. Zero is the honest answer
 * when nothing is owed; not a gap.
 */
export const outstandingBalanceTotalAggregator: Aggregator = async (tx, ctx) => {
  const result = await tx.invoice.aggregate({
    where: {
      tenant_id: ctx.tenantId,
      balance_amount: { gt: 0 },
    },
    _sum: { balance_amount: true },
  });

  const sum = result._sum.balance_amount;
  return {
    value: sum === null ? 0 : Number(sum),
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
