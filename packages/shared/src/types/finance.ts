export type BillingFrequency = 'one_off' | 'term' | 'monthly' | 'custom';
export type DiscountType = 'fixed' | 'percent';
export type InvoiceStatus = 'draft' | 'pending_approval' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void' | 'cancelled' | 'written_off';
export type InstallmentStatus = 'pending' | 'paid' | 'overdue';
export type PaymentMethod = 'stripe' | 'cash' | 'bank_transfer' | 'card_manual';
export type PaymentStatus = 'pending' | 'posted' | 'failed' | 'voided' | 'refunded_partial' | 'refunded_full';
export type RefundStatus = 'pending_approval' | 'approved' | 'executed' | 'failed' | 'rejected';

export interface FeeGenerationPreviewLine {
  household_id: string;
  household_name: string;
  student_id: string | null;
  student_name: string | null;
  fee_structure_id: string;
  fee_structure_name: string;
  base_amount: number;
  discount_name: string | null;
  discount_amount: number;
  line_total: number;
  is_duplicate: boolean;
  missing_billing_parent: boolean;
}

export interface FeeGenerationPreview {
  preview_lines: FeeGenerationPreviewLine[];
  summary: {
    total_households: number;
    total_lines: number;
    total_amount: number;
    duplicates_excluded: number;
    missing_billing_parent_count: number;
  };
}

export interface AllocationSuggestion {
  invoice_id: string;
  invoice_number: string;
  invoice_due_date: string;
  invoice_balance: number;
  suggested_amount: number;
}

export interface StatementEntry {
  date: string;
  type: 'invoice_issued' | 'payment_received' | 'allocation' | 'refund' | 'write_off';
  reference: string;
  description: string;
  debit: number | null;
  credit: number | null;
  running_balance: number;
}

export interface HouseholdStatementData {
  household: { id: string; household_name: string; billing_parent_name: string | null };
  entries: StatementEntry[];
  opening_balance: number;
  closing_balance: number;
  currency_code: string;
}

export interface FinanceDashboardData {
  expected_revenue: number;
  received_payments: number;
  outstanding: number;
  collection_rate: number;
  household_debt_breakdown: {
    pct_0_10: number;
    pct_10_30: number;
    pct_30_50: number;
    pct_50_plus: number;
  };
  pending_refund_approvals: number;
  recent_payments: Array<{
    id: string;
    payment_reference: string;
    amount: number;
    household_id: string;
    household_name: string;
    received_at: string;
    status: PaymentStatus;
  }>;
}
