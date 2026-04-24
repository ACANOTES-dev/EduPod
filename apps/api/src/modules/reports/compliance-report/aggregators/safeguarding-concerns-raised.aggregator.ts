import type { Aggregator } from '../aggregator.types';

/**
 * Count of `safeguarding_concern` rows created within the academic year.
 * Matches the Children First Act §11 annual-return metric "number of
 * concerns raised" — counts opened concerns, not resolutions.
 */
export const safeguardingConcernsRaisedAggregator: Aggregator = async (tx, ctx) => {
  const count = await tx.safeguardingConcern.count({
    where: {
      tenant_id: ctx.tenantId,
      created_at: {
        gte: ctx.academicYear.start_date,
        lte: ctx.academicYear.end_date,
      },
    },
  });

  return {
    value: count,
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
