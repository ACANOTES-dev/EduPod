import { Injectable } from '@nestjs/common';

import type { CoverReportQuery } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

export interface TeacherCoverStat {
  staff_profile_id: string;
  name: string;
  cover_count: number;
}

export interface CoverFairnessResult {
  mean: number;
  std_dev: number;
  coefficient_of_variation: number;
  fairness_grade: 'excellent' | 'good' | 'fair' | 'poor';
  teacher_stats: TeacherCoverStat[];
}

@Injectable()
export class CoverTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Get Cover Report ─────────────────────────────────────────────────────

  async getCoverReport(
    tenantId: string,
    query: CoverReportQuery,
  ): Promise<{
    from_date: string;
    to_date: string;
    total_substitutions: number;
    fairness_index: number;
    avg_cover_count: number;
    teachers: Array<{
      staff_profile_id: string;
      teacher_name: string;
      department: string | null;
      cover_count: number;
      total_periods: number;
      cover_pct: number;
    }>;
    by_department: Array<{ department: string; cover_count: number }>;
  }> {
    const records = await this.prisma.substitutionRecord.findMany({
      where: {
        tenant_id: tenantId,
        created_at: {
          gte: new Date(query.date_from),
          lte: new Date(query.date_to),
        },
      },
      select: {
        substitute_staff_id: true,
        substitute: {
          select: {
            department: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    const countMap = new Map<string, { name: string; department: string | null; count: number }>();

    for (const r of records) {
      const existing = countMap.get(r.substitute_staff_id);
      const name = `${r.substitute.user.first_name} ${r.substitute.user.last_name}`.trim();
      const department = r.substitute.department ?? null;
      if (existing) {
        existing.count += 1;
      } else {
        countMap.set(r.substitute_staff_id, { name, department, count: 1 });
      }
    }

    const totalSubs = records.length;
    const counts = Array.from(countMap.values()).map((v) => v.count);
    const mean = counts.length ? counts.reduce((a, c) => a + c, 0) / counts.length : 0;
    const variance = counts.length
      ? counts.reduce((a, c) => a + Math.pow(c - mean, 2), 0) / counts.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const fairnessIndex = mean > 0 ? stdDev / mean : 0;

    const teachers = Array.from(countMap.entries())
      .map(([staff_profile_id, { name, department, count }]) => ({
        staff_profile_id,
        teacher_name: name,
        department,
        cover_count: count,
        total_periods: totalSubs,
        cover_pct: totalSubs > 0 ? (count / totalSubs) * 100 : 0,
      }))
      .sort((a, b) => b.cover_count - a.cover_count);

    const deptMap = new Map<string, number>();
    for (const t of teachers) {
      const key = t.department ?? 'Unassigned';
      deptMap.set(key, (deptMap.get(key) ?? 0) + t.cover_count);
    }
    const byDepartment = Array.from(deptMap.entries())
      .map(([department, cover_count]) => ({ department, cover_count }))
      .sort((a, b) => b.cover_count - a.cover_count);

    return {
      from_date: query.date_from,
      to_date: query.date_to,
      total_substitutions: totalSubs,
      fairness_index: Math.round(fairnessIndex * 1000) / 1000,
      avg_cover_count: Math.round(mean * 100) / 100,
      teachers,
      by_department: byDepartment,
    };
  }

  // ─── Get Cover Fairness ───────────────────────────────────────────────────

  async getCoverFairness(tenantId: string, query: CoverReportQuery): Promise<CoverFairnessResult> {
    const report = await this.getCoverReport(tenantId, query);
    const stats: TeacherCoverStat[] = report.teachers.map((t) => ({
      staff_profile_id: t.staff_profile_id,
      name: t.teacher_name,
      cover_count: t.cover_count,
    }));

    if (stats.length === 0) {
      return {
        mean: 0,
        std_dev: 0,
        coefficient_of_variation: 0,
        fairness_grade: 'excellent',
        teacher_stats: [],
      };
    }

    const counts = stats.map((s) => s.cover_count);
    const mean = counts.reduce((acc, c) => acc + c, 0) / counts.length;
    const variance = counts.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;

    let fairnessGrade: 'excellent' | 'good' | 'fair' | 'poor';
    if (cv < 0.2) fairnessGrade = 'excellent';
    else if (cv < 0.4) fairnessGrade = 'good';
    else if (cv < 0.6) fairnessGrade = 'fair';
    else fairnessGrade = 'poor';

    return {
      mean: Math.round(mean * 100) / 100,
      std_dev: Math.round(stdDev * 100) / 100,
      coefficient_of_variation: Math.round(cv * 1000) / 1000,
      fairness_grade: fairnessGrade,
      teacher_stats: stats,
    };
  }

  // ─── Get Cover By Department ──────────────────────────────────────────────

  async getCoverByDepartment(
    tenantId: string,
    query: CoverReportQuery,
  ): Promise<{ data: Array<{ subject_name: string; cover_count: number }> }> {
    // Join through substitution_records → schedule → class → subject
    const records = await this.prisma.substitutionRecord.findMany({
      where: {
        tenant_id: tenantId,
        created_at: {
          gte: new Date(query.date_from),
          lte: new Date(query.date_to),
        },
      },
      select: {
        schedule: {
          select: {
            class_entity: {
              select: {
                subject: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const subjectMap = new Map<string, number>();

    for (const r of records) {
      const subjectName = r.schedule.class_entity?.subject?.name ?? 'Unknown';
      subjectMap.set(subjectName, (subjectMap.get(subjectName) ?? 0) + 1);
    }

    const data = [...subjectMap.entries()]
      .map(([subject_name, cover_count]) => ({ subject_name, cover_count }))
      .sort((a, b) => b.cover_count - a.cover_count);

    return { data };
  }
}
