import type { Aggregator } from '../aggregator.types';

/**
 * Critical-incident declarations made during the academic year. Uses the
 * dedicated `critical_incident` table (richer than behaviour-incident
 * severity filtering — it carries scope, response plan, status).
 */
export const criticalIncidentsThisYearAggregator: Aggregator = async (tx, ctx) => {
  const count = await tx.criticalIncident.count({
    where: {
      tenant_id: ctx.tenantId,
      declared_at: {
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
