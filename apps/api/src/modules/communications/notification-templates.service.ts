import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

interface ListTemplatesFilters {
  template_key?: string;
  channel?: string;
  locale?: string;
}

@Injectable()
export class NotificationTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, filters: ListTemplatesFilters) {
    const where: Record<string, unknown> = {
      OR: [
        { tenant_id: tenantId },
        { tenant_id: null },
      ],
    };
    if (filters.template_key) {
      where.template_key = filters.template_key;
    }
    if (filters.channel) {
      where.channel = filters.channel;
    }
    if (filters.locale) {
      where.locale = filters.locale;
    }

    return this.prisma.notificationTemplate.findMany({
      where,
      orderBy: [{ template_key: 'asc' }, { locale: 'asc' }],
    });
  }

  async getById(tenantId: string, id: string) {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: {
        id,
        OR: [{ tenant_id: tenantId }, { tenant_id: null }],
      },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `Notification template with id "${id}" not found`,
      });
    }

    return template;
  }

  async create(tenantId: string, dto: {
    channel: string;
    template_key: string;
    locale: string;
    subject_template?: string | null;
    body_template: string;
  }) {
    try {
      return await this.prisma.notificationTemplate.create({
        data: {
          tenant_id: tenantId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          channel: dto.channel as any,
          template_key: dto.template_key,
          locale: dto.locale,
          subject_template: dto.subject_template ?? null,
          body_template: dto.body_template,
          is_system: false,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'TEMPLATE_ALREADY_EXISTS',
          message: `A template with key "${dto.template_key}", channel "${dto.channel}", and locale "${dto.locale}" already exists for this tenant`,
        });
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: {
    subject_template?: string | null;
    body_template?: string;
  }) {
    const template = await this.getById(tenantId, id);

    if (template.is_system) {
      throw new ForbiddenException({
        code: 'SYSTEM_TEMPLATE_READONLY',
        message: 'System templates cannot be edited',
      });
    }

    if (template.tenant_id !== tenantId) {
      throw new ForbiddenException({
        code: 'TEMPLATE_NOT_EDITABLE',
        message: 'Only tenant-level templates can be edited',
      });
    }

    const updateData: Record<string, unknown> = {};
    if (dto.subject_template !== undefined) updateData.subject_template = dto.subject_template;
    if (dto.body_template !== undefined) updateData.body_template = dto.body_template;

    return this.prisma.notificationTemplate.update({
      where: { id },
      data: updateData,
    });
  }

  async resolveTemplate(
    tenantId: string,
    templateKey: string,
    channel: string,
    locale: string,
  ) {
    // Tenant-level first
    const tenantTemplate = await this.prisma.notificationTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        template_key: templateKey,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        channel: channel as any,
        locale,
      },
    });

    if (tenantTemplate) return tenantTemplate;

    // Platform-level fallback
    return this.prisma.notificationTemplate.findFirst({
      where: {
        tenant_id: null,
        template_key: templateKey,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        channel: channel as any,
        locale,
      },
    });
  }
}
