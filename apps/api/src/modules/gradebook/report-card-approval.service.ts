import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApprovalStep {
  order: number;
  role_key: string;
  label: string;
  required: boolean;
}

export interface CreateApprovalConfigDto {
  name: string;
  steps_json: ApprovalStep[];
  is_active?: boolean;
}

export interface UpdateApprovalConfigDto {
  name?: string;
  steps_json?: ApprovalStep[];
  is_active?: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Config CRUD ──────────────────────────────────────────────────────────

  async createConfig(tenantId: string, dto: CreateApprovalConfigDto) {
    const existing = await this.prisma.reportCardApprovalConfig.findFirst({
      where: { tenant_id: tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException({
        error: {
          code: 'APPROVAL_CONFIG_NAME_TAKEN',
          message: `An approval config named "${dto.name}" already exists`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      if (dto.is_active) {
        await db.reportCardApprovalConfig.updateMany({
          where: { tenant_id: tenantId, is_active: true },
          data: { is_active: false },
        });
      }

      return db.reportCardApprovalConfig.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          steps_json: dto.steps_json as unknown as Prisma.InputJsonValue,
          is_active: dto.is_active ?? false,
        },
      });
    });
  }

  async findAllConfigs(tenantId: string) {
    return this.prisma.reportCardApprovalConfig.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ is_active: 'desc' }, { created_at: 'desc' }],
    });
  }

  async findOneConfig(tenantId: string, id: string) {
    const config = await this.prisma.reportCardApprovalConfig.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!config) {
      throw new NotFoundException({
        error: {
          code: 'APPROVAL_CONFIG_NOT_FOUND',
          message: `Approval config "${id}" not found`,
        },
      });
    }
    return config;
  }

  async updateConfig(tenantId: string, id: string, dto: UpdateApprovalConfigDto) {
    const config = await this.prisma.reportCardApprovalConfig.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!config) {
      throw new NotFoundException({
        error: {
          code: 'APPROVAL_CONFIG_NOT_FOUND',
          message: `Approval config "${id}" not found`,
        },
      });
    }

    if (dto.name !== undefined && dto.name !== config.name) {
      const conflict = await this.prisma.reportCardApprovalConfig.findFirst({
        where: { tenant_id: tenantId, name: dto.name, id: { not: id } },
      });
      if (conflict) {
        throw new ConflictException({
          error: {
            code: 'APPROVAL_CONFIG_NAME_TAKEN',
            message: `An approval config named "${dto.name}" already exists`,
          },
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      if (dto.is_active) {
        await db.reportCardApprovalConfig.updateMany({
          where: { tenant_id: tenantId, is_active: true, id: { not: id } },
          data: { is_active: false },
        });
      }

      const updateData: Prisma.ReportCardApprovalConfigUpdateInput = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
      if (dto.steps_json !== undefined) {
        updateData.steps_json = dto.steps_json as unknown as Prisma.InputJsonValue;
      }

      return db.reportCardApprovalConfig.update({ where: { id }, data: updateData });
    });
  }

  async removeConfig(tenantId: string, id: string) {
    const config = await this.prisma.reportCardApprovalConfig.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!config) {
      throw new NotFoundException({
        error: {
          code: 'APPROVAL_CONFIG_NOT_FOUND',
          message: `Approval config "${id}" not found`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.reportCardApprovalConfig.delete({ where: { id } });
    });

    return { deleted: true };
  }

  // ─── Approval Workflow ────────────────────────────────────────────────────

  async submitForApproval(tenantId: string, reportCardId: string) {
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
          message: 'Only draft report cards can be submitted for approval',
        },
      });
    }

    // Check for existing pending approvals
    const existingApprovals = await this.prisma.reportCardApproval.count({
      where: { tenant_id: tenantId, report_card_id: reportCardId },
    });
    if (existingApprovals > 0) {
      throw new ConflictException({
        error: {
          code: 'ALREADY_SUBMITTED',
          message: 'This report card has already been submitted for approval',
        },
      });
    }

    // Find the active approval config
    const activeConfig = await this.prisma.reportCardApprovalConfig.findFirst({
      where: { tenant_id: tenantId, is_active: true },
    });

    if (!activeConfig || !Array.isArray(activeConfig.steps_json) || activeConfig.steps_json.length === 0) {
      // No approval steps — just return no-op
      return { message: 'No approval workflow configured. Use bulk publish instead.', approvals: [] };
    }

    const steps = activeConfig.steps_json as unknown as ApprovalStep[];

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const approvals = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const created = await Promise.all(
        steps.map((step) =>
          db.reportCardApproval.create({
            data: {
              tenant_id: tenantId,
              report_card_id: reportCardId,
              step_order: step.order,
              role_key: step.role_key,
              status: 'pending',
            },
          }),
        ),
      );

      return created;
    });

    return { approvals };
  }

  async approve(tenantId: string, approvalId: string, userId: string) {
    const approval = await this.prisma.reportCardApproval.findFirst({
      where: { id: approvalId, tenant_id: tenantId },
      select: { id: true, report_card_id: true, step_order: true, status: true, role_key: true },
    });
    if (!approval) {
      throw new NotFoundException({
        error: {
          code: 'APPROVAL_NOT_FOUND',
          message: `Approval record "${approvalId}" not found`,
        },
      });
    }
    if (approval.status !== 'pending') {
      throw new ConflictException({
        error: {
          code: 'APPROVAL_NOT_PENDING',
          message: 'This approval step is not pending',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updated = await db.reportCardApproval.update({
        where: { id: approvalId },
        data: {
          status: 'approved',
          actioned_by_user_id: userId,
          actioned_at: new Date(),
        },
      });

      // Check if all approvals for this report card are now approved
      const allApprovals = await db.reportCardApproval.findMany({
        where: { tenant_id: tenantId, report_card_id: approval.report_card_id },
        select: { status: true },
      });

      const allApproved = allApprovals.every((a) => a.status === 'approved');

      let publishedCard = null;
      if (allApproved) {
        // Auto-publish the report card
        publishedCard = await db.reportCard.update({
          where: { id: approval.report_card_id },
          data: {
            status: 'published',
            published_at: new Date(),
            published_by_user_id: userId,
          },
        });
      }

      return { approval: updated, auto_published: allApproved, report_card: publishedCard };
    });

    return result;
  }

  async reject(tenantId: string, approvalId: string, userId: string, reason: string) {
    const approval = await this.prisma.reportCardApproval.findFirst({
      where: { id: approvalId, tenant_id: tenantId },
      select: { id: true, report_card_id: true, status: true },
    });
    if (!approval) {
      throw new NotFoundException({
        error: {
          code: 'APPROVAL_NOT_FOUND',
          message: `Approval record "${approvalId}" not found`,
        },
      });
    }
    if (approval.status !== 'pending') {
      throw new ConflictException({
        error: {
          code: 'APPROVAL_NOT_PENDING',
          message: 'This approval step is not pending',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updated = await db.reportCardApproval.update({
        where: { id: approvalId },
        data: {
          status: 'rejected',
          actioned_by_user_id: userId,
          actioned_at: new Date(),
          rejection_reason: reason,
        },
      });

      // Cancel all remaining pending approvals for this report card
      await db.reportCardApproval.updateMany({
        where: {
          tenant_id: tenantId,
          report_card_id: approval.report_card_id,
          status: 'pending',
          id: { not: approvalId },
        },
        data: { status: 'rejected', rejection_reason: 'Cancelled due to earlier rejection' },
      });

      return { approval: updated };
    });
  }

  async getPendingApprovals(
    tenantId: string,
    userId: string,
    roleKey: string,
    params: { page: number; pageSize: number },
  ) {
    const { page, pageSize } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ReportCardApprovalWhereInput = {
      tenant_id: tenantId,
      role_key: roleKey,
      status: 'pending',
    };

    const [data, total] = await Promise.all([
      this.prisma.reportCardApproval.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'asc' },
        include: {
          report_card: {
            select: {
              id: true,
              status: true,
              template_locale: true,
              student: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  student_number: true,
                },
              },
              academic_period: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      this.prisma.reportCardApproval.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total }, user_id: userId };
  }

  async bulkApprove(tenantId: string, approvalIds: string[], userId: string) {
    const results: Array<{ approval_id: string; success: boolean; error?: string }> = [];

    for (const approvalId of approvalIds) {
      try {
        await this.approve(tenantId, approvalId, userId);
        results.push({ approval_id: approvalId, success: true });
      } catch (err) {
        results.push({
          approval_id: approvalId,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return { results, succeeded, failed };
  }
}
