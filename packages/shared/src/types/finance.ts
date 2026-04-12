export type BillingFrequency = 'one_off' | 'term' | 'monthly' | 'custom';
export type DiscountType = 'fixed' | 'percent';
export type DiscountAutoConditionType = 'sibling' | 'staff';

export interface DiscountAutoCondition {
  type: DiscountAutoConditionType;
  min_students?: number; // sibling: minimum students in household to trigger
  applies_to?: string[]; // optional: fee_type_ids this discount applies to
}

export type HouseholdFinancialStatus = 'fully_paid' | 'partially_paid' | 'unpaid';

export interface HouseholdOverviewRow {
  household_id: string;
  household_name: string;
  household_number: string | null;
  status: HouseholdFinancialStatus;
  total: number;
  paid: number;
  balance: number;
  overdue: boolean;
  invoice_count: number;
}
export type InvoiceStatus =
  | 'draft'
  | 'pending_approval'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'void'
  | 'cancelled'
  | 'written_off';
export type InstallmentStatus = 'pending' | 'paid' | 'overdue';
export type PaymentMethod = 'stripe' | 'cash' | 'bank_transfer' | 'card_manual';
export type PaymentStatus =
  | 'pending'
  | 'posted'
  | 'failed'
  | 'voided'
  | 'refunded_partial'
  | 'refunded_full';
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
  date_from: string;
  date_to: string;
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
  invoice_status_counts: Record<InvoiceStatus, number>;
  aging_summary: Array<{
    bucket: 'current' | '1_30' | '31_60' | '61_90' | '90_plus';
    total: number;
    invoice_count: number;
  }>;
  overdue_invoices: Array<{
    id: string;
    invoice_number: string;
    household_name: string;
    total_amount: number;
    balance_amount: number;
    due_date: string;
    days_overdue: number;
  }>;
  top_debtors: Array<{
    household_id: string;
    household_name: string;
    total_owed: number;
    invoice_count: number;
  }>;
  pending_payment_plans: number;
  draft_invoices: number;
}
