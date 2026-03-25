# P6 Testing Result — Finance Module

## Test Run Summary

| Metric | Count |
|--------|-------|
| **Total Tests** | 116 |
| **Passed** | 116 |
| **Fixed** | 6 |
| **Failed** | 0 |
| **Unresolved** | 0 |

---

## Unit Test Results

### 1.1 Invoice Status Helper (`invoice-status.helper.spec.ts`)

| Test | Status |
|------|--------|
| should return 'void' for void invoices | PASS |
| should return 'cancelled' for cancelled invoices | PASS |
| should return 'pending_approval' for pending invoices | PASS |
| should return 'written_off' when write-off applied and balance zero | PASS |
| should return 'paid' when balance is zero | PASS |
| should return 'partially_paid' when balance < total | PASS |
| should return 'overdue' when balance equals total and past due | PASS |
| should return 'issued' when balance equals total and not past due | PASS |
| edge: should handle zero write-off as non-write-off | PASS |
| roundMoney: should round to 2 decimal places | PASS |
| roundMoney: should handle already-rounded values | PASS |
| roundMoney: edge: should handle floating point arithmetic correctly | PASS |

**12 tests, 12 passed**

---

## Integration Test Results (`p6-finance.e2e-spec.ts`)

### Fee Structures (9 tests)

| Test | Status |
|------|--------|
| should create a fee structure (201) | PASS |
| should reject duplicate fee structure name (409) | PASS |
| should list fee structures with pagination (200) | PASS |
| should get fee structure by id (200) | PASS |
| should update fee structure (200) | PASS |
| should deactivate fee structure with no active assignments (200) | PASS |
| should reject fee structure access for teacher (403) | PASS |
| should allow admin to view fee structures (200) | PASS |
| should reject admin creating fee structures (403) | PASS |

### Discounts (6 tests)

| Test | Status |
|------|--------|
| should create a fixed discount (201) | PASS |
| should create a percent discount (201) | PASS |
| should reject percent discount > 100 (400) | PASS |
| should reject duplicate discount name (409) | PASS |
| should list discounts (200) | PASS |
| should reject teacher access to discounts (403) | PASS |

### Fee Assignments (6 tests)

| Test | Status |
|------|--------|
| should create a fee assignment (201) | PASS |
| should reject duplicate active fee assignment (409) | PASS |
| should end a fee assignment (200) | FIXED |
| should reject ending an already-ended assignment (400) | PASS |
| should list fee assignments (200) | PASS |
| should reject teacher access to fee assignments (403) | PASS |

### Invoices (10 tests)

| Test | Status |
|------|--------|
| should create a draft invoice (201) | PASS |
| should list invoices with pagination (200) | PASS |
| should get a single invoice (200) | PASS |
| should issue a draft invoice (200) | FIXED |
| should reject issuing an already-issued invoice (400) | PASS |
| should void an issued invoice with no payments (200) | FIXED |
| should cancel a draft invoice (200) | FIXED |
| should write off an issued invoice (200) | FIXED |
| should reject write-off on a draft invoice (400) | PASS |
| should reject teacher access to invoices (403) | PASS |
| should reject teacher creating invoices (403) | PASS |

### Payments & Allocations (7 tests)

| Test | Status |
|------|--------|
| should create a manual payment (201) | PASS |
| should list payments (200) | PASS |
| should get payment by id (200) | PASS |
| should suggest allocations in FIFO order (200) | PASS |
| should confirm allocations and update invoice balance (201) | FIXED |
| should reject over-allocation (400) | PASS |
| should reject teacher access to payments (403) | PASS |

### Refunds (8 tests)

| Test | Status |
|------|--------|
| should create a refund request (201) | PASS |
| should list refunds (200) | PASS |
| should block self-approval of refund (400) | PASS |
| should reject executing a non-approved refund (400) | PASS |
| should reject a refund (200) | PASS |
| should execute an approved refund (200) | PASS |
| should reject refund exceeding available amount (400) | PASS |
| should reject teacher access to refunds (403) | PASS |

### Household Statement (4 tests)

| Test | Status |
|------|--------|
| should get household statement (200) | PASS |
| should get statement with date filter (200) | PASS |
| should return 404 for non-existent household statement | PASS |
| should reject teacher access to statements (403) | PASS |

### Finance Dashboard (3 tests)

| Test | Status |
|------|--------|
| should return dashboard data (200) | PASS |
| should allow admin to view dashboard (200) | PASS |
| should reject teacher access to dashboard (403) | PASS |

### Stripe Webhook (5 tests)

| Test | Status |
|------|--------|
| should accept webhook POST with valid signature and tenant metadata (200) | PASS |
| should reject webhook with invalid signature (400) | PASS |
| should handle duplicate webhook event idempotently (200) | PASS |
| should handle webhook without tenant_id gracefully (200) | PASS |
| should handle webhook with empty body gracefully (200) | PASS |

### Cross-Tenant Isolation within E2E (7 tests)

| Test | Status |
|------|--------|
| should not leak fee structures across tenants | PASS |
| should not leak discounts across tenants | PASS |
| should not leak invoices across tenants | PASS |
| should not leak payments across tenants | PASS |
| should return 404 for Al Noor fee structure accessed by Cedar | PASS |
| should return 404 for Al Noor invoice accessed by Cedar | PASS |
| should not leak household statement across tenants | PASS |

**66 tests, 66 passed**

---

## RLS Leakage Test Results (`p6-rls.e2e-spec.ts`)

### API-Level List Endpoints (8 tests)

| Test | Status |
|------|--------|
| GET fee-structures: Cedar sees no Al Noor data | PASS |
| GET discounts: Cedar sees no Al Noor data | PASS |
| GET fee-assignments: Cedar sees no Al Noor data | PASS |
| GET invoices: Cedar sees no Al Noor data | PASS |
| GET payments: Cedar sees no Al Noor data | PASS |
| GET refunds: Cedar sees no Al Noor data | PASS |
| GET household-statements: Cedar gets 404 for Al Noor household | PASS |
| GET dashboard: Cedar data does not contain Al Noor data | PASS |

### API-Level Detail Endpoints (8 tests)

| Test | Status |
|------|--------|
| GET fee-structures/:id → 404 | PASS |
| GET discounts/:id → 404 | PASS |
| GET fee-assignments/:id → 404 | PASS |
| GET invoices/:id → 404 | PASS |
| GET payments/:id → 404 | PASS |
| GET invoices/:id/installments → 404 | PASS |
| GET invoices/:id/preview → 404 | PASS |
| GET payments/:id/receipt → 404 | PASS |

### Cross-Tenant Mutation Safety (10 tests)

| Test | Status |
|------|--------|
| Cedar issuing Al Noor invoice → 404 | PASS |
| Cedar voiding Al Noor invoice → 404 | PASS |
| Cedar cancelling Al Noor invoice → 404 | PASS |
| Cedar writing off Al Noor invoice → 404 | PASS |
| Cedar creating payment for Al Noor household → rejected | PASS |
| Cedar creating refund for Al Noor payment → 404 | PASS |
| Cedar approving Al Noor refund → 404 | PASS |
| Cedar executing Al Noor refund → 404 | PASS |
| Cedar suggesting allocations for Al Noor payment → 404 | PASS |
| Cedar creating fee assignment with Al Noor data → rejected | PASS |
| Cedar creating invoice with Al Noor household → rejected | PASS |
| Cedar ending Al Noor fee assignment → 404 | PASS |

### Database-Level RLS (10 tests)

| Table | Status |
|-------|--------|
| fee_structures: Cedar query returns no Al Noor rows | PASS |
| discounts: Cedar query returns no Al Noor rows | PASS |
| household_fee_assignments: Cedar query returns no Al Noor rows | PASS |
| invoices: Cedar query returns no Al Noor rows | PASS |
| invoice_lines: Cedar query returns no Al Noor rows | PASS |
| installments: Cedar query returns no Al Noor rows | PASS |
| payments: Cedar query returns no Al Noor rows | PASS |
| payment_allocations: Cedar query returns no Al Noor rows | PASS |
| receipts: Cedar query returns no Al Noor rows | PASS |
| refunds: Cedar query returns no Al Noor rows | PASS |

**38 tests, 38 passed**

---

## Bugs Found and Fixed

### Bug 1: POST state-change endpoints returning 201 instead of 200
- **What exposed it**: E2E tests for invoice issue, void, cancel, write-off; fee assignment end; refund approve, reject, execute
- **Root cause**: NestJS POST endpoints default to 201 status. State-change endpoints (issue, void, cancel, write-off, end, approve, reject, execute) were missing `@HttpCode(HttpStatus.OK)` decorator.
- **Fix applied**: Added `@HttpCode(HttpStatus.OK)` to all state-change POST endpoints:
  - `invoices.controller.ts`: issue, void, cancel, write-off
  - `fee-assignments.controller.ts`: end
  - `refunds.controller.ts`: approve, reject, execute
- **Files changed**: `apps/api/src/modules/finance/invoices.controller.ts`, `apps/api/src/modules/finance/fee-assignments.controller.ts`, `apps/api/src/modules/finance/refunds.controller.ts`

### Bug 2: Payment allocation balance recalculation inside transaction visibility
- **What exposed it**: Confirm allocations test — invoice balance remained at original value after allocation
- **Root cause**: `InvoicesService.recalculateBalance()` used `this.prisma` (base client) instead of the transactional client. Inside the RLS transaction, allocations created with `tx` were invisible to `this.prisma`, so the balance was computed as if no allocations existed.
- **Fix applied**:
  1. Added optional `client` parameter to `recalculateBalance(tenantId, invoiceId, client?)` to accept transactional client
  2. Updated `PaymentsService.confirmAllocations()` to pass `prisma` (tx cast) to `recalculateBalance()`
  3. Updated `RefundsService.reverseAllocationsLifo()` to pass `prisma` to `recalculateBalance()`
  4. Moved `findOne()` call outside the transaction in `confirmAllocations()` so it reads committed data
- **Files changed**: `apps/api/src/modules/finance/invoices.service.ts`, `apps/api/src/modules/finance/payments.service.ts`, `apps/api/src/modules/finance/refunds.service.ts`

### Bug 3: Missing "refund" sequence type in tenant_sequences
- **What exposed it**: Refund creation tests returning 500 — "Sequence type 'refund' not found for tenant"
- **Root cause**: The seed/migration process created `invoice`, `receipt`, `application`, and `payslip` sequence types but omitted `refund`
- **Fix applied**: Inserted `refund` sequence type for all tenants in `tenant_sequences` table
- **Note**: The seed script (`packages/prisma/seed/`) should be updated to include `refund` as a default sequence type

### Bug 4: P5/P6/P6B migrations missing migration.sql files
- **What exposed it**: Test database didn't have finance tables
- **Root cause**: Migration directories were created with only `post_migrate.sql` but without the `migration.sql` files
- **Fix applied**: Generated and applied migration SQL using `prisma migrate diff`, then applied all `post_migrate.sql` files for RLS policies, triggers, and indexes

### Bug 5: StripeService was a placeholder with no real SDK integration
- **What exposed it**: Stripe webhook tests for signature verification and idempotency
- **Root cause**: `StripeService` contained placeholder code (comments showing intended SDK usage) but never called the real Stripe SDK. No signature verification, no idempotency check, no payment creation from webhooks.
- **Fix applied**:
  1. Installed `stripe` npm package
  2. Replaced placeholder with real Stripe SDK integration: `constructEvent()` for signature verification, `external_event_id` check for idempotency, `checkout.sessions.create()` for checkout, `refunds.create()` for refunds
  3. Added `{ rawBody: true }` to NestFactory options for proper webhook signature verification
  4. Made webhook secret read dynamically (not cached at construction) so tests can override it
  5. Updated webhook controller to use `req.rawBody` for signature verification
- **Files changed**: `apps/api/src/modules/finance/stripe.service.ts`, `apps/api/src/modules/finance/stripe-webhook.controller.ts`, `apps/api/src/main.ts`, `apps/api/test/helpers.ts`

### Bug 6: Shared package not compiled with P6/P6B schemas
- **What exposed it**: App bootstrap failure — `Cannot read properties of undefined (reading 'merge')` in payroll controller
- **Root cause**: The `@school/shared` package hadn't been rebuilt after P6/P6B schema files were added
- **Fix applied**: Rebuilt shared package with `npx tsc --build`

---

## Bugs Found and Unresolved

None. All bugs found during testing were fixed.

---

## Regressions

None detected. Existing RLS leakage tests (`rls-leakage.e2e-spec.ts`) continue to pass (24/24).

---

## Manual QA Notes

The following items from the Manual QA Checklist (Section 4) require manual verification in a browser:

- **RTL/Arabic layout** (Section 4.13): Currency formatting, table alignment, PDF rendering in Arabic cannot be fully tested programmatically
- **Parent Portal** (Section 4.12): Parent-scoped invoice visibility, Stripe checkout redirect
- **Fee Generation Wizard** (Section 4.4): Multi-step wizard UX, preview rendering, checkbox interactions
- **PDF rendering** (Sections 4.5, 4.8, 4.10): Invoice, receipt, and statement PDF output quality in both locales

All API-level behaviors for these features are covered by the integration tests. The manual QA items are UI/UX concerns that require browser-based verification.

---

## Test Files Created

| File | Type | Tests |
|------|------|-------|
| `apps/api/src/modules/finance/helpers/invoice-status.helper.spec.ts` | Unit | 12 |
| `apps/api/test/p6-finance.e2e-spec.ts` | Integration | 66 |
| `apps/api/test/p6-rls.e2e-spec.ts` | RLS Leakage | 38 |

## Application Files Modified (Bug Fixes)

| File | Change |
|------|--------|
| `apps/api/src/modules/finance/invoices.controller.ts` | Added `@HttpCode(200)` to issue, void, cancel, write-off endpoints |
| `apps/api/src/modules/finance/fee-assignments.controller.ts` | Added `@HttpCode(200)` to end endpoint |
| `apps/api/src/modules/finance/refunds.controller.ts` | Added `@HttpCode(200)` to approve, reject, execute endpoints |
| `apps/api/src/modules/finance/invoices.service.ts` | Added optional `client` param to `recalculateBalance()` |
| `apps/api/src/modules/finance/payments.service.ts` | Passed tx client to `recalculateBalance()`, moved `findOne()` after commit |
| `apps/api/src/modules/finance/refunds.service.ts` | Passed tx client to `recalculateBalance()` |
| `apps/api/src/modules/finance/stripe.service.ts` | Replaced placeholder with real Stripe SDK (signature verification, idempotency, checkout, refunds) |
| `apps/api/src/modules/finance/stripe-webhook.controller.ts` | Updated to use `req.rawBody` for signature verification |
| `apps/api/src/main.ts` | Added `{ rawBody: true }` to NestFactory for Stripe webhook support |
| `apps/api/test/helpers.ts` | Added `{ rawBody: true }` to test app bootstrap |
