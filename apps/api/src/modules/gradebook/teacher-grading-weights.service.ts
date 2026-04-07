import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import type {
  CreateTeacherGradingWeightDto,
  ReviewConfigDto,
  UpdateTeacherGradingWeightDto,
} from './dto/gradebook.dto';

// ─── Valid status transitions ─────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval'],
  pending_approval: ['approved', 'rejected'],
  rejected: ['draft'],
};

// ─── Include shape for relations ──────────────────────────────────────────────

const INCLUDE_RELATIONS = {
  subject: { select: { id: true, name: true, code: true } },
  year_group: { select: { id: true, name: true } },
  academic_period: { select: { id: true, name: true } },
  created_by: { select: { id: true, first_name: true, last_name: true } },
  reviewed_by: { select: { id: true, first_name: true, last_name: true } },
} as const;

@Injectable()
export class TeacherGradingWeightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────────

  /**
   * Create a teacher-owned grading weight configuration in draft status.
   * Validates subject, academic period, category existence, and weight sum.
   */
  async create(tenantId: string, userId: string, dto: CreateTeacherGradingWeightDto) {
    // 1. Validate subject exists
    const subject = await this.academicReadFacade.findSubjectById(tenantId, dto.subject_id);
    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: `Subject with id "${dto.subject_id}" not found`,
      });
    }

    // 2. Validate academic period exists
    const academicPeriod = await this.academicReadFacade.findPeriodById(
      tenantId,
      dto.academic_period_id,
    );
    if (!academicPeriod) {
      throw new NotFoundException({
        code: 'ACADEMIC_PERIOD_NOT_FOUND',
        message: `Academic period with id "${dto.academic_period_id}" not found`,
      });
    }

    // 3. Validate year group exists
    await this.academicReadFacade.findYearGroupByIdOrThrow(tenantId, dto.year_group_id);

    // 4. Validate weights sum to 100
    this.validateWeightsSum(dto.category_weights);

    // 5. Validate all category IDs exist as approved for this subject+year_group scope (or global)
    await this.validateCategoryIds(
      tenantId,
      dto.category_weights.map((w) => w.category_id),
      dto.subject_id,
      dto.year_group_id,
    );

    // 6. Create with status 'draft'
    const categoryWeightsJson = {
      weights: dto.category_weights.map((w) => ({
        category_id: w.category_id,
        weight: w.weight,
      })),
    };

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.teacherGradingWeight.create({
        data: {
          tenant_id: tenantId,
          created_by_user_id: userId,
          subject_id: dto.subject_id,
          year_group_id: dto.year_group_id,
          academic_period_id: dto.academic_period_id,
          category_weights_json: categoryWeightsJson as unknown as Prisma.InputJsonValue,
          status: 'draft',
        },
        include: INCLUDE_RELATIONS,
      });
    });
  }

  // ─── Find All ─────────────────────────────────────────────────────────────────

  /**
   * List teacher grading weight configs, optionally filtered.
   * If userId is provided, filters to that teacher's configs.
   * If userId is null, returns all (leadership view).
   */
  async findAll(
    tenantId: string,
    userId: string | null,
    params: {
      subject_id?: string;
      year_group_id?: string;
      academic_period_id?: string;
      status?: string;
    },
  ) {
    const where: Prisma.TeacherGradingWeightWhereInput = {
      tenant_id: tenantId,
    };

    if (userId) {
      where.created_by_user_id = userId;
    }
    if (params.subject_id) {
      where.subject_id = params.subject_id;
    }
    if (params.year_group_id) {
      where.year_group_id = params.year_group_id;
    }
    if (params.academic_period_id) {
      where.academic_period_id = params.academic_period_id;
    }
    if (params.status) {
      where.status = params.status as Prisma.EnumConfigApprovalStatusFilter;
    }

    const configs = await this.prisma.teacherGradingWeight.findMany({
      where,
      include: INCLUDE_RELATIONS,
      orderBy: { created_at: 'desc' },
    });

    return { data: configs };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────────

  /**
   * Find a single teacher grading weight config by ID.
   */
  async findOne(tenantId: string, id: string) {
    const config = await this.prisma.teacherGradingWeight.findFirst({
      where: { id, tenant_id: tenantId },
      include: INCLUDE_RELATIONS,
    });

    if (!config) {
      throw new NotFoundException({
        code: 'WEIGHT_NOT_FOUND',
        message: `Teacher grading weight config with id "${id}" not found`,
      });
    }

    return config;
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

  /**
   * Update a teacher grading weight config. Only allowed when draft or rejected.
   * Ownership or leadership role required.
   */
  async update(tenantId: string, id: string, userId: string, dto: UpdateTeacherGradingWeightDto) {
    const existing = await this.findOneOrThrow(tenantId, id);

    // Only draft or rejected configs can be edited
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      throw new BadRequestException({
        code: 'INVALID_STATUS_FOR_UPDATE',
        message: `Cannot update a config with status "${existing.status}". Only draft or rejected configs can be updated.`,
      });
    }

    // Validate ownership
    if (existing.created_by_user_id !== userId) {
      throw new ForbiddenException({
        code: 'NOT_CONFIG_OWNER',
        message: 'Only the config creator or leadership can update this config',
      });
    }

    // Validate weights sum to 100
    this.validateWeightsSum(dto.category_weights);

    // Validate all category IDs exist
    await this.validateCategoryIds(
      tenantId,
      dto.category_weights.map((w) => w.category_id),
      existing.subject_id,
      existing.year_group_id,
    );

    const categoryWeightsJson = {
      weights: dto.category_weights.map((w) => ({
        category_id: w.category_id,
        weight: w.weight,
      })),
    };

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.teacherGradingWeight.update({
        where: { id },
        data: {
          category_weights_json: categoryWeightsJson as unknown as Prisma.InputJsonValue,
          // Reset to draft if it was rejected
          status: existing.status === 'rejected' ? 'draft' : existing.status,
          // Clear review fields on re-edit
          reviewed_by_user_id: null,
          reviewed_at: null,
          rejection_reason: null,
        },
        include: INCLUDE_RELATIONS,
      });
    });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  /**
   * Delete a teacher grading weight config. Only allowed when draft or rejected.
   * Ownership required.
   */
  async delete(tenantId: string, id: string, userId: string) {
    const existing = await this.findOneOrThrow(tenantId, id);

    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      throw new BadRequestException({
        code: 'INVALID_STATUS_FOR_DELETE',
        message: `Cannot delete a config with status "${existing.status}". Only draft or rejected configs can be deleted.`,
      });
    }

    if (existing.created_by_user_id !== userId) {
      throw new ForbiddenException({
        code: 'NOT_CONFIG_OWNER',
        message: 'Only the config creator can delete this config',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.teacherGradingWeight.delete({ where: { id } });
    });
  }

  // ─── Submit for Approval ──────────────────────────────────────────────────────

  /**
   * Submit a draft config for leadership approval.
   */
  async submitForApproval(tenantId: string, id: string, userId: string) {
    const existing = await this.findOneOrThrow(tenantId, id);

    if (existing.created_by_user_id !== userId) {
      throw new ForbiddenException({
        code: 'NOT_CONFIG_OWNER',
        message: 'Only the config creator can submit for approval',
      });
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException({
        code: 'INVALID_STATUS_FOR_SUBMIT',
        message: `Cannot submit a config with status "${existing.status}". Only draft configs can be submitted for approval.`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.teacherGradingWeight.update({
        where: { id },
        data: { status: 'pending_approval' },
        include: INCLUDE_RELATIONS,
      });
    });
  }

  // ─── Review (Approve / Reject) ────────────────────────────────────────────────

  /**
   * Approve or reject a pending config. Reviewer is typically leadership.
   */
  async review(tenantId: string, id: string, reviewerUserId: string, dto: ReviewConfigDto) {
    const existing = await this.findOneOrThrow(tenantId, id);

    if (existing.status !== 'pending_approval') {
      throw new BadRequestException({
        code: 'INVALID_STATUS_FOR_REVIEW',
        message: `Cannot review a config with status "${existing.status}". Only pending_approval configs can be reviewed.`,
      });
    }

    const targetStatus = dto.status;
    const allowedTransitions = VALID_TRANSITIONS[existing.status];
    if (!allowedTransitions?.includes(targetStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${existing.status}" to "${targetStatus}"`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.teacherGradingWeight.update({
        where: { id },
        data: {
          status: targetStatus,
          reviewed_by_user_id: reviewerUserId,
          reviewed_at: new Date(),
          rejection_reason: targetStatus === 'rejected' ? dto.rejection_reason : null,
        },
        include: INCLUDE_RELATIONS,
      });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Find a config by id+tenant or throw NotFoundException.
   */
  private async findOneOrThrow(tenantId: string, id: string) {
    const config = await this.prisma.teacherGradingWeight.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!config) {
      throw new NotFoundException({
        code: 'WEIGHT_NOT_FOUND',
        message: `Teacher grading weight config with id "${id}" not found`,
      });
    }

    return config;
  }

  /**
   * Validate that category weights sum to exactly 100.
   */
  private validateWeightsSum(categoryWeights: Array<{ category_id: string; weight: number }>) {
    const totalWeight = categoryWeights.reduce((sum, w) => sum + w.weight, 0);

    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new BadRequestException({
        code: 'WEIGHTS_MUST_SUM_TO_100',
        message: `Category weights must sum to 100, but got ${totalWeight}`,
      });
    }
  }

  /**
   * Validate that all category IDs exist as approved AssessmentCategories
   * scoped to this subject+year_group or global (null subject/year_group).
   */
  private async validateCategoryIds(
    tenantId: string,
    categoryIds: string[],
    subjectId: string,
    yearGroupId: string,
  ) {
    const existingCategories = await this.prisma.assessmentCategory.findMany({
      where: {
        tenant_id: tenantId,
        id: { in: categoryIds },
        status: 'approved',
        OR: [
          // Global categories (no subject/year_group scope)
          { subject_id: null, year_group_id: null },
          // Scoped to this exact subject + year group
          { subject_id: subjectId, year_group_id: yearGroupId },
          // Scoped to this subject only (any year group)
          { subject_id: subjectId, year_group_id: null },
          // Scoped to this year group only (any subject)
          { subject_id: null, year_group_id: yearGroupId },
        ],
      },
      select: { id: true },
    });

    const existingCategoryIds = new Set(existingCategories.map((c) => c.id));
    const missingCategoryIds = categoryIds.filter((id) => !existingCategoryIds.has(id));

    if (missingCategoryIds.length > 0) {
      throw new NotFoundException({
        code: 'CATEGORIES_NOT_FOUND',
        message: `Assessment categories not found or not approved for this scope: ${missingCategoryIds.join(', ')}`,
      });
    }
  }
}
