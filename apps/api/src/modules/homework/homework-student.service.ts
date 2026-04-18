import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { StudentReadFacade } from '../students/student-read.facade';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import { HomeworkNotificationService } from './homework-notification.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface SubmitHomeworkDto {
  submission_text?: string;
}

export interface SubmissionAttachmentDto {
  attachment_type: 'file' | 'link' | 'video';
  file_name?: string;
  url?: string;
  file_key?: string;
  file_size_bytes?: number;
  mime_type?: string;
  display_order: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/zip',
];

const BYTES_PER_MB = 1024 * 1024;

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * HomeworkStudentService — surface for students to view their own homework
 * and submit work.
 *
 * All endpoints are scoped to the authenticated student: the service
 * resolves `userId → Student` via the unique `Student.user_id` FK and
 * refuses to serve anything if that linkage is missing. Unlike the
 * teacher/parent surfaces, there is no `studentId` parameter — callers
 * cannot target another student.
 *
 * Submission lifecycle: `submitted → returned_for_revision → submitted →
 * graded`. `is_late` is computed against the homework's `due_date` +
 * optional `due_time`; assignments with `accept_late_submissions = false`
 * hard-reject post-deadline submissions.
 */
@Injectable()
export class HomeworkStudentService {
  private readonly logger = new Logger(HomeworkStudentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
    private readonly homeworkNotification: HomeworkNotificationService,
  ) {}

  // ─── Resolve the authenticated student ──────────────────────────────────────

  private async resolveStudent(tenantId: string, userId: string): Promise<{ id: string }> {
    const student = await this.studentReadFacade.findByUserId(tenantId, userId);
    if (!student) {
      throw new ForbiddenException({
        code: 'STUDENT_PROFILE_NOT_FOUND',
        message: 'No student profile linked to this account',
      });
    }
    return { id: student.id };
  }

  // ─── List — today / this-week / overdue / all ──────────────────────────────

  async listToday(tenantId: string, userId: string) {
    const student = await this.resolveStudent(tenantId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return { data: await this.fetchAssignmentsForStudent(tenantId, student.id, today, tomorrow) };
  }

  async listThisWeek(tenantId: string, userId: string) {
    const student = await this.resolveStudent(tenantId, userId);

    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(monday.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const nextMonday = new Date(monday);
    nextMonday.setDate(nextMonday.getDate() + 7);

    return {
      data: await this.fetchAssignmentsForStudent(tenantId, student.id, monday, nextMonday),
    };
  }

  async listOverdue(tenantId: string, userId: string) {
    const student = await this.resolveStudent(tenantId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Assignments past due where the student hasn't submitted (or was returned for revision).
    const assignments = await this.prisma.homeworkAssignment.findMany({
      where: {
        tenant_id: tenantId,
        status: 'published',
        due_date: { lt: today },
        class_entity: {
          class_enrolments: {
            some: { tenant_id: tenantId, student_id: student.id, status: 'active' },
          },
        },
      },
      include: {
        class_entity: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
      },
      orderBy: { due_date: 'asc' },
    });

    const submissions = await this.prisma.homeworkSubmission.findMany({
      where: {
        tenant_id: tenantId,
        student_id: student.id,
        homework_assignment_id: { in: assignments.map((a) => a.id) },
      },
      select: { homework_assignment_id: true, status: true },
    });

    const submissionByAssignment = new Map(
      submissions.map((s) => [s.homework_assignment_id, s.status]),
    );

    const data = assignments.filter((a) => {
      const st = submissionByAssignment.get(a.id);
      return !st || st === 'returned_for_revision';
    });

    return { data };
  }

  async listAll(
    tenantId: string,
    userId: string,
    query: { page: number; pageSize: number; status?: 'outstanding' | 'submitted' | 'graded' },
  ) {
    const student = await this.resolveStudent(tenantId, userId);

    const where = {
      tenant_id: tenantId,
      status: 'published' as const,
      class_entity: {
        class_enrolments: {
          some: { tenant_id: tenantId, student_id: student.id, status: 'active' as const },
        },
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.homeworkAssignment.findMany({
        where,
        include: {
          class_entity: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          submissions: { where: { student_id: student.id } },
        },
        orderBy: { due_date: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.homeworkAssignment.count({ where }),
    ]);

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  // ─── Single assignment + submission ────────────────────────────────────────

  async findOne(tenantId: string, userId: string, homeworkId: string) {
    const student = await this.resolveStudent(tenantId, userId);

    const assignment = await this.prisma.homeworkAssignment.findFirst({
      where: {
        id: homeworkId,
        tenant_id: tenantId,
        status: 'published',
        class_entity: {
          class_enrolments: {
            some: { tenant_id: tenantId, student_id: student.id, status: 'active' },
          },
        },
      },
      include: {
        class_entity: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        assigned_by: { select: { id: true, first_name: true, last_name: true } },
        attachments: { orderBy: { display_order: 'asc' } },
        submissions: {
          where: { student_id: student.id },
          include: { attachments: { orderBy: { display_order: 'asc' } } },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Homework with id "${homeworkId}" not found or not assigned to you`,
      });
    }

    return assignment;
  }

  // ─── Submit / resubmit ─────────────────────────────────────────────────────

  async submit(tenantId: string, userId: string, homeworkId: string, dto: SubmitHomeworkDto) {
    const student = await this.resolveStudent(tenantId, userId);

    const assignment = await this.prisma.homeworkAssignment.findFirst({
      where: {
        id: homeworkId,
        tenant_id: tenantId,
        status: 'published',
        class_entity: {
          class_enrolments: {
            some: { tenant_id: tenantId, student_id: student.id, status: 'active' },
          },
        },
      },
      select: {
        id: true,
        assigned_by_user_id: true,
        due_date: true,
        due_time: true,
        accept_late_submissions: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Homework with id "${homeworkId}" not found or not assigned to you`,
      });
    }

    const now = new Date();
    const deadline = this.buildDeadline(assignment.due_date, assignment.due_time);
    const isLate = now > deadline;

    if (isLate && !assignment.accept_late_submissions) {
      throw new BadRequestException({
        code: 'LATE_SUBMISSIONS_REJECTED',
        message:
          'The deadline for this homework has passed and the teacher is not accepting late submissions.',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const submission = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const upserted = await db.homeworkSubmission.upsert({
        where: {
          idx_homework_submissions_tenant_assignment_student: {
            tenant_id: tenantId,
            homework_assignment_id: homeworkId,
            student_id: student.id,
          },
        },
        create: {
          tenant_id: tenantId,
          homework_assignment_id: homeworkId,
          student_id: student.id,
          submitted_at: now,
          submission_text: dto.submission_text ?? null,
          status: 'submitted',
          is_late: isLate,
          version: 1,
        },
        update: {
          submitted_at: now,
          submission_text: dto.submission_text ?? null,
          status: 'submitted',
          is_late: isLate,
          version: { increment: 1 },
        },
        include: { attachments: { orderBy: { display_order: 'asc' } } },
      });

      // Mirror into HomeworkCompletion so teacher-side completion views stay accurate.
      await db.homeworkCompletion.upsert({
        where: {
          idx_hw_completion_unique: {
            tenant_id: tenantId,
            homework_assignment_id: homeworkId,
            student_id: student.id,
          },
        },
        create: {
          tenant_id: tenantId,
          homework_assignment_id: homeworkId,
          student_id: student.id,
          status: 'completed',
          completed_at: now,
          version: 1,
        },
        update: {
          status: 'completed',
          completed_at: now,
          version: { increment: 1 },
        },
      });

      return upserted;
    });

    // Fire in-app notification to the teacher (non-blocking).
    try {
      await this.homeworkNotification.notifyOnSubmit(
        tenantId,
        homeworkId,
        submission.id,
        student.id,
        assignment.assigned_by_user_id,
      );
    } catch (err) {
      this.logger.error(
        `[submit] Homework ${homeworkId} submitted by student ${student.id} but teacher notification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return submission;
  }

  // ─── Attachments ───────────────────────────────────────────────────────────

  async addAttachment(
    tenantId: string,
    userId: string,
    homeworkId: string,
    dto: SubmissionAttachmentDto,
  ) {
    const student = await this.resolveStudent(tenantId, userId);

    const submission = await this.prisma.homeworkSubmission.findFirst({
      where: {
        tenant_id: tenantId,
        homework_assignment_id: homeworkId,
        student_id: student.id,
      },
      select: { id: true, status: true },
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: 'You have not submitted this homework yet',
      });
    }

    if (submission.status === 'graded') {
      throw new BadRequestException({
        code: 'SUBMISSION_LOCKED',
        message: 'Graded submissions cannot be modified',
      });
    }

    const settings = await this.getHomeworkSettings(tenantId);

    const currentCount = await this.prisma.homeworkSubmissionAttachment.count({
      where: { tenant_id: tenantId, homework_submission_id: submission.id },
    });
    if (currentCount >= settings.max_attachments_per_assignment) {
      throw new BadRequestException({
        code: 'MAX_ATTACHMENTS_REACHED',
        message: `Maximum ${settings.max_attachments_per_assignment} attachments per submission`,
      });
    }

    if (dto.attachment_type === 'file') {
      if (!dto.mime_type || !ALLOWED_MIME_TYPES.includes(dto.mime_type)) {
        throw new BadRequestException({
          code: 'INVALID_MIME_TYPE',
          message: `Unsupported file type "${dto.mime_type}"`,
        });
      }

      const maxSizeBytes = settings.max_attachment_size_mb * BYTES_PER_MB;
      if (dto.file_size_bytes && dto.file_size_bytes > maxSizeBytes) {
        throw new BadRequestException({
          code: 'FILE_TOO_LARGE',
          message: `File exceeds maximum ${settings.max_attachment_size_mb}MB`,
        });
      }
    }

    if ((dto.attachment_type === 'link' || dto.attachment_type === 'video') && !dto.url) {
      throw new BadRequestException({
        code: 'URL_REQUIRED',
        message: `URL required for "${dto.attachment_type}" attachments`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.homeworkSubmissionAttachment.create({
        data: {
          tenant_id: tenantId,
          homework_submission_id: submission.id,
          attachment_type: dto.attachment_type,
          file_name: dto.file_name ?? null,
          file_key: dto.file_key ?? null,
          file_size_bytes: dto.file_size_bytes ?? null,
          mime_type: dto.mime_type ?? null,
          url: dto.url ?? null,
          display_order: dto.display_order,
        },
      });
    });
  }

  async removeAttachment(
    tenantId: string,
    userId: string,
    homeworkId: string,
    attachmentId: string,
  ) {
    const student = await this.resolveStudent(tenantId, userId);

    const attachment = await this.prisma.homeworkSubmissionAttachment.findFirst({
      where: {
        id: attachmentId,
        tenant_id: tenantId,
        submission: {
          tenant_id: tenantId,
          homework_assignment_id: homeworkId,
          student_id: student.id,
        },
      },
      include: {
        submission: { select: { status: true } },
      },
    });

    if (!attachment) {
      throw new NotFoundException({
        code: 'ATTACHMENT_NOT_FOUND',
        message: `Attachment with id "${attachmentId}" not found on your submission`,
      });
    }

    if (attachment.submission.status === 'graded') {
      throw new BadRequestException({
        code: 'SUBMISSION_LOCKED',
        message: 'Graded submissions cannot be modified',
      });
    }

    if (attachment.attachment_type === 'file' && attachment.file_key) {
      try {
        await this.s3Service.delete(attachment.file_key);
      } catch (err) {
        this.logger.error(
          `Failed to delete S3 object "${attachment.file_key}": ${err instanceof Error ? err.stack : String(err)}`,
        );
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.homeworkSubmissionAttachment.delete({ where: { id: attachmentId } });
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private buildDeadline(dueDate: Date, dueTime: Date | null): Date {
    const deadline = new Date(dueDate);
    if (dueTime) {
      deadline.setUTCHours(
        dueTime.getUTCHours(),
        dueTime.getUTCMinutes(),
        dueTime.getUTCSeconds(),
        0,
      );
    } else {
      deadline.setUTCHours(23, 59, 59, 999);
    }
    return deadline;
  }

  private async fetchAssignmentsForStudent(
    tenantId: string,
    studentId: string,
    fromDate: Date,
    toDate: Date,
  ) {
    return this.prisma.homeworkAssignment.findMany({
      where: {
        tenant_id: tenantId,
        status: 'published',
        due_date: { gte: fromDate, lt: toDate },
        class_entity: {
          class_enrolments: {
            some: { tenant_id: tenantId, student_id: studentId, status: 'active' },
          },
        },
      },
      include: {
        class_entity: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        submissions: { where: { student_id: studentId } },
      },
      orderBy: { due_date: 'asc' },
    });
  }

  private async getHomeworkSettings(tenantId: string) {
    const settings = await this.tenantReadFacade.findSettings(tenantId);
    const hw = settings?.homework as Record<string, unknown> | undefined;
    return {
      max_attachment_size_mb: (hw?.max_attachment_size_mb as number) ?? 10,
      max_attachments_per_assignment: (hw?.max_attachments_per_assignment as number) ?? 5,
    };
  }
}
