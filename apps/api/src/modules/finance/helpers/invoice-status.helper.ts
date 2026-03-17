/**
 * Derive the invoice status based on current state.
 * Pure function — no dependencies.
 */
export function deriveInvoiceStatus(
  currentStatus: string,
  balanceAmount: number,
  totalAmount: number,
  dueDate: Date,
  writeOffAmount: number | null,
): string {
  // Terminal/approval states — don't re-derive
  if (['void', 'cancelled', 'pending_approval'].includes(currentStatus)) {
    return currentStatus;
  }
  if (writeOffAmount && writeOffAmount > 0 && balanceAmount === 0) return 'written_off';
  if (balanceAmount === 0) return 'paid';
  if (balanceAmount > 0 && balanceAmount < totalAmount) return 'partially_paid';
  if (balanceAmount === totalAmount && dueDate < new Date()) return 'overdue';
  return 'issued';
}

/**
 * Round a monetary value to 2 decimal places.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
