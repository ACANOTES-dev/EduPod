# Implementation 04 — Generation Backend

**Wave:** 2 (backend fan-out, but with a dep on 03)
**Depends on:** 01 (schema), 03 (template content_scope + settings service)
**Blocks:** 09 (frontend wizard), 11 (PDF template rendering)
**Can run in parallel with:** 02, 05, 06 (after 03 completes)
**Complexity:** very high — the most complex implementation in this redesign

---

## 1. Purpose

Refactor the generation service to support the new scope model (year/class/individual), multi-language output (English always + optional second language), comment gating (strict, with admin override), overwrite semantics, and the personal-info field configuration. Also refactor the worker processor that actually produces PDFs.

**Authoritative design:** `report-card-spec/design-spec.md` Sections 7, 12, 13, 16.

---

## 2. Scope

### In scope

1. Refactor of `ReportCardGenerationService` to accept the new scope + period + template + language + fields payload
2. Comment gating logic — count missing/unfinalised comments, block or allow based on settings + override flag
3. Refactor of the worker processor `report-card-generation.processor.ts` (or equivalent) to:
   - Iterate over scope-resolved students
   - Load grades, comments, settings, template
   - Call the render function (contract only — actual template in impl 11)
   - Upsert `ReportCard` rows per (student, period, template, locale)
   - Delete old PDF storage keys on overwrite
   - Track counters on the batch job
4. New endpoints on the existing `ReportCardsController` for:
   - Starting a generation run (admin wizard submit)
   - Dry-running the comment gate (wizard validation step)
   - Fetching run status (for wizard polling)
5. Integration between the generation service and (a) `ReportCardTenantSettingsService`, (b) `ReportCardTemplateService`, (c) `ReportCardSubjectCommentsService`, (d) `ReportCardOverallCommentsService`

### Out of scope

- The actual PDF React-PDF template rendering — impl 11 holds this until user provides the visual design
- The wizard UI — impl 09
- Comment editing — impl 02 (already done)
- Teacher requests that trigger generation — impl 05 handles the request flow; this impl exposes the generation endpoint that request-approval will call

---

## 3. Prerequisites

1. Impl 01 (schema) merged
2. Impl 03 (template refactor + settings service) merged
3. (Recommended) Impl 02 merged so you can import `ReportCardSubjectCommentsService` / `ReportCardOverallCommentsService` for the comment-gate check. If impl 02 lands after impl 04 starts, you can create the comment services' read methods as a stub interface and swap in the real service via DI once impl 02 lands.
4. `turbo test` green on main

---

## 4. Task breakdown

### 4.1 Scope resolution

Define a `ScopeResolver` helper (private class or module-level function) that takes:

```ts
type GenerationScope =
  | { mode: 'year_group'; year_group_ids: string[] }
  | { mode: 'class'; class_ids: string[] }
  | { mode: 'individual'; student_ids: string[] };
```

…and returns an array of resolved student IDs (tenant-scoped). Each mode expands via existing queries:

- `year_group`: join `year_groups → classes → enrollments → students`, dedupe
- `class`: join `classes → enrollments → students`, dedupe
- `individual`: direct student IDs, verify they belong to this tenant

Return empty array with a clear error code `SCOPE_EMPTY` if no students match.

### 4.2 Comment gate dry-run

New method on `ReportCardGenerationService`:

```ts
dryRunCommentGate(tenantId: string, {
  scope: GenerationScope,
  academicPeriodId: string,
  contentScope: ReportCardContentScope,
}): Promise<{
  students_total: number;
  missing_subject_comments: Array<{ student_id: string; student_name: string; subject_id: string; subject_name: string }>;
  unfinalised_subject_comments: Array<{ student_id: string; subject_id: string }>;
  missing_overall_comments: Array<{ student_id: string; student_name: string }>;
  unfinalised_overall_comments: Array<{ student_id: string }>;
  would_block: boolean;  // true if require_finalised_comments is on and anything is missing
}>
```

**Logic:**

1. Resolve scope → student IDs
2. For each student, determine which subjects they take via enrolment → class → class subjects
3. Query `report_card_subject_comments` for `(student, subject, period)` triples — count missing / unfinalised
4. Query `report_card_overall_comments` for `(student, period)` — count missing / unfinalised
5. Load tenant settings — if `require_finalised_comments` is true, set `would_block = true` when any missing/unfinalised exists
6. Return the structured result (the wizard displays this as a pre-submit summary)

### 4.3 `generateRun` method

```ts
generateRun(tenantId: string, actor: User, dto: StartGenerationRunDto): Promise<{ batch_job_id: string }>
```

**Logic:**

1. Validate DTO (Zod pipe in controller does this)
2. Resolve scope → student IDs (throws `SCOPE_EMPTY` if empty)
3. Run comment gate check (above)
4. If `would_block` and not `override_comment_gate`: throw `ForbiddenException({ code: 'COMMENT_GATE_BLOCKING', details: {...} })`
5. Load tenant settings
6. Determine effective `personal_info_fields` (DTO > settings default)
7. Determine languages: always `['en']`, plus `'ar'` if any student in the scope has `preferred_second_language = 'ar'` AND the template has an Arabic locale
8. Insert a `ReportCardBatchJob` row with `status = 'pending'`, `scope_type`, `scope_ids_json`, `personal_info_fields_json`, `languages_requested`, `students_generated_count = 0`, `students_blocked_count = 0`
9. Enqueue a BullMQ job on the `report-card-generation` queue with payload `{ tenant_id, batch_job_id, ... }`
10. Return the batch_job_id for wizard polling

### 4.4 Processor refactor

**File:** `apps/worker/src/processors/report-card-generation.processor.ts` (verify exact path; search if needed)

Extends `TenantAwareJob` (mandatory — see `00-common-knowledge.md` §3.1).

**Job payload:**

```ts
interface GenerationJobPayload {
  tenant_id: string;
  batch_job_id: string;
}
```

**Flow:**

1. Load the batch job row by id
2. Update status to `running`, set `started_at`
3. Resolve the scope from `scope_ids_json`
4. For each student in the resolved list:
   a. Load grade aggregation for the period (reuse gradebook aggregation — do NOT reimplement)
   b. Load finalised subject comments for the student
   c. Load finalised overall comment for the student
   d. Load student's `preferred_second_language`
   e. Load tenant settings (passed in from the job enqueue OR loaded once per job and cached)
   f. Load principal signature (passed as bytes OR signed URL)
   g. Build the English render payload
   h. Call the render function → get PDF bytes (see §4.5)
   i. Upload bytes to storage with key `tenant/{tenant_id}/report-cards/{student_id}/{period_id}/{template_id}/en.pdf`
   j. Upsert `ReportCard` row (unique on `(tenant_id, student_id, academic_period_id, template_id, template_locale)`)
   k. If the row pre-existed, delete the old `pdf_storage_key` from storage
   l. If the student has `preferred_second_language = 'ar'` AND template has an Arabic locale, repeat (g)–(k) with `locale='ar'`
   m. Increment `students_generated_count`
   n. On error: append to `errors_json`, increment `students_blocked_count`, continue to next student
5. Update batch job status to `completed` (or `partial_success` if `students_blocked_count > 0`), set `finished_at`

**Error handling:**

- Any per-student error is logged to `errors_json` but does NOT fail the whole job. The goal is best-effort: produce as many reports as possible.
- Infrastructure errors (DB unavailable, storage failure) DO fail the whole job and leave it in `status = 'failed'` with the error on the batch job row.

**Idempotency:**

- If the job is retried by BullMQ, it re-runs from the start. The upsert logic means previously-generated students get overwritten with fresh copies — net effect is the same.
- Storage key cleanup on overwrite must be in the same interactive transaction as the upsert to prevent orphaned files if the upsert fails mid-flight.

### 4.5 Render function contract

Since impl 11 is on hold, you will NOT implement the actual React-PDF component in this implementation. Instead, define the contract:

**File:** `apps/worker/src/processors/report-card-render.contract.ts`

```ts
import type { ReportCardRenderPayload } from '@school/shared';

export interface ReportCardRenderer {
  render(payload: ReportCardRenderPayload): Promise<Buffer>;
}
```

**Placeholder implementation:**

**File:** `apps/worker/src/processors/report-card-render.placeholder.ts`

A minimal React-PDF component that produces a valid but obviously-placeholder PDF — a single page with the student name, "PLACEHOLDER REPORT CARD — VISUAL DESIGN PENDING", the list of subjects with score/grade, and the comments. This lets impl 04's processor work end-to-end for testing purposes. Impl 11 will replace this placeholder with the real template once the user provides a design.

Wire the processor to inject `ReportCardRenderer` via DI. For now, bind the `placeholder` implementation. When impl 11 lands, the binding swaps.

### 4.6 Controller endpoints

**File:** `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts` (existing — add routes)

**New routes:**

```
POST /v1/report-cards/generation-runs/dry-run  — comment gate preview       (report_cards.manage)
POST /v1/report-cards/generation-runs          — start a run                (report_cards.manage)
GET  /v1/report-cards/generation-runs/:id      — fetch status               (report_cards.manage)
GET  /v1/report-cards/generation-runs          — list recent runs (paged)   (report_cards.manage or view)
```

Delete the old `POST /v1/report-cards/generate-batch` route ONCE the frontend wizard no longer calls it — but keep it alive through this implementation so the existing frontend doesn't break. Its removal is scheduled for impl 12 (cleanup).

### 4.7 Module registration

Update `report-card.module.ts`:

- Ensure `ReportCardGenerationService`, `ReportCardTemplateService`, `ReportCardTenantSettingsService`, `ReportCardSubjectCommentsService`, `ReportCardOverallCommentsService` are all injected into the generation service constructor
- Expose the generation service if any other module needs it (impl 05 teacher requests will)
- Run DI verification

---

## 5. Files to create

- `apps/api/src/modules/gradebook/report-cards/report-card-generation-scope.ts` (helper for scope resolution) — or inline it if small
- `apps/worker/src/processors/report-card-render.contract.ts`
- `apps/worker/src/processors/report-card-render.placeholder.ts`
- `apps/api/test/report-cards/generation-runs.e2e-spec.ts`
- `apps/worker/test/report-card-generation.processor.spec.ts` (verify the test infrastructure — Jest on the worker)

## 6. Files to modify

- `apps/api/src/modules/gradebook/report-cards/report-card-generation.service.ts` — major refactor
- `apps/api/src/modules/gradebook/report-cards/report-card-generation.service.spec.ts` — extensive additions
- `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts` — new routes
- `apps/api/src/modules/gradebook/report-cards/report-cards.controller.spec.ts` — new routes tests
- `apps/worker/src/processors/report-card-generation.processor.ts` — refactor (verify path first)
- `apps/api/src/modules/gradebook/report-cards/report-card.module.ts` — DI wiring

---

## 7. Testing requirements

### 7.1 Unit tests

**`report-card-generation.service.spec.ts` additions:**

- `dryRunCommentGate` returns correct counts for mixed finalised/unfinalised/missing state
- `dryRunCommentGate` sets `would_block = true` when strict mode + anything missing
- `dryRunCommentGate` sets `would_block = false` when strict mode off
- `generateRun` throws `SCOPE_EMPTY` when scope resolves to zero students
- `generateRun` throws `COMMENT_GATE_BLOCKING` when would_block and no override
- `generateRun` succeeds when override is set even with missing comments
- `generateRun` creates a batch job row and enqueues a BullMQ job
- Each scope mode (year_group/class/individual) resolves correctly

### 7.2 Processor tests

**`report-card-generation.processor.spec.ts`:**

- Processor extends `TenantAwareJob`
- Rejects jobs without `tenant_id`
- For a 3-student scope, creates 3 `ReportCard` rows (English only when no second-language students)
- For a scope with 2 students where 1 has `preferred_second_language = 'ar'`: creates 3 `ReportCard` rows (2 en + 1 ar)
- Overwrite: a second run for the same scope replaces the previous PDFs and increments no new row count (upsert, not insert)
- Per-student error → `errors_json` populated, `students_blocked_count` incremented, job continues
- Job status transitions: `pending → running → completed` (or `partial_success` or `failed`)

### 7.3 Integration tests (e2e)

**`generation-runs.e2e-spec.ts`:**

- `POST /dry-run` returns the comment gate summary
- `POST /` with blocking comments and no override returns 403
- `POST /` with override succeeds, returns batch_job_id
- `GET /:id` returns the job status (might still be `pending` in tests — use the sync processor helper or mark as `completed` via test fixture)
- Permission: only `report_cards.manage` can call these routes
- RLS: Tenant A cannot read Tenant B's runs

### 7.4 Regression

```bash
turbo test && turbo lint && turbo type-check
```

---

## 8. Security / RLS checklist

- [ ] Scope resolution queries include `tenant_id` in every `where` clause
- [ ] BullMQ job payload includes `tenant_id`
- [ ] Processor sets RLS context via `TenantAwareJob` before any DB op
- [ ] Storage keys include `tenant_id` in the path for tenant isolation
- [ ] Old PDF deletion on overwrite happens in the same transaction as the upsert
- [ ] Permission `report_cards.manage` enforced on all generation endpoints
- [ ] Error messages don't leak cross-tenant info
- [ ] AI is NOT called during generation (AI only fires during the comment window via impl 02's draft service)

---

## 9. Acceptance criteria

1. The generation service refactor compiles and all existing tests still pass
2. New dry-run and generation-run endpoints work end-to-end
3. Processor successfully generates placeholder PDFs for a mixed-language test scope
4. Overwrite semantics verified: running twice for the same scope replaces PDFs and keeps row counts stable
5. Comment gate blocks correctly in strict mode; override bypasses correctly
6. DI verification passes
7. `turbo test`, `turbo lint`, `turbo type-check` green
8. The old `POST /v1/report-cards/generate-batch` endpoint is still functional (removal deferred to impl 12)
9. Implementation log entry added

---

## 10. Architecture doc update check

| File                     | Decision                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module-blast-radius.md` | **YES** — the generation service now imports settings, template, comments services. If crossing module boundaries (e.g., importing from gradebook module), update the entry.           |
| `event-job-catalog.md`   | **YES** — document the refactored `report-card:generate` job payload shape, queue, retry policy, and side effects (PDF upload, ReportCard upsert, old PDF deletion).                   |
| `state-machines.md`      | **YES** — document the `ReportCardBatchJob` status lifecycle: `pending → running → completed / partial_success / failed`.                                                              |
| `danger-zones.md`        | **Consider:** "Regeneration deletes old PDFs from storage. If a tenant cares about audit history, this is data loss. Revisit if the product ever requires immutable document history." |

---

## 11. Completion log stub

```markdown
### Implementation 04: Generation Backend

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Status:** ✅ complete
- **Summary:** Refactored generation service for new scope model, multi-language output, comment gating, and overwrite semantics. Refactored worker processor. Wired placeholder PDF renderer pending impl 11.

**What changed:**

- `report-card-generation.service.ts` — major refactor
- `report-cards.controller.ts` — 4 new routes
- `report-card-generation.processor.ts` — refactor
- New render contract + placeholder
- Module DI wiring

**Database changes:**

- None (uses impl 01 tables/columns)

**Test coverage:**

- Unit specs: generation service, processor
- Integration/E2E: generation-runs.e2e
- `turbo test`, `turbo lint`, `turbo type-check`: ✅

**Architecture docs updated:**

- `docs/architecture/event-job-catalog.md` — documented `report-card:generate` job
- `docs/architecture/state-machines.md` — added ReportCardBatchJob status machine
- `docs/architecture/module-blast-radius.md` — updated generation service deps

**Blockers or follow-ups:**

- Impl 11 (PDF template) is unblocked once user provides visual design
- Impl 09 (wizard UI) is unblocked
- Impl 12 (cleanup) can remove `POST /v1/report-cards/generate-batch` once impl 09's wizard is live

**Notes for the next agent:**

- The render contract is in `apps/worker/src/processors/report-card-render.contract.ts`. Impl 11 implements this interface; no other code change needed in the processor.
- The placeholder renderer produces a valid PDF — sufficient for E2E tests but obviously not production-grade visually.
```

---

## 12. If you get stuck

- **Gradebook aggregation unclear:** read `apps/api/src/modules/gradebook/gradebook-queries.service.ts` (or similar). Do NOT reimplement grade aggregation. Import the existing query.
- **Storage provider unclear:** search for existing file uploads (tenant logo, student photo). Copy the provider setup.
- **BullMQ job retry behaviour:** check `apps/worker/src/base/queue.constants.ts` for the default retry policy. Follow it.
- **Cross-module DI issue:** if you need `ReportCardSubjectCommentsService` and it's exported from the same module, you can inject directly. If it's in a different module, you must import the module, not the service class.
