import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { ConfigurationReadFacade } from '../configuration/configuration-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import type { BulkUpsertGradesDto } from './dto/gradebook.dto';

interface FindByStudentFilters {
  class_id?: string;
  subject_id?: string;
  academic_period_id?: string;
}

@Injectable()
export class GradesService {
  constructor(private readonly prisma: PrismaService) {}
  /**
   * Bulk upsert grades for an assessment.
   * Verifies assessment status, student enrolment, and comment requirements.
   */
  async bulkUpsert(
    tenantId: string,
    assessmentId: string,
    userId: string,
    dto: BulkUpsertGradesDto,
  ) {
    // 1. Verify assessment exists and status allows grading
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, tenant_id: tenantId },
      select: { id: true, status: true, class_id: true, max_score: true },
    });

    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: `Assessment with id "${assessmentId}" not found`,
      });
    }

    if (assessment.status !== 'draft' && assessment.status !== 'open') {
      throw new ConflictException({
        code: 'ASSESSMENT_NOT_GRADEABLE',
        message: `Cannot enter grades for assessment with status "${assessment.status}". Status must be draft or open.`,
      });
    }

    // 2. Verify all students are enrolled in the class
    const studentIds = dto.grades.map((g) => g.student_id);
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: assessment.class_id,
        student_id: { in: studentIds },
        status: 'active',
      },
      select: { student_id: true },
    });

    const enrolledStudentIds = new Set(enrolments.map((e) => e.student_id));
    const notEnrolled = studentIds.filter((id) => !enrolledStudentIds.has(id));

    if (notEnrolled.length > 0) {
      throw new BadRequestException({
        code: 'STUDENTS_NOT_ENROLLED',
        message: `The following students are not actively enrolled in this class: ${notEnrolled.join(', ')}`,
      });
    }

    // 3. Check tenant setting for comment requirement
    const tenantSetting = await this.prisma.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const settings = (tenantSetting?.settings ?? {}) as Record<string, unknown>;
    const gradebookSettings = (settings['gradebook'] ?? {}) as Record<string, unknown>;
    const requireGradeComment = gradebookSettings['requireGradeComment'] === true;

    if (requireGradeComment) {
      for (const grade of dto.grades) {
        if (grade.raw_score !== null && !grade.comment) {
          throw new BadRequestException({
            code: 'COMMENT_REQUIRED',
            message: `A comment is required for each grade. Missing comment for student "${grade.student_id}"`,
          });
        }
      }
    }

    // 4. Validate scores against max_score
    const maxScore = Number(assessment.max_score);
    for (const grade of dto.grades) {
      if (grade.raw_score !== null && grade.raw_score > maxScore) {
        throw new BadRequestException({
          code: 'SCORE_EXCEEDS_MAX',
          message: `Score ${grade.raw_score} exceeds max score ${maxScore} for student "${grade.student_id}"`,
        });
      }
      if (grade.raw_score !== null && grade.raw_score < 0) {
        throw new BadRequestException({
          code: 'SCORE_NEGATIVE',
          message: `Score cannot be negative for student "${grade.student_id}"`,
        });
      }
    }

    // 5. Load existing grades to determine entered_at/entered_by_user_id
    const existingGrades = await this.prisma.grade.findMany({
      where: {
        tenant_id: tenantId,
        assessment_id: assessmentId,
        student_id: { in: studentIds },
      },
      select: {
        student_id: true,
        raw_score: true,
        entered_at: true,
        entered_by_user_id: true,
      },
    });

    const existingGradeMap = new Map(
      existingGrades.map((g) => [g.student_id, g]),
    );

    // 6. Upsert all grades within an RLS transaction
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const now = new Date();

    const upsertedGrades = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const results = [];

      for (const grade of dto.grades) {
        const existing = existingGradeMap.get(grade.student_id);

        // Determine entered_by_user_id and entered_at
        // Set when raw_score is provided for the first time
        let enteredByUserId = userId;
        let enteredAt: Date | null = now;

        if (existing) {
          // If previously had raw_score, keep original entered_by/entered_at
          if (existing.raw_score !== null) {
            enteredByUserId = existing.entered_by_user_id;
            enteredAt = existing.entered_at;
          }
          // If previously null and now also null, keep null
          if (existing.raw_score === null && grade.raw_score === null) {
            enteredAt = null;
          }
        } else if (grade.raw_score === null) {
          // New record with no score — don't set entered_at
          enteredAt = null;
        }

        const result = await db.grade.upsert({
          where: {
            idx_grades_unique: {
              tenant_id: tenantId,
              assessment_id: assessmentId,
              student_id: grade.student_id,
            },
          },
          update: {
            raw_score: grade.raw_score,
            is_missing: grade.is_missing,
            comment: grade.comment ?? null,
            entered_by_user_id: enteredByUserId,
            entered_at: enteredAt,
          },
          create: {
            tenant_id: tenantId,
            assessment_id: assessmentId,
            student_id: grade.student_id,
            raw_score: grade.raw_score,
            is_missing: grade.is_missing,
            comment: grade.comment ?? null,
            entered_by_user_id: enteredByUserId,
            entered_at: enteredAt,
          },
        });

        results.push(result);
      }

      return results;
    });

    return { data: upsertedGrades };
  }

  /**
   * Get all grades for an assessment with student info.
   */
  async findByAssessment(tenantId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: `Assessment with id "${assessmentId}" not found`,
      });
    }

    const data = await this.prisma.grade.findMany({
      where: {
        tenant_id: tenantId,
        assessment_id: assessmentId,
      },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
          },
        },
        entered_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
      orderBy: { student: { last_name: 'asc' } },
    });

    return { data };
  }

  /**
   * Get a student's grades across assessments with optional filters.
   */
  async findByStudent(
    tenantId: string,
    studentId: string,
    filters: FindByStudentFilters,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { id: true, first_name: true, last_name: true },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${studentId}" not found`,
      });
    }

    const assessmentWhere: Prisma.AssessmentWhereInput = {};
    if (filters.class_id) {
      assessmentWhere.class_id = filters.class_id;
    }
    if (filters.subject_id) {
      assessmentWhere.subject_id = filters.subject_id;
    }
    if (filters.academic_period_id) {
      assessmentWhere.academic_period_id = filters.academic_period_id;
    }

    const data = await this.prisma.grade.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        assessment: assessmentWhere,
      },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            max_score: true,
            status: true,
            class_entity: {
              select: { id: true, name: true },
            },
            subject: {
              select: { id: true, name: true, code: true },
            },
            academic_period: {
              select: { id: true, name: true },
            },
            category: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { assessment: { created_at: 'desc' } },
    });

    return { student, data };
  }
}
