import type { Aggregator } from '../aggregator.types';

/**
 * Total payments received this academic year, summed in tenant currency.
 * Only `posted` payments count (pending / failed / voided / refunded
 * excluded — regulators want the cash that actually cleared).
 */
export const feesCollectedYtdAggregator: Aggregator = async (tx, ctx) => {
  const result = await tx.payment.aggregate({
    where: {
      tenant_id: ctx.tenantId,
      status: 'posted',
      received_at: {
        gte: ctx.academicYear.start_date,
        lte: ctx.academicYear.end_date,
      },
    },
    _sum: { amount: true },
  });

  const sum = result._sum.amount;
  const value = sum === null ? 0 : Number(sum);

  return {
    value,
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
