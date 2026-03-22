import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AssessmentCategory, Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { CreateAssessmentCategoryDto, UpdateAssessmentCategoryDto } from './dto/gradebook.dto';

@Injectable()
export class AssessmentCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new assessment category.
   */
  async create(tenantId: string, dto: CreateAssessmentCategoryDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const result = await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        return db.assessmentCategory.create({
          data: {
            tenant_id: tenantId,
            name: dto.name,
            default_weight: dto.default_weight,
          },
        });
      });
      const cat = result as AssessmentCategory;
      return { ...cat, default_weight: Number(cat.default_weight) };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CATEGORY_NAME_EXISTS',
          message: `An assessment category with name "${dto.name}" already exists`,
        });
      }
      throw err;
    }
  }

  /**
   * List all assessment categories (no pagination — typically < 20).
   * Includes `in_use` flag indicating whether any assessments reference the category.
   */
  async findAll(tenantId: string) {
    const categories = await this.prisma.assessmentCategory.findMany({
      where: { tenant_id: tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { assessments: true } },
      },
    });

    const data = categories.map(({ _count, ...cat }) => ({
      ...cat,
      default_weight: Number(cat.default_weight),
      in_use: _count.assessments > 0,
    }));

    return { data };
  }

  /**
   * Get a single assessment category.
   */
  async findOne(tenantId: string, id: string) {
    const category = await this.prisma.assessmentCategory.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Assessment category with id "${id}" not found`,
      });
    }

    return {
      ...category,
      default_weight: Number(category.default_weight),
    };
  }

  /**
   * Update an assessment category.
   */
  async update(tenantId: string, id: string, dto: UpdateAssessmentCategoryDto) {
    const category = await this.prisma.assessmentCategory.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Assessment category with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const result = await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        const updateData: Prisma.AssessmentCategoryUpdateInput = {};
        if (dto.name !== undefined) {
          updateData.name = dto.name;
        }
        if (dto.default_weight !== undefined) {
          updateData.default_weight = dto.default_weight;
        }

        return db.assessmentCategory.update({
          where: { id },
          data: updateData,
        });
      });
      const cat = result as AssessmentCategory;
      return { ...cat, default_weight: Number(cat.default_weight) };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CATEGORY_NAME_EXISTS',
          message: `An assessment category with name "${dto.name}" already exists`,
        });
      }
      throw err;
    }
  }

  /**
   * Delete an assessment category. Blocked if any assessments reference it.
   */
  async delete(tenantId: string, id: string) {
    const category = await this.prisma.assessmentCategory.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Assessment category with id "${id}" not found`,
      });
    }

    const assessmentCount = await this.prisma.assessment.count({
      where: {
        tenant_id: tenantId,
        category_id: id,
      },
    });

    if (assessmentCount > 0) {
      throw new ConflictException({
        code: 'CATEGORY_IN_USE',
        message: 'Cannot delete an assessment category that is referenced by assessments',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.assessmentCategory.delete({ where: { id } });
    });
  }
}
