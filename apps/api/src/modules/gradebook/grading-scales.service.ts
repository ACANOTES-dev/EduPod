import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { CreateGradingScaleDto, UpdateGradingScaleDto } from './dto/gradebook.dto';

interface PaginationParams {
  page: number;
  pageSize: number;
}

@Injectable()
export class GradingScalesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new grading scale.
   */
  async create(tenantId: string, dto: CreateGradingScaleDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        return db.gradingScale.create({
          data: {
            tenant_id: tenantId,
            name: dto.name,
            config_json: dto.config_json as unknown as Prisma.InputJsonValue,
          },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'GRADING_SCALE_NAME_EXISTS',
          message: `A grading scale with name "${dto.name}" already exists`,
        });
      }
      throw err;
    }
  }

  /**
   * List grading scales with pagination.
   */
  async findAll(tenantId: string, pagination: PaginationParams) {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const where: Prisma.GradingScaleWhereInput = { tenant_id: tenantId };

    const [data, total] = await Promise.all([
      this.prisma.gradingScale.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      this.prisma.gradingScale.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  /**
   * Get a single grading scale with is_in_use flag.
   */
  async findOne(tenantId: string, id: string) {
    const scale = await this.prisma.gradingScale.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!scale) {
      throw new NotFoundException({
        code: 'GRADING_SCALE_NOT_FOUND',
        message: `Grading scale with id "${id}" not found`,
      });
    }

    const inUse = await this.isInUse(tenantId, id);

    return {
      ...scale,
      is_in_use: inUse,
    };
  }

  /**
   * Update a grading scale. Config changes are blocked if scale is in use.
   */
  async update(tenantId: string, id: string, dto: UpdateGradingScaleDto) {
    const scale = await this.prisma.gradingScale.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!scale) {
      throw new NotFoundException({
        code: 'GRADING_SCALE_NOT_FOUND',
        message: `Grading scale with id "${id}" not found`,
      });
    }

    // If config_json is being changed, check immutability
    if (dto.config_json !== undefined) {
      const inUse = await this.isInUse(tenantId, id);
      if (inUse) {
        throw new ConflictException({
          code: 'GRADING_SCALE_IMMUTABLE',
          message: 'Cannot modify config of a grading scale that is in use with existing grades',
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        const updateData: Prisma.GradingScaleUpdateInput = {};
        if (dto.name !== undefined) {
          updateData.name = dto.name;
        }
        if (dto.config_json !== undefined) {
          updateData.config_json = dto.config_json as unknown as Prisma.InputJsonValue;
        }

        return db.gradingScale.update({
          where: { id },
          data: updateData,
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'GRADING_SCALE_NAME_EXISTS',
          message: `A grading scale with name "${dto.name}" already exists`,
        });
      }
      throw err;
    }
  }

  /**
   * Delete a grading scale. Blocked if referenced by any grade configs.
   */
  async delete(tenantId: string, id: string) {
    const scale = await this.prisma.gradingScale.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!scale) {
      throw new NotFoundException({
        code: 'GRADING_SCALE_NOT_FOUND',
        message: `Grading scale with id "${id}" not found`,
      });
    }

    // Check if any grade configs reference this scale
    const configCount = await this.prisma.classSubjectGradeConfig.count({
      where: {
        tenant_id: tenantId,
        grading_scale_id: id,
      },
    });

    if (configCount > 0) {
      throw new ConflictException({
        code: 'GRADING_SCALE_IN_USE',
        message: 'Cannot delete a grading scale that is referenced by grade configurations',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.gradingScale.delete({ where: { id } });
    });
  }

  /**
   * Check if a grading scale is "in use" — meaning grade_configs reference it
   * AND those configs have assessments with grades that have raw_score IS NOT NULL.
   */
  async isInUse(tenantId: string, scaleId: string): Promise<boolean> {
    // Find class_subject_grade_configs using this scale
    const configs = await this.prisma.classSubjectGradeConfig.findMany({
      where: {
        tenant_id: tenantId,
        grading_scale_id: scaleId,
      },
      select: {
        class_id: true,
        subject_id: true,
      },
    });

    if (configs.length === 0) {
      return false;
    }

    // Check if any of these (class_id, subject_id) pairs have assessments with
    // grades where raw_score IS NOT NULL
    for (const config of configs) {
      const gradeCount = await this.prisma.grade.count({
        where: {
          tenant_id: tenantId,
          raw_score: { not: null },
          assessment: {
            class_id: config.class_id,
            subject_id: config.subject_id,
          },
        },
      });

      if (gradeCount > 0) {
        return true;
      }
    }

    return false;
  }
}
