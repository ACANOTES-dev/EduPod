import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

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

  async createAllowanceType(tenantId: string, dto: CreateAllowanceTypeDto) {
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

  async updateAllowanceType(tenantId: string, typeId: string, dto: UpdateAllowanceTypeDto) {
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

  async createStaffAllowance(tenantId: string, dto: CreateStaffAllowanceDto) {
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

  /**
   * Tenant-wide listing of staff allowances. Used by the Wave-3
   * `GET /v1/payroll/staff-allowances` endpoint when no specific
   * `staff_profile_id` is passed (or `?include=all`). Each row carries
   * a flat staff_name for the frontend.
   */
  async listStaffAllowancesForTenant(tenantId: string, activeOnly = true) {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (activeOnly) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.effective_from = { lte: today };
      where.OR = [{ effective_to: null }, { effective_to: { gte: today } }];
    }

    const allowances = await this.prisma.staffAllowance.findMany({
      where,
      include: {
        allowance_type: { select: { id: true, name: true, name_ar: true } },
        staff_profile: {
          select: {
            id: true,
            staff_number: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
      orderBy: { effective_from: 'desc' },
    });

    return {
      data: allowances.map((a) => ({
        ...this.serializeStaffAllowance(a),
        staff_name: `${a.staff_profile.user.first_name} ${a.staff_profile.user.last_name}`.trim(),
        staff_number: a.staff_profile.staff_number,
      })),
    };
  }

  async listStaffAllowances(tenantId: string, staffProfileId: string, activeOnly = true) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      staff_profile_id: staffProfileId,
    };

    if (activeOnly) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.effective_from = { lte: today };
      where.OR = [{ effective_to: null }, { effective_to: { gte: today } }];
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

  async updateStaffAllowance(tenantId: string, allowanceId: string, dto: UpdateStaffAllowanceDto) {
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
   * List all allowances active during the run's period for every staff
   * member who has an entry in the run. Used by the run-detail page's
   * allowances tab. Each row carries a flat `staff_name` for the
   * frontend (SEND-pattern flatten).
   */
  async listForRun(
    tenantId: string,
    runId: string,
  ): Promise<{
    data: Array<{
      id: string;
      staff_profile_id: string;
      staff_name: string;
      allowance_type_id: string;
      allowance_type_name: string;
      amount: number;
      effective_from: Date;
      effective_to: Date | null;
    }>;
  }> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      select: {
        id: true,
        period_year: true,
        period_month: true,
        entries: {
          select: {
            staff_profile_id: true,
            staff_profile: {
              select: { user: { select: { first_name: true, last_name: true } } },
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run "${runId}" not found`,
      });
    }

    const periodStart = new Date(run.period_year, run.period_month - 1, 1);
    const periodEnd = new Date(run.period_year, run.period_month, 0);

    const staffNameById = new Map<string, string>();
    for (const e of run.entries) {
      staffNameById.set(
        e.staff_profile_id,
        `${e.staff_profile.user.first_name} ${e.staff_profile.user.last_name}`.trim(),
      );
    }

    const staffIds = Array.from(staffNameById.keys());
    if (staffIds.length === 0) return { data: [] };

    const allowances = await this.prisma.staffAllowance.findMany({
      where: {
        tenant_id: tenantId,
        staff_profile_id: { in: staffIds },
        effective_from: { lte: periodEnd },
        OR: [{ effective_to: null }, { effective_to: { gte: periodStart } }],
      },
      include: {
        allowance_type: { select: { id: true, name: true, name_ar: true } },
      },
      orderBy: [{ staff_profile_id: 'asc' }, { effective_from: 'asc' }],
    });

    return {
      data: allowances.map((a) => ({
        id: a.id,
        staff_profile_id: a.staff_profile_id,
        staff_name: staffNameById.get(a.staff_profile_id) ?? '',
        allowance_type_id: a.allowance_type_id,
        allowance_type_name: a.allowance_type.name,
        amount: Number(a.amount),
        effective_from: a.effective_from,
        effective_to: a.effective_to,
      })),
    };
  }

  /**
   * Period-bracketed allowances total as a `Decimal`. Sums every
   * `staff_allowances` row whose effective range overlaps
   * `[periodStart, periodEnd]`. Wave 2 of the payroll-overhaul rebuild —
   * the input the resolver feeds into the calculation engine.
   */
  async calculateAllowancesTotalForPeriod(
    tenantId: string,
    staffProfileId: string,
    periodStart: Date,
    periodEnd: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<Decimal> {
    const db = tx ?? this.prisma;
    const allowances = await db.staffAllowance.findMany({
      where: {
        tenant_id: tenantId,
        staff_profile_id: staffProfileId,
        effective_from: { lte: periodEnd },
        OR: [{ effective_to: null }, { effective_to: { gte: periodStart } }],
      },
    });

    let total = new Decimal(0);
    for (const a of allowances) {
      total = total.plus(a.amount.toString());
    }
    return total;
  }

  /**
   * Calculate total active allowances for a staff member at a given date.
   * Used when auto-populating payroll entries.
   */
  async calculateAllowancesForEntry(tenantId: string, staffProfileId: string, asOfDate: Date) {
    const allowances = await this.prisma.staffAllowance.findMany({
      where: {
        tenant_id: tenantId,
        staff_profile_id: staffProfileId,
        effective_from: { lte: asOfDate },
        OR: [{ effective_to: null }, { effective_to: { gte: asOfDate } }],
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
