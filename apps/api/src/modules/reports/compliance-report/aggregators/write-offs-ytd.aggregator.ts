import type { Aggregator } from '../aggregator.types';

/**
 * Total write-off amount this academic year. Sums `invoices.write_off_amount`
 * over invoices whose `updated_at` lands in the academic-year window
 * (no dedicated `written_off_at`, so `updated_at` after the write-off
 * flag was set is the best proxy). Tenants with no write-offs return 0.
 */
export const writeOffsYtdAggregator: Aggregator = async (tx, ctx) => {
  const result = await tx.invoice.aggregate({
    where: {
      tenant_id: ctx.tenantId,
      write_off_amount: { gt: 0 },
      updated_at: {
        gte: ctx.academicYear.start_date,
        lte: ctx.academicYear.end_date,
      },
    },
    _sum: { write_off_amount: true },
  });

  const sum = result._sum.write_off_amount;
  return {
    value: sum === null ? 0 : Number(sum),
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
