import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { HomeworkCompletion } from '@prisma/client';

import type { CompletionStatus } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import type { BulkMarkCompletionDto, MarkCompletionDto } from './dto/mark-completion.dto';
import { HomeworkNotificationService } from './homework-notification.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface GradeSubmissionDto {
  points_awarded?: number | null;
  teacher_feedback?: string | null;
}

export interface ReturnSubmissionDto {
  teacher_feedback: string;
}

@Injectable()
export class HomeworkCompletionsService {
  private readonly logger = new Logger(HomeworkCompletionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantReadFacade: TenantReadFacade,
    private readonly parentReadFacade: ParentReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly homeworkNotification: HomeworkNotificationService,
  ) {}

  // ─── List completions for an assignment ─────────────────────────────────────

  async listCompletions(tenantId: string, homeworkId: string) {
    const assignment = await this.findPublishedAssignment(tenantId, homeworkId);

    const completions = await this.prisma.homeworkCompletion.findMany({
      where: {
        tenant_id: tenantId,
        homework_assignment_id: assignment.id,
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
      },
      orderBy: { created_at: 'asc' },
    });

    return {
      data: completions,
      assignment: {
        id: assignment.id,
        title: assignment.title,
        class_id: assignment.class_id,
        due_date: assignment.due_date,
        max_points: assignment.max_points,
      },
    };
  }

  // ─── Student self-report completion ─────────────────────────────────────────

  /**
   * Resolves the student linked to the authenticated user (via parent → student_parents)
   * and upserts a completion record for the given assignment.
   */
  async studentSelfReport(
    tenantId: string,
    homeworkId: string,
    userId: string,
    dto: MarkCompletionDto,
  ) {
    // Check if self-reporting is enabled for this tenant
    const tenantSettings = await this.tenantReadFacade.findSettings(tenantId);
    const hwSettings = tenantSettings?.homework as Record<string, unknown> | undefined;
    if (hwSettings?.allow_student_self_report === false) {
      throw new ForbiddenException({
        code: 'SELF_REPORT_DISABLED',
        message: 'Student self-reporting is disabled for this school',
      });
    }

    const assignment = await this.findPublishedAssignment(tenantId, homeworkId);

    // Resolve student from user via parent → student_parents → student → class_enrolments
    const parent = await this.parentReadFacade.findActiveByUserId(tenantId, userId);

    if (!parent) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'No student linked to this user is enrolled in the assignment class',
      });
    }

    const linkedStudentIds = await this.parentReadFacade.findLinkedStudentIds(tenantId, parent.id);

    // Find the student enrolled in this assignment's class
    let studentId: string | null = null;
    for (const sid of linkedStudentIds) {
      const cids = await this.classesReadFacade.findClassIdsForStudent(tenantId, sid);
      if (cids.includes(assignment.class_id)) {
        studentId = sid;
        break;
      }
    }

    if (!studentId) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'No student linked to this user is enrolled in the assignment class',
      });
    }
    const now = new Date();

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const completion = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.homeworkCompletion.upsert({
        where: {
          idx_hw_completion_unique: {
            tenant_id: tenantId,
            homework_assignment_id: assignment.id,
            student_id: studentId,
          },
        },
        update: {
          status: dto.status,
          notes: dto.notes ?? null,
          points_awarded: dto.points_awarded ?? null,
          completed_at: dto.status === 'completed' ? now : null,
        },
        create: {
          tenant_id: tenantId,
          homework_assignment_id: assignment.id,
          student_id: studentId,
          status: dto.status,
          notes: dto.notes ?? null,
          points_awarded: dto.points_awarded ?? null,
          completed_at: dto.status === 'completed' ? now : null,
        },
      });
    });

    this.logger.log(
      `Student ${studentId} self-reported completion for homework ${homeworkId} as "${dto.status}"`,
    );

    return completion;
  }

  // ─── Teacher update a single student's completion ───────────────────────────

  async teacherUpdate(
    tenantId: string,
    homeworkId: string,
    studentId: string,
    userId: string,
    dto: MarkCompletionDto,
  ) {
    const assignment = await this.findAssignment(tenantId, homeworkId);
    const now = new Date();

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const completion = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.homeworkCompletion.upsert({
        where: {
          idx_hw_completion_unique: {
            tenant_id: tenantId,
            homework_assignment_id: assignment.id,
            student_id: studentId,
          },
        },
        update: {
          status: dto.status,
          notes: dto.notes ?? null,
          points_awarded: dto.points_awarded ?? null,
          completed_at: dto.status === 'completed' ? now : null,
          verified_by_user_id: userId,
          verified_at: now,
        },
        create: {
          tenant_id: tenantId,
          homework_assignment_id: assignment.id,
          student_id: studentId,
          status: dto.status,
          notes: dto.notes ?? null,
          points_awarded: dto.points_awarded ?? null,
          completed_at: dto.status === 'completed' ? now : null,
          verified_by_user_id: userId,
          verified_at: now,
        },
      });
    });

    this.logger.log(
      `Teacher ${userId} updated completion for student ${studentId} on homework ${homeworkId}`,
    );

    return completion;
  }

  // ─── Bulk mark completions ──────────────────────────────────────────────────

  async bulkMark(tenantId: string, homeworkId: string, userId: string, dto: BulkMarkCompletionDto) {
    const assignment = await this.findPublishedAssignment(tenantId, homeworkId);
    const now = new Date();

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const results = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate all students belong to the assignment's class
      const enrolledStudents = await db.classEnrolment.findMany({
        where: {
          tenant_id: tenantId,
          class_id: assignment.class_id,
          student_id: { in: dto.completions.map((c) => c.student_id) },
          status: 'active',
        },
        select: { student_id: true },
      });
      const enrolledIds = new Set(enrolledStudents.map((e) => e.student_id));
      const invalidIds = dto.completions
        .filter((c) => !enrolledIds.has(c.student_id))
        .map((c) => c.student_id);
      if (invalidIds.length > 0) {
        throw new BadRequestException({
          code: 'STUDENTS_NOT_IN_CLASS',
          message: `Students not enrolled in this class: ${invalidIds.join(', ')}`,
        });
      }

      const upserted = await Promise.all(
        dto.completions.map((entry) =>
          db.homeworkCompletion.upsert({
            where: {
              idx_hw_completion_unique: {
                tenant_id: tenantId,
                homework_assignment_id: assignment.id,
                student_id: entry.student_id,
              },
            },
            update: {
              status: entry.status,
              notes: entry.notes ?? null,
              points_awarded: entry.points_awarded ?? null,
              completed_at: entry.status === 'completed' ? now : null,
              verified_by_user_id: userId,
              verified_at: now,
            },
            create: {
              tenant_id: tenantId,
              homework_assignment_id: assignment.id,
              student_id: entry.student_id,
              status: entry.status,
              notes: entry.notes ?? null,
              points_awarded: entry.points_awarded ?? null,
              completed_at: entry.status === 'completed' ? now : null,
              verified_by_user_id: userId,
              verified_at: now,
            },
          }),
        ),
      );

      return upserted;
    })) as HomeworkCompletion[];

    this.logger.log(
      `Teacher ${userId} bulk-marked ${results.length} completions for homework ${homeworkId}`,
    );

    return { data: results, count: results.length };
  }

  // ─── List submissions for an assignment (Wave 3) ────────────────────────────

  async listSubmissions(tenantId: string, homeworkId: string) {
    const assignment = await this.findPublishedAssignment(tenantId, homeworkId);

    const submissions = await this.prisma.homeworkSubmission.findMany({
      where: {
        tenant_id: tenantId,
        homework_assignment_id: assignment.id,
      },
      include: {
        student: {
          select: { id: true, first_name: true, last_name: true, student_number: true },
        },
        attachments: { orderBy: { display_order: 'asc' } },
      },
      orderBy: { submitted_at: 'desc' },
    });

    return {
      data: submissions,
      assignment: {
        id: assignment.id,
        title: assignment.title,
        max_points: assignment.max_points,
      },
    };
  }

  // ─── Grade / return submissions (Wave 3) ────────────────────────────────────

  async gradeSubmission(
    tenantId: string,
    homeworkId: string,
    submissionId: string,
    userId: string,
    dto: GradeSubmissionDto,
  ) {
    const submission = await this.prisma.homeworkSubmission.findFirst({
      where: {
        id: submissionId,
        tenant_id: tenantId,
        homework_assignment_id: homeworkId,
      },
      select: { id: true, student_id: true, status: true },
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: `Submission with id "${submissionId}" not found on homework "${homeworkId}"`,
      });
    }

    const now = new Date();
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.homeworkSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'graded',
          graded_at: now,
          graded_by_user_id: userId,
          points_awarded: dto.points_awarded ?? null,
          teacher_feedback: dto.teacher_feedback ?? null,
          version: { increment: 1 },
        },
      });
    });

    try {
      await this.homeworkNotification.notifyOnGrade(
        tenantId,
        homeworkId,
        submissionId,
        submission.student_id,
        dto.points_awarded ?? null,
        dto.teacher_feedback ?? null,
      );
    } catch (err) {
      this.logger.error(
        `[gradeSubmission] Graded submission ${submissionId} but notification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return updated;
  }

  async returnSubmission(
    tenantId: string,
    homeworkId: string,
    submissionId: string,
    userId: string,
    dto: ReturnSubmissionDto,
  ) {
    const submission = await this.prisma.homeworkSubmission.findFirst({
      where: {
        id: submissionId,
        tenant_id: tenantId,
        homework_assignment_id: homeworkId,
      },
      select: { id: true, student_id: true, status: true },
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: `Submission with id "${submissionId}" not found on homework "${homeworkId}"`,
      });
    }

    if (submission.status === 'graded') {
      throw new BadRequestException({
        code: 'SUBMISSION_ALREADY_GRADED',
        message: 'Graded submissions cannot be returned for revision',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Move completion back to in_progress so the student sees the
      // assignment as needing attention again.
      await db.homeworkCompletion.updateMany({
        where: {
          tenant_id: tenantId,
          homework_assignment_id: homeworkId,
          student_id: submission.student_id,
        },
        data: { status: 'in_progress', completed_at: null },
      });

      return db.homeworkSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'returned_for_revision',
          teacher_feedback: dto.teacher_feedback,
          graded_by_user_id: userId,
          version: { increment: 1 },
        },
      });
    });

    try {
      await this.homeworkNotification.notifyOnReturn(
        tenantId,
        homeworkId,
        submissionId,
        submission.student_id,
        dto.teacher_feedback,
      );
    } catch (err) {
      this.logger.error(
        `[returnSubmission] Returned submission ${submissionId} but notification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return updated;
  }

  // ─── Completion rate for an assignment ──────────────────────────────────────

  async getCompletionRate(tenantId: string, homeworkId: string) {
    const assignment = await this.findAssignment(tenantId, homeworkId);

    // Count active students in the class
    const totalStudents = await this.classesReadFacade.countEnrolledStudents(
      tenantId,
      assignment.class_id,
    );

    // Count completions by status
    const completions = await this.prisma.homeworkCompletion.findMany({
      where: {
        tenant_id: tenantId,
        homework_assignment_id: assignment.id,
      },
      select: { status: true },
    });

    const statusCounts: Record<CompletionStatus, number> = {
      not_started: 0,
      in_progress: 0,
      completed: 0,
    };

    for (const c of completions) {
      const status = c.status as CompletionStatus;
      statusCounts[status]++;
    }

    // Students without any completion record are implicitly not_started
    const studentsWithRecords = completions.length;
    const implicitNotStarted = Math.max(0, totalStudents - studentsWithRecords);
    statusCounts.not_started += implicitNotStarted;

    const completionRate =
      totalStudents > 0 ? Math.round((statusCounts.completed / totalStudents) * 10000) / 100 : 0;

    return {
      homework_assignment_id: assignment.id,
      total_students: totalStudents,
      completed: statusCounts.completed,
      in_progress: statusCounts.in_progress,
      not_started: statusCounts.not_started,
      completion_rate: completionRate,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Finds an assignment by ID; throws NotFoundException if absent, BadRequestException if not published.
   */
  private async findPublishedAssignment(tenantId: string, homeworkId: string) {
    const assignment = await this.prisma.homeworkAssignment.findFirst({
      where: { id: homeworkId, tenant_id: tenantId },
      select: {
        id: true,
        title: true,
        class_id: true,
        status: true,
        due_date: true,
        max_points: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Homework assignment "${homeworkId}" not found`,
      });
    }

    if (assignment.status !== 'published') {
      throw new BadRequestException({
        code: 'HOMEWORK_NOT_PUBLISHED',
        message: `Homework assignment "${homeworkId}" is not published (current status: ${assignment.status})`,
      });
    }

    return assignment;
  }

  /**
   * Finds an assignment by ID; throws NotFoundException if absent.
   * Does not enforce published status (used for teacher operations).
   */
  private async findAssignment(tenantId: string, homeworkId: string) {
    const assignment = await this.prisma.homeworkAssignment.findFirst({
      where: { id: homeworkId, tenant_id: tenantId },
      select: {
        id: true,
        title: true,
        class_id: true,
        status: true,
        due_date: true,
        max_points: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Homework assignment "${homeworkId}" not found`,
      });
    }

    return assignment;
  }
}
