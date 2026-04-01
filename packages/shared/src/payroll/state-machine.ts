import type { PayrollRun } from '../types/payroll';

// ─── Status type ──────────────────────────────────────────────────────────────

export type PayrollRunStatus = PayrollRun['status'];

// ─── Status transition map ────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  draft: ['pending_approval', 'finalised', 'cancelled'],
  pending_approval: ['draft', 'finalised'],
  finalised: [],
  cancelled: [],
};

const TERMINAL_STATUSES: readonly PayrollRunStatus[] = ['finalised', 'cancelled'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isValidPayrollRunTransition(from: PayrollRunStatus, to: PayrollRunStatus): boolean {
  if (TERMINAL_STATUSES.includes(from)) return false;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidPayrollRunTransitions(from: PayrollRunStatus): PayrollRunStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}

export function isTerminalPayrollRunStatus(status: PayrollRunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
