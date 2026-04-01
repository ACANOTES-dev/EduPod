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
import { PrismaService } from '../prisma/prisma.service';

import type { BulkMarkCompletionDto, MarkCompletionDto } from './dto/mark-completion.dto';

@Injectable()
export class HomeworkCompletionsService {
  private readonly logger = new Logger(HomeworkCompletionsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const hwSettings = (tenant?.settings as Record<string, unknown>)?.homework as
      | Record<string, unknown>
      | undefined;
    if (hwSettings?.allow_student_self_report === false) {
      throw new ForbiddenException({
        code: 'SELF_REPORT_DISABLED',
        message: 'Student self-reporting is disabled for this school',
      });
    }

    const assignment = await this.findPublishedAssignment(tenantId, homeworkId);

    // Resolve student from user via parent → student_parents → student → class_enrolments
    const parent = await this.prisma.parent.findFirst({
      where: { tenant_id: tenantId, user_id: userId, status: 'active' },
      select: {
        student_parents: {
          select: {
            student_id: true,
            student: {
              select: {
                id: true,
                class_enrolments: {
                  where: {
                    tenant_id: tenantId,
                    class_id: assignment.class_id,
                    status: 'active',
                  },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    // Find the student enrolled in this assignment's class
    const enrolledStudentLink = parent?.student_parents.find(
      (sp) => sp.student.class_enrolments.length > 0,
    );

    if (!enrolledStudentLink) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'No student linked to this user is enrolled in the assignment class',
      });
    }

    const studentId = enrolledStudentLink.student_id;
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

  // ─── Completion rate for an assignment ──────────────────────────────────────

  async getCompletionRate(tenantId: string, homeworkId: string) {
    const assignment = await this.findAssignment(tenantId, homeworkId);

    // Count active students in the class
    const totalStudents = await this.prisma.classEnrolment.count({
      where: {
        tenant_id: tenantId,
        class_id: assignment.class_id,
        status: 'active',
      },
    });

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
