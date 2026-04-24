import type { Aggregator } from '../aggregator.types';

/**
 * Active students enrolled this academic year. "Active" = Student.status =
 * 'active'. Archived / withdrawn / graduated students are excluded — the
 * DES / Tusla annual return expects the current enrolled roll only.
 *
 * Academic-year scoping: Student has no `academic_year_id` column, so we
 * scope by current-status plus tenant, which is consistent with the board
 * report and the rest of the product.
 */
export const studentHeadcountAggregator: Aggregator = async (tx, ctx) => {
  const count = await tx.student.count({
    where: {
      tenant_id: ctx.tenantId,
      status: 'active',
    },
  });

  return {
    value: count,
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
