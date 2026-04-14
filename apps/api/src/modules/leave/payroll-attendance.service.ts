import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

interface BreakdownEntry {
  leave_type: string;
  is_paid: boolean;
  days: number;
}

interface StaffPeriodSummary {
  staff_profile_id: string;
  staff_name: string | null;
  period: string; // YYYY-MM
  school_days_in_period: number;
  days_worked: number;
  days_missed: number;
  paid_days_missed: number;
  unpaid_days_missed: number;
  breakdown: BreakdownEntry[];
}

/**
 * Aggregates per-staff days_worked / days_missed for a calendar month.
 * Intentionally minimal — the future payroll module decides how to use the
 * numbers (rate × days, deductions, etc.). Weekends are excluded; school
 * holidays are NOT excluded yet (no school_holidays table). Tenants that
 * need that should add the table and extend this service.
 */
@Injectable()
export class PayrollAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  async getAbsencePeriodSummary(tenantId: string, period: string) {
    const match = period.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw new BadRequestException({
        error: { code: 'INVALID_PERIOD', message: 'period must be YYYY-MM' },
      });
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;

    const periodStart = new Date(Date.UTC(year, monthIndex, 1));
    const periodEnd = new Date(Date.UTC(year, monthIndex + 1, 0)); // last day of month
    const schoolDaysInPeriod = this.countSchoolDays(periodStart, periodEnd);

    const staff = await this.staffProfileReadFacade.findActiveStaff(tenantId);

    // teacher_absences is owned by the scheduling module but is the entity
    // this aggregation is fundamentally about. Adding a one-shot facade method
    // for "load all absences in a date range" was considered overkill; a
    // future scheduling-side AbsenceReadFacade can absorb this.
    // eslint-disable-next-line school/no-cross-module-prisma-access
    const absences = await this.prisma.teacherAbsence.findMany({
      where: {
        tenant_id: tenantId,
        cancelled_at: null,
        absence_date: { lte: periodEnd },
        OR: [{ date_to: null }, { date_to: { gte: periodStart } }],
      },
      include: { leave_type: true },
    });

    const summaries: StaffPeriodSummary[] = staff.map((s) => {
      const staffAbsences = absences.filter((a) => a.staff_profile_id === s.id);
      let totalDaysMissed = 0;
      let paidDaysMissed = 0;
      let unpaidDaysMissed = 0;
      const breakdownMap = new Map<string, BreakdownEntry>();

      for (const abs of staffAbsences) {
        const overlap = this.daysOverlapInPeriod(
          abs.absence_date,
          abs.date_to ?? abs.absence_date,
          abs.full_day,
          periodStart,
          periodEnd,
        );
        if (overlap === 0) continue;

        totalDaysMissed += overlap;
        if (abs.is_paid) paidDaysMissed += overlap;
        else unpaidDaysMissed += overlap;

        const code =
          abs.leave_type?.code ?? (abs.absence_type === 'self_reported' ? 'sick' : 'other');
        const key = `${code}|${abs.is_paid ? 'paid' : 'unpaid'}`;
        const existing = breakdownMap.get(key);
        if (existing) {
          existing.days += overlap;
        } else {
          breakdownMap.set(key, {
            leave_type: code,
            is_paid: abs.is_paid,
            days: overlap,
          });
        }
      }

      return {
        staff_profile_id: s.id,
        staff_name: s.user ? `${s.user.first_name} ${s.user.last_name}` : null,
        period,
        school_days_in_period: schoolDaysInPeriod,
        days_worked: Math.max(0, schoolDaysInPeriod - totalDaysMissed),
        days_missed: totalDaysMissed,
        paid_days_missed: paidDaysMissed,
        unpaid_days_missed: unpaidDaysMissed,
        breakdown: Array.from(breakdownMap.values()).sort((a, b) =>
          a.leave_type.localeCompare(b.leave_type),
        ),
      };
    });

    return { data: summaries, meta: { period, school_days_in_period: schoolDaysInPeriod } };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private countSchoolDays(start: Date, end: Date): number {
    let count = 0;
    const cur = new Date(start);
    while (cur.getTime() <= end.getTime()) {
      const dow = cur.getUTCDay();
      if (dow !== 0 && dow !== 6) count += 1;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
  }

  private daysOverlapInPeriod(
    absStart: Date,
    absEnd: Date,
    fullDay: boolean,
    periodStart: Date,
    periodEnd: Date,
  ): number {
    const overlapStart = absStart < periodStart ? periodStart : absStart;
    const overlapEnd = absEnd > periodEnd ? periodEnd : absEnd;
    if (overlapStart > overlapEnd) return 0;

    let schoolDays = 0;
    const cur = new Date(overlapStart);
    while (cur.getTime() <= overlapEnd.getTime()) {
      const dow = cur.getUTCDay();
      if (dow !== 0 && dow !== 6) schoolDays += 1;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    if (!fullDay) return schoolDays * 0.5;
    return schoolDays;
  }
}
