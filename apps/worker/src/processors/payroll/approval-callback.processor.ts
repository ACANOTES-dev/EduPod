import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface ApprovalCallbackPayload extends TenantJobPayload {
  approval_request_id: string;
  target_entity_id: string; // payroll_run.id
  approver_user_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const PAYROLL_APPROVAL_CALLBACK_JOB = 'payroll:on-approval';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PAYROLL)
export class PayrollApprovalCallbackProcessor extends WorkerHost {
  private readonly logger = new Logger(PayrollApprovalCallbackProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

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

class PayrollApprovalCallbackJob extends TenantAwareJob<ApprovalCallbackPayload> {
  private readonly logger = new Logger(PayrollApprovalCallbackJob.name);

  protected async processJob(
    data: ApprovalCallbackPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, approval_request_id, target_entity_id, approver_user_id } = data;

    // 1. Fetch the payroll run and verify it is pending_approval
    const payrollRun = await tx.payrollRun.findFirst({
      where: {
        id: target_entity_id,
        tenant_id,
      },
      select: {
        id: true,
        status: true,
        period_month: true,
        period_year: true,
        period_label: true,
        total_working_days: true,
      },
    });

    if (!payrollRun) {
      throw new Error(`Payroll run ${target_entity_id} not found for tenant ${tenant_id}`);
    }

    if (payrollRun.status !== 'pending_approval') {
      // Self-heal: update the approval request so it is no longer retried by reconciliation
      const isPostApproval = payrollRun.status === 'finalised';

      await tx.approvalRequest.update({
        where: { id: approval_request_id },
        data: {
          ...(isPostApproval ? { status: 'executed' as const, executed_at: new Date() } : {}),
          callback_status: isPostApproval ? 'already_completed' : 'skipped_unexpected_state',
          callback_error: `Self-healed: payroll run was in status "${payrollRun.status}"`,
        },
      });

      this.logger.warn(
        `Payroll run ${target_entity_id} is in status "${payrollRun.status}", expected "pending_approval". ` +
          `${isPostApproval ? 'Self-healed' : 'Skipped'}: approval request ${approval_request_id} updated.`,
      );
      return;
    }

    // 2. Fetch all entries for this run
    const entries = await tx.payrollEntry.findMany({
      where: {
        tenant_id,
        payroll_run_id: payrollRun.id,
      },
      include: {
        staff_profile: {
          include: {
            user: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
          },
        },
      },
    });

    // 3. Recalculate final values for each entry
    let totalBasicPay = new Decimal(0);
    let totalBonusPay = new Decimal(0);
    let totalPay = new Decimal(0);

    for (const entry of entries) {
      let basicPay = new Decimal(0);
      let bonusPay = new Decimal(0);

      if (entry.compensation_type === 'salaried') {
        // Salaried: basic_pay = base_salary * (days_worked / total_working_days)
        if (!entry.snapshot_base_salary) {
          throw new Error(`Entry ${entry.id} is salaried but has no snapshot_base_salary`);
        }
        const baseSalary = entry.snapshot_base_salary;
        const daysWorked = entry.days_worked ?? payrollRun.total_working_days;
        const workingDays = payrollRun.total_working_days;

        if (workingDays > 0) {
          basicPay = baseSalary.mul(daysWorked).div(workingDays);
        }

        // Bonus: extra days * daily rate * multiplier
        const extraDays = daysWorked - workingDays;
        if (extraDays > 0 && entry.snapshot_bonus_day_multiplier) {
          const dailyRate = baseSalary.div(workingDays);
          bonusPay = dailyRate.mul(extraDays).mul(entry.snapshot_bonus_day_multiplier);
        }
      } else {
        // Per class: basic_pay = per_class_rate * classes_taught (up to assigned)
        if (!entry.snapshot_per_class_rate) {
          throw new Error(`Entry ${entry.id} is per_class but has no snapshot_per_class_rate`);
        }
        const perClassRate = entry.snapshot_per_class_rate;
        const classesTaught = entry.classes_taught ?? 0;
        const assignedClasses = entry.snapshot_assigned_class_count ?? classesTaught;
        const billableClasses = Math.min(classesTaught, assignedClasses);

        basicPay = perClassRate.mul(billableClasses);

        // Bonus: extra classes * bonus_class_rate
        const extraClasses = classesTaught - assignedClasses;
        if (extraClasses > 0 && entry.snapshot_bonus_class_rate) {
          bonusPay = entry.snapshot_bonus_class_rate.mul(extraClasses);
        }
      }

      const entryTotal = basicPay.add(bonusPay);

      // Update entry with final calculated values
      await tx.payrollEntry.update({
        where: { id: entry.id },
        data: {
          basic_pay: basicPay,
          bonus_pay: bonusPay,
          total_pay: entryTotal,
        },
      });

      totalBasicPay = totalBasicPay.add(basicPay);
      totalBonusPay = totalBonusPay.add(bonusPay);
      totalPay = totalPay.add(entryTotal);
    }

    // 4. Generate payslips with sequence numbers
    const tenant = await tx.tenant.findFirst({
      where: { id: tenant_id },
      select: {
        name: true,
        currency_code: true,
      },
    });

    const branding = await tx.tenantBranding.findUnique({
      where: { tenant_id },
      select: {
        school_name_ar: true,
        logo_url: true,
        primary_color: true,
      },
    });

    const currencyCode = tenant?.currency_code || 'SAR';

    for (const entry of entries) {
      // Check if payslip already exists for this entry
      const existingPayslip = await tx.payslip.findFirst({
        where: {
          tenant_id,
          payroll_entry_id: entry.id,
        },
      });

      if (existingPayslip) {
        continue; // Skip if already generated
      }

      // Generate payslip number via tenant_sequences
      const sequence = await tx.tenantSequence.upsert({
        where: {
          tenant_id_sequence_type: {
            tenant_id,
            sequence_type: 'payslip',
          },
        },
        update: {
          current_value: { increment: 1 },
        },
        create: {
          tenant_id,
          sequence_type: 'payslip',
          current_value: 1,
        },
      });

      const periodStr = `${payrollRun.period_year}${String(payrollRun.period_month).padStart(2, '0')}`;
      const payslipNumber = `PS-${periodStr}-${String(sequence.current_value).padStart(5, '0')}`;

      // Re-fetch the updated entry to get final values
      const updatedEntry = await tx.payrollEntry.findUniqueOrThrow({
        where: { id: entry.id },
      });

      // Build snapshot payload
      const staffName = `${entry.staff_profile.user.first_name} ${entry.staff_profile.user.last_name}`;
      const snapshotPayload = {
        staff: {
          full_name: staffName,
          staff_number: entry.staff_profile.staff_number,
          department: entry.staff_profile.department,
          job_title: entry.staff_profile.job_title,
          employment_type: entry.staff_profile.employment_type,
          bank_name: entry.staff_profile.bank_name,
          bank_account_last4: null as string | null,
          bank_iban_last4: null as string | null,
        },
        period: {
          label: payrollRun.period_label,
          month: payrollRun.period_month,
          year: payrollRun.period_year,
          total_working_days: payrollRun.total_working_days,
        },
        compensation: {
          type: entry.compensation_type,
          base_salary: entry.snapshot_base_salary ? Number(entry.snapshot_base_salary) : null,
          per_class_rate: entry.snapshot_per_class_rate ? Number(entry.snapshot_per_class_rate) : null,
          assigned_class_count: entry.snapshot_assigned_class_count,
          bonus_class_rate: entry.snapshot_bonus_class_rate ? Number(entry.snapshot_bonus_class_rate) : null,
          bonus_day_multiplier: entry.snapshot_bonus_day_multiplier ? Number(entry.snapshot_bonus_day_multiplier) : null,
        },
        inputs: {
          days_worked: updatedEntry.days_worked,
          classes_taught: updatedEntry.classes_taught,
        },
        calculations: {
          basic_pay: Number(updatedEntry.basic_pay),
          bonus_pay: Number(updatedEntry.bonus_pay),
          total_pay: Number(updatedEntry.total_pay),
        },
        school: {
          name: tenant?.name || '',
          name_ar: branding?.school_name_ar || null,
          logo_url: branding?.logo_url || null,
          currency_code: currencyCode,
        },
        payslip_number: payslipNumber,
      };

      // Create the payslip
      await tx.payslip.create({
        data: {
          tenant_id,
          payroll_entry_id: entry.id,
          payslip_number: payslipNumber,
          template_locale: 'en',
          issued_at: new Date(),
          issued_by_user_id: approver_user_id,
          snapshot_payload_json: snapshotPayload,
          render_version: '1.0',
        },
      });
    }

    // 5. Finalise the payroll run
    await tx.payrollRun.update({
      where: { id: payrollRun.id },
      data: {
        status: 'finalised',
        total_basic_pay: totalBasicPay,
        total_bonus_pay: totalBonusPay,
        total_pay: totalPay,
        headcount: entries.length,
        finalised_by_user_id: approver_user_id,
        finalised_at: new Date(),
      },
    });

    // 6. Update the approval request to executed with callback tracking
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
      `Payroll run ${target_entity_id} finalised: ${entries.length} entries, total ${totalPay.toFixed(2)}, tenant ${tenant_id}`,
    );
  }
}
