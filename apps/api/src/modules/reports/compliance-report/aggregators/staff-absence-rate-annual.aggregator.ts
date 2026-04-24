import type { Aggregator } from '../aggregator.types';

/**
 * Staff absence rate = absent_records / total_records over the academic
 * year, from `staff_attendance_records`. "Absent" = any status other
 * than `present` (enum: present, absent, half_day, unpaid_leave,
 * paid_leave, sick_leave). Expressed as a percent.
 *
 * Gap when no records exist — reporting 0% to a regulator would be
 * read as "nobody was ever absent", which isn't what zero data means.
 */
export const staffAbsenceRateAnnualAggregator: Aggregator = async (tx, ctx) => {
  const grouped = await tx.staffAttendanceRecord.groupBy({
    by: ['status'],
    where: {
      tenant_id: ctx.tenantId,
      date: {
        gte: ctx.academicYear.start_date,
        lte: ctx.academicYear.end_date,
      },
    },
    _count: { _all: true },
  });

  const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
  if (total === 0) {
    return {
      value: null,
      has_gap: true,
      gap_reason: 'no_staff_attendance_records_in_academic_year',
      last_verified_at: new Date().toISOString(),
    };
  }

  const absent = grouped
    .filter((g) => g.status !== 'present')
    .reduce((sum, g) => sum + g._count._all, 0);

  return {
    value: Number(((absent / total) * 100).toFixed(2)),
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
