import type { SenReferralStatus } from './enums';

// ─── Forward-only progression ─────────────────────────────────────────────────
// pending → scheduled → completed → report_received
// No backward transitions are permitted.

const FORWARD_ORDER: readonly SenReferralStatus[] = [
  'pending',
  'scheduled',
  'completed',
  'report_received',
];

const VALID_TRANSITIONS: Record<SenReferralStatus, SenReferralStatus[]> = {
  pending: ['scheduled'],
  scheduled: ['completed'],
  completed: ['report_received'],
  report_received: [],
};

const TERMINAL_STATUSES: readonly SenReferralStatus[] = ['report_received'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isValidReferralTransition(from: SenReferralStatus, to: SenReferralStatus): boolean {
  if (TERMINAL_STATUSES.includes(from)) return false;
  const fromIndex = FORWARD_ORDER.indexOf(from);
  const toIndex = FORWARD_ORDER.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) return false;
  // Enforce strictly forward-only: to must be exactly one step ahead
  if (toIndex <= fromIndex) return false;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidReferralTransitions(from: SenReferralStatus): SenReferralStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}

export function isTerminalReferralStatus(status: SenReferralStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
