import { Injectable, Logger } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GradeDistributionResult {
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  passRate: number;
  count: number;
  histogram: HistogramBucket[];
}

export interface HistogramBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

export interface StudentTrendPoint {
  assessment_id: string;
  title: string;
  due_date: string | null;
  raw_score: number | null;
  max_score: number;
  percentage: number | null;
}

export interface ClassTrendPoint {
  assessment_id: string;
  title: string;
  due_date: string | null;
  average: number;
  count: number;
}

export interface TeacherConsistencyEntry {
  teacher_id: string;
  teacher_name: string;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  average: number;
  pass_rate: number;
  stddev: number;
  count: number;
  flagged: boolean;
}

export interface BenchmarkEntry {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  academic_period_id: string;
  period_name: string;
  average: number;
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: Decimal | null | undefined): number | null {
  if (v == null) return null;
  return Number(v);
}

function computeDistribution(
  scores: number[],
  maxScore: number,
  passingThreshold: number,
): GradeDistributionResult {
  if (scores.length === 0) {
    return {
      mean: 0,
      median: 0,
      stddev: 0,
      min: 0,
      max: 0,
      passRate: 0,
      count: 0,
      histogram: buildHistogramBuckets([], maxScore),
    };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = scores.reduce((s, v) => s + v, 0) / n;
  const median =
    n % 2 === 0
      ? ((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2
      : (sorted[Math.floor(n / 2)] ?? 0);
  const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  const passCount = scores.filter((s) => s >= passingThreshold).length;

  return {
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
    min: sorted[0] ?? 0,
    max: sorted[n - 1] ?? 0,
    passRate: Math.round((passCount / n) * 10000) / 100,
    count: n,
    histogram: buildHistogramBuckets(scores, maxScore),
  };
}

function buildHistogramBuckets(scores: number[], maxScore: number): HistogramBucket[] {
  const bucketCount = 10;
  const bucketSize = maxScore / bucketCount;
  const buckets: HistogramBucket[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const min = i * bucketSize;
    const max = (i + 1) * bucketSize;
    const count = scores.filter(
      (s) => s >= min && (i === bucketCount - 1 ? s <= max : s < max),
    ).length;
    buckets.push({
      label: `${Math.round(min)}-${Math.round(max)}`,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      count,
    });
  }

  return buckets;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  // ─── A2: Grade Distribution per Assessment ──────────────────────────────

  async getGradeDistribution(
    tenantId: string,
    assessmentId: string,
  ): Promise<GradeDistributionResult> {
    const cacheKey = `analytics:distribution:${tenantId}:${assessmentId}`;
    const client = this.redis.getClient();

    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as GradeDistributionResult;
    }

    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, tenant_id: tenantId },
      select: {
        id: true,
        max_score: true,
        category: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!assessment) {
      return {
        mean: 0,
        median: 0,
        stddev: 0,
        min: 0,
        max: 0,
        passRate: 0,
        count: 0,
        histogram: [],
      };
    }

    const grades = await this.prisma.grade.findMany({
      where: {
        tenant_id: tenantId,
        assessment_id: assessmentId,
        raw_score: { not: null },
        is_missing: false,
      },
      select: { raw_score: true },
    });

    const scores = grades.map((g) => toNum(g.raw_score)).filter((s): s is number => s !== null);

    const maxScore = Number(assessment.max_score);
    // Default pass threshold: 50% of max score
    const passingThreshold = maxScore * 0.5;

    const result = computeDistribution(scores, maxScore, passingThreshold);

    await client.set(cacheKey, JSON.stringify(result), 'EX', this.CACHE_TTL);

    return result;
  }

  // ─── A2: Period Distribution ─────────────────────────────────────────────

  async getPeriodDistribution(
    tenantId: string,
    classId: string,
    subjectId: string,
    periodId: string,
  ): Promise<GradeDistributionResult> {
    const cacheKey = `analytics:period:${tenantId}:${classId}:${subjectId}:${periodId}`;
    const client = this.redis.getClient();

    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as GradeDistributionResult;
    }

    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        subject_id: subjectId,
        academic_period_id: periodId,
      },
      select: { computed_value: true },
    });

    const scores = snapshots
      .map((s) => toNum(s.computed_value))
      .filter((s): s is number => s !== null);

    // Period grades are percentages (0–100)
    const result = computeDistribution(scores, 100, 50);

    await client.set(cacheKey, JSON.stringify(result), 'EX', this.CACHE_TTL);

    return result;
  }

  // ─── A1: Student Trend ───────────────────────────────────────────────────

  async getStudentTrend(
    tenantId: string,
    studentId: string,
    subjectId?: string,
  ): Promise<StudentTrendPoint[]> {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      student_id: studentId,
      raw_score: { not: null },
      is_missing: false,
    };

    const grades = await this.prisma.grade.findMany({
      where,
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            due_date: true,
            max_score: true,
            subject_id: true,
            subject: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { assessment: { due_date: 'asc' } },
    });

    const filtered = subjectId
      ? grades.filter((g) => g.assessment.subject_id === subjectId)
      : grades;

    return filtered.map((g) => {
      const rawScore = toNum(g.raw_score);
      const maxScore = Number(g.assessment.max_score);
      const percentage =
        rawScore !== null && maxScore > 0 ? Math.round((rawScore / maxScore) * 10000) / 100 : null;

      return {
        assessment_id: g.assessment.id,
        title: g.assessment.title,
        due_date: g.assessment.due_date ? g.assessment.due_date.toISOString().slice(0, 10) : null,
        raw_score: rawScore,
        max_score: maxScore,
        percentage,
      };
    });
  }

  // ─── A1: Class Trend ─────────────────────────────────────────────────────

  async getClassTrend(
    tenantId: string,
    classId: string,
    subjectId: string,
    periodId?: string,
  ): Promise<ClassTrendPoint[]> {
    const assessmentWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      class_id: classId,
      subject_id: subjectId,
    };
    if (periodId) {
      assessmentWhere.academic_period_id = periodId;
    }

    const assessments = await this.prisma.assessment.findMany({
      where: assessmentWhere,
      select: {
        id: true,
        title: true,
        due_date: true,
        max_score: true,
        grades: {
          where: {
            raw_score: { not: null },
            is_missing: false,
          },
          select: { raw_score: true },
        },
      },
      orderBy: { due_date: 'asc' },
    });

    return assessments.map((a) => {
      const scores = a.grades.map((g) => toNum(g.raw_score)).filter((s): s is number => s !== null);

      const maxScore = Number(a.max_score);
      const average =
        scores.length > 0
          ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length / maxScore) * 10000) / 100
          : 0;

      return {
        assessment_id: a.id,
        title: a.title,
        due_date: a.due_date ? a.due_date.toISOString().slice(0, 10) : null,
        average,
        count: scores.length,
      };
    });
  }

  // ─── A3: Teacher Grading Consistency ────────────────────────────────────

  async getTeacherConsistency(
    tenantId: string,
    subjectId?: string,
    yearGroupId?: string,
  ): Promise<TeacherConsistencyEntry[]> {
    const cacheKey = `analytics:consistency:${tenantId}:${subjectId ?? 'all'}:${yearGroupId ?? 'all'}`;
    const client = this.redis.getClient();

    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as TeacherConsistencyEntry[];
    }

    // Get classes taught by teachers, optionally filtered by subject/year group
    const classStaffList = (await this.classesReadFacade.findClassStaffGeneric(
      tenantId,
      undefined,
      {
        class_id: true,
        staff_profile_id: true,
        class_entity: {
          select: {
            id: true,
            name: true,
            year_group_id: true,
          },
        },
        staff_profile: {
          select: {
            id: true,
            user: { select: { id: true, first_name: true, last_name: true } },
          },
        },
      },
    )) as Array<{
      class_id: string;
      staff_profile_id: string;
      class_entity: { id: string; name: string; year_group_id: string | null };
      staff_profile: { id: string; user: { id: string; first_name: string; last_name: string } };
    }>;

    // Filter by year group if specified
    const filteredClassStaff = yearGroupId
      ? classStaffList.filter((cs) => cs.class_entity.year_group_id === yearGroupId)
      : classStaffList;

    // For each class-teacher, get grades for all assessments in that class
    const entries: TeacherConsistencyEntry[] = [];

    for (const cs of filteredClassStaff) {
      const assessments = await this.prisma.assessment.findMany({
        where: {
          tenant_id: tenantId,
          class_id: cs.class_id,
          ...(subjectId ? { subject_id: subjectId } : {}),
        },
        select: {
          subject_id: true,
          subject: { select: { id: true, name: true } },
          max_score: true,
          grades: {
            where: { raw_score: { not: null }, is_missing: false },
            select: { raw_score: true },
          },
        },
      });

      if (assessments.length === 0) continue;

      // Group by subject
      const subjectMap = new Map<
        string,
        {
          subjectName: string;
          scores: number[];
          maxScores: number[];
        }
      >();

      for (const a of assessments) {
        if (!subjectMap.has(a.subject_id)) {
          subjectMap.set(a.subject_id, {
            subjectName: a.subject.name,
            scores: [],
            maxScores: [],
          });
        }
        const entry = subjectMap.get(a.subject_id);
        if (!entry) continue;
        const max = Number(a.max_score);
        for (const g of a.grades) {
          const score = toNum(g.raw_score);
          if (score !== null) {
            entry.scores.push((score / max) * 100);
            entry.maxScores.push(max);
          }
        }
      }

      for (const [sid, data] of subjectMap.entries()) {
        if (data.scores.length === 0) continue;

        const n = data.scores.length;
        const avg = data.scores.reduce((s, v) => s + v, 0) / n;
        const passCount = data.scores.filter((s) => s >= 50).length;
        const passRate = (passCount / n) * 100;
        const variance = data.scores.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
        const stddev = Math.sqrt(variance);

        entries.push({
          teacher_id: cs.staff_profile.id,
          teacher_name: `${cs.staff_profile.user.first_name} ${cs.staff_profile.user.last_name}`,
          class_id: cs.class_id,
          class_name: cs.class_entity.name,
          subject_id: sid,
          subject_name: data.subjectName,
          average: Math.round(avg * 100) / 100,
          pass_rate: Math.round(passRate * 100) / 100,
          stddev: Math.round(stddev * 100) / 100,
          count: n,
          flagged: false, // computed below
        });
      }
    }

    // Flag teachers with unusual deviations (>15% from subject mean)
    const subjectAverages = new Map<string, number[]>();
    for (const e of entries) {
      if (!subjectAverages.has(e.subject_id)) {
        subjectAverages.set(e.subject_id, []);
      }
      subjectAverages.get(e.subject_id)?.push(e.average);
    }

    for (const e of entries) {
      const avgs = subjectAverages.get(e.subject_id);
      if (!avgs || avgs.length < 2) continue;
      const subjectMean = avgs.reduce((s, v) => s + v, 0) / avgs.length;
      e.flagged = Math.abs(e.average - subjectMean) > 15;
    }

    await client.set(cacheKey, JSON.stringify(entries), 'EX', this.CACHE_TTL);

    return entries;
  }

  // ─── A4: Benchmarking ────────────────────────────────────────────────────

  async getBenchmark(
    tenantId: string,
    yearGroupId: string,
    subjectId?: string,
    periodId?: string,
  ): Promise<BenchmarkEntry[]> {
    const cacheKey = `analytics:benchmark:${tenantId}:${yearGroupId}:${subjectId ?? 'all'}:${periodId ?? 'all'}`;
    const client = this.redis.getClient();

    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as BenchmarkEntry[];
    }

    // Get classes in year group
    const classes = await this.classesReadFacade.findByYearGroup(tenantId, yearGroupId);

    if (classes.length === 0) {
      return [];
    }

    const snapshotWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      class_id: { in: classes.map((c) => c.id) },
    };
    if (subjectId) snapshotWhere.subject_id = subjectId;
    if (periodId) snapshotWhere.academic_period_id = periodId;

    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: snapshotWhere,
      select: {
        class_id: true,
        subject_id: true,
        academic_period_id: true,
        computed_value: true,
        subject: { select: { name: true } },
        academic_period: { select: { name: true } },
      },
    });

    // Group by class × subject × period
    const groupKey = (s: { class_id: string; subject_id: string; academic_period_id: string }) =>
      `${s.class_id}|${s.subject_id}|${s.academic_period_id}`;

    const groupMap = new Map<
      string,
      {
        classId: string;
        subjectId: string;
        periodId: string;
        subjectName: string;
        periodName: string;
        scores: number[];
      }
    >();

    for (const snap of snapshots) {
      const k = groupKey(snap);
      if (!groupMap.has(k)) {
        groupMap.set(k, {
          classId: snap.class_id,
          subjectId: snap.subject_id,
          periodId: snap.academic_period_id,
          subjectName: snap.subject.name,
          periodName: snap.academic_period.name,
          scores: [],
        });
      }
      const score = toNum(snap.computed_value);
      if (score !== null) {
        groupMap.get(k)?.scores.push(score);
      }
    }

    const classMap = new Map(classes.map((c) => [c.id, c.name]));

    const entries: BenchmarkEntry[] = [];
    for (const [, group] of groupMap.entries()) {
      const n = group.scores.length;
      if (n === 0) continue;
      const avg = group.scores.reduce((s, v) => s + v, 0) / n;
      entries.push({
        class_id: group.classId,
        class_name: classMap.get(group.classId) ?? '',
        subject_id: group.subjectId,
        subject_name: group.subjectName,
        academic_period_id: group.periodId,
        period_name: group.periodName,
        average: Math.round(avg * 100) / 100,
        count: n,
      });
    }

    await client.set(cacheKey, JSON.stringify(entries), 'EX', this.CACHE_TTL);

    return entries;
  }

  // ─── Cache Invalidation ──────────────────────────────────────────────────

  /**
   * Invalidate analytics cache for an assessment (called after grade save).
   * Best-effort: errors are logged but not re-thrown.
   */
  async invalidateAssessmentCache(tenantId: string, assessmentId: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      await client.del(`analytics:distribution:${tenantId}:${assessmentId}`);
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate analytics cache for assessment ${assessmentId}: ${String(err)}`,
      );
    }
  }
}
