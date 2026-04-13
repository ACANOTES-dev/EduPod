# Finance Module — Release Readiness Pack

**Generated:** 2026-04-12
**Commit:** `c385872c` (full E2E spec-pack rewrite following `384ba761` command set)
**Module slug:** `finance`

---

## Spec pack

| Leg                 | Spec document                                                                      | Lines     | Sections | Rows (approx) | Date       |
| ------------------- | ---------------------------------------------------------------------------------- | --------- | -------- | ------------- | ---------- |
| /E2E (admin)        | [admin_view/finance-e2e-spec.md](admin_view/finance-e2e-spec.md)                   | 1,183     | 51       | ~1,400        | 2026-04-12 |
| /E2E (parent)       | [parent_view/finance-e2e-spec.md](parent_view/finance-e2e-spec.md)                 | 641       | 30       | ~500          | 2026-04-12 |
| /e2e-integration    | [integration/finance-integration-spec.md](integration/finance-integration-spec.md) | 587       | 13       | ~430          | 2026-04-12 |
| /e2e-worker-test    | [worker/finance-worker-spec.md](worker/finance-worker-spec.md)                     | 324       | 11       | ~140          | 2026-04-12 |
| /e2e-perf           | [perf/finance-perf-spec.md](perf/finance-perf-spec.md)                             | 491       | 13       | ~220          | 2026-04-12 |
| /e2e-security-audit | [security/finance-security-spec.md](security/finance-security-spec.md)             | 535       | 15       | ~330          | 2026-04-12 |
| **Total**           |                                                                                    | **3,761** | **133**  | **~3,020**    |            |

**Note on scope:** The finance module has no teacher or student view — the admin shell is admin-only and parents access finance through the parent dashboard's Finances tab. Both role specs for `teacher_view` and `student_view` are therefore intentionally omitted (not "skipped with N/A placeholder") because the product genuinely has no such surface. The 403 coverage against those roles is exercised in the admin spec §43 (permission matrix) and in the integration/security specs.

---

## Execution order

Run the specs in this order for full confidence:

1. **UI behavioural (admin, then parent)** — use Playwright or a human QC engineer. Admin spec first; parent spec second (shares fixtures).
2. **Integration** — RLS × 19 tables, contract tests, Stripe webhooks, DB invariants. Jest + supertest harness.
3. **Worker** — BullMQ `finance:on-approval` + `finance:overdue-detection`. ioredis-mock for unit, real Redis for chain tests.
4. **Perf** — k6 + autocannon + Lighthouse against a stress-seeded environment.
5. **Security** — paid consultant OR internal security engineer. Humans find more on the adversarial axis than tools.

Each leg can be executed independently, but the full pack is what achieves release-readiness.

---

## Coverage summary

| Concern                        | Count                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI pages (admin)               | 24 authenticated routes + 3 PDF streams + 1 CSV export + 1 webhook                                                                                                                                                                                                                                                                |
| UI surface (parent)            | 1 tab within parent dashboard + Stripe redirect round-trip                                                                                                                                                                                                                                                                        |
| Backend API endpoints          | ~90 admin + 4 parent + 1 webhook                                                                                                                                                                                                                                                                                                  |
| Tenant-scoped DB tables        | 19 (invoices, invoice_lines, installments, payments, payment_allocations, refunds, receipts, credit_notes, credit_note_applications, fee_types, fee_structures, household_fee_assignments, discounts, scholarships, late_fee_configs, late_fee_applications, recurring_invoice_configs, payment_plan_requests, invoice_reminders) |
| RLS matrix cells               | 19 tables × 6 scenarios = 114 rows                                                                                                                                                                                                                                                                                                |
| BullMQ jobs                    | 2 (`finance:on-approval`, `finance:overdue-detection`)                                                                                                                                                                                                                                                                            |
| Cron schedules                 | 0 currently registered (documented gap — see observations)                                                                                                                                                                                                                                                                        |
| OWASP categories covered       | 10 / 10                                                                                                                                                                                                                                                                                                                           |
| Permission matrix cells        | ~90 endpoints × 9 roles ≈ 810                                                                                                                                                                                                                                                                                                     |
| Encrypted fields round-tripped | 2 (`stripe_secret_key_encrypted`, `stripe_webhook_secret_encrypted`) in `tenant_stripe_configs`                                                                                                                                                                                                                                   |
| State machines tested          | 5 (invoice, payment, refund, credit note, payment plan, scholarship)                                                                                                                                                                                                                                                              |
| Data invariants                | 30+ across admin §48 and integration §6                                                                                                                                                                                                                                                                                           |
| Load / concurrency tests       | 14                                                                                                                                                                                                                                                                                                                                |
| PDF render budgets             | 16 rows (invoice small/medium/large + receipt + statement at varying sizes)                                                                                                                                                                                                                                                       |

---

## Known limitations of the pack

Even the full pack does not cover:

- **Long-tail Zod validation combinatorics** beyond the documented boundary cases (sampled, not exhaustive)
- **Real external-service behaviour** — Stripe API outages, email-provider delays are mocked at the boundary
- **Accessibility audits** beyond structural checks — run axe-core / Lighthouse a11y as a sibling workflow
- **Visual regression / pixel diff** — run Percy / Chromatic separately
- **Browser / device matrix** beyond desktop Chrome + 375px mobile emulation — defer to manual QA on Safari, Firefox, edge devices
- **Load-testing at disaster volume** (100k+ concurrent users) — /e2e-perf targets realistic + stress, not peak
- **DR / backup / restore** validation
- **Runtime secret rotation under live load** — tested for correctness in /e2e-integration §9, but not for zero-downtime at production scale
- **Tenant onboarding dry-run** — this is a separate checklist (`docs/operations/PRE-LAUNCH-CHECKLIST.md`)

These gaps are acceptable for the 99.99% confidence target. 100% does not exist.

---

## Observations & findings from the walkthrough

Below is the consolidated list of observations the spec authors surfaced during the code walkthrough. These are NOT silently fixed — the user decides which ship vs backlog. Line references point to the specs that discuss each finding in more detail.

### P1 — Parent frontend / backend endpoint mismatch (admin §50.1, parent §29, integration §4.20, security §14)

The parent dashboard's Finances tab calls four backend paths that do not exist on the backend:

- `GET /api/v1/parent/finances` (no `studentId` variant)
- `POST /api/v1/parent/finances/invoices/:id/checkout`
- `GET /api/v1/parent/finances/payments/:id/receipt`
- `POST /api/v1/parent/finances/payment-plan-requests`

The backend exposes:

- `GET /v1/parent/students/:studentId/finances`
- `POST /v1/parent/invoices/:id/pay`
- `POST /v1/parent/invoices/:id/request-payment-plan`
- `POST /v1/parent/payment-plans/:id/accept`

Consequence: in production, parents cannot pay invoices, cannot download receipts, and cannot request payment plans through the UI. The feature is silently broken. Either the frontend must be updated to call the existing backend paths, or the backend must expose the frontend-claimed paths as aliases. Blocker for parent rollout.

### P1 — No cron registrations (worker §5, admin §50.2-6)

`CronSchedulerService` has ZERO entries for finance. The following processors / services exist but are never automatically triggered:

- `finance:overdue-detection` — invoices never auto-transition to `overdue`
- `PaymentRemindersService.sendDueSoonReminders` (and `.sendOverdueReminders`, `.sendFinalNotices`) — synchronous; requires external trigger
- `LateFeesService.applyLateFee` — per-invoice only; no auto-application
- `RecurringInvoicesService.generateDueInvoices` — synchronous; no scheduled trigger
- Scholarship auto-expiration — no service method exists yet

Without these, the system requires manual intervention for every routine operation. Priority: P1. Fix by adding cron registrations in `CronSchedulerService.onModuleInit()` and, for reminders, wiring dispatch to the notifications module.

### P1 — Payment reminders don't dispatch notifications (admin §50.3, worker §10.2)

`PaymentRemindersService.dispatchReminder` writes the dedupe row into `invoice_reminders` but does NOT enqueue an email/whatsapp/in_app notification. Parents never receive reminders even when the "sent" counter increments. Wire up to `communications:send-email` or equivalent. Priority: P1.

### P2 — No explicit retry policy on finance jobs (worker §3.15, §10.3)

`approval-requests.service.ts:302` enqueues `finance:on-approval` without `attempts` or `backoff`. Uses BullMQ defaults (effectively no retry). Transient DB failures mid-callback result in invoices stuck in `pending_approval` with `callback_status='failed'`. Add `attempts: 5, backoff: { type: 'exponential', delay: 1000 }`.

### P2 — Parent POST /pay lacks rate limit (security §10.4)

No throttle on `POST /v1/parent/invoices/:id/pay`. A compromised parent account can spam Stripe session creation, exhausting Stripe quota and potentially triggering Stripe-side protections. Apply `@Throttle({ default: { limit: 10, ttl: 60000 } })`.

### P2 — Self-approval block enforcement unverified (admin §25.2, security A01.10)

The spec requires that a user who requested a refund cannot approve it. Backend is assumed to enforce this. Confirm via integration test (§3C.6). If not enforced, a single admin can refund themselves without oversight.

### P2 — CSV formula injection (security §A03.7, §4.31)

Custom-report CSV export (§32.11 admin) does not escape cells starting with `=`, `+`, `-`, `@`. When opened in Excel, a crafted cell can execute formulas. Prepend apostrophe to any cell beginning with those characters.

### P2 — Business-logic + data-integrity gaps

- **Bulk operations synchronous** (admin §50.7) — `/bulk/issue`, `/bulk/void`, `/bulk/remind`, `/bulk/export` iterate in-band. 200-invoice jobs approach API timeout (perf §12.1). Move to queue-backed flow.
- **Compensation for Stripe-succeeded / DB-failed refund** (security §13.26) — after Stripe refund, if DB write fails, refund row is marked `failed` but Stripe charge is already refunded. No reconciliation job exists. Document the recovery playbook and add a daily reconciliation.
- **No `idx_invoices_overdue_candidates`** partial index (perf §9.11). At 100k invoices, overdue detection full-scans and becomes a DoS vector.

### P3 — Polish & minor observations

- Parent invoice status labels use `.replace(/_/g, ' ')` instead of `t('invoiceStatus.*')` keys. Arabic users see English labels in the Finances tab.
- Parent plan state never surfaced in UI after submission (parent §16.8-10).
- Accept-counter-offer button not built yet (parent §17, backend endpoint exists).
- No auto-refresh after Stripe `?payment=success` return (parent §12.5).
- Payment history capped at 50 on the parent tab with no pagination (parent §18.11).
- Client-side plan sum validation missing (parent §15.9).
- Receipt download via `window.open` — auth header not carried to the new tab; cookie-based auth assumed (parent §19.5).
- `finance-enhanced.controller.ts` hosts 40+ endpoints; consider splitting for maintainability.

Full details of each observation live in the respective spec's Observations / Gaps section.

---

## Tester assignment

This pack is designed to be executed by:

- **A dedicated QC engineer** working through each spec top-to-bottom, marking Pass/Fail per row. One spec per day is a reasonable cadence for the admin spec; the others can be done in half-days.
- **A headless Playwright agent** for the admin + parent /E2E legs (UI behaviour is scriptable end-to-end).
- **A Jest / supertest harness** for /e2e-integration — every row is a machine-executable test case.
- **A Jest + ioredis-mock + @nestjs/bullmq harness** for /e2e-worker-test.
- **k6 / autocannon + Lighthouse** for /e2e-perf (each row is a measurement with a numeric budget).
- **A paid security consultant OR an internal security engineer** for /e2e-security-audit. Tools alone miss business-logic abuse and novel attack vectors.

---

## Sign-off

| Leg                 | Reviewer | Date | Pass | Fail | Notes |
| ------------------- | -------- | ---- | ---- | ---- | ----- |
| /E2E (admin)        |          |      |      |      |       |
| /E2E (parent)       |          |      |      |      |       |
| /e2e-integration    |          |      |      |      |       |
| /e2e-worker-test    |          |      |      |      |       |
| /e2e-perf           |          |      |      |      |       |
| /e2e-security-audit |          |      |      |      |       |

**Module release-ready when all six rows are signed off at Pass with zero P0 / P1 findings outstanding.**

## Live Playwright walkthrough — 2026-04-12

A comprehensive Playwright walkthrough of the live `nhqs.edupod.app` surface was executed on 2026-04-12. Full results in [PLAYWRIGHT-WALKTHROUGH-RESULTS.md](PLAYWRIGHT-WALKTHROUGH-RESULTS.md). Summary:

- **69 rows confirmed passing** ✅
- **13 rows failed or deviated from spec** ❌
- **1 P0, 2 P1, 7 P2, 5 P3** confirmed live findings (in addition to the spec-level P1s already tracked)

### P0 (live-verified, block release)

1. **Invoice PDF endpoint 500s.** `GET /api/v1/finance/invoices/:id/pdf` returns 500; modal shows "Failed to load PDF". Receipt PDF pipeline works, so the fault is isolated to invoice rendering. Blocks any tenant who wants PDF invoices.

### P1 (live-verified, block release)

2. **Parent frontend ↔ backend endpoint mismatch confirmed live.** All 4 frontend paths return 404 in production: `GET /v1/parent/finances`, `POST /v1/parent/finances/invoices/:id/checkout`, `GET /v1/parent/finances/payments/:id/receipt`, `POST /v1/parent/finances/payment-plan-requests`. Parent portal finance is 100% non-functional.
3. **Parent home displays hardcoded placeholder invoice "Term 2 Fee Invoice €450 due in 3 days"** even when the parent has no linked students and no real invoices. Shown in the "Needs Your Attention" banner. A parent could reasonably interpret this as a legitimate demand for payment.

### P2 (live-verified)

4. Audit trail UI shows raw HTTP method+URL in Action and Description columns (spec §35.5 requires human-readable ICU labels).
5. Credit Notes list: Household and Issued By columns are empty on rendered rows (read join or controller bug).
6. Invoice lines show "—" for Student and Fee Structure even though descriptions reference students (FK population broken).
7. Discounts table missing Auto-apply badge column (spec §28.1).
8. Finance hub missing the horizontally scrollable module sub-strip (spec §5.2).
9. Top debtors preview cards absent from the Finance hub (spec §7.4).
10. Outstanding Amount KPI link missing `?overdue=yes` query handoff (spec §6.3).
11. Arabic locale: parent home hardcoded banner + quick-action labels untranslated ("Term 2 Fee Invoice", "Pay Invoice", "View Grades", "Contact School").
12. Parent top navigation includes a "Finance" button (spec §4.14 says this should NOT exist).
13. "Create Invoice" quick action routes to the invoice LIST — no creation flow.
14. Refunds list hides filter toolbar when empty.

### P3 (live-verified, polish)

15. `/api/v1/finance/dashboard` fetches 2× on mount.
16. `/api/v1/finance/dashboard/currency` fetches 5× on mount (each `<CurrencyDisplay>` calls `useTenantCurrency` independently).
17. Payment reference format inconsistency (`PAYREF-000004` vs `PAY-202603-000001`).
18. Payment-detail → invoice link missing `/en/` locale prefix.
19. Arabic-Indic numerals used in Arabic-locale dates (e.g. "١٢ أبريل") — violates CLAUDE.md "Western numerals in both locales".

### Spec-level P1s still outstanding

20. **No cron registrations for finance jobs** — overdue-detection, reminders, late fees, recurring invoices, scholarship expiration all require manual triggers. (Not directly exercised via Playwright; inferred from worker survey and still valid.)
21. **Payment reminders don't dispatch notifications** — service writes dedup row but never queues email/whatsapp/in_app. (Same: requires worker fixtures to verify end-to-end.)

**Release gate verdict:** Module is NOT release-ready as of 2026-04-12. The invoice-PDF 500 and parent-portal breakage alone are tenant-onboarding blockers. Fix the P0 + the three P1s, then re-run the Playwright walkthrough before signing off.
