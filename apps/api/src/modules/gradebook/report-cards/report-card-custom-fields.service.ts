import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateCustomFieldDefDto {
  name: string;
  label: string;
  label_ar?: string | null;
  field_type: 'text' | 'select' | 'rating';
  options_json?: Record<string, unknown> | null;
  section_type: 'conduct' | 'extracurricular' | 'custom';
  display_order?: number;
}

export interface UpdateCustomFieldDefDto {
  label?: string;
  label_ar?: string | null;
  field_type?: 'text' | 'select' | 'rating';
  options_json?: Record<string, unknown> | null;
  section_type?: 'conduct' | 'extracurricular' | 'custom';
  display_order?: number;
}

export interface CustomFieldValueInput {
  field_def_id: string;
  value: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardCustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Field Definition CRUD ────────────────────────────────────────────────

  async createFieldDef(tenantId: string, dto: CreateCustomFieldDefDto) {
    const existing = await this.prisma.reportCardCustomFieldDef.findFirst({
      where: { tenant_id: tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException({
        error: {
          code: 'CUSTOM_FIELD_NAME_TAKEN',
          message: `A custom field named "${dto.name}" already exists`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.reportCardCustomFieldDef.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          label: dto.label,
          label_ar: dto.label_ar ?? null,
          field_type: dto.field_type,
          options_json: dto.options_json
            ? (dto.options_json as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          section_type: dto.section_type,
          display_order: dto.display_order ?? 0,
        },
      });
    });
  }

  async findAllFieldDefs(tenantId: string) {
    return this.prisma.reportCardCustomFieldDef.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ section_type: 'asc' }, { display_order: 'asc' }],
    });
  }

  async findOneFieldDef(tenantId: string, id: string) {
    const fieldDef = await this.prisma.reportCardCustomFieldDef.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!fieldDef) {
      throw new NotFoundException({
        error: {
          code: 'CUSTOM_FIELD_NOT_FOUND',
          message: `Custom field definition "${id}" not found`,
        },
      });
    }
    return fieldDef;
  }

  async updateFieldDef(tenantId: string, id: string, dto: UpdateCustomFieldDefDto) {
    const fieldDef = await this.prisma.reportCardCustomFieldDef.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!fieldDef) {
      throw new NotFoundException({
        error: {
          code: 'CUSTOM_FIELD_NOT_FOUND',
          message: `Custom field definition "${id}" not found`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updateData: Prisma.ReportCardCustomFieldDefUpdateInput = {};
      if (dto.label !== undefined) updateData.label = dto.label;
      if (dto.label_ar !== undefined) updateData.label_ar = dto.label_ar;
      if (dto.field_type !== undefined) updateData.field_type = dto.field_type;
      if (dto.section_type !== undefined) updateData.section_type = dto.section_type;
      if (dto.display_order !== undefined) updateData.display_order = dto.display_order;
      if (dto.options_json !== undefined) {
        updateData.options_json = dto.options_json
          ? (dto.options_json as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull;
      }

      return db.reportCardCustomFieldDef.update({ where: { id }, data: updateData });
    });
  }

  async removeFieldDef(tenantId: string, id: string) {
    const fieldDef = await this.prisma.reportCardCustomFieldDef.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!fieldDef) {
      throw new NotFoundException({
        error: {
          code: 'CUSTOM_FIELD_NOT_FOUND',
          message: `Custom field definition "${id}" not found`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.reportCardCustomFieldDef.delete({ where: { id } });
    });

    return { deleted: true };
  }

  // ─── Field Values ─────────────────────────────────────────────────────────

  async saveFieldValues(
    tenantId: string,
    reportCardId: string,
    userId: string,
    values: CustomFieldValueInput[],
  ) {
    // Validate report card exists
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id: reportCardId, tenant_id: tenantId },
      select: { id: true, status: true },
    });
    if (!reportCard) {
      throw new NotFoundException({
        error: {
          code: 'REPORT_CARD_NOT_FOUND',
          message: `Report card "${reportCardId}" not found`,
        },
      });
    }
    if (reportCard.status !== 'draft') {
      throw new ConflictException({
        error: {
          code: 'REPORT_CARD_NOT_DRAFT',
          message: 'Custom field values can only be set on draft report cards',
        },
      });
    }

    // Validate all field_def_ids belong to this tenant
    const fieldDefIds = values.map((v) => v.field_def_id);
    const fieldDefs = await this.prisma.reportCardCustomFieldDef.findMany({
      where: { id: { in: fieldDefIds }, tenant_id: tenantId },
      select: { id: true },
    });

    const validIds = new Set(fieldDefs.map((f) => f.id));
    const invalidIds = fieldDefIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new NotFoundException({
        error: {
          code: 'CUSTOM_FIELD_NOT_FOUND',
          message: `Custom field definitions not found: ${invalidIds.join(', ')}`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const saved = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const results = [];
      for (const v of values) {
        const result = await db.reportCardCustomFieldValue.upsert({
          where: {
            idx_report_card_custom_field_values_unique: {
              tenant_id: tenantId,
              report_card_id: reportCardId,
              field_def_id: v.field_def_id,
            },
          },
          update: {
            value: v.value,
            entered_by_user_id: userId,
          },
          create: {
            tenant_id: tenantId,
            report_card_id: reportCardId,
            field_def_id: v.field_def_id,
            value: v.value,
            entered_by_user_id: userId,
          },
        });
        results.push(result);
      }
      return results;
    });

    return { saved };
  }

  async getFieldValues(tenantId: string, reportCardId: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id: reportCardId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!reportCard) {
      throw new NotFoundException({
        error: {
          code: 'REPORT_CARD_NOT_FOUND',
          message: `Report card "${reportCardId}" not found`,
        },
      });
    }

    const values = await this.prisma.reportCardCustomFieldValue.findMany({
      where: { tenant_id: tenantId, report_card_id: reportCardId },
      include: {
        field_def: {
          select: {
            id: true,
            name: true,
            label: true,
            label_ar: true,
            field_type: true,
            section_type: true,
            display_order: true,
          },
        },
        entered_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
      orderBy: { field_def: { display_order: 'asc' } },
    });

    return { values };
  }
}
