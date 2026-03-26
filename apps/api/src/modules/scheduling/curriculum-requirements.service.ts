import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateCurriculumRequirementDto,
  UpdateCurriculumRequirementDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

interface ListParams {
  page: number;
  pageSize: number;
  academic_year_id: string;
  year_group_id?: string;
}

const INCLUDE_RELATIONS = {
  subject: { select: { id: true, name: true } },
  year_group: { select: { id: true, name: true } },
} as const;

@Injectable()
export class CurriculumRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── List ──────────────────────────────────────────────────────────────────

  async list(tenantId: string, params: ListParams) {
    const { page, pageSize, academic_year_id, year_group_id } = params;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id,
    };
    if (year_group_id) where['year_group_id'] = year_group_id;

    const [data, total] = await Promise.all([
      this.prisma.curriculumRequirement.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ year_group_id: 'asc' }, { subject_id: 'asc' }],
        include: INCLUDE_RELATIONS,
      }),
      this.prisma.curriculumRequirement.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── Get by ID ─────────────────────────────────────────────────────────────

  async getById(tenantId: string, id: string) {
    const record = await this.prisma.curriculumRequirement.findFirst({
      where: { id, tenant_id: tenantId },
      include: INCLUDE_RELATIONS,
    });

    if (!record) {
      throw new NotFoundException({
        code: 'CURRICULUM_REQUIREMENT_NOT_FOUND',
        message: `Curriculum requirement "${id}" not found`,
      });
    }

    return record;
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateCurriculumRequirementDto) {
    await this.validateRelations(tenantId, dto.subject_id, dto.year_group_id, dto.academic_year_id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const record = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.curriculumRequirement.create({
        data: {
          tenant_id: tenantId,
          academic_year_id: dto.academic_year_id,
          year_group_id: dto.year_group_id,
          subject_id: dto.subject_id,
          min_periods_per_week: dto.min_periods_per_week,
          max_periods_per_day: dto.max_periods_per_day,
          preferred_periods_per_week: dto.preferred_periods_per_week ?? null,
          requires_double_period: dto.requires_double_period,
          double_period_count: dto.double_period_count ?? null,
          period_duration: dto.period_duration ?? null,
        },
        include: INCLUDE_RELATIONS,
      });
    });

    return record;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateCurriculumRequirementDto) {
    const existing = await this.prisma.curriculumRequirement.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'CURRICULUM_REQUIREMENT_NOT_FOUND',
        message: `Curriculum requirement "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const record = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.curriculumRequirement.update({
        where: { id },
        data: {
          ...(dto.min_periods_per_week !== undefined && {
            min_periods_per_week: dto.min_periods_per_week,
          }),
          ...(dto.max_periods_per_day !== undefined && {
            max_periods_per_day: dto.max_periods_per_day,
          }),
          ...(dto.preferred_periods_per_week !== undefined && {
            preferred_periods_per_week: dto.preferred_periods_per_week,
          }),
          ...(dto.requires_double_period !== undefined && {
            requires_double_period: dto.requires_double_period,
          }),
          ...(dto.double_period_count !== undefined && {
            double_period_count: dto.double_period_count,
          }),
          ...(dto.period_duration !== undefined && {
            period_duration: dto.period_duration,
          }),
        },
        include: INCLUDE_RELATIONS,
      });
    });

    return record;
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async delete(tenantId: string, id: string) {
    const existing = await this.prisma.curriculumRequirement.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'CURRICULUM_REQUIREMENT_NOT_FOUND',
        message: `Curriculum requirement "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.curriculumRequirement.delete({ where: { id } });
    });

    return { message: 'Curriculum requirement deleted' };
  }

  // ─── Bulk Upsert ──────────────────────────────────────────────────────────

  async bulkUpsert(
    tenantId: string,
    academicYearId: string,
    yearGroupId: string,
    items: CreateCurriculumRequirementDto[],
  ) {
    // Validate the year group exists
    const yearGroup = await this.prisma.yearGroup.findFirst({
      where: { id: yearGroupId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!yearGroup) {
      throw new NotFoundException({
        code: 'YEAR_GROUP_NOT_FOUND',
        message: `Year group "${yearGroupId}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Delete existing requirements for this year group + academic year
      await db.curriculumRequirement.deleteMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          year_group_id: yearGroupId,
        },
      });

      // Create new ones
      const created = [];
      for (const item of items) {
        const record = await db.curriculumRequirement.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: academicYearId,
            year_group_id: yearGroupId,
            subject_id: item.subject_id,
            min_periods_per_week: item.min_periods_per_week,
            max_periods_per_day: item.max_periods_per_day,
            preferred_periods_per_week: item.preferred_periods_per_week ?? null,
            requires_double_period: item.requires_double_period,
            double_period_count: item.double_period_count ?? null,
            period_duration: item.period_duration ?? null,
          },
          include: INCLUDE_RELATIONS,
        });
        created.push(record);
      }

      return created;
    }) as unknown as Record<string, unknown>[];

    return { data: result, meta: { upserted: result.length } };
  }

  // ─── Copy from Academic Year ───────────────────────────────────────────────

  async copyFromAcademicYear(
    tenantId: string,
    sourceYearId: string,
    targetYearId: string,
  ) {
    // Validate both years exist
    const [sourceYear, targetYear] = await Promise.all([
      this.prisma.academicYear.findFirst({
        where: { id: sourceYearId, tenant_id: tenantId },
        select: { id: true },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: targetYearId, tenant_id: tenantId },
        select: { id: true },
      }),
    ]);

    if (!sourceYear) {
      throw new NotFoundException({
        code: 'SOURCE_ACADEMIC_YEAR_NOT_FOUND',
        message: `Source academic year "${sourceYearId}" not found`,
      });
    }
    if (!targetYear) {
      throw new NotFoundException({
        code: 'TARGET_ACADEMIC_YEAR_NOT_FOUND',
        message: `Target academic year "${targetYearId}" not found`,
      });
    }

    // Load source requirements
    const sourceRecords = await this.prisma.curriculumRequirement.findMany({
      where: { tenant_id: tenantId, academic_year_id: sourceYearId },
    });

    if (sourceRecords.length === 0) {
      throw new BadRequestException({
        code: 'NO_SOURCE_DATA',
        message: 'No curriculum requirements found in the source academic year',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const created = [];
      for (const src of sourceRecords) {
        const record = await db.curriculumRequirement.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: targetYearId,
            year_group_id: src.year_group_id,
            subject_id: src.subject_id,
            min_periods_per_week: src.min_periods_per_week,
            max_periods_per_day: src.max_periods_per_day,
            preferred_periods_per_week: src.preferred_periods_per_week,
            requires_double_period: src.requires_double_period,
            double_period_count: src.double_period_count,
            period_duration: src.period_duration,
          },
        });
        created.push(record);
      }

      return created;
    }) as unknown as Record<string, unknown>[];

    return { data: result, meta: { copied: result.length } };
  }

  // ─── Matrix Subjects ───────────────────────────────────────────────────────

  async getMatrixSubjects(
    tenantId: string,
    academicYearId: string,
    yearGroupId: string,
  ) {
    // Get active classes in this year group for this academic year
    const classes = await this.prisma.class.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        year_group_id: yearGroupId,
        status: 'active',
      },
      select: { id: true, name: true },
    });

    if (classes.length === 0) return [];

    // Get subjects assigned to these classes via curriculum matrix
    const configs = await this.prisma.classSubjectGradeConfig.findMany({
      where: {
        tenant_id: tenantId,
        class_id: { in: classes.map((c) => c.id) },
      },
      include: {
        subject: { select: { id: true, name: true } },
        class_entity: { select: { id: true, name: true } },
      },
    });

    // Group by subject, listing classes
    const subjectMap = new Map<
      string,
      { subject: { id: string; name: string }; classes: string[] }
    >();
    for (const config of configs) {
      const existing = subjectMap.get(config.subject_id);
      if (existing) {
        existing.classes.push(config.class_entity.name);
      } else {
        subjectMap.set(config.subject_id, {
          subject: config.subject,
          classes: [config.class_entity.name],
        });
      }
    }

    return Array.from(subjectMap.values()).sort((a, b) =>
      a.subject.name.localeCompare(b.subject.name),
    );
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async validateRelations(
    tenantId: string,
    subjectId: string,
    yearGroupId: string,
    academicYearId: string,
  ) {
    const [subject, yearGroup, academicYear] = await Promise.all([
      this.prisma.subject.findFirst({
        where: { id: subjectId, tenant_id: tenantId },
        select: { id: true },
      }),
      this.prisma.yearGroup.findFirst({
        where: { id: yearGroupId, tenant_id: tenantId },
        select: { id: true },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: academicYearId, tenant_id: tenantId },
        select: { id: true },
      }),
    ]);

    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: `Subject "${subjectId}" not found`,
      });
    }
    if (!yearGroup) {
      throw new NotFoundException({
        code: 'YEAR_GROUP_NOT_FOUND',
        message: `Year group "${yearGroupId}" not found`,
      });
    }
    if (!academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year "${academicYearId}" not found`,
      });
    }
  }
}
