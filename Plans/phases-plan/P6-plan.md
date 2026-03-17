# P6 Implementation Plan — Finance Module

## Section 1 — Overview

Phase 6 delivers the full finance module: fee structures, discounts, household fee assignments, invoice lifecycle, installment plans, payment recording (Stripe + manual), FIFO auto-suggest allocation, receipts, refunds, write-offs, household statements, Stripe webhook processing, overdue detection, and the finance staff dashboard. After this phase, schools can bill households and track payments end-to-end.

**Dependencies on prior phases:**
- **Phase 1 (P0/P1):** `ApprovalRequestsService` (`checkAndCreateIfNeeded` method), `ApprovalWorkflow` model, `ApprovalActionType.invoice_issue` and `ApprovalActionType.payment_refund` enums, `SequenceService` (tenant_sequences), `TenantStripeConfig` (encrypted Stripe keys), `StripeConfigService` (key decryption), `TenantBranding` (invoice_prefix, receipt_prefix), `TenantSettingsFinance` (requireApprovalForInvoiceIssue, defaultPaymentTermDays, allowPartialPayment), permissions system, RLS middleware, `PdfRenderingService`
- **Phase 2:** `Household` model (with `primary_billing_parent_id`), `Student` model (with `household_id`, `year_group_id`), `Parent` model, `YearGroup` model, `HouseholdParent` junction
- **Phase 3:** `Application` model (for admissions-linked fee assignment context)

**Modules imported/extended:**
- `ApprovalsModule` — import `ApprovalRequestsService` for invoice issuance and refund approval
- `TenantsModule` — import `SequenceService` for invoice/receipt number generation
- `ConfigurationModule` — import `SettingsService` for finance settings, `StripeConfigService` for Stripe key access
- `PdfRenderingModule` — import `PdfRenderingService` for invoice/receipt/statement PDF rendering
- `HouseholdsModule` — import `HouseholdsService` for household validation and billing parent checks

---

## Section 2 — Database Changes

### 2.1 New Enums

#### `BillingFrequency`
```
one_off | term | monthly | custom
```

#### `DiscountType`
```
fixed | percent
```

#### `InvoiceStatus`
```
draft | pending_approval | issued | partially_paid | paid | overdue | void | cancelled | written_off
```

#### `InstallmentStatus`
```
pending | paid | overdue
```

#### `PaymentMethod`
```
stripe | cash | bank_transfer | card_manual
```

#### `PaymentStatus`
```
pending | posted | failed | voided | refunded_partial | refunded_full
```

#### `RefundStatus`
```
pending_approval | approved | executed | failed | rejected
```

### 2.2 New Tables

#### `fee_structures`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(150) | NOT NULL |
| year_group_id | UUID | NULL, FK → year_groups |
| amount | NUMERIC(12,2) | NOT NULL |
| billing_frequency | BillingFrequency | NOT NULL |
| active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now(), @updatedAt |

**Indexes:**
- `idx_fee_structures_tenant` ON (tenant_id)

**Unique constraints:**
- `UNIQUE (tenant_id, name)`

**RLS:** Standard tenant isolation policy
**set_updated_at() trigger:** Yes
**Seed data:** None

#### `discounts`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(150) | NOT NULL |
| discount_type | DiscountType | NOT NULL |
| value | NUMERIC(12,2) | NOT NULL |
| active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now(), @updatedAt |

**Indexes:** `idx_discounts_tenant` ON (tenant_id)
**Unique constraints:** `UNIQUE (tenant_id, name)`
**RLS:** Standard tenant isolation policy
**set_updated_at() trigger:** Yes

#### `household_fee_assignments`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| household_id | UUID | FK → households, NOT NULL |
| student_id | UUID | NULL, FK → students |
| fee_structure_id | UUID | FK → fee_structures, NOT NULL |
| discount_id | UUID | NULL, FK → discounts |
| effective_from | DATE | NOT NULL |
| effective_to | DATE | NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now(), @updatedAt |

**Indexes:**
- `idx_household_fees_tenant_household` ON (tenant_id, household_id)

**Unique constraints:**
- Partial unique index in post_migrate.sql: `CREATE UNIQUE INDEX idx_household_fee_assignments_active ON household_fee_assignments(tenant_id, household_id, student_id, fee_structure_id) WHERE effective_to IS NULL;` — prevents duplicate active assignments. Note: for rows where `student_id IS NULL`, PostgreSQL treats each NULL as distinct in unique indexes, so a separate partial index is needed: `CREATE UNIQUE INDEX idx_household_fee_assignments_active_no_student ON household_fee_assignments(tenant_id, household_id, fee_structure_id) WHERE effective_to IS NULL AND student_id IS NULL;`

**RLS:** Standard tenant isolation policy
**set_updated_at() trigger:** Yes

#### `invoices`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| household_id | UUID | FK → households, NOT NULL |
| invoice_number | VARCHAR(50) | NOT NULL |
| status | InvoiceStatus | NOT NULL DEFAULT 'draft' |
| issue_date | DATE | NULL |
| due_date | DATE | NOT NULL |
| subtotal_amount | NUMERIC(12,2) | NOT NULL |
| discount_amount | NUMERIC(12,2) | NOT NULL DEFAULT 0 |
| tax_amount | NUMERIC(12,2) | NOT NULL DEFAULT 0 |
| total_amount | NUMERIC(12,2) | NOT NULL |
| balance_amount | NUMERIC(12,2) | NOT NULL |
| currency_code | VARCHAR(10) | NOT NULL |
| write_off_amount | NUMERIC(12,2) | NULL |
| write_off_reason | TEXT | NULL |
| last_overdue_notified_at | TIMESTAMPTZ | NULL |
| approval_request_id | UUID | NULL, FK → approval_requests |
| created_by_user_id | UUID | FK → users, NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now(), @updatedAt |

**Indexes:**
- `idx_invoices_tenant_household` ON (tenant_id, household_id)
- `idx_invoices_tenant_status` ON (tenant_id, status)

**Unique constraints:**
- `UNIQUE (tenant_id, invoice_number)` — named `idx_invoices_number`

**RLS:** Standard tenant isolation policy
**set_updated_at() trigger:** Yes

**Invoice number generation:** `{branding.invoice_prefix}-{YYYYMM}-{padded_sequence}` using `SequenceService.nextNumber(tenantId, 'invoice', tx, prefix)`. The branding prefix is fetched from `tenant_branding.invoice_prefix` (defaults to "INV").

#### `invoice_lines`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| invoice_id | UUID | FK → invoices, NOT NULL |
| description | VARCHAR(255) | NOT NULL |
| quantity | NUMERIC(10,2) | NOT NULL DEFAULT 1 |
| unit_amount | NUMERIC(12,2) | NOT NULL |
| line_total | NUMERIC(12,2) | NOT NULL |
| student_id | UUID | NULL, FK → students |
| fee_structure_id | UUID | NULL, FK → fee_structures |
| billing_period_start | DATE | NULL |
| billing_period_end | DATE | NULL |

**No `created_at` / `updated_at`** — child records created with their parent invoice, following the same pattern as `ClassStaff`.

**Indexes:**
- `idx_invoice_lines_invoice` ON (invoice_id)

**Constraints (post_migrate.sql):**
- `ALTER TABLE invoice_lines ADD CONSTRAINT chk_invoice_lines_total CHECK (line_total = quantity * unit_amount);`

**RLS:** Standard tenant isolation policy
**set_updated_at() trigger:** No

**Note on billing_period_start/billing_period_end:** These nullable columns are required for the fee generation duplicate detection key `(household_id, fee_structure_id, billing_period_start, billing_period_end)`. Only set for lines generated by the fee generation wizard; NULL for manually created lines.

#### `installments`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| invoice_id | UUID | FK → invoices, NOT NULL |
| due_date | DATE | NOT NULL |
| amount | NUMERIC(12,2) | NOT NULL |
| status | InstallmentStatus | NOT NULL DEFAULT 'pending' |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now(), @updatedAt |

**Indexes:**
- `idx_installments_invoice` ON (invoice_id)

**RLS:** Standard tenant isolation policy
**set_updated_at() trigger:** Yes

#### `payments`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| household_id | UUID | FK → households, NOT NULL |
| payment_reference | VARCHAR(100) | NOT NULL |
| payment_method | PaymentMethod | NOT NULL |
| external_provider | VARCHAR(50) | NULL |
| external_event_id | VARCHAR(255) | NULL |
| amount | NUMERIC(12,2) | NOT NULL |
| currency_code | VARCHAR(10) | NOT NULL |
| status | PaymentStatus | NOT NULL DEFAULT 'pending' |
| received_at | TIMESTAMPTZ | NOT NULL |
| posted_by_user_id | UUID | NULL, FK → users |
| reason | TEXT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now(), @updatedAt |

**Indexes:**
- `idx_payments_tenant_household` ON (tenant_id, household_id)

**Unique constraints:**
- `UNIQUE (external_event_id) WHERE external_event_id IS NOT NULL` — partial unique, named `idx_payments_external_event`. Goes in post_migrate.sql.

**RLS:** Standard tenant isolation policy
**set_updated_at() trigger:** Yes

#### `payment_allocations`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| payment_id | UUID | FK → payments, NOT NULL |
| invoice_id | UUID | FK → invoices, NOT NULL |
| allocated_amount | NUMERIC(12,2) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**No `updated_at`** — per spec, listed in context.md as intentionally without `updated_at`. Rows can be deleted (full reversal) or have `allocated_amount` reduced (partial reversal) during refund LIFO processing.

**Indexes:**
- `idx_payment_allocations_payment` ON (payment_id)
- `idx_payment_allocations_invoice` ON (invoice_id)

**RLS:** Standard tenant isolation policy
**set_updated_at() trigger:** No

#### `receipts`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| payment_id | UUID | UNIQUE FK → payments |
| receipt_number | VARCHAR(50) | NOT NULL, immutable |
| template_locale | VARCHAR(10) | NOT NULL |
| issued_at | TIMESTAMPTZ | NOT NULL |
| issued_by_user_id | UUID | NULL, FK → users |
| render_version | VARCHAR(50) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**No `updated_at`** — per spec, listed in context.md as intentionally without `updated_at` (immutable).

**Unique constraints:**
- `UNIQUE (tenant_id, receipt_number)` — named `idx_receipts_number`

**RLS:** Standard tenant isolation policy
**set_updated_at() trigger:** No

**Receipt number generation:** `{branding.receipt_prefix}-{YYYYMM}-{padded_sequence}` using `SequenceService.nextNumber(tenantId, 'receipt', tx, prefix)`.

#### `refunds`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| payment_id | UUID | FK → payments, NOT NULL |
| refund_reference | VARCHAR(100) | NOT NULL |
| amount | NUMERIC(12,2) | NOT NULL |
| status | RefundStatus | NOT NULL DEFAULT 'pending_approval' |
| reason | TEXT | NOT NULL |
| requested_by_user_id | UUID | FK → users, NOT NULL |
| approved_by_user_id | UUID | NULL, FK → users |
| failure_reason | TEXT | NULL |
| executed_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now(), @updatedAt |

**Indexes:**
- `idx_refunds_payment` ON (payment_id)

**RLS:** Standard tenant isolation policy
**set_updated_at() trigger:** Yes

**Status transitions:**
- `pending_approval → approved` (approver approves)
- `pending_approval → rejected` (approver rejects)
- `approved → executed` (refund processed successfully)
- `approved → failed` (Stripe error or execution failure)
- `failed → approved` (admin retries — resets for re-execution)

**Constraint (service-enforced):** `SUM(refunds.amount WHERE status IN ('approved','executed')) for a payment <= payment.amount`

### 2.3 Relation Updates on Existing Models

**Tenant model** — add relations:
```prisma
// P6 Relations
fee_structures             FeeStructure[]
discounts                  Discount[]
household_fee_assignments  HouseholdFeeAssignment[]
invoices                   Invoice[]
invoice_lines              InvoiceLine[]
installments               Installment[]
payments                   Payment[]
payment_allocations        PaymentAllocation[]
receipts                   Receipt[]
refunds                    Refund[]
```

**Household model** — add relations:
```prisma
// P6 Relations
fee_assignments  HouseholdFeeAssignment[]
invoices         Invoice[]
payments         Payment[]
```

**Student model** — add relations:
```prisma
// P6 Relations
fee_assignments  HouseholdFeeAssignment[]
invoice_lines    InvoiceLine[]
```

**User model** — add relations:
```prisma
// P6 Relations
invoices_created     Invoice[]       @relation("invoice_creator")
payments_posted      Payment[]       @relation("payment_poster")
receipts_issued      Receipt[]       @relation("receipt_issuer")
refunds_requested    Refund[]        @relation("refund_requester")
refunds_approved     Refund[]        @relation("refund_approver")
```

**YearGroup model** — add relation:
```prisma
// P6 Relations
fee_structures  FeeStructure[]
```

**FeeStructure model** — add relations:
```prisma
// Relations
tenant                    Tenant                   @relation(...)
year_group                YearGroup?               @relation(...)
household_fee_assignments HouseholdFeeAssignment[]
invoice_lines             InvoiceLine[]
```

**ApprovalRequest model** — add back-relation:
```prisma
// P6 Relations
invoices  Invoice[]
```

---

## Section 3 — API Endpoints

All endpoints namespaced under `/api/v1/finance/` unless noted. All require `AuthGuard` + `PermissionGuard` + `@ModuleEnabled('finance')` unless noted.

### 3.1 Fee Structures

#### `GET /api/v1/finance/fee-structures`
- **Permission:** `finance.view`
- **Query schema:** `{ page, pageSize, active?: boolean, year_group_id?: uuid, search?: string }`
- **Response:** `{ data: FeeStructure[], meta: { page, pageSize, total } }`
- **Logic:** List fee structures filtered by query params, ordered by name ASC

#### `GET /api/v1/finance/fee-structures/:id`
- **Permission:** `finance.view`
- **Response:** `{ data: FeeStructure }` with year_group included
- **Error:** `ENTITY_NOT_FOUND` (404) if not found

#### `POST /api/v1/finance/fee-structures`
- **Permission:** `finance.manage`
- **Request schema:** `{ name: string(1-150), year_group_id?: uuid, amount: number(>0, 2dp), billing_frequency: BillingFrequency }`
- **Response:** `{ data: FeeStructure }` (201)
- **Logic:** Create fee structure. Validate year_group_id exists if provided. Check unique (tenant_id, name).
- **Errors:** `DUPLICATE_NAME` (409), `YEAR_GROUP_NOT_FOUND` (404)

#### `PATCH /api/v1/finance/fee-structures/:id`
- **Permission:** `finance.manage`
- **Request schema:** All fields optional: `{ name?, year_group_id?, amount?, billing_frequency?, active? }`
- **Response:** `{ data: FeeStructure }`
- **Logic:** Update fee structure. Validate unique name if changed.
- **Errors:** `ENTITY_NOT_FOUND` (404), `DUPLICATE_NAME` (409)

#### `DELETE /api/v1/finance/fee-structures/:id`
- **Permission:** `finance.manage`
- **Response:** 204 No Content
- **Logic:** Soft-delete by setting `active = false`. If active fee assignments reference this structure, return error.
- **Errors:** `ENTITY_NOT_FOUND` (404), `FEE_STRUCTURE_IN_USE` (409)

### 3.2 Discounts

#### `GET /api/v1/finance/discounts`
- **Permission:** `finance.view`
- **Query schema:** `{ page, pageSize, active?: boolean, search?: string }`
- **Response:** `{ data: Discount[], meta }`

#### `GET /api/v1/finance/discounts/:id`
- **Permission:** `finance.view`
- **Response:** `{ data: Discount }`

#### `POST /api/v1/finance/discounts`
- **Permission:** `finance.manage`
- **Request schema:** `{ name: string(1-150), discount_type: DiscountType, value: number(>0, 2dp) }`
- **Validation:** If `discount_type === 'percent'`, value must be <= 100
- **Response:** `{ data: Discount }` (201)
- **Errors:** `DUPLICATE_NAME` (409), `INVALID_PERCENT_VALUE` (400)

#### `PATCH /api/v1/finance/discounts/:id`
- **Permission:** `finance.manage`
- **Request schema:** All fields optional
- **Response:** `{ data: Discount }`

#### `DELETE /api/v1/finance/discounts/:id`
- **Permission:** `finance.manage`
- **Logic:** Soft-delete via `active = false`. Block if active fee assignments reference it.
- **Errors:** `DISCOUNT_IN_USE` (409)

### 3.3 Fee Assignments

#### `GET /api/v1/finance/fee-assignments`
- **Permission:** `finance.view`
- **Query schema:** `{ page, pageSize, household_id?: uuid, student_id?: uuid, fee_structure_id?: uuid, active_only?: boolean }`
- **Response:** `{ data: HouseholdFeeAssignment[], meta }` — includes fee_structure, discount, household, student relations
- **Logic:** If `active_only=true`, filter WHERE `effective_to IS NULL`

#### `POST /api/v1/finance/fee-assignments`
- **Permission:** `finance.manage`
- **Request schema:** `{ household_id: uuid, student_id?: uuid, fee_structure_id: uuid, discount_id?: uuid, effective_from: date }`
- **Response:** `{ data: HouseholdFeeAssignment }` (201)
- **Logic:**
  1. Validate household exists and is active
  2. Validate student belongs to household if provided
  3. Validate fee_structure exists and is active
  4. Validate discount exists and is active if provided
  5. Check no active duplicate assignment exists (same household/student/fee_structure with effective_to IS NULL)
- **Errors:** `HOUSEHOLD_NOT_FOUND`, `STUDENT_NOT_IN_HOUSEHOLD`, `FEE_STRUCTURE_NOT_FOUND`, `DISCOUNT_NOT_FOUND`, `DUPLICATE_ACTIVE_ASSIGNMENT` (409)

#### `PATCH /api/v1/finance/fee-assignments/:id`
- **Permission:** `finance.manage`
- **Request schema:** `{ discount_id?: uuid | null, effective_to?: date }`
- **Response:** `{ data: HouseholdFeeAssignment }`
- **Logic:** Can change discount or end the assignment. Cannot change household/student/fee_structure.

#### `DELETE /api/v1/finance/fee-assignments/:id`
- **Permission:** `finance.manage`
- **Logic:** Sets `effective_to = today`. Does not hard-delete.
- **Response:** 204

### 3.4 Fee Generation

#### `POST /api/v1/finance/fee-generation/preview`
- **Permission:** `finance.manage`
- **Request schema:**
```typescript
{
  year_group_ids: uuid[],           // at least 1
  fee_structure_ids: uuid[],        // at least 1
  billing_period_start: date,
  billing_period_end: date,
  due_date: date,
}
```
- **Response:**
```typescript
{
  data: {
    preview_lines: Array<{
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
      is_duplicate: boolean;       // true if already invoiced
      missing_billing_parent: boolean;
    }>;
    summary: {
      total_households: number;
      total_lines: number;
      total_amount: number;
      duplicates_excluded: number;
      missing_billing_parent_count: number;
    };
  }
}
```
- **Logic:**
  1. Find all active fee assignments matching the selected fee_structure_ids
  2. Filter to households with students in the selected year_group_ids
  3. Apply discounts: fixed reduces line amount, percent applied to base fee, floor at 0
  4. Check duplicate detection key: `(household_id, fee_structure_id, billing_period_start, billing_period_end)` against existing invoice_lines joined to invoices WHERE status NOT IN ('void', 'cancelled')
  5. Flag households without `primary_billing_parent_id`
  6. Return preview with all calculations and flags

#### `POST /api/v1/finance/fee-generation/confirm`
- **Permission:** `finance.manage`
- **Request schema:**
```typescript
{
  year_group_ids: uuid[],
  fee_structure_ids: uuid[],
  billing_period_start: date,
  billing_period_end: date,
  due_date: date,
  excluded_household_ids: uuid[],  // households to skip
}
```
- **Response:** `{ data: { invoices_created: number, total_amount: number } }`
- **Logic:**
  1. Re-run the preview calculation (no stale data)
  2. Exclude households in `excluded_household_ids`
  3. Block households without billing parent (error, don't silently skip)
  4. Skip duplicates silently
  5. Group lines by household → create one draft invoice per household
  6. For each invoice:
     a. Generate invoice_number via SequenceService with branding prefix
     b. Set `currency_code` from `tenants.currency_code`
     c. Calculate subtotal, discount_amount, total_amount, balance_amount
     d. Create invoice_lines with billing_period_start/end set
  7. All within a single interactive transaction
- **Errors:** `MISSING_BILLING_PARENT` (400, lists affected household IDs), `NO_ELIGIBLE_LINES` (400)

### 3.5 Invoices

#### `GET /api/v1/finance/invoices`
- **Permission:** `finance.view` (admin/staff), `parent.view_invoices` (parent — scoped to own household)
- **Query schema:** `{ page, pageSize, status?: InvoiceStatus | InvoiceStatus[], household_id?: uuid, date_from?: date, date_to?: date, search?: string, sort?: string, order?: 'asc'|'desc' }`
- **Response:** `{ data: Invoice[], meta }` — includes household name, line count, payment summary
- **Logic:** Parents see only invoices for their linked household(s) with status IN ('issued', 'partially_paid', 'paid', 'overdue', 'written_off'). Draft/pending/void/cancelled hidden from parents.

#### `GET /api/v1/finance/invoices/:id`
- **Permission:** `finance.view` or `parent.view_invoices` (parent scoped to own household)
- **Response:** `{ data: Invoice }` — includes: invoice_lines (with student and fee_structure), installments, payment_allocations (with payment details), approval_request (if any), household
- **Logic:** Full record hub data. Parents see issued+ invoices only.
- **Error:** `ENTITY_NOT_FOUND` (404)

#### `POST /api/v1/finance/invoices`
- **Permission:** `finance.manage`
- **Request schema:**
```typescript
{
  household_id: uuid,
  due_date: date,
  lines: Array<{
    description: string(1-255),
    quantity: number(>0, 2dp),
    unit_amount: number(>0, 2dp),
    student_id?: uuid,
    fee_structure_id?: uuid,
  }>,
}
```
- **Response:** `{ data: Invoice }` (201)
- **Logic:** Create a manual draft invoice. Generate invoice_number. Calculate totals. Set `balance_amount = total_amount`. Set `currency_code` from tenant. `billing_period_start/end` on lines are NULL for manual invoices.
- **Errors:** `HOUSEHOLD_NOT_FOUND`, `STUDENT_NOT_IN_HOUSEHOLD`

#### `PATCH /api/v1/finance/invoices/:id`
- **Permission:** `finance.manage`
- **Request schema:** `{ due_date?, lines?: Array<line> }` — full line replacement (delete existing, create new)
- **Precondition:** Invoice must be in `draft` status
- **Logic:** Recalculate totals. Requires `expected_updated_at` for optimistic concurrency.
- **Errors:** `INVOICE_NOT_DRAFT` (409), `CONCURRENT_MODIFICATION` (409)

#### `POST /api/v1/finance/invoices/:id/issue`
- **Permission:** `finance.manage`
- **Logic:**
  1. Invoice must be in `draft` status
  2. Check `tenant_settings.finance.requireApprovalForInvoiceIssue`
  3. If approval required → call `approvalRequestsService.checkAndCreateIfNeeded(tenantId, 'invoice_issue', 'invoice', invoiceId, userId, hasDirectAuthority)`
  4. If `{ approved: true }` → set status to `issued`, set `issue_date = today`
  5. If `{ approved: false, request_id }` → set status to `pending_approval`, save `approval_request_id`
  6. If no approval required → directly issue
- **Response:** `{ data: Invoice }`
- **Errors:** `INVOICE_NOT_DRAFT` (409), `INVOICE_EMPTY_LINES` (400)

#### `POST /api/v1/finance/invoices/:id/void`
- **Permission:** `finance.manage`
- **Logic:** Only when `balance_amount == total_amount` (no payments applied). Set status to `void`.
- **Errors:** `INVOICE_HAS_PAYMENTS` (409), `INVALID_STATUS_TRANSITION` (409)

#### `POST /api/v1/finance/invoices/:id/cancel`
- **Permission:** `finance.manage`
- **Logic:** Only from `draft` or `pending_approval`. Set status to `cancelled`. If pending_approval, cancel the linked approval request.
- **Errors:** `INVALID_STATUS_TRANSITION` (409)

#### `POST /api/v1/finance/invoices/:id/write-off`
- **Permission:** `finance.manage`
- **Request schema:** `{ write_off_reason: string(1-1000) }`
- **Logic:**
  1. Invoice must be `issued`, `partially_paid`, or `overdue`
  2. Set `write_off_amount = balance_amount`, `write_off_reason`, `balance_amount = 0`, status to `written_off`
  3. Audit-logged via interceptor
- **Errors:** `INVALID_STATUS_TRANSITION` (409)

#### `GET /api/v1/finance/invoices/:id/preview`
- **Permission:** `finance.view`
- **Response:** Lightweight preview data for hover card: invoice_number, status, household_name, total_amount, balance_amount, due_date
- **Cache:** 30s Redis cache

#### `GET /api/v1/finance/invoices/:id/pdf`
- **Permission:** `finance.view` or `parent.view_invoices`
- **Query:** `{ locale?: 'en'|'ar' }` — defaults to user's preferred locale
- **Response:** PDF byte stream (content-type: application/pdf)
- **Logic:** Render invoice template with PdfRenderingService. Pass: invoice data, lines, household info, branding, locale.
- **Errors:** `TEMPLATE_NOT_FOUND` (500), `RENDER_FAILED` (500)

### 3.6 Installments

#### `GET /api/v1/finance/invoices/:id/installments`
- **Permission:** `finance.view`
- **Response:** `{ data: Installment[] }`

#### `POST /api/v1/finance/invoices/:id/installments`
- **Permission:** `finance.manage`
- **Request schema:** `{ installments: Array<{ due_date: date, amount: number(>0, 2dp) }> }`
- **Validation:** `SUM(amounts) must equal invoice.total_amount`. Error: `INSTALLMENT_SUM_MISMATCH` (400)
- **Logic:** Replace all existing installments (delete old, create new). Invoice must be in `draft` or `issued` status.
- **Response:** `{ data: Installment[] }` (201)

#### `DELETE /api/v1/finance/invoices/:id/installments`
- **Permission:** `finance.manage`
- **Logic:** Remove all installments for this invoice. Only allowed if all installments are `pending`.
- **Response:** 204

### 3.7 Payments

#### `GET /api/v1/finance/payments`
- **Permission:** `finance.view`
- **Query schema:** `{ page, pageSize, household_id?: uuid, status?: PaymentStatus, payment_method?: PaymentMethod, date_from?: date, date_to?: date, search?: string }`
- **Response:** `{ data: Payment[], meta }` — includes household name, allocation summary (allocated vs unallocated)

#### `GET /api/v1/finance/payments/:id`
- **Permission:** `finance.view`
- **Response:** `{ data: Payment }` — includes allocations (with invoice details), receipt, refunds

#### `POST /api/v1/finance/payments`
- **Permission:** `finance.process_payments`
- **Request schema:**
```typescript
{
  household_id: uuid,
  payment_method: 'cash' | 'bank_transfer' | 'card_manual',
  payment_reference: string(1-100),
  amount: number(>0, 2dp),
  received_at: datetime,
  reason?: string,
}
```
- **Response:** `{ data: Payment }` (201)
- **Logic:**
  1. Validate household exists
  2. Create payment with status `posted`, `currency_code` from tenant
  3. Set `posted_by_user_id` to current user
  4. Do NOT auto-allocate yet — allocation is a separate step
- **Errors:** `HOUSEHOLD_NOT_FOUND`

#### `POST /api/v1/finance/payments/:id/allocations/suggest`
- **Permission:** `finance.process_payments`
- **Response:**
```typescript
{
  data: {
    suggestions: Array<{
      invoice_id: string;
      invoice_number: string;
      invoice_due_date: date;
      invoice_balance: number;
      suggested_amount: number;
    }>;
    payment_amount: number;
    total_suggested: number;
    unallocated_remainder: number;
  }
}
```
- **Logic:** FIFO allocation — sort household's unpaid invoices (status IN ('issued', 'partially_paid', 'overdue')) by `due_date ASC`, then `created_at ASC`. Allocate payment amount across invoices until exhausted or all invoices satisfied.
- **Precondition:** Payment must be `posted`, must have no existing allocations
- **Errors:** `PAYMENT_NOT_POSTED` (409), `ALREADY_ALLOCATED` (409)

#### `POST /api/v1/finance/payments/:id/allocations`
- **Permission:** `finance.process_payments`
- **Request schema:**
```typescript
{
  allocations: Array<{
    invoice_id: uuid,
    amount: number(>0, 2dp),
  }>
}
```
- **Response:** `{ data: PaymentAllocation[] }` (201)
- **Logic:**
  1. Validate payment is `posted` and belongs to the same household as each invoice
  2. `SUM(allocations.amount)` must not exceed `payment.amount`
  3. Each `allocation.amount` must not exceed the invoice's `balance_amount`
  4. Cross-household allocation blocked: `ALLOCATION_HOUSEHOLD_MISMATCH`
  5. Create `payment_allocation` records
  6. For each allocated invoice: reduce `balance_amount`, re-derive status via `deriveInvoiceStatus()`
  7. If any amount remains unallocated, flag for admin (no error — payment is still valid)
  8. Auto-generate receipt for the payment
  9. All within a single interactive transaction
- **Errors:** `OVER_ALLOCATION` (400), `EXCEEDS_INVOICE_BALANCE` (400), `ALLOCATION_HOUSEHOLD_MISMATCH` (400), `PAYMENT_NOT_POSTED` (409)

#### `GET /api/v1/finance/payments/:id/receipt`
- **Permission:** `finance.view`
- **Response:** `{ data: Receipt }` — receipt metadata

#### `GET /api/v1/finance/payments/:id/receipt/pdf`
- **Permission:** `finance.view` or `parent.view_invoices`
- **Query:** `{ locale?: 'en'|'ar' }`
- **Response:** PDF byte stream
- **Logic:** Render receipt template. Pass: receipt data, payment details, allocations, household, branding.

### 3.8 Stripe Integration

#### `POST /api/v1/finance/invoices/:id/checkout-session`
- **Permission:** `parent.make_payments` or `finance.process_payments`
- **Request schema:** `{ success_url: string, cancel_url: string }`
- **Response:** `{ data: { checkout_url: string } }`
- **Logic:**
  1. Invoice must be `issued`, `partially_paid`, or `overdue`
  2. Decrypt tenant's Stripe secret key via `StripeConfigService`
  3. Create Stripe Checkout Session with `payment_intent_data` containing invoice metadata
  4. Create a `pending` payment record with `external_provider = 'stripe'`
  5. Return the checkout URL for frontend redirect
- **Errors:** `STRIPE_NOT_CONFIGURED` (400), `INVOICE_NOT_PAYABLE` (409)

#### `POST /api/v1/stripe/webhook`
- **No auth guard** — uses Stripe signature verification instead
- **Logic:**
  1. Verify webhook signature using tenant's decrypted webhook secret
  2. Determine tenant from event metadata
  3. Acquire advisory lock: `pg_advisory_xact_lock(hashtext('stripe:' || external_event_id))`
  4. Check idempotency: if `external_event_id` already exists in payments, skip
  5. Handle event types:
     - `checkout.session.completed`: Update pending payment to `posted`, auto-suggest FIFO allocation, generate receipt
     - `payment_intent.payment_failed`: Update pending payment to `failed`
     - `charge.refunded`: Update refund status if applicable
  6. All within interactive transaction
- **Errors:** `INVALID_SIGNATURE` (400), `TENANT_NOT_FOUND` (400)

### 3.9 Refunds

#### `GET /api/v1/finance/refunds`
- **Permission:** `finance.view`
- **Query schema:** `{ page, pageSize, status?: RefundStatus, payment_id?: uuid }`
- **Response:** `{ data: Refund[], meta }` — includes payment reference, household name

#### `POST /api/v1/finance/refunds`
- **Permission:** `finance.issue_refunds`
- **Request schema:** `{ payment_id: uuid, amount: number(>0, 2dp), reason: string(1-1000) }`
- **Logic:**
  1. Validate payment exists and is `posted`
  2. Validate `amount <= payment.amount - SUM(existing approved/executed refunds)`
  3. Check refund guards:
     - If any allocated invoices are `void` → block (REFUND_BLOCKED_VOID_INVOICE)
     - If any allocated invoices are `written_off` → block UNLESS user has `finance.override_refund_guard` (in which case reason is mandatory — already required)
  4. Check approval workflow for `payment_refund`:
     - Call `approvalRequestsService.checkAndCreateIfNeeded(tenantId, 'payment_refund', 'refund', refundId, userId, hasDirectAuthority)`
     - If approved → status = `approved`
     - If not → status = `pending_approval`
  5. Create refund record
- **Response:** `{ data: Refund }` (201)
- **Errors:** `PAYMENT_NOT_FOUND`, `REFUND_EXCEEDS_PAYMENT`, `REFUND_BLOCKED_VOID_INVOICE`, `REFUND_BLOCKED_WRITTEN_OFF`

#### `POST /api/v1/finance/refunds/:id/approve`
- **Permission:** `approvals.manage`
- **Request schema:** `{ comment?: string }`
- **Logic:** Transition from `pending_approval` to `approved`. Update linked approval request.
- **Errors:** `INVALID_STATUS_TRANSITION`, `SELF_APPROVAL_BLOCKED`

#### `POST /api/v1/finance/refunds/:id/reject`
- **Permission:** `approvals.manage`
- **Request schema:** `{ comment: string(1-1000) }`
- **Logic:** Transition from `pending_approval` to `rejected`. Update linked approval request.

#### `POST /api/v1/finance/refunds/:id/execute`
- **Permission:** `finance.issue_refunds`
- **Logic:**
  1. Refund must be in `approved` status
  2. If original payment was Stripe: process refund via Stripe API
  3. If manual: mark as executed directly
  4. LIFO allocation reversal:
     a. Get payment's allocations sorted by `created_at DESC`
     b. Deduct from unallocated remainder first (if any)
     c. For each allocation in LIFO order:
        - If refund amount remaining >= allocation.allocated_amount → delete allocation row, add to remaining
        - If refund amount remaining < allocation.allocated_amount → reduce allocated_amount by remaining
     d. For each affected invoice: recompute `balance_amount` and re-derive status
  5. Update payment status: if fully refunded → `refunded_full`, else → `refunded_partial`
  6. Set `refund.executed_at = now()`, status = `executed`
  7. All within interactive transaction
- **Errors:** `REFUND_NOT_APPROVED`, `STRIPE_REFUND_FAILED` (sets status to `failed`, stores failure_reason)

### 3.10 Household Statements

#### `GET /api/v1/finance/household-statements/:householdId`
- **Permission:** `finance.view` or `parent.view_invoices` (parent scoped to own household)
- **Query:** `{ date_from?: date, date_to?: date }`
- **Response:**
```typescript
{
  data: {
    household: { id, household_name, billing_parent_name };
    entries: Array<{
      date: date;
      type: 'invoice_issued' | 'payment_received' | 'allocation' | 'refund' | 'write_off';
      reference: string;           // invoice_number or payment_reference
      description: string;
      debit: number | null;        // invoices (charges)
      credit: number | null;       // payments, refunds
      running_balance: number;
    }>;
    opening_balance: number;
    closing_balance: number;
    currency_code: string;
  }
}
```
- **Logic:**
  1. Gather all invoices (not void/cancelled), payments (posted), allocations, refunds (executed), write-offs for the household
  2. Sort chronologically
  3. Compute running balance: invoices add to balance (debit), payments/refunds reduce (credit), write-offs reduce (credit)
  4. Compute opening balance from before date_from (if filtered)

#### `GET /api/v1/finance/household-statements/:householdId/pdf`
- **Permission:** `finance.view` or `parent.view_invoices`
- **Query:** `{ locale?: 'en'|'ar', date_from?: date, date_to?: date }`
- **Response:** PDF byte stream

### 3.11 Finance Dashboard

#### `GET /api/v1/finance/dashboard`
- **Permission:** `finance.view`
- **Response:**
```typescript
{
  data: {
    overdue_summary: {
      total_overdue_amount: number;
      overdue_count: number;
      ageing: {
        days_1_30: { count: number; amount: number };
        days_31_60: { count: number; amount: number };
        days_61_90: { count: number; amount: number };
        days_90_plus: { count: number; amount: number };
      };
    };
    invoice_pipeline: {
      draft: { count: number; amount: number };
      pending_approval: { count: number; amount: number };
      issued: { count: number; amount: number };
      overdue: { count: number; amount: number };
      paid: { count: number; amount: number };
    };
    unallocated_payments: {
      count: number;
      total_amount: number;
    };
    pending_refund_approvals: number;
    recent_payments: Array<{
      id: string;
      payment_reference: string;
      amount: number;
      household_name: string;
      received_at: datetime;
      status: PaymentStatus;
    }>;    // last 10
    revenue_summary: {
      current_month_collected: number;
      previous_month_collected: number;
      current_month_invoiced: number;
    };
  }
}
```
- **Logic:** Aggregate queries across invoices, payments, refunds for the tenant. Use COUNT/SUM with appropriate WHERE clauses.

---

## Section 4 — Service Layer

### 4.1 FeeStructuresService

**File:** `apps/api/src/modules/finance/fee-structures.service.ts`
**Dependencies:** PrismaService

| Method | Signature | Responsibility |
|--------|-----------|---------------|
| `findAll` | `(tenantId, filters) → Paginated<FeeStructure>` | List with pagination, filtering |
| `findOne` | `(tenantId, id) → FeeStructure` | Get by ID, include year_group |
| `create` | `(tenantId, dto) → FeeStructure` | Validate unique name, validate year_group, create |
| `update` | `(tenantId, id, dto) → FeeStructure` | Validate unique name if changed, update |
| `deactivate` | `(tenantId, id) → void` | Set active=false, check no active assignments |

### 4.2 DiscountsService

**File:** `apps/api/src/modules/finance/discounts.service.ts`
**Dependencies:** PrismaService

| Method | Signature | Responsibility |
|--------|-----------|---------------|
| `findAll` | `(tenantId, filters) → Paginated<Discount>` | List with pagination |
| `findOne` | `(tenantId, id) → Discount` | Get by ID |
| `create` | `(tenantId, dto) → Discount` | Validate unique name, validate percent ≤ 100, create |
| `update` | `(tenantId, id, dto) → Discount` | Update with validation |
| `deactivate` | `(tenantId, id) → void` | Set active=false |

### 4.3 FeeAssignmentsService

**File:** `apps/api/src/modules/finance/fee-assignments.service.ts`
**Dependencies:** PrismaService

| Method | Signature | Responsibility |
|--------|-----------|---------------|
| `findAll` | `(tenantId, filters) → Paginated<HouseholdFeeAssignment>` | List with relations |
| `create` | `(tenantId, dto) → HouseholdFeeAssignment` | Validate entities, check duplicates, create |
| `update` | `(tenantId, id, dto) → HouseholdFeeAssignment` | Change discount or end assignment |
| `endAssignment` | `(tenantId, id) → void` | Set effective_to = today |

### 4.4 InvoicesService

**File:** `apps/api/src/modules/finance/invoices.service.ts`
**Dependencies:** PrismaService, SequenceService, ApprovalRequestsService, SettingsService

| Method | Signature | Responsibility |
|--------|-----------|---------------|
| `findAll` | `(tenantId, filters, isParent?, parentHouseholdIds?) → Paginated<Invoice>` | List with filters, parent scoping |
| `findOne` | `(tenantId, id) → Invoice` | Full hub data with lines, allocations, installments, refunds |
| `create` | `(tenantId, userId, dto) → Invoice` | Create manual draft invoice, generate number |
| `update` | `(tenantId, id, dto, expectedUpdatedAt) → Invoice` | Edit draft: replace lines, recalculate totals |
| `issue` | `(tenantId, id, userId) → Invoice` | Issue flow: check approval, transition status |
| `voidInvoice` | `(tenantId, id) → Invoice` | Void if no payments applied |
| `cancel` | `(tenantId, id) → Invoice` | Cancel draft/pending_approval, cancel linked approval |
| `writeOff` | `(tenantId, id, reason) → Invoice` | Write off balance, zero it, set status |
| `getPreview` | `(tenantId, id) → InvoicePreview` | Lightweight hover card data, 30s Redis cache |
| `onApprovalCompleted` | `(tenantId, invoiceId, approved) → void` | Called by approval system: if approved → set issued; if rejected → set back to draft |
| `deriveInvoiceStatus` | `(invoice) → InvoiceStatus` | Pure function: given balance, due_date, payments → derive status |
| `recalculateBalance` | `(tenantId, invoiceId, tx) → void` | Recompute balance_amount from allocations, re-derive status |

**`deriveInvoiceStatus()` logic:**
```
if (balance_amount === 0 && write_off_amount > 0) → 'written_off'
if (balance_amount === 0) → 'paid'
if (balance_amount < total_amount) → 'partially_paid'
if (balance_amount === total_amount && due_date < today) → 'overdue'
if (status === 'issued' || status === 'overdue') → preserve current
default → current status
```

### 4.5 FeeGenerationService

**File:** `apps/api/src/modules/finance/fee-generation.service.ts`
**Dependencies:** PrismaService, InvoicesService, SequenceService

| Method | Signature | Responsibility |
|--------|-----------|---------------|
| `preview` | `(tenantId, dto) → FeeGenerationPreview` | Calculate all lines, check duplicates, flag missing billing parents |
| `confirm` | `(tenantId, userId, dto) → { invoices_created, total_amount }` | Re-calculate, create draft invoices in batch |

**Preview logic step-by-step:**
1. Load active fee assignments for the selected fee_structure_ids
2. Load students in the selected year_groups with their household_ids
3. Match: for each assignment, check if the student's year_group is selected (or if assignment is household-level, check if household has any student in selected year groups)
4. For each match, compute line: `base_amount = fee_structure.amount`, apply discount
5. Duplicate check: query invoice_lines JOIN invoices WHERE fee_structure_id matches AND billing_period_start/end matches AND invoice.status NOT IN ('void','cancelled')
6. Billing parent check: household.primary_billing_parent_id IS NOT NULL
7. Assemble preview

### 4.6 PaymentsService

**File:** `apps/api/src/modules/finance/payments.service.ts`
**Dependencies:** PrismaService, SequenceService, InvoicesService

| Method | Signature | Responsibility |
|--------|-----------|---------------|
| `findAll` | `(tenantId, filters) → Paginated<Payment>` | List with allocation summary |
| `findOne` | `(tenantId, id) → Payment` | Full data with allocations, receipt, refunds |
| `createManual` | `(tenantId, userId, dto) → Payment` | Create posted manual payment |
| `suggestAllocations` | `(tenantId, paymentId) → AllocationSuggestion` | FIFO suggest across household invoices |
| `confirmAllocations` | `(tenantId, paymentId, allocations, userId) → PaymentAllocation[]` | Validate and apply allocations, update invoice balances, generate receipt |
| `createFromStripe` | `(tenantId, stripeEvent) → Payment` | Create pending payment from checkout session |
| `confirmStripePayment` | `(tenantId, paymentId, externalEventId, tx) → void` | Transition pending → posted on webhook |
| `failStripePayment` | `(tenantId, paymentId, tx) → void` | Transition pending → failed |

**FIFO allocation logic:**
```typescript
function suggestFifoAllocations(invoices: Invoice[], paymentAmount: number) {
  const sorted = invoices
    .filter(i => ['issued','partially_paid','overdue'].includes(i.status))
    .sort((a,b) => a.due_date - b.due_date || a.created_at - b.created_at);

  let remaining = paymentAmount;
  const suggestions = [];

  for (const invoice of sorted) {
    if (remaining <= 0) break;
    const allocate = Math.min(remaining, invoice.balance_amount);
    suggestions.push({ invoice_id: invoice.id, suggested_amount: allocate });
    remaining -= allocate;
  }

  return { suggestions, unallocated_remainder: remaining };
}
```

### 4.7 ReceiptsService

**File:** `apps/api/src/modules/finance/receipts.service.ts`
**Dependencies:** PrismaService, SequenceService, PdfRenderingService

| Method | Signature | Responsibility |
|--------|-----------|---------------|
| `createForPayment` | `(tenantId, paymentId, userId, locale, tx) → Receipt` | Generate receipt number, create record |
| `findByPayment` | `(tenantId, paymentId) → Receipt | null` | Get receipt for a payment |
| `renderPdf` | `(tenantId, receiptId, locale) → Buffer` | Render receipt PDF via PdfRenderingService |

### 4.8 RefundsService

**File:** `apps/api/src/modules/finance/refunds.service.ts`
**Dependencies:** PrismaService, ApprovalRequestsService, PaymentsService, InvoicesService, StripeService

| Method | Signature | Responsibility |
|--------|-----------|---------------|
| `findAll` | `(tenantId, filters) → Paginated<Refund>` | List refunds |
| `create` | `(tenantId, userId, dto) → Refund` | Validate guards, check approval, create |
| `approve` | `(tenantId, id, userId, comment?) → Refund` | Transition to approved |
| `reject` | `(tenantId, id, userId, comment) → Refund` | Transition to rejected |
| `execute` | `(tenantId, id) → Refund` | Process refund, LIFO reversal |
| `reverseAllocationsLifo` | `(tenantId, paymentId, refundAmount, tx) → void` | LIFO allocation reversal logic |

**LIFO reversal step-by-step:**
1. Get all allocations for this payment ordered by `created_at DESC`
2. Calculate unallocated remainder: `payment.amount - SUM(allocations.allocated_amount)`
3. If unallocated remainder > 0, deduct from that first: `deductFromUnallocated = Math.min(refundAmount, unallocatedRemainder)`
4. `remainingToReverse = refundAmount - deductFromUnallocated`
5. For each allocation in LIFO order while `remainingToReverse > 0`:
   a. If `remainingToReverse >= allocation.allocated_amount`: delete allocation, add allocated_amount to list of affected invoices
   b. Else: reduce `allocation.allocated_amount` by `remainingToReverse`, add to affected invoices
   c. Subtract from remainingToReverse
6. For each affected invoice: call `invoicesService.recalculateBalance(tenantId, invoiceId, tx)`

### 4.9 StripeService

**File:** `apps/api/src/modules/finance/stripe.service.ts`
**Dependencies:** PrismaService, StripeConfigService, PaymentsService

| Method | Signature | Responsibility |
|--------|-----------|---------------|
| `createCheckoutSession` | `(tenantId, invoiceId, successUrl, cancelUrl) → { checkout_url }` | Decrypt keys, create Stripe session |
| `handleWebhook` | `(rawBody, signature, webhookSecret) → void` | Verify sig, advisory lock, dispatch event |
| `processRefund` | `(tenantId, paymentId, amount) → void` | Create Stripe refund via API |

### 4.10 HouseholdStatementsService

**File:** `apps/api/src/modules/finance/household-statements.service.ts`
**Dependencies:** PrismaService, PdfRenderingService

| Method | Signature | Responsibility |
|--------|-----------|---------------|
| `getStatement` | `(tenantId, householdId, dateFrom?, dateTo?) → StatementData` | Aggregate all financial records, compute running balance |
| `renderPdf` | `(tenantId, householdId, locale, dateFrom?, dateTo?) → Buffer` | Render statement PDF |

### 4.11 FinanceDashboardService

**File:** `apps/api/src/modules/finance/finance-dashboard.service.ts`
**Dependencies:** PrismaService

| Method | Signature | Responsibility |
|--------|-----------|---------------|
| `getDashboardData` | `(tenantId) → DashboardData` | Aggregate queries for overdue, pipeline, unallocated, recent payments, revenue |

### 4.12 Invoice Status Helper

**File:** `apps/api/src/modules/finance/helpers/invoice-status.helper.ts`

Pure function, no dependencies:
```typescript
export function deriveInvoiceStatus(
  currentStatus: InvoiceStatus,
  balanceAmount: number,
  totalAmount: number,
  dueDate: Date,
  writeOffAmount: number | null,
): InvoiceStatus
```

Logic:
- If status is `void`, `cancelled`, or `pending_approval` → return as-is (terminal/approval states)
- If `writeOffAmount > 0 && balanceAmount === 0` → `written_off`
- If `balanceAmount === 0` → `paid`
- If `balanceAmount > 0 && balanceAmount < totalAmount` → `partially_paid`
- If `balanceAmount === totalAmount && dueDate < today` → `overdue`
- Otherwise → `issued`

---

## Section 5 — Frontend Pages and Components

### 5.1 Finance Dashboard

**File:** `apps/web/src/app/[locale]/(school)/finance/page.tsx`
**Route:** `/finance`
**Type:** Server component wrapper with client dashboard widgets
**Data:** Calls `GET /api/v1/finance/dashboard`
**Permission:** `finance.view`
**Key elements:**
- Overdue ageing summary card (bar chart or segmented display)
- Invoice pipeline visual (draft → issued → overdue → paid counts)
- Unallocated payments alert card
- Pending refund approvals count
- Recent payments table (last 10)
- Revenue summary (current vs previous month)
**Design:** Follows 5.4 Finance Dashboard in UI design brief — prioritize overdue, unallocated, approvals

### 5.2 Fee Structures List

**File:** `apps/web/src/app/[locale]/(school)/finance/fee-structures/page.tsx`
**Type:** Server component with data table
**Data:** `GET /api/v1/finance/fee-structures`
**Key elements:** Searchable data table with columns: name, amount, frequency, year group, active status. "New" button. Row click → edit.

### 5.3 Fee Structure Form

**Files:**
- `apps/web/src/app/[locale]/(school)/finance/fee-structures/_components/fee-structure-form.tsx` (client component)
- `apps/web/src/app/[locale]/(school)/finance/fee-structures/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/finance/fee-structures/[id]/page.tsx`

**Data:** Year groups dropdown from `GET /api/v1/academics/year-groups`
**Form fields:** name, amount (currency input), billing_frequency (select), year_group_id (optional select), active toggle on edit

### 5.4 Discounts List & Form

**Files:** Same pattern as fee structures under `finance/discounts/`
**Form fields:** name, discount_type (fixed/percent toggle), value (currency or percentage input)

### 5.5 Fee Assignments List

**File:** `apps/web/src/app/[locale]/(school)/finance/fee-assignments/page.tsx`
**Type:** Server component
**Data:** `GET /api/v1/finance/fee-assignments`
**Key elements:** Filterable by household. Shows: household name, student (if per-student), fee structure, discount, effective dates. "New" button. End assignment action.

### 5.6 Fee Assignment Form

**File:** `apps/web/src/app/[locale]/(school)/finance/fee-assignments/_components/fee-assignment-form.tsx`
**Type:** Client component
**Data:** Households dropdown, students (filtered by selected household), fee structures, discounts
**Form fields:** household_id (searchable select), student_id (optional, filtered by household), fee_structure_id, discount_id (optional), effective_from (date picker)

### 5.7 Fee Generation Wizard

**File:** `apps/web/src/app/[locale]/(school)/finance/fee-generation/page.tsx`
**Type:** Client component (multi-step wizard)
**Steps:**
1. **Select parameters:** year groups (multi-select), fee structures (multi-select), billing period (start/end dates), due date
2. **Preview:** Shows preview table from `POST /api/v1/finance/fee-generation/preview`. Highlight duplicates (greyed out), missing billing parents (warning). Checkboxes to exclude households.
3. **Confirm:** Summary card showing count, total amount. Confirm button → `POST /api/v1/finance/fee-generation/confirm`. Success banner on completion.

**Design:** Follows 7.1-7.4 form patterns. Compare-before-save on confirm step. Sensitive action confirmation per 9.1-9.2.

### 5.8 Invoice List

**File:** `apps/web/src/app/[locale]/(school)/finance/invoices/page.tsx`
**Type:** Server component
**Data:** `GET /api/v1/finance/invoices`
**Key elements:** Filterable data table. Columns: invoice_number, household, status badge, total, balance, due_date, issue_date. Status filter tabs. Search by number/household. Saved filters.
**Empty state:** "No invoices this term — create fee assignments first, then run the fee generation wizard." CTA: "Go to fee assignments" (per UI brief 14.2)

### 5.9 Invoice Detail Hub

**File:** `apps/web/src/app/[locale]/(school)/finance/invoices/[id]/page.tsx`
**Type:** Server component wrapper with client tabs
**Data:** `GET /api/v1/finance/invoices/:id`
**Layout (per UI brief 4.2 — Invoice hub):**
- **Header:** Invoice number, status pill, household link, dates
- **Summary strip:** Subtotal, discount, total, paid, balance — with clear visual hierarchy
- **Tabs:**
  - Lines: invoice line items table
  - Payments: payment allocations with payment details
  - Installments: installment schedule (if any)
  - History: audit trail / activity timeline
- **Actions panel:** Issue, Void, Cancel, Write-off, Print PDF, Record Payment, Create Refund — conditionally shown based on status and permissions
- **Approval status:** If pending_approval, show approval request status and approver info

### 5.10 Payment Recording

**File:** `apps/web/src/app/[locale]/(school)/finance/payments/new/page.tsx`
**Type:** Client component
**Form fields:** household_id (searchable), payment_method (select: cash, bank_transfer, card_manual), payment_reference, amount, received_at (datetime), reason (optional)
**Flow:** Create payment → redirect to payment detail for allocation

### 5.11 Payment Detail with Allocation

**File:** `apps/web/src/app/[locale]/(school)/finance/payments/[id]/page.tsx`
**Type:** Server + client component
**Data:** `GET /api/v1/finance/payments/:id`
**Layout:**
- Payment header: reference, amount, method, status, household, date
- **Allocation panel** (if not yet allocated):
  1. "Suggest Allocations" button → calls suggest endpoint
  2. Shows suggestion table: invoice number, due date, balance, suggested amount (editable)
  3. User can adjust amounts (with validation: sum ≤ payment, each ≤ invoice balance)
  4. "Confirm Allocations" button → calls allocations endpoint
  5. Unallocated remainder warning if any
- **Allocated view** (if allocated): allocation table with invoice links
- Receipt link / Print button
- Refunds section

### 5.12 Payments List

**File:** `apps/web/src/app/[locale]/(school)/finance/payments/page.tsx`
**Type:** Server component
**Data:** `GET /api/v1/finance/payments`
**Columns:** reference, household, amount, method, status, received_at, allocated/unallocated

### 5.13 Refund Management

**File:** `apps/web/src/app/[locale]/(school)/finance/refunds/page.tsx`
**Type:** Server + client component
**Data:** `GET /api/v1/finance/refunds`
**Key elements:** Refund list table. Inline actions: approve, reject, execute. Refund creation via modal from payment detail page.

### 5.14 Household Statement

**File:** `apps/web/src/app/[locale]/(school)/finance/statements/[householdId]/page.tsx`
**Type:** Server component
**Data:** `GET /api/v1/finance/household-statements/:householdId`
**Layout:** Household header with billing parent info. Date range filter. Ledger-style table: date, type, reference, description, debit, credit, running balance. Print PDF button. Totals row.
**Access:** Also linked from household detail hub (adds finance tab to household page)

### 5.15 Parent Finance View

Parents access `/finance/invoices` with `parent.view_invoices` permission. The invoice list page renders a simplified parent-scoped view: only their household's issued/paid/overdue invoices. Invoice detail shows a "Pay Now" button (Stripe checkout) for unpaid invoices if `parent.make_payments` permission is held and Stripe is configured.

**Stripe checkout flow (client-side):**
1. Click "Pay Now" on invoice detail
2. Call `POST /api/v1/finance/invoices/:id/checkout-session` with success/cancel URLs
3. Redirect to returned `checkout_url`
4. On success, redirect back to invoice detail (status will update via webhook)

### 5.16 Shared Components

**File:** `apps/web/src/app/[locale]/(school)/finance/_components/`

| Component | Type | Purpose |
|-----------|------|---------|
| `invoice-status-badge.tsx` | Client | Renders semantic status pill for invoice statuses |
| `payment-status-badge.tsx` | Client | Renders status pill for payment statuses |
| `refund-status-badge.tsx` | Client | Renders status pill for refund statuses |
| `currency-display.tsx` | Client | Consistent currency formatting with tenant currency |
| `household-selector.tsx` | Client | Searchable household dropdown used across finance forms |

---

## Section 6 — Background Jobs

### 6.1 Overdue Detection Job

**Job name:** `finance:overdue-detection`
**Queue:** `FINANCE`
**Processor file:** `apps/worker/src/processors/finance/overdue-detection.processor.ts`
**Trigger:** BullMQ repeatable job, cron `0 1 * * *` (01:00 UTC daily). Alternatively, runs per-tenant at 01:00 in tenant timezone — implementation: single daily job iterates over all active tenants and processes each.
**Payload:** `{ tenant_id: string }` (per-tenant) or `{}` (iterator job)

**Processing logic:**
1. For each active tenant (or the specific tenant if per-tenant):
   a. Set RLS context
   b. Query: `SELECT id FROM invoices WHERE tenant_id = :tenantId AND status IN ('issued', 'partially_paid') AND due_date < CURRENT_DATE AND last_overdue_notified_at IS NULL`
   c. For each invoice: `UPDATE invoices SET status = 'overdue', last_overdue_notified_at = now() WHERE id = :id AND last_overdue_notified_at IS NULL RETURNING id` (atomic check-and-set)
   d. For returned IDs: enqueue notification (placeholder for P7 communications — for now, just log)
2. Also check installments: `UPDATE installments SET status = 'overdue' WHERE invoice_id IN (...) AND due_date < CURRENT_DATE AND status = 'pending'`

**Retry:** 3 attempts, exponential backoff
**DLQ:** Yes

### 6.2 Mass Invoice PDF Export (Optional/Deferred)

**Job name:** `finance:mass-invoice-pdf`
**Queue:** `FINANCE`
**Processor file:** `apps/worker/src/processors/finance/mass-invoice-pdf.processor.ts`
**Trigger:** User clicks "Export all invoices" on invoice list (enqueued via API endpoint)
**Payload:** `{ tenant_id: string, invoice_ids: string[], locale: string, requested_by_user_id: string }`

**Processing logic:**
1. For each invoice_id: render PDF via PdfRenderingService
2. Concatenate into single PDF with page breaks
3. Store temporarily (S3 or in-memory depending on size)
4. Notify user when complete

**Note:** This job follows the mass export pattern from UI brief 14b.2. Implementation can be simplified in P6 to render one-at-a-time and defer mass export to a later enhancement if needed.

---

## Section 7 — Implementation Order

### Step 1: Database Migration & Seed Data
1. Add 7 new enums to Prisma schema
2. Add 10 new models to Prisma schema
3. Add relation back-references to Tenant, Household, Student, User, YearGroup, ApprovalRequest models
4. Generate Prisma migration: `npx prisma migrate dev --name add-finance-tables`
5. Create `post_migrate.sql` with:
   - RLS policies for all 10 tables
   - `set_updated_at()` triggers for tables with `updated_at`
   - CHECK constraint on `invoice_lines.line_total`
   - Partial unique indexes (household_fee_assignments active, payments external_event_id)
6. Add `finance.write_off` and `finance.override_refund_guard` permissions to seed data
7. Add `'finance'` to module keys constant and seed tenant_modules
8. Add `FINANCE` to BullMQ queue names constant
9. Ensure `tenant_sequences` rows for 'invoice' and 'receipt' are created during tenant provisioning

### Step 2: Shared Types & Zod Schemas
1. Create `packages/shared/src/schemas/finance.schema.ts` with all Zod schemas
2. Create `packages/shared/src/types/finance.ts` with TypeScript types
3. Add `finance.write_off` and `finance.override_refund_guard` to permissions constant
4. Export from `packages/shared/src/index.ts`

### Step 3: Backend Services — Foundation
1. `InvoiceStatusHelper` — pure function, no deps
2. `FeeStructuresService` — CRUD only
3. `DiscountsService` — CRUD only
4. `FeeAssignmentsService` — CRUD, depends on fee structures/discounts existing

### Step 4: Backend Services — Invoice Core
1. `InvoicesService` — CRUD, lifecycle, write-off. Depends on SequenceService, ApprovalRequestsService, SettingsService
2. `FeeGenerationService` — wizard logic. Depends on InvoicesService

### Step 5: Backend Services — Payments
1. `PaymentsService` — manual recording, FIFO suggestion, allocation confirmation. Depends on InvoicesService
2. `ReceiptsService` — receipt generation. Depends on SequenceService, PdfRenderingService

### Step 6: Backend Services — Refunds & Stripe
1. `RefundsService` — refund workflow, LIFO reversal. Depends on PaymentsService, InvoicesService, ApprovalRequestsService
2. `StripeService` — checkout session creation, webhook handling. Depends on StripeConfigService, PaymentsService

### Step 7: Backend Services — Aggregation
1. `HouseholdStatementsService` — statement aggregation
2. `FinanceDashboardService` — dashboard data

### Step 8: Backend Controllers
1. `FeeStructuresController`
2. `DiscountsController`
3. `FeeAssignmentsController`
4. `InvoicesController`
5. `FeeGenerationController`
6. `PaymentsController`
7. `RefundsController`
8. `StripeWebhookController`
9. `HouseholdStatementsController`
10. `FinanceDashboardController`
11. Wire all into `FinanceModule`, register in `AppModule`

### Step 9: Modify SequenceService
1. Add optional `prefix` parameter to `nextNumber()` and `formatNumber()`
2. Finance services pass branding prefix when generating invoice/receipt numbers

### Step 10: PDF Templates
1. Invoice template (en)
2. Invoice template (ar)
3. Receipt template (en)
4. Receipt template (ar)
5. Household statement template (en)
6. Household statement template (ar)
7. Register templates in PdfRenderingService's template map

### Step 11: Background Job Processors
1. Overdue detection processor
2. Register in worker module

### Step 12: Frontend — Shared Components
1. Finance status badges
2. Currency display component
3. Household selector component

### Step 13: Frontend — Fee Management Pages
1. Fee structures list, new, edit
2. Discounts list, new, edit
3. Fee assignments list, new

### Step 14: Frontend — Fee Generation Wizard
1. Multi-step wizard component
2. Preview table
3. Confirmation step

### Step 15: Frontend — Invoice Pages
1. Invoice list
2. Invoice detail hub (with tabs, actions, status management)

### Step 16: Frontend — Payment Pages
1. Payment list
2. Payment recording form
3. Payment detail with allocation panel
4. Stripe checkout integration (client-side redirect)

### Step 17: Frontend — Refunds, Statements, Dashboard
1. Refund management page
2. Household statement page
3. Finance dashboard page

### Step 18: Frontend — Navigation & Integration
1. Add finance section to sidebar navigation
2. Add finance tab to household detail page
3. Add parent finance view (scoped invoice list, pay button)

---

## Section 8 — Files to Create

### Backend — Module
```
apps/api/src/modules/finance/
├── finance.module.ts
├── fee-structures.controller.ts
├── fee-structures.service.ts
├── discounts.controller.ts
├── discounts.service.ts
├── fee-assignments.controller.ts
├── fee-assignments.service.ts
├── invoices.controller.ts
├── invoices.service.ts
├── fee-generation.controller.ts
├── fee-generation.service.ts
├── payments.controller.ts
├── payments.service.ts
├── receipts.service.ts
├── refunds.controller.ts
├── refunds.service.ts
├── stripe.service.ts
├── stripe-webhook.controller.ts
├── household-statements.controller.ts
├── household-statements.service.ts
├── finance-dashboard.controller.ts
├── finance-dashboard.service.ts
└── helpers/
    └── invoice-status.helper.ts
```

### Backend — PDF Templates
```
apps/api/src/modules/pdf-rendering/templates/
├── invoice-en.template.ts
├── invoice-ar.template.ts
├── receipt-en.template.ts
├── receipt-ar.template.ts
├── household-statement-en.template.ts
└── household-statement-ar.template.ts
```

### Backend — Worker
```
apps/worker/src/processors/finance/
├── overdue-detection.processor.ts
└── overdue-detection.job.ts
```

### Shared Packages
```
packages/shared/src/schemas/finance.schema.ts
packages/shared/src/types/finance.ts
```

### Database
```
packages/prisma/migrations/YYYYMMDDHHMMSS_add-finance-tables/
├── migration.sql          (Prisma-generated)
└── post_migrate.sql       (RLS policies, triggers, CHECK constraints, partial indexes)
```

### Frontend — Pages
```
apps/web/src/app/[locale]/(school)/finance/
├── page.tsx
├── _components/
│   ├── invoice-status-badge.tsx
│   ├── payment-status-badge.tsx
│   ├── refund-status-badge.tsx
│   ├── currency-display.tsx
│   └── household-selector.tsx
├── fee-structures/
│   ├── page.tsx
│   ├── _components/
│   │   └── fee-structure-form.tsx
│   ├── new/
│   │   └── page.tsx
│   └── [id]/
│       └── page.tsx
├── discounts/
│   ├── page.tsx
│   ├── _components/
│   │   └── discount-form.tsx
│   ├── new/
│   │   └── page.tsx
│   └── [id]/
│       └── page.tsx
├── fee-assignments/
│   ├── page.tsx
│   ├── _components/
│   │   └── fee-assignment-form.tsx
│   └── new/
│       └── page.tsx
├── fee-generation/
│   ├── page.tsx
│   └── _components/
│       ├── fee-generation-wizard.tsx
│       └── fee-generation-preview.tsx
├── invoices/
│   ├── page.tsx
│   └── [id]/
│       ├── page.tsx
│       └── _components/
│           ├── invoice-lines-tab.tsx
│           ├── invoice-payments-tab.tsx
│           ├── invoice-installments-tab.tsx
│           ├── invoice-actions.tsx
│           └── installment-form.tsx
├── payments/
│   ├── page.tsx
│   ├── _components/
│   │   ├── payment-form.tsx
│   │   └── allocation-panel.tsx
│   ├── new/
│   │   └── page.tsx
│   └── [id]/
│       └── page.tsx
├── refunds/
│   └── page.tsx
└── statements/
    └── [householdId]/
        └── page.tsx
```

---

## Section 9 — Files to Modify

### Prisma Schema
- **`packages/prisma/schema.prisma`**: Add 7 enums, 10 models, update Tenant/Household/Student/User/YearGroup/ApprovalRequest relations

### App Module Registration
- **`apps/api/src/app.module.ts`**: Import and register `FinanceModule`

### Sequence Service
- **`apps/api/src/modules/tenants/sequence.service.ts`**: Add optional `prefix` parameter to `nextNumber()` and `formatNumber()` methods

### Permissions Constant
- **`packages/shared/src/constants/permissions.ts`**: Add `finance.write_off` and `finance.override_refund_guard` to `PERMISSIONS.finance`, add to `PERMISSION_TIER_MAP` (admin tier), add to `SYSTEM_ROLE_PERMISSIONS.school_owner` and `finance_staff`

### Queue Names Constant
- **`apps/worker/src/base/queue.constants.ts`**: Add `FINANCE` queue name

### Module Keys Constant
- **`packages/shared/src/constants/modules.ts`** (or wherever module keys are defined): Add `'finance'` module key

### PDF Template Registry
- **`apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts`**: Register invoice, receipt, and household statement templates in the `TEMPLATES` map

### Tenant Provisioning / Seed
- **`packages/prisma/seed/`**: Ensure tenant provisioning creates `tenant_sequences` rows for `'invoice'` and `'receipt'` types, and `tenant_modules` row for `'finance'`

### Frontend Sidebar Navigation
- **Sidebar component** (locate via `apps/web/src/` — likely a layout component or navigation config): Add Finance nav item with sub-items (Dashboard, Fee Structures, Discounts, Fee Assignments, Fee Generation, Invoices, Payments, Refunds, Statements)

### Household Detail Page
- **`apps/web/src/app/[locale]/(school)/households/[id]/page.tsx`**: Add Finance tab showing open invoices, recent payments, statement link

### Translation Files
- **`apps/web/messages/en.json`**: Add finance module translation keys
- **`apps/web/messages/ar.json`**: Add Arabic translations for finance module

### Post-migrate Runner
- **`packages/prisma/migrations/` new migration directory**: Create `post_migrate.sql` alongside the Prisma migration

---

## Section 10 — Key Context for Executor

### Pattern References

1. **Controller pattern** — follow `apps/api/src/modules/households/households.controller.ts`:
   - `@Controller('v1/finance/...')`, `@UseGuards(AuthGuard, PermissionGuard)`
   - `@Body(new ZodValidationPipe(schema))`, `@Query(new ZodValidationPipe(schema))`
   - `@CurrentTenant() tenant`, `@CurrentUser() user`, `@RequiresPermission(...)`

2. **Service with RLS** — follow `apps/api/src/modules/approvals/approval-requests.service.ts`:
   - Use `createRlsClient(this.prisma, { tenant_id: tenantId })` for all tenant-scoped queries
   - All DB access via `rlsClient.$transaction(async (tx) => { ... })`

3. **Sequence number generation** — follow `apps/api/src/modules/tenants/sequence.service.ts`:
   - Call `sequenceService.nextNumber(tenantId, 'invoice', tx, prefix)` within the same transaction
   - Prefix comes from `tenant_branding.invoice_prefix` (default "INV") or `receipt_prefix` (default "REC")

4. **Approval integration** — follow the `checkAndCreateIfNeeded` pattern from `approval-requests.service.ts`:
   - Returns `{ approved: true }` or `{ approved: false, request_id: string }`
   - Check `tenant_settings.finance.requireApprovalForInvoiceIssue` before calling

5. **PDF rendering** — follow `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts`:
   - Templates are functions that receive data + branding and return HTML
   - Register in TEMPLATES map with `{ templateKey: { locale: templateFn } }`
   - Call `pdfRenderingService.renderPdf(templateKey, locale, data, branding)`

6. **Worker job pattern** — follow `apps/worker/src/processors/gradebook/mass-report-card-pdf.processor.ts`:
   - Processor class extends `WorkerHost`, decorated with `@Processor(QUEUE_NAMES.FINANCE)`
   - Job class extends `TenantAwareJob` base class
   - Job name format: `finance:overdue-detection`

7. **Frontend form pattern** — follow `apps/web/src/app/[locale]/(school)/staff/_components/staff-form.tsx`:
   - Client components with `'use client'`
   - Zod validation, controlled inputs
   - `apiClient` for data fetching

8. **Frontend list pattern** — follow `apps/web/src/app/[locale]/(school)/students/page.tsx`:
   - Server component fetching data
   - Data table with pagination, search, filters

### Gotchas and Edge Cases

1. **Optimistic concurrency on invoices**: Invoice updates require `expected_updated_at` field. Use `WHERE id = :id AND updated_at = :expected_updated_at`. Return `CONCURRENT_MODIFICATION` (409) if no match.

2. **Stripe webhook tenant resolution**: Webhooks arrive without auth context. The tenant must be determined from the event metadata (include `tenant_id` in Stripe Checkout Session metadata). Use raw body for signature verification — do NOT parse JSON before verification.

3. **Advisory lock for Stripe webhooks**: Use `pg_advisory_xact_lock(hashtext('stripe_webhook:' || external_event_id))` within the interactive transaction to prevent concurrent processing of the same event.

4. **Partial unique index limitation**: Prisma doesn't support partial unique indexes natively. These must go in `post_migrate.sql`. The `@@unique` directive in Prisma schema is for non-partial indexes only.

5. **CHECK constraint on invoice_lines**: Prisma doesn't support CHECK constraints. Add via `post_migrate.sql`: `ALTER TABLE invoice_lines ADD CONSTRAINT chk_invoice_lines_total CHECK (line_total = quantity * unit_amount);`

6. **Parent scoping**: When a parent calls invoice/payment/statement endpoints, the service must verify the household belongs to the parent's linked households (via `household_parents` join). Never rely on just `parent.view_invoices` permission — also validate data ownership.

7. **Currency code**: Always use `tenants.currency_code` for new invoices and payments. Never hardcode a currency. The currency_code is set once per tenant and doesn't change.

8. **Monetary arithmetic**: All monetary calculations use `number` in TypeScript. Avoid floating point errors by rounding to 2 decimal places at every calculation step. Use `Math.round(value * 100) / 100` or a decimal library.

9. **Refund on written-off invoice**: Blocked by default. Only allowed if user has `finance.override_refund_guard` permission AND provides a reason (the reason field is already required on all refunds, so just check the permission).

10. **Invoice status derivation**: This must be a deterministic, stateless function. Never set invoice status directly — always call `deriveInvoiceStatus()` after any financial mutation that affects balance.

11. **Fee generation idempotency**: The confirm endpoint must re-run the preview calculation to avoid stale data. Don't cache the preview result between preview and confirm calls.

12. **Billing period on invoice_lines**: `billing_period_start` and `billing_period_end` are only set by the fee generation wizard. Manual invoices have these as NULL. The duplicate detection query must handle both cases.

13. **Stripe dependency**: Stripe-related code should gracefully handle tenants without Stripe configured. Return `STRIPE_NOT_CONFIGURED` error for checkout session creation. Manual payment methods (cash, bank_transfer, card_manual) work without Stripe.

### Cross-Module Wiring

1. **FinanceModule imports**: ApprovalsModule (for ApprovalRequestsService), TenantsModule (for SequenceService), ConfigurationModule (for SettingsService, StripeConfigService), PdfRenderingModule, HouseholdsModule (optional — for household validation)

2. **FinanceModule exports**: None needed — finance is a leaf module, no other modules depend on it in P6

3. **Approval callback**: When an approval request for `invoice_issue` is approved/rejected, the approval system needs to call back to the finance module. Pattern: either (a) InvoicesService polls approval status on next access, or (b) set up an event/callback. The simplest approach is (a) — when an invoice with status `pending_approval` is accessed, check the linked approval_request's status and transition if resolved. Alternatively, add a webhook/event pattern if one exists in the approvals module.

4. **Sidebar navigation config**: The finance nav section should appear between "Academics" and "Payroll" in the sidebar, with sub-items: Dashboard, Fee Structures, Discounts, Fee Assignments, Fee Generation, Invoices, Payments, Refunds, Statements. Gated by `finance.view` permission and `finance` module enabled.

---

## Validation Checklist

- [x] Every table in the phase spec has a corresponding entry in Section 2 (fee_structures, discounts, household_fee_assignments, invoices, invoice_lines, installments, payments, payment_allocations, receipts, refunds)
- [x] Every functional requirement (4.11.1–4.11.12) has at least one endpoint in Section 3
- [x] Every endpoint has a service method in Section 4
- [x] Every service method is reachable from a controller or job processor
- [x] No tables, endpoints, or features are planned that aren't in the phase spec (billing_period_start/end on invoice_lines is required by the spec's duplicate detection key)
- [x] Implementation order in Section 7 has no forward dependencies
