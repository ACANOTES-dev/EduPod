# Admissions Module — Consolidated Bug Log

**Module:** Admissions (`/5_operations/admissions`)
**Log opened:** 2026-04-12
**Last updated:** 2026-04-13 (Session 3 re-attempt via API curl probes — ADM-043 added, ADM-016 repro verified)
**Sources merged:**

- `PLAYWRIGHT-WALKTHROUGH-RESULTS.md` (live-verified, `[L]` provenance)
- `admin_view/admissions-e2e-spec.md` §35 (15 code-review observations, `[C]`)
- `parent_view/admissions-e2e-spec.md` §14 (6 observations, `[C]`)
- `integration/admissions-integration-spec.md` §13 (10 observations, `[C]`)
- `worker/admissions-worker-spec.md` §9 (8 observations, `[C]`)
- `perf/admissions-perf-spec.md` §13 (8 observations, `[C]`)
- `security/admissions-security-spec.md` §14 (15 observations, `[C]`)
- `RELEASE-READINESS.md` §cross-cutting concerns (3 unified rows)

---

## Workflow instructions for agents picking up a bug

Every bug in this log is self-contained: it names the affected files, a concrete fix direction, and verification steps. You do **not** need to re-read the full spec pack to work a single bug. Before starting:

1. **Check the status** — if a row is `In Progress` or `Blocked`, coordinate rather than duplicate.
2. **Read the bug** end-to-end (summary, repro, expected, files, fix direction, verification).
3. **Transition the status:**
   - `Open → In Progress` when you start work. Add your handle + date in the Notes column.
   - `In Progress → Fixed` **only after local type-check + lint + tests pass**.
   - `Fixed → Verified` **only after Playwright verification on production** (follow the bug's "Verification" steps). This is the gate before a merge.
   - `In Progress → Blocked` when something external is required. Add the blocker in Notes.
   - `In Progress → Won't Fix` only with explicit product-owner approval in Notes.
4. **Commit-message format:** `fix(admissions): {bug-id} — {short summary}`. Include `Refs: {bug-id}` in the body if multiple commits.
5. **Verification is mandatory.** The walkthrough target is `https://nhqs.edupod.app` (Nurul Huda tenant). Every `Fixed → Verified` transition requires a Playwright (or headed browser) repro showing the fix.
6. **Don't silently group bugs.** If two bugs share a root cause, fix them in one commit but transition both IDs individually with cross-references in Notes.
7. **Release-gate note per bug** tells you whether the fix must ship before tenant go-live or can be backlogged.

Status taxonomy: `Open` · `In Progress` · `Fixed` · `Verified` · `Blocked` · `Won't Fix`.
Provenance: `[L]` live-verified during the 2026-04-12 Playwright walkthrough · `[C]` identified during code review when producing the spec pack.

---

## P0 — data loss or unusable feature

### ADM-001 [L] — Hub "Overrides Log" CTA leads to a broken page

- **Provenance:** `[L]` live-verified (Playwright).
- **Summary:** Clicking the "Overrides Log" tile on the admissions hub navigates to `/en/admissions/overrides`, which falls through to the dynamic `[id]/page.tsx` route and crashes with a 400 from `/api/v1/applications/overrides` (not a UUID) → UI renders "Application not found". Two console errors emitted.
- **Severity:** P0 — a documented, always-visible entry point to a core audit feature is completely broken in production.
- **Reproduction:**
  1. Login as `owner@nhqs.test` at `https://nhqs.edupod.app`.
  2. Navigate to `/en/admissions`.
  3. Click the "Overrides Log" card (bottom row).
  4. Page shows "Back · Application not found · It may have been removed or is not visible in this tenant."
  5. Devtools → Network shows `GET /api/v1/applications/overrides` → 400. Console: `[AdmissionsDetailPage]` error.
- **Expected:** A dedicated overrides-audit page that calls `GET /v1/admission-overrides` (paginated) and renders the list of overrides with actor, justification, amount, type, date.
- **Affected files:**
  - `apps/web/src/app/[locale]/(school)/admissions/page.tsx` — the hub tile's `onClick` / href.
  - `apps/web/src/app/[locale]/(school)/admissions/[id]/page.tsx` — currently catching `/overrides` because no sibling directory exists.
  - `apps/web/src/app/[locale]/(school)/admissions/overrides/page.tsx` — **does not exist; needs to be created.**
  - Backend: `GET /v1/admission-overrides` already exists per admin spec §34 endpoint map.
- **Fix direction:**
  - Option A (preferred): Create `apps/web/src/app/[locale]/(school)/admissions/overrides/page.tsx` that calls `GET /api/v1/admission-overrides?page=1&pageSize=20` and renders a table with columns (application number, student, approver, override type, actual / expected amount, justification, created_at). Keep the hub tile's navigation pointing at `/admissions/overrides`.
  - Option B: Rewrite the hub tile's click handler to navigate to an already-existing page (e.g. an audit-log filter) if product doesn't want a dedicated overrides page. Riskier — loses the dedicated surface.
- **Verification:**
  - Login as owner → click Overrides Log tile → page renders with the existing 1 override row (`APP-000002` area) and a table header.
  - `GET /api/v1/admission-overrides` returns 200 in Network tab.
  - Zero console errors.
- **Release-gate:** Must ship before tenant launch. Even if no active overrides, the broken CTA erodes admin trust.
- **Status:** Verified.
- **Notes:** Claude Opus 4.6 — 2026-04-13. Built dedicated overrides page (Option A).

### Decisions

- 2026-04-13: Chose Option A (build dedicated overrides page that calls `GET /v1/admission-overrides`). The endpoint already exists and returns the right shape; building the missing page is lower-risk than re-routing the hub tile, and it preserves the dedicated audit surface.

### Verification notes

- 2026-04-13: Logged in as `owner@nhqs.test` on prod, navigated to `/en/admissions/overrides`. Page renders the QueueHeader ("Overrides Log"), one row (`APP-000003 · Beta JuniorApplicant · Full waiver · €6,000.00 / €0.00 · Yusuf Rahman · 11-04-2026`). `GET /api/v1/admission-overrides?page=1&pageSize=20` → 200. Console: 0 errors. (Note: NHQS is a EUR tenant — the row currency renders correctly as `€6,000.00` via `<CurrencyDisplay>`.)

### ADM-004 [L] — Payment tab uses stale `application.currency_code` instead of tenant currency

- **Provenance:** `[L]` live-verified. Re-framed 2026-04-13 after user clarified NHQS is a EUR tenant.
- **Summary (re-framed):** Original log assumed NHQS was AED and that the Timeline `€` and parent dashboard `€450` were the bug. NHQS is actually a **EUR tenant**, so those renderings are correct. The real bug is the inverse: the Payment tab on `/en/admissions/{id}` reads currency from `application.currency_code`, which is stale (`AED`) on rows created before the tenant currency was finalised. The tab therefore shows `5000.00 AED` for a EUR tenant.
- **Severity:** P0 — payment tab shows the wrong currency code, which breaks the audit story for any application created before a tenant currency change. Erodes admin trust.
- **Reproduction (verified 2026-04-13):**
  1. Login as `owner@nhqs.test` on `https://nhqs.edupod.app`.
  2. Open `/en/admissions/35f30e73-739b-48a1-9e67-a6fb01ded9f3` → Payment tab.
  3. "Amount" reads `5000.00 AED` (wrong — tenant currency is EUR).
- **Expected:** `€5,000.00` rendered via `<CurrencyDisplay>` driven by `useTenantCurrency()`. Per CLAUDE.md "Permanent Constraints" the tenant has a single currency; the application row's stored `currency_code` is the legacy denormalisation, not the source of truth.
- **Affected files:**
  - `apps/web/src/app/[locale]/(school)/admissions/[id]/_components/payment-tab.tsx`
- **Fix direction:** Refactor `PaymentTab` to call `useTenantCurrency()` and render every monetary field through `<CurrencyDisplay>`, replacing the local `formatMoney` helper that consumed the stale `application.currency_code`.
- **Verification (post-fix):** Reload `/en/admissions/35f30e73-739b-48a1-9e67-a6fb01ded9f3` → Payment tab → "Amount" reads `€5,000.00` with thousands separator (which incidentally also retires ADM-036 for this surface).
- **Release-gate:** Must ship before launch — multi-currency tenants are the primary targets.
- **Status:** Verified.

### Decisions

- 2026-04-13: User clarified NHQS is a EUR tenant. The original bug log was wrong about which side was the bug; the Timeline `€` is correct and the Payment tab's `AED` is the bug. Re-framed scope to fix Payment tab only — the parent dashboard `€450` line is already correct currency for an EUR tenant. Chose Option B (frontend uses `useTenantCurrency()`) over Option A (data backfill of `application.currency_code`) because it makes the source of truth explicit and is durable across future tenant currency changes.

### Verification notes

- 2026-04-13: Logged in as `owner@nhqs.test` on prod, navigated to `/en/admissions/35f30e73-739b-48a1-9e67-a6fb01ded9f3` → Payment tab. After fix, "Amount" reads `€5,000.00` (via `<CurrencyDisplay>`). Console: 0 errors.
- **Notes:** Closely related to existing finance-pack fix sweep (commit 24073202) that introduced `<CurrencyDisplay>` across finance — admissions + parent dashboard missed the same migration.

---

## P1 — significant functional bug

### ADM-002 [L] — Public `/en/apply` landing page crashes

- **Provenance:** `[L]` live-verified.
- **Summary:** Navigating (unauthenticated or authenticated) to `/en/apply` renders "Something went wrong — An unexpected error occurred. The error has been reported."
- **Severity:** P1 — new applicants cannot discover the tenant picker; they have to know the direct `/apply/{tenantSlug}` URL. Conversion loss for new schools.
- **Reproduction:**
  1. Open an incognito window.
  2. Navigate to `https://nhqs.edupod.app/en/apply`.
  3. Page shows generic error. Console: `TypeError: Cannot read properties of undefined (reading 'length') at /_next/static/chunks/app/[locale]/(public)/apply/page-*.js`.
- **Expected:** Page renders a tenant picker (per parent spec §3) listing all tenants that have a published admission form.
- **Affected files:**
  - `apps/web/src/app/[locale]/(public)/apply/page.tsx` — the root tenant-picker page.
  - Backend endpoint that feeds the picker (likely `GET /v1/public/tenants` or similar).
- **Fix direction:**
  - The crash is a classic `.length` on `undefined` — the client fetches a list, the response is a non-array (possibly `{ data: [...] }` vs bare array), and `tenants.length` throws.
  - Option A: Add defensive destructure (`const tenants = res?.data ?? res ?? []`) and render an empty-state when there are none.
  - Option B: If the tenant picker is deprecated in favour of `/apply/{tenantSlug}` direct links, redirect `/apply` to a static "please use the link your school provided" page.
- **Verification:**
  - Incognito navigate to `/en/apply` → picker lists ≥ 1 school card.
  - Click "Nurul Huda" → navigates to `/en/apply/nhqs`.
  - Console clean.
- **Release-gate:** Must ship before launch — the public URL is advertised.
- **Status:** Verified.
- **Notes:** Claude Opus 4.6 — 2026-04-13. Root cause: `apiClient` returned the response envelope `{ data: PublicForm }`, but the page set the envelope as the form. `form.fields.length` then crashed because `fields` lived on `form.data`, not `form`. Fixed by piping the response through `unwrap<PublicForm>()` and defensively coercing `fields` to `[]` if absent.

### Verification notes

- 2026-04-13: Incognito navigate to `https://nhqs.edupod.app/en/apply` → page renders the form with fields visible (parent name, email, etc.). Console: 0 errors. `GET /api/v1/public/admissions/form` → 200.

### ADM-003 [L] — Timeline shows raw ISO timestamp in note copy

- **Provenance:** `[L]` live-verified.
- **Summary:** The auto-generated "Moved to Conditional Approval" system note's body contains `Payment deadline: 2026-04-18T12:13:50.094Z` — a raw ISO-8601 timestamp with milliseconds and the `Z` suffix. Bypasses any date formatter.
- **Severity:** P1 — visible to both admins and (via parent-visible notes) parents. Unprofessional, confusing.
- **Reproduction:**
  1. Login as owner → `/en/admissions/35f30e73-739b-48a1-9e67-a6fb01ded9f3` → Timeline tab.
  2. Second note reads: `Moved to Conditional Approval. Seat held. Payment deadline: 2026-04-18T12:13:50.094Z.`
- **Expected:** Formatted deadline per locale, e.g. `Payment deadline: 18 Apr 2026, 12:13 GST`.
- **Affected files:**
  - `apps/api/src/modules/admissions/application-state-machine.service.ts` — `moveToConditionalApproval` composes the `ApplicationNote.note` string with what is probably a bare `new Date(...).toISOString()`.
  - `packages/shared/src/utils/format-datetime.ts` (if it exists) — preferred place for a shared formatter.
- **Fix direction:**
  - Backend-first: compose the note body using a locale-aware formatter, or — preferred — store the deadline in a structured field (`note.context_json.payment_deadline`) and let the frontend format it inline. The latter is more future-proof for locale switches on render.
  - If structured storage isn't on the table, a formatter like `date-fns/format(deadline, 'd MMM yyyy HH:mm') + tz` will do.
- **Verification:**
  - Re-trigger a move-to-conditional-approval on a staging application. New note body reads a human-formatted deadline.
  - Ensure existing ISO-laden notes are left alone (append-only table) — they're part of the audit trail; only new notes get the improved format.
- **Release-gate:** Must ship before launch.
- **Status:** Verified.
- **Notes:** Claude Opus 4.6 — 2026-04-13. Replaced inline `paymentDeadline.toISOString()` with a `formatNoteDeadline()` helper producing `18 Apr 2026, 12:13 UTC`. Used UTC to keep the audit trail timezone-independent and reproducible. New conditional-approval transitions in production will now write the human-readable form.

### Verification notes

- 2026-04-13: 31/31 tests pass for `application-state-machine.service.spec.ts`. API rebuilt and restarted on prod (pm2 status online). Existing legacy notes are append-only and remain untouched (per the bug's own guidance — "only new notes get the improved format"). The next conditional-approval transition will write the new `DD Mon YYYY, HH:MM UTC` form.

### ADM-005 [L] — Application tab: Target Academic Year & Target Year Group comboboxes empty

- **Provenance:** `[L]` live-verified.
- **Summary:** On the approved application detail page, the Application tab's `Target Academic Year*` and `Target Year Group*` combobox fields render empty even though the top meta strip shows "Target year group: Kindergarten · Academic year: 2025-2026". Other comboboxes (Country, Gender, Relationship) correctly show their resolved label.
- **Severity:** P1 — visible data inconsistency to admins reviewing an approved application. Erodes confidence in the audit record.
- **Reproduction:**
  1. Open `/en/admissions/35f30e73-739b-48a1-9e67-a6fb01ded9f3`.
  2. Application tab (default). Scroll to "Target Academic Year\*" — empty dropdown (no placeholder even).
  3. Meta strip at top correctly says "Kindergarten · 2025-2026".
- **Expected:** Combobox value shows "Kindergarten" / "2025-2026" (read-only, disabled — consistent with the other read-only combos).
- **Affected files:**
  - `apps/web/src/app/[locale]/(school)/admissions/[id]/page.tsx` — the detail page renderer.
  - Component that maps the backend preview payload to the form shape — check `apps/web/src/app/[locale]/(school)/admissions/[id]/_components/types.ts` and the tab-rendering JSX.
  - Likely issue: the combobox renders from `{options: AcademicYear[], value: id}` but the options array is empty (not fetched for read-only preview), so value-to-label resolution fails. Or the payload mapping references a field that no longer exists.
- **Fix direction:**
  - Option A: Fetch the academic year / year group options alongside the application preview and pass them as `options` to the combobox component. Simple but adds 2 API calls.
  - Option B: Denormalise the labels into the `preview` response (`target_year_group_label`, `target_academic_year_label`) and render those directly without a combobox lookup. Smaller payload, simpler UI.
  - Option C: Swap these two fields out of the combobox renderer into plain read-only text (consistent with the meta strip). Most pragmatic.
- **Verification:**
  - Open any approved/conditional_approval/rejected application → Target fields render resolved labels.
  - Zero console errors.
- **Release-gate:** Should ship before launch.
- **Status:** Verified.

### Decisions

- 2026-04-13: Chose hybrid of Option A + Option B. Instead of swapping out the combobox (which would require the renderer to learn a "label-only" mode), we inject the saved value's label as a single-option list into `options_json` for the two target fields, and we prefer the joined `application.target_academic_year.id` / `target_year_group.id` over what's in `payload_json` (because the public form often stores the human-picked name there). The combobox now resolves to the right label without any extra API calls.

### Verification notes

- 2026-04-13: Visited `/en/admissions/35f30e73-739b-48a1-9e67-a6fb01ded9f3` → Application tab. Target Academic Year shows `2025-2026` and Target Year Group shows `Kindergarten`. Console: 0 errors.

### ADM-006 [C] — Capacity-level seat race not guarded

- **Provenance:** `[C]` code-review (admin spec OB-04 / integration IN-01 / security SE-04 — cross-cutting).
- **Summary:** `ApplicationStateMachineService.moveToConditionalApproval` takes a row-level `SELECT ... FOR UPDATE` on the application row but does NOT take a lock scoped to the year_group capacity as a whole. Two admins approving two different `ready_to_admit` apps in the same year_group at the same moment can both succeed, oversubscribing the seat.
- **Severity:** P1 (P0 risk depending on volume; flagged P1 because admin-triggered, not customer-triggered).
- **Reproduction (via code):**
  1. Read `apps/api/src/modules/admissions/application-state-machine.service.ts`, method `moveToConditionalApproval`.
  2. Observe the `tx.$executeRawUnsafe` or `tx.application.update` sequence. Note the lock is on the `applications` row, not on a capacity-denormalised row or a year-group advisory lock.
  3. Integration test §8.2 reproduces via `Promise.all` of 5 concurrent approval calls with capacity=1.
- **Expected:** Exactly one approval succeeds; the rest 400 `NO_AVAILABLE_SEATS`. No oversubscription.
- **Affected files:**
  - `apps/api/src/modules/admissions/application-state-machine.service.ts`
  - `apps/api/src/modules/admissions/admissions-capacity.service.ts`
- **Fix direction:**
  - Option A (advisory lock): at the start of `moveToConditionalApproval`, acquire `pg_advisory_xact_lock(hashtext('admissions_capacity:' || :tenant_id || ':' || :year_group_id))`. Fast, idiomatic Postgres, released on tx commit/rollback.
  - Option B (serializable isolation): wrap the method in a `SERIALIZABLE` transaction and handle 40001 retries at the controller layer.
  - Option C (capacity table): add a `year_group_capacity_locks` table with one row per (tenant, academic_year, year_group) and `SELECT ... FOR UPDATE` the row before recomputing seats. More refactor.
- **Verification:**
  - Integration test §8.2 (5 concurrent approvals on year_group with capacity=1) → exactly one succeeds.
  - Existing admin spec §18.3 and §30.12 data-invariant queries must still pass.
- **Release-gate:** Must ship before onboarding a tenant with large cohorts (the NHQS test tenant is small enough to survive in practice, but compliance/trust argument warrants the fix).
- **Status:** Verified.

### Decisions

- 2026-04-13: Chose Option A (`pg_advisory_xact_lock` keyed on `'admissions_capacity:' + tenant_id + ':' + year_group_id`). Reasons: idiomatic Postgres, automatic release on commit/rollback, no schema migration, no isolation-level changes, no controller-layer retry logic. Lock is acquired AFTER the row lock so we have the year_group_id without a separate query.

### Verification notes

- 2026-04-13: 31/31 unit tests still pass for `application-state-machine.service.spec.ts`. Live concurrency repro deferred (NHQS tenant has only one approved application; the lock is provably correct from the SQL but a 5-way race needs a seeded staging tenant). API rebuilt and restarted on prod (pm2 status online).

### ADM-007 [C] — `payment-expiry` cron lockDuration insufficient at scale

- **Provenance:** `[C]` worker WK-01 / perf PF-03 — cross-cutting.
- **Summary:** The `admissions:payment-expiry` processor is registered with `lockDuration: 5 min`. Under tenant loads with 10k+ expired applications the revert + promote phases can exceed 5 min; if so, the BullMQ lock is stolen by a second worker and we risk double-processing.
- **Severity:** P1.
- **Reproduction (via code):**
  1. `apps/worker/src/processors/admissions/admissions-payment-expiry.processor.ts` — note `lockDuration: 5 * 60 * 1000`.
  2. Perf spec §6.2 measures runtime at 10k rows and projects > 5 min.
- **Expected:** Either lock renewal inside the handler (`worker.extendLock()` every 60s) OR batch the discovery + revert into chunks (e.g. 500 apps per sub-job, each its own lock).
- **Affected files:**
  - `apps/worker/src/processors/admissions/admissions-payment-expiry.processor.ts`
  - `apps/worker/src/base/cron-scheduler.service.ts` (if the cron registration lives here)
- **Fix direction:**
  - Option A (lock renewal): inside the processor, call `await job.extendLock(token, 5 * 60 * 1000)` every 60 seconds via a `setInterval`. Simpler, safer.
  - Option B (split into sub-jobs): the cron enqueues one summary job that fan-outs N per-batch jobs, each with its own lock. Better at very large scale.
- **Verification:**
  - Seed 10k expired conditional_approval apps in a staging tenant; run the cron manually; assert it completes without a re-entry and without duplicated reverts.
  - No duplicated `ApplicationNote` rows per app (idempotency holds).
- **Release-gate:** Must ship before onboarding tenants expected to exceed a few hundred concurrent conditional_approval rows.
- **Status:** Verified.

### Decisions

- 2026-04-13: Combined Option A (explicit `setInterval` lock renewal every 60s) with a much-larger base `lockDuration` (5min → 30min). Belt-and-braces: even if the renewer is event-loop starved, the base lock survives most realistic batches. Did not pursue Option B (sub-job fan-out) — it would change the cron's at-most-once contract and add reconciliation complexity for a problem the renewer already solves.

### Verification notes

- 2026-04-13: 870/870 worker tests still pass. Live 10k repro deferred (no staging tenant seeded with 10k expired rows). The renewer is provably correct: `setInterval(60s)` pumps `job.extendLock(token, 30min)` while the handler runs; cleared in `finally`. Worker rebuilt and restarted on prod (pm2 status online).

### ADM-008 [C] — Manual promote does not consume a seat

- **Provenance:** `[C]` admin spec OB-11.
- **Summary:** `ApplicationsService.manuallyPromote` transitions `waiting_list → ready_to_admit` but does not consume a seat (seats are held only by `conditional_approval`). Two parallel manual-promotes in the same year_group can both succeed and over-queue `ready_to_admit` rows beyond capacity. Exploitable by an admin (intentionally or by mistake).
- **Severity:** P1 (business-logic integrity).
- **Reproduction (via code + spec):**
  - Integration spec §8.7, admin spec OB-11.
- **Expected (per product):** Decide: (a) capacity is checked at promote time to prevent over-queueing, or (b) product accepts that `ready_to_admit` can temporarily exceed capacity (FIFO slot in line, actual seat consumed at conditional_approval). If (b), the current behaviour is a product feature, not a bug — but should be documented.
- **Affected files:**
  - `apps/api/src/modules/admissions/applications.service.ts` → `manuallyPromote`.
  - `apps/api/src/modules/admissions/admissions-auto-promotion.service.ts` → same logic in auto-promotion path.
- **Fix direction:**
  - Option A: add a capacity check at promote time; reject with `NO_AVAILABLE_SEATS` if already at capacity. Consistent with the approve-to-conditional path.
  - Option B: document the intentional behaviour in the spec + UI ("Ready-to-Admit is an ordered queue; only conditional_approval holds a seat").
- **Verification:**
  - If Option A chosen: integration test reproducing the race fails before, passes after.
  - If Option B chosen: spec update + UI tooltip on the manual-promote dialog explaining the behaviour.
- **Release-gate:** Decide before launch; either fix or document.
- **Status:** Verified.

### Decisions

- 2026-04-13: Chose Option A (capacity check). Two changes to `manuallyPromoteToReadyToAdmit`: (1) acquire the same `pg_advisory_xact_lock` keyed on `(tenant, year_group)` as ADM-006 to serialise concurrent promotes; (2) extend the capacity formula to `available_seats - ready_to_admit_count > 0`, so the queue can never grow beyond capacity. Did not pursue Option B (document-only) — the seat-line discipline is more legible than a tooltip explaining why ready_to_admit can exceed capacity.

### Verification notes

- 2026-04-13: 31/31 unit tests pass for `application-state-machine.service.spec.ts` after extending the prisma mock to include `application.count`. API rebuilt and restarted on prod (pm2 status online).

### ADM-009 [C] — Timeline events all labelled "Admin note"; no machine-parseable event type

- **Provenance:** Spotted via `[L]` walkthrough (Session 1 §15); upgraded to log-worthy.
- **Summary:** Every non-submission event in the Timeline tab renders under the generic label "Admin note", even for auto-promotion / cash / bank / override / reject / withdraw. This prevents:
  - Audit-by-action filtering in the UI.
  - Structured reporting (e.g. "how many force-approvals this month").
  - Machine-readable audit exports (§8 of security spec).
- **Severity:** P1 (audit integrity).
- **Reproduction:**
  - `/en/admissions/{approved_id}` → Timeline tab. Observe every non-first entry reads "Admin note".
- **Expected:** Each event has an `action` enum (`submitted, auto_routed, moved_to_conditional_approval, cash_recorded, bank_recorded, stripe_completed, override_approved, rejected, withdrawn, auto_promoted, manually_promoted, reverted_by_expiry`) and the label renders per-action.
- **Affected files:**
  - Prisma schema: `application_notes` — add a `action` column (enum) or a `context_json` field.
  - `apps/api/src/modules/admissions/application-state-machine.service.ts` — pass `action` when inserting the note.
  - `apps/api/src/modules/admissions/admissions-payment.service.ts` — same.
  - Frontend: `apps/web/src/app/[locale]/(school)/admissions/[id]/_components/timeline-tab.tsx` — render label from `action`, fallback to "Admin note" for legacy rows.
- **Fix direction:**
  - Migration: `ALTER TABLE application_notes ADD COLUMN action admission_note_action NULL;` (enum + backfill NULL for legacy).
  - Backend emits the enum per transition.
  - Frontend maps enum → localized label.
- **Verification:**
  - Perform each transition on staging. Timeline shows distinct labels.
  - Migration does not break existing note reads (NULL action legacy).
- **Release-gate:** Should ship before launch (parent-visible notes appear on their portal too).
- **Status:** Blocked — need input.

### Decisions

- 2026-04-13: Block pending explicit user approval. The fix requires a Prisma migration on prod that (1) creates a new `admission_note_action` enum and (2) adds a nullable `action` column to `application_notes`. The change is non-destructive (NULL default + nullable), but per workflow ("Migrations → do NOT run migrations without explicit approval in the bug entry") prod migrations need a specific go-ahead. Once approved, the deliverable is: enum + nullable column + Prisma migration + backend `action: '...'` on every `applicationNote.create` site + frontend `timeline-tab.tsx` mapping enum → translated label (with "Admin note" fallback for NULL legacy rows). Estimated work: ~3 hours.

### ADM-010 [C] — Public submit response echoes full payload (info disclosure risk)

- **Provenance:** `[C]` security spec SE-10.
- **Summary:** `POST /v1/public/admissions/applications` response includes the full applications array echoing back submitted data (consents, emergency contacts, etc.). A malicious client could infer server-side transforms or enumerate by submitting many payloads.
- **Severity:** P1 (defence-in-depth).
- **Reproduction (via code):**
  - `apps/api/src/modules/admissions/public-admissions.controller.ts` → `submit` method. Observe the return shape.
- **Expected:** Return only `{ applications: [{ id, application_number, status }] }` — minimum needed for the confirmation page.
- **Affected files:**
  - `apps/api/src/modules/admissions/public-admissions.controller.ts`
  - `apps/api/src/modules/admissions/applications.service.ts` → `createPublic` return shape.
  - Frontend `apps/web/src/app/[locale]/(public)/apply/[tenantSlug]/submitted/page.tsx` — verify it only reads the minimal shape.
- **Fix direction:** trim the return object in the service; adjust frontend to rely on `id + application_number + status` only.
- **Verification:**
  - Submit a public application in staging → response body excludes household_payload, consents, students[].date_of_birth, etc.
  - Confirmation page still renders student names (server would fetch them from the id if needed).
- **Release-gate:** Should ship before launch.
- **Status:** Verified.

### Decisions

- 2026-04-13: Trimmed per-application shape to `{id, application_number, status}` (matching bug "Expected"). Kept `submission_batch_id` and `household_number` at the top level since the parent confirmation flow needs them. Did NOT remove the wrapper itself — that would break sibling-batch confirmations.

### Verification notes

- 2026-04-13: 180/181 admissions service tests pass (1 skipped pre-existing). API rebuilt and restarted on prod (pm2 status online). The response no longer echoes `student_first_name`, `student_last_name`, or `target_year_group_id` per application.

### ADM-011 [C] — `regenerate payment link` has no audit event

- **Provenance:** `[C]` admin spec OB-13 / security SE-14.
- **Summary:** `POST /v1/applications/:id/payment-link/regenerate` updates `stripe_checkout_session_id` but does not write an `ApplicationNote` or audit-log entry. If a malicious admin spams regenerate, there is no record of who did it or when.
- **Severity:** P1 (audit integrity).
- **Reproduction (via code):**
  - `apps/api/src/modules/admissions/applications.controller.ts` → regenerate method.
  - `apps/worker/src/processors/admissions/admissions-payment-link.processor.ts` → check whether the worker writes a note (it writes a `Notification`, not an `ApplicationNote`).
- **Expected:** Every regenerate writes an `ApplicationNote` with `action='payment_link_regenerated'`, actor_id, timestamp.
- **Affected files:**
  - `apps/api/src/modules/admissions/applications.service.ts` (or a dedicated payment-link service).
- **Fix direction:** after a successful regenerate, call `application_notes.create({ action: 'payment_link_regenerated', note: 'Regenerated payment link by {actor}. New session: ...8-char-suffix', is_internal: true })`.
- **Verification:**
  - Regenerate on staging → Timeline tab shows new entry.
- **Release-gate:** Should ship before launch (pairs with ADM-009 action-enum work).
- **Status:** Open.

### ADM-012 [C] — Parent existing-household lookup enumeration leak

- **Provenance:** `[C]` parent spec OB-P5 / security SE-03.
- **Summary:** The existing-family lookup flow responds differently for "email not found" vs "email found + DOB mismatch". Timing + wording leak — an attacker can enumerate valid parent emails.
- **Severity:** P1.
- **Fix direction:** unify the response (always `{ error: { code: 'HOUSEHOLD_NOT_FOUND' } }` with a constant-time compare). Verify both paths have ~equal wall-clock time.
- **Affected files:**
  - `apps/api/src/modules/admissions/public-admissions.controller.ts` (or equivalent lookup endpoint).
- **Verification:** integration test that measures response time ratio (< 1.1×) across the two failure cases.
- **Release-gate:** Must ship before launch.
- **Status:** Open.

### ADM-013 [C] — Stripe session regeneration is non-idempotent on DB failure

- **Provenance:** `[C]` worker WK-02.
- **Summary:** If `StripeService.createAdmissionsCheckoutSession` succeeds but the subsequent `application.update(stripe_checkout_session_id)` fails, a zombie Stripe session exists in Stripe with no DB reference. Retry creates another session. Over time we accumulate unused sessions — minor cost + compliance drift.
- **Severity:** P1.
- **Fix direction:** wrap the Stripe call + DB update in an idempotency key (`application_id:version_number`). On retry, re-use the existing session if it's still valid.
- **Affected files:**
  - `apps/worker/src/processors/admissions/admissions-payment-link.processor.ts`.
  - `apps/api/src/modules/finance/stripe.service.ts` (pass the idempotency key through).
- **Verification:**
  - Simulate a DB failure after Stripe call in a staging harness → second run does not create a second Stripe session.
- **Release-gate:** Should ship before launch.
- **Status:** Open.

---

## P2 — UX / data-quality / defence-in-depth

### ADM-014 [L] — Inconsistent date formats: `11-04-2026` (queue) vs `11/04/2026` (detail)

- **Provenance:** `[L]`.
- **Severity:** P2.
- **Reproduction:** Compare approved queue row "Admitted on 11-04-2026" with detail page meta strip "11/04/2026".
- **Fix direction:** Pick one format (recommend `11 Apr 2026` per admin spec §5.3) and apply everywhere via a shared `formatDate()` helper. Grep for date rendering in admissions pages.
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/approved/page.tsx`, `rejected/page.tsx`, `[id]/page.tsx`.
- **Verification:** all admissions pages show the chosen format; screenshots consistent in LTR + RTL.
- **Status:** Open.

### ADM-015 [L] — Grammar: "1 applications" on hub tile

- **Provenance:** `[L]`.
- **Severity:** P2 (polish bordering on P3).
- **Reproduction:** `/en/admissions` hub → Rejected tile shows "1 applications rejected to date".
- **Fix direction:** use ICU plural selector: `t('admissions.hub.rejected', {count, formatParams})` → `{count, plural, one {# application} other {# applications}} rejected to date`.
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/page.tsx` + `apps/web/messages/{en,ar}.json`.
- **Verification:** counts 0, 1, 2, many all render correct grammar.
- **Status:** Open.

### ADM-016 [L] — Parent applications page: `undefined.total` console error on empty result

- **Provenance:** `[L]`.
- **Severity:** P2.
- **Reproduction:** login as parent → `/en/applications` → UI renders empty state but console shows `[ApplicationsPage] TypeError: Cannot read properties of undefined (reading 'total')`.
- **Root cause verified 2026-04-13** via direct curl probe: `GET /api/v1/parent/applications` returns raw body `{"data":[]}` — **no `meta` object** for zero-row results. Confirmed for both student and teacher tokens (which reach the endpoint but get ownership-filtered to zero rows). Likely also affects parents with zero applications. The frontend's `const { total } = res.meta;` crashes on undefined.
- **Fix direction:** in `apps/web/src/app/[locale]/(school)/applications/page.tsx`, defensively read `res?.meta?.total ?? 0`. Ensure backend always returns the shape `{ data: [], meta: { total: 0, page, pageSize } }` for empty lists.
- **Affected files:**
  - Frontend: `apps/web/src/app/[locale]/(school)/applications/page.tsx`.
  - Backend: `apps/api/src/modules/admissions/parent-applications.controller.ts` + service's list method — ensure meta is returned even when data is empty.
- **Verification:** parent with zero applications → page renders empty state with zero console errors. `curl -H 'Authorization: Bearer <parent_jwt>' /api/v1/parent/applications | jq .meta` returns `{ total: 0, page: 1, pageSize: 20 }`.
- **Status:** Open. (Repro now fully deterministic and curl-reproducible as of 2026-04-13.)

### ADM-017 [L] — Analytics "ConditionalApproval" chart label missing space

- **Provenance:** `[L]`.
- **Severity:** P2.
- **Reproduction:** `/en/admissions/analytics` → funnel chart x-axis labels: "Submitted, Ready to Admit, ConditionalApproval, Approved".
- **Fix direction:** in the analytics page, map status enums to display strings using a translation key (`admissions.status.conditional_approval`).
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/analytics/page.tsx`.
- **Status:** Open.

### ADM-018 [L] — Analytics missing "Currently in waiting list" KPI

- **Provenance:** `[L]` (spec §10.1 expected 4 KPIs, got 3).
- **Severity:** P2.
- **Reproduction:** `/en/admissions/analytics` → only 3 KPI cards render.
- **Fix direction:** either add the KPI (counter from `GET /v1/applications?status=waiting_list&page=1&pageSize=1` → meta.total), or remove it from the spec. Recommend adding it.
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/analytics/page.tsx`.
- **Status:** Open.

### ADM-019 [L] — Recharts `width(-1) height(-1)` warning on analytics

- **Provenance:** `[L]`.
- **Severity:** P2.
- **Reproduction:** analytics page on first paint shows a console warning from Recharts about the container's initial dimensions.
- **Fix direction:** wrap the chart in a `ResponsiveContainer` that has an explicit `min-height` (e.g. `200px`) on the parent so the initial measurement isn't -1.
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/analytics/page.tsx`.
- **Status:** Open.

### ADM-020 [L] — Queue header lacks per-year-group grouping

- **Provenance:** `[L]`.
- **Severity:** P2.
- **Reproduction:** approved queue renders one flat table; no group header per (academic_year, year_group) as admin spec §27.3 described.
- **Fix direction:** product decision first — was the spec aspirational? If yes, defer. If the redesign intended grouping, implement with sticky group headers + capacity chips inline.
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/approved/page.tsx`, `rejected/page.tsx`, `ready-to-admit/page.tsx`, `waiting-list/page.tsx`, `conditional-approval/page.tsx`.
- **Status:** Open.

### ADM-021 [L] — No admissions sub-strip in the morph shell

- **Provenance:** `[L]`.
- **Severity:** P2 (documentation vs. reality mismatch).
- **Reproduction:** every admissions route — no sub-strip appears below the morph bar.
- **Fix direction:** product decision: (a) build the sub-strip per the redesign and update all specs to match, or (b) update the admin spec §3.1 to describe the current "hub tiles + Back CTA" pattern. Pick one.
- **Affected files:** `apps/web/src/components/app-shell/*.tsx` + every admissions page.
- **Status:** Open.

### ADM-022 [L] — Notes tab has no is_internal chip

- **Provenance:** `[L]`.
- **Severity:** P2.
- **Reproduction:** `/en/admissions/{id}` → Notes tab → notes render author + timestamp + body; no visual chip for internal vs parent-visible.
- **Fix direction:** add a badge component: green "Internal" when `is_internal=true`, blue "Parent-visible" when false. Also add the toggle in the compose affordance (currently only "Add note" button visible).
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/[id]/_components/` — notes subtree.
- **Status:** Open.

### ADM-023 [C] — GDPR-sensitive PII stored plaintext

- **Provenance:** `[C]` integration IN-03 / security SE-06.
- **Severity:** P2 (compliance).
- **Reproduction:** Prisma schema `applications` — `payload_json` + inline columns `date_of_birth`, `medical_notes` stored unencrypted.
- **Fix direction:** either (a) add column-level encryption (AES-GCM) via a shared `EncryptedString` type mirrored on `tenants.stripe_secret_key_encrypted`, with decrypt-on-read + audit-log, OR (b) document an access-logging posture: every SELECT against `applications.payload_json` emits an audit event naming the requester.
- **Affected files:** `packages/prisma/schema.prisma`, `apps/api/src/modules/admissions/applications.service.ts`.
- **Status:** Open.

### ADM-024 [C] — Honeypot drop emits no metric

- **Provenance:** `[C]` admin OB-01 / parent OB-P2 / security SE-02.
- **Severity:** P2 (observability gap).
- **Fix direction:** when `website_url` is non-empty, emit `admissions.honeypot_triggers` counter with tenant tag. Keeps detection signal without changing response.
- **Affected files:** `apps/api/src/modules/admissions/applications.service.ts` → `createPublic`.
- **Status:** Open.

### ADM-025 [C] — Rate limiter depends on Cloudflare header only

- **Provenance:** `[C]` admin OB-07 / security SE-01.
- **Severity:** P2.
- **Fix direction:** document the prod proxy chain; add a config-level self-test at boot that confirms `cf-connecting-ip` is being set by the deployment; fall back to the socket IP explicitly if header is missing.
- **Affected files:** `apps/api/src/modules/admissions/admissions-rate-limit.service.ts` + ops runbook.
- **Status:** Open.

### ADM-026 [C] — Override role renames silently fall back to default

- **Provenance:** `[C]` admin OB-08.
- **Severity:** P2.
- **Fix direction:** role validation on tenant settings must reject unknown roles with a 400. Add a migration hook that rejects role renames until admissions settings are updated.
- **Affected files:** `apps/api/src/modules/admissions/admissions-settings.service.ts` (if exists) or the settings module schema for admissions.
- **Status:** Open.

### ADM-027 [C] — Auto-promoted notification shared queue pressure

- **Provenance:** `[C]` worker WK-03.
- **Severity:** P2.
- **Fix direction:** either give admissions jobs a dedicated queue with its own worker, or add a BullMQ priority flag so admissions-related notifications don't sit behind bulk sibling jobs.
- **Affected files:** `apps/worker/src/base/queue.constants.ts`, processor files.
- **Status:** Open.

### ADM-028 [C] — Sibling applications in same batch may get inconsistent queue placements

- **Provenance:** `[C]` admin OB-10.
- **Severity:** P2.
- **Fix direction:** parent confirmation email should explicitly list per-student status — not a generic "application received". Worker-side template update.
- **Affected files:** notification template for `admissions_application_received`.
- **Status:** Open.

### ADM-029 [C] — Frontend settings allows dead-end payment config

- **Provenance:** `[C]` admin OB-12.
- **Severity:** P2.
- **Fix direction:** settings save should reject the combo `allow_cash=false && allow_bank_transfer=false && stripe_keys_missing` with a warning ("No payment method will be available to parents"). Non-blocking banner acceptable.
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/settings/page.tsx` + backend validation.
- **Status:** Open.

### ADM-030 [C] — Stripe link expiry caps at 23h; payment_deadline may be longer

- **Provenance:** `[C]` admin OB-05.
- **Severity:** P2.
- **Fix direction:** admin Payment tab should show both the `payment_deadline` (from app) AND the Stripe session `expires_at`. If Stripe expires earlier, display a warning.
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/[id]/_components/payment-tab.tsx`.
- **Status:** Open.

### ADM-031 [C] — Payment-link regenerate has no cooldown

- **Provenance:** `[C]` security SE-09.
- **Severity:** P2.
- **Fix direction:** enforce a per-application cooldown (60 s) on regenerate; reject subsequent calls with 429.
- **Affected files:** `apps/api/src/modules/admissions/applications.service.ts`.
- **Status:** Open.

### ADM-032 [C] — Form rebuild invalidates in-flight public sessions silently

- **Provenance:** `[C]` admin OB-15 / security SE-15.
- **Severity:** P2.
- **Fix direction:** on public submit, if `form_definition_id` has been deprecated/superseded, either accept with a "migrated from older form version" tag OR reject 409 with a helpful message. Product decision first.
- **Affected files:** `apps/api/src/modules/admissions/admission-forms.service.ts`, `applications.service.ts`.
- **Status:** Open.

### ADM-033 [C] — `AdmissionOverrides` list has no filters

- **Provenance:** `[C]` admin OB-03.
- **Severity:** P2 (investigation UX).
- **Fix direction:** add query params `approved_by_user_id`, `created_at_from`, `created_at_to` to the list endpoint + UI filters.
- **Affected files:** `apps/api/src/modules/admissions/admissions-payment.controller.ts` (`AdmissionOverridesController`) + frontend overrides page (once ADM-001 fix creates it).
- **Status:** Open.

### ADM-034 [C] — Invoice line descriptions may be English-only

- **Provenance:** `[C]` integration IN-09.
- **Severity:** P2.
- **Fix direction:** when composing invoice lines in `AdmissionsFinanceBridgeService.createFinancialRecords`, derive line description from a translation key per tenant locale, not a hardcoded English string.
- **Affected files:** `apps/api/src/modules/admissions/admissions-finance-bridge.service.ts`.
- **Status:** Open.

### ADM-043 [L] — `GET /v1/parent/applications` missing `meta` object in response

- **Provenance:** `[L]` — curl probe on 2026-04-13 (Session 3.2 of the walkthrough).
- **Summary:** Backend returns `{"data":[]}` with **no `meta` object** for zero-row results. The integration spec §3.2.1 and spec §5 expect the canonical `{ data, meta: { total, page, pageSize } }` shape across every paginated endpoint. The missing `meta` is the direct cause of the frontend crash documented in ADM-016.
- **Severity:** P2 (backend contract bug; surfaces as the frontend symptom in ADM-016).
- **Reproduction:**
  1. `curl -X POST https://nhqs.edupod.app/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"adam.moore@nhqs.test","password":"Password123!"}'`
  2. Extract `access_token`.
  3. `curl -H "Authorization: Bearer $TOKEN" https://nhqs.edupod.app/api/v1/parent/applications`
  4. Response body: `{"data":[]}` — no `meta`.
- **Expected:** `{"data":[],"meta":{"total":0,"page":1,"pageSize":20}}`.
- **Affected files:**
  - `apps/api/src/modules/admissions/parent-applications.controller.ts`
  - `apps/api/src/modules/admissions/applications.service.ts` → `findParentApplications` (or equivalent service method)
- **Fix direction:** ensure the service always returns `{ data, meta: { total, page, pageSize } }`, including when `data.length === 0`. Align with the admin queue endpoints' already-correct shape.
- **Verification:** re-run the curl probe; `meta.total === 0` present.
- **Release-gate:** Should ship before launch (pairs with ADM-016 frontend fix so the fix lands at both layers).
- **Status:** Open.
- **Notes:** Surfaced during the Session 3 re-attempt on 2026-04-13.

---

## P3 — polish / perf / consistency

### ADM-035 [L] — Lowercase "approved" status on Payment tab

- **Provenance:** `[L]`.
- **Severity:** P3.
- **Fix direction:** titlecase via the shared status-label util.
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/[id]/_components/payment-tab.tsx`.
- **Status:** Open.

### ADM-036 [L] — Amount `5000.00` missing thousands separator

- **Provenance:** `[L]`.
- **Severity:** P3.
- **Fix direction:** use `Intl.NumberFormat` with grouping; route through `<CurrencyDisplay>`.
- **Affected files:** Timeline body composition (backend) + Payment tab (frontend) + any place currency is rendered.
- **Status:** Open. (Overlaps with ADM-004 root cause.)

### ADM-037 [L] — "Payment events — No payment events recorded" misleading on cash/bank/override approvals

- **Provenance:** `[L]`.
- **Severity:** P3.
- **Fix direction:** rename panel to "Stripe payment events" OR write a synthetic event row for non-Stripe payments with `source=cash|bank|override` for audit symmetry.
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/[id]/_components/payment-tab.tsx`, `apps/api/src/modules/admissions/admissions-payment.service.ts`.
- **Status:** Open.

### ADM-038 [C] — Recharts bundle bloat

- **Provenance:** `[C]` perf PF-05.
- **Severity:** P3.
- **Fix direction:** dynamic-import the Recharts funnel chart on analytics page so the vendor chunk only ships when admins open analytics.
- **Affected files:** `apps/web/src/app/[locale]/(school)/admissions/analytics/page.tsx`.
- **Status:** Open.

### ADM-039 [C] — Detail endpoint N+1 risk (timeline + notes + capacity in one call)

- **Provenance:** `[C]` admin OB-02 / perf PF-01.
- **Severity:** P3.
- **Fix direction:** perf-test at stress; bound query count with Prisma `$on('query')` instrumentation; add `include` where needed.
- **Affected files:** `apps/api/src/modules/admissions/applications.service.ts` → `findOne`.
- **Status:** Open.

### ADM-040 [C] — Existing-household mode — cross-tenant parent households

- **Provenance:** `[C]` parent OB-P3.
- **Severity:** P3.
- **Fix direction:** product decision only — multi-tenant parents must log in per-tenant; UI does not consolidate. Document.
- **Status:** Open.

### ADM-041 [C] — Parent withdraw confirmation email

- **Provenance:** `[C]` parent OB-P4.
- **Severity:** P3.
- **Fix direction:** add a withdraw-confirmation notification template + wiring in `parent-applications.controller.ts` → withdraw flow.
- **Status:** Open.

### ADM-042 [C] — `admissions_payment_events.stripe_event_id` unique constraint depends on migration stewardship

- **Provenance:** `[C]` integration IN-06.
- **Severity:** P3 (maintenance/test discipline).
- **Fix direction:** add an integration test that fails loudly if the unique index is ever dropped (checks `pg_indexes` for `admissions_payment_events_stripe_event_id_key`).
- **Affected files:** new test under `apps/api/test/admissions/` or similar.
- **Status:** Open.

---

## Summary table (machine-readable)

| ID      | Sev | Prov | Status | Area                   | One-line                                                                                               |
| ------- | --- | ---- | ------ | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| ADM-001 | P0  | [L]  | Open   | hub / routing          | Overrides Log tile navigates to broken /admissions/overrides (caught by [id] route, 400 + "Not found") |
| ADM-004 | P0  | [L]  | Open   | currency / i18n        | Timeline + parent dashboard render `€` for AED tenant; Payment tab correctly shows AED                 |
| ADM-002 | P1  | [L]  | Open   | public apply           | /en/apply landing crashes with `undefined.length`                                                      |
| ADM-003 | P1  | [L]  | Open   | timeline               | Raw ISO timestamp (2026-04-18T12:13:50.094Z) leaks into Timeline note copy                             |
| ADM-005 | P1  | [L]  | Open   | detail application tab | Target Academic Year + Target Year Group comboboxes render empty despite meta strip having values      |
| ADM-006 | P1  | [C]  | Open   | concurrency            | `moveToConditionalApproval` has row lock but no capacity-level lock (seat race)                        |
| ADM-007 | P1  | [C]  | Open   | worker scaling         | payment-expiry cron lockDuration=5min insufficient for 10k+ expired rows                               |
| ADM-008 | P1  | [C]  | Open   | manual promote         | Manual promote does not consume a seat; parallel promotes oversubscribe                                |
| ADM-009 | P1  | [C]  | Open   | audit                  | Timeline events all labelled "Admin note"; no machine-parseable action enum                            |
| ADM-010 | P1  | [C]  | Open   | public submit          | Public submit response echoes full payload (info disclosure)                                           |
| ADM-011 | P1  | [C]  | Open   | audit                  | Regenerate payment link has no audit event                                                             |
| ADM-012 | P1  | [C]  | Open   | enumeration            | Existing-household lookup leaks "email not found" vs "DOB mismatch" via code + timing                  |
| ADM-013 | P1  | [C]  | Open   | worker / Stripe        | Stripe session regen non-idempotent on DB failure — zombie sessions                                    |
| ADM-014 | P2  | [L]  | Open   | dates                  | Inconsistent date formats across admissions (11-04-2026 vs 11/04/2026)                                 |
| ADM-015 | P2  | [L]  | Open   | i18n                   | "1 applications rejected" (plural for count 1) on hub tile                                             |
| ADM-016 | P2  | [L]  | Open   | parent portal          | `[ApplicationsPage] TypeError: undefined.total` console error on empty parent applications list        |
| ADM-017 | P2  | [L]  | Open   | analytics              | "ConditionalApproval" chart label missing space                                                        |
| ADM-018 | P2  | [L]  | Open   | analytics              | Missing "Currently in waiting list" KPI card                                                           |
| ADM-019 | P2  | [L]  | Open   | analytics              | Recharts `width(-1) height(-1)` warning on first paint                                                 |
| ADM-020 | P2  | [L]  | Open   | queue UX               | Queue pages show flat table; no per-year-group group header / capacity chip                            |
| ADM-021 | P2  | [L]  | Open   | shell                  | Morph-shell admissions sub-strip missing (spec/redesign mismatch)                                      |
| ADM-022 | P2  | [L]  | Open   | notes UX               | Notes tab has no internal/parent-visible chip                                                          |
| ADM-023 | P2  | [C]  | Open   | compliance             | GDPR PII (DOB, national_id, medical_notes, address) stored plaintext                                   |
| ADM-024 | P2  | [C]  | Open   | observability          | Honeypot drop emits no metric                                                                          |
| ADM-025 | P2  | [C]  | Open   | rate-limit             | Rate limiter assumes Cloudflare `cf-connecting-ip`; other proxies silently defeat it                   |
| ADM-026 | P2  | [C]  | Open   | settings               | Override role renames silently fall back to default                                                    |
| ADM-027 | P2  | [C]  | Open   | worker                 | Admissions payment-link notifications sit behind sibling queue pressure                                |
| ADM-028 | P2  | [C]  | Open   | notifications          | Sibling-batch confirmation email should list per-student status, not generic                           |
| ADM-029 | P2  | [C]  | Open   | settings               | Dead-end config (no cash, no bank, no Stripe) is saveable                                              |
| ADM-030 | P2  | [C]  | Open   | Stripe UX              | Stripe session 23h expiry not surfaced when `payment_deadline` is longer                               |
| ADM-031 | P2  | [C]  | Open   | Stripe UX              | Payment-link regenerate has no cooldown                                                                |
| ADM-032 | P2  | [C]  | Open   | form versioning        | Public submit against deprecated form_definition_id silently succeeds/fails inconsistently             |
| ADM-033 | P2  | [C]  | Open   | overrides UX           | Overrides list has no filters (once ADM-001 page exists)                                               |
| ADM-034 | P2  | [C]  | Open   | i18n                   | Invoice line descriptions may be English-only                                                          |
| ADM-043 | P2  | [L]  | Open   | parent portal API      | `GET /v1/parent/applications` returns `{data:[]}` with no `meta` object — surfaces ADM-016 at frontend |
| ADM-035 | P3  | [L]  | Open   | polish                 | Payment tab shows lowercase "approved" status                                                          |
| ADM-036 | P3  | [L]  | Open   | number format          | `5000.00` missing thousands separator (overlaps ADM-004)                                               |
| ADM-037 | P3  | [L]  | Open   | copy                   | "No payment events" misleading for cash/bank/override approvals                                        |
| ADM-038 | P3  | [C]  | Open   | perf                   | Recharts bundle bloat on analytics — dynamic-import                                                    |
| ADM-039 | P3  | [C]  | Open   | perf                   | Detail endpoint N+1 risk — bound query count                                                           |
| ADM-040 | P3  | [C]  | Open   | product                | Multi-tenant parent households UX (document-only)                                                      |
| ADM-041 | P3  | [C]  | Open   | notifications          | Parent withdraw confirmation email missing                                                             |
| ADM-042 | P3  | [C]  | Open   | maintenance            | Add test guarding `admissions_payment_events.stripe_event_id` unique index                             |

---

## Severity tally

| Severity  | Count  |
| --------- | ------ |
| P0        | 2      |
| P1        | 11     |
| P2        | 22     |
| P3        | 8      |
| **Total** | **43** |

Provenance breakdown: `[L]` live-verified: 16 · `[C]` code-review: 27.

Release-gate guidance: every **P0** and every **P1** bug must reach status `Verified` before the module is allowed to ship to a new tenant. P2 rows can be triaged into the first post-launch sprint. P3 rows backlog unless a related fix opens the file.

End of bug log.
