/**
 * PayrollReadFacade — Centralised read service for payroll data.
 *
 * PURPOSE:
 * Several modules (compliance, reports, early-warning) read payroll tables
 * directly via Prisma, duplicating select clauses and coupling tightly to
 * the schema. This facade provides a single, well-typed entry point for
 * all cross-module payroll reads.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Batch methods return arrays (empty array = nothing found).
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// ─── Select shapes ──────────────────────────────────────────────────────────

const PAYROLL_RUN_SELECT = {
  id: true,
  tenant_id: true,
  period_label: true,
  period_month: true,
  period_year: true,
  total_working_days: true,
  status: true,
  total_basic_pay: true,
  total_bonus_pay: true,
  total_pay: true,
  headcount: true,
  created_at: true,
  updated_at: true,
} as const;

const STAFF_COMPENSATION_SELECT = {
  id: true,
  tenant_id: true,
  staff_profile_id: true,
  compensation_type: true,
  base_salary: true,
  per_class_rate: true,
  assigned_class_count: true,
  effective_from: true,
  effective_to: true,
  created_at: true,
  updated_at: true,
} as const;

const PAYSLIP_SELECT = {
  id: true,
  tenant_id: true,
  payroll_entry_id: true,
  payslip_number: true,
  template_locale: true,
  issued_at: true,
  created_at: true,
} as const;

const PAYROLL_ENTRY_SELECT = {
  id: true,
  tenant_id: true,
  payroll_run_id: true,
  staff_profile_id: true,
  compensation_type: true,
  basic_pay: true,
  bonus_pay: true,
  total_pay: true,
  days_worked: true,
  classes_taught: true,
  created_at: true,
  updated_at: true,
} as const;

const STAFF_ALLOWANCE_SELECT = {
  id: true,
  tenant_id: true,
  staff_profile_id: true,
  allowance_type_id: true,
  amount: true,
  effective_from: true,
  effective_to: true,
  created_at: true,
  updated_at: true,
} as const;

const STAFF_RECURRING_DEDUCTION_SELECT = {
  id: true,
  tenant_id: true,
  staff_profile_id: true,
  description: true,
  total_amount: true,
  monthly_amount: true,
  remaining_amount: true,
  start_date: true,
  months_remaining: true,
  active: true,
  created_at: true,
  updated_at: true,
} as const;

const STAFF_ATTENDANCE_RECORD_SELECT = {
  id: true,
  tenant_id: true,
  staff_profile_id: true,
  date: true,
  status: true,
  notes: true,
  created_at: true,
  updated_at: true,
} as const;

// ─── Result types ───────────────────────────────────────────────────────────

export interface PayrollRunRow {
  id: string;
  tenant_id: string;
  period_label: string;
  period_month: number;
  period_year: number;
  total_working_days: number;
  status: string;
  total_basic_pay: unknown;
  total_bonus_pay: unknown;
  total_pay: unknown;
  headcount: number;
  created_at: Date;
  updated_at: Date;
}

export interface StaffCompensationRow {
  id: string;
  tenant_id: string;
  staff_profile_id: string;
  compensation_type: string;
  base_salary: unknown;
  per_class_rate: unknown;
  assigned_class_count: number | null;
  effective_from: Date;
  effective_to: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PayslipRow {
  id: string;
  tenant_id: string;
  payroll_entry_id: string;
  payslip_number: string;
  template_locale: string;
  issued_at: Date;
  created_at: Date;
}

export interface PayrollEntryRow {
  id: string;
  tenant_id: string;
  payroll_run_id: string;
  staff_profile_id: string;
  compensation_type: string;
  basic_pay: unknown;
  bonus_pay: unknown;
  total_pay: unknown;
  days_worked: number | null;
  classes_taught: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface StaffAllowanceRow {
  id: string;
  tenant_id: string;
  staff_profile_id: string;
  allowance_type_id: string;
  amount: unknown;
  effective_from: Date;
  effective_to: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface StaffRecurringDeductionRow {
  id: string;
  tenant_id: string;
  staff_profile_id: string;
  description: string;
  total_amount: unknown;
  monthly_amount: unknown;
  remaining_amount: unknown;
  start_date: Date;
  months_remaining: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface StaffAttendanceRecordRow {
  id: string;
  tenant_id: string;
  staff_profile_id: string;
  date: Date;
  status: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Facade ─────────────────────────────────────────────────────────────────

@Injectable()
export class PayrollReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Payroll Runs ─────────────────────────────────────────────────────────

  /**
   * Find all payroll runs for a tenant.
   * Used by reports data access.
   */
  async findPayrollRuns(tenantId: string): Promise<PayrollRunRow[]> {
    return this.prisma.payrollRun.findMany({
      where: { tenant_id: tenantId },
      select: PAYROLL_RUN_SELECT,
      orderBy: [{ period_year: 'desc' }, { period_month: 'desc' }],
    });
  }

  /**
   * Count payroll runs before a cutoff date.
   * Used by retention policies.
   */
  async countPayrollRunsBeforeDate(tenantId: string, cutoffDate: Date): Promise<number> {
    return this.prisma.payrollRun.count({
      where: {
        tenant_id: tenantId,
        created_at: { lt: cutoffDate },
      },
    });
  }

  // ─── Staff Compensation ───────────────────────────────────────────────────

  /**
   * Find all compensation records for a staff member.
   * Used by DSAR traversal and reports.
   */
  async findCompensationsByStaff(
    tenantId: string,
    staffProfileId: string,
  ): Promise<StaffCompensationRow[]> {
    return this.prisma.staffCompensation.findMany({
      where: { tenant_id: tenantId, staff_profile_id: staffProfileId },
      select: STAFF_COMPENSATION_SELECT,
      orderBy: { effective_from: 'desc' },
    });
  }

  /**
   * Find all compensation records for a tenant.
   * Used by reports data access.
   */
  async findCompensations(tenantId: string): Promise<StaffCompensationRow[]> {
    return this.prisma.staffCompensation.findMany({
      where: { tenant_id: tenantId },
      select: STAFF_COMPENSATION_SELECT,
      orderBy: { effective_from: 'desc' },
    });
  }

  // ─── Payroll Entries ──────────────────────────────────────────────────────

  /**
   * Find all payroll entries for a staff member.
   * Used by DSAR traversal.
   */
  async findPayrollEntriesByStaff(
    tenantId: string,
    staffProfileId: string,
  ): Promise<PayrollEntryRow[]> {
    return this.prisma.payrollEntry.findMany({
      where: { tenant_id: tenantId, staff_profile_id: staffProfileId },
      select: PAYROLL_ENTRY_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Payslips ─────────────────────────────────────────────────────────────

  /**
   * Find all payslips for a staff member (via payroll entry relation).
   * Used by DSAR traversal.
   */
  async findPayslipsByStaff(tenantId: string, staffProfileId: string): Promise<PayslipRow[]> {
    return this.prisma.payslip.findMany({
      where: {
        tenant_id: tenantId,
        payroll_entry: { staff_profile_id: staffProfileId },
      },
      select: PAYSLIP_SELECT,
      orderBy: { issued_at: 'desc' },
    });
  }

  // ─── Staff Allowances ─────────────────────────────────────────────────────

  /**
   * Find all allowances for a staff member.
   * Used by DSAR traversal.
   */
  async findAllowancesByStaff(
    tenantId: string,
    staffProfileId: string,
  ): Promise<StaffAllowanceRow[]> {
    return this.prisma.staffAllowance.findMany({
      where: { tenant_id: tenantId, staff_profile_id: staffProfileId },
      select: STAFF_ALLOWANCE_SELECT,
      orderBy: { effective_from: 'desc' },
    });
  }

  // ─── Staff Recurring Deductions ───────────────────────────────────────────

  /**
   * Find all recurring deductions for a staff member.
   * Used by DSAR traversal.
   */
  async findRecurringDeductionsByStaff(
    tenantId: string,
    staffProfileId: string,
  ): Promise<StaffRecurringDeductionRow[]> {
    return this.prisma.staffRecurringDeduction.findMany({
      where: { tenant_id: tenantId, staff_profile_id: staffProfileId },
      select: STAFF_RECURRING_DEDUCTION_SELECT,
      orderBy: { start_date: 'desc' },
    });
  }

  // ─── Staff Attendance Records ─────────────────────────────────────────────

  /**
   * Find staff attendance records for a staff member.
   * Used by reports data access.
   */
  async findStaffAttendanceByStaff(
    tenantId: string,
    staffProfileId: string,
  ): Promise<StaffAttendanceRecordRow[]> {
    return this.prisma.staffAttendanceRecord.findMany({
      where: { tenant_id: tenantId, staff_profile_id: staffProfileId },
      select: STAFF_ATTENDANCE_RECORD_SELECT,
      orderBy: { date: 'desc' },
    });
  }

  // ─── Generic reporting methods ──────────────────────────────────────────────

  /**
   * Generic findMany for payroll runs with optional where/select/orderBy.
   * Used by reports-data-access.
   */
  async findPayrollRunsGeneric(
    tenantId: string,
    where?: Prisma.PayrollRunWhereInput,
    select?: Prisma.PayrollRunSelect,
    orderBy?: Prisma.PayrollRunOrderByWithRelationInput,
  ): Promise<unknown[]> {
    return this.prisma.payrollRun.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
      ...(orderBy && { orderBy }),
    });
  }
}
