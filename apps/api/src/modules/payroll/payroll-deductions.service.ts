import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import type { CreateRecurringDeductionDto, UpdateRecurringDeductionDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PayrollDeductionsService {
  private readonly logger = new Logger(PayrollDeductionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createDeduction(tenantId: string, userId: string, dto: CreateRecurringDeductionDto) {
    const monthsRequired = Math.ceil(dto.total_amount / dto.monthly_amount);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const deduction = await db.staffRecurringDeduction.create({
        data: {
          tenant_id: tenantId,
          staff_profile_id: dto.staff_profile_id,
          description: dto.description,
          total_amount: dto.total_amount,
          monthly_amount: dto.monthly_amount,
          remaining_amount: dto.total_amount,
          start_date: new Date(dto.start_date),
          months_remaining: monthsRequired,
          active: true,
          created_by_user_id: userId,
        },
      });

      return this.serializeDeduction(deduction);
    });
  }

  async listDeductions(tenantId: string, staffProfileId: string, activeOnly = true) {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      staff_profile_id: staffProfileId,
    };

    if (activeOnly) {
      where.active = true;
    }

    const deductions = await this.prisma.staffRecurringDeduction.findMany({
      where,
      orderBy: { created_at: 'asc' },
    });

    return { data: deductions.map((d) => this.serializeDeduction(d)) };
  }

  async getDeduction(tenantId: string, deductionId: string) {
    const deduction = await this.prisma.staffRecurringDeduction.findFirst({
      where: { id: deductionId, tenant_id: tenantId },
    });

    if (!deduction) {
      throw new NotFoundException({
        code: 'DEDUCTION_NOT_FOUND',
        message: `Deduction "${deductionId}" not found`,
      });
    }

    return this.serializeDeduction(deduction);
  }

  async updateDeduction(tenantId: string, deductionId: string, dto: UpdateRecurringDeductionDto) {
    await this.getDeduction(tenantId, deductionId);

    const updated = await this.prisma.staffRecurringDeduction.update({
      where: { id: deductionId },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.monthly_amount !== undefined && { monthly_amount: dto.monthly_amount }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });

    return this.serializeDeduction(updated);
  }

  async deleteDeduction(tenantId: string, deductionId: string) {
    await this.getDeduction(tenantId, deductionId);
    await this.prisma.staffRecurringDeduction.delete({ where: { id: deductionId } });
    return { id: deductionId, deleted: true };
  }

  /**
   * Wave-2 Phase 1 — Schedule applications. Idempotent.
   *
   * Inserts (or no-ops on conflict) one row in payroll_deduction_applications
   * for each ACTIVE deduction the staff member has at the run's period
   * start. Returns the total scheduled amount as a Decimal — the input the
   * resolver feeds into the calculation engine.
   *
   * The unique key (payroll_run_id, staff_recurring_deduction_id) means
   * calling this twice for the same run is a safe no-op. Balances are NOT
   * decremented here; that happens in `commitApplications` (Phase 2),
   * called atomically inside `FinalisationService.finaliseAtomic`.
   */
  async scheduleApplicationForRun(
    tenantId: string,
    runId: string,
    entryId: string,
    staffProfileId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Decimal> {
    const db = tx ?? this.prisma;
    const run = await db.payrollRun.findFirstOrThrow({
      where: { id: runId, tenant_id: tenantId },
    });
    const periodStart = new Date(run.period_year, run.period_month - 1, 1);

    const deductions = await db.staffRecurringDeduction.findMany({
      where: {
        tenant_id: tenantId,
        staff_profile_id: staffProfileId,
        active: true,
        start_date: { lte: periodStart },
      },
    });

    let total = new Decimal(0);
    for (const d of deductions) {
      const remaining = new Decimal(d.remaining_amount.toString());
      const monthly = new Decimal(d.monthly_amount.toString());
      const applied = Decimal.min(monthly, remaining);

      if (applied.lte(0)) continue;

      // Idempotent: the unique key (payroll_run_id, staff_recurring_deduction_id)
      // ensures only one application row per (run, deduction) pair.
      await db.payrollDeductionApplication.upsert({
        where: {
          uniq_deduction_per_run: {
            payroll_run_id: runId,
            staff_recurring_deduction_id: d.id,
          },
        },
        create: {
          tenant_id: tenantId,
          payroll_run_id: runId,
          payroll_entry_id: entryId,
          staff_recurring_deduction_id: d.id,
          applied_amount: applied.toString(),
        },
        update: {}, // existing application stands
      });

      total = total.plus(applied);
    }

    return total;
  }

  /**
   * Wave-2 Phase 2 — Commit scheduled applications. Decrements balances
   * exactly once per run by transitioning each application from
   * `committed_at IS NULL` to `committed_at = now()` and decrementing the
   * underlying deduction's `remaining_amount` and `months_remaining`. If
   * the balance reaches zero or months_remaining hits zero, the deduction
   * is marked `active = false`.
   *
   * Idempotent: a second call sees zero un-committed applications and
   * no-ops.
   */
  async commitApplications(
    tenantId: string,
    runId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    const apps = await db.payrollDeductionApplication.findMany({
      where: { tenant_id: tenantId, payroll_run_id: runId, committed_at: null },
      include: { staff_recurring_deduction: true },
    });

    for (const app of apps) {
      const deduction = app.staff_recurring_deduction;
      const remainingNow = new Decimal(deduction.remaining_amount.toString());
      const applied = new Decimal(app.applied_amount.toString());
      const newRemaining = Decimal.max(remainingNow.minus(applied), new Decimal(0));
      const newMonthsRemaining = Math.max(0, deduction.months_remaining - 1);
      const stillActive = newRemaining.gt(0) && newMonthsRemaining > 0;

      await db.staffRecurringDeduction.update({
        where: { id: deduction.id },
        data: {
          remaining_amount: newRemaining.toString(),
          months_remaining: newMonthsRemaining,
          active: stillActive,
        },
      });

      await db.payrollDeductionApplication.update({
        where: { id: app.id },
        data: { committed_at: new Date() },
      });

      if (!stillActive) {
        this.logger.log(`Deduction ${deduction.id} fully repaid — marked inactive (run ${runId})`);
      }
    }
  }

  /**
   * @deprecated Use `scheduleApplicationForRun` + `commitApplications`.
   * Auto-apply active deductions for a payroll run — destructive,
   * non-idempotent. Pre-rebuild call sites still rely on this; Wave 5
   * removes it once those sites migrate to the two-phase API.
   * Called during run creation/refresh to decrement remaining_amount
   * and mark completed deductions inactive.
   * Returns total deduction amount for each staff member.
   */
  async autoApplyForRun(tenantId: string, runId: string): Promise<Map<string, number>> {
    const entries = await this.prisma.payrollEntry.findMany({
      where: { payroll_run_id: runId, tenant_id: tenantId },
      select: { id: true, staff_profile_id: true },
    });

    const staffDeductionMap = new Map<string, number>();

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      for (const entry of entries) {
        const activeDeductions = await db.staffRecurringDeduction.findMany({
          where: {
            tenant_id: tenantId,
            staff_profile_id: entry.staff_profile_id,
            active: true,
          },
        });

        let totalDeductionForStaff = 0;

        for (const deduction of activeDeductions) {
          const monthlyAmt = Number(deduction.monthly_amount);
          const remainingAmt = Number(deduction.remaining_amount);
          const deductAmount = Math.min(monthlyAmt, remainingAmt);
          const newRemaining = Number((remainingAmt - deductAmount).toFixed(2));
          const newMonthsRemaining = Math.max(0, deduction.months_remaining - 1);
          const nowComplete = newRemaining <= 0;

          await db.staffRecurringDeduction.update({
            where: { id: deduction.id },
            data: {
              remaining_amount: newRemaining,
              months_remaining: newMonthsRemaining,
              active: !nowComplete,
            },
          });

          totalDeductionForStaff += deductAmount;

          if (nowComplete) {
            this.logger.log(
              `Deduction ${deduction.id} for staff ${entry.staff_profile_id} fully repaid — marking inactive`,
            );
          }
        }

        if (totalDeductionForStaff > 0) {
          staffDeductionMap.set(entry.staff_profile_id, Number(totalDeductionForStaff.toFixed(2)));
        }
      }
    });

    return staffDeductionMap;
  }

  /**
   * Get total active deduction amounts for a staff member at a given date.
   */
  async getActiveDeductionsForStaff(
    tenantId: string,
    staffProfileId: string,
  ): Promise<{ total_monthly_deduction: number; deductions: Array<Record<string, unknown>> }> {
    const deductions = await this.prisma.staffRecurringDeduction.findMany({
      where: {
        tenant_id: tenantId,
        staff_profile_id: staffProfileId,
        active: true,
      },
    });

    const total = deductions.reduce(
      (sum, d) => sum + Math.min(Number(d.monthly_amount), Number(d.remaining_amount)),
      0,
    );

    return {
      total_monthly_deduction: Number(total.toFixed(2)),
      deductions: deductions.map((d) => this.serializeDeduction(d)),
    };
  }

  private serializeDeduction(deduction: Record<string, unknown>): Record<string, unknown> {
    return {
      ...deduction,
      total_amount: Number(deduction['total_amount']),
      monthly_amount: Number(deduction['monthly_amount']),
      remaining_amount: Number(deduction['remaining_amount']),
    };
  }
}
