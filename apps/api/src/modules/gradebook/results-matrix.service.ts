import { Injectable } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { WeightConfigService } from './weight-config.service';

// ─── Types ───────────────────────────────────────────────────────────────

interface MatrixStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
}

interface MatrixCategory {
  category_id: string;
  category_name: string;
}

interface MatrixSubject {
  id: string;
  name: string;
  code: string | null;
  categories: MatrixCategory[];
}

interface CategoryCell {
  /** Pooled percentage (0-100) or null if no assessments contributed. */
  percentage: number | null;
  /** How many individual assessments contributed to this cell. */
  assessment_count: number;
}

export interface ResultsMatrixResponse {
  students: MatrixStudent[];
  subjects: MatrixSubject[];
  /** cells[student_id][subject_id][category_id] */
  cells: Record<string, Record<string, Record<string, CategoryCell>>>;
}

interface BatchGradeInput {
  student_id: string;
  assessment_id: string;
  raw_score: number | null;
  is_missing: boolean;
}

interface AssessmentBucket {
  subjectId: string;
  categoryId: string;
  periodId: string;
  assessments: Array<{ id: string; max_score: number }>;
}

// ─── Service ─────────────────────────────────────────────────────────────

@Injectable()
export class ResultsMatrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly weightConfigService: WeightConfigService,
  ) {}

  /**
   * Fetch the results matrix for a class, pooling assessments by category.
   *
   * Per-period view (academicPeriodId set): each cell is the pooled percentage
   * (Σ raw_score / Σ max_score) for all graded assessments in that (subject,
   * category) within the period.
   *
   * All-periods view (academicPeriodId omitted): each (subject, category)
   * percentage is pooled per period first, then combined across periods using
   * the class's period weights (class-level → year-group → equal fallback).
   * Periods without data are dropped and remaining weights renormalise.
   */
  async getMatrix(
    tenantId: string,
    classId: string,
    academicPeriodId?: string,
  ): Promise<ResultsMatrixResponse> {
    // 1. Verify the class exists and grab its academic year (needed for period weights)
    await this.classesReadFacade.existsOrThrow(tenantId, classId);

    const classRows = (await this.classesReadFacade.findClassesGeneric(
      tenantId,
      { id: classId },
      { academic_year_id: true },
    )) as Array<{ academic_year_id: string }>;
    const academicYearId = classRows[0]?.academic_year_id ?? null;

    // 2. Actively enrolled students (ordered by last_name)
    const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
      tenantId,
      { class_id: classId, status: 'active' },
      {
        id: true,
        class_id: true,
        student_id: true,
        status: true,
        start_date: true,
        end_date: true,
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
          },
        },
      },
      { student: { last_name: 'asc' } },
    )) as Array<{
      student: {
        id: string;
        first_name: string;
        last_name: string;
        student_number: string | null;
      };
    }>;

    const students: MatrixStudent[] = enrolments.map((e) => ({
      id: e.student.id,
      first_name: e.student.first_name,
      last_name: e.student.last_name,
      student_number: e.student.student_number,
    }));

    const studentIds = students.map((s) => s.id);

    // 3. Active assessments for this class (optionally filtered by period)
    const assessments = await this.prisma.assessment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        ...(academicPeriodId ? { academic_period_id: academicPeriodId } : {}),
        status: { notIn: ['draft', 'closed'] },
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ subject: { name: 'asc' } }, { category: { name: 'asc' } }, { title: 'asc' }],
    });

    // 4. Build subject → category skeleton and bucket assessments by
    //    (subject, category, period) for pooling.
    const subjectOrder: string[] = [];
    const subjectMeta = new Map<string, { name: string; code: string | null }>();
    const categoriesBySubject = new Map<string, string[]>();
    const categoryNames = new Map<string, string>();
    const buckets = new Map<string, AssessmentBucket>();

    for (const a of assessments) {
      const subjectId = a.subject.id;
      const categoryId = a.category.id;

      if (!subjectMeta.has(subjectId)) {
        subjectMeta.set(subjectId, { name: a.subject.name, code: a.subject.code });
        subjectOrder.push(subjectId);
      }
      categoryNames.set(categoryId, a.category.name);

      const catList = categoriesBySubject.get(subjectId) ?? [];
      if (!catList.includes(categoryId)) {
        catList.push(categoryId);
        categoriesBySubject.set(subjectId, catList);
      }

      const bucketKey = `${subjectId}::${categoryId}::${a.academic_period_id}`;
      const existing = buckets.get(bucketKey);
      if (existing) {
        existing.assessments.push({ id: a.id, max_score: Number(a.max_score) });
      } else {
        buckets.set(bucketKey, {
          subjectId,
          categoryId,
          periodId: a.academic_period_id,
          assessments: [{ id: a.id, max_score: Number(a.max_score) }],
        });
      }
    }

    const subjects: MatrixSubject[] = subjectOrder.map((subjectId) => {
      const meta = subjectMeta.get(subjectId)!;
      const categoryIds = (categoriesBySubject.get(subjectId) ?? [])
        .slice()
        .sort((a, b) => (categoryNames.get(a) ?? '').localeCompare(categoryNames.get(b) ?? ''));
      return {
        id: subjectId,
        name: meta.name,
        code: meta.code,
        categories: categoryIds.map((categoryId) => ({
          category_id: categoryId,
          category_name: categoryNames.get(categoryId) ?? '',
        })),
      };
    });

    // Index buckets by (subject, category) for fast lookup when building cells
    const bucketsBySubjectCategory = new Map<string, AssessmentBucket[]>();
    for (const bucket of buckets.values()) {
      const key = `${bucket.subjectId}::${bucket.categoryId}`;
      const list = bucketsBySubjectCategory.get(key);
      if (list) {
        list.push(bucket);
      } else {
        bucketsBySubjectCategory.set(key, [bucket]);
      }
    }

    // 5. Fetch all grades for these assessments and students in one query
    const assessmentIds = assessments.map((a) => a.id);
    const allGrades =
      assessmentIds.length > 0 && studentIds.length > 0
        ? await this.prisma.grade.findMany({
            where: {
              tenant_id: tenantId,
              assessment_id: { in: assessmentIds },
              student_id: { in: studentIds },
            },
            select: {
              student_id: true,
              assessment_id: true,
              raw_score: true,
              is_missing: true,
            },
          })
        : [];

    // gradesByAssessment[assessmentId][studentId] = raw_score (null if ungraded)
    const gradesByAssessment = new Map<string, Map<string, number | null>>();
    for (const g of allGrades) {
      let inner = gradesByAssessment.get(g.assessment_id);
      if (!inner) {
        inner = new Map<string, number | null>();
        gradesByAssessment.set(g.assessment_id, inner);
      }
      inner.set(g.student_id, g.raw_score != null ? Number(g.raw_score) : null);
    }

    // 6. Resolve period weights when rendering the all-periods view
    let periodWeights: Map<string, number> | null = null;
    if (!academicPeriodId && academicYearId) {
      periodWeights = await this.weightConfigService.resolvePeriodWeightsForClass(
        tenantId,
        classId,
        academicYearId,
      );
    }
    const hasExplicitPeriodWeights = !!(periodWeights && periodWeights.size > 0);
    const resolvePeriodWeight = (periodId: string): number => {
      if (!hasExplicitPeriodWeights) return 1; // equal fallback
      return periodWeights!.get(periodId) ?? 0;
    };

    // 7. Build cells — pool by category, then combine across periods if needed
    const cells: Record<string, Record<string, Record<string, CategoryCell>>> = {};

    for (const student of students) {
      const studentCells: Record<string, Record<string, CategoryCell>> = {};
      cells[student.id] = studentCells;

      for (const subject of subjects) {
        const subjectCells: Record<string, CategoryCell> = {};
        studentCells[subject.id] = subjectCells;

        for (const category of subject.categories) {
          const categoryBuckets =
            bucketsBySubjectCategory.get(`${subject.id}::${category.category_id}`) ?? [];

          if (academicPeriodId) {
            // Per-period view: pool points across all assessments in the category
            let rawSum = 0;
            let maxSum = 0;
            let count = 0;
            for (const bucket of categoryBuckets) {
              for (const a of bucket.assessments) {
                const raw = gradesByAssessment.get(a.id)?.get(student.id) ?? null;
                if (raw != null) {
                  rawSum += raw;
                  maxSum += a.max_score;
                  count += 1;
                }
              }
            }
            subjectCells[category.category_id] = {
              percentage: maxSum > 0 ? (rawSum / maxSum) * 100 : null,
              assessment_count: count,
            };
          } else {
            // All-periods: pool per period, then combine with period weights
            let weightedSum = 0;
            let weightUsed = 0;
            let count = 0;
            for (const bucket of categoryBuckets) {
              let rawSum = 0;
              let maxSum = 0;
              let localCount = 0;
              for (const a of bucket.assessments) {
                const raw = gradesByAssessment.get(a.id)?.get(student.id) ?? null;
                if (raw != null) {
                  rawSum += raw;
                  maxSum += a.max_score;
                  localCount += 1;
                }
              }
              if (maxSum > 0) {
                const pct = (rawSum / maxSum) * 100;
                const weight = resolvePeriodWeight(bucket.periodId);
                if (weight > 0) {
                  weightedSum += pct * weight;
                  weightUsed += weight;
                  count += localCount;
                }
              }
            }
            subjectCells[category.category_id] = {
              percentage: weightUsed > 0 ? weightedSum / weightUsed : null,
              assessment_count: count,
            };
          }
        }
      }
    }

    return { students, subjects, cells };
  }

  /**
   * Batch save grades from the results matrix.
   * Only saves changed cells — the frontend tracks dirty state.
   *
   * Note: the current Results tab is read-only, but this method is kept as a
   * stable API surface in case the editable grid is reintroduced.
   */
  async saveMatrix(
    tenantId: string,
    classId: string,
    userId: string,
    grades: BatchGradeInput[],
  ): Promise<{ saved: number }> {
    if (grades.length === 0) return { saved: 0 };

    // Verify all assessment IDs belong to this class
    const assessmentIds = [...new Set(grades.map((g) => g.assessment_id))];
    const validAssessments = await this.prisma.assessment.findMany({
      where: {
        tenant_id: tenantId,
        id: { in: assessmentIds },
        class_id: classId,
        status: { in: ['draft', 'open', 'reopened'] },
      },
      select: { id: true, max_score: true },
    });

    const validAssessmentMap = new Map(validAssessments.map((a) => [a.id, Number(a.max_score)]));

    // Filter out grades for invalid/locked assessments
    const validGrades = grades.filter((g) => validAssessmentMap.has(g.assessment_id));
    if (validGrades.length === 0) return { saved: 0 };

    // Verify all students are enrolled in this class
    const studentIds = [...new Set(validGrades.map((g) => g.student_id))];
    const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
      tenantId,
      { class_id: classId, student_id: { in: studentIds }, status: 'active' },
      { student_id: true },
    )) as Array<{ student_id: string }>;
    const enrolledStudentIds = new Set(enrolments.map((e) => e.student_id));

    const enrolledGrades = validGrades.filter((g) => enrolledStudentIds.has(g.student_id));

    // Upsert within RLS transaction
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const now = new Date();

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      for (const g of enrolledGrades) {
        const maxScore = validAssessmentMap.get(g.assessment_id)!;
        const clampedScore =
          g.raw_score != null ? Math.min(Math.max(0, g.raw_score), maxScore) : null;

        await db.grade.upsert({
          where: {
            idx_grades_unique: {
              tenant_id: tenantId,
              assessment_id: g.assessment_id,
              student_id: g.student_id,
            },
          },
          update: {
            raw_score: clampedScore,
            is_missing: g.is_missing,
            entered_at: clampedScore != null ? now : undefined,
          },
          create: {
            tenant_id: tenantId,
            assessment_id: g.assessment_id,
            student_id: g.student_id,
            raw_score: clampedScore,
            is_missing: g.is_missing,
            entered_by_user_id: userId,
            entered_at: clampedScore != null ? now : null,
          },
        });
      }
    });

    return { saved: enrolledGrades.length };
  }
}
