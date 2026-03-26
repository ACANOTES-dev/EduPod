import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type {
  CreateCategoryDto,
  CreateTemplateDto,
  UpdateCategoryDto,
  UpdateTemplateDto,
} from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BehaviourConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Categories ─────────────────────────────────────────────────────────

  async listCategories(tenantId: string) {
    const data = await this.prisma.behaviourCategory.findMany({
      where: { tenant_id: tenantId },
      orderBy: { display_order: 'asc' },
    });
    return { data };
  }

  async createCategory(tenantId: string, dto: CreateCategoryDto) {
    const existing = await this.prisma.behaviourCategory.findFirst({
      where: { tenant_id: tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CATEGORY_NAME_EXISTS',
        message: `Category "${dto.name}" already exists`,
      });
    }

    return this.prisma.behaviourCategory.create({
      data: {
        tenant_id: tenantId,
        name: dto.name,
        name_ar: dto.name_ar ?? null,
        polarity: dto.polarity as $Enums.BehaviourPolarity,
        severity: dto.severity,
        point_value: dto.point_value,
        color: dto.color ?? null,
        icon: dto.icon ?? null,
        requires_follow_up: dto.requires_follow_up,
        requires_parent_notification: dto.requires_parent_notification,
        parent_visible: dto.parent_visible,
        benchmark_category:
          dto.benchmark_category as $Enums.BenchmarkCategory,
        display_order: dto.display_order,
      },
    });
  }

  async updateCategory(
    tenantId: string,
    id: string,
    dto: UpdateCategoryDto,
  ) {
    const category = await this.prisma.behaviourCategory.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category not found',
      });
    }

    if (dto.name && dto.name !== category.name) {
      const dup = await this.prisma.behaviourCategory.findFirst({
        where: { tenant_id: tenantId, name: dto.name, id: { not: id } },
      });
      if (dup) {
        throw new ConflictException({
          code: 'CATEGORY_NAME_EXISTS',
          message: `Category "${dto.name}" already exists`,
        });
      }
    }

    return this.prisma.behaviourCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.name_ar !== undefined ? { name_ar: dto.name_ar } : {}),
        ...(dto.polarity !== undefined
          ? { polarity: dto.polarity as $Enums.BehaviourPolarity }
          : {}),
        ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
        ...(dto.point_value !== undefined
          ? { point_value: dto.point_value }
          : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.requires_follow_up !== undefined
          ? { requires_follow_up: dto.requires_follow_up }
          : {}),
        ...(dto.requires_parent_notification !== undefined
          ? {
              requires_parent_notification:
                dto.requires_parent_notification,
            }
          : {}),
        ...(dto.parent_visible !== undefined
          ? { parent_visible: dto.parent_visible }
          : {}),
        ...(dto.benchmark_category !== undefined
          ? {
              benchmark_category:
                dto.benchmark_category as $Enums.BenchmarkCategory,
            }
          : {}),
        ...(dto.display_order !== undefined
          ? { display_order: dto.display_order }
          : {}),
      },
    });
  }

  // ─── Description Templates ──────────────────────────────────────────────

  async listTemplates(tenantId: string, categoryId?: string) {
    const where: {
      tenant_id: string;
      is_active: boolean;
      category_id?: string;
    } = {
      tenant_id: tenantId,
      is_active: true,
    };
    if (categoryId) where.category_id = categoryId;

    const data = await this.prisma.behaviourDescriptionTemplate.findMany({
      where,
      orderBy: { display_order: 'asc' },
    });
    return { data };
  }

  async createTemplate(tenantId: string, dto: CreateTemplateDto) {
    return this.prisma.behaviourDescriptionTemplate.create({
      data: {
        tenant_id: tenantId,
        category_id: dto.category_id,
        locale: dto.locale,
        text: dto.text,
        display_order: dto.display_order,
        is_active: dto.is_active,
      },
    });
  }

  async updateTemplate(
    tenantId: string,
    id: string,
    dto: UpdateTemplateDto,
  ) {
    const template =
      await this.prisma.behaviourDescriptionTemplate.findFirst({
        where: { id, tenant_id: tenantId },
      });
    if (!template) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template not found',
      });
    }

    return this.prisma.behaviourDescriptionTemplate.update({
      where: { id },
      data: {
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.text !== undefined ? { text: dto.text } : {}),
        ...(dto.display_order !== undefined
          ? { display_order: dto.display_order }
          : {}),
        ...(dto.is_active !== undefined
          ? { is_active: dto.is_active }
          : {}),
      },
    });
  }
}
