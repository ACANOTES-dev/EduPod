# Implementation 02 — Comment System Backend

**Wave:** 2 (backend fan-out)
**Depends on:** 01 (database foundation)
**Blocks:** 08 (frontend report comments)
**Can run in parallel with:** 03, 05, 06
**Complexity:** high (multiple services, window enforcement, AI integration)

---

## 1. Purpose

Build the backend for the entire comment subsystem: comment windows, subject comments, overall comments, and single-student AI drafting. This is what powers the Report Comments pages in the frontend. The key constraint is **strict server-side enforcement of the open-window rule** — all write and AI endpoints must reject requests when no window is open for the target period.

**Authoritative design:** `report-card-spec/design-spec.md` Sections 8, 9.

---

## 2. Scope

### In scope

1. `ReportCommentWindowsService` + controller — CRUD + open/close/extend/reopen
2. `ReportCardSubjectCommentsService` + controller — CRUD + finalise/unfinalise
3. `ReportCardOverallCommentsService` + controller — CRUD + finalise/unfinalise
4. `ReportCardAiDraftService` — single-student AI draft (refactored from the existing `ai-generate-comments` bulk endpoint)
5. A `CommentWindowGuard` (NestJS guard or service-level check) that enforces the open-window rule
6. Zod request/response DTOs (thin re-exports from `@school/shared`)
7. Unit + integration tests with RLS leakage coverage

### Out of scope

- Frontend pages (see implementation 08)
- Generation service changes (see implementation 04) — generation only _reads_ from these tables; it doesn't write
- Teacher request flow (see implementation 05) — requests triggering window opens are handled in impl 05
- Template service changes (see implementation 03)

---

## 3. Prerequisites

1. Implementation 01 merged and migrations applied locally
2. `packages/shared/src/report-cards/*` schemas available
3. `turbo test` green on main
4. Familiarity with the existing `report-card-generation.service.ts` (read it — you'll refactor its AI call pathway)

---

## 4. Task breakdown

### 4.1 `ReportCommentWindowsService`

**File:** `apps/api/src/modules/gradebook/report-cards/report-comment-windows.service.ts`

**Methods:**

```ts
class ReportCommentWindowsService {
  // Read
  findActive(tenantId: string): Promise<ReportCommentWindow | null>
  findById(tenantId: string, id: string): Promise<ReportCommentWindow>
  findByPeriod(tenantId: string, periodId: string): Promise<ReportCommentWindow[]>
  list(tenantId: string, { page, pageSize, status? }): Promise<Paginated<ReportCommentWindow>>

  // Write (all require report_cards.manage at the controller level)
  open(tenantId: string, actor: User, dto: OpenCommentWindowDto): Promise<ReportCommentWindow>
  closeNow(tenantId: string, actor: User, id: string): Promise<ReportCommentWindow>
  extend(tenantId: string, actor: User, id: string, newClosesAt: Date): Promise<ReportCommentWindow>
  reopen(tenantId: string, actor: User, id: string): Promise<ReportCommentWindow>

  // Internal — used by other services to enforce the window rule
  assertWindowOpenForPeriod(tenantId: string, academicPeriodId: string): Promise<void>  // throws if not
}
```

**Key behaviours:**

- `open` — validates no other window is already open for the tenant (the unique partial index will enforce this at DB level, but check first for a friendly error). Sets `status = 'open'` if `opens_at <= now()`, otherwise `'scheduled'`. Returns the row.
- `closeNow` — updates `status = 'closed'`, `closed_at = now()`, `closed_by_user_id = actor.id`. Rejects if already closed.
- `extend` — updates `closes_at`. Only allowed when status is `open` or `scheduled`. Rejects if `newClosesAt <= opens_at`.
- `reopen` — only allowed on a closed window. Transitions back to `open` and clears `closed_at` / `closed_by_user_id`.
- `assertWindowOpenForPeriod` — throws `ForbiddenException({ code: 'COMMENT_WINDOW_CLOSED', message: '…' })` if no open window exists for the given period.

**RLS:** all writes must go through `createRlsClient(this.prisma, { tenant_id }).$transaction(...)`.

**State machine:** enforce `VALID_TRANSITIONS: Record<CommentWindowStatus, CommentWindowStatus[]>`:

```ts
const VALID_TRANSITIONS: Record<CommentWindowStatus, CommentWindowStatus[]> = {
  scheduled: ['open', 'closed'],
  open: ['closed'],
  closed: ['open'],
};
```

### 4.2 `ReportCommentWindowsController`

**File:** `apps/api/src/modules/gradebook/report-cards/report-comment-windows.controller.ts`

**Routes:**

```
GET    /v1/report-comment-windows               — list (paginated)
GET    /v1/report-comment-windows/active        — current open window (or null)
GET    /v1/report-comment-windows/:id           — single
POST   /v1/report-comment-windows               — open a new window        (report_cards.manage)
PATCH  /v1/report-comment-windows/:id/close     — close now                (report_cards.manage)
PATCH  /v1/report-comment-windows/:id/extend    — extend closes_at          (report_cards.manage)
PATCH  /v1/report-comment-windows/:id/reopen    — reopen a closed window   (report_cards.manage)
```

Follow the thin-controller rule: validate via `ZodValidationPipe`, delegate to service, return service result.

### 4.3 `ReportCardSubjectCommentsService`

**File:** `apps/api/src/modules/gradebook/report-cards/report-card-subject-comments.service.ts`

**Methods:**

```ts
class ReportCardSubjectCommentsService {
  // Read
  listByAssignment(tenantId: string, { classId, subjectId, academicPeriodId, authorUserId? }): Promise<Paginated<ReportCardSubjectComment>>
  findOne(tenantId: string, { studentId, subjectId, academicPeriodId }): Promise<ReportCardSubjectComment | null>
  countByClassSubjectPeriod(tenantId: string, { classId, subjectId, academicPeriodId }): Promise<{ total: number; finalised: number }>

  // Write — all require an open window for the target period
  upsert(tenantId: string, actor: User, dto: UpsertSubjectCommentDto): Promise<ReportCardSubjectComment>
  finalise(tenantId: string, actor: User, id: string): Promise<ReportCardSubjectComment>
  unfinalise(tenantId: string, actor: User, id: string): Promise<ReportCardSubjectComment>
  bulkFinalise(tenantId: string, actor: User, { classId, subjectId, academicPeriodId }): Promise<number>  // returns count finalised
}
```

**Key behaviours:**

- `upsert` — uses the unique constraint `(tenant_id, student_id, subject_id, academic_period_id)`. If a row exists, update `comment_text`, clear `is_ai_draft` (since the user is writing), clear `finalised_at` (edit invalidates finalisation). If no row exists, insert.
- `finalise` — sets `finalised_at = now()`, `finalised_by_user_id = actor.id`. Rejects if `comment_text` is empty.
- `unfinalise` — clears `finalised_at` and `finalised_by_user_id`. Only the original finaliser or an admin can unfinalise.
- **Authorship check:** on `upsert`, verify the actor teaches the (class, subject) pair unless they have `report_cards.manage` (admin override). Use the existing class teacher assignment query.
- **Window check:** every write method calls `commentWindowsService.assertWindowOpenForPeriod(tenantId, academicPeriodId)` FIRST.

### 4.4 `ReportCardSubjectCommentsController`

**File:** `apps/api/src/modules/gradebook/report-cards/report-card-subject-comments.controller.ts`

**Routes:**

```
GET   /v1/report-card-subject-comments              — list (filters: class_id, subject_id, academic_period_id, author_user_id, finalised)
GET   /v1/report-card-subject-comments/:id          — single
POST  /v1/report-card-subject-comments              — upsert                           (report_cards.comment)
PATCH /v1/report-card-subject-comments/:id/finalise — finalise                         (report_cards.comment)
PATCH /v1/report-card-subject-comments/:id/unfinalise — unfinalise                     (report_cards.comment)
POST  /v1/report-card-subject-comments/bulk-finalise — bulk finalise a class/subject   (report_cards.comment)
```

### 4.5 `ReportCardOverallCommentsService`

**File:** `apps/api/src/modules/gradebook/report-cards/report-card-overall-comments.service.ts`

Nearly identical shape to the subject comment service, minus the subject dimension. Methods:

```ts
class ReportCardOverallCommentsService {
  listByClass(
    tenantId: string,
    { classId, academicPeriodId },
  ): Promise<Paginated<ReportCardOverallComment>>;
  findOne(
    tenantId: string,
    { studentId, academicPeriodId },
  ): Promise<ReportCardOverallComment | null>;

  upsert(
    tenantId: string,
    actor: User,
    dto: UpsertOverallCommentDto,
  ): Promise<ReportCardOverallComment>;
  finalise(tenantId: string, actor: User, id: string): Promise<ReportCardOverallComment>;
  unfinalise(tenantId: string, actor: User, id: string): Promise<ReportCardOverallComment>;
}
```

**Authorship check:** on `upsert`, verify the actor is the homeroom teacher for the class OR has `report_cards.manage`. Homeroom status comes from the existing class → homeroom_teacher_user_id relation.

**Window check:** same as subject comments.

### 4.6 `ReportCardOverallCommentsController`

**File:** `apps/api/src/modules/gradebook/report-cards/report-card-overall-comments.controller.ts`

Mirror of the subject comments controller, routes under `/v1/report-card-overall-comments`.

### 4.7 `ReportCardAiDraftService`

**File:** `apps/api/src/modules/gradebook/report-cards/report-card-ai-draft.service.ts`

Refactor of the existing AI comment generation pathway. The existing `ai-generate-comments` bulk endpoint (used by the old overview page) should be **preserved** but deprecated for internal use, and a new single-student draft pathway added alongside.

**Methods:**

```ts
class ReportCardAiDraftService {
  draftSubjectComment(
    tenantId: string,
    actor: User,
    { studentId: string, subjectId: string, classId: string, academicPeriodId: string },
  ): Promise<{ comment_text: string; model: string; tokens_used: number }>;
}
```

**Behaviour:**

1. Assert an open window exists for `academicPeriodId` — throws `COMMENT_WINDOW_CLOSED` if not
2. Verify actor is either the subject teacher for the class or has `report_cards.manage`
3. Load the student's assessments and per-assessment comments for `(subjectId, academicPeriodId)` — reuse existing gradebook queries
4. Load the student's grade trajectory for that subject/period
5. Build a prompt that synthesises: trajectory + per-assessment comments + grade → a 2–3 sentence parent-friendly subject narrative
6. Call the AI provider (use the existing provider integration — verify which one, likely Anthropic or OpenAI wired via env vars)
7. Return the generated text. The caller (frontend or service) is responsible for persisting it via `upsert` on the subject comment.

**Logging:** every call logs: actor, student, subject, period, model, tokens used. This is the cost-audit trail.

**Rate limiting:** the window enforcement is the primary rate limit. Optionally, add a per-actor per-minute cap (e.g., 30 calls/minute) using the existing rate-limit infrastructure if present.

### 4.8 Module registration

Update `apps/api/src/modules/gradebook/report-cards/report-card.module.ts`:

- Add the four new services to `providers`
- Add the three new controllers to `controllers`
- Export `ReportCommentWindowsService` — other modules (impl 04 generation, impl 05 requests) need to call `assertWindowOpenForPeriod`

Run the DI verification script from `00-common-knowledge.md` §3.7 to confirm the module compiles.

---

## 5. Files to create

- `apps/api/src/modules/gradebook/report-cards/report-comment-windows.service.ts`
- `apps/api/src/modules/gradebook/report-cards/report-comment-windows.service.spec.ts`
- `apps/api/src/modules/gradebook/report-cards/report-comment-windows.controller.ts`
- `apps/api/src/modules/gradebook/report-cards/report-comment-windows.controller.spec.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-subject-comments.service.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-subject-comments.service.spec.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-subject-comments.controller.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-subject-comments.controller.spec.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-overall-comments.service.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-overall-comments.service.spec.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-overall-comments.controller.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-overall-comments.controller.spec.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-ai-draft.service.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-ai-draft.service.spec.ts`
- `apps/api/src/modules/gradebook/report-cards/dto/` — thin re-exports from `@school/shared`
- `apps/api/test/report-cards/comment-windows.e2e-spec.ts`
- `apps/api/test/report-cards/subject-comments.e2e-spec.ts`
- `apps/api/test/report-cards/overall-comments.e2e-spec.ts`
- `apps/api/test/report-cards/ai-draft.e2e-spec.ts`

## 6. Files to modify

- `apps/api/src/modules/gradebook/report-cards/report-card.module.ts` — add new services, controllers, exports

## 7. Files NOT to touch

- Any frontend files (impl 08)
- `report-card-generation.service.ts` (impl 04)
- Any file under `apps/api/src/modules/` other than `gradebook/report-cards/`

---

## 8. Testing requirements

### 8.1 Unit tests (service specs)

Each service spec must cover:

- Happy path for every method
- RLS transaction is used for mutations (verify with mock)
- Not-found → `NotFoundException`
- Forbidden authorship → `ForbiddenException` with `INVALID_AUTHOR` code
- Window closed → `ForbiddenException` with `COMMENT_WINDOW_CLOSED` code on every write method
- State machine: invalid transitions throw (for window service: e.g., trying to close an already-closed window)

### 8.2 Controller tests

Each controller spec must cover:

- Routes registered correctly
- Validation pipe rejects malformed bodies
- Permission guard rejects lacking permission
- Auth guard rejects unauthenticated

### 8.3 Integration tests (e2e)

Four e2e test files (`apps/api/test/report-cards/`):

**`comment-windows.e2e-spec.ts`:**

- Open a window, list it, close it, reopen it, extend it
- Unique partial index prevents two open windows for same tenant
- RLS: Tenant A can't see Tenant B's windows

**`subject-comments.e2e-spec.ts`:**

- Without an open window, upsert returns 403 with `COMMENT_WINDOW_CLOSED`
- With an open window, a subject teacher can upsert, finalise, unfinalise
- A teacher who doesn't teach the class gets 403 with `INVALID_AUTHOR`
- An admin can upsert on any teacher's behalf
- The unique constraint enforces one comment per (student, subject, period)
- RLS: Tenant A can't see Tenant B's comments

**`overall-comments.e2e-spec.ts`:**

- Only the homeroom teacher (or admin) can upsert
- Without an open window, upsert returns 403 with `COMMENT_WINDOW_CLOSED`
- RLS leakage test

**`ai-draft.e2e-spec.ts`:**

- Without an open window, returns 403 with `COMMENT_WINDOW_CLOSED`
- With an open window, returns a non-empty string for a student with assessments
- Teacher without permission on the class returns 403
- RLS: Tenant A can't draft for Tenant B's students

### 8.4 Regression

```bash
turbo test
turbo lint
turbo type-check
```

All green. Log in the completion entry.

---

## 9. Security / RLS checklist

- [ ] All services use `createRlsClient(prisma, { tenant_id }).$transaction(...)` for writes
- [ ] All reads include `tenant_id` in the `where` clause (even though RLS is the backstop)
- [ ] Every endpoint has `@RequiresPermission` with the correct permission
- [ ] `assertWindowOpenForPeriod` is called before EVERY comment write and EVERY AI call
- [ ] Authorship verification happens BEFORE window check (to avoid leaking "a window is open" to unauthorised users — unauth should get 403 INVALID_AUTHOR, not 403 COMMENT_WINDOW_CLOSED)
- [ ] AI provider API keys are read from env vars via `ConfigService`, never hardcoded
- [ ] AI call logs do NOT include full prompt/response text (that's excessive logging; log metadata only)
- [ ] RLS leakage tests pass for all three new tables used here

---

## 10. Acceptance criteria

1. All four services compile and pass their unit tests
2. All three controllers expose the documented routes and pass their specs
3. Integration tests pass, including:
   - Window enforcement rejects closed-window writes
   - Authorship checks reject wrong-teacher writes
   - RLS leakage tests for all three tables
4. `ReportCommentWindowsService` is exported from the report-card module
5. The DI verification script succeeds
6. `turbo test`, `turbo lint`, `turbo type-check` all green
7. The existing `ai-generate-comments` bulk endpoint still works (preserved for backwards compat)
8. Implementation log entry added

---

## 11. Architecture doc update check

| File                                       | Update condition                                                         | Decision                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/architecture/module-blast-radius.md` | New cross-module import?                                                 | **CHECK** — if `ReportCommentWindowsService` is exported and imported by another module in later impls, the blast-radius entry should reflect it. For now, impl 02 only adds intra-module deps, so **no update needed**. |
| `docs/architecture/event-job-catalog.md`   | New job or cron?                                                         | NO (AI is synchronous)                                                                                                                                                                                                   |
| `docs/architecture/state-machines.md`      | Already updated in impl 01. Verify CommentWindowStatus entry is present. | **VERIFY**                                                                                                                                                                                                               |
| `docs/architecture/danger-zones.md`        | Did you find hidden coupling?                                            | Document if yes. **Potential entry:** "The window enforcement is the sole cost-control mechanism for AI calls; weakening it directly impacts tenant AI bills." Consider adding.                                          |

---

## 12. Completion log stub

```markdown
### Implementation 02: Comment System Backend

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Pull request:** <url or "direct to main">
- **Status:** ✅ complete
- **Summary:** Built comment windows, subject comments, overall comments, and single-student AI draft services with strict server-side window enforcement.

**What changed:**

- 4 new services + 3 new controllers under `apps/api/src/modules/gradebook/report-cards/`
- `report-card.module.ts` updated with new providers/controllers/exports
- 4 new e2e test files under `apps/api/test/report-cards/`

**Database changes:**

- None (uses tables from impl 01)

**Test coverage:**

- Unit specs added: 4 service specs + 3 controller specs
- Integration/E2E specs added: 4
- RLS leakage tests: 3 tables, all passing
- `turbo test`: ✅
- `turbo lint`: ✅
- `turbo type-check`: ✅

**Architecture docs updated:**

- None required (state machines already added in impl 01)

**Regression check:**

- `turbo test`: ✅
- Unrelated failures: none

**Blockers or follow-ups:**

- Implementation 08 (frontend report comments) is now unblocked
- Implementation 04 (generation) can import `ReportCommentWindowsService` to reuse `assertWindowOpenForPeriod` if needed (though generation itself shouldn't be window-gated — only the teacher flow is)

**Notes for the next agent:**

- `ReportCommentWindowsService.assertWindowOpenForPeriod` is the reusable cost-control primitive. Call it from any new endpoint that consumes AI.
- Authorship checks run BEFORE window checks to avoid leaking window state to unauthorised users.
```

---

## 13. If you get stuck

- **Unique partial index conflicts on `open` status:** if a previous test run left an orphaned "open" window for the same tenant, delete it with RLS-scoped test cleanup. Every test should create its own isolated fixture.
- **AI provider integration unclear:** find the existing `ai-generate-comments` implementation (search for that string). Copy its provider setup and prompt-assembly pattern, then refactor.
- **Homeroom teacher lookup:** search for how the existing codebase identifies a homeroom teacher for a class. It's typically on the `classes` table as `homeroom_teacher_user_id` or via a separate `class_teachers` junction.
