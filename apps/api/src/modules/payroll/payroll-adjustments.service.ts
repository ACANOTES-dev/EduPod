import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type { CreateAdjustmentDto, UpdateAdjustmentDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PayrollAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAdjustment(
    tenantId: string,
    runId: string,
    userId: string,
    dto: CreateAdjustmentDto,
  ) {
    // Verify entry belongs to run and tenant
    const entry = await this.prisma.payrollEntry.findFirst({
      where: {
        id: dto.payroll_entry_id,
        tenant_id: tenantId,
        payroll_run_id: runId,
      },
      include: { payroll_run: { select: { status: true } } },
    });

    if (!entry) {
      throw new NotFoundException({
        code: 'PAYROLL_ENTRY_NOT_FOUND',
        message: `Payroll entry "${dto.payroll_entry_id}" not found in run "${runId}"`,
      });
    }

    if (entry.payroll_run.status !== 'draft') {
      throw new BadRequestException({
        code: 'RUN_NOT_DRAFT',
        message: 'Adjustments can only be added when the payroll run is in draft status',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const adjustment = await db.payrollAdjustment.create({
        data: {
          tenant_id: tenantId,
          payroll_run_id: runId,
          payroll_entry_id: dto.payroll_entry_id,
          adjustment_type: dto.adjustment_type,
          amount: dto.amount,
          description: dto.description,
          reference_period: dto.reference_period ?? null,
          created_by_user_id: userId,
        },
      });

      return this.serializeAdjustment(adjustment);
    });
  }

  async listAdjustments(tenantId: string, entryId: string) {
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { id: entryId, tenant_id: tenantId },
    });

    if (!entry) {
      throw new NotFoundException({
        code: 'PAYROLL_ENTRY_NOT_FOUND',
        message: `Payroll entry "${entryId}" not found`,
      });
    }

    const adjustments = await this.prisma.payrollAdjustment.findMany({
      where: { payroll_entry_id: entryId, tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });

    return { data: adjustments.map((a) => this.serializeAdjustment(a)) };
  }

  async getAdjustment(tenantId: string, adjustmentId: string) {
    const adjustment = await this.prisma.payrollAdjustment.findFirst({
      where: { id: adjustmentId, tenant_id: tenantId },
    });

    if (!adjustment) {
      throw new NotFoundException({
        code: 'ADJUSTMENT_NOT_FOUND',
        message: `Adjustment "${adjustmentId}" not found`,
      });
    }

    return this.serializeAdjustment(adjustment);
  }

  async updateAdjustment(tenantId: string, adjustmentId: string, dto: UpdateAdjustmentDto) {
    const adjustment = await this.prisma.payrollAdjustment.findFirst({
      where: { id: adjustmentId, tenant_id: tenantId },
      include: {
        payroll_run: { select: { status: true } },
      },
    });

    if (!adjustment) {
      throw new NotFoundException({
        code: 'ADJUSTMENT_NOT_FOUND',
        message: `Adjustment "${adjustmentId}" not found`,
      });
    }

    if (adjustment.payroll_run.status !== 'draft') {
      throw new BadRequestException({
        code: 'RUN_NOT_DRAFT',
        message: 'Adjustments can only be modified when the payroll run is in draft status',
      });
    }

    const updated = await this.prisma.payrollAdjustment.update({
      where: { id: adjustmentId },
      data: {
        ...(dto.adjustment_type !== undefined && { adjustment_type: dto.adjustment_type }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.reference_period !== undefined && { reference_period: dto.reference_period }),
      },
    });

    return this.serializeAdjustment(updated);
  }

  async deleteAdjustment(tenantId: string, adjustmentId: string) {
    const adjustment = await this.prisma.payrollAdjustment.findFirst({
      where: { id: adjustmentId, tenant_id: tenantId },
      include: {
        payroll_run: { select: { status: true } },
      },
    });

    if (!adjustment) {
      throw new NotFoundException({
        code: 'ADJUSTMENT_NOT_FOUND',
        message: `Adjustment "${adjustmentId}" not found`,
      });
    }

    if (adjustment.payroll_run.status !== 'draft') {
      throw new BadRequestException({
        code: 'RUN_NOT_DRAFT',
        message: 'Adjustments can only be deleted when the payroll run is in draft status',
      });
    }

    await this.prisma.payrollAdjustment.delete({ where: { id: adjustmentId } });
    return { id: adjustmentId, deleted: true };
  }

  private serializeAdjustment(adj: Record<string, unknown>): Record<string, unknown> {
    return {
      ...adj,
      amount: Number(adj['amount']),
    };
  }
}
