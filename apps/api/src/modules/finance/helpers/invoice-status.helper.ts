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
  if (writeOffAmount && writeOffAmount > 0 && Math.abs(balanceAmount) < 0.005) return 'written_off';
  if (Math.abs(balanceAmount) < 0.005) return 'paid';
  if (balanceAmount > 0.005 && Math.abs(balanceAmount - totalAmount) > 0.005) return 'partially_paid';
  if (Math.abs(balanceAmount - totalAmount) < 0.005 && dueDate < new Date()) return 'overdue';
  return 'issued';
}

/**
 * Round a monetary value to 2 decimal places.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
