# Finance Module — Integration Test Specification

**Module:** Finance (all 19 tenant-scoped tables, all 90+ admin endpoints, all parent-portal endpoints, Stripe webhook)
**Spec type:** Integration — RLS leakage matrix, API contracts, webhooks, DB invariants, concurrency, transaction boundaries, encrypted fields, PDF assertions
**Target harness:** Jest + supertest (or equivalent). Every row is a machine-executable test case.
**Last updated:** 2026-04-12
**Baseline commit:** `384ba761`

---

## Table of Contents

1. [Prerequisites & Fixture Seeding](#1-prerequisites--fixture-seeding)
2. [RLS Leakage Matrix (19 tenant-scoped tables × 6 scenarios)](#2-rls-leakage-matrix-19-tenant-scoped-tables--6-scenarios)
3. [API Contract Matrix — Admin Endpoints](#3-api-contract-matrix--admin-endpoints)
4. [API Contract Matrix — Parent Endpoints](#4-api-contract-matrix--parent-endpoints)
5. [Stripe Webhook Suite](#5-stripe-webhook-suite)
6. [Data Invariant Queries](#6-data-invariant-queries)
7. [Concurrency & Race-Condition Tests](#7-concurrency--race-condition-tests)
8. [Transaction Boundary Tests](#8-transaction-boundary-tests)
9. [Encrypted Field Access Control](#9-encrypted-field-access-control)
10. [PDF / Binary Content Assertions](#10-pdf--binary-content-assertions)
11. [State Machine Transition Matrix (Invalid Transitions)](#11-state-machine-transition-matrix-invalid-transitions)
12. [Observations & Gaps](#12-observations--gaps)
13. [Sign-Off](#13-sign-off)

---

## 1. Prerequisites & Fixture Seeding

### Two-tenant fixture (mandatory)

**Tenant A** (`tenant_a`) — reference seed via `scripts/seed-finance-tenant-a.ts`:

- Currency `EUR`; branding prefixes `INV` / `REC`
- `tenant_stripe_configs` row with test keys (`sk_test_A...`, `whsec_A...`) encrypted via `EncryptionService`
- 20 households (`H-A1`..`H-A20`), 40 students across YG-A + YG-B
- 20 invoices with `invoice_number` `INV-202604-000001`..`INV-202604-000020`; statuses distributed across all 9 states
- 12 payments (5 stripe, 4 cash, 2 bank_transfer, 1 card_manual); statuses across all 6 states
- 4 refunds across states
- 3 credit notes (1 open, 1 partially_used, 1 fully_used)
- 3 scholarships; 2 payment plans (1 pending, 1 approved)
- `admin_a@tenant-a.local` with `finance.*`; `teacher_a@tenant-a.local` with no finance.\*; `parent_a@tenant-a.local` linked to `H-A1`

**Tenant B** (`tenant_b`) — reference seed via `scripts/seed-finance-tenant-b.ts`:

- Currency `USD`; branding prefixes `BIL` / `RCT`
- `tenant_stripe_configs.stripe_enabled = false` (no encrypted keys)
- 50 households, 100 students
- 50 invoices `BIL-202604-000001`..`BIL-202604-000050`
- 15 payments, 6 refunds, 2 credit notes, 1 scholarship
- `admin_b@tenant-b.local` with `finance.*`; `parent_b@tenant-b.local` linked to `H-B1`

### Deterministic IDs

Seed uses `uuid v5` with a fixed namespace so the same seed always produces the same IDs. Spec rows reference IDs by handle (e.g., `INV-A1-ID` maps to a known uuid).

### Environment

- Postgres 15; Redis 7; Node 20.x
- `jest --runInBand --detectOpenHandles` for all integration tests
- `DATABASE_URL` points to the integration test DB; each test suite begins with `TRUNCATE` + re-seed
- RLS is enforced at the DB layer via `SET LOCAL app.current_tenant_id` in the middleware — tests must NEVER run with `ROLE superuser`

---

## 2. RLS Leakage Matrix (19 tenant-scoped tables × 6 scenarios)

**Tables covered:** invoices, invoice_lines, installments, payments, payment_allocations, refunds, receipts, credit_notes, credit_note_applications, fee_types, fee_structures, household_fee_assignments, discounts, scholarships, late_fee_configs, late_fee_applications, recurring_invoice_configs, payment_plan_requests, invoice_reminders.

Every table runs these six scenarios (19 × 6 = 114 rows):

### Scenario template

| #   | What to run                                                                                                                          | Expected result                                                                                                                                    | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| S1  | As admin_a, list {table} (via corresponding list endpoint OR direct Prisma read with `SET LOCAL app.current_tenant_id = 'tenant_a'`) | Response contains only Tenant A rows. Count matches fixture. Zero Tenant B rows leaked.                                                            |           |
| S2  | As admin_b, list same table                                                                                                          | Only Tenant B rows.                                                                                                                                |           |
| S3  | As admin_a, GET detail endpoint for a known Tenant B id                                                                              | 404 `*_NOT_FOUND`. Never 200 with B data.                                                                                                          |           |
| S4  | As admin_a, PATCH/DELETE a known Tenant B id                                                                                         | 404 with no side effect. Verify via `SELECT * FROM {table} WHERE id=<B-id>` unchanged.                                                             |           |
| S5  | As admin_a, POST with body `tenant_id: <tenant_b_id>`                                                                                | Either 400 (Zod rejects extra field) OR silently overwritten with Tenant A's id. Verify via post-create SELECT the row has tenant_id = tenant_a.   |           |
| S6  | Per-tenant numbering                                                                                                                 | For sequence-using tables (invoices, receipts, credit_notes, refunds): `INV-A-1` and `BIL-B-1` coexist — neither tenant sees the other's sequence. |           |

### Per-table rows (complete grid)

| #    | Table                     | S1  | S2  | S3  | S4  | S5  | S6  |
| ---- | ------------------------- | --- | --- | --- | --- | --- | --- |
| 2.1  | invoices                  | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| 2.2  | invoice_lines             | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.3  | installments              | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.4  | payments                  | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| 2.5  | payment_allocations       | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.6  | refunds                   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| 2.7  | receipts                  | ✓   | ✓   | ✓   | n/a | ✓   | ✓   |
| 2.8  | credit_notes              | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| 2.9  | credit_note_applications  | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.10 | fee_types                 | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.11 | fee_structures            | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.12 | household_fee_assignments | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.13 | discounts                 | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.14 | scholarships              | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.15 | late_fee_configs          | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.16 | late_fee_applications     | ✓   | ✓   | ✓   | n/a | ✓   | n/a |
| 2.17 | recurring_invoice_configs | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.18 | payment_plan_requests     | ✓   | ✓   | ✓   | ✓   | ✓   | n/a |
| 2.19 | invoice_reminders         | ✓   | ✓   | ✓   | n/a | ✓   | n/a |

### RLS enforcement verification

| #    | What to run                                                                                                 | Expected result                                                                                               | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| 2.20 | Connect as role without `BYPASSRLS`, run `SELECT * FROM invoices` without `SET LOCAL app.current_tenant_id` | Zero rows returned (policy filters everything out).                                                           |           |
| 2.21 | Run `SELECT * FROM invoices` with `SET LOCAL app.current_tenant_id='invalid-uuid'`                          | Query errors or returns zero rows.                                                                            |           |
| 2.22 | Every table `has FORCE ROW LEVEL SECURITY`                                                                  | `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY(...) AND rowsecurity = true`.  |           |
| 2.23 | Every finance table policy name matches `{table}_tenant_isolation`                                          | `SELECT policyname FROM pg_policies WHERE tablename = ANY(...)` returns the expected names for all 19 tables. |           |

### Parent-side RLS enforcement

| #    | What to run                                                                                                        | Expected result                                                                                        | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------- |
| 2.24 | As `parent_a` (linked to H-A1), call `GET /v1/parent/students/<SA1>/finances`                                      | Returns only H-A1's invoices + payments. Zero other-household data. `household_id` in response = H-A1. |           |
| 2.25 | As parent_a, call `GET /v1/parent/students/<SA2>/finances` where SA2 is in H-A2 (different household, same tenant) | 403 `NOT_LINKED_TO_STUDENT`.                                                                           |           |
| 2.26 | As parent_a, call `GET /v1/parent/students/<SB1>/finances` where SB1 is in Tenant B                                | 404 or 403 — never 200.                                                                                |           |
| 2.27 | As parent_a, POST `/v1/parent/invoices/<INV-H-A2-ID>/pay`                                                          | 403 `INVOICE_ACCESS_DENIED`.                                                                           |           |
| 2.28 | As parent_a, POST `/v1/parent/invoices/<INV-B-ID>/pay`                                                             | 403 `INVOICE_ACCESS_DENIED` (parent isn't even in Tenant B).                                           |           |
| 2.29 | As parent_a, POST `/v1/parent/payment-plans/<PLAN-OTHER-PARENT-ID>/accept`                                         | 403 or 404.                                                                                            |           |

---

## 3. API Contract Matrix — Admin Endpoints

Each admin endpoint gets: happy path + every Zod boundary + permission denial + existence check + conflict / optimistic concurrency where applicable.

### 3A. Invoices controller

| #     | Endpoint / Input                                                                                                   | Expected result                                                                                                                                     | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3A.1  | `POST /v1/finance/invoices` with valid `{ household_id, due_date, lines: [{description, quantity, unit_amount}] }` | 201; response `{ data: { id, invoice_number, status: 'draft', total_amount, balance_amount, currency_code, ... } }`. `total_amount = Σ line_total`. |           |
| 3A.2  | POST with missing `household_id`                                                                                   | 400 `VALIDATION_ERROR` — Zod `household_id: required`.                                                                                              |           |
| 3A.3  | POST with `due_date` malformed (`"tomorrow"`)                                                                      | 400 `VALIDATION_ERROR` with Zod date-format error.                                                                                                  |           |
| 3A.4  | POST with empty `lines: []`                                                                                        | 400 — schema requires min 1 line.                                                                                                                   |           |
| 3A.5  | POST with `lines[0].quantity = -1`                                                                                 | 400 — positive-required refine.                                                                                                                     |           |
| 3A.6  | POST with `lines[0].unit_amount = 0`                                                                               | 400 — positive-required refine.                                                                                                                     |           |
| 3A.7  | POST with `household_id = <nonexistent-uuid>`                                                                      | 400 `HOUSEHOLD_NOT_FOUND`.                                                                                                                          |           |
| 3A.8  | POST as teacher (no `finance.manage`)                                                                              | 403 `FORBIDDEN`.                                                                                                                                    |           |
| 3A.9  | POST without auth                                                                                                  | 401 `UNAUTHORIZED`.                                                                                                                                 |           |
| 3A.10 | GET `/v1/finance/invoices/<invalid-uuid>`                                                                          | 400 `INVALID_UUID` (ParseUUIDPipe).                                                                                                                 |           |
| 3A.11 | GET `/v1/finance/invoices/<nonexistent>`                                                                           | 404 `INVOICE_NOT_FOUND`.                                                                                                                            |           |
| 3A.12 | PATCH `/v1/finance/invoices/:id` with valid update                                                                 | 200 with updated row. `updated_at` bumped.                                                                                                          |           |
| 3A.13 | PATCH with `expected_updated_at` older than current                                                                | 409 `CONCURRENT_MODIFICATION`.                                                                                                                      |           |
| 3A.14 | PATCH when status != draft                                                                                         | 400 `INVALID_STATUS` (cannot edit issued/paid/etc.).                                                                                                |           |
| 3A.15 | POST `/v1/finance/invoices/:id/issue` on draft + approval required                                                 | 200; status → `pending_approval`; `approval_requests` row created.                                                                                  |           |
| 3A.16 | POST /issue on draft + no approval required                                                                        | 200; status → `issued`; `issue_date` set.                                                                                                           |           |
| 3A.17 | POST /issue on already-issued                                                                                      | 400 `INVALID_STATUS_TRANSITION`.                                                                                                                    |           |
| 3A.18 | POST /void on issued                                                                                               | 200; balance cleared; status → `void`.                                                                                                              |           |
| 3A.19 | POST /void on already-void                                                                                         | 400 `INVOICE_VOID_OR_WRITTEN_OFF`.                                                                                                                  |           |
| 3A.20 | POST /cancel on non-draft                                                                                          | 400 `INVALID_STATUS_TRANSITION`.                                                                                                                    |           |
| 3A.21 | POST /write-off with empty `write_off_reason`                                                                      | 400 `VALIDATION_ERROR`.                                                                                                                             |           |
| 3A.22 | POST /write-off on paid/cancelled                                                                                  | 400 `INVALID_STATUS_TRANSITION`.                                                                                                                    |           |
| 3A.23 | POST /installments with valid `installments: [...]`                                                                | 201; replaces existing installments; returns new list.                                                                                              |           |
| 3A.24 | POST /installments with invoice not found                                                                          | 404 `INVOICE_NOT_FOUND`.                                                                                                                            |           |
| 3A.25 | DELETE /installments on invoice with no installments                                                               | 200 with `deleted: 0` (idempotent).                                                                                                                 |           |
| 3A.26 | GET `/v1/finance/invoices?status=invalid_value`                                                                    | 400 Zod enum violation.                                                                                                                             |           |
| 3A.27 | GET `/v1/finance/invoices?pageSize=1000`                                                                           | Either clamped to 100 OR 400 `VALIDATION_ERROR` — per `invoiceQuerySchema`.                                                                         |           |
| 3A.28 | GET with CSV status: `?status=issued,overdue`                                                                      | 200 with rows matching either status.                                                                                                               |           |

### 3B. Payments controller

| #     | Endpoint / Input                                                                                               | Expected result                                                                                                         | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 3B.1  | `POST /v1/finance/payments` with valid `{ household_id, payment_method: 'cash', amount, received_at, reason }` | 201; `status='pending'`; payment_reference auto-generated (e.g., `REC-202604-000001`); no allocations yet.              |           |
| 3B.2  | POST with `payment_method: 'stripe'` (manual shouldn't accept stripe)                                          | 400 Zod — `createPaymentSchema` enum excludes stripe for manual path.                                                   |           |
| 3B.3  | POST with `amount = 0`                                                                                         | 400 `VALIDATION_ERROR`.                                                                                                 |           |
| 3B.4  | POST with `amount = -10`                                                                                       | 400.                                                                                                                    |           |
| 3B.5  | POST with `received_at` in the far future (e.g., year 2099)                                                    | 200 OR 400 — confirm product intent (business-logic test in /e2e-security-audit).                                       |           |
| 3B.6  | POST with `received_at` malformed                                                                              | 400.                                                                                                                    |           |
| 3B.7  | GET `/v1/finance/payments/staff` as `finance.view` only                                                        | 403 (requires `finance.manage` per the tightened guard).                                                                |           |
| 3B.8  | GET /payments/staff as `finance.manage`                                                                        | 200; returns staff who can accept payments.                                                                             |           |
| 3B.9  | GET `/v1/finance/payments/:id/allocations/suggest`                                                             | 200; returns suggested allocations for the payment's household.                                                         |           |
| 3B.10 | POST allocations with sum > payment.amount                                                                     | 400 `ALLOCATION_EXCEEDS_PAYMENT`.                                                                                       |           |
| 3B.11 | POST allocations with invoice belonging to different household                                                 | 400 `HOUSEHOLD_MISMATCH`.                                                                                               |           |
| 3B.12 | POST allocations with invoice balance insufficient                                                             | 400 `ALLOCATION_EXCEEDS_BALANCE`.                                                                                       |           |
| 3B.13 | POST allocations happy path                                                                                    | 201; payment.status → `posted`; invoice.balance decreased; invoice.status may transition to `partially_paid` or `paid`. |           |
| 3B.14 | GET receipt for payment with no receipt row                                                                    | 200 — receipt auto-created in manual payment flow; confirm via DB.                                                      |           |
| 3B.15 | GET receipt/pdf                                                                                                | 200, Content-Type `application/pdf`, Content-Disposition `inline; filename="receipt-REC-YYYYMM-NNNNNN.pdf"`. See §10.   |           |

### 3C. Refunds controller

| #     | Endpoint / Input                                                                   | Expected result                                                                                            | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| 3C.1  | `POST /v1/finance/refunds` with `{ payment_id, amount, reason }` on posted payment | 201; status `pending_approval`; refund_reference generated.                                                |           |
| 3C.2  | POST with amount > (payment.amount - already_refunded)                             | 400 `AMOUNT_EXCEEDS_AVAILABLE`.                                                                            |           |
| 3C.3  | POST on pending payment                                                            | 400 `INVALID_PAYMENT_STATUS`.                                                                              |           |
| 3C.4  | POST on voided/failed payment                                                      | 400 `INVALID_PAYMENT_STATUS`.                                                                              |           |
| 3C.5  | POST /approve on pending_approval                                                  | 200; status → `approved`. approval_comment optional.                                                       |           |
| 3C.6  | POST /approve by the same user who requested                                       | 403 `CANNOT_APPROVE_OWN_REFUND` (backend enforces).                                                        |           |
| 3C.7  | POST /reject with empty comment                                                    | 400 — `refundRejectionCommentSchema` requires min 1 char.                                                  |           |
| 3C.8  | POST /reject valid                                                                 | 200; status → `rejected`. Comment stored.                                                                  |           |
| 3C.9  | POST /execute on approved + cash-method payment                                    | 200; status → `executed`; payment status transitions per §3B.                                              |           |
| 3C.10 | POST /execute on approved + stripe-method payment                                  | Stripe refund API called; on success → executed. Use Stripe mock in tests; real Stripe covered separately. |           |
| 3C.11 | POST /execute — Stripe returns error                                               | Status → `failed`; `failure_reason` stored. Thrown as `STRIPE_REFUND_FAILED`.                              |           |
| 3C.12 | POST /execute on pending_approval                                                  | 400 `INVALID_STATUS`.                                                                                      |           |
| 3C.13 | POST /execute on already-executed                                                  | 400 `INVALID_STATUS`.                                                                                      |           |

### 3D. Credit notes controller

| #     | Endpoint / Input                                                   | Expected result                                                                                   | Pass/Fail |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------- |
| 3D.1  | `POST /v1/finance/credit-notes` `{ household_id, amount, reason }` | 201; remaining_balance = amount; status `open`; credit_note_number generated.                     |           |
| 3D.2  | POST with `amount = 0`                                             | 400.                                                                                              |           |
| 3D.3  | POST with `reason` > 2000 chars                                    | 400 Zod max length.                                                                               |           |
| 3D.4  | `POST /v1/finance/credit-notes/apply` valid                        | 201; application created; credit_note.remaining_balance decremented; invoice.balance decremented. |           |
| 3D.5  | Apply amount > credit_note.remaining_balance                       | 400 `INSUFFICIENT_CREDIT_BALANCE`.                                                                |           |
| 3D.6  | Apply to invoice.balance < applied_amount                          | Backend should reject with 400 — confirm. (Over-application could create negative balance.)       |           |
| 3D.7  | Apply on fully_used credit note                                    | 400 `INSUFFICIENT_CREDIT_BALANCE`.                                                                |           |
| 3D.8  | Apply on cancelled credit note                                     | 400 `INVALID_CREDIT_NOTE_STATUS`.                                                                 |           |
| 3D.9  | Apply to paid invoice                                              | 400 `INVALID_INVOICE_STATUS`.                                                                     |           |
| 3D.10 | Apply to void/cancelled/written_off invoice                        | 400 `INVALID_INVOICE_STATUS`.                                                                     |           |

### 3E. Scholarships / discounts / fee-types / fee-structures / fee-assignments controllers

| #     | Endpoint / Input                                                       | Expected result                                                 | Pass/Fail |
| ----- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| 3E.1  | `POST /v1/finance/discounts` with `discount_type='percent', value=150` | 400 `VALIDATION_ERROR` (percent refine max 100).                |           |
| 3E.2  | PATCH discount with `value=150`                                        | 400 (update schema also has the refine).                        |           |
| 3E.3  | POST discount with `auto_apply=true` missing `auto_condition`          | 400 (`autoApplyNeedsCondition` refine).                         |           |
| 3E.4  | POST discount duplicate name                                           | 409 `DUPLICATE_NAME`.                                           |           |
| 3E.5  | POST scholarship with `discount_type='percent', value=101`             | 400 (percent refine).                                           |           |
| 3E.6  | POST scholarship on nonexistent student                                | 400 `STUDENT_NOT_FOUND`.                                        |           |
| 3E.7  | POST scholarship with `renewal_date < award_date`                      | 400 (refine — if product enforces; else documented as allowed). |           |
| 3E.8  | POST /scholarships/:id/revoke with empty `reason`                      | 400.                                                            |           |
| 3E.9  | POST fee-type duplicate name                                           | 409 `DUPLICATE_NAME`.                                           |           |
| 3E.10 | DELETE fee-type with dependent fee-structures                          | 409 `FEE_STRUCTURES_EXIST`.                                     |           |
| 3E.11 | DELETE fee-structure with active fee-assignments                       | 409 `ACTIVE_ASSIGNMENTS_EXIST`.                                 |           |
| 3E.12 | POST fee-assignment duplicate triad                                    | 409 `DUPLICATE_ASSIGNMENT`.                                     |           |
| 3E.13 | POST fee-assignment with inactive fee-structure                        | 400 `FEE_STRUCTURE_INACTIVE`.                                   |           |

### 3F. Fee generation / late fees / recurring / reminders / bulk

| #     | Endpoint / Input                                                                           | Expected result                                                                                                                                 | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3F.1  | `POST /v1/finance/fee-generation/preview` with `billing_period_end < billing_period_start` | 400 `VALIDATION_ERROR` — date-ordering refine.                                                                                                  |           |
| 3F.2  | Preview with `due_date < billing_period_start`                                             | 400 refine.                                                                                                                                     |           |
| 3F.3  | Preview happy path                                                                         | 200; returns household-line preview.                                                                                                            |           |
| 3F.4  | Confirm — idempotent re-run                                                                | Second call with same (year_group, billing_period_start) returns `{ generated: 0 }` — no duplicate invoices.                                    |           |
| 3F.5  | Apply late fee on non-overdue invoice (within grace)                                       | 400 `WITHIN_GRACE_PERIOD`.                                                                                                                      |           |
| 3F.6  | Apply late fee — max_applications reached                                                  | 400 `MAX_LATE_FEE_APPLICATIONS_REACHED`.                                                                                                        |           |
| 3F.7  | Apply late fee — frequency_days not elapsed                                                | 400 `TOO_SOON_FOR_NEXT_APPLICATION`.                                                                                                            |           |
| 3F.8  | Apply late fee fixed                                                                       | Line added `"Late fee: {config.name}", unit_amount=value`. invoice.total + balance incremented.                                                 |           |
| 3F.9  | Apply late fee percent                                                                     | `lateFeeAmount = roundMoney(invoice.total * value/100)`.                                                                                        |           |
| 3F.10 | POST `/recurring-configs/generate` with `autoIssueRecurringInvoices=false`                 | New invoices `status='draft'`, `issue_date=null`. `last_generated_at=now`. next_generation_date advanced (+1 month for monthly, +90d for term). |           |
| 3F.11 | Reminders — `paymentReminderEnabled=false`                                                 | `{ sent: 0 }`; no reminder rows inserted.                                                                                                       |           |
| 3F.12 | Reminders dedup                                                                            | Same invoice with existing `due_soon` reminder → not included in second call.                                                                   |           |
| 3F.13 | Bulk issue with 201 ids                                                                    | 400 `VALIDATION_ERROR` (max 200).                                                                                                               |           |
| 3F.14 | Bulk issue with 100 ids, 5 invalid                                                         | 200 with `{ succeeded: [...95 ids...], failed: [{id, reason}, ...] }`.                                                                          |           |

### 3G. Reports, dashboard, audit, statements

| #     | Endpoint                                                  | Expected result                                                                   | Pass/Fail |
| ----- | --------------------------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| 3G.1  | `GET /v1/finance/reports/aging?date_from=&date_to=`       | Aging buckets; sum per bucket matches SQL aggregate.                              |           |
| 3G.2  | `GET /reports/custom` with malformed CSV `year_group_ids` | Preprocess parses safely or returns 400.                                          |           |
| 3G.3  | `GET /reports/fee-structure-performance`                  | Ignores date params per product contract; cache key omits them.                   |           |
| 3G.4  | `GET /dashboard`                                          | Returns single envelope with all KPIs + aging + debt breakdown + recent payments. |           |
| 3G.5  | `GET /dashboard/currency`                                 | `{ data: { currency_code: 'EUR' } }`.                                             |           |
| 3G.6  | `PATCH /dashboard/currency` with valid code               | 200; tenant.currency_code updated.                                                |           |
| 3G.7  | `PATCH /dashboard/currency` with 2-char code              | 400 `VALIDATION_ERROR`.                                                           |           |
| 3G.8  | `GET /audit-trail?entity_type=invalid`                    | 400 Zod enum.                                                                     |           |
| 3G.9  | `GET /audit-trail` pagination = 25 per page               | `meta.pageSize = 25`.                                                             |           |
| 3G.10 | `GET /household-statements/:id`                           | Response contains household + opening_balance + entries[] + closing_balance.      |           |
| 3G.11 | `GET /household-statements/:id?date_to=2026-04-12`        | `date_to` parsed as `2026-04-12T23:59:59.999Z`.                                   |           |

---

## 4. API Contract Matrix — Parent Endpoints

| #    | Endpoint / Input                                                                              | Expected result                                                                                                                                                                                | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1  | `GET /v1/parent/students/:studentId/finances` as parent linked to student                     | 200; `{ household_id, household_name, total_outstanding_balance, invoices, payment_history }`. Invoices exclude draft + pending*approval. Payments only show posted/refunded*\*.               |           |
| 4.2  | `GET /v1/parent/students/:studentId/finances` as parent NOT linked                            | 403 `NOT_LINKED_TO_STUDENT`.                                                                                                                                                                   |           |
| 4.3  | `POST /v1/parent/invoices/:id/pay` with valid `{ success_url, cancel_url }` on issued invoice | 200; `{ session_id, checkout_url }`. Stripe session created with metadata `{ tenant_id, invoice_id, household_id }`.                                                                           |           |
| 4.4  | POST /pay on draft/pending_approval/void/paid invoice                                         | 400 `INVALID_STATUS` or `INVOICE_ALREADY_PAID`.                                                                                                                                                |           |
| 4.5  | POST /pay on stripe_enabled=false tenant                                                      | 400 `STRIPE_NOT_CONFIGURED`.                                                                                                                                                                   |           |
| 4.6  | POST /pay with missing `success_url`                                                          | 400 `VALIDATION_ERROR` (checkoutSessionSchema).                                                                                                                                                |           |
| 4.7  | POST /pay with non-URL `success_url` (e.g., `"not a url"`)                                    | 400.                                                                                                                                                                                           |           |
| 4.8  | POST /pay on other household's invoice                                                        | 403 `INVOICE_ACCESS_DENIED`.                                                                                                                                                                   |           |
| 4.9  | POST /pay on cross-tenant invoice                                                             | 403 or 404.                                                                                                                                                                                    |           |
| 4.10 | `POST /v1/parent/invoices/:id/request-payment-plan` valid                                     | 201; request created with status `pending`.                                                                                                                                                    |           |
| 4.11 | POST request-plan with empty `proposed_installments`                                          | 400.                                                                                                                                                                                           |           |
| 4.12 | POST request-plan with installments sum ≠ invoice.balance_amount                              | 400 `INSTALLMENT_SUM_MISMATCH`.                                                                                                                                                                |           |
| 4.13 | POST request-plan twice for same invoice                                                      | Second call 409 `PENDING_REQUEST_EXISTS`.                                                                                                                                                      |           |
| 4.14 | POST /v1/parent/payment-plans/:id/accept by the originating parent on counter_offered plan    | 200; status → `approved`.                                                                                                                                                                      |           |
| 4.15 | POST accept by different parent                                                               | 403 or 404.                                                                                                                                                                                    |           |
| 4.16 | POST accept on non-counter_offered plan                                                       | 400 `INVALID_STATUS`.                                                                                                                                                                          |           |
| 4.17 | Parent without `parent.view_finances` permission                                              | 403 on all parent endpoints.                                                                                                                                                                   |           |
| 4.18 | Parent without `parent.make_payments`                                                         | 403 on POST /pay only.                                                                                                                                                                         |           |
| 4.19 | Expired parent JWT                                                                            | 401.                                                                                                                                                                                           |           |
| 4.20 | **Frontend-claimed endpoints (should 404 until backend is fixed — see admin spec §50.1)**     | `GET /v1/parent/finances`, `POST /v1/parent/finances/invoices/:id/checkout`, `GET /v1/parent/finances/payments/:id/receipt`, `POST /v1/parent/finances/payment-plan-requests` → 404 NOT_FOUND. |           |

---

## 5. Stripe Webhook Suite

Endpoint: `POST /v1/stripe/webhook` (no auth guard; `@SkipThrottle`; raw body required).

### Signature & tenant checks

| #   | What to run                                                                        | Expected result                                              | Pass/Fail |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------- |
| 5.1 | POST with no `stripe-signature` header                                             | 400 `INVALID_SIGNATURE`.                                     |           |
| 5.2 | POST with valid body but wrong-secret signature                                    | 400 `INVALID_SIGNATURE`.                                     |           |
| 5.3 | POST with valid signature, event body missing `metadata.tenant_id`                 | 400 `MISSING_TENANT_ID`.                                     |           |
| 5.4 | POST with metadata `tenant_id` that doesn't match any tenant                       | 400 `TENANT_MISMATCH` or 404 `TENANT_NOT_FOUND`.             |           |
| 5.5 | Raw-body integrity — send JSON.stringify re-serialised body with a fresh signature | 400 `INVALID_SIGNATURE` — body ≠ raw, signature check fails. |           |
| 5.6 | High-frequency burst (10 req/sec sustained)                                        | All 200; @SkipThrottle prevents 429.                         |           |

### Event-type routing

| #    | Event                                                  | What to run                                                             | Expected result                                                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.7  | `checkout.session.completed`                           | Post with valid event referencing invoice-A1                            | 200. `payments` row created (status `posted`, method `stripe`, external_event_id = event.id). Allocation to invoice-A1. Invoice transitions to paid/partially_paid. Receipt row created. |           |
| 5.8  | Duplicate `checkout.session.completed` (same event.id) | Post the identical event a second time                                  | 200. No duplicate payment row. Idempotent via `external_event_id` unique constraint.                                                                                                     |           |
| 5.9  | `checkout.session.expired`                             | Post                                                                    | 200. No payment created. Optionally logs the expiration.                                                                                                                                 |           |
| 5.10 | `charge.refunded`                                      | Post referencing payment                                                | 200. payment status → `refunded_partial` or `refunded_full`. Refund row updated with executed state.                                                                                     |           |
| 5.11 | Duplicate `charge.refunded`                            | Post identical event twice                                              | Idempotent; no duplicate refund row.                                                                                                                                                     |           |
| 5.12 | `payment_intent.payment_failed`                        | Post                                                                    | 200. Logged. No payment row; optionally set any pending payment to `failed`.                                                                                                             |           |
| 5.13 | Unknown event type (e.g., `invoice.created`)           | Post                                                                    | 200. Event logged and ignored. No DB writes.                                                                                                                                             |           |
| 5.14 | Amount metadata mismatch                               | Event says invoice balance is €100 but event.data.amount = 500000 cents | 400 `AMOUNT_MISMATCH_METADATA` OR reconciled; document expected.                                                                                                                         |           |
| 5.15 | Missing external id on charge.refunded                 | Post event lacking `payment_intent`                                     | 400 `MISSING_EXTERNAL_ID`.                                                                                                                                                               |           |

### Post-conditions per webhook

| #    | What to check                                            | Query / assertion                                                                                                                              | Pass/Fail |
| ---- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.16 | After checkout.session.completed, new payment row        | `SELECT * FROM payments WHERE external_event_id=?` returns exactly 1 row with expected amount + currency.                                      |           |
| 5.17 | After checkout.session.completed, allocation row         | `SELECT * FROM payment_allocations WHERE payment_id=?` returns 1 row matching invoice-A1 with allocated_amount = payment.amount.               |           |
| 5.18 | After checkout.session.completed, invoice status updated | `SELECT status, balance_amount FROM invoices WHERE id=?` reflects the new state.                                                               |           |
| 5.19 | After charge.refunded full, payment refunded_full        | `SELECT status FROM payments WHERE id=?` = `refunded_full`. `SELECT SUM(amount) FROM refunds WHERE status='executed'` = payment.amount ± 0.01. |           |
| 5.20 | Audit log entry                                          | `SELECT * FROM audit_logs WHERE entity_type='payment' AND entity_id=?` returns entries for each webhook mutation.                              |           |

---

## 6. Data Invariant Queries

After each mutating flow, run the following queries. Each is a separate test case.

### Invoice invariants

| #   | Invariant                             | Query                                                                                                                                                                                                                                                                        | Pass/Fail |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Balance equation after any allocation | `SELECT i.balance_amount, i.total_amount - COALESCE(SUM(pa.allocated_amount), 0) - COALESCE(i.write_off_amount, 0) AS expected FROM invoices i LEFT JOIN payment_allocations pa ON pa.invoice_id=i.id WHERE i.id=? GROUP BY i.id` — `ABS(balance_amount - expected) ≤ 0.01`. |           |
| 6.2 | Balance equation after write-off      | Same as 6.1 after `/write-off`. Balance must be 0.                                                                                                                                                                                                                           |           |
| 6.3 | Total_amount = sum of line_total      | `SELECT i.total_amount, COALESCE(SUM(il.line_total), 0) AS line_sum FROM invoices i LEFT JOIN invoice_lines il ON il.invoice_id=i.id WHERE i.id=? GROUP BY i.id` — equal ± 0.01.                                                                                             |           |
| 6.4 | Line total = quantity × unit_amount   | `SELECT quantity * unit_amount AS expected, line_total FROM invoice_lines WHERE id=?` — equal ± 0.01.                                                                                                                                                                        |           |
| 6.5 | Invoice number uniqueness per tenant  | `SELECT tenant_id, invoice_number, COUNT(*) FROM invoices GROUP BY 1,2 HAVING COUNT(*) > 1` — empty.                                                                                                                                                                         |           |
| 6.6 | Invoice status derivation             | If balance=0 and write_off_amount IS NULL, status ∈ {paid, cancelled, void}. If balance=total, status ∈ {draft, pending_approval, issued, overdue}. Etc.                                                                                                                     |           |

### Payment invariants

| #    | Invariant                               | Query                                                                                                                                                                                               | Pass/Fail |
| ---- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.7  | Allocation sum ≤ payment.amount         | `SELECT p.id, p.amount, COALESCE(SUM(pa.allocated_amount),0) AS alloc FROM payments p LEFT JOIN payment_allocations pa ON pa.payment_id=p.id GROUP BY p.id HAVING alloc > p.amount + 0.01` — empty. |           |
| 6.8  | Refund sum ≤ payment.amount             | `SELECT p.id, p.amount, COALESCE(SUM(r.amount) FILTER (WHERE r.status='executed'),0) FROM payments p LEFT JOIN refunds r ON r.payment_id=p.id GROUP BY p.id HAVING … > p.amount + 0.01` — empty.    |           |
| 6.9  | Payment status derivation               | status='posted' iff exists allocation AND no executed refund equals amount. `refunded_partial` iff 0<Σrefunds<amount. `refunded_full` iff Σrefunds=amount.                                          |           |
| 6.10 | payment_reference uniqueness per tenant | Same pattern as 6.5 for payment_reference.                                                                                                                                                          |           |

### Refund invariants

| #    | Invariant                              | Query                                                                              | Pass/Fail |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------- | --------- |
| 6.11 | refund_reference uniqueness per tenant | Same pattern.                                                                      |           |
| 6.12 | Executed refund has `executed_at` set  | `SELECT id FROM refunds WHERE status='executed' AND executed_at IS NULL` — empty.  |           |
| 6.13 | Failed refund has `failure_reason` set | `SELECT id FROM refunds WHERE status='failed' AND failure_reason IS NULL` — empty. |           |

### Credit note invariants

| #    | Invariant                                   | Query                                                                                                                                                                                                                 | Pass/Fail |
| ---- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.14 | remaining_balance = amount − Σ applications | `SELECT cn.amount, cn.remaining_balance, cn.amount - COALESCE(SUM(cna.applied_amount),0) AS expected FROM credit_notes cn LEFT JOIN credit_note_applications cna ON cna.credit_note_id=cn.id GROUP BY cn.id` — equal. |           |
| 6.15 | remaining_balance ≥ 0                       | `SELECT id FROM credit_notes WHERE remaining_balance < 0` — empty.                                                                                                                                                    |           |
| 6.16 | status derived                              | status='open' iff r=amount; 'partially_used' iff 0<r<amount; 'fully_used' iff r=0; 'cancelled' terminal.                                                                                                              |           |
| 6.17 | Application amount > 0                      | `SELECT id FROM credit_note_applications WHERE applied_amount <= 0` — empty.                                                                                                                                          |           |

### Fee generation + assignment invariants

| #    | Invariant                                                          | Query                                                                                                                                                                                 | Pass/Fail |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.18 | One invoice per (household, billing_period_start) after generation | `SELECT household_id, (SELECT billing_period_start FROM invoice_lines il WHERE il.invoice_id=i.id LIMIT 1) AS bp, COUNT(*) FROM invoices i GROUP BY 1,2 HAVING COUNT(*) > 1` — empty. |           |
| 6.19 | Fee assignment non-overlap                                         | Given the same (household, student, fee_structure) triad, no two active assignments overlap in effective_from/to.                                                                     |           |
| 6.20 | All invoice_lines reference valid fee_structure (if set)           | `SELECT il.id FROM invoice_lines il LEFT JOIN fee_structures fs ON fs.id=il.fee_structure_id WHERE il.fee_structure_id IS NOT NULL AND fs.id IS NULL` — empty.                        |           |

### Tenant + sequence invariants

| #    | Invariant                                                  | Query                                                                                                                                                                                                         | Pass/Fail |
| ---- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.21 | Every tenant-scoped row has non-null tenant_id             | `SELECT 'invoices' WHERE EXISTS(SELECT 1 FROM invoices WHERE tenant_id IS NULL) UNION ALL … for every table`.                                                                                                 |           |
| 6.22 | No cross-tenant FKs                                        | For each FK, the referenced row's tenant_id = the referring row's tenant_id. E.g. `SELECT pa.id FROM payment_allocations pa JOIN invoices i ON i.id=pa.invoice_id WHERE pa.tenant_id != i.tenant_id` — empty. |           |
| 6.23 | tenant_sequences monotonicity                              | No tenant_sequences row has its current_value decreasing over time (compare via audit/history if tracked; or a test that increments in a tight loop and confirms no duplicates).                              |           |
| 6.24 | Every sequence-using table's number matches sequence state | After creating N invoices, `SELECT current_value FROM tenant_sequences WHERE tenant_id=? AND sequence_type='invoice_number'` has advanced by N.                                                               |           |

### Audit log invariants

| #    | Invariant                                             | Query                                                                                                                                                | Pass/Fail |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.25 | Every mutation writes an audit row                    | After POST /invoices/:id/issue, `SELECT * FROM audit_logs WHERE entity_type='invoice' AND entity_id=? AND action='issue'` returns exactly 1 new row. |           |
| 6.26 | Audit row contains actor_id, tenant_id, before, after | `SELECT actor_id, tenant_id, before_payload, after_payload, request_id FROM audit_logs WHERE id=?` — all fields present.                             |           |
| 6.27 | No audit row edit/delete via exposed endpoints        | No `PATCH /audit-logs/:id` or `DELETE /audit-logs/:id` exists. Verify via route table.                                                               |           |

---

## 7. Concurrency & Race-Condition Tests

| #    | What to run                                                                                    | Expected result                                                                                                              | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1  | 5 parallel `POST /invoices/:id/issue` on the same draft invoice                                | Exactly one returns 200 with issued status. Other 4 return 400 `INVALID_STATUS_TRANSITION`. Via `Promise.all(5).allSettled`. |           |
| 7.2  | 5 parallel `POST /payments/:id/allocations` on the same pending payment                        | Exactly one returns 201. Others return `ALLOCATION_EXCEEDS_PAYMENT` or `INVALID_PAYMENT_STATUS`.                             |           |
| 7.3  | 5 parallel refund /execute on same approved refund                                             | Exactly one → executed. Others → 400 `INVALID_STATUS`. No duplicate Stripe API call (verify mock).                           |           |
| 7.4  | 5 parallel credit-note /apply same credit note                                                 | Sum of allocations never exceeds credit_note.amount. At least some return `INSUFFICIENT_CREDIT_BALANCE`.                     |           |
| 7.5  | 5 parallel late-fee applications same invoice with max_applications=1                          | Exactly one succeeds. Others return `MAX_LATE_FEE_APPLICATIONS_REACHED`.                                                     |           |
| 7.6  | 10 parallel create-invoice for the same (household, billing_period) via fee-generation/confirm | Exactly 1 generated per household (idempotency on the partial unique index or sequence pattern).                             |           |
| 7.7  | 2 parallel PATCH /invoices/:id with the same `expected_updated_at`                             | First succeeds. Second returns 409 `CONCURRENT_MODIFICATION`.                                                                |           |
| 7.8  | 10 parallel POST /invoices (different payloads)                                                | 10 unique `invoice_number` values; sequence monotonic.                                                                       |           |
| 7.9  | 2 parallel webhook deliveries with the same `event.id`                                         | One processed, one deduplicated. No duplicate payment row.                                                                   |           |
| 7.10 | Parallel refund create + Stripe-side refund                                                    | Both produce at most one refund row per payment matching the exact amount. Race via `Promise.all`.                           |           |

---

## 8. Transaction Boundary Tests

| #   | What to run                                                                            | Expected result                                                                                                                                                               | Pass/Fail |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Mock `invoice_lines.create` to throw partway through invoice create                    | Full rollback: `SELECT * FROM invoices WHERE id=?` returns empty. No orphan invoice_lines.                                                                                    |           |
| 8.2 | Mock `payment_allocations.createMany` to throw after payment.create                    | Payment row is rolled back (pending → nothing). Invoice balance unchanged.                                                                                                    |           |
| 8.3 | Mock `refunds.update` to throw partway through `execute` after Stripe refund succeeds  | Stripe refund already happened (cannot rollback externally); refund row marked `failed`; payment status unchanged. This is a compensating-transaction scenario — document it. |           |
| 8.4 | Verify `app.current_tenant_id` is set BEFORE the first read in every write transaction | Instrument Prisma to log SETs and SELECTs; assert SET precedes every SELECT.                                                                                                  |           |
| 8.5 | No partial state readable from outside the transaction                                 | Read from another connection during the transaction — the partial write is NOT visible (PostgreSQL default Read Committed).                                                   |           |
| 8.6 | Transaction isolation level                                                            | All RLS-enforced write transactions run at `READ COMMITTED` minimum. Verify by inspecting `pg_stat_activity` during a transaction.                                            |           |

---

## 9. Encrypted Field Access Control

`tenant_stripe_configs` contains encrypted secret key + webhook secret.

| #   | What to run                                                                                       | Expected result                                                                                                             | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | `EncryptionService.encrypt(plaintext)` → store; read with `EncryptionService.decrypt(ciphertext)` | Round-trips to same plaintext.                                                                                              |           |
| 9.2 | `SELECT stripe_secret_key_encrypted FROM tenant_stripe_configs WHERE tenant_id=?`                 | Returns ciphertext bytes/base64. NEVER plaintext.                                                                           |           |
| 9.3 | API response from `/finance/dashboard/currency` or any admin endpoint                             | Never contains `stripe_secret_key_encrypted` or plaintext. Stripe config is NOT exposed via admin API.                      |           |
| 9.4 | API response from tenant settings endpoint (if any exposes Stripe status)                         | Contains only `stripe_enabled: boolean` and maybe last-4 of key; never the full key.                                        |           |
| 9.5 | Audit log row on every decrypt                                                                    | `SELECT * FROM audit_logs WHERE action='decrypt' AND entity_type='tenant_stripe_config'` returns an entry per decrypt call. |           |
| 9.6 | Log scraping — grep API/worker log stream for the plaintext                                       | Must not appear. Keys are masked or omitted in all log lines.                                                               |           |
| 9.7 | Error message exposure                                                                            | Stripe errors (401 from Stripe due to wrong key, etc.) do NOT surface the key in the error message.                         |           |
| 9.8 | Key rotation — update `encryption_key_ref`                                                        | Old ciphertext is re-encrypted with the new key on next write. Decryption still works during rotation window.               |           |
| 9.9 | Webhook secret round-trip                                                                         | Same as 9.1 for `stripe_webhook_secret_encrypted`.                                                                          |           |

---

## 10. PDF / Binary Content Assertions

Every PDF endpoint: `invoice`, `receipt`, `household-statement`.

### 10A. Invoice PDF — `GET /v1/finance/invoices/:id/pdf`

| #     | What to assert                     | Query / check                                                                                                  | Pass/Fail |
| ----- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 10A.1 | Content-Type                       | `application/pdf`.                                                                                             |           |
| 10A.2 | Content-Disposition                | `inline; filename="invoice-<invoice_number>.pdf"` (e.g., `invoice-INV-202604-000001.pdf`).                     |           |
| 10A.3 | Magic bytes                        | First 4 bytes = `%PDF`.                                                                                        |           |
| 10A.4 | `pdf-parse` extracts expected text | invoice_number, household_name, billing_parent_name, due_date, total_amount (formatted with tenant currency).  |           |
| 10A.5 | Line items present                 | Every `invoice_lines` row appears as a line in the PDF with description + quantity + unit_amount + line_total. |           |
| 10A.6 | Tenant branding                    | `display_name`, logo_url referenced in the PDF header. support_email + support_phone in footer.                |           |
| 10A.7 | `?locale=ar`                       | Template direction RTL; Arabic strings present (verify via `pdf-parse` with Arabic dictionary match).          |           |
| 10A.8 | Different tenant prefix            | Tenant B invoice PDF uses `BIL-` prefix.                                                                       |           |

### 10B. Receipt PDF — `GET /v1/finance/payments/:id/receipt/pdf`

| #     | What to assert                             | Query / check                                                             | Pass/Fail |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------- | --------- |
| 10B.1 | Filename pattern when receipt exists       | `receipt-<receipt_number>.pdf` (e.g., `receipt-REC-202604-000017.pdf`).   |           |
| 10B.2 | Filename fallback when receipt row missing | `receipt-<payment_id>.pdf` (UUID). Logger.warn emitted.                   |           |
| 10B.3 | pdf-parse content                          | payment_reference, household, amount, received_at, allocations breakdown. |           |
| 10B.4 | `?locale=ar`                               | Arabic template.                                                          |           |

### 10C. Household Statement PDF — `GET /v1/finance/household-statements/:id/pdf`

| #     | What to assert                 | Query / check                                                                                      | Pass/Fail |
| ----- | ------------------------------ | -------------------------------------------------------------------------------------------------- | --------- |
| 10C.1 | Filename                       | `statement-<householdId>.pdf`.                                                                     |           |
| 10C.2 | pdf-parse content              | household_name, billing_parent_name, date range, opening_balance, ledger entries, closing_balance. |           |
| 10C.3 | `date_to` inclusive of day-end | A payment received at `23:55` on the `date_to` appears in the ledger.                              |           |
| 10C.4 | Arabic locale                  | RTL template, Arabic labels, Western numerals.                                                     |           |

### 10D. Generic PDF security

| #     | What to assert                | Query / check                                                                                                                  | Pass/Fail |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10D.1 | Cross-tenant PDF access       | Admin A requests Tenant B's invoice PDF → 404.                                                                                 |           |
| 10D.2 | Parent PDF access             | Parent A requests the admin receipt PDF for their own payment → admin endpoint returns 403 (parent doesn't have finance.view). |           |
| 10D.3 | XSS in household name         | Inject `<script>` into household_name; regenerate PDF; confirm no executable script is embedded.                               |           |
| 10D.4 | Encrypted field never appears | `pdf-parse` the PDF — confirm Stripe keys, refresh tokens, bank details do NOT appear.                                         |           |

---

## 11. State Machine Transition Matrix (Invalid Transitions)

For each state machine, run every invalid transition and verify 400 with the correct code.

### Invoice (states: draft, pending_approval, issued, partially_paid, paid, overdue, void, cancelled, written_off)

| #     | From             | Transition attempt | Expected                          | Pass/Fail |
| ----- | ---------------- | ------------------ | --------------------------------- | --------- |
| 11.1  | paid             | POST /issue        | 400 `INVALID_STATUS_TRANSITION`   |           |
| 11.2  | paid             | POST /void         | Per product: allowed or 400       |           |
| 11.3  | paid             | POST /cancel       | 400                               |           |
| 11.4  | paid             | POST /write-off    | 400                               |           |
| 11.5  | void             | POST /issue        | 400                               |           |
| 11.6  | void             | POST /void         | 400 `INVOICE_VOID_OR_WRITTEN_OFF` |           |
| 11.7  | cancelled        | POST /issue        | 400                               |           |
| 11.8  | cancelled        | POST /void         | 400                               |           |
| 11.9  | written_off      | POST /issue        | 400                               |           |
| 11.10 | written_off      | POST /write-off    | 400                               |           |
| 11.11 | issued           | POST /cancel       | 400 (only drafts cancelable)      |           |
| 11.12 | pending_approval | POST /cancel       | 400                               |           |
| 11.13 | draft            | POST /write-off    | 400 (only payable statuses)       |           |

### Payment

| #     | From          | Transition attempt            | Expected                       | Pass/Fail |
| ----- | ------------- | ----------------------------- | ------------------------------ | --------- |
| 11.14 | pending       | POST /refunds (create refund) | 400 `INVALID_PAYMENT_STATUS`   |           |
| 11.15 | failed        | POST /refunds                 | 400                            |           |
| 11.16 | voided        | POST /refunds                 | 400                            |           |
| 11.17 | refunded_full | POST /refunds                 | 400 `AMOUNT_EXCEEDS_AVAILABLE` |           |

### Refund

| #     | From     | Transition attempt | Expected             | Pass/Fail |
| ----- | -------- | ------------------ | -------------------- | --------- |
| 11.18 | executed | POST /approve      | 400 `INVALID_STATUS` |           |
| 11.19 | executed | POST /reject       | 400                  |           |
| 11.20 | executed | POST /execute      | 400                  |           |
| 11.21 | rejected | POST /execute      | 400                  |           |
| 11.22 | rejected | POST /approve      | 400                  |           |

### Credit note

| #     | From       | Transition attempt       | Expected                          | Pass/Fail |
| ----- | ---------- | ------------------------ | --------------------------------- | --------- |
| 11.23 | fully_used | POST /credit-notes/apply | 400 `INSUFFICIENT_CREDIT_BALANCE` |           |
| 11.24 | cancelled  | POST /credit-notes/apply | 400 `INVALID_CREDIT_NOTE_STATUS`  |           |

### Payment plan

| #     | From      | Transition attempt | Expected       | Pass/Fail |
| ----- | --------- | ------------------ | -------------- | --------- |
| 11.25 | approved  | POST /approve      | 400            |           |
| 11.26 | approved  | POST /reject       | 400            |           |
| 11.27 | rejected  | POST /accept       | 400            |           |
| 11.28 | cancelled | POST /approve      | 400            |           |
| 11.29 | completed | POST /cancel       | 400 (terminal) |           |

### Scholarship

| #     | From    | Transition attempt | Expected             | Pass/Fail |
| ----- | ------- | ------------------ | -------------------- | --------- |
| 11.30 | revoked | POST /revoke       | 400 `INVALID_STATUS` |           |

---

## 12. Observations & Gaps

1. **Parent frontend endpoint mismatch (P1).** Frontend calls non-existent paths `/v1/parent/finances` etc. Tests 4.20 confirm backend returns 404. Backend needs new controller endpoints OR frontend must be fixed. Coordinate with owner.
2. **No `finance.*` audit log tamper-resistance endpoint test** — no PATCH/DELETE endpoints exist for audit_logs. Verified §6.27. Good.
3. **Stripe reserved-event-id dedupe assumption** — 5.8 relies on a UNIQUE index on `payments.external_event_id` (within tenant). Verify via `\d payments` that such a constraint exists. If missing, it's a P0 idempotency gap.
4. **Compensation logic for Stripe-succeeded / DB-failed refunds (§8.3)** is a gap — currently the refund row is marked `failed` but the actual Stripe refund DID go through. Requires reconciliation job (not present in worker).
5. **`parent_a` attempting own-household `studentId` via alternate path** — the only parent-visible endpoint is `/students/:studentId/finances`. If another student in the household has their own endpoint, test it here.
6. **Rate limit on parent POST /pay** — verify throttle isn't bypassed by parents (admin bulk operations can, but parents should be rate-limited to prevent Stripe-session abuse).
7. **Webhook amount metadata mismatch (§5.14)** — unclear if backend reconciles. Document the actual behaviour vs expected. If it silently accepts mismatched amounts, that's a business-logic bug.

---

## 13. Sign-Off

| Reviewer Name | Date | Pass | Fail | Overall Result |
| ------------- | ---- | ---- | ---- | -------------- |
|               |      |      |      |                |

**Required for release:** Every RLS row in §2 MUST pass. Every webhook idempotency row (5.8, 5.11, 5.19) MUST pass. Every cross-tenant PDF test (§10D.1) MUST pass. Any single fail here blocks tenant onboarding.
