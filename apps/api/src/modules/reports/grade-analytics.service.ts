import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface PassFailEntry {
  subject_id: string;
  subject_name: string;
  year_group_name: string | null;
  class_name: string | null;
  pass_count: number;
  fail_count: number;
  total_count: number;
  pass_rate: number;
}

export interface GradeDistributionBucket {
  bucket_label: string;
  min_score: number;
  max_score: number;
  count: number;
  percentage: number;
}

export interface StudentPerformanceEntry {
  student_id: string;
  student_name: string;
  year_group_name: string | null;
  average_score: number;
  grade_count: number;
}

export interface GradeTrendDataPoint {
  period_label: string;
  average_score: number;
  student_count: number;
}

export interface SubjectDifficultyEntry {
  subject_id: string;
  subject_name: string;
  average_score: number;
  student_count: number;
  difficulty_rank: number;
}

export interface GpaDistributionBucket {
  bucket_label: string;
  min_gpa: number;
  max_gpa: number;
  count: number;
  percentage: number;
}

@Injectable()
export class GradeAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async passFailRates(
    tenantId: string,
    yearGroupId?: string,
    subjectId?: string,
    academicPeriodId?: string,
  ): Promise<PassFailEntry[]> {
    // Determine pass threshold from grading scales or use 50% as default
    const PASS_THRESHOLD = 50;

    const assessmentWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      status: { in: ['closed', 'locked'] },
    };

    if (academicPeriodId) assessmentWhere.academic_period_id = academicPeriodId;
    if (subjectId) assessmentWhere.subject_id = subjectId;

    if (yearGroupId) {
      const classes = await this.prisma.class.findMany({
        where: { tenant_id: tenantId, year_group_id: yearGroupId },
        select: { id: true },
      });
      assessmentWhere.class_id = { in: classes.map((c) => c.id) };
    }

    const assessments = await this.prisma.assessment.findMany({
      where: assessmentWhere,
      select: {
        id: true,
        max_score: true,
        subject: { select: { id: true, name: true } },
        class_entity: {
          select: {
            name: true,
            year_group: { select: { name: true } },
          },
        },
      },
    });

    const results: PassFailEntry[] = [];
    const subjectMap = new Map<string, PassFailEntry>();

    for (const assessment of assessments) {
      if (!assessment.subject) continue;

      const grades = await this.prisma.grade.findMany({
        where: {
          tenant_id: tenantId,
          assessment_id: assessment.id,
          is_missing: false,
          raw_score: { not: null },
        },
        select: { raw_score: true },
      });

      const maxScore = Number(assessment.max_score);
      const subjectKey = assessment.subject.id;

      let entry = subjectMap.get(subjectKey);
      if (!entry) {
        entry = {
          subject_id: assessment.subject.id,
          subject_name: assessment.subject.name,
          year_group_name: assessment.class_entity?.year_group?.name ?? null,
          class_name: assessment.class_entity?.name ?? null,
          pass_count: 0,
          fail_count: 0,
          total_count: 0,
          pass_rate: 0,
        };
        subjectMap.set(subjectKey, entry);
      }

      for (const grade of grades) {
        const score = Number(grade.raw_score);
        const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
        entry.total_count++;
        if (percentage >= PASS_THRESHOLD) {
          entry.pass_count++;
        } else {
          entry.fail_count++;
        }
      }
    }

    for (const entry of subjectMap.values()) {
      entry.pass_rate = entry.total_count > 0
        ? Number(((entry.pass_count / entry.total_count) * 100).toFixed(2))
        : 0;
      results.push(entry);
    }

    return results.sort((a, b) => b.pass_rate - a.pass_rate);
  }

  async gradeDistribution(
    tenantId: string,
    yearGroupId?: string,
    subjectId?: string,
    academicPeriodId?: string,
  ): Promise<GradeDistributionBucket[]> {
    const gradeWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      is_missing: false,
      raw_score: { not: null },
    };

    if (subjectId) {
      gradeWhere.assessment = { subject_id: subjectId };
    }

    if (academicPeriodId) {
      gradeWhere.assessment = {
        ...(gradeWhere.assessment as Record<string, unknown>),
        academic_period_id: academicPeriodId,
      };
    }

    if (yearGroupId) {
      const classes = await this.prisma.class.findMany({
        where: { tenant_id: tenantId, year_group_id: yearGroupId },
        select: { id: true },
      });
      gradeWhere.assessment = {
        ...(gradeWhere.assessment as Record<string, unknown> | undefined),
        class_id: { in: classes.map((c) => c.id) },
      };
    }

    const grades = await this.prisma.grade.findMany({
      where: gradeWhere,
      select: {
        raw_score: true,
        assessment: { select: { max_score: true } },
      },
    });

    // Build percentage buckets: 0-10, 10-20, ..., 90-100
    const buckets: number[] = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const counts = new Array<number>(buckets.length - 1).fill(0);

    for (const grade of grades) {
      const maxScore = Number(grade.assessment.max_score);
      if (maxScore <= 0) continue;
      const pct = Math.min(100, (Number(grade.raw_score) / maxScore) * 100);
      const bucketIdx = Math.min(counts.length - 1, Math.floor(pct / 10));
      const current = counts[bucketIdx];
      if (current !== undefined) counts[bucketIdx] = current + 1;
    }

    const total = counts.reduce((s, c) => s + c, 0);

    return counts.map((count, i) => ({
      bucket_label: `${buckets[i]}-${buckets[i + 1]}%`,
      min_score: buckets[i] ?? 0,
      max_score: buckets[i + 1] ?? 100,
      count,
      percentage: total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0,
    }));
  }

  async topBottomPerformers(
    tenantId: string,
    limit = 10,
    yearGroupId?: string,
    subjectId?: string,
  ): Promise<{ top: StudentPerformanceEntry[]; bottom: StudentPerformanceEntry[] }> {
    const gradeWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      is_missing: false,
      raw_score: { not: null },
    };

    if (subjectId) {
      gradeWhere.assessment = { subject_id: subjectId };
    }

    let studentIdFilter: { in: string[] } | undefined;
    if (yearGroupId) {
      const students = await this.prisma.student.findMany({
        where: { tenant_id: tenantId, year_group_id: yearGroupId },
        select: { id: true },
      });
      studentIdFilter = { in: students.map((s) => s.id) };
      gradeWhere.student_id = studentIdFilter;
    }

    const gradeGroups = await this.prisma.grade.groupBy({
      by: ['student_id'],
      where: gradeWhere,
      _avg: { raw_score: true },
      _count: true,
    });

    const studentIds = gradeGroups.map((g) => g.student_id);
    if (studentIds.length === 0) return { top: [], bottom: [] };

    const students = await this.prisma.student.findMany({
      where: { tenant_id: tenantId, id: { in: studentIds } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        year_group: { select: { name: true } },
      },
    });

    const studentNameMap = new Map(
      students.map((s) => [s.id, { name: `${s.first_name} ${s.last_name}`, yearGroup: s.year_group?.name ?? null }]),
    );

    const sorted = gradeGroups
      .map((g) => ({
        student_id: g.student_id,
        student_name: studentNameMap.get(g.student_id)?.name ?? 'Unknown',
        year_group_name: studentNameMap.get(g.student_id)?.yearGroup ?? null,
        average_score: Number(Number(g._avg.raw_score ?? 0).toFixed(2)),
        grade_count: g._count,
      }))
      .sort((a, b) => b.average_score - a.average_score);

    return {
      top: sorted.slice(0, limit),
      bottom: sorted.slice(-limit).reverse(),
    };
  }

  async gradeTrends(
    tenantId: string,
    yearGroupId?: string,
    subjectId?: string,
  ): Promise<GradeTrendDataPoint[]> {
    // Group period grade snapshots by period
    const snapshotWhere: Record<string, unknown> = {
      tenant_id: tenantId,
    };

    if (yearGroupId) {
      const students = await this.prisma.student.findMany({
        where: { tenant_id: tenantId, year_group_id: yearGroupId },
        select: { id: true },
      });
      snapshotWhere.student_id = { in: students.map((s) => s.id) };
    }

    if (subjectId) {
      snapshotWhere.subject_id = subjectId;
    }

    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: snapshotWhere,
      select: {
        computed_value: true,
        student_id: true,
        academic_period_id: true,
      },
      orderBy: { created_at: 'asc' },
    });

    // Collect all unique academic_period_ids and fetch period names
    const periodIds = [...new Set(snapshots.map((s) => s.academic_period_id))];
    const periods = await this.prisma.academicPeriod.findMany({
      where: { id: { in: periodIds } },
      select: { id: true, name: true },
    });
    const periodNameMap = new Map(periods.map((p) => [p.id, p.name]));

    // Group by period
    const periodMap = new Map<string, { total: number; sum: number; students: Set<string> }>();

    for (const snap of snapshots) {
      const periodName = periodNameMap.get(snap.academic_period_id) ?? snap.academic_period_id;
      const entry = periodMap.get(periodName) ?? { total: 0, sum: 0, students: new Set() };
      entry.sum += Number(snap.computed_value);
      entry.total++;
      entry.students.add(snap.student_id);
      periodMap.set(periodName, entry);
    }

    return Array.from(periodMap.entries()).map(([label, stats]) => ({
      period_label: label,
      average_score: stats.total > 0 ? Number((stats.sum / stats.total).toFixed(2)) : 0,
      student_count: stats.students.size,
    }));
  }

  async subjectDifficulty(
    tenantId: string,
    yearGroupId?: string,
  ): Promise<SubjectDifficultyEntry[]> {
    const gradeWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      is_missing: false,
      raw_score: { not: null },
      assessment: { status: { in: ['closed', 'locked'] } },
    };

    if (yearGroupId) {
      const classes = await this.prisma.class.findMany({
        where: { tenant_id: tenantId, year_group_id: yearGroupId },
        select: { id: true },
      });
      (gradeWhere.assessment as Record<string, unknown>).class_id = { in: classes.map((c) => c.id) };
    }

    // Group by subject via assessment
    const grades = await this.prisma.grade.findMany({
      where: gradeWhere,
      select: {
        raw_score: true,
        student_id: true,
        assessment: {
          select: {
            max_score: true,
            subject: { select: { id: true, name: true } },
          },
        },
      },
    });

    const subjectMap = new Map<string, { name: string; scores: number[]; students: Set<string> }>();

    for (const grade of grades) {
      const subject = grade.assessment.subject;
      if (!subject) continue;

      const maxScore = Number(grade.assessment.max_score);
      if (maxScore <= 0) continue;

      const pct = (Number(grade.raw_score) / maxScore) * 100;
      const entry = subjectMap.get(subject.id) ?? { name: subject.name, scores: [], students: new Set() };
      entry.scores.push(pct);
      entry.students.add(grade.student_id);
      subjectMap.set(subject.id, entry);
    }

    const results: SubjectDifficultyEntry[] = Array.from(subjectMap.entries())
      .map(([id, data]) => ({
        subject_id: id,
        subject_name: data.name,
        average_score: data.scores.length > 0
          ? Number((data.scores.reduce((s, x) => s + x, 0) / data.scores.length).toFixed(2))
          : 0,
        student_count: data.students.size,
        difficulty_rank: 0,
      }))
      .sort((a, b) => a.average_score - b.average_score);

    return results.map((entry, i) => ({ ...entry, difficulty_rank: i + 1 }));
  }

  async gpaDistribution(tenantId: string, yearGroupId?: string): Promise<GpaDistributionBucket[]> {
    const snapshotWhere: Record<string, unknown> = {
      tenant_id: tenantId,
    };

    if (yearGroupId) {
      const students = await this.prisma.student.findMany({
        where: { tenant_id: tenantId, year_group_id: yearGroupId },
        select: { id: true },
      });
      snapshotWhere.student_id = { in: students.map((s) => s.id) };
    }

    const snapshots = await this.prisma.gpaSnapshot.findMany({
      where: snapshotWhere,
      select: { gpa_value: true },
    });

    // GPA buckets: 0-1, 1-2, 2-3, 3-4 (standard 4.0 scale)
    const buckets: GpaDistributionBucket[] = [
      { bucket_label: '0.0-1.0', min_gpa: 0, max_gpa: 1, count: 0, percentage: 0 },
      { bucket_label: '1.0-2.0', min_gpa: 1, max_gpa: 2, count: 0, percentage: 0 },
      { bucket_label: '2.0-3.0', min_gpa: 2, max_gpa: 3, count: 0, percentage: 0 },
      { bucket_label: '3.0-4.0', min_gpa: 3, max_gpa: 4, count: 0, percentage: 0 },
    ];

    for (const snap of snapshots) {
      const gpa = Number(snap.gpa_value ?? 0);
      const bucket = buckets.find((b) => gpa >= b.min_gpa && gpa < b.max_gpa) ?? buckets[buckets.length - 1];
      if (bucket) bucket.count++;
    }

    const total = buckets.reduce((s, b) => s + b.count, 0);
    return buckets.map((b) => ({
      ...b,
      percentage: total > 0 ? Number(((b.count / total) * 100).toFixed(2)) : 0,
    }));
  }
}
