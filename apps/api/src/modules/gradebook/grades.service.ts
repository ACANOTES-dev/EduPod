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
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import type { BulkUpsertGradesDto } from './dto/gradebook.dto';

interface FindByStudentFilters {
  class_id?: string;
  subject_id?: string;
  academic_period_id?: string;
}

@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly configurationReadFacade: ConfigurationReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
  ) {}
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
      select: {
        id: true,
        status: true,
        class_id: true,
        max_score: true,
        due_date: true,
        grading_deadline: true,
      },
    });

    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: `Assessment with id "${assessmentId}" not found`,
      });
    }

    if (assessment.status !== 'open' && assessment.status !== 'reopened') {
      throw new ConflictException({
        code: 'ASSESSMENT_NOT_GRADEABLE',
        message: `Cannot enter grades for assessment with status "${assessment.status}". Status must be open or reopened.`,
      });
    }

    // 2. Enforce grading window for "open" assessments (reopened bypasses — admin approved)
    if (assessment.status === 'open') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (assessment.due_date) {
        const dueDate = new Date(assessment.due_date);
        dueDate.setHours(0, 0, 0, 0);
        if (today < dueDate) {
          throw new ConflictException({
            code: 'GRADING_WINDOW_NOT_OPEN',
            message: `Grading is not yet available. The exam due date is ${dueDate.toISOString().split('T')[0]}.`,
          });
        }
      }

      if (assessment.grading_deadline) {
        const deadline = new Date(assessment.grading_deadline);
        deadline.setHours(0, 0, 0, 0);
        if (today > deadline) {
          throw new ConflictException({
            code: 'GRADING_WINDOW_CLOSED',
            message: `The grading deadline (${deadline.toISOString().split('T')[0]}) has passed. Contact administration to reopen.`,
          });
        }
      }
    }

    // 3. Verify all students are enrolled in the class
    const studentIds = dto.grades.map((g) => g.student_id);
    const allEnrolledIds = await this.classesReadFacade.findEnrolledStudentIds(
      tenantId,
      assessment.class_id,
    );
    const enrolledStudentIds = new Set(allEnrolledIds.filter((id) => studentIds.includes(id)));
    const notEnrolled = studentIds.filter((id) => !enrolledStudentIds.has(id));

    if (notEnrolled.length > 0) {
      throw new BadRequestException({
        code: 'STUDENTS_NOT_ENROLLED',
        message: `The following students are not actively enrolled in this class: ${notEnrolled.join(', ')}`,
      });
    }

    // 4. Check tenant setting for comment requirement
    const settingsRow = await this.configurationReadFacade.findSettings(tenantId);

    const settings = ((settingsRow?.settings ?? {}) as Record<string, unknown>) ?? {};
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

    // 5. Validate scores against max_score
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

    // 6. Load existing grades to determine entered_at/entered_by_user_id
    const existingGrades = await this.prisma.grade.findMany({
      where: {
        tenant_id: tenantId,
        assessment_id: assessmentId,
        student_id: { in: studentIds },
      },
      select: {
        id: true,
        student_id: true,
        raw_score: true,
        comment: true,
        entered_at: true,
        entered_by_user_id: true,
      },
    });

    const existingGradeMap = new Map(existingGrades.map((g) => [g.student_id, g]));

    // 7. Upsert all grades within an RLS transaction
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

      // If assessment is reopened, create audit entries for changed grades
      if (assessment.status === 'reopened') {
        for (const grade of dto.grades) {
          const existing = existingGradeMap.get(grade.student_id);
          if (!existing) continue;

          const oldScore = existing.raw_score !== null ? Number(existing.raw_score) : null;
          const newScore = grade.raw_score;

          // Only audit if score actually changed
          if (oldScore !== newScore) {
            await db.gradeEditAudit.create({
              data: {
                tenant_id: tenantId,
                grade_id: results.find((r) => r.student_id === grade.student_id)?.id ?? '',
                assessment_id: assessmentId,
                student_id: grade.student_id,
                old_raw_score: existing.raw_score,
                new_raw_score: grade.raw_score,
                old_comment: existing.comment ?? null,
                new_comment: grade.comment ?? null,
                edited_by_user_id: userId,
                reason: 'Grade amended after assessment unlock',
              },
            });
          }
        }
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
  async findByStudent(tenantId: string, studentId: string, filters: FindByStudentFilters) {
    const student = await this.studentReadFacade.findById(tenantId, studentId);

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
