// ─── Payroll Overhaul (Wave 1) — Payslip-number formatter ──────────────────
//
// Single source of truth for payslip-number formatting. Imported by
// `FinalisationService` (Wave 2) so both finalisation paths — direct (school
// owner) and approval-callback (worker) — produce identical numbers. The
// audit found the two paths emitting `PSL-YYYYMM-000001` vs `PS-YYYYMM-00001`
// formats; the canonical format below is the direct-path's 6-digit sequence.
//
// Historical payslips finalised before the cutover keep their original
// numbers — this formatter only governs newly minted ones.

export interface FormatPayslipNumberInput {
  /** Tenant-configured payslip-number prefix (default 'PSL'). */
  prefix: string;
  periodYear: number;
  /** 1-12 (1 = January). */
  periodMonth: number;
  /** Monotonic sequence per (tenant, period). */
  sequence: number;
}

export const formatPayslipNumber = ({
  prefix,
  periodYear,
  periodMonth,
  sequence,
}: FormatPayslipNumberInput): string => {
  const yearMonth = `${periodYear}${String(periodMonth).padStart(2, '0')}`;
  const seq = String(sequence).padStart(6, '0');
  return `${prefix}-${yearMonth}-${seq}`;
};
