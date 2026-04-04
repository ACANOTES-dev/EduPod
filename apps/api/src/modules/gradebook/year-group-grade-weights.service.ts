import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import type {
  CopyYearGroupGradeWeightsDto,
  UpsertYearGroupGradeWeightDto,
} from './dto/gradebook.dto';

@Injectable()
export class YearGroupGradeWeightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
  ) {}

  /**
   * Upsert category weight config for a year group + academic period.
   * Validates the year group, academic period, and all category IDs exist.
   */
  async upsert(tenantId: string, dto: UpsertYearGroupGradeWeightDto) {
    // 1. Validate year group exists
    await this.academicReadFacade.findYearGroupByIdOrThrow(tenantId, dto.year_group_id);

    // 2. Validate academic period exists
    const academicPeriod = await this.academicReadFacade.findPeriodById(tenantId, dto.academic_period_id);

    if (!academicPeriod) {
      throw new NotFoundException({
        code: 'ACADEMIC_PERIOD_NOT_FOUND',
        message: `Academic period with id "${dto.academic_period_id}" not found`,
      });
    }

    // 3. Validate all category IDs exist
    const categoryIds = dto.category_weights.map((w) => w.category_id);
    const existingCategories = await this.prisma.assessmentCategory.findMany({
      where: {
        tenant_id: tenantId,
        id: { in: categoryIds },
      },
      select: { id: true },
    });

    const existingCategoryIds = new Set(existingCategories.map((c) => c.id));
    const missingCategoryIds = categoryIds.filter((id) => !existingCategoryIds.has(id));

    if (missingCategoryIds.length > 0) {
      throw new NotFoundException({
        code: 'CATEGORIES_NOT_FOUND',
        message: `Assessment categories not found: ${missingCategoryIds.join(', ')}`,
      });
    }

    // 4. Build the JSON payload matching existing convention
    const categoryWeightsJson = {
      weights: dto.category_weights.map((w) => ({
        category_id: w.category_id,
        weight: w.weight,
      })),
    };

    // 5. Upsert
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.yearGroupGradeWeight.upsert({
        where: {
          idx_year_group_grade_weights_unique: {
            tenant_id: tenantId,
            year_group_id: dto.year_group_id,
            academic_period_id: dto.academic_period_id,
          },
        },
        update: {
          category_weights_json: categoryWeightsJson as unknown as Prisma.InputJsonValue,
        },
        create: {
          tenant_id: tenantId,
          year_group_id: dto.year_group_id,
          academic_period_id: dto.academic_period_id,
          category_weights_json: categoryWeightsJson as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * Return all weight configs for a year group (one per academic period).
   * Includes the period name for display.
   */
  async findByYearGroup(tenantId: string, yearGroupId: string) {
    await this.academicReadFacade.findYearGroupByIdOrThrow(tenantId, yearGroupId);

    const configs = await this.prisma.yearGroupGradeWeight.findMany({
      where: {
        tenant_id: tenantId,
        year_group_id: yearGroupId,
      },
      include: {
        academic_period: {
          select: { id: true, name: true },
        },
      },
      orderBy: { academic_period: { start_date: 'asc' } },
    });

    // Resolve category names
    const allCategoryIds = new Set<string>();
    for (const config of configs) {
      const weights = config.category_weights_json as unknown as {
        weights: Array<{ category_id: string; weight: number }>;
      };
      for (const w of weights.weights) {
        allCategoryIds.add(w.category_id);
      }
    }

    const categories = allCategoryIds.size > 0
      ? await this.prisma.assessmentCategory.findMany({
          where: {
            tenant_id: tenantId,
            id: { in: [...allCategoryIds] },
          },
          select: { id: true, name: true },
        })
      : [];

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    const data = configs.map((config) => {
      const weights = config.category_weights_json as unknown as {
        weights: Array<{ category_id: string; weight: number }>;
      };

      return {
        ...config,
        category_weights: weights.weights.map((w) => ({
          category_id: w.category_id,
          category_name: categoryMap.get(w.category_id) ?? 'Unknown',
          weight: w.weight,
        })),
      };
    });

    return { data };
  }

  /**
   * Return a single weight config for a year group + period.
   */
  async findOne(tenantId: string, yearGroupId: string, periodId: string) {
    const config = await this.prisma.yearGroupGradeWeight.findFirst({
      where: {
        tenant_id: tenantId,
        year_group_id: yearGroupId,
        academic_period_id: periodId,
      },
      include: {
        academic_period: {
          select: { id: true, name: true },
        },
      },
    });

    if (!config) {
      throw new NotFoundException({
        code: 'YEAR_GROUP_GRADE_WEIGHT_NOT_FOUND',
        message: `Grade weight config for year group "${yearGroupId}" and period "${periodId}" not found`,
      });
    }

    return config;
  }

  /**
   * Copy all period weight configs from one year group to another.
   * Overwrites any existing configs on the target.
   */
  async copyFromYearGroup(tenantId: string, dto: CopyYearGroupGradeWeightsDto) {
    // Validate source year group
    await this.academicReadFacade.findYearGroupByIdOrThrow(tenantId, dto.source_year_group_id);

    // Validate target year group
    await this.academicReadFacade.findYearGroupByIdOrThrow(tenantId, dto.target_year_group_id);

    // Fetch all source configs
    const sourceConfigs = await this.prisma.yearGroupGradeWeight.findMany({
      where: {
        tenant_id: tenantId,
        year_group_id: dto.source_year_group_id,
      },
    });

    if (sourceConfigs.length === 0) {
      throw new NotFoundException({
        code: 'NO_SOURCE_CONFIGS',
        message: `No grade weight configs found for source year group "${dto.source_year_group_id}"`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const results = [];
      for (const config of sourceConfigs) {
        const result = await db.yearGroupGradeWeight.upsert({
          where: {
            idx_year_group_grade_weights_unique: {
              tenant_id: tenantId,
              year_group_id: dto.target_year_group_id,
              academic_period_id: config.academic_period_id,
            },
          },
          update: {
            category_weights_json: config.category_weights_json as Prisma.InputJsonValue,
          },
          create: {
            tenant_id: tenantId,
            year_group_id: dto.target_year_group_id,
            academic_period_id: config.academic_period_id,
            category_weights_json: config.category_weights_json as Prisma.InputJsonValue,
          },
        });
        results.push(result);
      }

      return { data: results, copied: results.length };
    });
  }

  /**
   * Delete a weight config for a year group + period.
   */
  async delete(tenantId: string, yearGroupId: string, periodId: string) {
    const config = await this.prisma.yearGroupGradeWeight.findFirst({
      where: {
        tenant_id: tenantId,
        year_group_id: yearGroupId,
        academic_period_id: periodId,
      },
      select: { id: true },
    });

    if (!config) {
      throw new NotFoundException({
        code: 'YEAR_GROUP_GRADE_WEIGHT_NOT_FOUND',
        message: `Grade weight config for year group "${yearGroupId}" and period "${periodId}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.yearGroupGradeWeight.delete({ where: { id: config.id } });
    });
  }
}
