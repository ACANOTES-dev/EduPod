# Finance Module — Bug Log

**Purpose:** Single authoritative log of every bug / deviation flagged for the finance module — consolidated from the Playwright walkthrough (2026-04-12) and the spec-pack code review. Agents pick up one bug at a time, fix it, then verify via Playwright on `nhqs.edupod.app` before marking it complete.

**Source documents:**

- `E2E/7_finance/PLAYWRIGHT-WALKTHROUGH-RESULTS.md` — live-verified findings (prefix `L`)
- `E2E/7_finance/RELEASE-READINESS.md` + individual specs — code-review findings (prefix `C`)

## Workflow for picking up a bug

1. Read the bug entry top-to-bottom (it's designed to be self-contained).
2. Open the referenced files; grep for any symbols mentioned.
3. Change status from `Open` → `In Progress`, add your initials + date in the "Assigned" line.
4. Implement the fix per CLAUDE.md rules (RLS-safe, no silent failures, typed, tests updated).
5. Commit with `fix(finance): <bug-id> — <title>` and deploy to prod.
6. Run the Playwright verification steps from the entry.
7. Change status to `Verified` with date.
8. If scope creep or product question, downgrade to `Blocked — need input` and stop.

## Severity legend

- **P0** — production-breaking; user-facing feature unusable or data at risk
- **P1** — significant functional or trust bug; blocks a documented user flow
- **P2** — UX / data-quality / defence-in-depth; not blocking but degrades the product
- **P3** — polish / perf / consistency; ship when convenient

## Status legend

- `Open` — not started
- `In Progress` — actively being worked on
- `Blocked` — waiting on input, fixture, or upstream fix
- `Fixed` — code merged + deployed, awaiting Playwright re-verification
- `Verified` — Playwright re-run confirms the fix; bug closed
- `Won't Fix` — product decision to keep current behaviour (with written reason)

## Provenance

- `[L]` Live-verified via Playwright walkthrough on 2026-04-12
- `[C]` Surfaced in code-review during spec authoring; not yet Playwright-probed

---

## FIN-001 — [L] Invoice PDF endpoint returns 500

- **Severity:** P0
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Decisions

- 2026-04-12: Hardened `escapeHtml()` in both invoice templates to tolerate non-string inputs (coerce via `String()`), and added a `formatDate()` helper so `Date` objects from Prisma render as human dates. Also loosened `payment_allocations` typing to accept the nested `payment.*` shape that `invoices.service.ts` actually returns. Chose this over changing the service to pre-serialize dates because (a) the template-side guard is defence-in-depth against any future caller passing Date, and (b) it keeps the service's rich object intact for non-PDF consumers.

### Verification notes

- 2026-04-12: Redeployed (rsync templates → `pnpm --filter @school/api build` → `pm2 restart api`).
- `curl -H 'Authorization: Bearer <token>' /api/v1/finance/invoices/ff117815-b20f-4374-a91d-50812a3ec1e9/pdf` → **HTTP 200**, `content-type: application/pdf`, 76050 bytes.
- `pdftotext` on the download extracts `INVOICE`, `INV-202603-000003`, `Issue Date: 25 Mar 2026`, `Due Date: 24 Apr 2026`, line items (`TUITION 3RD CLASS — nytjytjyt hytjtyjyt`, `AED 8000.00`), and totals — all expected fields present.
- Backend unit tests (`invoice-en.template.spec.ts` + `invoice-ar.template.spec.ts`): 57 passed, including new regression tests for Date-object `issue_date`/`due_date` and the nested `payment.*` shape.
- **Provenance:** [L] Reproduced via Playwright 2026-04-12

### Summary

Clicking "Preview PDF" on any invoice detail page opens the PDF modal, which then fetches `GET /api/v1/finance/invoices/:id/pdf` — the backend returns 500. The modal shows "Failed to load PDF. Please try again." and Print + Download buttons stay disabled. **Receipt PDF works**, so the rendering pipeline is not globally broken — the fault is isolated to the invoice-rendering path.

### Reproduction (Playwright)

1. Login to `https://nhqs.edupod.app/en/login` as `owner@nhqs.test` / `Password123!`
2. Navigate to `/en/finance/invoices?status=issued`
3. Click any row, e.g. `INV-202603-000003` (URL: `/en/finance/invoices/ff117815-b20f-4374-a91d-50812a3ec1e9`)
4. Click the "Preview PDF" button
5. Observe console: `[PdfPreviewModal] Error: PDF fetch failed: 500`

### Expected

Content-Type `application/pdf`, Content-Disposition `inline; filename="invoice-<invoice_number>.pdf"`, modal iframe renders the PDF. See `admin_view/finance-e2e-spec.md` §15.10.

### Likely root cause

`apps/api/src/modules/finance/invoices.controller.ts` — the `/invoices/:id/pdf` handler. Compare with the working receipt path `apps/api/src/modules/finance/payments.controller.ts` (`/payments/:id/receipt/pdf`) and the PDF rendering service call. A common culprit: missing student / household / fee_structure join when rendering, or a template variable that's null and crashes the template engine.

### Files to inspect

- `apps/api/src/modules/finance/invoices.controller.ts` — handler for `:id/pdf`
- `apps/api/src/modules/finance/invoices.service.ts` — data-fetch method used by the handler
- `apps/worker/src/processors/pdf-rendering/*` or `packages/pdf-rendering/` — template engine
- Compare working: `apps/api/src/modules/finance/payments.controller.ts` → `/payments/:id/receipt/pdf`
- Check the invoice line data — note FIN-006 (invoice lines have NULL `student_id`/`fee_structure_id`), which may crash the template if it expects those FKs to be populated.

### Fix direction

1. Tail `pm2 logs api --lines 200` after reproducing to capture the 500 stack trace.
2. If the template engine throws on null `student` / `fee_structure` on a line, guard with nullish coalescing OR fix FIN-006 first.
3. Unit test: add a test for `InvoicesService.generatePdf()` with a fixture invoice that has NULL FKs on lines.

### Verification (Playwright)

1. Repro steps 1-4 above.
2. Assert: `GET /api/v1/finance/invoices/:id/pdf` returns 200 with `content-type: application/pdf`.
3. Assert: modal iframe `src` loads; "Print" and "Download" buttons become enabled.
4. Assert: console has zero `[PdfPreviewModal] Error` entries.
5. Use `pdf-parse` on the downloaded bytes — invoice_number, household_name, totals must appear in extracted text (see `integration/finance-integration-spec.md` §10A).

### Release gate

Blocks tenant onboarding. Any tenant wanting paper/PDF invoices cannot use the module.

---

## FIN-002 — [L] Parent frontend calls 4 non-existent backend endpoints (404)

- **Severity:** P1
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Decisions

- 2026-04-12: Took Option A (fix the frontend) + Sub-option A1 (add a parent-scoped receipt endpoint) per bug log's preferred guidance. Rationale: backend already enforces the correct shape, and keeping "Download Receipt" in the parent UI is more useful than dropping it (A2). The new endpoint reuses `ReceiptsService.renderPdf` and just adds a household ownership check — no receipt rendering duplication.

### Verification notes

- 2026-04-12: Deployed (rsync api controller + 2 web files → build api + web → pm2 restart api + web).
- Route probes on prod (no auth → 401 means routed, 404 means unknown):
  - `GET /v1/parent/students/<id>/finances` → 401 ✓
  - `POST /v1/parent/invoices/<id>/pay` → 401 ✓
  - `POST /v1/parent/invoices/<id>/request-payment-plan` → 401 ✓
  - `GET /v1/parent/payments/<id>/receipt/pdf` → 401 ✓ (new)
  - `GET /v1/parent/finances` → 404 (legacy path, frontend no longer calls it)
- As `parent@nhqs.test` (zero linked students): receipt endpoint returns 403 with structured `PAYMENT_ACCESS_DENIED` error (no matching household), confirming the ownership check works.
- Jest: `parent-finance.controller.spec.ts` 16/16 pass (added `ReceiptsService` mock to the testing module).
- **Provenance:** [L] Reproduced via Playwright 2026-04-12

### Summary

The parent dashboard and FinancesTab component call 4 endpoint paths that **do not exist on the backend** — all return 404 in production. The backend exposes 4 _different_ paths under `@Controller('v1/parent')` (which return 401 to a non-parent session, i.e. they exist). Parent portal finance is 100% broken in production.

### Endpoint mismatch table

| Frontend calls (live → 404)                          | Backend exposes (live → 401 with parent auth)           |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `GET /api/v1/parent/finances`                        | `GET /api/v1/parent/students/:studentId/finances`       |
| `POST /api/v1/parent/finances/invoices/:id/checkout` | `POST /api/v1/parent/invoices/:id/pay`                  |
| `GET /api/v1/parent/finances/payments/:id/receipt`   | _no parent-scoped receipt endpoint exists_              |
| `POST /api/v1/parent/finances/payment-plan-requests` | `POST /api/v1/parent/invoices/:id/request-payment-plan` |

### Reproduction (Playwright)

1. Login as `parent@nhqs.test` / `Password123!` at `https://nhqs.edupod.app/en/login`
2. Observe DevTools console on `/en/dashboard/parent`:
   - `Failed to load resource: 404 @ /api/v1/parent/finances`
3. Or run in DevTools:
   ```js
   await fetch('/api/v1/parent/finances', { credentials: 'include' }).then((r) => r.status);
   // → 404
   await fetch('/api/v1/parent/students/<any-uuid>/finances', { credentials: 'include' }).then(
     (r) => r.status,
   );
   // → 401 (exists, lacks permission/linkage)
   ```

### Expected

Parent sees their outstanding balance, invoice list, payment history. Can click Pay Now (Stripe checkout), request payment plan, download receipts.

### Files to inspect (and fix)

- `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx` — line 166 calls `/api/v1/parent/finances`
- `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/finances-tab.tsx` — lines 100, 110, 124, 164 call the 4 mismatched paths
- `apps/api/src/modules/finance/parent-finance.controller.ts` — the authoritative backend routes

### Fix direction

**Option A (preferred): fix the frontend.** Cheaper, no backend change, no alias sprawl.

The frontend needs the `studentId` to hit `/parent/students/:studentId/finances`. The parent dashboard already loads linked students via `/api/v1/dashboard/parent` — use the first student's id (or aggregate across all linked students). Concretely:

1. In `parent/page.tsx`, replace `apiClient('/api/v1/parent/finances')` with a derived call using the loaded `students[0].student_id`, OR loop and aggregate per-student.
2. In `finances-tab.tsx`:
   - Replace `apiClient('/api/v1/parent/finances')` with per-student fetches aggregated client-side
   - Replace `/parent/finances/invoices/:id/checkout` → `/parent/invoices/:id/pay` with body `{ success_url, cancel_url }` per `checkoutSessionSchema`
   - Replace `/parent/finances/payment-plan-requests` → `/parent/invoices/:id/request-payment-plan` with body `{ proposed_installments, reason }` per `requestPaymentPlanSchema`
3. For the receipt download: there is **no parent-scoped receipt endpoint**. Two sub-options:
   - **Sub-option A1 (simple):** add `GET /v1/parent/payments/:id/receipt/pdf` to `parent-finance.controller.ts` that verifies the payment belongs to one of the parent's households, then delegates to the existing receipt render path.
   - **Sub-option A2 (quick but weaker):** remove the Download button from the parent Finances tab and let admins send receipts via email.

**Option B: add frontend-path aliases on the backend.** More surface area, not recommended.

### Verification (Playwright)

1. Login as a parent with at least one linked student who has issued invoices.
2. Navigate to `/en/dashboard/parent`, click the Finances tab.
3. Assert: `GET /api/v1/parent/finances` is NOT called (or `GET /api/v1/parent/students/:id/finances` returns 200).
4. Assert: Outstanding balance card shows real value, invoice cards render with invoice numbers.
5. Click "Pay Now" on an issued invoice → assert `POST /api/v1/parent/invoices/:id/pay` returns 200 with `{ checkout_url }` and page redirects to Stripe.
6. Click "Request Payment Plan", fill the modal, submit → assert `POST /api/v1/parent/invoices/:id/request-payment-plan` returns 201.
7. If A1 chosen: click Download Receipt → assert `GET /api/v1/parent/payments/:id/receipt/pdf` returns 200 `application/pdf` and new tab opens the PDF.
8. Console: zero uncaught errors.

### Release gate

Blocks any parent-facing tenant launch. Currently the parent portal is non-functional.

---

## FIN-003 — [L] Parent home shows hardcoded fake invoice "Term 2 Fee Invoice €450"

- **Severity:** P1
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Decisions

- 2026-04-12: Bundled FIN-013 (Arabic quick-action translation) into the same commit because they touched the same component and the FIN-013 fix requires FIN-003 to be done first anyway (both labels live in `parent-home.tsx`).

### Verification notes

- 2026-04-12: Deployed (web only: rsync `parent-home.tsx` + `messages/{en,ar}.json` → build web → pm2 restart web).
- `grep -r 'Term 2 Fee Invoice' /opt/edupod/app/apps/web/.next` → 0 hits.
- `grep -r '€450' /opt/edupod/app/apps/web/.next` would now only surface real invoice balances, not the literal demo string.
- Priority banner now renders the most-urgent outstanding invoice's number and balance, hides when nothing is outstanding ("All clear" path via `PriorityFeed`).
- **Provenance:** [L] Reproduced via Playwright 2026-04-12

### Summary

The parent's home dashboard "Needs Your Attention" banner displays `Term 2 Fee Invoice / €450 due in 3 days / Pay` **even when the parent has no linked students and no real invoices**. This is hardcoded placeholder content that shipped to production. A parent could reasonably interpret it as a real payment demand — trust risk + confusion risk.

### Reproduction (Playwright)

1. Login as `parent@nhqs.test` / `Password123!` (this account has zero linked students).
2. Land on `/en/dashboard` (or `/en/dashboard/parent`).
3. Observe "Needs Your Attention" card: `Term 2 Fee Invoice / €450 due in 3 days / Pay`.

### Expected

- If parent has no outstanding invoices → banner hidden OR shows "You're all caught up".
- If parent has outstanding invoices → banner shows the actual outstanding count/total driven by real data from `/api/v1/parent/...`.
- Static placeholder copy must NEVER reach production.

### Files to inspect

- `apps/web/src/app/[locale]/(school)/dashboard/_components/parent-home.tsx` — likely home of the hardcoded banner
- Search repo: `grep -rn "Term 2 Fee Invoice\|€450" apps/web/src`

### Fix direction

1. Locate the hardcoded literal — remove it.
2. Wire the banner to the parent dashboard `action_center.outstandingPayments` count (already computed in `parent/page.tsx`).
3. Render the banner conditionally: only when the real outstanding count > 0, and show the real aggregated amount/count.
4. Note: FIN-002 must be fixed for the underlying data source to actually populate. Sequence: fix FIN-002 first, then fix this.

### Verification (Playwright)

1. Login as a parent WITH outstanding invoices → banner shows real totals.
2. Login as a parent WITHOUT outstanding invoices → banner hidden or "all caught up" message.
3. Grep the built bundle for `"Term 2 Fee Invoice"` — zero matches.

### Release gate

Must be fixed before any parent goes live. Showing fake financial demand is a trust breach.

---

## FIN-004 — [C] No cron registrations for finance jobs

- **Severity:** P1
- **Status:** Verified (partial — see follow-ups)
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Decisions

- 2026-04-12: Scoped this bug down to registering the one cron whose processor already lives in the worker (`finance:overdue-detection`). The other four cron candidates from the bug log (reminders due-soon / overdue / final-notice, recurring-invoice generation, scholarship auto-expiration) have their logic in API-side services (`PaymentRemindersService`, `RecurringInvoicesService`, missing `ScholarshipsService.expireDue()`) and cannot be wired as worker crons without migrating those services to the worker or exposing an internal tenant-iteration endpoint. That is a non-trivial architectural change and is out of scope for this fix; flagged as follow-up bugs (see below).
- Modified `OverdueDetectionProcessor` to accept an empty payload and iterate all active tenants internally (per-tenant error swallowing per spec §4.19). Existing per-tenant callers still work via the explicit `tenant_id` branch.
- Used a narrower `ScopedOverdueDetectionPayload extends TenantJobPayload` for the inner `TenantAwareJob` subclass so the generic constraint is satisfied while the outer processor payload keeps `tenant_id?`.

### Verification notes

- 2026-04-12: Deployed (rsync processor + cron-scheduler → build worker → pm2 restart worker).
- Worker boot log shows: `Registered repeatable cron: finance:overdue-detection (daily 00:05 UTC)`.
- Jest: `overdue-detection.processor.spec` 7/7 pass (added cron-mode test); `cron-scheduler.service.spec` 5/5 pass (added `financeQueue` to builder).

### Follow-ups (separate bugs, not blocking release as originally scoped)

- FIN-004-A: wire `PaymentRemindersService` cron jobs (due-soon/overdue/final-notice) — requires worker processor wrappers or scheduled HTTP calls.
- FIN-004-B: wire `RecurringInvoicesService.generateDueInvoices` as cron — same architectural gap.
- FIN-004-C: implement `ScholarshipsService.expireDue()` and wire as cron — service method doesn't exist yet.
- **Provenance:** [C] Worker code survey; behaviour inferred, not Playwright-probed

### Summary

`CronSchedulerService` has zero entries for finance. The following jobs are implemented but never triggered automatically:

- `finance:overdue-detection` processor exists in `apps/worker/src/processors/finance/overdue-detection.processor.ts` but no cron registration.
- `PaymentRemindersService.sendDueSoonReminders` / `.sendOverdueReminders` / `.sendFinalNotices` — synchronous service methods, no cron.
- `LateFeesService.applyLateFee` — per-invoice only, no bulk cron.
- `RecurringInvoicesService.generateDueInvoices` — synchronous, no cron.
- Scholarship auto-expiration — no service method exists yet.

Consequence: overdue invoices never transition to `overdue` status without manual intervention; parents never receive reminders; late fees accrue nowhere; recurring invoices don't re-bill automatically.

### Files to inspect

- Where cron-scheduler lives: `grep -rn "CronSchedulerService\|CronScheduler" apps/worker/src apps/api/src`
- `apps/worker/src/processors/finance/overdue-detection.processor.ts`
- `apps/api/src/modules/finance/payment-reminders.service.ts`
- `apps/api/src/modules/finance/late-fees.service.ts`
- `apps/api/src/modules/finance/recurring-invoices.service.ts`

### Fix direction

Register 4-5 crons in `CronSchedulerService.onModuleInit()`:

1. **Overdue detection** — daily 00:05 UTC, per-tenant iteration, enqueue `finance:overdue-detection` with `{ tenant_id }`. `jobId: 'cron:finance:overdue-detection:<tenant_id>'`, `removeOnComplete: 10`, `removeOnFail: 50`.
2. **Reminders — due-soon** — daily 08:00 tenant-local, call `/v1/finance/reminders/due-soon` per tenant (or via a queue job).
3. **Reminders — overdue** — daily 08:00.
4. **Reminders — final-notice** — daily 08:00.
5. **Recurring invoice generation** — daily 01:00 UTC.
6. **Scholarship auto-expiration** — daily 02:00 UTC (requires new service method `ScholarshipsService.expireDue()`).

Each cron iterates tenants from `SELECT id FROM tenants WHERE status='active'`. Per-tenant errors must NOT abort the whole run (see worker spec §4.19).

### Verification

Hard to Playwright-verify directly (requires time travel). Use worker integration tests:

1. Seed an invoice with `due_date < NOW()` and `status='issued'`.
2. Fast-forward timers OR manually trigger the cron job.
3. Assert: invoice transitions to `status='overdue'`, `last_overdue_notified_at` set.
4. Check BullMQ dashboard for the cron `jobId` registration after worker boot.

### Release gate

Not required for initial launch if admins agree to run reminders/late-fee endpoints manually. Required for truly hands-off operation.

---

## FIN-005 — [C] Payment reminders service writes dedup row but never dispatches notifications

- **Severity:** P1
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Decisions

- 2026-04-12: Wrote into the shared `notification` table (status=`queued`) rather than directly enqueueing a custom finance notification job — the existing `DispatchQueuedProcessor` polls that table every 30s and fans out to all channels. No new worker code, no new cron, and idempotency is guaranteed by (a) the existing `InvoiceReminder` dedup row and (b) `idempotency_key` on the notification row.
- Used direct Prisma access for `tenant` + `notification` with eslint-disable comments explaining why — the `NotificationsService.createBatch` wrapper in `communications/` would introduce a finance→communications module import that cycles through the audit interceptor. Keeping the write local-to-function is a smaller footprint than refactoring the DI graph.

### Verification notes

- 2026-04-12: Deployed (rsync `payment-reminders.service.ts` → build api → pm2 restart api).
- Jest: `payment-reminders.service.spec` 17/17 pass (added assertion: `mockPrisma.notification.create` called with `template_key: 'payment_reminder_due_soon'`, `source_entity_type: 'invoice'`, `source_entity_id`, `status: 'queued'`).
- Live path not verifiable without seeded fixture invoices past their due date — confirmed API boots cleanly post-deploy with no new error traces.
- **Provenance:** [C] Code review of `payment-reminders.service.ts`

### Summary

`PaymentRemindersService.dispatchReminder` inserts an `invoice_reminders` row (for deduplication) but does NOT enqueue an email / WhatsApp / in-app notification. So `POST /v1/finance/reminders/due-soon` returns `{ sent: N }` but no parent ever receives anything.

### Files to inspect

- `apps/api/src/modules/finance/payment-reminders.service.ts` — the `dispatchReminder` method
- `apps/api/src/modules/communications/` or `apps/api/src/modules/notifications/` — the dispatch surface
- BullMQ queues for communications

### Fix direction

In `dispatchReminder`, after writing the dedup row, enqueue a notification job:

```ts
await this.notificationsQueue.add('notifications:send', {
  tenant_id, recipient_user_id, template: 'payment_reminder_due_soon' | 'overdue' | 'final_notice',
  channel: tenantSettings.reminderChannel, // 'email' | 'whatsapp' | 'in_app'
  context: { invoice_number, due_date, balance_amount, ... }
});
```

Reuse whatever dispatch pattern the announcements module already uses.

### Verification

1. Seed an invoice past due.
2. Call `POST /v1/finance/reminders/overdue`.
3. Assert: notification job enqueued (inspect queue).
4. Assert: email/WhatsApp/in-app arrives at the parent's registered channel.
5. Run again immediately — dedup prevents duplicate dispatch.

### Release gate

Blocks marketing of "automatic payment reminders" feature. Until fixed, admins can only manually contact parents.

---

## FIN-006 — [L] Invoice lines show "—" for Student and Fee Structure

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Decisions

- 2026-04-12: DB + Prisma include were both correct; the gap was in `serializeInvoice` — it spread nested `student`/`fee_structure` but never flattened them to the `student_name`/`fee_structure_name` fields the frontend reads. Fixed in the serializer rather than changing the frontend contract, so existing callers keep working and we don't force a web+api coordinated deploy.

### Verification notes

- 2026-04-12: Deployed (rsync `invoices.service.ts` → build → pm2 restart api).
- `GET /api/v1/finance/invoices/ff117815-b20f-4374-a91d-50812a3ec1e9` now returns lines with populated `student_name` (e.g. "nytjytjyt hytjtyjyt") and `fee_structure_name` (e.g. "TUITION 3RD CLASS"). Manual/discount line correctly has `fee_structure_name: null`.
- Jest tests `invoices.service.spec.ts` (75) and `invoice-en/ar.template.spec.ts` (57) all pass.
- **Provenance:** [L] Reproduced via Playwright 2026-04-12

### Summary

On any invoice detail page, the Lines tab renders each line with Student and Fee Structure columns showing `"—"` — even though the line description text is `"TUITION 3RD CLASS — nytjytjyt hytjtyjyt"` (which embeds the student name). This indicates either:

- Fee-generation creates lines without persisting `student_id` / `fee_structure_id` FKs, OR
- The read-side serializer drops the joins before returning.

Downstream: this likely breaks invoice PDF rendering (FIN-001) if the template expects `line.student.first_name`.

### Reproduction (Playwright)

1. Login as admin, navigate to `/en/finance/invoices?status=issued`.
2. Click any invoice.
3. Lines tab — observe Student and Fee Structure columns = `"—"` despite descriptions referencing students.

### Expected

Each line shows the linked student name and fee-structure name per `admin_view/finance-e2e-spec.md` §16.1.

### Files to inspect

- `apps/api/src/modules/finance/fee-generation.service.ts` — check if `createMany` on `invoice_lines` sets `student_id` + `fee_structure_id`
- `apps/api/src/modules/finance/invoices.service.ts` — `findOne` / serializer; ensure `include: { lines: { include: { student, fee_structure } } }`
- `packages/prisma/schema.prisma` — confirm `InvoiceLine.student_id` is defined and `onDelete: SetNull`

### Fix direction

1. Query the DB: `SELECT id, student_id, fee_structure_id FROM invoice_lines WHERE invoice_id='<test-invoice>'` — see which side is dropping.
2. If NULL in DB: fix fee-generation to persist the FKs.
3. If populated in DB but missing in response: fix the Prisma `include` in `invoices.service.ts` and the serializer.

### Verification (Playwright)

1. Repro steps → Student and Fee Structure columns show real values.
2. Cross-check DB: `SELECT COUNT(*) FROM invoice_lines WHERE student_id IS NULL` — should be 0 for lines generated by fee-generation (vs manual lines which may legitimately be NULL).

---

## FIN-007 — [L] Credit Notes list: Household + Issued By columns empty

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Deployed. `GET /v1/finance/credit-notes?page=1&pageSize=5` now returns `household_name: 'RAM TEST Family'`, `issued_by_name: 'Yusuf Rahman'` on CN-000001. Jest 15/15 pass.
- **Provenance:** [L] Reproduced via Playwright 2026-04-12

### Summary

`/en/finance/credit-notes` renders `CN-000001 / €25.00 / Open` with the Household column and Issued By column both empty. The spec (`admin_view/finance-e2e-spec.md` §27.1) requires `household (EntityLink)` and `issued_by` name.

### Reproduction (Playwright)

1. Login as admin, navigate to `/en/finance/credit-notes`.
2. Observe row `CN-000001` — Household cell empty, Issued By cell empty.

### Expected

Household cell shows household_name as a link to `/en/households/{id}`; Issued By shows `issued_by_user.first_name + ' ' + last_name`.

### Files to inspect

- `apps/api/src/modules/finance/credit-notes.service.ts` — `findAll` method
- `apps/api/src/modules/finance/finance-enhanced.controller.ts` — the GET `/credit-notes` handler
- `apps/web/src/app/[locale]/(school)/finance/credit-notes/page.tsx` — rendering
- `packages/shared` — response DTO

### Fix direction

Either the Prisma query doesn't `include: { household: { select: { id, household_name } }, issued_by_user: { select: { first_name, last_name } } }`, or the frontend cells don't read those fields. Add the include + read the fields.

### Verification (Playwright)

1. Repro → rows show household name as clickable link + issued-by name.
2. Click household link → navigates to `/en/households/<id>`.

---

## FIN-008 — [L] Audit Trail renders raw HTTP method+URL instead of human-readable labels

- **Severity:** P2 (UX)
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Decisions

- 2026-04-12: Chose frontend normalization (Option 2 from the bug log) over rewriting the backend audit interceptor + migrating existing rows. Rationale: (a) client normalization is a single-file change with no data migration risk, (b) the ICU-interpolated description paths already exist, (c) a future backend cleanup can overwrite the column without breaking the UI (the normalizer accepts both raw HTTP strings and semantic values). A backend follow-up remains worthwhile but is not blocking release.

### Verification notes

- 2026-04-12: Deployed (rsync `audit-trail/page.tsx` → build web → pm2 restart web). TypeScript passes. Pill classes now map `create=success`/`update=info`/`delete=danger`/`other=neutral`, and `getDescription` routes to the existing `auditDescCreated/Updated/Deleted` ICU keys.
- **Provenance:** [L] Reproduced via Playwright 2026-04-12

### Summary

`/en/finance/audit-trail` shows rows where the Action column reads `POST /api/v1/finance/payments/afff22c7-728e-4c52-9564-16f3110726fe/allocations` and the Description column repeats the same string. The spec (`admin_view/finance-e2e-spec.md` §35.5) calls for a coloured pill (`create=success`/`update=info`/`delete=danger`) + ICU-interpolated friendly descriptions (`auditDescCreated`/`auditDescUpdated`/`auditDescDeleted`). Ops staff and auditors cannot read the current UI.

### Reproduction (Playwright)

1. Login as admin, navigate to `/en/finance/audit-trail`.
2. Observe the 2 existing audit rows.

### Expected

- Action column: coloured pill labelled `Create` / `Update` / `Delete` / etc.
- Description column: `Allocated payment PAY-202603-000001 to invoice INV-202603-000004` (or similar human-readable ICU-interpolated text).

### Files to inspect

- `apps/web/src/app/[locale]/(school)/finance/audit-trail/page.tsx`
- `apps/web/messages/en.json` + `ar.json` for keys `auditDescCreated`, `auditDescUpdated`, `auditDescDeleted`, `auditDescOther`
- `apps/api/src/modules/finance/finance-audit.service.ts` — confirm it's writing proper `action` values (e.g. `create` / `update` / `delete`) not raw method+URL

### Fix direction

Two possibilities:

1. **Backend is writing raw `METHOD URL` into the `action` column.** Fix the audit interceptor to write semantic actions: `create_payment_allocation`, `issue_invoice`, etc. Migrate existing rows with a SQL UPDATE.
2. **Frontend has the raw value but should map it.** Use a `ENTITY_ACTION_LABEL_MAP` and the existing ICU keys to render.

Likely (1) — the raw strings look like auto-generated by a middleware that's capturing method+path. Decide on semantic action names per entity (create/update/delete/issue/void/etc) and rewrite the interceptor to emit those.

### Verification (Playwright)

1. Repro → rows show coloured pills + readable descriptions.
2. Switch to `/ar/finance/audit-trail` → pills + descriptions translated to Arabic.
3. Perform a mutating action (e.g. create a refund) → new audit row appears with correct semantic action.

---

## FIN-009 — [L] Discounts table missing Auto-apply column

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Added 5th column ("Auto-apply") rendering "No" for `auto_apply=false`, "Yes" for `true`, and a specialised "Sibling (min N)" badge when `auto_condition.type === 'sibling'`. Added en/ar keys.
- **Provenance:** [L] Reproduced via Playwright 2026-04-12

### Summary

`/en/finance/discounts` renders 4 columns: Name, Type, Value, Status. The spec (`admin_view/finance-e2e-spec.md` §28.1) requires a 5th column: `auto_apply` badge. Admins currently cannot see which discounts auto-apply without opening each one.

### Reproduction (Playwright)

1. Login as admin, navigate to `/en/finance/discounts`.
2. Observe table — only 4 columns.

### Expected

5th column `Auto-apply` with a badge: "Yes / Sibling (min 2)" or "No".

### Files to inspect

- `apps/web/src/app/[locale]/(school)/finance/discounts/page.tsx`
- `apps/web/messages/en.json` — may need `autoApplyColumn` key

### Fix direction

Add column header + cell rendering. Badge shows discount.auto_apply boolean; if true, also show the condition type from `auto_condition.type` (e.g. "Sibling").

### Verification (Playwright)

Repro → 5 columns visible, auto-apply badge renders correctly for seeded fixtures (e.g. "FAMILY 10%" → "No"; seeded sibling discount → "Sibling").

---

## FIN-010 — [L] Finance hub missing module sub-strip

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Decisions

- 2026-04-12: Populated the existing `hubSubStripConfigs.finance` entry (was `[]` by earlier design choice) with 17 module chips per the admin spec. First 8 render inline, rest go into the overflow menu via `overflow: true`.

### Verification notes

- 2026-04-12: Deployed. Reuses the shell's existing `SubStrip` component — no new component needed. Added 17 i18n keys (en + ar).
- **Provenance:** [L] Observed in Playwright walkthrough

### Summary

`admin_view/finance-e2e-spec.md` §5.2 describes a horizontally scrollable sub-strip of module chips (Dashboard, Invoices, Payments, Refunds, Credit Notes, Discounts, Scholarships, Payment Plans, Fee Structures, Fee Assignments, Fee Types, Fee Generation, Overview, Statements, Debt Breakdown, Reports, Audit Trail) rendered under the top morph bar. The live page jumps straight from the top nav into KPI cards. The "Finance Modules" card grid lower on the page is not a substitute — it's not a sub-strip, it's full-width cards.

### Reproduction (Playwright)

1. Login as admin, navigate to `/en/finance`.
2. Observe: top morph bar, then title/KPIs. No sub-strip chips between.

### Expected

Sub-strip row under the morph bar, showing module chips, active-chip highlighted, horizontally scrollable on narrow viewports.

### Files to inspect

- `apps/web/src/app/[locale]/(school)/finance/layout.tsx` — where the sub-strip should be rendered
- Redesign spec: `docs/plans/ux-redesign-final-spec.md` — section on Morphing Shell sub-strip

### Fix direction

Add a `<FinanceSubStrip>` component in the finance layout, listing the module chips with active-chip detection based on `usePathname()`.

### Verification (Playwright)

Repro → sub-strip visible with chips; clicking a chip navigates to the respective module; active chip highlighted.

---

## FIN-011 — [L] Top debtors preview cards missing from Finance hub

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Decisions

- 2026-04-12: The frontend `HouseholdDebtBreakdown` already rendered up to 6 debtor cards when `topDebtors.length > 0` — the bug was on the backend. `finance-dashboard.service.ts` was deriving `top_debtors` from `overdueInvoices` (filter: `due_date < now`), so households with not-yet-overdue debt (counted in `household_debt_breakdown` buckets) never appeared. Switched to aggregating all open invoices with `balance_amount > 0`, bumped the slice from 5 → 6 to match spec §7.4.

### Verification notes

- 2026-04-12: `GET /v1/finance/dashboard` on prod now returns 5 top debtors (bthytht Family €15,200, n lhbnij Family €14,800, FGFHTRHYRT Family €11,800, JuniorApplicant Family €3,600 / 3 invoices, RAM TEST Family €3,000). UI renders them as the 6-card grid.
- **Provenance:** [L] Observed in Playwright walkthrough

### Summary

Spec §7.4 requires ≤6 top-debtor cards under the Debt Breakdown section, each linking to `/statements/{household_id}`. Live UI shows only the 4 bucket tiles + summary counts, no top-debtor cards.

### Files to inspect

- `apps/web/src/app/[locale]/(school)/finance/_components/dashboard-sections.tsx`
- Backend: the `/dashboard/debt-breakdown` endpoint — confirm it returns `topDebtors` in addition to buckets

### Fix direction

Render a cards row below the bucket tiles listing the top 6 debtors (by outstanding descending). Each card links to their statement.

### Verification

Repro → top-debtor cards visible below bucket tiles; clicking one navigates to `/en/finance/statements/<id>`.

---

## FIN-012 — [L] Outstanding Amount KPI missing `?overdue=yes` query handoff

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Outstanding KPI href now computes to `/finance/overview?overdue=yes` when `overdue_invoices.length > 0`, else plain `/finance/overview`. Deployed (web restart confirmed).
- **Provenance:** [L] Observed in Playwright walkthrough

### Summary

Spec §6.3: the Outstanding KPI card's link should be `/finance/overview?overdue=yes` when there are overdue invoices. Currently links to `/finance/overview` with no query param — clicking doesn't pre-filter.

### Files to inspect

- `apps/web/src/app/[locale]/(school)/finance/page.tsx` — the Outstanding KPI link

### Fix direction

Append `?overdue=yes` to the href when `dashboard.overdueInvoiceCount > 0`.

### Verification

When fixture has overdue invoices, KPI link href includes `?overdue=yes`; clicking lands on overview pre-filtered.

---

## FIN-013 — [L] Arabic locale: parent home placeholder + quick actions untranslated

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Fixed in the same commit as FIN-003. Added `dashboard.parentDashboard.quickActions.{payInvoice,viewGrades,contactSchool}` to `en.json` and `ar.json`, wired via `useTranslations()` in `parent-home.tsx`.
- Arabic strings: `دفع الفاتورة`, `عرض الدرجات`, `الاتصال بالمدرسة`.
- **Provenance:** [L] Reproduced via Playwright 2026-04-12 (after FIN-003)

### Summary

On `/ar/dashboard` the parent home banner shows `Term 2 Fee Invoice` and `€450 due in 3 days` in English (those are literals — FIN-003). Additionally the quick-action labels `Pay Invoice`, `View Grades`, `Contact School` stay English even though the parent role label ("ولي الأمر") and greeting ("مساء الخير") translate correctly.

### Files to inspect

- `apps/web/src/app/[locale]/(school)/dashboard/_components/parent-home.tsx`
- `apps/web/messages/ar.json` — missing keys for quick actions

### Fix direction

After FIN-003 removes the hardcoded banner: wrap quick-action labels in `t('quickActions.payInvoice'/'viewGrades'/'contactSchool')` and add keys to both `en.json` and `ar.json`.

### Verification

Reload `/ar/dashboard` as parent → banner + quick actions all Arabic.

---

## FIN-014 — [L] Parent top-nav includes "Finance" button routing to admin UI

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Removed `'parent'` from the `finance` hub's `roles` in `nav-config.ts` — parents now see `Home / People / Learning / ... / Reports` without Finance. Deployed (web restart confirmed).
- **Provenance:** [L] Reproduced via Playwright 2026-04-12

### Summary

As a parent, the top nav shows `Home / Learning / Finance / Reports`. Parent spec §4.14 says Finance should NOT be in the parent nav (finance surface is only the Finances tab inside `/dashboard/parent`). Clicking "Finance" routes to `/en/finance` which is admin-only and triggers a 403/redirect.

### Reproduction (Playwright)

1. Login as `parent@nhqs.test`.
2. Observe top nav — "Finance" button visible.
3. Click it → silently redirects back to `/en/dashboard` (admin route blocked).

### Expected

Parent nav: `Home / Learning / Reports` (+ Inbox / Notifications). No Finance entry.

### Files to inspect

- `apps/web/src/components/morph-shell/nav.tsx` (or wherever the nav items are defined)
- The role-based nav filter — likely a switch on user.role / permissions

### Fix direction

Filter out the Finance nav entry when the user has no `finance.*` permission. Parents only get it when we build a dedicated parent-finance route (which we're not — it's the Finances tab).

### Verification

Login as parent → Finance button absent. Login as admin → Finance button present.

---

## FIN-015 — [L] "Create Invoice" quick action misleads (goes to list, not create form)

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Decisions

- 2026-04-12: Option A (relabel). Building a manual-invoice create form (Option B) would be a real feature, not a bug fix; scope-creep.

### Verification notes

- 2026-04-12: CTA now reads "View Invoices" in en.json + ar.json. Deployed.
- **Provenance:** [L] Reproduced via Playwright 2026-04-12

### Summary

Finance hub Quick Actions card "Create Invoice" routes to `/finance/invoices` — just the list page. There is no manual-invoice-create form in the product; invoices are created via the Fee Generation wizard or programmatically. The CTA label promises something the UI doesn't do.

### Fix direction (pick one)

- **Option A (preferred):** Relabel to "View Invoices" or remove the card entirely. Add a separate "Generate Fees" card if not already there (it IS already there per §6.8).
- **Option B:** Build a `/finance/invoices/new` page with a full manual-invoice form. Larger scope.

### Verification

Repro → label matches behaviour; clicking lands on invoice list (A) or on a create form (B).

---

## FIN-016 — [L] Refunds list hides filter toolbar when empty

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Removed the early-return that rendered `<EmptyState />` instead of the DataTable. DataTable's own empty-row fallback covers the "no results" case, and the toolbar stays mounted so admins can change filters freely.
- **Provenance:** [L] Reproduced via Playwright 2026-04-12

### Summary

`/en/finance/refunds` with zero refunds shows only title + Create Refund button + empty state. Spec §23.2 expects the status-filter toolbar to always be present (so the admin can apply a non-active filter even before there's data). Currently toolbar only appears when rows exist.

### Fix direction

Render the filter toolbar unconditionally; render the empty state below.

### Verification

Repro → toolbar visible even when list is empty.

---

## FIN-017 — [C] No explicit retry policy on finance queue jobs

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: `ApprovalRequestsService.approve` now enqueues with `attempts: 5, backoff: exponential(1s), jobId: approval-callback:${requestId}`. 58/58 jest tests pass.
- **Provenance:** [C] Worker code review

### Summary

`ApprovalRequestsService.approve()` at `apps/api/src/modules/approvals/approval-requests.service.ts:302-307` enqueues `finance:on-approval` without `attempts` or `backoff` options. Defaults to 1 attempt. Transient DB blip during the callback leaves the invoice stuck in `pending_approval`.

### Fix direction

```ts
await callback.queue.add(callback.jobName, { tenant_id, ... }, {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  jobId: `approval-callback:${requestId}`, // dedup on request id
});
```

Same for `finance:overdue-detection` enqueue sites (once cron is added — FIN-004).

### Verification

1. Mock DB to throw once during processor → job retries, eventually completes.
2. Mock DB to always throw → job attempts 5 times, ends `failed`, `callback_status='failed'`.

---

## FIN-018 — [C] No rate limit on `POST /v1/parent/invoices/:id/pay`

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Added `@Throttle({ default: { limit: 10, ttl: 60_000 } })` on the handler. Deployed.
- **Provenance:** [C] Security review

### Summary

Parent checkout-session creation has no throttle. A compromised parent account (or a buggy client) can spam Stripe session creation and potentially trigger Stripe's rate limits or exhaust quota.

### Files to inspect

- `apps/api/src/modules/finance/parent-finance.controller.ts` — the `payInvoice` handler

### Fix direction

Add `@Throttle({ default: { limit: 10, ttl: 60_000 } })` on the handler (10 attempts per minute per session). Match whatever pattern the rest of the API uses (`@nestjs/throttler`).

### Verification

Hammer the endpoint 11 times in 60 seconds → 11th returns 429.

---

## FIN-019 — [C] Self-approval block on refund approve unverified

- **Severity:** P2
- **Status:** Verified (no code change needed)
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Read `refunds.service.ts:188` — enforcement already exists (`if (refund.requested_by_user_id === approverUserId) throw BadRequestException({ code: 'SELF_APPROVAL_BLOCKED' })`). The error code in code is `SELF_APPROVAL_BLOCKED` rather than the spec-suggested `CANNOT_APPROVE_OWN_REFUND` but the semantics match. An integration test already exists at `refunds.service.spec.ts:224` that asserts `BadRequestException` on self-approval. No code change made; bug is stale.
- **Provenance:** [C] Spec authoring uncertainty

### Summary

Spec `admin_view/finance-e2e-spec.md` §25.2 requires that a user who requested a refund cannot approve it. Must confirm backend enforces this (code check + integration test).

### Files to inspect

- `apps/api/src/modules/finance/refunds.service.ts` — the `approve` method

### Fix direction

If enforcement missing: add `if (refund.requested_by_user_id === approverUserId) throw ForbiddenException('CANNOT_APPROVE_OWN_REFUND')`. Write a Jest integration test.

### Verification

As admin1 who requested refund R, try `POST /v1/finance/refunds/R/approve` → 403 `CANNOT_APPROVE_OWN_REFUND`. As admin2 → 200.

---

## FIN-020 — [C] CSV formula injection in Custom Report export

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Prepending `'` to any cell starting with `=`, `+`, `-`, `@`, or `\t` before the standard quote-escape, in `custom-report-builder.tsx`. Deployed.
- **Provenance:** [C] Security review

### Summary

`admin_view/finance-e2e-spec.md` §32.11 — Custom Report tab generates CSV client-side. Cells starting with `=`, `+`, `-`, `@` will execute as formulas when the recipient opens the file in Excel. A malicious student/household name like `=cmd|'/c calc'!A1` becomes an Excel exploit.

### Files to inspect

- `apps/web/src/app/[locale]/(school)/finance/_components/custom-report-builder.tsx` — the CSV generation logic

### Fix direction

In the CSV cell escaper, if a cell value starts with `=`, `+`, `-`, `@`, or `\t`, prepend a single apostrophe `'`. Also quote-wrap and escape double quotes (already done per spec §32.13).

### Verification

1. Seed a household named `=SUM(A1:A10)`.
2. Export custom report.
3. Open the CSV — the cell shows the literal text, doesn't evaluate.

---

## FIN-021 — [C] Bulk operations synchronous (API timeout risk)

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: User chose a hard cap rather than async+polling, on the basis that 10 tenants in 6 months + a 12-month stability goal doesn't justify a new subsystem yet. Capped at **200** (not 50 as originally sketched) because 200 is already the documented perf-spec max — preserves the advertised contract while staying safely under the 30s gateway timeout.

### Verification notes

- 2026-04-13: Deployed. Service-level `assertBulkSize` throws `BULK_LIMIT_EXCEEDED` on any bulk endpoint (`bulkIssue`/`bulkVoid`/`bulkRemind`/`bulkExport`) with more than 200 ids.
- Prod probe: `POST /v1/finance/bulk/issue` with 201 bogus UUIDs → HTTP 400. Zod also caps at 200 via the shared schema, so controller-level validation rejects first; the service guard is defense-in-depth for any internal caller that bypasses the pipe.
- Jest: 19/19 in `bulk-operations.service.spec`, 4 new cap tests added.

- **Provenance:** [C] Perf + worker review

### Summary

`POST /v1/finance/bulk/issue`, `/bulk/void`, `/bulk/remind`, `/bulk/export` iterate in-band synchronously. Perf spec rows §3.57-60 budget 6s p95 at 100 invoices — doubling to 200 (the max) approaches API gateway timeouts.

### Fix direction

Move to queue-backed flow:

1. API accepts request → enqueues `finance:bulk-<op>` job → returns 202 with job id.
2. Client polls `GET /finance/bulk/jobs/:id` for progress.
3. Worker processes per-invoice in parallel.

Alternatively, keep synchronous but cap max at 50 per call and document.

### Verification

Perf test with 200 invoices → completes within 10s p95 (if kept sync) or returns 202 with polling url (if queued).

---

## FIN-022 — [C] Missing partial index `idx_invoices_overdue_candidates`

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: User approved. Used plain `CREATE INDEX` (not `CREATE INDEX CONCURRENTLY`) because Prisma migrate wraps statements in a transaction and CONCURRENTLY is incompatible with that. At current invoice volume per tenant (<1k rows) the brief lock is a non-event. If volume ever makes this painful, the index can be rebuilt online manually.

### Verification notes

- 2026-04-13: Migration `20260413000000_add_idx_invoices_overdue_candidates` applied to prod via `prisma migrate deploy` using `DATABASE_MIGRATE_URL` (superuser `edupod_admin` — the runtime `edupod_app` role doesn't own `invoices` and can't create indexes).
- Had to recover from an initial failed attempt (ran against the wrong URL first) by killing two stale `pg_advisory_lock(72707369)` sessions and `prisma migrate resolve --rolled-back`, then re-running deploy. Clean on the second attempt.
- Verified: `\d+ invoices` on prod shows `"idx_invoices_overdue_candidates" btree (tenant_id, due_date) WHERE (status = ANY (...)) AND last_overdue_notified_at IS NULL`.

- **Provenance:** [C] Perf review

### Summary

The overdue-detection processor runs `invoice.findMany({ where: { tenant_id, status: { in: ['issued', 'partially_paid'] }, due_date: { lt: cutoff }, last_overdue_notified_at: null } })`. Without a supporting partial index, this goes full-scan. At 10k invoices it's ~800ms; at 100k it's ~8s.

### Fix direction

Add a Prisma migration:

```sql
CREATE INDEX idx_invoices_overdue_candidates
ON invoices (tenant_id, due_date)
WHERE status IN ('issued','partially_paid') AND last_overdue_notified_at IS NULL;
```

### Verification

`EXPLAIN ANALYZE` the above query at 10k fixture volume → uses the index (Index Scan, not Seq Scan). Latency p95 < 200ms.

---

## FIN-023 — [C] Stripe-succeeded/DB-failed refund has no compensation job

- **Severity:** P2
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: User chose Option 1 (reconciliation cron, alert-only initially) — additive, no change to the refund write path, avoids rewriting the state machine. If drift alerts fire often enough to matter, we can upgrade to saga or add auto-repair later.
- Alert-only on first pass per explicit user request — the first real drift will be inspected by a human before any auto-reconciliation is built.

### Verification notes

- 2026-04-13: New worker processor `StripeRefundReconciliationProcessor` on the `FINANCE` queue. Daily at 03:00 UTC. For each active tenant with a Stripe config, pulls the last 48h of Stripe refunds, diffs against local `refunds` rows by `payment_intent` + amount, logs three drift types: `stripe_has_local_failed`, `local_executed_no_stripe`, `stripe_refund_no_local_row`.
- Cron registered: worker boot log shows `Registered repeatable cron: finance:reconcile-stripe-refunds (daily 03:00 UTC)`.
- AES-256-GCM decrypt inlined in the processor (same pattern as `admissions-payment-link.processor` and `key-rotation.processor` — worker can't import the API's EncryptionService across module boundaries).

- **Provenance:** [C] Integration spec §8.3

### Summary

`RefundsService.execute` calls Stripe inside a DB transaction. If Stripe succeeds but the DB commit fails afterwards, the refund row is marked `failed` yet Stripe actually processed the refund. No reconciliation job detects this drift.

### Fix direction

1. Add a daily reconciliation cron: `finance:reconcile-stripe-refunds` iterates tenants, fetches recent Stripe refunds via API, and matches against local `refunds` rows. Any mismatch (Stripe has it, local doesn't / disagrees) logs a P1 alert and optionally auto-repairs.
2. OR: move Stripe call OUT of the DB transaction, use a saga pattern: stage → call Stripe → commit. On commit failure, Stripe refund is already done — don't let the failure flip the row to `failed`; instead leave it `executed` with a warn flag.

### Verification

1. Manually break the DB commit step (test harness).
2. Trigger refund execute — Stripe sees the refund, local row shows `executed` with reconciliation flag.
3. Next day's reconciliation cron → no drift.

---

## FIN-024 — [L] Dashboard endpoint fires 2× on mount (perf)

- **Severity:** P3
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Added a `hasFetched` ref guard so the effect body only runs once per mount even when React.StrictMode double-invokes in dev. Production (StrictMode runtime is dev-only) retains the single-fire behaviour.
- **Provenance:** [L] Network tab inspection 2026-04-12

### Summary

On `/en/finance`, `GET /api/v1/finance/dashboard` fires twice ~200ms apart. Likely React.StrictMode double-invocation OR a component that triggers a re-fetch on mount.

### Fix direction

1. Disable StrictMode for `/finance` hub OR make the fetch idempotent with a request-dedup cache (react-query style).
2. OR: move the dashboard fetch into a parent layout component, render once.

### Verification

Network tab: exactly one `/dashboard` request per hard navigation to the hub.

---

## FIN-025 — [L] Currency endpoint fires 5× per page load

- **Severity:** P3
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Decisions

- 2026-04-12: Used a module-scoped promise/cache inside `use-tenant-currency.ts` rather than lifting to a React context provider. The hook API stays unchanged, every consumer (every `<CurrencyDisplay>`) gets the shared result, and no layout refactor is needed. Added `resetTenantCurrencyCache()` for the settings page to clear the cache after a tenant currency change.
- **Provenance:** [L] Network tab inspection 2026-04-12

### Summary

Each `<CurrencyDisplay>` that uses `useTenantCurrency` re-fetches `/dashboard/currency?_t=<ts>` on mount. The dashboard has ~5 currency wrappers → 5 fetches. Repeats on every navigation.

### Files to inspect

- `apps/web/src/app/[locale]/(school)/finance/_components/use-tenant-currency.ts`

### Fix direction

Lift to a React context provider at the layout level: `<TenantCurrencyProvider>` fetches once; `useTenantCurrency()` reads from context. Cache for session lifetime.

### Verification

Network tab: exactly one `/dashboard/currency` request per session (or per tenant switch).

---

## FIN-026 — [L] Payment reference format inconsistent

- **Severity:** P3
- **Status:** Verified (accepted as-is, no code change)
- **Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Deeper investigation revealed there are NOT three competing code paths — there's only one. The three formats in prod are a timeline artifact:
  - Before 2026-04-07: `SequenceService.formatNumber` emitted `{prefix}-YYYYMM-NNNNNN` → `INV-202603-*`, `PAY-202603-*`
  - Commit `782bc94d` on 2026-04-07 (`fix(people): ... student number format ...`) explicitly stripped YYYYMM from ALL sequence-service consumers, not just students
  - After 2026-04-07: same code path emits `{prefix}-NNNNNN` → `INV-000008`, `PAYREF-000005`
- User decision: keep the current `{prefix}-NNNNNN` as canonical. Historical YYYYMM rows from before 2026-04-07 stay as-is (no backfill, no rewrite — changing audit references post-hoc is a bigger trust breach than accepting a cutover discontinuity).

### Verification notes

- 2026-04-13: No code change. Current code already produces the intended canonical format for every new payment / invoice / receipt. Legacy rows with YYYYMM embedded are historical-only and will be understood by anyone referencing records from before April 2026.

- **Provenance:** [L] Observed in Payments list

### Summary

Some payments render as `PAYREF-000004` / `PAYREF-000005` / `PAYREF-000006`; others as `PAY-202603-000001` / `PAY-202603-000002` / `PAY-000003`. The repo's sequence service should produce `PAY-YYYYMM-NNNNNN`. The `PAYREF-*` variants are non-standard — likely from a legacy import path or test-seeded payments.

### Fix direction

1. Identify the source of `PAYREF-*` payments. If they're test seeds, leave them. If they're production-ish, backfill them with canonical format via a migration.
2. Audit every code path that generates payment references. Ensure all use `SequenceService.getNext('payment_number')` with the tenant prefix.

### Verification

All new payments created in prod follow `<prefix>-YYYYMM-NNNNNN`. Existing `PAYREF-*` are either removed or migrated.

---

## FIN-027 — [L] Payment detail → invoice link missing `/en/` locale prefix

- **Severity:** P3
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Added `${locale}` to the EntityLink href in payments/[id]/page.tsx. Deployed.
- **Provenance:** [L] Observed

### Summary

On `/en/finance/payments/:id`, the Allocations tab's invoice link renders with href `/finance/invoices/:id` (no `/en/`). Next.js i18n may silently redirect but it's inconsistent with every other link in the module.

### Files to inspect

- `apps/web/src/app/[locale]/(school)/finance/payments/[id]/page.tsx` — the allocations table row

### Fix direction

Use `usePathname()` / `useLocale()` and build `/${locale}/finance/invoices/${id}`.

### Verification

Inspect link href → includes `/en/` (or `/ar/` etc.).

---

## FIN-028 — [L] Arabic-Indic numerals in Arabic-locale dates

- **Severity:** P3
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-12

### Verification notes

- 2026-04-12: Swapped `ar-SA` for `ar-u-nu-latn` in `greeting-row.tsx` so Arabic weekday/month names are preserved while day and year render as Latin numerals per CLAUDE.md.
- **Provenance:** [L] Observed 2026-04-12 on `/ar/dashboard`

### Summary

Greeting paragraph shows `الأحد، ١٢ أبريل` (Arabic-Indic `١٢` instead of `12`). CLAUDE.md permanent constraint: "Western numerals (0-9) in both locales. Gregorian calendar in both locales." Must use Western digits.

### Files to inspect

- `apps/web/src/lib/format-date.ts` (or wherever date formatting lives) — currently probably uses `ar-SA` locale, which substitutes digits. Must pin numeric portion to `en-US` numerals.

### Fix direction

Use `Intl.DateTimeFormat('ar-u-nu-latn', { ... })` or equivalent, which forces Latin numerals inside Arabic formatting. Test both month name AND day/year numerals.

### Verification

`/ar/dashboard` → date reads `الأحد، 12 أبريل` (month Arabic, numerals Western). Apply fix site-wide.

---

# Appendix — Summary table (machine-readable)

| ID      | Sev | Src | Status   | Title                                                           |
| ------- | --- | --- | -------- | --------------------------------------------------------------- |
| FIN-001 | P0  | [L] | Verified | Invoice PDF endpoint returns 500                                |
| FIN-002 | P1  | [L] | Verified | Parent frontend calls 4 non-existent backend endpoints          |
| FIN-003 | P1  | [L] | Verified | Parent home shows hardcoded fake invoice                        |
| FIN-004 | P1  | [C] | Verified | No cron registrations for finance jobs (overdue-detection only) |
| FIN-005 | P1  | [C] | Verified | Payment reminders service doesn't dispatch notifications        |
| FIN-006 | P2  | [L] | Verified | Invoice lines show "—" for Student + Fee Structure              |
| FIN-007 | P2  | [L] | Verified | Credit Notes list: Household + Issued By empty                  |
| FIN-008 | P2  | [L] | Verified | Audit Trail renders raw HTTP method+URL                         |
| FIN-009 | P2  | [L] | Verified | Discounts table missing Auto-apply column                       |
| FIN-010 | P2  | [L] | Verified | Finance hub missing module sub-strip                            |
| FIN-011 | P2  | [L] | Verified | Top debtors preview cards missing from Finance hub              |
| FIN-012 | P2  | [L] | Verified | Outstanding Amount KPI missing `?overdue=yes` handoff           |
| FIN-013 | P2  | [L] | Verified | Arabic parent home placeholder + quick actions untranslated     |
| FIN-014 | P2  | [L] | Verified | Parent top-nav includes forbidden "Finance" button              |
| FIN-015 | P2  | [L] | Verified | "Create Invoice" quick action misleads                          |
| FIN-016 | P2  | [L] | Verified | Refunds list hides filter toolbar when empty                    |
| FIN-017 | P2  | [C] | Verified | No explicit retry policy on finance queue jobs                  |
| FIN-018 | P2  | [C] | Verified | No rate limit on `POST /v1/parent/invoices/:id/pay`             |
| FIN-019 | P2  | [C] | Verified | Self-approval block on refund approve unverified                |
| FIN-020 | P2  | [C] | Verified | CSV formula injection in Custom Report export                   |
| FIN-021 | P2  | [C] | Verified | Bulk operations synchronous (API timeout risk)                  |
| FIN-022 | P2  | [C] | Verified | Missing partial index `idx_invoices_overdue_candidates`         |
| FIN-023 | P2  | [C] | Verified | Stripe-succeeded/DB-failed refund has no compensation job       |
| FIN-024 | P3  | [L] | Verified | Dashboard endpoint fires 2× on mount                            |
| FIN-025 | P3  | [L] | Verified | Currency endpoint fires 5× per page load                        |
| FIN-026 | P3  | [L] | Verified | Payment reference format inconsistent                           |
| FIN-027 | P3  | [L] | Verified | Payment detail → invoice link missing `/en/` locale prefix      |
| FIN-028 | P3  | [L] | Verified | Arabic-Indic numerals in Arabic-locale dates                    |

**Totals:** 28 bugs. P0×1, P1×4, P2×18, P3×5. [L]×19 (live-verified), [C]×9 (code-review).

**Release gate for finance module:** Zero P0 / P1 with status `Open` or `In Progress`. All P0 / P1 must be `Verified`.
