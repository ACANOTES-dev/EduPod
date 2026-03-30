import { Injectable } from '@nestjs/common';

import { ReportsDataAccessService } from './reports-data-access.service';

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
    const where: Record<string, unknown> = {
      status: 'active',
      date_of_birth: { not: null },
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
}
