import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AssessmentCategory, Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type {
  CreateAssessmentCategoryDto,
  ReviewConfigDto,
  UpdateAssessmentCategoryDto,
} from './dto/gradebook.dto';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Convert nullable Decimal to number | null for API output. */
function weightToNumber(val: AssessmentCategory['default_weight']): number | null {
  return val != null ? Number(val) : null;
}

@Injectable()
export class AssessmentCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  /**
   * Create a new assessment category.
   * Teacher-created categories (with subject_id + year_group_id) start as 'draft'.
   * Admin-created global categories (no subject/year_group) default to 'approved'.
   */
  async create(tenantId: string, userId: string, dto: CreateAssessmentCategoryDto) {
    const isTeacherScoped = !!(dto.subject_id && dto.year_group_id);
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const result = await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        return db.assessmentCategory.create({
          data: {
            tenant_id: tenantId,
            name: dto.name,
            default_weight: dto.default_weight ?? null,
            created_by_user_id: userId,
            subject_id: dto.subject_id ?? null,
            year_group_id: dto.year_group_id ?? null,
            status: isTeacherScoped ? 'draft' : 'approved',
          },
        });
      });
      const cat = result as AssessmentCategory;
      return { ...cat, default_weight: weightToNumber(cat.default_weight) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'CATEGORY_NAME_EXISTS',
          message: `An assessment category with name "${dto.name}" already exists`,
        });
      }
      throw err;
    }
  }

  // ─── Find All ─────────────────────────────────────────────────────────────

  /**
   * List assessment categories with optional teacher-scoped filters.
   * Includes `in_use` flag indicating whether any assessments reference the category.
   *
   * When userId is provided, returns categories created by that user OR global
   * templates (created_by_user_id IS NULL). subject_id / year_group_id filters
   * also include nulls (global categories apply to all subjects/year-groups).
   */
  async findAll(
    tenantId: string,
    filters?: {
      userId?: string;
      subject_id?: string;
      year_group_id?: string;
      status?: string;
    },
  ) {
    const where: Prisma.AssessmentCategoryWhereInput = { tenant_id: tenantId };

    if (filters?.userId) {
      where.OR = [{ created_by_user_id: filters.userId }, { created_by_user_id: null }];
    }

    if (filters?.subject_id) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [{ subject_id: filters.subject_id }, { subject_id: null }],
        },
      ];
    }

    if (filters?.year_group_id) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [{ year_group_id: filters.year_group_id }, { year_group_id: null }],
        },
      ];
    }

    if (filters?.status) {
      where.status = filters.status as Prisma.EnumConfigApprovalStatusFilter;
    }

    const categories = await this.prisma.assessmentCategory.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { assessments: true } },
      },
    });

    const data = categories.map(({ _count, ...cat }) => ({
      ...cat,
      default_weight: weightToNumber(cat.default_weight),
      in_use: _count.assessments > 0,
    }));

    return { data };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────

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
      default_weight: weightToNumber(category.default_weight),
    };
  }

  // ─── Submit for Approval ──────────────────────────────────────────────────

  /**
   * Teacher submits their draft category for admin approval.
   * Validates ownership and that the current status is 'draft'.
   */
  async submitForApproval(tenantId: string, id: string, userId: string) {
    const category = await this.prisma.assessmentCategory.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Assessment category with id "${id}" not found`,
      });
    }

    if (category.created_by_user_id !== userId) {
      throw new ForbiddenException({
        code: 'NOT_CATEGORY_OWNER',
        message: 'You can only submit your own categories for approval',
      });
    }

    if (category.status !== 'draft') {
      throw new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot submit for approval: category status is "${category.status}", expected "draft"`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.assessmentCategory.update({
        where: { id },
        data: { status: 'pending_approval' },
      });
    });

    const cat = result as AssessmentCategory;
    return { ...cat, default_weight: weightToNumber(cat.default_weight) };
  }

  // ─── Review (Approve / Reject) ────────────────────────────────────────────

  /**
   * Admin reviews a pending category — approves or rejects it.
   */
  async review(tenantId: string, id: string, reviewerUserId: string, dto: ReviewConfigDto) {
    const category = await this.prisma.assessmentCategory.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Assessment category with id "${id}" not found`,
      });
    }

    if (category.status !== 'pending_approval') {
      throw new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot review: category status is "${category.status}", expected "pending_approval"`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.assessmentCategory.update({
        where: { id },
        data: {
          status: dto.status,
          reviewed_by_user_id: reviewerUserId,
          reviewed_at: new Date(),
          rejection_reason: dto.status === 'rejected' ? dto.rejection_reason : null,
        },
      });
    });

    const cat = result as AssessmentCategory;
    return { ...cat, default_weight: weightToNumber(cat.default_weight) };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  /**
   * Update an assessment category.
   * Teacher-owned categories require ownership validation and can only be edited
   * when in 'draft' or 'rejected' status. Editing a rejected category resets
   * status back to 'draft'.
   * Global (admin) categories have no status restriction.
   */
  async update(tenantId: string, id: string, userId: string, dto: UpdateAssessmentCategoryDto) {
    const category = await this.prisma.assessmentCategory.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Assessment category with id "${id}" not found`,
      });
    }

    const isTeacherScoped = Boolean(category.subject_id && category.year_group_id);

    // Ownership check for teacher-scoped categories only
    if (isTeacherScoped && category.created_by_user_id !== userId) {
      throw new ForbiddenException({
        code: 'NOT_CATEGORY_OWNER',
        message: 'You can only update your own categories',
      });
    }

    // Status gate for teacher-scoped categories
    if (isTeacherScoped) {
      if (category.status !== 'draft' && category.status !== 'rejected') {
        throw new ConflictException({
          code: 'CATEGORY_NOT_EDITABLE',
          message: `Cannot edit category in "${category.status}" status. Only draft or rejected categories can be edited.`,
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const result = await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        const updateData: Prisma.AssessmentCategoryUncheckedUpdateInput = {};
        if (dto.name !== undefined) {
          updateData.name = dto.name;
        }
        if (dto.default_weight !== undefined) {
          updateData.default_weight = dto.default_weight;
        }
        if (dto.subject_id !== undefined) {
          updateData.subject_id = dto.subject_id;
        }
        if (dto.year_group_id !== undefined) {
          updateData.year_group_id = dto.year_group_id;
        }

        // Reset status to draft when editing a rejected teacher-scoped category
        if (isTeacherScoped && category.status === 'rejected') {
          updateData.status = 'draft';
          updateData.rejection_reason = null;
          updateData.reviewed_at = null;
          updateData.reviewed_by_user_id = null;
        }

        return db.assessmentCategory.update({
          where: { id },
          data: updateData,
        });
      });
      const cat = result as AssessmentCategory;
      return { ...cat, default_weight: weightToNumber(cat.default_weight) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'CATEGORY_NAME_EXISTS',
          message: `An assessment category with name "${dto.name}" already exists`,
        });
      }
      throw err;
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  /**
   * Delete an assessment category. Blocked if any assessments reference it.
   * Teacher-owned categories require ownership validation.
   */
  async delete(tenantId: string, id: string, userId: string) {
    const category = await this.prisma.assessmentCategory.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Assessment category with id "${id}" not found`,
      });
    }

    const isTeacherScoped = Boolean(category.subject_id && category.year_group_id);

    // Ownership check for teacher-scoped categories only
    if (isTeacherScoped && category.created_by_user_id !== userId) {
      throw new ForbiddenException({
        code: 'NOT_CATEGORY_OWNER',
        message: 'You can only delete your own categories',
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
