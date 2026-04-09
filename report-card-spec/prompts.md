# Report Cards Implementation — Session Prompts

Copy-pasteable prompts for each remaining implementation. Each one is self-contained — drop it into a fresh Claude Code session (from `/Users/ram/Desktop/SDB`) and the session has everything it needs.

## How to use this file

1. Open a new Claude Code session in `/Users/ram/Desktop/SDB`.
2. Copy the full prompt block for the implementation you want to run.
3. Paste it as the first message.
4. The session reads the relevant spec files, executes the implementation, runs tests, commits locally, and logs completion — all autonomously.
5. Multiple implementations can run in **parallel** where the dependency graph allows it (see `README.md` parallelisation matrix). Use a fresh session per parallel task.

## The universal rules every session must follow

These rules are embedded in every prompt below, but documenting them here too so they're impossible to miss.

### Deployment policy — READ CAREFULLY

- **Commit to `main` locally when finished.** Every completed implementation must update HEAD with a clean commit. This is non-negotiable because the nightly deploy job picks up whatever is on HEAD when the user logs off.
- **DO NOT push the commit to `origin`.** Pushing triggers GitHub Actions which runs a 2+ hour CI pipeline — that is crippling and blocks further work. The nightly deploy handles the push on its own schedule.
- **DO NOT open a pull request.** Same reason — PRs trigger CI.
- **DO NOT run `git push` for any reason** unless the user explicitly asks in that specific session. Not even for a `--dry-run` check.
- **If you genuinely need to deploy something to production** for verification (rare — this should almost never apply to code-only implementations), you SSH directly to the production server and apply the change there. Do not rely on the GitHub → CI → deploy pipeline during the day.

### Commit policy

- One logical commit per implementation. Conventional commits format: `feat(report-cards): <what> (impl NN)` or `refactor(report-cards): ...` or `docs(report-cards): ...` as appropriate.
- Include the implementation log update in the same commit as the implementation itself.
- Never skip hooks (`--no-verify` is forbidden).
- Never amend an existing commit.
- If a pre-commit hook reformats files (prettier, lint-fix), accept the reformatting and include it in the commit.

### Server access policy

- **Server access is granted for every implementation in this document.** The user has pre-authorised SSH access for the Report Cards redesign work. The server details are available from the user's environment memory / CLAUDE.md.
- Use server access only when strictly necessary (investigating prod-only issues, applying a manual fix that can't wait for the nightly deploy, verifying something that only exists in production).
- **Production is live.** Follow the Production Server hard rules in `CLAUDE.md`: no destructive actions, no credential changes, no package upgrades on the server, no database drops.

### Test and quality gates

Before committing, every session must run and pass:

```bash
turbo test
turbo lint
turbo type-check
```

If any existing test that was previously passing now fails, **fix the regression before committing**. A change that breaks existing functionality is not complete.

For backend implementations that touch NestJS DI, also run the DI verification script from `00-common-knowledge.md` section 3.7 before committing.

### Parallel worktree orchestration — test lock

When multiple sessions run concurrently across git worktrees, they share the same local Postgres and Redis. Running `turbo test` in two sessions at the same time causes non-deterministic failures from fixture collisions.

**Every session MUST use the session-lock protocol before running any DB-touching command.** The protocol is documented in full in `00-common-knowledge.md` section 10a and `/Users/ram/Desktop/SDB/.session-locks/README.md`.

Quick reference — pattern to use around `turbo test`:

```bash
.session-locks/lock.sh acquire <your-impl-id> turbo-test
turbo test
TEST_RESULT=$?
.session-locks/lock.sh release <your-impl-id> turbo-test
```

Where `<your-impl-id>` is `impl-04`, `impl-05`, etc., matching the implementation number you are executing. The release MUST run even if tests fail. Commands that do NOT need locking: `turbo lint`, `turbo type-check`, `turbo build`, `prisma generate`, editing files, DI verification.

### Implementation log policy

Every session appends a completion entry to `/Users/ram/Desktop/SDB/report-card-spec/implementation-log.md` using the template at the top of that file. The log entry is part of the implementation — the work is not complete without it.

### When to stop and ask the user

Only stop and ask the user if:

- The spec is wrong or internally contradictory
- The change requires scope beyond what the implementation file describes
- A blocker forces a materially different approach
- A pre-requisite implementation is not yet complete (check `implementation-log.md` first)

Do NOT stop to ask about: implementation-level decisions, refactoring within scope, test fixes, commit messages, retrying after failures, or any routine execution.

---

## Prompts

---

### Implementation 04 — Generation Backend

**Wave 2 · Very high complexity · Depends on 01 + 03**

```
Execute implementation 04 (Generation Backend) for the Report Cards redesign.

Read these in order, then execute:
1. /Users/ram/Desktop/SDB/report-card-spec/design-spec.md — sections 7, 12, 13, 16 (generation wizard, languages, personal info fields, PDF render contract)
2. /Users/ram/Desktop/SDB/report-card-spec/implementations/00-common-knowledge.md — full file, non-negotiable rules
3. /Users/ram/Desktop/SDB/report-card-spec/implementations/04-generation-backend.md — the task itself

Before starting, verify dependencies are complete:
- Check /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md for a ✅ complete entry for implementation 01
- Check for a ✅ complete entry for implementation 03
- If impl 02 is not yet merged, the comment-gate service calls can be stubbed with a TODO — flag this in the log entry
- If either 01 or 03 is missing, STOP and tell me

You are building:
- Refactor of ReportCardGenerationService to accept the new scope model (year_group / class / individual), multi-language output, comment gate validation, and overwrite semantics
- Dry-run endpoint for the wizard's comment-gate preview
- Generation run endpoint with scope/period/template/fields/override payload
- Worker processor refactor to iterate students, render PDFs per language, upsert ReportCard rows, delete old PDFs on overwrite
- Render contract definition (apps/worker/src/processors/report-card-render.contract.ts)
- Placeholder renderer (apps/worker/src/processors/report-card-render.placeholder.ts) that produces a valid test PDF — the production renderer is impl 11
- New controller routes: POST /v1/report-cards/generation-runs/dry-run, POST /v1/report-cards/generation-runs, GET /v1/report-cards/generation-runs/:id, GET /v1/report-cards/generation-runs

Follow the task breakdown in section 4 and acceptance criteria in section 9 of impl 04.

KEY INVARIANTS:
- Overwrite semantics: upsert on unique (tenant_id, student_id, academic_period_id, template_id, template_locale). Delete old PDF storage key in the same transaction.
- Comment gate is strict by tenant setting, but admin can override with an explicit override flag.
- English PDF is always generated. Arabic PDF is additionally generated for students with preferred_second_language = 'ar' AND a template that has an Arabic locale.
- BullMQ job payload MUST include tenant_id. Processor extends TenantAwareJob.
- Per-student errors go to errors_json and increment students_blocked_count — the job continues for the rest. Only infrastructure failures fail the whole job.

When done:
- Run turbo test, turbo lint, turbo type-check — all must be green
- Run the DI verification script from 00-common-knowledge.md section 3.7
- Update docs/architecture/event-job-catalog.md with the refactored report-card:generate job
- Update docs/architecture/state-machines.md with the ReportCardBatchJob status lifecycle (pending → running → completed / partial_success / failed)
- Update docs/architecture/module-blast-radius.md with the generation service's new cross-module deps
- Commit to main with a conventional commit message referencing impl 04
- DO NOT PUSH the commit. Do not run git push. Do not open a PR.
- Append a completion entry to /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md using the stub in section 11 of impl 04

Do NOT touch:
- Any frontend files (impl 09)
- The actual PDF visual rendering — that is impl 11. Use the placeholder only.
- Files outside apps/api/src/modules/gradebook/report-cards/, apps/worker/src/processors/, and apps/api/test/report-cards/

Server access is granted for this task. SSH is available if you absolutely need to verify something against production, but for a code-only refactor you should not need it. Production deployment policy: commits update HEAD only. The nightly deploy runs at user logoff and pushes HEAD through CI. Do not push during the session.

The old POST /v1/report-cards/generate-batch endpoint must remain functional through this impl — its removal is deferred to impl 12.

Work autonomously per the CLAUDE.md execution policy. Do not ask for approval on implementation details.
```

---

### Implementation 05 — Teacher Requests Backend

**Wave 2 · Medium complexity · Depends on 01 (soft-depends on 02 + 04 for auto-execute)**

```
Execute implementation 05 (Teacher Requests Backend) for the Report Cards redesign.

Read these in order, then execute:
1. /Users/ram/Desktop/SDB/report-card-spec/design-spec.md — section 10 (teacher requests)
2. /Users/ram/Desktop/SDB/report-card-spec/implementations/00-common-knowledge.md — full file, non-negotiable rules
3. /Users/ram/Desktop/SDB/report-card-spec/implementations/05-teacher-requests-backend.md — the task itself

Before starting, verify dependencies:
- Check /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md for a ✅ complete entry for implementation 01
- If 01 is not done, STOP and tell me
- Impls 02 and 04 are soft dependencies for the auto-execute paths. If they are not yet merged, stub the downstream service calls with TODO comments and mark this impl ⚠️ partial in the log entry with a note about what needs wiring when 02/04 land.

You are building:
- ReportCardTeacherRequestsService + controller
- State machine (pending → approved → completed; pending → rejected; pending → cancelled)
- Submit endpoint (teachers), cancel endpoint (own pending only), approve / reject endpoints (admin only), mark-completed endpoint
- Optional auto-execute on approve: for open_comment_window → call ReportCommentWindowsService.open; for regenerate_reports → call ReportCardGenerationService.generateRun
- Notification hooks for new request + review decision (use existing notification infrastructure)
- Zod DTOs with request_type / target_scope_json discriminated validation

Follow the task breakdown in section 4 and acceptance criteria in section 9 of impl 05.

KEY POINTS:
- State machine transitions must be validated before every update
- Teachers can only cancel their OWN pending requests — enforced server-side
- Approve with auto_execute = false (default) returns the pre-filled parameters so the frontend can route the principal into the wizard. auto_execute = true calls the downstream service directly.
- RLS leakage test for report_card_teacher_requests table is mandatory

When done:
- Run turbo test, turbo lint, turbo type-check — all must be green
- Run the DI verification script
- Update docs/architecture/module-blast-radius.md if cross-module imports changed
- Verify docs/architecture/state-machines.md has TeacherRequestStatus documented (impl 01 should have added it)
- Commit to main with a conventional commit message referencing impl 05
- DO NOT PUSH. Do not run git push. Do not open a PR.
- Append a completion entry to /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md

Do NOT touch frontend files (impl 10) or files outside the report-cards module.

Server access is granted. Deployment policy: commits update HEAD only; nightly deploy handles the push and CI. If you absolutely need to verify something against production, SSH directly.

Work autonomously. Do not ask for approval on implementation details.
```

---

### Implementation 06 — Matrix & Library Backend

**Wave 2 · Medium-low complexity · Depends on 01**

```
Execute implementation 06 (Matrix & Library Backend) for the Report Cards redesign.

Read these in order, then execute:
1. /Users/ram/Desktop/SDB/report-card-spec/design-spec.md — sections 6 and 11 (matrix view, library)
2. /Users/ram/Desktop/SDB/report-card-spec/implementations/00-common-knowledge.md — full file
3. /Users/ram/Desktop/SDB/report-card-spec/implementations/06-matrix-and-library-backend.md — the task itself

Before starting, verify:
- Check /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md for a ✅ complete entry for implementation 01
- If 01 is not done, STOP and tell me

You are building:
- New method getClassMatrix on ReportCardsQueriesService — returns students × subjects × period aggregation, reusing the EXISTING gradebook aggregation (do NOT reimplement)
- New method listReportCardLibrary on ReportCardsQueriesService — returns current (non-superseded) report card documents scoped to the caller's role
- New controller routes: GET /v1/report-cards/classes/:classId/matrix and GET /v1/report-cards/library
- Signed URL generation for PDF downloads (5-minute TTL) using existing storage provider patterns
- Deprecation of the existing flat GET /v1/report-cards/overview endpoint — add @deprecated JSDoc, log a warning, but do NOT delete (deletion is impl 12)
- Top-3 rank calculation with dense rank tie-handling

Follow the task breakdown in section 4 and acceptance criteria in section 9 of impl 06.

KEY POINTS:
- Reuse existing gradebook query helpers. Do not duplicate grade aggregation logic — report card data and gradebook data must be identical.
- Scope the library query per role: admin/view sees all; teachers see only students in their teaching assignments.
- Rank: dense rank on weighted overall average. Only ranks 1, 2, 3 are emitted; everyone else gets null. Ties share the same rank.
- Do not break the existing overview endpoint — it must continue working for the current frontend until impl 12.

When done:
- Run turbo test, turbo lint, turbo type-check
- Run DI verification script
- Consider adding a danger-zones.md entry: "Report card matrix reuses gradebook aggregation; any change to gradebook aggregation semantics affects report cards silently."
- Commit to main with a conventional commit message referencing impl 06
- DO NOT PUSH. Do not run git push. Do not open a PR.
- Append completion entry to implementation-log.md

Do NOT touch frontend files (impl 07) or generation logic (impl 04).

Server access is granted. Deployment policy: commits update HEAD only; nightly deploy handles push + CI.

Work autonomously.
```

---

### Implementation 07 — Frontend Overview / Matrix / Library

**Wave 3 · Medium complexity · Depends on 06**

```
Execute implementation 07 (Frontend Overview / Matrix / Library) for the Report Cards redesign.

Read these in order, then execute:
1. /Users/ram/Desktop/SDB/report-card-spec/design-spec.md — sections 6 and 11
2. /Users/ram/Desktop/SDB/report-card-spec/implementations/00-common-knowledge.md — full file, especially the Frontend-specific rules section
3. /Users/ram/Desktop/SDB/report-card-spec/implementations/07-frontend-overview-library.md — the task itself

Before starting, verify:
- Check /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md for ✅ complete entries for implementations 01 and 06
- If either is not done, STOP and tell me

You are building:
- Rebuilt /[locale]/(school)/report-cards/page.tsx — landing with class cards grouped by year group, mirroring the existing gradebook landing visual pattern
- New /[locale]/(school)/report-cards/[classId]/page.tsx — per-class matrix view mirroring the existing gradebook results matrix
- New /[locale]/(school)/report-cards/library/page.tsx — generated documents library with filters and signed-URL downloads
- Translation keys added to both messages/en.json and messages/ar.json
- Navigation wiring to the Learning hub sub-strip
- E2E Playwright tests for key flows

Follow the task breakdown in section 4 and acceptance criteria in section 10 of impl 07.

HARD RULES (non-negotiable):
- Use logical CSS properties ONLY (ms-, me-, ps-, pe-, start-, end-). Never ml-, mr-, pl-, pr-, left-, right-, text-left, text-right. This is a build error if violated.
- Mobile responsive at 375px — tables wrap in overflow-x-auto, sticky first column, touch targets ≥ 44×44px
- 'use client' at top of every page file. Data fetching via apiClient<T>() + useEffect. No server components for the authenticated shell.
- Forms (if any) use react-hook-form + zodResolver, never individual useState per field
- Every new string has both en.json and ar.json entries
- Mirror the existing gradebook landing page and matrix component structure exactly — just swap the data source and semantics

Testing:
- Run turbo test, turbo lint, turbo type-check, turbo build --filter=@school/web
- E2E Playwright tests for the landing, matrix, and library pages

When done:
- Verify Arabic RTL renders correctly by manually switching locale in dev
- Commit to main with a conventional commit message referencing impl 07
- DO NOT PUSH. Do not run git push. Do not open a PR.
- Append completion entry to implementation-log.md
- No architecture doc updates needed (frontend-only)

Do NOT touch backend services, comment editor pages (impl 08), wizard pages (impl 09), or requests pages (impl 10).

Server access is granted. Deployment policy: commits update HEAD only; nightly deploy handles push + CI. For visual verification, run the local dev server — do not rely on production.

Work autonomously.
```

---

### Implementation 08 — Frontend Report Comments

**Wave 3 · High complexity · Depends on 02**

```
Execute implementation 08 (Frontend Report Comments) for the Report Cards redesign.

Read these in order, then execute:
1. /Users/ram/Desktop/SDB/report-card-spec/design-spec.md — sections 8 and 9 (comment editor + comment windows)
2. /Users/ram/Desktop/SDB/report-card-spec/implementations/00-common-knowledge.md — full file, especially Frontend rules
3. /Users/ram/Desktop/SDB/report-card-spec/implementations/08-frontend-report-comments.md — the task itself

Before starting, verify:
- Check /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md for ✅ complete entries for implementations 01 and 02
- If either is not done, STOP and tell me

You are building a brand new surface under /[locale]/(school)/report-comments/:
- Landing page with year-group-grouped assignment cards + window status banner
- 3-column subject comment editor (student / grade + sparkline / inline-editable comment with AI draft seeding)
- Overall comment editor (homeroom flow, no AI draft)
- Admin controls: open window modal, close/extend/reopen buttons
- "Request window reopen" inline submission modal (submits to the teacher-requests endpoint)
- AI draft flow with "AI" badge, per-row finalise, bulk actions, window-gating
- New translation keys in en.json and ar.json
- Navigation wiring (new Report Comments entry in Learning hub, permission-gated to report_cards.comment)
- E2E tests covering open window + closed window scenarios

Follow the task breakdown in section 4 and acceptance criteria in section 9 of impl 08.

HARD RULES:
- Use logical CSS properties ONLY — ms-, me-, ps-, pe-, start-, end-. Never physical directions.
- Mobile responsive at 375px — the 3-column editor uses horizontal scroll with sticky student column on narrow screens
- Debounced saves (500ms) on comment text changes
- Window closed state = all textareas readOnly, all AI buttons disabled. The closed state must be visually obvious and the UI must not let users bypass it (the backend enforces too).
- AI draft badge appears until the teacher edits or finalises
- react-hook-form + zodResolver for modal forms
- Sparkline can be minimal — raw SVG polyline is fine

Testing:
- turbo test, turbo lint, turbo type-check, turbo build --filter=@school/web
- E2E covering: teacher open-window flow, teacher closed-window flow, admin open-a-window flow, request-reopen submission

When done:
- Verify Arabic RTL manually
- Commit to main with a conventional commit message referencing impl 08
- DO NOT PUSH. Do not run git push. Do not open a PR.
- Append completion entry to implementation-log.md

Do NOT touch backend services (impl 02), wizard pages (impl 09), or the full Teacher Requests management page (impl 10) — only the inline request-reopen modal belongs here.

Server access is granted. Deployment policy: commits update HEAD only. Local dev server for verification.

Work autonomously.
```

---

### Implementation 09 — Frontend Generation Wizard & Settings

**Wave 3 · High complexity · Depends on 03 + 04**

```
Execute implementation 09 (Frontend Generation Wizard & Settings) for the Report Cards redesign.

Read these in order, then execute:
1. /Users/ram/Desktop/SDB/report-card-spec/design-spec.md — sections 7, 13, 15 (wizard, personal info fields, principal signature)
2. /Users/ram/Desktop/SDB/report-card-spec/implementations/00-common-knowledge.md — full file, especially Frontend rules
3. /Users/ram/Desktop/SDB/report-card-spec/implementations/09-frontend-wizard-settings.md — the task itself

Before starting, verify:
- Check /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md for ✅ complete entries for implementations 01, 03, and 04
- If any are not done, STOP and tell me

You are building:
- /[locale]/(school)/report-cards/generate/page.tsx — 6-step wizard with state reducer
  1. Scope selection (year group / class / individual with multi-select)
  2. Period selection
  3. Template selection (only grades-only selectable for v1; other scopes shown disabled with "coming soon")
  4. Personal info fields (pre-filled from tenant defaults, per-run override)
  5. Comment gate dry-run (calls /dry-run endpoint, shows missing/unfinalised summary, force-generate checkbox)
  6. Review + submit → poll /generation-runs/:id until terminal state
- /[locale]/(school)/report-cards/settings/page.tsx — tenant settings form (react-hook-form + zodResolver) + principal signature upload with preview
- Permission gates: wizard requires report_cards.manage; settings view requires view, settings edit requires manage
- Step components under _components/wizard/
- Navigation guard on wizard submission (warn on unload while polling)
- Translation keys in both locales

Follow the task breakdown in section 4 and acceptance criteria in section 9 of impl 09.

HARD RULES:
- Logical CSS only. Mobile-responsive at 375px. 'use client' pages. apiClient<T>() + useEffect.
- Wizard state: single useReducer, no context, no state library
- Polling: setInterval in useEffect, cleared on unmount + terminal state
- Signature upload client-side validation: PNG/JPG/WebP, max 2MB. Backend also validates.
- react-hook-form + zodResolver for the settings form, never individual useState
- The wizard's query-param pre-fill support is important — impl 10's teacher request approval flow redirects here with scope_mode, scope_ids, period_id query params and the wizard should detect and jump to review step

Testing:
- turbo test, turbo lint, turbo type-check, turbo build --filter=@school/web
- E2E covering: full wizard flow (happy path), force-generate path when comments missing, non-admin redirect, settings save, signature upload

When done:
- Verify Arabic RTL manually
- Commit to main with a conventional commit message referencing impl 09
- DO NOT PUSH. Do not run git push. Do not open a PR.
- Append completion entry to implementation-log.md

Do NOT touch backend (impls 03/04), comment editor (impl 08), overview pages (impl 07), or teacher requests (impl 10).

Server access is granted. Deployment policy: commits update HEAD only. Local dev server for verification.

Work autonomously.
```

---

### Implementation 10 — Frontend Teacher Requests

**Wave 3 · Low-medium complexity · Depends on 05**

```
Execute implementation 10 (Frontend Teacher Requests) for the Report Cards redesign.

Read these in order, then execute:
1. /Users/ram/Desktop/SDB/report-card-spec/design-spec.md — section 10
2. /Users/ram/Desktop/SDB/report-card-spec/implementations/00-common-knowledge.md — full file
3. /Users/ram/Desktop/SDB/report-card-spec/implementations/10-frontend-teacher-requests.md — the task itself

Before starting, verify:
- Check /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md for ✅ complete entries for implementations 01 and 05
- If either is not done, STOP and tell me

You are building:
- /[locale]/(school)/report-cards/requests/page.tsx — list view with teacher "my requests" and admin pending/all/mine tabs
- /[locale]/(school)/report-cards/requests/new/page.tsx — submit new request form with query-param pre-fill support
- /[locale]/(school)/report-cards/requests/[id]/page.tsx — detail view with approve/reject actions
- Reject modal component with review note textarea
- Query-param handoff to impls 08 and 09:
  - Approve open_comment_window → redirect to /report-comments?open_window_period=<id> (impl 08 reads this and opens the window modal)
  - Approve regenerate_reports → redirect to /report-cards/generate?scope_mode=<>&scope_ids=<>&period_id=<> (impl 09 reads this and jumps to review)
  - You may need to make small edits to impl 08 and impl 09 pages to add the query-param detection — that's acceptable and expected
- Translation keys in both locales
- Navigation wiring with a pending-count badge for admins
- E2E tests for submit → review → approve/reject cycle

Follow the task breakdown in section 4 and acceptance criteria in section 9 of impl 10.

HARD RULES:
- Logical CSS only. Mobile-responsive. 'use client'. apiClient<T>() + useEffect.
- Teachers can only cancel their own pending requests — UI must enforce this (backend also enforces)
- react-hook-form + zodResolver for the submit form
- Pre-fill from query params: use useSearchParams(), apply in useEffect, clear params after consumption so they don't stick on refresh

Testing:
- turbo test, turbo lint, turbo type-check, turbo build --filter=@school/web
- E2E: teacher submits, teacher cancels own, admin sees in pending queue, admin approves (routes to wizard), admin rejects with note

When done:
- Verify Arabic RTL manually
- Commit to main with a conventional commit message referencing impl 10
- DO NOT PUSH. Do not run git push. Do not open a PR.
- Append completion entry to implementation-log.md

Do NOT touch backend (impl 05), or other frontend pages except for the small query-param additions to impl 08 and impl 09 pages.

Server access is granted. Deployment policy: commits update HEAD only. Local dev for verification.

Work autonomously.
```

---

### Implementation 11 — PDF Template Rendering

**Wave 4 · Medium-high complexity · Depends on 04 · Designs already exist**

```
Execute implementation 11 (PDF Template Rendering) for the Report Cards redesign.

Read these in order, then execute:
1. /Users/ram/Desktop/SDB/report-card-spec/design-spec.md — section 16 (PDF template rendering contract)
2. /Users/ram/Desktop/SDB/report-card-spec/implementations/00-common-knowledge.md — full file
3. /Users/ram/Desktop/SDB/report-card-spec/implementations/11-pdf-template-rendering.md — the task itself
4. /Users/ram/Desktop/SDB/report-card-spec/template-01.html — Template 1 HTML reference (Editorial Academic, Fraunces + forest green + gold)
5. /Users/ram/Desktop/SDB/report-card-spec/template-02.html — Template 2 HTML reference (Modern Editorial, Bricolage Grotesque + cobalt blue)

NOTE: Template 3 (template-03.html) is INTENTIONALLY EXCLUDED from PDF rendering. The user has decided T3 is an online-only viewing template and will not be generated as a PDF. Only T1 and T2 are printed.

Before starting, verify:
- Check /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md for a ✅ complete entry for implementation 04
- If 04 is not done, STOP and tell me
- Verify that apps/worker has @react-pdf/renderer in its dependencies; it should already be present since the existing report card generation uses it

You are building:
- Two PDF templates implemented as React-PDF components:
  1. Template 1 — "Editorial Academic" — port template-01.html to apps/web/src/report-card-templates/editorial-academic/
  2. Template 2 — "Modern Editorial" — port template-02.html to apps/web/src/report-card-templates/modern-editorial/
- Each template has an en.tsx + an ar.tsx file (both mirrored RTL for Arabic)
- Shared layout primitives in apps/web/src/report-card-templates/_shared/ (PageLayout, Masthead variants, SubjectsTable variants, etc.)
- Font registration — both templates need their display + body + mono fonts embedded in the PDF. Download the font files from Google Fonts (SIL OFL licensed), place them in apps/web/src/report-card-templates/_shared/fonts/, and register them via React-PDF's Font.register API.
  - Template 1: Fraunces, Archivo, JetBrains Mono
  - Template 2: Bricolage Grotesque, Source Serif 4, JetBrains Mono
  - For Arabic variants: add Noto Naskh Arabic or Amiri (SIL OFL) to both templates' Arabic files
- Manifest JSON per template (id, name, content_scope='grades_only', languages=['en','ar'])
- Renderer wrapper classes that pick en/ar based on payload.language
- Worker DI binding that swaps the placeholder renderer from impl 04 for these production renderers
- Visual regression tests — use pdf-parse or similar to extract text and assert key content is present in both EN and AR outputs

Follow the task breakdown in section 4 and acceptance criteria in section 9 of impl 11.

VISUAL FIDELITY REQUIREMENTS:
- The PDF output must match the HTML preview AS CLOSELY AS @react-pdf/renderer permits. React-PDF has layout quirks compared to browser CSS (no grid, limited flexbox, no CSS custom properties) — you will need to rewrite styles using React-PDF's StyleSheet API
- Colours, fonts, typographic hierarchy, decorative elements (frames, watermarks, dividers, corner marks, ornamental flourishes), and data visualisations (radar chart for T1, horizontal bar chart for T2) must all be reproduced
- For SVG elements (watermarks, radar chart, bar chart, signature), use React-PDF's <Svg>, <Path>, <Circle>, <Line>, <Polygon>, <Text> primitives — they map directly from the HTML SVG
- Support dynamic data injection — every piece of student data, grades, comments, settings must come from the ReportCardRenderPayload defined in impl 04

ARABIC (RTL) REQUIREMENTS:
- Use React-PDF's direction prop on the root Document/Page
- Apply logical ordering: flexDirection: 'row-reverse' where needed
- Embed an Arabic font file — verify it includes proper Arabic glyph shaping
- Western numerals (0-9) throughout, Gregorian calendar dates — per project i18n rule
- Arabic translations for all labels and static strings
- Use the translated Arabic strings from the Arabic HTML variants (template-01-ar.html, template-02-ar.html) IF they exist at this point; if not, work from the English versions and translate

Testing:
- Unit tests that render each template with canned payloads
- Text extraction assertions verifying key content appears correctly in both languages
- Integration: re-run impl 04's generation e2e tests — PDFs should now be the production versions
- Missing-field handling test: render with no photo, no signature, no rank badge → should not error
- Subject overflow test: 12 subjects → second page renders
- turbo test, turbo lint, turbo type-check, turbo build

When done:
- Update docs/architecture/event-job-catalog.md to note the production renderer is now in use
- Commit to main with a conventional commit message referencing impl 11
- DO NOT PUSH. Do not run git push. Do not open a PR.
- Append completion entry to implementation-log.md

Do NOT touch the generation service (impl 04), cleanup (impl 12), or the HTML template files (they are the reference, not the source).

Server access is granted. Deployment policy: commits update HEAD only. For visual verification, render test PDFs locally via the worker and inspect them with your PDF viewer.

Work autonomously. Iterate on visual fidelity until the PDFs match the HTML previews as closely as the React-PDF rendering engine allows.
```

---

### Implementation 12 — Cleanup & Documentation

**Wave 5 · Low-medium complexity · Depends on all prior implementations**

```
Execute implementation 12 (Cleanup & Documentation) for the Report Cards redesign.

Read these in order, then execute:
1. /Users/ram/Desktop/SDB/report-card-spec/design-spec.md — full file for final verification pass
2. /Users/ram/Desktop/SDB/report-card-spec/implementations/00-common-knowledge.md — full file
3. /Users/ram/Desktop/SDB/report-card-spec/implementations/12-cleanup-and-docs.md — the task itself

Before starting, verify ALL prior implementations are complete:
- Check /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md for ✅ complete entries for implementations 01 through 11
- Implementation 11 is acceptable as "on hold" ONLY if the user explicitly decided to defer it — otherwise treat it as required
- If any are missing, STOP and tell me which ones

You are doing the final cleanup pass:
- Delete the old GET /v1/report-cards/overview endpoint + service method + tests (after grepping apps/web/src/ to confirm no frontend references remain)
- Delete the old POST /v1/report-cards/generate-batch endpoint if the wizard from impl 09 has fully replaced it
- Grep for and remove dead code: OverviewRow types, OverviewResponse types, old ai-generate-comments bulk frontend calls (backend may be preserved deprecated)
- Audit every file in docs/architecture/ and verify it reflects the current redesigned state:
  - module-blast-radius.md — all new cross-module deps documented
  - event-job-catalog.md — refactored report-card:generate job fully documented
  - state-machines.md — CommentWindowStatus, TeacherRequestStatus, ReportCardBatchJob, extended ReportCardStatus all present
  - danger-zones.md — entries for: gradebook aggregation coupling, regeneration PDF deletion data loss, AI window cost control, PDF font replacement requires redeploy
- Delete apps/worker/src/processors/report-card-render.placeholder.ts — impl 11 has landed the production renderer
- Ratchet coverage thresholds in jest.config.js to the new baseline (new baseline minus 2% per project convention)
- Ask the user about updating docs/architecture/feature-map.md with the Report Cards redesign changes. Do NOT update unilaterally — compose a summary of what changed and wait for user decision.

Follow the task breakdown in section 4 and acceptance criteria in section 8 of impl 12.

Final regression pass:
- turbo test — must be fully green
- turbo lint — zero errors
- turbo type-check — zero errors
- turbo build — zero errors
- DI verification script — must succeed
- Manual smoke test of 8 key flows in English AND Arabic:
  1. Admin opens a comment window
  2. Teacher writes and finalises a comment with AI draft
  3. Admin closes the window and runs the generation wizard for a year group
  4. Generation completes and reports appear in the library
  5. Teacher views a class matrix and downloads a report
  6. Teacher submits a regenerate request for one student
  7. Admin reviews and approves with auto-execute
  8. Regenerated report replaces the old one in the library

When done:
- Commit to main with a conventional commit message referencing impl 12
- DO NOT PUSH. Do not run git push. Do not open a PR.
- Append completion entry to /Users/ram/Desktop/SDB/report-card-spec/implementation-log.md — this is the final entry, summarising the overall project completion state

Server access is granted. Deployment policy: commits update HEAD only. This is the cleanup pass so no prod changes should be needed. If the smoke test uncovers a prod-only issue, SSH directly to investigate.

Work autonomously. If the smoke test fails, diagnose and fix the regression. Do not skip any failing test.
```

---

## Reminder on parallelisation

After impl 04 is done, you can kick off multiple impls in parallel:

- **Wave 2 parallel:** 05 and 06 can run in parallel (04 is done, 02 and 03 are assumed done, they don't share files)
- **Wave 3 parallel:** 07, 08, 09, 10 can all run in parallel once their backends are done — each touches a distinct set of frontend files

To run parallel sessions safely, use git worktrees (see `superpowers:using-git-worktrees` skill) so each session has an isolated working tree. Without worktrees, two sessions editing the same `report-card.module.ts` or `implementation-log.md` will silently clobber each other.

The cleanest approach if you are running single-threaded is sequential: 04 → (05 + 06 sequential) → (07 → 08 → 09 → 10 sequential) → 11 → 12. Slower but zero coordination cost.
