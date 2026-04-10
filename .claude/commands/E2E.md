You are producing E2E test specifications for the {MODULE_NAME} module. This
is QC documentation that our team will rely on before onboarding new tenants
— it is one of the highest-stakes deliverables in this project. Treat it that
way for the entire session.

═══════════════════════════════════════════════════════════════════════════
HARD RULES — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════════════════════

1. COVERAGE IS TOTAL. Not "most features." Not "the happy path." Every
   single page, sub-page, button, form field, modal, confirm dialog,
   toast, loading state, error state, empty state, permission guard,
   state transition, API call, redirect, query-param handoff, keyboard
   interaction, and RTL mirroring must be documented. If a line of code
   serves a function, that function must appear in the spec.

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

5. BOTH ADMIN AND TEACHER PERSPECTIVES. Produce two separate spec
   files, one per perspective, even if the URLs overlap. Same URLs
   often render completely different components based on role — the
   specs must document each variant exhaustively. The teacher spec
   must also include:
   - A "what teachers must NOT see or do" negative-assertion checklist
   - Cross-scope blocking assertions (every 403 path the backend
     enforces)
   - The explicit list of admin-only affordances that should be
     hidden

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
     presigned URLs, etc.)
   - Every console.error path the code logs

7. BACKEND ENDPOINT MAP. Each spec ends with a reference table listing
   every API endpoint the UI hits, its method, path, which section
   exercises it, and the required permission. This is how the tester
   validates via the Network tab.

8. CONSOLE AND NETWORK HEALTH SECTION. Include a dedicated section for
   "what the DevTools console and network tab should look like while
   running this spec" — zero uncaught errors, which 4xx are expected
   (deliberate permission tests), no 429 rate-limit surprises, polling
   cadence, etc.

9. ARABIC / RTL. Include a dedicated section verifying every RTL
   concern: page direction, logical spacing mirrors, grade cells /
   numerics wrapped in dir="ltr", date formatting (Gregorian +
   Latin numerals), component mirror behaviour.

10. FORMAT. Use the four-column table pattern that already exists in
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

Step 3 — Outline. Build a deep section outline for each spec.
Admin-side should typically be the longer of the two (more
affordances). Target section count that matches the complexity — if
the module genuinely has 50+ distinct features, the spec should have
50+ sections. Do not pad; do not truncate. Match the reality.

Step 4 — Write. Produce the admin spec first, then the teacher spec.
Write in chunks if necessary but do NOT simplify, summarise, or drop
rows to stay inside a chunk boundary. Every row must be complete and
standalone.

Step 5 — Self-review. After writing, open both files and walk them
against the code one more time. Ask yourself for every page: "Did I
cover every button? Every state? Every edge case?" If the answer is
"probably" — go back and fix it. If the answer is "I might be missing
something," you are missing something.

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
(Create the folders if they don't exist.)

Update:
E2E/COVERAGE-TRACKER.md

At the end, report:

- Line count of each spec
- Section count of each spec
- How many unique pages are covered
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
