import { BadRequestException } from '@nestjs/common';

import type { InvoiceStatus } from '@school/shared';
import { isValidInvoiceTransition, PAYABLE_INVOICE_STATUSES } from '@school/shared';

// ─── Transition validation ───────────────────────────────────────────────────

/**
 * Validate and enforce an invoice status transition.
 * Throws BadRequestException if the transition is not allowed.
 */
export function validateInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!isValidInvoiceTransition(from, to)) {
    throw new BadRequestException({
      code: 'INVALID_STATUS_TRANSITION',
      message: `Cannot transition invoice from "${from}" to "${to}"`,
    });
  }
}

// ─── Derive status from financial state ─────────────────────────────────────

/**
 * Derive the invoice status based on current financial state.
 * Used by recalculateBalance after payment allocation changes.
 * Pure function -- no dependencies beyond the transition map.
 */
export function deriveInvoiceStatus(
  currentStatus: string,
  balanceAmount: number,
  totalAmount: number,
  dueDate: Date,
  writeOffAmount: number | null,
): InvoiceStatus {
  // Terminal/approval states -- don't re-derive
  if (['void', 'cancelled', 'pending_approval'].includes(currentStatus)) {
    return currentStatus as InvoiceStatus;
  }
  if (writeOffAmount && writeOffAmount > 0 && Math.abs(balanceAmount) < 0.005) return 'written_off';
  if (Math.abs(balanceAmount) < 0.005) return 'paid';
  if (balanceAmount > 0.005 && Math.abs(balanceAmount - totalAmount) > 0.005)
    return 'partially_paid';
  if (Math.abs(balanceAmount - totalAmount) < 0.005 && dueDate < new Date()) return 'overdue';
  return 'issued';
}

// ─── Payable status check ───────────────────────────────────────────────────

/**
 * Check if an invoice status allows payment-related operations
 * (payment allocation, credit note application, late fee application).
 */
export function isPayableStatus(status: string): boolean {
  return PAYABLE_INVOICE_STATUSES.includes(status as InvoiceStatus);
}

// ─── Money rounding ─────────────────────────────────────────────────────────

/**
 * Round a monetary value to 2 decimal places.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
