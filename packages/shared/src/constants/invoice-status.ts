import type { InvoiceStatus } from '../types/finance';

// ─── Valid transitions ────────────────────────────────────────────────────────

/**
 * Single source of truth for the invoice state machine.
 *
 * User-initiated transitions:
 *   draft -> issued, pending_approval, cancelled
 *   pending_approval -> issued (via approval callback), cancelled
 *   issued -> void, written_off
 *   overdue -> void, written_off
 *
 * System-driven transitions (payment service, overdue cron):
 *   issued -> partially_paid, paid, overdue
 *   partially_paid -> paid, written_off
 *   overdue -> partially_paid, paid
 *
 * Terminal states (no outgoing transitions):
 *   paid, void, cancelled, written_off
 */
export const VALID_INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['pending_approval', 'issued', 'cancelled'],
  pending_approval: ['issued', 'cancelled'],
  issued: ['partially_paid', 'paid', 'overdue', 'void', 'written_off'],
  partially_paid: ['paid', 'written_off'],
  overdue: ['partially_paid', 'paid', 'void', 'written_off'],
  paid: [],
  void: [],
  cancelled: [],
  written_off: [],
};

// ─── Terminal statuses ────────────────────────────────────────────────────────

export const TERMINAL_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'paid',
  'void',
  'cancelled',
  'written_off',
];

// ─── Statuses that accept payments ───────────────────────────────────────────

export const PAYABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'issued',
  'partially_paid',
  'overdue',
];

// ─── Transition side effects documentation ───────────────────────────────────

export interface InvoiceTransitionMeta {
  description: string;
  initiator: 'user' | 'system' | 'either';
}

export const INVOICE_TRANSITION_META: Record<string, InvoiceTransitionMeta> = {
  'draft->pending_approval': {
    description: 'Invoice sent for approval before issuance',
    initiator: 'user',
  },
  'draft->issued': {
    description: 'Invoice issued directly (no approval required or auto-approved)',
    initiator: 'user',
  },
  'draft->cancelled': {
    description: 'Draft invoice cancelled before issuance',
    initiator: 'user',
  },
  'pending_approval->issued': {
    description: 'Invoice approved and issued via approval callback worker',
    initiator: 'system',
  },
  'pending_approval->cancelled': {
    description: 'Pending approval invoice cancelled by user',
    initiator: 'user',
  },
  'issued->partially_paid': {
    description: 'Payment allocated but balance remains',
    initiator: 'system',
  },
  'issued->paid': {
    description: 'Full payment received, balance zero',
    initiator: 'system',
  },
  'issued->overdue': {
    description: 'Due date passed, detected by finance:overdue-detection cron',
    initiator: 'system',
  },
  'issued->void': {
    description: 'Invoice voided (no payments allocated)',
    initiator: 'user',
  },
  'issued->written_off': {
    description: 'Issued invoice written off as bad debt',
    initiator: 'user',
  },
  'partially_paid->paid': {
    description: 'Remaining balance paid via payment allocation',
    initiator: 'system',
  },
  'partially_paid->written_off': {
    description: 'Partially paid invoice written off as bad debt',
    initiator: 'user',
  },
  'overdue->partially_paid': {
    description: 'Partial payment received on overdue invoice',
    initiator: 'system',
  },
  'overdue->paid': {
    description: 'Full payment received on overdue invoice',
    initiator: 'system',
  },
  'overdue->void': {
    description: 'Overdue invoice voided (no payments allocated)',
    initiator: 'user',
  },
  'overdue->written_off': {
    description: 'Overdue invoice written off as bad debt',
    initiator: 'user',
  },
};

// ─── Validation helpers ─────────────────────────────────────────────────────

export function isValidInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  const allowed = VALID_INVOICE_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function getValidInvoiceTransitions(from: InvoiceStatus): InvoiceStatus[] {
  return VALID_INVOICE_TRANSITIONS[from] ?? [];
}

export function isTerminalInvoiceStatus(status: InvoiceStatus): boolean {
  return TERMINAL_INVOICE_STATUSES.includes(status);
}

export function isPayableInvoiceStatus(status: InvoiceStatus): boolean {
  return PAYABLE_INVOICE_STATUSES.includes(status);
}
