import type { ComplianceRequestStatus } from '../types/compliance';

// ─── Status transition map ────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ComplianceRequestStatus, ComplianceRequestStatus[]> = {
  submitted: ['classified'],
  classified: ['approved', 'rejected'],
  approved: ['completed'],
  rejected: [],
  completed: [],
};

const TERMINAL_STATUSES: readonly ComplianceRequestStatus[] = ['rejected', 'completed'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isValidComplianceTransition(
  from: ComplianceRequestStatus,
  to: ComplianceRequestStatus,
): boolean {
  if (TERMINAL_STATUSES.includes(from)) return false;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidComplianceTransitions(
  from: ComplianceRequestStatus,
): ComplianceRequestStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}

export function isTerminalComplianceStatus(status: ComplianceRequestStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
