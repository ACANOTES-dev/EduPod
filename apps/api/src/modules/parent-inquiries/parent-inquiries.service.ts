import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';

interface ListInquiriesFilters {
  page: number;
  pageSize: number;
  status?: string;
}

@Injectable()
export class ParentInquiriesService {
  private readonly logger = new Logger(ParentInquiriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  async listForAdmin(tenantId: string, filters: ListInquiriesFilters) {
    const { page, pageSize, status } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) where.status = status;

    const [inquiries, total] = await Promise.all([
      this.prisma.parentInquiry.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updated_at: 'desc' },
        include: {
          parent: { select: { id: true, first_name: true, last_name: true } },
          student: { select: { id: true, first_name: true, last_name: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.parentInquiry.count({ where }),
    ]);

    return { data: inquiries, meta: { page, pageSize, total } };
  }

  async listForParent(tenantId: string, userId: string, filters: ListInquiriesFilters) {
    const parent = await this.resolveParent(tenantId, userId);
    const { page, pageSize, status } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      parent_id: parent.id,
    };
    if (status) where.status = status;

    const [inquiries, total] = await Promise.all([
      this.prisma.parentInquiry.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updated_at: 'desc' },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.parentInquiry.count({ where }),
    ]);

    return { data: inquiries, meta: { page, pageSize, total } };
  }

  async getByIdForAdmin(tenantId: string, id: string) {
    const inquiry = await this.prisma.parentInquiry.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        parent: { select: { id: true, first_name: true, last_name: true } },
        student: { select: { id: true, first_name: true, last_name: true } },
        messages: {
          orderBy: { created_at: 'asc' },
          include: {
            author: { select: { id: true, first_name: true, last_name: true } },
          },
        },
      },
    });

    if (!inquiry) {
      throw new NotFoundException({
        code: 'INQUIRY_NOT_FOUND',
        message: `Inquiry with id "${id}" not found`,
      });
    }

    return inquiry;
  }

  async getByIdForParent(tenantId: string, userId: string, id: string) {
    const parent = await this.resolveParent(tenantId, userId);

    const inquiry = await this.prisma.parentInquiry.findFirst({
      where: { id, tenant_id: tenantId, parent_id: parent.id },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        messages: {
          orderBy: { created_at: 'asc' },
          include: {
            author: { select: { id: true, first_name: true, last_name: true } },
          },
        },
      },
    });

    if (!inquiry) {
      throw new NotFoundException({
        code: 'INQUIRY_NOT_FOUND',
        message: `Inquiry with id "${id}" not found`,
      });
    }

    // Mask admin author details
    const maskedMessages = inquiry.messages.map((msg) => ({
      ...msg,
      author:
        msg.author_type === 'admin'
          ? { id: msg.author_user_id, first_name: 'School', last_name: 'Administration' }
          : msg.author,
    }));

    return { ...inquiry, messages: maskedMessages };
  }

  async create(
    tenantId: string,
    userId: string,
    dto: { subject: string; message: string; student_id?: string | null },
  ) {
    const parent = await this.resolveParent(tenantId, userId);

    // Validate student belongs to this parent
    if (dto.student_id) {
      const link = await this.prisma.studentParent.findFirst({
        where: {
          tenant_id: tenantId,
          parent_id: parent.id,
          student_id: dto.student_id,
        },
      });
      if (!link) {
        throw new BadRequestException({
          code: 'STUDENT_NOT_LINKED',
          message: 'The specified student is not linked to your account',
        });
      }
    }

    const inquiry = await this.prisma.parentInquiry.create({
      data: {
        tenant_id: tenantId,
        parent_id: parent.id,
        student_id: dto.student_id ?? null,
        subject: dto.subject,
        status: 'open',
      },
    });

    await this.prisma.parentInquiryMessage.create({
      data: {
        tenant_id: tenantId,
        inquiry_id: inquiry.id,
        author_type: 'parent',
        author_user_id: userId,
        message: dto.message,
      },
    });

    // Notify admins with inquiries.view permission
    try {
      await this.notificationsQueue.add(
        'communications:inquiry-notification',
        {
          tenant_id: tenantId,
          inquiry_id: inquiry.id,
          message_id: inquiry.id,
          notify_type: 'admin_notify',
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
      );
    } catch (error) {
      this.logger.warn(`Failed to enqueue inquiry notification: ${error}`);
    }

    return inquiry;
  }

  async addAdminMessage(
    tenantId: string,
    userId: string,
    inquiryId: string,
    dto: { message: string },
  ) {
    const inquiry = await this.prisma.parentInquiry.findFirst({
      where: { id: inquiryId, tenant_id: tenantId },
    });

    if (!inquiry) {
      throw new NotFoundException({
        code: 'INQUIRY_NOT_FOUND',
        message: `Inquiry with id "${inquiryId}" not found`,
      });
    }

    if (inquiry.status === 'closed') {
      throw new BadRequestException({
        code: 'INQUIRY_CLOSED',
        message: 'Cannot add messages to a closed inquiry',
      });
    }

    const message = await this.prisma.parentInquiryMessage.create({
      data: {
        tenant_id: tenantId,
        inquiry_id: inquiryId,
        author_type: 'admin',
        author_user_id: userId,
        message: dto.message,
      },
    });

    // Auto-transition open → in_progress
    if (inquiry.status === 'open') {
      await this.prisma.parentInquiry.update({
        where: { id: inquiryId },
        data: { status: 'in_progress' },
      });
    }

    // Notify parent
    try {
      await this.notificationsQueue.add(
        'communications:inquiry-notification',
        {
          tenant_id: tenantId,
          inquiry_id: inquiryId,
          message_id: message.id,
          notify_type: 'parent_notify',
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
      );
    } catch (error) {
      this.logger.warn(`Failed to enqueue inquiry notification: ${error}`);
    }

    return message;
  }

  async addParentMessage(
    tenantId: string,
    userId: string,
    inquiryId: string,
    dto: { message: string },
  ) {
    const parent = await this.resolveParent(tenantId, userId);

    const inquiry = await this.prisma.parentInquiry.findFirst({
      where: { id: inquiryId, tenant_id: tenantId, parent_id: parent.id },
    });

    if (!inquiry) {
      throw new NotFoundException({
        code: 'INQUIRY_NOT_FOUND',
        message: `Inquiry with id "${inquiryId}" not found`,
      });
    }

    if (inquiry.status === 'closed') {
      throw new BadRequestException({
        code: 'INQUIRY_CLOSED',
        message: 'Cannot add messages to a closed inquiry',
      });
    }

    const message = await this.prisma.parentInquiryMessage.create({
      data: {
        tenant_id: tenantId,
        inquiry_id: inquiryId,
        author_type: 'parent',
        author_user_id: userId,
        message: dto.message,
      },
    });

    // Notify admins
    try {
      await this.notificationsQueue.add(
        'communications:inquiry-notification',
        {
          tenant_id: tenantId,
          inquiry_id: inquiryId,
          message_id: message.id,
          notify_type: 'admin_notify',
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
      );
    } catch (error) {
      this.logger.warn(`Failed to enqueue inquiry notification: ${error}`);
    }

    return message;
  }

  async close(tenantId: string, inquiryId: string) {
    const inquiry = await this.prisma.parentInquiry.findFirst({
      where: { id: inquiryId, tenant_id: tenantId },
    });

    if (!inquiry) {
      throw new NotFoundException({
        code: 'INQUIRY_NOT_FOUND',
        message: `Inquiry with id "${inquiryId}" not found`,
      });
    }

    if (inquiry.status === 'closed') {
      throw new BadRequestException({
        code: 'ALREADY_CLOSED',
        message: 'Inquiry is already closed',
      });
    }

    return this.prisma.parentInquiry.update({
      where: { id: inquiryId },
      data: { status: 'closed' },
    });
  }

  private async resolveParent(tenantId: string, userId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { tenant_id: tenantId, user_id: userId },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent record linked to your account',
      });
    }

    return parent;
  }
}
