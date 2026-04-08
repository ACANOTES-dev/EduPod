import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubjectWeightEntry {
  subject_id: string;
  weight: number;
}

interface PeriodWeightEntry {
  academic_period_id: string;
  weight: number;
}

interface UpsertSubjectWeightsDto {
  academic_year_id: string;
  academic_period_id: string;
  scope_type: 'year_group' | 'class';
  scope_id: string;
  weights: SubjectWeightEntry[];
}

interface UpsertPeriodWeightsDto {
  academic_year_id: string;
  scope_type: 'year_group' | 'class';
  scope_id: string;
  weights: PeriodWeightEntry[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class WeightConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  // ─── Subject Period Weights ─────────────────────────────────────────────────

  /**
   * Get all subject weights for a given academic year, optionally filtered by period.
   * Returns class-level weights first, falling back to year-group-level.
   */
  async getSubjectWeights(tenantId: string, academicYearId: string, academicPeriodId?: string) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };
    if (academicPeriodId) {
      where.academic_period_id = academicPeriodId;
    }

    const data = await this.prisma.subjectPeriodWeight.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true, code: true } },
        year_group: { select: { id: true, name: true } },
        class_entity: { select: { id: true, name: true } },
        academic_period: { select: { id: true, name: true } },
      },
      orderBy: [{ academic_period_id: 'asc' }, { subject: { name: 'asc' } }],
    });

    return { data };
  }

  /**
   * Upsert subject weights for a specific scope (year group or class) and period.
   * Validates that weights sum to 100%.
   */
  async upsertSubjectWeights(tenantId: string, dto: UpsertSubjectWeightsDto) {
    const { academic_year_id, academic_period_id, scope_type, scope_id, weights } = dto;

    // Validate weights sum to 100
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new BadRequestException({
        code: 'WEIGHTS_MUST_SUM_TO_100',
        message: `Subject weights must sum to 100%. Current total: ${totalWeight}%`,
      });
    }

    // Validate no negative weights
    for (const w of weights) {
      if (w.weight < 0) {
        throw new BadRequestException({
          code: 'NEGATIVE_WEIGHT',
          message: `Weight for subject "${w.subject_id}" cannot be negative`,
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Delete existing weights for this scope + period
      const deleteWhere: Record<string, unknown> = {
        tenant_id: tenantId,
        academic_year_id,
        academic_period_id,
      };
      if (scope_type === 'year_group') {
        deleteWhere.year_group_id = scope_id;
        deleteWhere.class_id = null;
      } else {
        deleteWhere.class_id = scope_id;
        deleteWhere.year_group_id = null;
      }
      await db.subjectPeriodWeight.deleteMany({ where: deleteWhere });

      // Insert new weights
      const records = weights.map((w) => ({
        tenant_id: tenantId,
        academic_year_id,
        academic_period_id,
        year_group_id: scope_type === 'year_group' ? scope_id : null,
        class_id: scope_type === 'class' ? scope_id : null,
        subject_id: w.subject_id,
        weight: w.weight,
      }));

      await db.subjectPeriodWeight.createMany({ data: records });

      return { count: records.length };
    });
  }

  // ─── Period Year Weights ────────────────────────────────────────────────────

  /**
   * Get all period weights for a given academic year.
   */
  async getPeriodWeights(tenantId: string, academicYearId: string) {
    const data = await this.prisma.periodYearWeight.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
      },
      include: {
        academic_period: { select: { id: true, name: true } },
        year_group: { select: { id: true, name: true } },
        class_entity: { select: { id: true, name: true } },
      },
      orderBy: [{ academic_period: { start_date: 'asc' } }],
    });

    return { data };
  }

  /**
   * Upsert period weights for a specific scope (year group or class).
   * Validates that weights sum to 100%.
   */
  async upsertPeriodWeights(tenantId: string, dto: UpsertPeriodWeightsDto) {
    const { academic_year_id, scope_type, scope_id, weights } = dto;

    // Validate weights sum to 100
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new BadRequestException({
        code: 'WEIGHTS_MUST_SUM_TO_100',
        message: `Period weights must sum to 100%. Current total: ${totalWeight}%`,
      });
    }

    // Validate no negative weights
    for (const w of weights) {
      if (w.weight < 0) {
        throw new BadRequestException({
          code: 'NEGATIVE_WEIGHT',
          message: `Weight for period "${w.academic_period_id}" cannot be negative`,
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Delete existing weights for this scope
      const deleteWhere: Record<string, unknown> = {
        tenant_id: tenantId,
        academic_year_id,
      };
      if (scope_type === 'year_group') {
        deleteWhere.year_group_id = scope_id;
        deleteWhere.class_id = null;
      } else {
        deleteWhere.class_id = scope_id;
        deleteWhere.year_group_id = null;
      }
      await db.periodYearWeight.deleteMany({ where: deleteWhere });

      // Insert new weights
      const records = weights.map((w) => ({
        tenant_id: tenantId,
        academic_year_id,
        academic_period_id: w.academic_period_id,
        year_group_id: scope_type === 'year_group' ? scope_id : null,
        class_id: scope_type === 'class' ? scope_id : null,
        weight: w.weight,
      }));

      await db.periodYearWeight.createMany({ data: records });

      return { count: records.length };
    });
  }

  // ─── Propagate year-group weights to classes ────────────────────────────────

  /**
   * When switching from year-group to per-class mode, copy the year-group
   * weights to each individual class within that year group.
   */
  async propagateSubjectWeightsToClasses(
    tenantId: string,
    academicYearId: string,
    academicPeriodId: string,
    yearGroupId: string,
  ) {
    // Get the year-group-level weights
    const ygWeights = await this.prisma.subjectPeriodWeight.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        academic_period_id: academicPeriodId,
        year_group_id: yearGroupId,
        class_id: null,
      },
    });

    if (ygWeights.length === 0) {
      throw new NotFoundException({
        code: 'NO_YEAR_GROUP_WEIGHTS',
        message: 'No year-group-level subject weights found to propagate',
      });
    }

    // Find all active classes in this year group for this academic year
    const classes = (await this.classesReadFacade.findClassesGeneric(
      tenantId,
      { year_group_id: yearGroupId, academic_year_id: academicYearId, status: 'active' },
      { id: true },
    )) as Array<{ id: string }>;

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      let created = 0;
      for (const cls of classes) {
        // Skip classes that already have class-level weights
        const existing = await db.subjectPeriodWeight.count({
          where: {
            tenant_id: tenantId,
            academic_period_id: academicPeriodId,
            class_id: cls.id,
          },
        });
        if (existing > 0) continue;

        // Copy year-group weights to this class
        const records = ygWeights.map((w) => ({
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          academic_period_id: academicPeriodId,
          year_group_id: null,
          class_id: cls.id,
          subject_id: w.subject_id,
          weight: Number(w.weight),
        }));

        await db.subjectPeriodWeight.createMany({ data: records });
        created += records.length;
      }

      return { classes_populated: classes.length, weights_created: created };
    });
  }

  /**
   * Propagate year-group period weights to individual classes.
   */
  async propagatePeriodWeightsToClasses(
    tenantId: string,
    academicYearId: string,
    yearGroupId: string,
  ) {
    const ygWeights = await this.prisma.periodYearWeight.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        year_group_id: yearGroupId,
        class_id: null,
      },
    });

    if (ygWeights.length === 0) {
      throw new NotFoundException({
        code: 'NO_YEAR_GROUP_WEIGHTS',
        message: 'No year-group-level period weights found to propagate',
      });
    }

    const classes = (await this.classesReadFacade.findClassesGeneric(
      tenantId,
      { year_group_id: yearGroupId, academic_year_id: academicYearId, status: 'active' },
      { id: true },
    )) as Array<{ id: string }>;

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      let created = 0;
      for (const cls of classes) {
        const existing = await db.periodYearWeight.count({
          where: {
            tenant_id: tenantId,
            academic_year_id: academicYearId,
            class_id: cls.id,
          },
        });
        if (existing > 0) continue;

        const records = ygWeights.map((w) => ({
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          academic_period_id: w.academic_period_id,
          year_group_id: null,
          class_id: cls.id,
          weight: Number(w.weight),
        }));

        await db.periodYearWeight.createMany({ data: records });
        created += records.length;
      }

      return { classes_populated: classes.length, weights_created: created };
    });
  }

  // ─── Resolve weights for computation ────────────────────────────────────────

  /**
   * Resolve subject weights for a specific class and period.
   * Falls back to year-group-level weights if no class-level weights exist.
   */
  async resolveSubjectWeightsForClass(
    tenantId: string,
    classId: string,
    academicPeriodId: string,
  ): Promise<Map<string, number>> {
    // 1. Try class-specific weights
    const classWeights = await this.prisma.subjectPeriodWeight.findMany({
      where: {
        tenant_id: tenantId,
        academic_period_id: academicPeriodId,
        class_id: classId,
      },
      select: { subject_id: true, weight: true },
    });

    if (classWeights.length > 0) {
      return new Map(classWeights.map((w) => [w.subject_id, Number(w.weight)]));
    }

    // 2. Fall back to year-group weights
    const clsArr = (await this.classesReadFacade.findClassesGeneric(
      tenantId,
      { id: classId },
      { year_group_id: true },
    )) as Array<{ year_group_id: string | null }>;
    const cls = clsArr[0] ?? null;

    if (!cls?.year_group_id) return new Map();

    const ygWeights = await this.prisma.subjectPeriodWeight.findMany({
      where: {
        tenant_id: tenantId,
        academic_period_id: academicPeriodId,
        year_group_id: cls.year_group_id,
        class_id: null,
      },
      select: { subject_id: true, weight: true },
    });

    return new Map(ygWeights.map((w) => [w.subject_id, Number(w.weight)]));
  }

  /**
   * Resolve period weights for a specific class.
   * Falls back to year-group-level weights if no class-level weights exist.
   */
  async resolvePeriodWeightsForClass(
    tenantId: string,
    classId: string,
    academicYearId: string,
  ): Promise<Map<string, number>> {
    // 1. Try class-specific weights
    const classWeights = await this.prisma.periodYearWeight.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        class_id: classId,
      },
      select: { academic_period_id: true, weight: true },
    });

    if (classWeights.length > 0) {
      return new Map(classWeights.map((w) => [w.academic_period_id, Number(w.weight)]));
    }

    // 2. Fall back to year-group weights
    const clsArr = (await this.classesReadFacade.findClassesGeneric(
      tenantId,
      { id: classId },
      { year_group_id: true },
    )) as Array<{ year_group_id: string | null }>;
    const cls = clsArr[0] ?? null;

    if (!cls?.year_group_id) return new Map();

    const ygWeights = await this.prisma.periodYearWeight.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        year_group_id: cls.year_group_id,
        class_id: null,
      },
      select: { academic_period_id: true, weight: true },
    });

    return new Map(ygWeights.map((w) => [w.academic_period_id, Number(w.weight)]));
  }
}
