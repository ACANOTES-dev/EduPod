import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { formatPayslipNumber } from '@school/shared/payroll';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';

import { CalculationService } from './calculation.service';
import { PayrollDeductionsService } from './payroll-deductions.service';
import { PayrollInputResolver } from './payroll-input-resolver.service';

// ─── Payroll Overhaul (Wave 2) — single source of truth for finalisation ──
//
// Both finalisation paths (school-owner direct, approval-callback worker)
// flow through `finaliseAtomic`. Inside one RLS-scoped transaction we
//
//   1. Re-validate the run state (must be the caller's `expectedFromState`).
//   2. Re-resolve every input via the `PayrollInputResolver` (so totals
//      reflect any allowance/adjustment/one-off the user added between
//      createRun and finalise).
//   3. Run the Decimal-safe `CalculationService` per entry.
//   4. Persist BOTH the new aggregate columns (gross_pay, total_deductions,
//      net_pay, *_total) AND the legacy `basic_pay/bonus_pay/total_pay`
//      columns for backwards-compatible dashboard reads.
//   5. Commit deduction applications (Phase 2 — exactly once per run).
//   6. Generate one payslip per entry using `formatPayslipNumber` (the
//      canonical <PREFIX>-YYYYMM-NNNNNN format both paths now share).
//   7. Update the run state to `finalised`.
//   8. Mark the approval request executed (if applicable).
//
// Idempotent under retry: a second call on a `finalised` run is a no-op.

const PAYSLIP_RENDER_VERSION = '2.0.0';

export interface FinaliseAtomicInput {
  tenantId: string;
  runId: string;
  actorUserId: string;
  /**
   * Direct school-owner path passes 'draft'; worker callback path passes
   * 'pending_approval'. Asserts the precondition before doing any work.
   */
  expectedFromState: 'draft' | 'pending_approval';
  /**
   * Optional approval-request id to mark `executed` on completion. Only the
   * worker path supplies this; the direct path leaves it undefined.
   */
  approvalRequestId?: string;
}

@Injectable()
export class FinalisationService {
  private readonly logger = new Logger(FinalisationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PayrollInputResolver,
    private readonly engine: CalculationService,
    private readonly deductions: PayrollDeductionsService,
    private readonly approvals: ApprovalRequestsService,
    private readonly encryption: EncryptionService,
  ) {}

  async finaliseAtomic(input: FinaliseAtomicInput): Promise<void> {
    const { tenantId, runId, actorUserId, expectedFromState, approvalRequestId } = input;
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      // 1. Re-fetch run + assert state
      const run = await tx.payrollRun.findFirst({
        where: { id: runId, tenant_id: tenantId },
      });
      if (!run) {
        throw new NotFoundException({
          code: 'PAYROLL_RUN_NOT_FOUND',
          message: `Payroll run with id "${runId}" not found`,
        });
      }

      // Self-heal — second call after a successful finalise is a no-op
      if (run.status === 'finalised') {
        this.logger.log(`Run ${runId} already finalised; finaliseAtomic no-op (self-heal)`);
        return;
      }

      if (run.status !== expectedFromState) {
        throw new ConflictException({
          code: 'PAYROLL_RUN_INVALID_STATE',
          message: `Expected run to be ${expectedFromState}, found ${run.status}`,
        });
      }

      // 2. Re-resolve all inputs (idempotent — schedules deductions, no commits yet)
      const inputs = await this.resolver.resolveForRun(tenantId, runId, tx);

      // 3. Compute pay per entry
      const totals = {
        basic: new Decimal(0),
        bonus: new Decimal(0),
        net: new Decimal(0),
      };
      const entryResults: Array<{ entryId: string; gross: Decimal; net: Decimal }> = [];

      for (const [entryId, calcInput] of inputs) {
        const result = this.engine.compute(calcInput);

        totals.basic = totals.basic.plus(result.basePay);
        totals.bonus = totals.bonus.plus(result.bonusPay);
        totals.net = totals.net.plus(result.netPay);

        await tx.payrollEntry.update({
          where: { id: entryId },
          data: {
            // New aggregate columns (Wave 1 schema)
            gross_pay: result.grossPay.toString(),
            total_deductions: result.totalDeductions.toString(),
            net_pay: result.netPay.toString(),
            allowances_total: result.allowancesTotal.toString(),
            deductions_total: result.deductionsTotal.toString(),
            adjustments_total: result.adjustmentsTotal.toString(),
            one_off_total: result.oneOffTotal.toString(),
            // Backwards-compatible columns — Wave 5 plans the deprecation
            basic_pay: result.basePay.toString(),
            bonus_pay: result.bonusPay.toString(),
            total_pay: result.netPay.toString(),
          },
        });

        entryResults.push({ entryId, gross: result.grossPay, net: result.netPay });
      }

      // 4. Commit deduction applications (Phase 2 — exactly once per run)
      await this.deductions.commitApplications(tenantId, runId, tx);

      // 5. Generate payslips with unified number format
      await this.generatePayslipsForRun(tenantId, runId, actorUserId, tx);

      // 6. Update run state
      await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'finalised',
          total_basic_pay: totals.basic.toString(),
          total_bonus_pay: totals.bonus.toString(),
          total_pay: totals.net.toString(),
          headcount: entryResults.length,
          finalised_by_user_id: actorUserId,
          finalised_at: new Date(),
        },
      });

      // 7. Mark approval request executed if we have one
      if (approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: approvalRequestId },
          data: {
            status: 'executed',
            executed_at: new Date(),
            callback_status: 'executed',
            callback_error: null,
          },
        });
      } else if (run.approval_request_id) {
        // Direct path may still have an approval row attached if a previous
        // attempt was retried — execute it for consistency.
        await tx.approvalRequest.update({
          where: { id: run.approval_request_id },
          data: { status: 'executed', executed_at: new Date() },
        });
      }

      this.logger.log(
        `Run ${runId} finalised: ${entryResults.length} entries, net ${totals.net.toString()}, tenant ${tenantId}`,
      );
    });
  }

  // ─── Payslip generation ───────────────────────────────────────────────
  //
  // Skips entries that already have a payslip (idempotent retry). Allocates
  // numbers via the `tenant_sequences` table, formatted by the shared
  // `formatPayslipNumber` so both finalisation paths emit identical numbers.

  private async generatePayslipsForRun(
    tenantId: string,
    runId: string,
    actorUserId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const run = await tx.payrollRun.findFirstOrThrow({
      where: { id: runId, tenant_id: tenantId },
      include: {
        entries: {
          include: {
            staff_profile: { include: { user: true } },
            payslip: true,
          },
        },
      },
    });

    const branding = await tx.tenantBranding.findUnique({ where: { tenant_id: tenantId } });
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    const prefix = branding?.payslip_prefix ?? 'PSL';
    const currencyCode = tenant?.currency_code ?? 'USD';
    const now = new Date();

    for (const entry of run.entries) {
      // Idempotent: skip entries that already have a payslip
      if (entry.payslip) continue;

      // Allocate next sequence atomically inside the transaction
      const sequence = await tx.tenantSequence.upsert({
        where: { tenant_id_sequence_type: { tenant_id: tenantId, sequence_type: 'payslip' } },
        update: { current_value: { increment: 1 } },
        create: { tenant_id: tenantId, sequence_type: 'payslip', current_value: 1 },
      });

      const payslipNumber = formatPayslipNumber({
        prefix,
        periodYear: run.period_year,
        periodMonth: run.period_month,
        sequence: Number(sequence.current_value),
      });

      const bankLast4 = await this.bankLast4(entry.staff_profile);

      const snapshot = {
        schema_version: 1 as const,
        staff: {
          staff_profile_id: entry.staff_profile_id,
          full_name: `${entry.staff_profile.user.first_name} ${entry.staff_profile.user.last_name}`,
          employee_number: entry.staff_profile.staff_number ?? null,
        },
        period: {
          year: run.period_year,
          month: run.period_month,
          start: new Date(run.period_year, run.period_month - 1, 1).toISOString().slice(0, 10),
          end: new Date(run.period_year, run.period_month, 0).toISOString().slice(0, 10),
        },
        compensation: {
          type: (entry.compensation_type ?? 'salaried') as 'salaried' | 'per_class' | 'mixed',
          base_salary: entry.snapshot_base_salary?.toString() ?? null,
          per_class_rate: entry.snapshot_per_class_rate?.toString() ?? null,
          bonus_class_multiplier: entry.snapshot_bonus_day_multiplier?.toString() ?? null,
        },
        inputs: {
          days_worked: (entry.days_worked ?? run.total_working_days).toString(),
          total_working_days: run.total_working_days,
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
        generated_by_user_id: actorUserId,
        bank_account_last4: bankLast4,
      };

      await tx.payslip.create({
        data: {
          tenant_id: tenantId,
          payroll_entry_id: entry.id,
          payslip_number: payslipNumber,
          template_locale: 'en',
          issued_at: now,
          issued_by_user_id: actorUserId,
          snapshot_payload_json: snapshot as unknown as Prisma.InputJsonValue,
          render_version: PAYSLIP_RENDER_VERSION,
        },
      });
    }
  }

  private async bankLast4(staffProfile: {
    bank_account_number_encrypted?: string | null;
    bank_encryption_key_ref?: string | null;
  }): Promise<string | null> {
    if (!staffProfile.bank_account_number_encrypted || !staffProfile.bank_encryption_key_ref) {
      return null;
    }
    try {
      const decrypted = this.encryption.decrypt(
        staffProfile.bank_account_number_encrypted,
        staffProfile.bank_encryption_key_ref,
      );
      return decrypted.length > 4 ? decrypted.slice(-4) : decrypted;
    } catch (err) {
      this.logger.warn(`Failed to decrypt bank account: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Approval-service touchpoint — surfaces the DI symbol so Wave 3 can
   * route the approval-status mutation through the service layer if it
   * decides to do so. Today we go through `tx.approvalRequest.update`
   * inside the same transaction for atomicity.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _approvalsServiceUsed(): ApprovalRequestsService {
    return this.approvals;
  }
}
