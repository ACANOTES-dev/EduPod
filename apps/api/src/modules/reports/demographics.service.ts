import { Injectable } from '@nestjs/common';

import { ReportsDataAccessService } from './reports-data-access.service';

// ─── Description keys (declared here for impl 22 translation sweep) ─────────
// reports.description.demographics =
//   "Breakdown of student population by nationality, gender, age, and
//    enrolment status."
// reports.description.demographics.year_group_trend =
//   "Year group size over time — month-by-month headcount including entries
//    and exits. Drill-down from the year-group-sizes view."
// ─────────────────────────────────────────────────────────────────────────────

export interface NationalityBreakdownEntry {
  nationality: string;
  count: number;
  percentage: number;
}

export interface GenderBalanceEntry {
  year_group_id: string;
  year_group_name: string;
  male_count: number;
  female_count: number;
  other_count: number;
  total: number;
}

export interface AgeDistributionBucket {
  age: number;
  count: number;
  percentage: number;
}

export interface YearGroupSizeEntry {
  year_group_id: string;
  year_group_name: string;
  student_count: number;
  active_count: number;
  capacity: number | null;
  capacity_utilisation: number | null;
}

export interface EnrolmentTrendDataPoint {
  month: string;
  new_enrolments: number;
  withdrawals: number;
  net_change: number;
}

export interface StatusDistributionEntry {
  status: string;
  count: number;
  percentage: number;
}

export interface YearGroupTrendDataPoint {
  month: string;
  total_students: number;
  new_entries: number;
  exits: number;
}

@Injectable()
export class DemographicsService {
  constructor(private readonly dataAccess: ReportsDataAccessService) {}

  async nationalityBreakdown(
    tenantId: string,
    yearGroupId?: string,
  ): Promise<NationalityBreakdownEntry[]> {
    const where: Record<string, unknown> = {
      status: 'active',
    };
    if (yearGroupId) where.year_group_id = yearGroupId;

    const groups = (await this.dataAccess.groupStudentsBy(
      tenantId,
      ['nationality'],
      where,
    )) as Array<{ nationality: string | null; _count: number }>;

    const total = groups.reduce((s, g) => s + g._count, 0);

    return groups
      .filter((g) => g.nationality !== null)
      .map((g) => ({
        nationality: g.nationality ?? 'Unknown',
        count: g._count,
        percentage: total > 0 ? Number(((g._count / total) * 100).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  async genderBalance(tenantId: string): Promise<GenderBalanceEntry[]> {
    const yearGroups = (await this.dataAccess.findYearGroups(tenantId, {
      id: true,
      name: true,
    })) as Array<{ id: string; name: string }>;

    const results: GenderBalanceEntry[] = [];

    for (const yg of yearGroups) {
      const genderGroups = (await this.dataAccess.groupStudentsBy(tenantId, ['gender'], {
        year_group_id: yg.id,
        status: 'active',
      })) as Array<{ gender: string; _count: number }>;

      const genderMap = new Map(genderGroups.map((g) => [g.gender, g._count]));
      const maleCount = genderMap.get('male') ?? 0;
      const femaleCount = genderMap.get('female') ?? 0;
      const otherCount = (genderMap.get('other') ?? 0) + (genderMap.get('prefer_not_to_say') ?? 0);
      const total = maleCount + femaleCount + otherCount;

      if (total === 0) continue;

      results.push({
        year_group_id: yg.id,
        year_group_name: yg.name,
        male_count: maleCount,
        female_count: femaleCount,
        other_count: otherCount,
        total,
      });
    }

    return results;
  }

  async ageDistribution(tenantId: string, yearGroupId?: string): Promise<AgeDistributionBucket[]> {
    // `date_of_birth` is non-nullable in the Student schema (DateTime @db.Date), so
    // a `{ not: null }` filter is invalid in Prisma 6 ("Argument `not` must not be null").
    // Filter at the application layer instead — defensive against bad data only.
    const where: Record<string, unknown> = {
      status: 'active',
    };
    if (yearGroupId) where.year_group_id = yearGroupId;

    const students = (await this.dataAccess.findStudents(tenantId, {
      where,
      select: { date_of_birth: true },
    })) as Array<{ date_of_birth: Date | null }>;

    const now = new Date();
    const ageMap = new Map<number, number>();

    for (const student of students) {
      if (!student.date_of_birth) continue;
      const dob = new Date(student.date_of_birth);
      let age = now.getFullYear() - dob.getFullYear();
      const monthDiff = now.getMonth() - dob.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
        age--;
      }
      ageMap.set(age, (ageMap.get(age) ?? 0) + 1);
    }

    const total = students.length;

    return Array.from(ageMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([age, count]) => ({
        age,
        count,
        percentage: total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0,
      }));
  }

  async yearGroupSizes(tenantId: string): Promise<YearGroupSizeEntry[]> {
    const yearGroups = (await this.dataAccess.findYearGroups(tenantId, {
      id: true,
      name: true,
    })) as Array<{ id: string; name: string }>;

    const results: YearGroupSizeEntry[] = [];

    for (const yg of yearGroups) {
      const [totalCount, activeCount] = await Promise.all([
        this.dataAccess.countStudents(tenantId, { year_group_id: yg.id }),
        this.dataAccess.countStudents(tenantId, { year_group_id: yg.id, status: 'active' }),
      ]);

      results.push({
        year_group_id: yg.id,
        year_group_name: yg.name,
        student_count: totalCount,
        active_count: activeCount,
        capacity: null,
        capacity_utilisation: null,
      });
    }

    return results;
  }

  async enrolmentTrends(tenantId: string): Promise<EnrolmentTrendDataPoint[]> {
    const students = (await this.dataAccess.findStudents(tenantId, {
      where: { entry_date: { not: null } },
      select: { entry_date: true, status: true, exit_date: true },
    })) as Array<{ entry_date: Date | null; status: string; exit_date: Date | null }>;

    const monthMap = new Map<string, { new_enrolments: number; withdrawals: number }>();

    for (const student of students) {
      if (student.entry_date) {
        const month = new Date(student.entry_date).toISOString().slice(0, 7);
        const entry = monthMap.get(month) ?? { new_enrolments: 0, withdrawals: 0 };
        entry.new_enrolments++;
        monthMap.set(month, entry);
      }
      if (student.exit_date) {
        const month = new Date(student.exit_date).toISOString().slice(0, 7);
        const entry = monthMap.get(month) ?? { new_enrolments: 0, withdrawals: 0 };
        entry.withdrawals++;
        monthMap.set(month, entry);
      }
    }

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stats]) => ({
        month,
        new_enrolments: stats.new_enrolments,
        withdrawals: stats.withdrawals,
        net_change: stats.new_enrolments - stats.withdrawals,
      }));
  }

  async statusDistribution(tenantId: string): Promise<StatusDistributionEntry[]> {
    const groups = (await this.dataAccess.groupStudentsBy(tenantId, ['status'])) as Array<{
      status: string;
      _count: number;
    }>;

    const total = groups.reduce((s, g) => s + g._count, 0);

    return groups.map((g) => ({
      status: g.status,
      count: g._count,
      percentage: total > 0 ? Number(((g._count / total) * 100).toFixed(2)) : 0,
    }));
  }

  /**
   * Month-over-month headcount for a single year group across the last
   * `months` months (default 12), with the count of new entries and exits per
   * month. The "total_students" column counts students considered enrolled on
   * the first day of each month — entry_date ≤ month AND (exit_date is null
   * OR exit_date > month). Used by the hub's drill-down into year-group
   * trends (Wave 4 impl 15).
   */
  async getEnrolmentTrendByYearGroup(
    tenantId: string,
    yearGroupId: string,
    months = 12,
  ): Promise<YearGroupTrendDataPoint[]> {
    const students = (await this.dataAccess.findStudents(tenantId, {
      where: { year_group_id: yearGroupId },
      select: { id: true, entry_date: true, exit_date: true },
    })) as Array<{ id: string; entry_date: Date | null; exit_date: Date | null }>;

    const now = new Date();
    const monthBuckets: Array<{ month: string; anchor: Date }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const anchor = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthBuckets.push({ month: anchor.toISOString().slice(0, 7), anchor });
    }

    return monthBuckets.map(({ month, anchor }) => {
      const nextMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
      let total = 0;
      let newEntries = 0;
      let exits = 0;

      for (const student of students) {
        const entry = student.entry_date ? new Date(student.entry_date) : null;
        const exit = student.exit_date ? new Date(student.exit_date) : null;

        if ((!entry || entry <= anchor) && (!exit || exit > anchor)) {
          total++;
        }
        if (entry && entry >= anchor && entry < nextMonth) {
          newEntries++;
        }
        if (exit && exit >= anchor && exit < nextMonth) {
          exits++;
        }
      }

      return { month, total_students: total, new_entries: newEntries, exits };
    });
  }
}
