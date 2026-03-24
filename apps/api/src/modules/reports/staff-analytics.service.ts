import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface HeadcountByDepartmentEntry {
  department: string;
  count: number;
  active_count: number;
}

export interface StaffStudentRatioResult {
  active_staff: number;
  active_students: number;
  ratio: string;
  students_per_teacher: number;
}

export interface TenureDistributionBucket {
  bucket_label: string;
  min_years: number;
  max_years: number;
  count: number;
  percentage: number;
}

export interface StaffAttendanceRateResult {
  total_records: number;
  present_count: number;
  absent_count: number;
  attendance_rate: number;
}

export interface QualificationCoverageEntry {
  subject_id: string;
  subject_name: string;
  has_qualified_teacher: boolean;
  teacher_count: number;
}

export interface CompensationDistributionBucket {
  bucket_label: string;
  min_salary: number;
  max_salary: number;
  count: number;
  percentage: number;
}

@Injectable()
export class StaffAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async headcountByDepartment(tenantId: string): Promise<HeadcountByDepartmentEntry[]> {
    const groups = await this.prisma.staffProfile.groupBy({
      by: ['department'],
      where: { tenant_id: tenantId },
      _count: true,
    });

    const activeGroups = await this.prisma.staffProfile.groupBy({
      by: ['department'],
      where: { tenant_id: tenantId, employment_status: 'active' },
      _count: true,
    });

    const activeMap = new Map(activeGroups.map((g) => [g.department, g._count]));

    return groups
      .filter((g) => g.department !== null)
      .map((g) => ({
        department: g.department ?? 'Unassigned',
        count: g._count,
        active_count: activeMap.get(g.department) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  async staffStudentRatio(tenantId: string): Promise<StaffStudentRatioResult> {
    const [activeStaff, activeStudents] = await Promise.all([
      this.prisma.staffProfile.count({
        where: { tenant_id: tenantId, employment_status: 'active' },
      }),
      this.prisma.student.count({
        where: { tenant_id: tenantId, status: 'active' },
      }),
    ]);

    const studentsPerTeacher = activeStaff > 0
      ? Number((activeStudents / activeStaff).toFixed(1))
      : 0;

    return {
      active_staff: activeStaff,
      active_students: activeStudents,
      ratio: `1:${studentsPerTeacher}`,
      students_per_teacher: studentsPerTeacher,
    };
  }

  async tenureDistribution(tenantId: string): Promise<TenureDistributionBucket[]> {
    // Use created_at as a proxy for join date (start of employment record)
    const staff = await this.prisma.staffProfile.findMany({
      where: { tenant_id: tenantId },
      select: { created_at: true },
    });

    const now = new Date();
    const buckets: TenureDistributionBucket[] = [
      { bucket_label: '< 1 year', min_years: 0, max_years: 1, count: 0, percentage: 0 },
      { bucket_label: '1-3 years', min_years: 1, max_years: 3, count: 0, percentage: 0 },
      { bucket_label: '3-5 years', min_years: 3, max_years: 5, count: 0, percentage: 0 },
      { bucket_label: '5-10 years', min_years: 5, max_years: 10, count: 0, percentage: 0 },
      { bucket_label: '10+ years', min_years: 10, max_years: 999, count: 0, percentage: 0 },
    ];

    for (const s of staff) {
      const yearsOfService = (now.getTime() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24 * 365);
      const bucket = buckets.find((b) => yearsOfService >= b.min_years && yearsOfService < b.max_years);
      if (bucket) bucket.count++;
    }

    const total = staff.length;
    return buckets.map((b) => ({
      ...b,
      percentage: total > 0 ? Number(((b.count / total) * 100).toFixed(2)) : 0,
    }));
  }

  async staffAttendanceRate(tenantId: string): Promise<StaffAttendanceRateResult> {
    const groups = await this.prisma.staffAttendanceRecord.groupBy({
      by: ['status'],
      where: { tenant_id: tenantId },
      _count: true,
    });

    const statusMap = new Map(groups.map((g) => [g.status, g._count]));

    const presentCount = (statusMap.get('present') ?? 0) +
      (statusMap.get('half_day') ?? 0) +
      (statusMap.get('paid_leave') ?? 0) +
      (statusMap.get('sick_leave') ?? 0);

    const absentCount = (statusMap.get('absent') ?? 0) + (statusMap.get('unpaid_leave') ?? 0);

    const totalRecords = groups.reduce((s, g) => s + g._count, 0);

    return {
      total_records: totalRecords,
      present_count: presentCount,
      absent_count: absentCount,
      attendance_rate: totalRecords > 0
        ? Number(((presentCount / totalRecords) * 100).toFixed(2))
        : 0,
    };
  }

  async qualificationCoverage(tenantId: string): Promise<QualificationCoverageEntry[]> {
    const subjects = await this.prisma.subject.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true },
    });

    const results: QualificationCoverageEntry[] = [];

    for (const subject of subjects) {
      // Find active classes for this subject
      const classes = await this.prisma.class.findMany({
        where: { tenant_id: tenantId, subject_id: subject.id, status: 'active' },
        select: { id: true },
      });

      const classIds = classes.map((c) => c.id);

      const teacherCount = classIds.length > 0
        ? await this.prisma.classStaff.count({
            where: {
              tenant_id: tenantId,
              class_id: { in: classIds },
              assignment_role: 'teacher',
            },
          })
        : 0;

      results.push({
        subject_id: subject.id,
        subject_name: subject.name,
        has_qualified_teacher: teacherCount > 0,
        teacher_count: teacherCount,
      });
    }

    return results.sort((a, b) => (a.has_qualified_teacher ? 0 : 1) - (b.has_qualified_teacher ? 0 : 1));
  }

  async compensationDistribution(tenantId: string): Promise<CompensationDistributionBucket[]> {
    const compensations = await this.prisma.staffCompensation.findMany({
      where: {
        tenant_id: tenantId,
        effective_to: null,
        compensation_type: 'salaried',
      },
      select: { base_salary: true },
    });

    if (compensations.length === 0) {
      return [];
    }

    const salaries = compensations.map((c) => Number(c.base_salary ?? 0)).filter((s) => s > 0);
    if (salaries.length === 0) return [];

    const minSalary = Math.min(...salaries);
    const maxSalary = Math.max(...salaries);
    const range = maxSalary - minSalary;
    const bucketSize = range > 0 ? range / 5 : 1000;

    const buckets: CompensationDistributionBucket[] = Array.from({ length: 5 }, (_, i) => ({
      bucket_label: `${Math.round(minSalary + i * bucketSize)}-${Math.round(minSalary + (i + 1) * bucketSize)}`,
      min_salary: minSalary + i * bucketSize,
      max_salary: minSalary + (i + 1) * bucketSize,
      count: 0,
      percentage: 0,
    }));

    for (const salary of salaries) {
      const bucketIdx = Math.min(
        buckets.length - 1,
        Math.floor((salary - minSalary) / bucketSize),
      );
      const bucket = buckets[bucketIdx];
      if (bucket) bucket.count++;
    }

    const total = salaries.length;
    return buckets.map((b) => ({
      ...b,
      percentage: total > 0 ? Number(((b.count / total) * 100).toFixed(2)) : 0,
    }));
  }
}
