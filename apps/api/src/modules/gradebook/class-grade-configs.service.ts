import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { UpsertGradeConfigDto } from './dto/gradebook.dto';

@Injectable()
export class ClassGradeConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert a class-subject grade configuration.
   * Validates subject is academic, grading scale exists, and all category IDs exist.
   */
  async upsert(
    tenantId: string,
    classId: string,
    subjectId: string,
    dto: UpsertGradeConfigDto,
  ) {
    // 1. Validate class exists
    const classEntity = await this.prisma.class.findFirst({
      where: { id: classId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!classEntity) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${classId}" not found`,
      });
    }

    // 2. Validate subject exists and is academic
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, tenant_id: tenantId },
      select: { id: true, subject_type: true },
    });

    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: `Subject with id "${subjectId}" not found`,
      });
    }

    if (subject.subject_type !== 'academic') {
      throw new BadRequestException({
        code: 'SUBJECT_NOT_ACADEMIC',
        message: 'Grade configurations can only be created for academic subjects',
      });
    }

    // 3. Validate grading scale exists
    const gradingScale = await this.prisma.gradingScale.findFirst({
      where: { id: dto.grading_scale_id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!gradingScale) {
      throw new NotFoundException({
        code: 'GRADING_SCALE_NOT_FOUND',
        message: `Grading scale with id "${dto.grading_scale_id}" not found`,
      });
    }

    // 4. Validate all category IDs exist
    const categoryIds = dto.category_weight_json.weights.map((w) => w.category_id);
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

    // 5. Upsert the config
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.classSubjectGradeConfig.upsert({
        where: {
          idx_grade_configs_class_subject: {
            tenant_id: tenantId,
            class_id: classId,
            subject_id: subjectId,
          },
        },
        update: {
          grading_scale_id: dto.grading_scale_id,
          category_weight_json: dto.category_weight_json as unknown as Prisma.InputJsonValue,
        },
        create: {
          tenant_id: tenantId,
          class_id: classId,
          subject_id: subjectId,
          grading_scale_id: dto.grading_scale_id,
          category_weight_json: dto.category_weight_json as unknown as Prisma.InputJsonValue,
        },
        include: {
          grading_scale: {
            select: { id: true, name: true },
          },
        },
      });
    });
  }

  /**
   * List grade configs for a class, including grading scale and category names.
   */
  async findByClass(tenantId: string, classId: string) {
    const configs = await this.prisma.classSubjectGradeConfig.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
      },
      include: {
        grading_scale: {
          select: { id: true, name: true, config_json: true },
        },
        subject: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { subject: { name: 'asc' } },
    });

    // Resolve category names for each config
    const allCategoryIds = new Set<string>();
    for (const config of configs) {
      const weights = config.category_weight_json as unknown as {
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
      const weights = config.category_weight_json as unknown as {
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
   * Get a specific class-subject grade config.
   */
  async findOne(tenantId: string, classId: string, subjectId: string) {
    const config = await this.prisma.classSubjectGradeConfig.findFirst({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        subject_id: subjectId,
      },
      include: {
        grading_scale: {
          select: { id: true, name: true, config_json: true },
        },
        subject: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!config) {
      throw new NotFoundException({
        code: 'GRADE_CONFIG_NOT_FOUND',
        message: `Grade configuration for class "${classId}" and subject "${subjectId}" not found`,
      });
    }

    return config;
  }

  /**
   * Delete a class-subject grade config.
   * Blocked if graded assessments exist for the class+subject.
   */
  async delete(tenantId: string, classId: string, subjectId: string) {
    const config = await this.prisma.classSubjectGradeConfig.findFirst({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        subject_id: subjectId,
      },
      select: { id: true },
    });

    if (!config) {
      throw new NotFoundException({
        code: 'GRADE_CONFIG_NOT_FOUND',
        message: `Grade configuration for class "${classId}" and subject "${subjectId}" not found`,
      });
    }

    // Check if any graded assessments exist for this class+subject
    const gradedAssessmentCount = await this.prisma.grade.count({
      where: {
        tenant_id: tenantId,
        raw_score: { not: null },
        assessment: {
          class_id: classId,
          subject_id: subjectId,
        },
      },
    });

    if (gradedAssessmentCount > 0) {
      throw new ConflictException({
        code: 'GRADE_CONFIG_HAS_GRADES',
        message: 'Cannot delete grade configuration when graded assessments exist for this class and subject',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.classSubjectGradeConfig.delete({ where: { id: config.id } });
    });
  }
}
