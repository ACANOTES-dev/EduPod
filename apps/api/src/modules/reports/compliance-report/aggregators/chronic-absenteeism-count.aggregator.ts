import type { Aggregator } from '../aggregator.types';

const CHRONIC_ABSENTEEISM_THRESHOLD_PERCENT = 80;

/**
 * Students with attendance rate < 80% across the academic year. Computes
 * per-student (present+late) / total from AttendanceRecord rows in the
 * year, then counts students below the threshold. Students with zero
 * attendance records this year are excluded (they either haven't started
 * or already left — counting them would be misleading).
 */
export const chronicAbsenteeismCountAggregator: Aggregator = async (tx, ctx) => {
  const grouped = await tx.attendanceRecord.groupBy({
    by: ['student_id', 'status'],
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

  const perStudent = new Map<string, { presentLike: number; total: number }>();
  for (const row of grouped) {
    const entry = perStudent.get(row.student_id) ?? { presentLike: 0, total: 0 };
    entry.total += row._count._all;
    if (row.status === 'present' || row.status === 'late') {
      entry.presentLike += row._count._all;
    }
    perStudent.set(row.student_id, entry);
  }

  let count = 0;
  for (const { presentLike, total } of perStudent.values()) {
    if (total === 0) continue;
    const ratePercent = (presentLike / total) * 100;
    if (ratePercent < CHRONIC_ABSENTEEISM_THRESHOLD_PERCENT) count += 1;
  }

  return {
    value: count,
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
