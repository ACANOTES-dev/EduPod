import type { PaymentStatus } from '../types/finance';

// ─── Status transition map ────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['posted', 'failed', 'voided'],
  posted: ['refunded_partial', 'refunded_full', 'voided'],
  failed: ['pending'],
  refunded_partial: ['refunded_full'],
  voided: [],
  refunded_full: [],
};

const TERMINAL_STATUSES: readonly PaymentStatus[] = ['voided', 'refunded_full'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isValidPaymentTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  if (TERMINAL_STATUSES.includes(from)) return false;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidPaymentTransitions(from: PaymentStatus): PaymentStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
