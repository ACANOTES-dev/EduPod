import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateAllowanceTypeDto,
  CreateStaffAllowanceDto,
  UpdateAllowanceTypeDto,
  UpdateStaffAllowanceDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PayrollAllowancesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Allowance Types ─────────────────────────────────────────────────────────

  async createAllowanceType(
    tenantId: string,
    dto: CreateAllowanceTypeDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.payrollAllowanceType.findUnique({
        where: {
          idx_payroll_allowance_types_tenant_name: {
            tenant_id: tenantId,
            name: dto.name,
          },
        },
      });

      if (existing) {
        throw new ConflictException({
          code: 'ALLOWANCE_TYPE_NAME_CONFLICT',
          message: `An allowance type with name "${dto.name}" already exists`,
        });
      }

      return db.payrollAllowanceType.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          name_ar: dto.name_ar ?? null,
          is_recurring: dto.is_recurring ?? true,
          default_amount: dto.default_amount ?? null,
        },
      });
    });
  }

  async listAllowanceTypes(tenantId: string, activeOnly = true) {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (activeOnly) {
      where.active = true;
    }

    const types = await this.prisma.payrollAllowanceType.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return { data: types.map((t) => this.serializeAllowanceType(t)) };
  }

  async getAllowanceType(tenantId: string, typeId: string) {
    const type = await this.prisma.payrollAllowanceType.findFirst({
      where: { id: typeId, tenant_id: tenantId },
    });

    if (!type) {
      throw new NotFoundException({
        code: 'ALLOWANCE_TYPE_NOT_FOUND',
        message: `Allowance type "${typeId}" not found`,
      });
    }

    return this.serializeAllowanceType(type);
  }

  async updateAllowanceType(
    tenantId: string,
    typeId: string,
    dto: UpdateAllowanceTypeDto,
  ) {
    await this.getAllowanceType(tenantId, typeId);

    const updated = await this.prisma.payrollAllowanceType.update({
      where: { id: typeId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.name_ar !== undefined && { name_ar: dto.name_ar }),
        ...(dto.is_recurring !== undefined && { is_recurring: dto.is_recurring }),
        ...(dto.default_amount !== undefined && { default_amount: dto.default_amount }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });

    return this.serializeAllowanceType(updated);
  }

  async deleteAllowanceType(tenantId: string, typeId: string) {
    await this.getAllowanceType(tenantId, typeId);
    await this.prisma.payrollAllowanceType.delete({ where: { id: typeId } });
    return { id: typeId, deleted: true };
  }

  // ─── Staff Allowances ─────────────────────────────────────────────────────────

  async createStaffAllowance(
    tenantId: string,
    dto: CreateStaffAllowanceDto,
  ) {
    // Validate allowance type exists
    await this.getAllowanceType(tenantId, dto.allowance_type_id);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const allowance = await db.staffAllowance.create({
        data: {
          tenant_id: tenantId,
          staff_profile_id: dto.staff_profile_id,
          allowance_type_id: dto.allowance_type_id,
          amount: dto.amount,
          effective_from: new Date(dto.effective_from),
          effective_to: dto.effective_to ? new Date(dto.effective_to) : null,
        },
        include: {
          allowance_type: { select: { id: true, name: true, name_ar: true } },
        },
      });

      return this.serializeStaffAllowance(allowance);
    });
  }

  async listStaffAllowances(
    tenantId: string,
    staffProfileId: string,
    activeOnly = true,
  ) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      staff_profile_id: staffProfileId,
    };

    if (activeOnly) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.effective_from = { lte: today };
      where.OR = [
        { effective_to: null },
        { effective_to: { gte: today } },
      ];
    }

    const allowances = await this.prisma.staffAllowance.findMany({
      where,
      include: {
        allowance_type: { select: { id: true, name: true, name_ar: true } },
      },
      orderBy: { effective_from: 'asc' },
    });

    return { data: allowances.map((a) => this.serializeStaffAllowance(a)) };
  }

  async updateStaffAllowance(
    tenantId: string,
    allowanceId: string,
    dto: UpdateStaffAllowanceDto,
  ) {
    const allowance = await this.prisma.staffAllowance.findFirst({
      where: { id: allowanceId, tenant_id: tenantId },
    });

    if (!allowance) {
      throw new NotFoundException({
        code: 'STAFF_ALLOWANCE_NOT_FOUND',
        message: `Staff allowance "${allowanceId}" not found`,
      });
    }

    const updated = await this.prisma.staffAllowance.update({
      where: { id: allowanceId },
      data: {
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.effective_from !== undefined && { effective_from: new Date(dto.effective_from) }),
        ...(dto.effective_to !== undefined && {
          effective_to: dto.effective_to ? new Date(dto.effective_to) : null,
        }),
      },
      include: {
        allowance_type: { select: { id: true, name: true, name_ar: true } },
      },
    });

    return this.serializeStaffAllowance(updated);
  }

  async deleteStaffAllowance(tenantId: string, allowanceId: string) {
    const allowance = await this.prisma.staffAllowance.findFirst({
      where: { id: allowanceId, tenant_id: tenantId },
    });

    if (!allowance) {
      throw new NotFoundException({
        code: 'STAFF_ALLOWANCE_NOT_FOUND',
        message: `Staff allowance "${allowanceId}" not found`,
      });
    }

    await this.prisma.staffAllowance.delete({ where: { id: allowanceId } });
    return { id: allowanceId, deleted: true };
  }

  /**
   * Calculate total active allowances for a staff member at a given date.
   * Used when auto-populating payroll entries.
   */
  async calculateAllowancesForEntry(
    tenantId: string,
    staffProfileId: string,
    asOfDate: Date,
  ) {
    const allowances = await this.prisma.staffAllowance.findMany({
      where: {
        tenant_id: tenantId,
        staff_profile_id: staffProfileId,
        effective_from: { lte: asOfDate },
        OR: [
          { effective_to: null },
          { effective_to: { gte: asOfDate } },
        ],
      },
      include: {
        allowance_type: { select: { id: true, name: true, name_ar: true, is_recurring: true } },
      },
    });

    const total = allowances.reduce((sum, a) => sum + Number(a.amount), 0);

    return {
      allowances: allowances.map((a) => ({
        id: a.id,
        allowance_type_id: a.allowance_type_id,
        name: a.allowance_type.name,
        name_ar: a.allowance_type.name_ar,
        amount: Number(a.amount),
        is_recurring: a.allowance_type.is_recurring,
      })),
      total: Number(total.toFixed(2)),
    };
  }

  private serializeAllowanceType(type: Record<string, unknown>): Record<string, unknown> {
    return {
      ...type,
      default_amount: type['default_amount'] != null ? Number(type['default_amount']) : null,
    };
  }

  private serializeStaffAllowance(allowance: Record<string, unknown>): Record<string, unknown> {
    return {
      ...allowance,
      amount: Number(allowance['amount']),
    };
  }
}
