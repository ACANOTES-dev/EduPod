import type { Aggregator } from '../aggregator.types';

/**
 * Formal behaviour exclusions declared this academic year. Source:
 * `behaviour_exclusion_case` rows created within the academic-year date
 * window. Status-agnostic because regulators want the number of
 * disciplinary events opened during the year, not the number resolved.
 */
export const exclusionsThisYearAggregator: Aggregator = async (tx, ctx) => {
  const count = await tx.behaviourExclusionCase.count({
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
