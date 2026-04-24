import type { Aggregator } from '../aggregator.types';

/**
 * Distinct calendar dates on which the school held at least one
 * attendance session this academic year. AttendanceSession is the best
 * proxy — if a session was registered for a class on that day, the
 * school was operating.
 */
export const schoolDaysHeldAggregator: Aggregator = async (tx, ctx) => {
  const rows = await tx.attendanceSession.findMany({
    where: {
      tenant_id: ctx.tenantId,
      session_date: {
        gte: ctx.academicYear.start_date,
        lte: ctx.academicYear.end_date,
      },
    },
    select: { session_date: true },
    distinct: ['session_date'],
  });

  return {
    value: rows.length,
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
