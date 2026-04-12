You are producing E2E test specifications for the {MODULE_NAME} module. This
is QC documentation that our team will rely on before onboarding new tenants
— it is one of the highest-stakes deliverables in this project. Treat it that
way for the entire session.

═══════════════════════════════════════════════════════════════════════════
WHAT THIS COMMAND IS — AND WHAT IT IS NOT
═══════════════════════════════════════════════════════════════════════════

/E2E produces a **UI-driven behavioural spec** that a tester (or a headless
Playwright agent) can execute top-to-bottom and report Pass/Fail on. It
covers everything a human clicking through the admin / teacher / parent /
student surfaces can directly observe.

It is ONE leg of a five-command spec pack. The other four legs cover the
things an E2E spec structurally cannot validate:

| Command             | Covers                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| /E2E (this command) | UI behaviour, translations, forms, toasts, state-based visibility, flows                               |
| /e2e-integration    | RLS leakage, cross-tenant isolation, Stripe webhooks, API contracts, DB invariants, race conditions    |
| /e2e-worker-test    | BullMQ jobs, cron schedulers, retry + dead-letter, async side-effect chains                            |
| /e2e-perf           | p50 / p95 / p99 latency, list endpoints on 10k rows, PDF render time, bundle size                      |
| /e2e-security-audit | OWASP top 10, XSS / SQLi vectors, JWT + session hardening, permission matrix, encrypted-field handling |
| /e2e-full           | Orchestrator — runs all five sequentially and produces a single release-readiness pack                 |

**If a concern belongs in one of the sibling legs, do NOT shoehorn it into
this spec — add a pointer in the "Out of scope" section and the sibling
command will pick it up.** That keeps each spec focused and runnable, and
prevents the E2E spec from promising coverage it cannot actually deliver.

═══════════════════════════════════════════════════════════════════════════
HARD RULES — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════════════════════

1. COVERAGE IS TOTAL FOR THE UI SURFACE. Not "most features." Not "the
   happy path." Every single page, sub-page, button, form field, modal,
   confirm dialog, toast, loading state, error state, empty state,
   permission guard, state transition, API call, redirect, query-param
   handoff, keyboard interaction, and RTL mirroring must be documented.
   If a line of UI code serves a function, that function must appear in
   the spec. Non-UI concerns go in the sibling specs, not here.

2. READ THE CODE FIRST. Before you write a single line, systematically
   review every file that implements or touches this module:
   - Every page.tsx under the relevant route folders
   - Every component in \_components/ folders
   - Every modal, dialog, and wizard step
   - The backend controllers, services, and permission decorators
   - The shared Zod schemas and DTOs
   - Any worker/job flows the UI depends on
   - Any retired-redirect stubs so those are documented too
     Do not guess from the UI. Do not assume from the route name. Read the
     code. If you feel tempted to skip a file, don't — open it.

3. DEPTH BEATS PRECEDENT. If there's an existing spec in this repo you
   can reference as a format template (e.g. the assessment specs under
   E2E/3_learning/assessment/), read it to understand the format. Then
   beat it. If you reviewed the prior specs and thought "that's already
   extensive enough," you haven't gone deep enough. Every feature, every
   button, every state, every edge case — I want it covered harder than
   any prior spec.

4. WRITE FOR A BLIND TESTER WITH ZERO PROJECT CONTEXT. The target
   reader is a QC engineer who has never seen this codebase, never
   opened this product, and has no idea what is supposed to happen.
   They must be able to pick up the document, follow it top-to-bottom,
   and — within a few hours — say with full confidence "I have tested
   this entire module and here are the results." Every row must
   describe:
   (a) EXACTLY what to check (the action or observation)
   (b) EXACTLY what a successful outcome looks like (so the tester
   has something concrete to compare against)
   (c) A Pass/Fail column
   A test that can't be checked against a specific success outcome
   isn't a test — it's a wish. Every row needs a concrete expected
   result: API path + method + status code, exact toast text,
   component content, state transitions, styling cues, conditional
   visibility, whatever is observable.

5. BOTH ADMIN AND TEACHER PERSPECTIVES (and parent / student where
   applicable). Produce separate spec files, one per perspective, even
   if the URLs overlap. Same URLs often render completely different
   components based on role — the specs must document each variant
   exhaustively. Each non-admin spec must also include:
   - A "what this role must NOT see or do" negative-assertion checklist
   - Cross-scope blocking assertions (every 403 path the backend
     enforces)
   - The explicit list of higher-privilege-only affordances that
     should be hidden

6. EVERY FLOW, NOT JUST EVERY PAGE. Document end-to-end workflows:
   - The happy path
   - Every permission-denied variant
   - Every validation failure (what the Zod schema rejects)
   - Every failure mode (500, network error, partial failure)
   - Every state-machine transition and the rules that gate it
   - Every confirm dialog and what each button does
   - Every autosave / polling / debounce behaviour with timings
   - Every pre-fill / query-param handoff path
   - Every integration boundary (worker jobs, PDF generation,
     presigned URLs, etc.) — UI-visible side only. The job itself is
     covered in /e2e-worker-test.
   - Every console.error path the code logs

7. MULTI-TENANT PREREQUISITES — MANDATORY. Every spec must include, in
   the Prerequisites section, a specification of the **multi-tenant
   test environment** required to run it. A single-tenant Playwright
   run is not sufficient and the spec must make this impossible to
   ignore. Require:
   - **≥ 2 isolated tenants** with overlapping entity shapes (e.g.
     Tenant A and Tenant B both have invoices, payments, staff, etc.)
   - **At least one user per role per tenant** — admin, teacher,
     parent, student where applicable — so cross-tenant × cross-role
     assertions can be exercised
   - **At least one "hostile" pair**: Tenant A user attempts to read
     or mutate Tenant B data via direct URL manipulation (e.g.
     navigating to `/finance/invoices/{tenant_B_invoice_id}` while
     logged in as a Tenant A user). Expected: 404, 403, or empty
     result set. Never 200 with Tenant B's data.
   - **Seed data that differs between tenants** — e.g. different
     currencies, different invoice counts, different statuses — so a
     cross-reading leak would be visibly obviously wrong in the UI,
     not just a silent RLS hole
     The Prerequisites section must state exactly how many tenants, how
     many users, and which seeded entities they need, such that a
     tester provisioning the environment from scratch can follow it.
     Sample language:
     "Tenant A (slug: test-a) configured with currency EUR, 20
     invoices, 5 payments. Tenant B (slug: test-b) configured with
     currency USD, 50 invoices, 15 payments. Admin user, teacher user,
     and parent user provisioned in each tenant. A separate integration
     suite (/e2e-integration) runs the RLS leakage matrix — this spec
     exercises the UI-visible side of tenant isolation."

8. DATA INVARIANTS SECTION — MANDATORY. Click-then-check-UI is
   structurally blind to silent data corruption (wrong updated_at,
   orphan rows, balance drift, mis-allocated amounts). Every spec
   must include a "Data invariants" section near the end (before the
   Backend Endpoint Map) listing **SQL queries or API read-calls that
   must hold true after each major flow**. Each invariant is a
   testable statement:
   - After a payment allocation: `SELECT balance_amount FROM invoices
WHERE id=?` must equal `total_amount - SUM(allocated_amount
FROM payment_allocations WHERE invoice_id=?) - write_off_amount`.
     Tolerance: ±0.01.
   - After a refund execute: `SELECT status FROM payments WHERE id=?`
     must be `posted` / `refunded_partial` / `refunded_full` based on
     `SUM(refunds.amount WHERE status='executed')`.
   - After a fee generation confirm: `COUNT(*)` of invoices with the
     target `(household_id, billing_period_start)` key must equal
     the number of lines in the preview, no more, no less.
   - Every tenant-scoped write must set `tenant_id = <current
tenant>` — verifiable by `SELECT DISTINCT tenant_id FROM
     <table> WHERE id IN (<just-created-ids>)`.
   - No orphan rows: for every foreign key, the referenced row
     exists after the flow completes.
     The tester runs these queries against the DB (or the API read
     endpoints if DB access isn't available) and records Pass/Fail
     alongside the UI-level rows. This is the single biggest defence
     against "the UI says it worked but the DB is corrupted" failures.
     Each invariant row follows the same four-column format as the
     behavioural rows: `# | What to assert | Expected query result |
Pass/Fail`.

9. BACKEND ENDPOINT MAP. Each spec ends with a reference table listing
   every API endpoint the UI hits, its method, path, which section
   exercises it, and the required permission. This is how the tester
   validates via the Network tab.

10. CONSOLE AND NETWORK HEALTH SECTION. Include a dedicated section for
    "what the DevTools console and network tab should look like while
    running this spec" — zero uncaught errors, which 4xx are expected
    (deliberate permission tests), no 429 rate-limit surprises, polling
    cadence, etc.

11. ARABIC / RTL. Include a dedicated section verifying every RTL
    concern: page direction, logical spacing mirrors, grade cells /
    numerics wrapped in dir="ltr", date formatting (Gregorian +
    Latin numerals), component mirror behaviour.

12. OUT OF SCOPE — MANDATORY. Include a section at the top of the spec
    (right after Prerequisites) that explicitly lists what this spec
    does NOT cover, with pointers to the sibling command that picks
    it up. Copy this template and fill in module-specific examples:

    ```
    ## Out of scope for this spec

    This spec exercises the UI-visible surface of the {MODULE_NAME}
    module as a human (or Playwright agent) clicking through the
    admin/teacher/parent/student shells. It does NOT cover:

    - **RLS leakage and cross-tenant isolation** → /e2e-integration
      (multi-tenant matrix, direct-API cross-reads, encrypted-field
      access control)
    - **Stripe webhook signature + idempotency** → /e2e-integration
      (raw-body HMAC posting, replay deduplication, event-type
      routing)
    - **API contract tests bypassing the UI** → /e2e-integration
      (every endpoint × every permission role, every Zod validation
      edge case, every state-machine transition including invalid
      ones)
    - **DB-level invariants after each flow** → covered here as a
      separate "Data invariants" section AND in /e2e-integration for
      the machine-executable version
    - **Concurrency / race conditions** → /e2e-integration
      (parallel-call tests, atomic-guard exercises, SELECT FOR UPDATE
      verification)
    - **BullMQ jobs, cron schedulers, async side-effect chains** →
      /e2e-worker-test (every queue, processor, retry policy,
      dead-letter, tenant-aware payload check)
    - **Load / throughput / latency budgets** → /e2e-perf (p50 / p95
      / p99 per endpoint, list endpoints at 10k rows, PDF render
      time, bundle size, cold start)
    - **Security hardening** → /e2e-security-audit (OWASP Top 10,
      XSS / SQLi vectors, CSRF, JWT expiry + refresh, encrypted
      field leakage, CSP / HSTS headers)
    - **Long-lived regressions from modules outside {MODULE_NAME}**
      that import this module's services — tracked at the coverage
      tracker level, not here
    - **PDF content correctness** (the E2E spec verifies
      Content-Type / Content-Disposition / filename; the actual
      PDF bytes are verified in /e2e-integration via pdf-parse
      assertions)
    - **Browser / device matrix beyond desktop Chrome and 375px
      mobile emulation** — deferred to a manual QA cycle

    A tester who runs ONLY this spec is doing a thorough admin-shell
    smoke + regression pass. They are NOT doing a full tenant-
    readiness check. For the latter, use /e2e-full, which runs
    this spec plus all four siblings in sequence.
    ```

13. FORMAT. Use the four-column table pattern that already exists in
    other E2E specs:
    | # | What to Check | Expected Result | Pass/Fail |
    Numbered rows (1.1, 1.2, 2.1, ...). Section headers with anchors.
    Table of contents at the top. Sign-off table at the bottom for
    reviewer name / date / pass / fail / overall result.

═══════════════════════════════════════════════════════════════════════════
PROCESS
═══════════════════════════════════════════════════════════════════════════

Step 1 — Survey. List every file in the module (frontend pages,
components, modals; backend controllers, services, schemas). Read each
one. If you need to spawn subagents to parallelise the reading, do so —
but make sure every file is covered.

Step 2 — Map. Build an internal map of:

- Every unique URL
- Every button / form / modal / dialog / toast on each URL
- Every API endpoint and its permission
- Every state machine and its valid transitions
- Every role-gated affordance
- Every pre-fill / handoff / redirect path
- Every error path the code handles
- Every data invariant that must hold after a mutating flow

Step 3 — Outline. Build a deep section outline for each spec.
Admin-side should typically be the longest (more affordances). Target
section count that matches the complexity — if the module genuinely has
50+ distinct features, the spec should have 50+ sections. Do not pad;
do not truncate. Match the reality.

Step 4 — Write. Produce the admin spec first, then the teacher spec
(and parent / student if applicable). Write in chunks if necessary but
do NOT simplify, summarise, or drop rows to stay inside a chunk
boundary. Every row must be complete and standalone.

Step 5 — Self-review. After writing, open both files and walk them
against the code one more time. Ask yourself for every page: "Did I
cover every button? Every state? Every edge case? Did I include the
multi-tenant prerequisite? Did I include data invariants? Did I
include the out-of-scope list with pointers to siblings?" If the
answer is "probably" — go back and fix it.

Step 6 — Update the coverage tracker. Update E2E/COVERAGE-TRACKER.md
to reflect the new specs: row entries, page counts, overall
percentage, and the "Completed Specifications" table. If the tracker's
page counts for this module are stale (likely — modules get revamped),
correct them and add a note explaining the reconciliation.

═══════════════════════════════════════════════════════════════════════════
DELIVERABLES
═══════════════════════════════════════════════════════════════════════════

Save the files to:
{FOLDER_PATH}/admin_view/{module-slug}-e2e-spec.md
{FOLDER_PATH}/teacher_view/{module-slug}-e2e-spec.md
(Plus parent_view / student_view where applicable. Create folders if
missing.)

Update:
E2E/COVERAGE-TRACKER.md

At the end, report:

- Line count of each spec
- Section count of each spec
- How many unique pages are covered
- How many multi-tenant prerequisite rows (§ Prerequisites) the spec
  pulled in
- How many data-invariant rows the spec lists
- Any bugs or UX inconsistencies you spotted in the code during the
  walkthrough (surface these as a separate "observations" list — do
  NOT silently fix them, just flag them)

═══════════════════════════════════════════════════════════════════════════
ANTI-PATTERNS TO AVOID
═══════════════════════════════════════════════════════════════════════════

- Do NOT hand-wave with phrases like "standard form behaviour" or
  "typical table interactions" — spell it out
- Do NOT write "verify the modal works" — specify every field, button,
  validation rule, submit payload, success toast, failure toast
- Do NOT assume the reader knows the codebase
- Do NOT skip "boring" sections like loading states and empty states
- Do NOT merge multiple checks into one row to save space
- Do NOT truncate because a section "feels long enough" — it's long
  enough when it's complete, not when it's tired
- Do NOT rely on screenshots you don't have — describe the expected
  state in words so the tester can compare
- Do NOT skip negative assertions ("teacher should NOT see X")
- Do NOT leave a row without a concrete expected result
- Do NOT try to fold RLS / webhook / worker / perf / security concerns
  into this spec — delegate them to the sibling command via the
  Out-of-scope section
- Do NOT skip the multi-tenant prerequisite block. A single-tenant
  spec is structurally incapable of validating tenant isolation.
- Do NOT skip the data-invariants section. UI-only checks are blind
  to silent data corruption.
- Do NOT call the work done before self-reviewing and ticking off every
  file against the spec

═══════════════════════════════════════════════════════════════════════════
WHEN IN DOUBT
═══════════════════════════════════════════════════════════════════════════

Err on the side of too much detail. This document is the single thing
standing between a broken feature and a tenant finding it in
production. If you're unsure whether a row matters, include it. If
you're unsure whether a section is redundant, keep it. The cost of a
slightly too-long spec is a tester taking an extra hour. The cost of a
missed feature is a failed onboarding.

Begin with Step 1 (Survey) and do not skip it. When you're done,
confirm completion with the deliverables report described above.
