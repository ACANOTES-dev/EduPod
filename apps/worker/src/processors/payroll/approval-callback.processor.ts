import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Job } from 'bullmq';

import { formatPayslipNumber, PAYROLL_ON_APPROVAL_JOB } from '@school/shared/payroll';

import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface ApprovalCallbackPayload extends TenantJobPayload {
  approval_request_id: string;
  target_entity_id: string; // payroll_run.id
  approver_user_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────
//
// Re-exports the canonical name from `@school/shared/payroll` so anyone who
// already imported the constant from this file keeps the identical string.
// New code should import directly from `@school/shared/payroll`.

export const PAYROLL_APPROVAL_CALLBACK_JOB = PAYROLL_ON_APPROVAL_JOB;

// ─── Processor ───────────────────────────────────────────────────────────────

@Injectable()
export class PayrollApprovalCallbackProcessor {
  private readonly logger = new Logger(PayrollApprovalCallbackProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job<ApprovalCallbackPayload>): Promise<void> {
    if (job.name !== PAYROLL_APPROVAL_CALLBACK_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${PAYROLL_APPROVAL_CALLBACK_JOB} — tenant ${tenant_id}, run ${job.data.target_entity_id}`,
    );

    const callbackJob = new PayrollApprovalCallbackJob(this.prisma);
    await callbackJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────
//
// Wave 2 of the payroll-overhaul rebuild — the worker callback now mirrors
// the API's `FinalisationService` behaviour:
//
//   - Reads pre-computed entry totals (createRun/refreshEntries on the API
//     side ran the new Decimal-safe calculation engine through the
//     `PayrollInputResolver`, populating `gross_pay`, `net_pay`, the new
//     `*_total` columns, and the legacy `basic_pay/bonus_pay/total_pay`
//     columns).
//   - Commits scheduled deduction applications (Phase 2 of the new
//     idempotent two-phase deduction model — exactly once per run).
//   - Generates payslips using the canonical
//     `formatPayslipNumber({prefix, periodYear, periodMonth, sequence})`
//     so both finalisation paths emit identical numbers.
//   - Self-heals on already-finalised runs (no double payslips).
//
// The previous inline Decimal recalculation is gone: the API path computes
// totals with the same engine and the worker trusts those values. Cross-path
// equivalence is enforced because both sides import from
// `@school/shared/payroll` and both sides read the same persisted entry
// totals.

const PAYSLIP_RENDER_VERSION = '2.0.0';

class PayrollApprovalCallbackJob extends TenantAwareJob<ApprovalCallbackPayload> {
  private readonly logger = new Logger(PayrollApprovalCallbackJob.name);

  protected async processJob(data: ApprovalCallbackPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, approval_request_id, target_entity_id, approver_user_id } = data;

    // 1. Fetch the run + entries in one shot
    const payrollRun = await tx.payrollRun.findFirst({
      where: { id: target_entity_id, tenant_id },
    });

    if (!payrollRun) {
      throw new Error(`Payroll run ${target_entity_id} not found for tenant ${tenant_id}`);
    }

    // Self-heal — already finalised
    if (payrollRun.status === 'finalised') {
      await tx.approvalRequest.update({
        where: { id: approval_request_id },
        data: {
          status: 'executed',
          executed_at: new Date(),
          callback_status: 'already_done',
          callback_error: 'Self-healed: payroll run already finalised',
        },
      });
      this.logger.log(
        `Run ${target_entity_id} already finalised; approval ${approval_request_id} self-healed`,
      );
      return;
    }

    if (payrollRun.status !== 'pending_approval') {
      // Skipped (cancelled, draft, etc.) — record and bail out.
      await tx.approvalRequest.update({
        where: { id: approval_request_id },
        data: {
          callback_status: 'skipped',
          callback_error: `Skipped: run was in unexpected status "${payrollRun.status}", expected "pending_approval"`,
        },
      });
      this.logger.warn(
        `Run ${target_entity_id} in unexpected status "${payrollRun.status}"; approval ${approval_request_id} skipped`,
      );
      return;
    }

    // 2. Commit any scheduled recurring-deduction applications (Phase 2)
    await this.commitDeductionApplications(tx, tenant_id, target_entity_id);

    // 3. Aggregate run totals from already-computed entry totals
    const entries = await tx.payrollEntry.findMany({
      where: { tenant_id, payroll_run_id: payrollRun.id },
      include: {
        staff_profile: { include: { user: true } },
        payslip: true,
      },
    });

    let totalBasic = new Decimal(0);
    let totalBonus = new Decimal(0);
    let totalNet = new Decimal(0);

    for (const e of entries) {
      totalBasic = totalBasic.plus(e.basic_pay);
      totalBonus = totalBonus.plus(e.bonus_pay);
      totalNet = totalNet.plus(e.net_pay ?? e.total_pay);
    }

    // 4. Generate payslips with unified format
    const branding = await tx.tenantBranding.findUnique({ where: { tenant_id } });
    const tenant = await tx.tenant.findFirst({ where: { id: tenant_id } });
    const prefix = branding?.payslip_prefix ?? 'PSL';
    const currencyCode = tenant?.currency_code ?? 'USD';
    const now = new Date();

    for (const entry of entries) {
      if (entry.payslip) continue; // idempotent — payslip already exists

      const sequence = await tx.tenantSequence.upsert({
        where: { tenant_id_sequence_type: { tenant_id, sequence_type: 'payslip' } },
        update: { current_value: { increment: 1 } },
        create: { tenant_id, sequence_type: 'payslip', current_value: 1 },
      });

      const payslipNumber = formatPayslipNumber({
        prefix,
        periodYear: payrollRun.period_year,
        periodMonth: payrollRun.period_month,
        sequence: Number(sequence.current_value),
      });

      const snapshot = {
        schema_version: 1 as const,
        staff: {
          staff_profile_id: entry.staff_profile_id,
          full_name: `${entry.staff_profile.user.first_name} ${entry.staff_profile.user.last_name}`,
          employee_number: entry.staff_profile.staff_number ?? null,
        },
        period: {
          year: payrollRun.period_year,
          month: payrollRun.period_month,
          start: new Date(payrollRun.period_year, payrollRun.period_month - 1, 1)
            .toISOString()
            .slice(0, 10),
          end: new Date(payrollRun.period_year, payrollRun.period_month, 0)
            .toISOString()
            .slice(0, 10),
        },
        compensation: {
          type: (entry.compensation_type ?? 'salaried') as 'salaried' | 'per_class' | 'mixed',
          base_salary: entry.snapshot_base_salary?.toString() ?? null,
          per_class_rate: entry.snapshot_per_class_rate?.toString() ?? null,
          bonus_class_multiplier: entry.snapshot_bonus_day_multiplier?.toString() ?? null,
        },
        inputs: {
          days_worked: (entry.days_worked ?? payrollRun.total_working_days).toString(),
          total_working_days: payrollRun.total_working_days,
          classes_delivered: entry.classes_taught ?? 0,
          classes_scheduled: entry.snapshot_assigned_class_count ?? 0,
          bonus_classes: 0,
        },
        components: {
          base_pay: entry.basic_pay.toString(),
          bonus_pay: entry.bonus_pay.toString(),
          allowances: [],
          one_offs: [],
          adjustments: [],
          deductions: [],
        },
        totals: {
          gross_pay: entry.gross_pay.toString(),
          total_deductions: entry.total_deductions.toString(),
          net_pay: entry.net_pay.toString(),
          allowances_total: entry.allowances_total.toString(),
          deductions_total: entry.deductions_total.toString(),
          adjustments_total: entry.adjustments_total.toString(),
          one_off_total: entry.one_off_total.toString(),
        },
        currency: { code: currencyCode },
        generated_at: now.toISOString(),
        generated_by_user_id: approver_user_id,
      };

      await tx.payslip.create({
        data: {
          tenant_id,
          payroll_entry_id: entry.id,
          payslip_number: payslipNumber,
          template_locale: 'en',
          issued_at: now,
          issued_by_user_id: approver_user_id,
          snapshot_payload_json: snapshot,
          render_version: PAYSLIP_RENDER_VERSION,
        },
      });
    }

    // 5. Finalise the run
    await tx.payrollRun.update({
      where: { id: payrollRun.id },
      data: {
        status: 'finalised',
        total_basic_pay: totalBasic,
        total_bonus_pay: totalBonus,
        total_pay: totalNet,
        headcount: entries.length,
        finalised_by_user_id: approver_user_id,
        finalised_at: new Date(),
      },
    });

    // 6. Mark approval executed
    await tx.approvalRequest.update({
      where: { id: approval_request_id },
      data: {
        status: 'executed',
        executed_at: new Date(),
        callback_status: 'executed',
        callback_error: null,
      },
    });

    this.logger.log(
      `Payroll run ${target_entity_id} finalised: ${entries.length} entries, net ${totalNet.toFixed(2)}, tenant ${tenant_id}`,
    );
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /**
   * Wave-2 Phase-2 deduction commit. Mirrors
   * `PayrollDeductionsService.commitApplications` from the API package —
   * inlined here so the worker does not need to DI the API service.
   * Decrements the underlying `staff_recurring_deductions.remaining_amount`
   * once per run; second invocation no-ops because all rows are committed.
   */
  private async commitDeductionApplications(
    tx: PrismaClient,
    tenantId: string,
    runId: string,
  ): Promise<void> {
    const apps = await tx.payrollDeductionApplication.findMany({
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

      await tx.staffRecurringDeduction.update({
        where: { id: deduction.id },
        data: {
          remaining_amount: newRemaining.toString(),
          months_remaining: newMonthsRemaining,
          active: stillActive,
        },
      });

      await tx.payrollDeductionApplication.update({
        where: { id: app.id },
        data: { committed_at: new Date() },
      });
    }
  }
}
