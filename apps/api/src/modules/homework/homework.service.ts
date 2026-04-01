import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { HomeworkStatus, HomeworkType } from '@school/shared';
import { VALID_HOMEWORK_TRANSITIONS } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import type { CreateHomeworkDto } from './dto/create-homework.dto';
import type { ListHomeworkQuery } from './dto/list-homework.dto';
import type { UpdateHomeworkDto } from './dto/update-homework.dto';

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

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface AddAttachmentDto {
  attachment_type: 'file' | 'link' | 'video';
  file_name?: string;
  url?: string;
  file_key?: string;
  file_size_bytes?: number;
  mime_type?: string;
  display_order: number;
}

interface CopyHomeworkDto {
  due_date: string;
  due_time?: string;
}

interface UpdateStatusDto {
  status: 'published' | 'archived';
}

interface CreateRecurrenceRuleDto {
  frequency: 'daily' | 'weekly' | 'custom';
  interval: number;
  days_of_week: number[];
  start_date: string;
  end_date?: string;
}

interface UpdateRecurrenceRuleDto {
  frequency?: 'daily' | 'weekly' | 'custom';
  interval?: number;
  days_of_week?: number[];
  start_date?: string;
  end_date?: string;
}

interface BulkCreateDto {
  recurrence_rule_id: string;
  template_homework_id?: string;
  class_id: string;
  subject_id?: string;
  academic_year_id: string;
  academic_period_id?: string;
  title: string;
  homework_type: HomeworkType;
  description?: string;
  max_points?: number;
  start_date: string;
  end_date: string;
}

interface TemplateQuery {
  page: number;
  pageSize: number;
  class_id?: string;
  subject_id?: string;
  search?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class HomeworkService {
  private readonly logger = new Logger(HomeworkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateHomeworkDto) {
    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.homeworkAssignment.create({
        data: {
          tenant_id: tenantId,
          class_id: dto.class_id,
          subject_id: dto.subject_id ?? null,
          academic_year_id: dto.academic_year_id,
          academic_period_id: dto.academic_period_id ?? null,
          assigned_by_user_id: userId,
          title: dto.title,
          description: dto.description ?? null,
          homework_type: dto.homework_type,
          status: 'draft',
          due_date: new Date(dto.due_date),
          due_time: dto.due_time ? new Date(`1970-01-01T${dto.due_time}`) : null,
          max_points: dto.max_points ?? null,
          copied_from_id: dto.copied_from_id ?? null,
          recurrence_rule_id: dto.recurrence_rule_id ?? null,
        },
        include: {
          class_entity: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          assigned_by: { select: { id: true, first_name: true, last_name: true } },
        },
      });
    });
  }

  // ─── List ─────────────────────────────────────────────────────────────────────

  async list(tenantId: string, query: ListHomeworkQuery) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
    };

    if (query.class_id) where.class_id = query.class_id;
    if (query.subject_id) where.subject_id = query.subject_id;
    if (query.academic_year_id) where.academic_year_id = query.academic_year_id;
    if (query.academic_period_id) where.academic_period_id = query.academic_period_id;
    if (query.status) where.status = query.status;
    if (query.homework_type) where.homework_type = query.homework_type;
    if (query.assigned_by_user_id) where.assigned_by_user_id = query.assigned_by_user_id;

    if (query.due_date_from || query.due_date_to) {
      const dueDateFilter: Record<string, Date> = {};
      if (query.due_date_from) dueDateFilter.gte = new Date(query.due_date_from);
      if (query.due_date_to) dueDateFilter.lte = new Date(query.due_date_to);
      where.due_date = dueDateFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma.homeworkAssignment.findMany({
        where,
        include: {
          class_entity: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          assigned_by: { select: { id: true, first_name: true, last_name: true } },
          attachments: true,
          _count: { select: { completions: true } },
        },
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.homeworkAssignment.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const assignment = await this.prisma.homeworkAssignment.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        class_entity: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        academic_year: { select: { id: true, name: true } },
        academic_period: { select: { id: true, name: true } },
        assigned_by: { select: { id: true, first_name: true, last_name: true } },
        recurrence_rule: true,
        attachments: { orderBy: { display_order: 'asc' } },
        completions: {
          include: {
            student: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        },
        _count: { select: { completions: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Homework assignment with id "${id}" not found`,
      });
    }

    return assignment;
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, userId: string, dto: UpdateHomeworkDto) {
    const existing = await this.prisma.homeworkAssignment.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Homework assignment with id "${id}" not found`,
      });
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException({
        code: 'HOMEWORK_NOT_EDITABLE',
        message: `Only draft assignments can be edited. Current status: "${existing.status}"`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const data: Record<string, unknown> = {};
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.class_id !== undefined) data.class_id = dto.class_id;
      if (dto.subject_id !== undefined) data.subject_id = dto.subject_id ?? null;
      if (dto.academic_year_id !== undefined) data.academic_year_id = dto.academic_year_id;
      if (dto.academic_period_id !== undefined)
        data.academic_period_id = dto.academic_period_id ?? null;
      if (dto.homework_type !== undefined) data.homework_type = dto.homework_type;
      if (dto.due_date !== undefined) data.due_date = new Date(dto.due_date);
      if (dto.due_time !== undefined)
        data.due_time = dto.due_time ? new Date(`1970-01-01T${dto.due_time}`) : null;
      if (dto.max_points !== undefined) data.max_points = dto.max_points ?? null;
      if (dto.recurrence_rule_id !== undefined)
        data.recurrence_rule_id = dto.recurrence_rule_id ?? null;

      return db.homeworkAssignment.update({
        where: { id },
        data,
        include: {
          class_entity: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          assigned_by: { select: { id: true, first_name: true, last_name: true } },
        },
      });
    });
  }

  // ─── Update Status (state machine) ────────────────────────────────────────────

  async updateStatus(tenantId: string, id: string, dto: UpdateStatusDto) {
    const existing = await this.prisma.homeworkAssignment.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Homework assignment with id "${id}" not found`,
      });
    }

    const currentStatus = existing.status as HomeworkStatus;
    const targetStatus = dto.status as HomeworkStatus;
    const validTargets = VALID_HOMEWORK_TRANSITIONS[currentStatus];

    if (!validTargets.includes(targetStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${currentStatus}" to "${targetStatus}". Valid transitions: ${validTargets.join(', ') || 'none'}`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const data: Record<string, unknown> = {
        status: targetStatus,
      };

      if (targetStatus === 'published') {
        data.published_at = new Date();
      }

      return db.homeworkAssignment.update({
        where: { id },
        data,
        include: {
          class_entity: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          assigned_by: { select: { id: true, first_name: true, last_name: true } },
        },
      });
    });
  }

  // ─── Copy ─────────────────────────────────────────────────────────────────────

  async copy(tenantId: string, id: string, userId: string, dto: CopyHomeworkDto) {
    const source = await this.prisma.homeworkAssignment.findFirst({
      where: { id, tenant_id: tenantId },
      include: { attachments: true },
    });

    if (!source) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Source homework assignment with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const newAssignment = await db.homeworkAssignment.create({
        data: {
          tenant_id: tenantId,
          class_id: source.class_id,
          subject_id: source.subject_id,
          academic_year_id: source.academic_year_id,
          academic_period_id: source.academic_period_id,
          assigned_by_user_id: userId,
          title: source.title,
          description: source.description,
          homework_type: source.homework_type,
          status: 'draft',
          due_date: new Date(dto.due_date),
          due_time: dto.due_time ? new Date(`1970-01-01T${dto.due_time}`) : source.due_time,
          max_points: source.max_points,
          copied_from_id: source.id,
          recurrence_rule_id: source.recurrence_rule_id,
        },
        include: {
          class_entity: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          assigned_by: { select: { id: true, first_name: true, last_name: true } },
        },
      });

      // Copy attachments (link/video references only; file keys point to same S3 objects)
      if (source.attachments.length > 0) {
        await db.homeworkAttachment.createMany({
          data: source.attachments.map((att) => ({
            tenant_id: tenantId,
            homework_assignment_id: newAssignment.id,
            attachment_type: att.attachment_type,
            file_name: att.file_name,
            file_key: att.file_key,
            file_size_bytes: att.file_size_bytes,
            mime_type: att.mime_type,
            url: att.url,
            display_order: att.display_order,
          })),
        });
      }

      return newAssignment;
    });
  }

  // ─── Remove ───────────────────────────────────────────────────────────────────

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.homeworkAssignment.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        attachments: { where: { attachment_type: 'file' } },
      },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Homework assignment with id "${id}" not found`,
      });
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException({
        code: 'HOMEWORK_NOT_DELETABLE',
        message: `Only draft assignments can be deleted. Current status: "${existing.status}"`,
      });
    }

    // Delete S3 files for any file-type attachments
    for (const att of existing.attachments) {
      if (att.file_key) {
        try {
          await this.s3Service.delete(att.file_key);
        } catch (err) {
          this.logger.error(
            `Failed to delete S3 object "${att.file_key}" for attachment "${att.id}"`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Attachments cascade-delete with the assignment, but we already cleaned S3
      await db.homeworkAssignment.delete({ where: { id } });
    });
  }

  // ─── Tenant homework settings ──────────────────────────────────────────────

  private async getHomeworkSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = tenant?.settings as Record<string, unknown> | null;
    const hw = settings?.homework as Record<string, unknown> | undefined;
    return {
      max_attachment_size_mb: (hw?.max_attachment_size_mb as number) ?? 10,
      max_attachments_per_assignment: (hw?.max_attachments_per_assignment as number) ?? 5,
      allow_student_self_report: (hw?.allow_student_self_report as boolean) ?? true,
      require_teacher_verification: (hw?.require_teacher_verification as boolean) ?? false,
      default_due_time: (hw?.default_due_time as string) ?? '09:00',
    };
  }

  // ─── Add Attachment ───────────────────────────────────────────────────────────

  async addAttachment(tenantId: string, homeworkId: string, dto: AddAttachmentDto) {
    const assignment = await this.prisma.homeworkAssignment.findFirst({
      where: { id: homeworkId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!assignment) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Homework assignment with id "${homeworkId}" not found`,
      });
    }

    const settings = await this.getHomeworkSettings(tenantId);
    const currentCount = await this.prisma.homeworkAttachment.count({
      where: { tenant_id: tenantId, homework_assignment_id: homeworkId },
    });
    if (currentCount >= settings.max_attachments_per_assignment) {
      throw new BadRequestException({
        code: 'MAX_ATTACHMENTS_REACHED',
        message: `Maximum ${settings.max_attachments_per_assignment} attachments per assignment`,
      });
    }

    if (dto.attachment_type === 'file') {
      if (!dto.mime_type || !ALLOWED_MIME_TYPES.includes(dto.mime_type)) {
        throw new BadRequestException({
          code: 'INVALID_MIME_TYPE',
          message: `Unsupported file type "${dto.mime_type}". Allowed: PDF, DOCX, XLSX, PPTX, PNG, JPG, WebP, ZIP`,
        });
      }

      const maxSizeBytes = settings.max_attachment_size_mb * BYTES_PER_MB;
      if (dto.file_size_bytes && dto.file_size_bytes > maxSizeBytes) {
        throw new BadRequestException({
          code: 'FILE_TOO_LARGE',
          message: `File size ${dto.file_size_bytes} bytes exceeds maximum ${settings.max_attachment_size_mb}MB`,
        });
      }
    }

    if ((dto.attachment_type === 'link' || dto.attachment_type === 'video') && !dto.url) {
      throw new BadRequestException({
        code: 'URL_REQUIRED',
        message: `URL is required for "${dto.attachment_type}" attachments`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.homeworkAttachment.create({
        data: {
          tenant_id: tenantId,
          homework_assignment_id: homeworkId,
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

  // ─── Remove Attachment ────────────────────────────────────────────────────────

  async removeAttachment(tenantId: string, homeworkId: string, attachmentId: string) {
    const attachment = await this.prisma.homeworkAttachment.findFirst({
      where: {
        id: attachmentId,
        homework_assignment_id: homeworkId,
        tenant_id: tenantId,
      },
    });

    if (!attachment) {
      throw new NotFoundException({
        code: 'ATTACHMENT_NOT_FOUND',
        message: `Attachment with id "${attachmentId}" not found on homework "${homeworkId}"`,
      });
    }

    // Delete from S3 if it is a file attachment
    if (attachment.attachment_type === 'file' && attachment.file_key) {
      try {
        await this.s3Service.delete(attachment.file_key);
      } catch (err) {
        this.logger.error(
          `Failed to delete S3 object "${attachment.file_key}" for attachment "${attachmentId}"`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.homeworkAttachment.delete({ where: { id: attachmentId } });
    });
  }

  // ─── Find By Class ────────────────────────────────────────────────────────────

  async findByClass(tenantId: string, classId: string, query: ListHomeworkQuery) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      class_id: classId,
    };

    if (query.status) where.status = query.status;
    if (query.homework_type) where.homework_type = query.homework_type;
    if (query.subject_id) where.subject_id = query.subject_id;
    if (query.assigned_by_user_id) where.assigned_by_user_id = query.assigned_by_user_id;

    if (query.due_date_from || query.due_date_to) {
      const dueDateFilter: Record<string, Date> = {};
      if (query.due_date_from) dueDateFilter.gte = new Date(query.due_date_from);
      if (query.due_date_to) dueDateFilter.lte = new Date(query.due_date_to);
      where.due_date = dueDateFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma.homeworkAssignment.findMany({
        where,
        include: {
          subject: { select: { id: true, name: true } },
          assigned_by: { select: { id: true, first_name: true, last_name: true } },
          attachments: true,
          _count: { select: { completions: true } },
        },
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.homeworkAssignment.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }

  // ─── Find By Class Week ───────────────────────────────────────────────────────

  async findByClassWeek(tenantId: string, classId: string, weekStart?: string) {
    // Calculate Monday of the target week
    const startDate = weekStart ? new Date(weekStart) : new Date();

    // Adjust to Monday (day 1). Sunday = 0, so we map: Sun -> -6, Mon -> 0, Tue -> -1 etc.
    const day = startDate.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(startDate);
    monday.setDate(monday.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const data = await this.prisma.homeworkAssignment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        due_date: {
          gte: monday,
          lte: sunday,
        },
      },
      include: {
        subject: { select: { id: true, name: true } },
        assigned_by: { select: { id: true, first_name: true, last_name: true } },
        attachments: true,
        _count: { select: { completions: true } },
      },
      orderBy: { due_date: 'asc' },
    });

    return {
      data,
      week_start: monday.toISOString().split('T')[0],
      week_end: sunday.toISOString().split('T')[0],
    };
  }

  // ─── Find Today (teacher's view) ──────────────────────────────────────────────

  async findToday(tenantId: string, userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const data = await this.prisma.homeworkAssignment.findMany({
      where: {
        tenant_id: tenantId,
        assigned_by_user_id: userId,
        due_date: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        class_entity: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        attachments: true,
        _count: { select: { completions: true } },
      },
      orderBy: { due_time: 'asc' },
    });

    return { data };
  }

  // ─── Find Templates ───────────────────────────────────────────────────────────

  async findTemplates(tenantId: string, query: TemplateQuery) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      status: { in: ['published', 'archived'] },
    };

    if (query.class_id) where.class_id = query.class_id;
    if (query.subject_id) where.subject_id = query.subject_id;

    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.homeworkAssignment.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          homework_type: true,
          status: true,
          due_date: true,
          max_points: true,
          created_at: true,
          class_entity: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          assigned_by: { select: { id: true, first_name: true, last_name: true } },
          _count: { select: { attachments: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.homeworkAssignment.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
      },
    };
  }

  // ─── Recurrence Rule CRUD ─────────────────────────────────────────────────────

  async createRecurrenceRule(tenantId: string, dto: CreateRecurrenceRuleDto) {
    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.homeworkRecurrenceRule.create({
        data: {
          tenant_id: tenantId,
          frequency: dto.frequency,
          interval: dto.interval,
          days_of_week: dto.days_of_week,
          start_date: new Date(dto.start_date),
          end_date: dto.end_date ? new Date(dto.end_date) : null,
          active: true,
        },
      });
    });
  }

  async updateRecurrenceRule(tenantId: string, id: string, dto: UpdateRecurrenceRuleDto) {
    const existing = await this.prisma.homeworkRecurrenceRule.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'RECURRENCE_RULE_NOT_FOUND',
        message: `Recurrence rule with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const data: Record<string, unknown> = {};
      if (dto.frequency !== undefined) data.frequency = dto.frequency;
      if (dto.interval !== undefined) data.interval = dto.interval;
      if (dto.days_of_week !== undefined) data.days_of_week = dto.days_of_week;
      if (dto.start_date !== undefined) data.start_date = new Date(dto.start_date);
      if (dto.end_date !== undefined) data.end_date = dto.end_date ? new Date(dto.end_date) : null;

      return db.homeworkRecurrenceRule.update({
        where: { id },
        data,
      });
    });
  }

  async deleteRecurrenceRule(tenantId: string, id: string) {
    const existing = await this.prisma.homeworkRecurrenceRule.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'RECURRENCE_RULE_NOT_FOUND',
        message: `Recurrence rule with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.homeworkRecurrenceRule.delete({ where: { id } });
    });
  }

  // ─── Bulk Create ──────────────────────────────────────────────────────────────

  async bulkCreate(tenantId: string, userId: string, dto: BulkCreateDto) {
    const rule = await this.prisma.homeworkRecurrenceRule.findFirst({
      where: { id: dto.recurrence_rule_id, tenant_id: tenantId },
    });

    if (!rule) {
      throw new NotFoundException({
        code: 'RECURRENCE_RULE_NOT_FOUND',
        message: `Recurrence rule with id "${dto.recurrence_rule_id}" not found`,
      });
    }

    // If a template is specified, load it for field defaults
    let template: {
      title: string;
      description: string | null;
      homework_type: HomeworkType;
      max_points: number | null;
      class_id: string;
      subject_id: string | null;
      academic_year_id: string;
      academic_period_id: string | null;
    } | null = null;

    if (dto.template_homework_id) {
      template = await this.prisma.homeworkAssignment.findFirst({
        where: { id: dto.template_homework_id, tenant_id: tenantId },
        select: {
          title: true,
          description: true,
          homework_type: true,
          max_points: true,
          class_id: true,
          subject_id: true,
          academic_year_id: true,
          academic_period_id: true,
        },
      });

      if (!template) {
        throw new NotFoundException({
          code: 'TEMPLATE_HOMEWORK_NOT_FOUND',
          message: `Template homework with id "${dto.template_homework_id}" not found`,
        });
      }
    }

    // Generate dates from the recurrence rule within the start/end range
    const dates = this.generateRecurrenceDates(rule, dto.start_date, dto.end_date);

    if (dates.length === 0) {
      throw new BadRequestException({
        code: 'NO_DATES_GENERATED',
        message: `No dates could be generated from the recurrence rule within the specified range`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const assignments = [];
      for (const date of dates) {
        const assignment = await db.homeworkAssignment.create({
          data: {
            tenant_id: tenantId,
            class_id: template?.class_id ?? dto.class_id,
            subject_id: template?.subject_id ?? dto.subject_id ?? null,
            academic_year_id: template?.academic_year_id ?? dto.academic_year_id,
            academic_period_id: template?.academic_period_id ?? dto.academic_period_id ?? null,
            assigned_by_user_id: userId,
            title: template?.title ?? dto.title,
            description: template?.description ?? dto.description ?? null,
            homework_type: template?.homework_type ?? dto.homework_type,
            status: 'draft',
            due_date: date,
            max_points: template?.max_points ?? dto.max_points ?? null,
            recurrence_rule_id: rule.id,
          },
        });
        assignments.push(assignment);
      }

      return { data: assignments, count: assignments.length };
    });
  }

  // ─── Date generation helper ───────────────────────────────────────────────────

  /**
   * Generates an array of dates from a recurrence rule within the specified range.
   * Supports daily, weekly, and custom (specific days of week) frequencies.
   */
  private generateRecurrenceDates(
    rule: {
      frequency: string;
      interval: number;
      days_of_week: number[];
      start_date: Date;
      end_date: Date | null;
    },
    rangeStart: string,
    rangeEnd: string,
  ): Date[] {
    const dates: Date[] = [];
    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);

    // Respect the rule's own end date as a ceiling
    const ruleEnd = rule.end_date ? new Date(rule.end_date) : null;
    const effectiveEnd = ruleEnd && ruleEnd < end ? ruleEnd : end;

    // Safety limit to prevent runaway loops
    const MAX_DATES = 365;

    if (rule.frequency === 'daily') {
      const cursor = new Date(start);
      while (cursor <= effectiveEnd && dates.length < MAX_DATES) {
        dates.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + rule.interval);
      }
    } else if (rule.frequency === 'weekly') {
      // Weekly: advance by (interval) weeks, generate on each days_of_week entry
      const daysSet = new Set(rule.days_of_week);
      const cursor = new Date(start);
      while (cursor <= effectiveEnd && dates.length < MAX_DATES) {
        if (daysSet.has(cursor.getDay())) {
          dates.push(new Date(cursor));
        }
        cursor.setDate(cursor.getDate() + 1);
        // Skip ahead when we've passed a full week
        if (cursor.getDay() === start.getDay() && rule.interval > 1) {
          cursor.setDate(cursor.getDate() + 7 * (rule.interval - 1));
        }
      }
    } else if (rule.frequency === 'custom') {
      // Custom: specific days of the week, every interval weeks
      const daysSet = new Set(rule.days_of_week);
      const cursor = new Date(start);
      while (cursor <= effectiveEnd && dates.length < MAX_DATES) {
        if (daysSet.has(cursor.getDay())) {
          dates.push(new Date(cursor));
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return dates;
  }
}
