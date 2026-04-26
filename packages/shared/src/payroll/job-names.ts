// ─── Payroll Overhaul (Wave 1) — Worker job-name constants ──────────────────
//
// Single source of truth for the names that the API enqueues with AND the
// names the worker dispatches on. Importing these from both sides makes
// job-name string mismatches impossible (the audit found two of three
// payroll workers were dead-on-arrival because the strings drifted).
//
// Imported by:
//   - apps/api/src/modules/payroll/* (enqueue sites — Wave 3+)
//   - apps/worker/src/processors/payroll/* (worker dispatch — Wave 3)

export const PAYROLL_QUEUE = 'payroll' as const;

export const PAYROLL_ON_APPROVAL_JOB = 'payroll:on-approval' as const;
export const PAYROLL_MASS_EXPORT_JOB = 'payroll:mass-export' as const;
export const PAYROLL_SESSION_GENERATION_JOB = 'payroll:session-generation' as const;

export type PayrollJobName =
  | typeof PAYROLL_ON_APPROVAL_JOB
  | typeof PAYROLL_MASS_EXPORT_JOB
  | typeof PAYROLL_SESSION_GENERATION_JOB;
