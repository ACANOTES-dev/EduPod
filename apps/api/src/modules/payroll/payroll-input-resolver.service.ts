import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import type { CalcInput } from '@school/shared/payroll';

import { PrismaService } from '../prisma/prisma.service';

import { ClassDeliveryService } from './class-delivery.service';
import { CompensationService } from './compensation.service';
import { PayrollAdjustmentsService } from './payroll-adjustments.service';
import { PayrollAllowancesService } from './payroll-allowances.service';
import { PayrollDeductionsService } from './payroll-deductions.service';
import { PayrollOneOffsService } from './payroll-one-offs.service';
import { StaffAttendanceService } from './staff-attendance.service';

// ─── Payroll Overhaul (Wave 2) — single input resolver ────────────────────
//
// Assembles a fully-resolved `CalcInput` for every entry in a payroll run.
// This is the SINGLE place every input source meets — period-bracketed
// compensation, days-worked from attendance, classes-delivered from
// confirmed delivery records, allowances active in the period, scheduled
// recurring deductions (idempotent), one-offs split by sign, adjustments
// split by sign.
//
// The audit's #1 finding was that the calculation engine ignored almost
// every input it advertised. After this resolver, every input is wired in.
// Every read takes a `tx` so the resolver can run inside the caller's
// RLS-scoped transaction (typically `FinalisationService.finaliseAtomic`).

@Injectable()
export class PayrollInputResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: StaffAttendanceService,
    private readonly classDelivery: ClassDeliveryService,
    private readonly allowances: PayrollAllowancesService,
    private readonly deductions: PayrollDeductionsService,
    private readonly adjustments: PayrollAdjustmentsService,
    private readonly oneOffs: PayrollOneOffsService,
    private readonly compensation: CompensationService,
  ) {}

  /**
   * Returns one CalcInput per active entry in the run. Entries without a
   * period-active compensation are skipped (they cannot be paid this run).
   */
  async resolveForRun(
    tenantId: string,
    runId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, CalcInput>> {
    const db = tx ?? this.prisma;

    const run = await db.payrollRun.findFirstOrThrow({
      where: { id: runId, tenant_id: tenantId },
      include: {
        entries: true,
      },
    });

    const periodStart = new Date(run.period_year, run.period_month - 1, 1);
    const periodEnd = new Date(run.period_year, run.period_month, 0); // last day of month
    const totalWorkingDays = run.total_working_days;

    const result = new Map<string, CalcInput>();

    for (const entry of run.entries) {
      // 1. Period-bracketed compensation
      const comp = await this.compensation.findActiveForPeriod(
        tenantId,
        entry.staff_profile_id,
        periodStart,
        periodEnd,
        tx,
      );
      if (!comp) continue;

      const compType = comp.compensation_type as 'salaried' | 'per_class' | 'mixed';

      // 2. Days worked (salaried + mixed)
      const daysWorked =
        compType === 'salaried' || compType === 'mixed'
          ? await this.attendance.calculateDaysWorkedForPeriod(
              tenantId,
              entry.staff_profile_id,
              periodStart,
              periodEnd,
              totalWorkingDays,
              tx,
            )
          : new Decimal(totalWorkingDays);

      // 3. Classes delivered (per_class + mixed)
      const { delivered, bonusClasses } =
        compType === 'per_class' || compType === 'mixed'
          ? await this.classDelivery.calculateClassesDeliveredForPeriod(
              tenantId,
              entry.staff_profile_id,
              periodStart,
              periodEnd,
              tx,
            )
          : { delivered: 0, bonusClasses: 0 };

      // 4. Allowances active during the period
      const allowancesTotal = await this.allowances.calculateAllowancesTotalForPeriod(
        tenantId,
        entry.staff_profile_id,
        periodStart,
        periodEnd,
        tx,
      );

      // 5. Recurring deductions — schedule (idempotent)
      const scheduledDeductionsTotal = await this.deductions.scheduleApplicationForRun(
        tenantId,
        run.id,
        entry.id,
        entry.staff_profile_id,
        tx,
      );

      // 6. One-offs split positive/negative
      const oneOffSums = await this.oneOffs.sumByEntry(tenantId, entry.id, tx);

      // 7. Adjustments split positive/negative
      const adjustmentSums = await this.adjustments.sumByEntry(tenantId, entry.id, tx);

      result.set(entry.id, {
        compensationType: compType,
        baseSalary: comp.base_salary ? new Decimal(comp.base_salary.toString()) : null,
        daysWorked,
        totalWorkingDays,
        perClassRate: comp.per_class_rate ? new Decimal(comp.per_class_rate.toString()) : null,
        classesDelivered: delivered,
        bonusClasses,
        bonusClassMultiplier: comp.bonus_day_multiplier
          ? new Decimal(comp.bonus_day_multiplier.toString())
          : null,
        allowancesTotal,
        oneOffPositiveTotal: oneOffSums.positive,
        oneOffNegativeTotal: oneOffSums.negative,
        adjustmentPositiveTotal: adjustmentSums.positive,
        adjustmentNegativeTotal: adjustmentSums.negative,
        scheduledDeductionsTotal,
      });
    }

    return result;
  }
}
