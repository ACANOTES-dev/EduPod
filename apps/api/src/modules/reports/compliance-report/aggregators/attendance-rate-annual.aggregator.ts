import type { Aggregator } from '../aggregator.types';

/**
 * Annual attendance rate = (present + late) / (present + late + absent_*)
 * over every AttendanceRecord whose session is in the academic-year date
 * range.
 *
 * A tenant with no attendance records yet yields `has_gap: true` — a 0%
 * number on the regulatory return would be worse than honestly saying
 * "we have no data".
 */
export const attendanceRateAnnualAggregator: Aggregator = async (tx, ctx) => {
  const grouped = await tx.attendanceRecord.groupBy({
    by: ['status'],
    where: {
      tenant_id: ctx.tenantId,
      session: {
        session_date: {
          gte: ctx.academicYear.start_date,
          lte: ctx.academicYear.end_date,
        },
      },
    },
    _count: { _all: true },
  });

  const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
  if (total === 0) {
    return {
      value: null,
      has_gap: true,
      gap_reason: 'no_attendance_records_in_academic_year',
      last_verified_at: new Date().toISOString(),
    };
  }

  const presentCount = grouped
    .filter((g) => g.status === 'present' || g.status === 'late')
    .reduce((sum, g) => sum + g._count._all, 0);

  const percent = Number(((presentCount / total) * 100).toFixed(2));

  return {
    value: percent,
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
