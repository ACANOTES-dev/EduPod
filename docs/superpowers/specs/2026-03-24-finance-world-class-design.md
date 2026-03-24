# Finance World-Class Enhancement — Design Spec

## Overview

10 features that transform finance from "functional billing" to a self-service, automated, reportable financial management system.

**Golden Rule:** Everything configurable by the tenant.

---

## F1. Parent Payment Portal

**Purpose:** Parents see invoices and pay directly via Stripe from their dashboard.

**No new tables** — uses existing Invoice, Payment, Stripe infrastructure.

**Behavior:**
- Parent portal > "Finances" tab per child (or household-level)
- Shows: outstanding invoices, payment history, total balance
- Each unpaid invoice has "Pay Now" button → creates Stripe checkout session using tenant's TenantStripeConfig keys → redirects to Stripe
- Webhook handles completion (existing flow)
- Parent can also view/download invoice PDFs and receipts
- If no Stripe configured for tenant → "Pay Now" hidden, show "Contact school for payment"

**UI:**
- Parent dashboard > new "Finances" tab
- Invoice list: number, description, amount, due date, status badge, Pay Now button
- Payment history: reference, date, amount, receipt download
- Outstanding balance card at top

**Permissions:** `parent.view_finances` (new), `parent.make_payments` (new)

---

## F2. Automated Payment Reminders

**Purpose:** Auto-send reminders before due date and after overdue.

**Data Model:**
- `invoice_reminders` — tenant_id, invoice_id, reminder_type ('due_soon' | 'overdue' | 'final_notice'), sent_at, channel ('email' | 'whatsapp' | 'in_app'), created_at
  - Index: idx_invoice_reminders_tenant_invoice on (tenant_id, invoice_id)

**Behavior:**
- Worker job runs daily:
  - Finds invoices due within X days (tenant configurable, default: 3) → sends "due_soon" reminder
  - Finds overdue invoices not yet reminded → sends "overdue" reminder
  - Finds invoices overdue > Y days (default: 14) → sends "final_notice"
- Deduplication: only one reminder per type per invoice
- Sends to household's primary billing parent via configured channel
- Content includes: invoice number, amount, due date, payment link (if Stripe enabled)

**Tenant Settings:**
- `paymentReminderEnabled` — boolean (default: true)
- `dueSoonReminderDays` — number (default: 3)
- `finalNoticeAfterDays` — number (default: 14)
- `reminderChannel` — 'email' | 'whatsapp' | 'both' (default: 'email')

**Worker Job:** `finance:send-reminders` — daily at 8:00 AM

---

## F3. Recurring Invoice Auto-Generation

**Purpose:** Automatically generate invoices for recurring fees based on billing frequency.

**Data Model:**
- `recurring_invoice_configs` — tenant_id, fee_structure_id, frequency ('monthly' | 'term'), next_generation_date (date), last_generated_at (timestamptz, nullable), active (boolean), created_at, updated_at
  - Unique on (tenant_id, fee_structure_id)
  - Index: idx_recurring_configs_tenant_active on (tenant_id, active)

**Behavior:**
- Admin enables auto-generation per fee structure
- Worker job runs daily: checks recurring configs where next_generation_date <= today
- For each: runs the fee generation flow (same as manual), creates draft invoices
- Updates next_generation_date based on frequency (monthly: +1 month, term: based on academic period dates)
- Admin gets notification: "X invoices auto-generated for [Fee Structure]"
- Invoices created as draft (admin can review before issuing) OR auto-issued (tenant configurable)

**Tenant Settings:**
- `autoIssueRecurringInvoices` — boolean (default: false). If true, auto-generated invoices go straight to 'issued'.

**Worker Job:** `finance:generate-recurring` — daily at 6:00 AM

---

## F4. Financial Reports

**Purpose:** Comprehensive financial reporting for school management.

**No new tables** — computed from existing data. Redis cache for expensive aggregations.

**Reports:**

a) **Aging Report** — outstanding invoices grouped by age:
   - Current (not yet due)
   - 1-30 days overdue
   - 31-60 days overdue
   - 61-90 days overdue
   - 90+ days overdue
   - Per-household breakdown within each bucket
   - Totals per bucket

b) **Revenue by Period** — income grouped by month/term:
   - Invoiced amount vs collected amount vs outstanding
   - Collection rate trend over time
   - Line chart (Recharts)

c) **Collection by Year Group** — fee collection grouped by year group:
   - Total billed, total collected, % collected per year group
   - Identifies which year groups have highest default rates

d) **Payment Method Breakdown** — payments grouped by method:
   - Stripe vs cash vs bank transfer vs card manual
   - Pie chart + table with amounts and percentages

e) **Fee Structure Performance** — per fee structure:
   - Total assigned households, total billed, total collected, default rate

**UI:**
- Finance > "Reports" page (new tab in finance layout)
- Tab per report type
- Date range filters on all reports
- Export to CSV/PDF

---

## F5. Credit Notes

**Purpose:** Issue credit against a household's account for future invoice offset.

**Data Model:**
- `credit_notes` — tenant_id, household_id, credit_note_number (varchar, unique per tenant), amount (decimal 12,2), remaining_balance (decimal 12,2), reason (text), issued_by_user_id, issued_at (timestamptz), created_at, updated_at
  - Sequence-numbered: CN-YYYYMM-XXXX
  - Index: idx_credit_notes_tenant_household on (tenant_id, household_id)
- `credit_note_applications` — tenant_id, credit_note_id, invoice_id, applied_amount (decimal 12,2), applied_at (timestamptz), applied_by_user_id, created_at
  - Tracks which invoices consumed the credit

**Behavior:**
- Admin creates credit note for a household (amount + reason)
- When allocating payments, system also shows available credits
- Credit can be applied to invoices (reduces balance like a payment)
- Remaining credit balance tracked (partial application allowed)
- Shows on household statement as credit entry

---

## F6. Late Fees

**Purpose:** Auto-apply penalty charges on overdue invoices.

**Data Model:**
- `late_fee_configs` — tenant_id, name (varchar), fee_type ('fixed' | 'percent'), value (decimal 12,2), grace_period_days (int), max_applications (int, default: 1), frequency_days (int, nullable — for recurring late fees), active (boolean), created_at, updated_at
  - Unique on (tenant_id, name)
- `late_fee_applications` — tenant_id, invoice_id, late_fee_config_id, amount (decimal 12,2), applied_at (timestamptz), created_at
  - Tracks each late fee application to prevent duplicates

**Behavior:**
- Tenant configures late fee rules (e.g., "$50 fixed after 7 days grace" or "2% per month")
- Worker job checks overdue invoices past grace period
- Applies late fee: creates new InvoiceLine on the invoice, updates totals
- If recurring: re-applies every frequency_days until paid (up to max_applications)
- Grace period: no late fee within X days of due date

**Tenant Settings:**
- `lateFeeEnabled` — boolean (default: false)
- `defaultLateFeeConfigId` — UUID (nullable) — which late fee config to use by default

**Worker Job:** Part of `finance:overdue-detection` — extended to apply late fees

---

## F7. Flexible Payment Plans

**Purpose:** Parents can request custom payment arrangements, admin approves.

**Data Model:**
- `payment_plan_requests` — tenant_id, invoice_id, household_id, requested_by_parent_id (uuid), proposed_installments_json (JSON array of {due_date, amount}), reason (text), status ('pending' | 'approved' | 'rejected' | 'counter_offered'), admin_notes (text, nullable), reviewed_by_user_id (nullable), reviewed_at (nullable), created_at, updated_at
  - Index: idx_payment_plan_requests_tenant on (tenant_id, status)

**Behavior:**
- Parent views an invoice in the parent portal → "Request Payment Plan" button
- Parent proposes installment split (e.g., "I'd like to pay in 3 monthly installments") with reason
- Admin gets notification, reviews request
- Admin can: approve (creates installments as proposed), reject (with reason), or counter-offer (modify dates/amounts, parent must accept)
- If approved: existing installments replaced, invoice remains issued

**UI:**
- Parent portal: "Request Payment Plan" on unpaid invoices
- Admin: Finance > "Payment Plan Requests" page showing pending requests
- Approve/reject/counter-offer actions

---

## F8. Bulk Operations

**Purpose:** Process multiple invoices at once.

**No new tables** — orchestrates existing endpoints.

**Operations:**
- **Bulk Issue** — select multiple draft invoices → issue all at once
- **Bulk Void** — select multiple invoices → void all (with confirmation)
- **Bulk Remind** — select overdue invoices → send reminders to all households
- **Bulk Export** — select invoices → download as combined PDF or CSV

**UI:**
- Invoices page: checkbox selection column
- Toolbar actions appear when items selected: "Issue Selected", "Void Selected", "Send Reminders", "Export Selected"
- Confirmation modal with count and impact summary
- Progress indicator for large batches

---

## F9. Scholarship/Bursary Management

**Purpose:** Formal scholarship tracking as enhanced discounts.

**Data Model:**
- `scholarships` — tenant_id, name (varchar 200), description (text, nullable), discount_type ('fixed' | 'percent'), value (decimal 12,2), student_id (uuid), awarded_by_user_id (uuid), award_date (date), renewal_date (date, nullable), status ('active' | 'expired' | 'revoked'), revocation_reason (text, nullable), fee_structure_id (uuid, nullable — which fee this applies to, null = all fees), created_at, updated_at
  - Index: idx_scholarships_tenant_student on (tenant_id, student_id)
  - Index: idx_scholarships_tenant_status on (tenant_id, status)

**Behavior:**
- Admin creates scholarship: name, type (fixed/percent), value, student, optional fee structure scope, award date, optional renewal date
- During fee generation: system checks active scholarships for each student, auto-applies as discount
- If renewal_date is set and past: worker job marks as 'expired', admin notified
- Admin can revoke with reason
- Shows on student profile under "Financial Aid" section
- Shows on household statement as scholarship credit

**Worker Job:** Part of `finance:overdue-detection` — extended to check scholarship expirations

---

## F10. Finance Audit Trail

**Purpose:** Finance-specific view of who changed what.

**No new tables** — reads from existing audit_logs table (AuditLogInterceptor already captures all mutations).

**Behavior:**
- Filtered view of audit logs for finance entities only: invoices, payments, refunds, fee structures, discounts, assignments
- Shows: timestamp, user, action (create/update/delete), entity type, entity ID, changes (diff)
- Searchable by entity reference (invoice number, payment reference)
- Date range filter
- Export to CSV

**UI:**
- Finance > "Audit Trail" page (new tab in finance layout)
- Table with filters
- Click row → expandable diff view showing old vs new values

---

## New Database Tables Summary

| Table | Purpose |
|---|---|
| `invoice_reminders` | Reminder deduplication tracking |
| `recurring_invoice_configs` | Auto-generation schedule per fee structure |
| `credit_notes` | Household credit balances |
| `credit_note_applications` | Credit-to-invoice application tracking |
| `late_fee_configs` | Late fee rule definitions |
| `late_fee_applications` | Late fee application tracking per invoice |
| `payment_plan_requests` | Parent payment plan requests |
| `scholarships` | Student scholarship/bursary records |

All tables tenant-scoped with RLS.

---

## New Permissions

| Permission | Description |
|---|---|
| `parent.view_finances` | Parent sees invoices and payment history |
| `parent.make_payments` | Parent can initiate Stripe payments |
| `finance.manage_credit_notes` | Create/apply credit notes |
| `finance.manage_scholarships` | Create/revoke scholarships |
| `finance.manage_late_fees` | Configure late fee rules |
| `finance.view_reports` | Access financial reports |
| `finance.bulk_operations` | Bulk issue/void/remind |

---

## New Tenant Settings

**finance section (in tenant_settings.settings):**
- `paymentReminderEnabled` — boolean (default: true)
- `dueSoonReminderDays` — number (default: 3)
- `finalNoticeAfterDays` — number (default: 14)
- `reminderChannel` — 'email' | 'whatsapp' | 'both' (default: 'email')
- `autoIssueRecurringInvoices` — boolean (default: false)
- `lateFeeEnabled` — boolean (default: false)
- `defaultLateFeeConfigId` — UUID (nullable)

---

## Implementation Order

1. **Foundation:** F5 (credit notes) + F6 (late fees) + F9 (scholarships) — new data model
2. **Automation:** F2 (reminders) + F3 (recurring generation) — worker jobs
3. **Parent:** F1 (payment portal) + F7 (payment plans) — parent-facing
4. **Operations:** F4 (reports) + F8 (bulk ops) + F10 (audit trail) — admin tools
