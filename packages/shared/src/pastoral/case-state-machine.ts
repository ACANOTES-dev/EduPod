import { type CaseStatus } from './enums';

// ─── Transition Map ─────────────────────────────────────────────────────────

export const CASE_TRANSITIONS: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = {
  open: ['active'],
  active: ['monitoring', 'resolved'],
  monitoring: ['active', 'resolved'],
  resolved: ['closed'],
  closed: ['open'],
} as const;

// ─── Display Labels ─────────────────────────────────────────────────────────

export const CASE_STATUS_LABELS: Readonly<Record<CaseStatus, string>> = {
  open: 'Open',
  active: 'Active',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  closed: 'Closed',
} as const;

// ─── Transition Helpers ─────────────────────────────────────────────────────

export function isValidCaseTransition(
  from: CaseStatus,
  to: CaseStatus,
): boolean {
  const allowed = CASE_TRANSITIONS[from];
  return allowed ? (allowed as readonly string[]).includes(to) : false;
}

export function getValidCaseTransitions(from: CaseStatus): CaseStatus[] {
  return [...(CASE_TRANSITIONS[from] ?? [])];
}

export function isCaseTerminal(_status: CaseStatus): boolean {
  // No terminal states — closed can reopen to open
  return false;
}
