import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import type {
  CreateEngagementFormTemplateDto,
  DistributeFormDto,
  UpdateEngagementFormTemplateDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ListFormTemplatesQuery {
  page: number;
  pageSize: number;
  status?: string;
  form_type?: string;
  consent_type?: string;
}

// ─── Status transition map ────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['published'],
  published: ['archived'],
  archived: [],
};

@Injectable()
export class FormTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('engagement') private readonly engagementQueue: Queue,
  ) {}

  // ─── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateEngagementFormTemplateDto, userId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.engagementFormTemplate.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          description: dto.description ?? null,
          form_type: dto.form_type,
          consent_type: dto.consent_type ?? null,
          fields_json: dto.fields_json as Prisma.InputJsonValue,
          requires_signature: dto.requires_signature,
          academic_year_id: dto.academic_year_id ?? null,
          created_by_user_id: userId,
          status: 'draft',
        },
      });
    });
  }

  // ─── List (paginated) ───────────────────────────────────────────────────────

  async findAll(tenantId: string, query: ListFormTemplatesQuery) {
    const { page, pageSize, status, form_type, consent_type } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.EngagementFormTemplateWhereInput = {
      tenant_id: tenantId,
    };
    if (status) where.status = status as Prisma.EnumEngagementFormStatusFilter;
    if (form_type) where.form_type = form_type as Prisma.EnumEngagementFormTypeFilter;
    if (consent_type) where.consent_type = consent_type as Prisma.EnumConsentTypeNullableFilter;

    const [data, total] = await Promise.all([
      this.prisma.engagementFormTemplate.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.engagementFormTemplate.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── Get by ID ──────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const template = await this.prisma.engagementFormTemplate.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'FORM_TEMPLATE_NOT_FOUND',
        message: `Form template with id "${id}" not found`,
      });
    }

    return template;
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateEngagementFormTemplateDto) {
    const template = await this.prisma.engagementFormTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'FORM_TEMPLATE_NOT_FOUND',
        message: `Form template with id "${id}" not found`,
      });
    }

    await this.ensureNoSubmissions(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updateData: Prisma.EngagementFormTemplateUncheckedUpdateInput = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.form_type !== undefined) updateData.form_type = dto.form_type;
      if (dto.consent_type !== undefined) updateData.consent_type = dto.consent_type;
      if (dto.fields_json !== undefined)
        updateData.fields_json = dto.fields_json as Prisma.InputJsonValue;
      if (dto.requires_signature !== undefined)
        updateData.requires_signature = dto.requires_signature;
      if (dto.academic_year_id !== undefined) updateData.academic_year_id = dto.academic_year_id;

      return db.engagementFormTemplate.update({
        where: { id },
        data: updateData,
      });
    });
  }

  // ─── Delete ─────────────────────────────────────────────────────────────────

  async delete(tenantId: string, id: string) {
    const template = await this.prisma.engagementFormTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'FORM_TEMPLATE_NOT_FOUND',
        message: `Form template with id "${id}" not found`,
      });
    }

    if (template.status !== 'draft') {
      throw new BadRequestException({
        code: 'TEMPLATE_NOT_DRAFT',
        message: 'Only draft templates can be deleted',
      });
    }

    await this.ensureNoSubmissions(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.engagementFormTemplate.delete({ where: { id } });
    });
  }

  // ─── Publish ────────────────────────────────────────────────────────────────

  async publish(tenantId: string, id: string) {
    const template = await this.prisma.engagementFormTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'FORM_TEMPLATE_NOT_FOUND',
        message: `Form template with id "${id}" not found`,
      });
    }

    this.validateTransition(template.status, 'published');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.engagementFormTemplate.update({
        where: { id },
        data: { status: 'published' },
      });
    });
  }

  // ─── Archive ────────────────────────────────────────────────────────────────

  async archive(tenantId: string, id: string) {
    const template = await this.prisma.engagementFormTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'FORM_TEMPLATE_NOT_FOUND',
        message: `Form template with id "${id}" not found`,
      });
    }

    this.validateTransition(template.status, 'archived');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.engagementFormTemplate.update({
        where: { id },
        data: { status: 'archived' },
      });
    });
  }

  // ─── Distribute ─────────────────────────────────────────────────────────────

  async distribute(tenantId: string, id: string, dto: DistributeFormDto) {
    const template = await this.prisma.engagementFormTemplate.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'FORM_TEMPLATE_NOT_FOUND',
        message: `Form template with id "${id}" not found`,
      });
    }

    if (template.status !== 'published') {
      throw new BadRequestException({
        code: 'TEMPLATE_NOT_PUBLISHED',
        message: 'Only published templates can be distributed',
      });
    }

    await this.engagementQueue.add(
      'engagement:distribute-forms',
      {
        tenant_id: tenantId,
        form_template_id: id,
        target_type: dto.target_type,
        target_ids: dto.target_ids,
        deadline: dto.deadline,
        event_id: dto.event_id,
      },
      { removeOnComplete: 10, removeOnFail: 50 },
    );

    return { queued: true };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Reject mutations on templates that already have submissions.
   */
  private async ensureNoSubmissions(tenantId: string, templateId: string): Promise<void> {
    const submissionCount = await this.prisma.engagementFormSubmission.count({
      where: { tenant_id: tenantId, form_template_id: templateId },
    });

    if (submissionCount > 0) {
      throw new BadRequestException({
        code: 'TEMPLATE_IMMUTABLE',
        message:
          'Cannot modify a template that has been distributed. Create a new version instead.',
      });
    }
  }

  /**
   * Validate that the requested status transition is allowed.
   */
  private validateTransition(currentStatus: string, targetStatus: string): void {
    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${currentStatus}" to "${targetStatus}"`,
      });
    }
  }
}
