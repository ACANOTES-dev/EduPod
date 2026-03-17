# P6 Testing Instructions — Finance Module

## Section 1 — Unit Tests

### 1.1 Invoice Status Helper (`invoice-status.helper.ts`)

| Test | Input | Expected |
|------|-------|----------|
| should return 'void' for void invoices | currentStatus='void', any other values | 'void' |
| should return 'cancelled' for cancelled invoices | currentStatus='cancelled' | 'cancelled' |
| should return 'pending_approval' for pending invoices | currentStatus='pending_approval' | 'pending_approval' |
| should return 'written_off' when write-off applied and balance zero | balance=0, writeOff=500 | 'written_off' |
| should return 'paid' when balance is zero | balance=0, writeOff=null | 'paid' |
| should return 'partially_paid' when balance < total | balance=200, total=500 | 'partially_paid' |
| should return 'overdue' when balance equals total and past due | balance=500, total=500, dueDate=yesterday | 'overdue' |
| should return 'issued' when balance equals total and not past due | balance=500, total=500, dueDate=tomorrow | 'issued' |
| edge: should handle zero write-off as non-write-off | balance=0, writeOff=0 | 'paid' (not 'written_off') |

### 1.2 FeeStructuresService

| Test | Description |
|------|-------------|
| findAll: should return paginated fee structures | Query with page=1, pageSize=10, verify shape |
| findAll: should filter by active status | Pass active=true, verify only active returned |
| findAll: should search by name | Pass search='Tuition', verify LIKE filter |
| create: should create fee structure | Valid DTO, verify created with all fields |
| create: should reject duplicate name | Same tenant + name, expect DUPLICATE_NAME 409 |
| create: should reject invalid year_group_id | Non-existent UUID, expect YEAR_GROUP_NOT_FOUND |
| update: should update fee structure | Valid update, verify changed fields |
| deactivate: should soft-delete | Set active=false |
| deactivate: should block if active assignments exist | Has active assignment, expect FEE_STRUCTURE_IN_USE 409 |

### 1.3 DiscountsService

| Test | Description |
|------|-------------|
| create: should create fixed discount | discount_type='fixed', value=50 |
| create: should create percent discount | discount_type='percent', value=15 |
| create: should reject percent > 100 | discount_type='percent', value=150, expect 400 |
| create: should reject duplicate name | Same name, expect DUPLICATE_NAME 409 |
| deactivate: should block if in use | Active assignment uses this discount, expect 409 |

### 1.4 FeeAssignmentsService

| Test | Description |
|------|-------------|
| create: should create assignment | Valid FK references |
| create: should reject invalid household | Non-existent household, expect 404 |
| create: should reject student not in household | Student belongs to different household |
| create: should reject inactive fee structure | Fee structure with active=false |
| create: should reject duplicate active assignment | Same household/student/fee_structure with effective_to IS NULL |
| update: should change discount | Update discount_id |
| endAssignment: should set effective_to to today | Verify date set |

### 1.5 InvoicesService

| Test | Description |
|------|-------------|
| create: should create draft invoice with generated number | Verify invoice_number format, status='draft', balance=total |
| create: should use branding prefix for number | Tenant has invoice_prefix='SCH', verify number starts with 'SCH-' |
| update: should replace lines and recalculate totals | Change lines, verify new subtotal/total/balance |
| update: should reject non-draft invoice | Status='issued', expect INVOICE_NOT_DRAFT 409 |
| update: should enforce optimistic concurrency | Stale expected_updated_at, expect CONCURRENT_MODIFICATION 409 |
| issue: should transition to issued when no approval needed | Settings.requireApprovalForInvoiceIssue=false |
| issue: should transition to pending_approval when approval needed | Settings.requireApprovalForInvoiceIssue=true, workflow exists |
| issue: should auto-approve for school_owner | hasDirectAuthority=true |
| voidInvoice: should void when balance equals total | No payments applied |
| voidInvoice: should reject when payments exist | balance < total, expect INVOICE_HAS_PAYMENTS 409 |
| cancel: should cancel draft | From 'draft' status |
| cancel: should cancel pending_approval and linked approval | Linked approval request also cancelled |
| cancel: should reject from issued | Status='issued', expect INVALID_STATUS_TRANSITION 409 |
| writeOff: should zero balance and set status | Record write_off_amount and reason |
| writeOff: should reject from draft | Status='draft', expect INVALID_STATUS_TRANSITION |
| recalculateBalance: should compute balance from allocations | total=1000, sum_allocated=600, balance should be 400 |
| recalculateBalance: should derive correct status | After recalc, status should reflect new balance |

### 1.6 FeeGenerationService

| Test | Description |
|------|-------------|
| preview: should calculate correct lines | 2 households x 2 fee structures = 4 lines |
| preview: should apply fixed discount | Base 1000, discount 200, line_total 800 |
| preview: should apply percent discount | Base 1000, discount 10%, line_total 900 |
| preview: should floor at zero | Base 100, discount 200, line_total 0 (not negative) |
| preview: should flag duplicates | Existing invoice with same fee_structure + billing period |
| preview: should flag missing billing parent | Household without primary_billing_parent_id |
| confirm: should create draft invoices grouped by household | 3 lines for 2 households = 2 invoices |
| confirm: should skip excluded households | excluded_household_ids filters them out |
| confirm: should skip duplicates silently | Duplicates not created |
| confirm: should block missing billing parent | Error with affected household IDs |

### 1.7 PaymentsService

| Test | Description |
|------|-------------|
| createManual: should create posted payment | Status='posted', posted_by set |
| suggestAllocations: should suggest FIFO order | 3 invoices: oldest due first |
| suggestAllocations: should handle partial allocation | Payment < total outstanding |
| suggestAllocations: should report unallocated remainder | Payment > total outstanding |
| confirmAllocations: should create allocation records | Verify records created |
| confirmAllocations: should update invoice balances | Each invoice balance reduced |
| confirmAllocations: should reject over-allocation | Sum > payment amount, expect 400 |
| confirmAllocations: should reject exceeding invoice balance | Single allocation > invoice balance |
| confirmAllocations: should reject cross-household | Invoice belongs to different household |
| confirmAllocations: should generate receipt | Receipt created after allocation |

### 1.8 RefundsService

| Test | Description |
|------|-------------|
| create: should create refund request | Valid request |
| create: should reject if amount exceeds unrefunded | Total refunds would exceed payment |
| create: should block refund on void invoice | Payment allocated to void invoice |
| create: should block refund on written-off invoice without override | Missing override_refund_guard permission |
| create: should allow refund on written-off with override permission | Has override_refund_guard |
| execute: should process LIFO reversal | Most recent allocation reversed first |
| execute: should deduct from unallocated first | Unallocated remainder consumed before allocations |
| execute: should delete full allocation | Allocation fully reversed = row deleted |
| execute: should reduce partial allocation | Allocation partially reversed = amount reduced |
| execute: should recalculate affected invoices | Invoice balances and statuses updated |
| execute: should update payment status | fully refunded = 'refunded_full', partial = 'refunded_partial' |

### 1.9 HouseholdStatementsService

| Test | Description |
|------|-------------|
| getStatement: should include all financial records | Invoices, payments, refunds, write-offs |
| getStatement: should compute correct running balance | Debits increase, credits decrease |
| getStatement: should sort chronologically | Oldest first |
| getStatement: should filter by date range | Only entries within range |
| getStatement: should exclude void/cancelled invoices | Not in statement |

### 1.10 FinanceDashboardService

| Test | Description |
|------|-------------|
| getDashboardData: should return overdue ageing buckets | Correct counts/amounts per bucket |
| getDashboardData: should return invoice pipeline | Correct counts per status |
| getDashboardData: should return unallocated payments | Payments without full allocation |
| getDashboardData: should return recent payments | Last 10, ordered by received_at DESC |

---

## Section 2 — Integration Tests

### 2.1 Fee Structures API

```
POST /api/v1/finance/fee-structures
  - 201: valid creation → { data: { id, name, amount, ... } }
  - 409: duplicate name → { error: { code: 'DUPLICATE_NAME' } }
  - 403: user without finance.manage → 403

GET /api/v1/finance/fee-structures
  - 200: returns paginated list → { data: [...], meta: { page, pageSize, total } }
  - 200: search filter works
  - 403: user without finance.view → 403

GET /api/v1/finance/fee-structures/:id
  - 200: returns single record with year_group
  - 404: non-existent ID

PATCH /api/v1/finance/fee-structures/:id
  - 200: updates fields
  - 404: non-existent ID

DELETE /api/v1/finance/fee-structures/:id
  - 204: soft-deletes (active=false)
  - 409: has active assignments
```

### 2.2 Discounts API
Same pattern as fee structures with additional percent validation test.

### 2.3 Fee Assignments API
```
POST /api/v1/finance/fee-assignments
  - 201: valid creation
  - 404: invalid household_id
  - 400: student not in household
  - 409: duplicate active assignment

DELETE /api/v1/finance/fee-assignments/:id
  - 204: sets effective_to to today
```

### 2.4 Fee Generation API
```
POST /api/v1/finance/fee-generation/preview
  - 200: returns preview with lines, duplicates, missing billing parents
  - 400: empty year_group_ids

POST /api/v1/finance/fee-generation/confirm
  - 200: creates draft invoices, returns count
  - 400: households missing billing parent
  - 400: no eligible lines after exclusions
```

### 2.5 Invoices API
```
POST /api/v1/finance/invoices
  - 201: creates draft invoice with generated number
  - 404: invalid household

POST /api/v1/finance/invoices/:id/issue
  - 200: transitions to 'issued' (no approval required)
  - 200: transitions to 'pending_approval' (approval required)
  - 409: invoice not in draft status

POST /api/v1/finance/invoices/:id/void
  - 200: voids invoice
  - 409: invoice has payments

POST /api/v1/finance/invoices/:id/write-off
  - 200: writes off balance
  - 409: invalid status for write-off

GET /api/v1/finance/invoices/:id/pdf
  - 200: returns PDF buffer with correct content-type
```

### 2.6 Payments API
```
POST /api/v1/finance/payments
  - 201: creates posted payment
  - 403: user without finance.process_payments

POST /api/v1/finance/payments/:id/allocations/suggest
  - 200: returns FIFO suggestions
  - 409: payment not posted

POST /api/v1/finance/payments/:id/allocations
  - 201: creates allocations, updates invoices
  - 400: over-allocation
  - 400: cross-household allocation
```

### 2.7 Refunds API
```
POST /api/v1/finance/refunds
  - 201: creates refund request
  - 400: amount exceeds payment
  - 403: user without finance.issue_refunds

POST /api/v1/finance/refunds/:id/approve
  - 200: transitions to approved
  - 400: self-approval blocked

POST /api/v1/finance/refunds/:id/execute
  - 200: executes refund with LIFO reversal
  - 409: refund not approved
```

### 2.8 Stripe Webhook
```
POST /api/v1/stripe/webhook
  - 200: processes valid webhook
  - 400: invalid signature
  - 200: duplicate webhook (idempotent — no error, no duplicate)
```

### 2.9 Household Statements
```
GET /api/v1/finance/household-statements/:householdId
  - 200: returns statement with entries and running balance
  - 200: date range filter works
```

### 2.10 Finance Dashboard
```
GET /api/v1/finance/dashboard
  - 200: returns all dashboard sections
  - 403: user without finance.view
```

---

## Section 3 — RLS Leakage Tests

For EVERY new table, test this pattern:
1. Create data as Tenant A
2. Authenticate as Tenant B
3. Attempt to read/query the data
4. Assert: data is NOT returned (empty result or 404)

### Tables to test:

| Table | Test endpoint | Method |
|-------|--------------|--------|
| fee_structures | GET /api/v1/finance/fee-structures | Tenant B sees empty list |
| fee_structures | GET /api/v1/finance/fee-structures/:id | Tenant B gets 404 |
| discounts | GET /api/v1/finance/discounts | Tenant B sees empty list |
| household_fee_assignments | GET /api/v1/finance/fee-assignments | Tenant B sees empty list |
| invoices | GET /api/v1/finance/invoices | Tenant B sees empty list |
| invoices | GET /api/v1/finance/invoices/:id | Tenant B gets 404 |
| payments | GET /api/v1/finance/payments | Tenant B sees empty list |
| refunds | GET /api/v1/finance/refunds | Tenant B sees empty list |
| household statements | GET /api/v1/finance/household-statements/:id | Tenant B gets 404 |

### Cross-tenant mutation tests:
- Tenant B tries to allocate payment to Tenant A's invoice → 404/blocked
- Tenant B tries to issue Tenant A's invoice → 404/blocked
- Tenant B tries to create refund for Tenant A's payment → 404/blocked

---

## Section 4 — Manual QA Checklist

### 4.1 Fee Structures (Both locales: en, ar)
- [ ] Navigate to Finance > Fee Structures
- [ ] Create a new fee structure with all fields
- [ ] Verify it appears in the list
- [ ] Edit the fee structure
- [ ] Verify the edit is saved
- [ ] Try to delete a fee structure with active assignments — verify blocked
- [ ] Delete a fee structure without assignments — verify soft-deleted
- [ ] Verify RTL layout in Arabic locale

### 4.2 Discounts
- [ ] Create a fixed discount (e.g., 200 SAR off)
- [ ] Create a percent discount (e.g., 10%)
- [ ] Try creating a percent discount with value > 100 — verify blocked
- [ ] Verify discounts appear in fee assignment dropdown

### 4.3 Fee Assignments
- [ ] Create a household-level fee assignment
- [ ] Create a student-specific fee assignment
- [ ] Attach a discount to an assignment
- [ ] End an assignment (set effective_to)
- [ ] Verify assignment appears in fee generation

### 4.4 Fee Generation Wizard
- [ ] Step 1: Select year groups, fee structures, dates
- [ ] Step 2: Verify preview shows correct lines with discounts applied
- [ ] Step 2: Verify duplicates are highlighted and excluded
- [ ] Step 2: Verify missing billing parent warnings shown
- [ ] Step 2: Exclude a household using checkbox
- [ ] Step 3: Confirm and verify draft invoices created
- [ ] Re-run wizard — verify previously generated invoices are caught as duplicates

### 4.5 Invoice Lifecycle
- [ ] View draft invoice in list
- [ ] Open invoice detail hub — verify all tabs work (Lines, Payments, Installments)
- [ ] Issue an invoice (no approval required) — verify status changes to 'issued'
- [ ] Issue an invoice (approval required) — verify status changes to 'pending_approval'
- [ ] Void an invoice (no payments) — verify status changes to 'void'
- [ ] Cancel a draft invoice — verify status changes to 'cancelled'
- [ ] Write off an issued invoice — verify balance zeroed
- [ ] Print invoice PDF — verify PDF renders correctly in both locales

### 4.6 Installments
- [ ] Create installment plan for an invoice
- [ ] Verify sum equals invoice total (try invalid sum — verify rejected)
- [ ] Delete installment plan
- [ ] Verify installment status tracking

### 4.7 Payment Recording
- [ ] Record a manual cash payment
- [ ] Record a bank transfer payment
- [ ] Verify payment appears in list

### 4.8 Payment Allocation
- [ ] Click "Suggest Allocations" — verify FIFO order
- [ ] Adjust suggested amounts
- [ ] Confirm allocations — verify invoice balances updated
- [ ] Verify receipt auto-generated
- [ ] Print receipt PDF — verify correct in both locales
- [ ] Try over-allocation — verify blocked

### 4.9 Refund Workflow
- [ ] Create refund request for a payment
- [ ] Try exceeding payment amount — verify blocked
- [ ] Approve refund
- [ ] Execute refund — verify LIFO reversal (invoice balances restored)
- [ ] Verify payment status updated (refunded_partial or refunded_full)

### 4.10 Household Statement
- [ ] View statement for a household with activity
- [ ] Verify running balance is correct
- [ ] Apply date range filter
- [ ] Print statement PDF

### 4.11 Finance Dashboard
- [ ] View dashboard — verify all widgets populated
- [ ] Verify overdue ageing shows correct buckets
- [ ] Verify invoice pipeline shows correct counts
- [ ] Verify unallocated payments alert works
- [ ] Click through to related pages from dashboard widgets

### 4.12 Parent Portal (as parent role)
- [ ] View own household's invoices (not other households')
- [ ] Verify draft/pending/void invoices are hidden
- [ ] View invoice detail
- [ ] Click "Pay Now" (Stripe checkout) — verify redirect
- [ ] View receipt for completed payment
- [ ] View household statement

### 4.13 RTL / Arabic
- [ ] Switch to Arabic locale
- [ ] Verify all finance pages render RTL correctly
- [ ] Verify currency amounts are LTR within RTL layout
- [ ] Verify invoice/receipt PDFs render correctly in Arabic
- [ ] Verify table column alignment
- [ ] Verify status badges display Arabic labels

### 4.14 Permission Checks
- [ ] User without `finance.view` cannot access finance pages
- [ ] User without `finance.manage` cannot create/edit/delete
- [ ] User without `finance.process_payments` cannot record payments
- [ ] User without `finance.issue_refunds` cannot create refunds
- [ ] Finance staff can manage but not issue refunds (by default)
- [ ] School owner has all finance permissions
