import { Injectable } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ───────────────────────────────────────────────────────────────

interface MatrixStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
}

interface MatrixAssessment {
  id: string;
  title: string;
  category_name: string;
  max_score: number;
  status: string;
}

interface MatrixSubject {
  id: string;
  name: string;
  code: string | null;
  assessments: MatrixAssessment[];
}

interface GradeEntry {
  raw_score: number | null;
  is_missing: boolean;
}

export interface ResultsMatrixResponse {
  students: MatrixStudent[];
  subjects: MatrixSubject[];
  grades: Record<string, Record<string, GradeEntry>>;
}

interface BatchGradeInput {
  student_id: string;
  assessment_id: string;
  raw_score: number | null;
  is_missing: boolean;
}

// ─── Service ─────────────────────────────────────────────────────────────

@Injectable()
export class ResultsMatrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}
  /**
   * Fetch the full results matrix for a class in a given academic period.
   * Returns students × subjects × assessments with all grades.
   */
  async getMatrix(
    tenantId: string,
    classId: string,
    academicPeriodId: string,
  ): Promise<ResultsMatrixResponse> {
    // 1. Verify the class exists
    await this.classesReadFacade.existsOrThrow(tenantId, classId);

    // 2. Get actively enrolled students
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

    // 3. Get all active assessments for this class + period (exclude draft + cancelled)
    const assessments = await this.prisma.assessment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        academic_period_id: academicPeriodId,
        status: { notIn: ['draft', 'closed'] },
      },
      include: {
        subject: {
          select: { id: true, name: true, code: true },
        },
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ subject: { name: 'asc' } }, { category: { name: 'asc' } }, { title: 'asc' }],
    });

    // 4. Group assessments by subject
    const subjectMap = new Map<string, MatrixSubject>();
    for (const a of assessments) {
      const subjectId = a.subject.id;
      if (!subjectMap.has(subjectId)) {
        subjectMap.set(subjectId, {
          id: subjectId,
          name: a.subject.name,
          code: a.subject.code,
          assessments: [],
        });
      }
      subjectMap.get(subjectId)!.assessments.push({
        id: a.id,
        title: a.title,
        category_name: a.category.name,
        max_score: Number(a.max_score),
        status: a.status,
      });
    }
    const subjects = Array.from(subjectMap.values());

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

    // 6. Build grades lookup: { student_id: { assessment_id: { raw_score, is_missing } } }
    const grades: Record<string, Record<string, GradeEntry>> = {};
    for (const g of allGrades) {
      if (!grades[g.student_id]) {
        grades[g.student_id] = {};
      }
      grades[g.student_id]![g.assessment_id] = {
        raw_score: g.raw_score != null ? Number(g.raw_score) : null,
        is_missing: g.is_missing,
      };
    }

    return { students, subjects, grades };
  }

  /**
   * Batch save grades from the results matrix.
   * Only saves changed cells — the frontend tracks dirty state.
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
