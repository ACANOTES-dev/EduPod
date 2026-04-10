# Implementation 05 — Teacher Requests Backend

**Wave:** 2 (backend fan-out)
**Depends on:** 01 (schema); **soft-depends on** 02 (window service) and 04 (generation service) to wire the approval side-effects, but the request CRUD itself can land first
**Blocks:** 10 (frontend teacher requests)
**Can run in parallel with:** 02, 03, 06
**Complexity:** medium

---

## 1. Purpose

Build the teacher request subsystem: teachers submit requests to reopen a comment window or regenerate reports for a specific scope; principals (users with `report_cards.manage`) review and approve/reject. Approval routes the principal into the corresponding action (opening a window or starting a generation run) pre-filled with the requested parameters.

**Authoritative design:** `report-card-spec/design-spec.md` Section 10.

---

## 2. Scope

### In scope

1. `ReportCardTeacherRequestsService` + controller — CRUD + approve/reject
2. State machine enforcement (pending → approved/rejected/cancelled → completed)
3. Approval handlers that (optionally) trigger the window-open or generation run — these handlers INVOKE the window/generation services but do not own their logic
4. Notification hooks — notify the principal on new request, notify the teacher on review decision (use existing notification infra)
5. Unit + integration + RLS tests

### Out of scope

- Frontend pages (impl 10)
- Window service internals (impl 02)
- Generation service internals (impl 04)

---

## 3. Prerequisites

1. Impl 01 merged — `report_card_teacher_requests` table exists
2. Soft: impl 02 merged, so `ReportCommentWindowsService.open` can be invoked on approval
3. Soft: impl 04 merged, so `ReportCardGenerationService.generateRun` can be invoked on approval

If impls 02 and 04 haven't landed yet, you can build the request CRUD first and add the approval side-effects behind a feature flag or a TODO that the next agent wires up.

---

## 4. Task breakdown

### 4.1 `ReportCardTeacherRequestsService`

**File:** `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.service.ts`

**Methods:**

```ts
class ReportCardTeacherRequestsService {
  // Read
  list(tenantId: string, { status?, requestedByUserId?, page, pageSize }): Promise<Paginated<ReportCardTeacherRequest>>
  findById(tenantId: string, id: string): Promise<ReportCardTeacherRequest>
  listPendingForReviewer(tenantId: string): Promise<ReportCardTeacherRequest[]>

  // Write — teacher
  submit(tenantId: string, actor: User, dto: SubmitTeacherRequestDto): Promise<ReportCardTeacherRequest>
  cancel(tenantId: string, actor: User, id: string): Promise<ReportCardTeacherRequest>  // only own pending requests

  // Write — admin
  approve(tenantId: string, actor: User, id: string, { review_note?, auto_execute? }): Promise<{
    request: ReportCardTeacherRequest;
    resulting_window?: ReportCommentWindow;
    resulting_run_id?: string;
  }>
  reject(tenantId: string, actor: User, id: string, { review_note }): Promise<ReportCardTeacherRequest>
  markCompleted(tenantId: string, actor: User, id: string): Promise<ReportCardTeacherRequest>
}
```

**Key behaviours:**

- `submit` — validates the DTO per its Zod schema. For `regenerate_reports`, `target_scope_json` must be present. For `open_comment_window`, it must be null.
- `cancel` — teacher can only cancel their OWN requests that are still `pending`.
- `approve` — transitions the request to `approved`. If `auto_execute = true`:
  - For `open_comment_window`: calls `ReportCommentWindowsService.open` with default dates (admin can adjust in the UI flow if preferred). Links the result via `resulting_window_id`.
  - For `regenerate_reports`: calls `ReportCardGenerationService.generateRun` with the requested scope + period. Links via `resulting_run_id`.
- If `auto_execute = false`, approval just marks the request approved and returns the pre-filled parameters — the frontend then routes the principal into the wizard/modal with those parameters. This is the preferred UX flow (human-in-the-loop), but the `auto_execute` option exists for simpler cases.
- `reject` — transitions to `rejected` with the review note. Sends a notification to the teacher.
- `markCompleted` — called by downstream flows (e.g., when the window closes, when the generation run completes) to mark the request as fully done. This is a housekeeping method.

**State machine:**

```ts
const VALID_TRANSITIONS: Record<TeacherRequestStatus, TeacherRequestStatus[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['completed'],
  rejected: [],
  completed: [],
  cancelled: [],
};
```

Every transition validates against the map before updating.

**Notifications:**

- On `submit`: enqueue a notification job to all users with `report_cards.manage` in the tenant (or to a designated "request reviewer" group if such exists).
- On `approve` / `reject`: enqueue a notification to the original `requested_by_user_id`.
- Use the existing notification service — search for `NotificationsService` or similar in the codebase.

### 4.2 `ReportCardTeacherRequestsController`

**File:** `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.controller.ts`

**Routes:**

```
GET    /v1/report-card-teacher-requests                  — list (paginated, filters: status, my=true)   (report_cards.comment)
GET    /v1/report-card-teacher-requests/pending          — list pending for review                      (report_cards.manage)
GET    /v1/report-card-teacher-requests/:id              — single                                       (report_cards.comment or manage)
POST   /v1/report-card-teacher-requests                  — submit                                       (report_cards.comment)
PATCH  /v1/report-card-teacher-requests/:id/cancel       — cancel own pending                           (report_cards.comment)
PATCH  /v1/report-card-teacher-requests/:id/approve      — approve                                      (report_cards.manage)
PATCH  /v1/report-card-teacher-requests/:id/reject       — reject                                       (report_cards.manage)
PATCH  /v1/report-card-teacher-requests/:id/complete     — mark completed (internal/admin)              (report_cards.manage)
```

- `GET /` supports `?my=true` to scope to the caller's own requests (for the teacher "my requests" view).
- Read endpoints are visible to teachers only for their own requests; admins see all.

### 4.3 Module registration

Update `report-card.module.ts`:

- Register the new service and controller
- Inject `ReportCommentWindowsService` (from impl 02) and `ReportCardGenerationService` (from impl 04) into the request service
- Run DI verification

If impls 02/04 haven't landed: stub the injection points with empty interfaces and TODO comments. Mark the implementation ⚠️ partial in the log entry and explain what's wired when the dependencies land.

---

## 5. Files to create

- `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.service.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.service.spec.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.controller.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.controller.spec.ts`
- `apps/api/test/report-cards/teacher-requests.e2e-spec.ts`

## 6. Files to modify

- `apps/api/src/modules/gradebook/report-cards/report-card.module.ts` — register new service/controller

---

## 7. Testing requirements

### 7.1 Unit tests

- `submit` validates DTO per request_type (scope present/null as required)
- `cancel` only works on own pending requests
- `approve` transitions state and optionally triggers the downstream action
- `reject` transitions state and sets review note
- State machine: every invalid transition throws
- Notification service is called with the correct payloads (mock the notif service)

### 7.2 Controller tests

- Routes registered, permission guards correct
- `?my=true` filter applied

### 7.3 Integration tests

**`teacher-requests.e2e-spec.ts`:**

- Teacher submits a request → shows up in admin's pending list
- Teacher can cancel their own pending request
- Teacher cannot cancel another teacher's request (403)
- Admin approves → request status becomes `approved`
- Admin approves with `auto_execute = true` → resulting_window_id or resulting_run_id is set
- Admin rejects → status `rejected`, review_note persisted
- Permission: teacher without `report_cards.comment` cannot submit (403)
- Permission: teacher cannot approve (403)
- RLS: Tenant A cannot see Tenant B's requests

### 7.4 Regression

```bash
turbo test && turbo lint && turbo type-check
```

---

## 8. Security / RLS checklist

- [ ] All reads/writes RLS-scoped
- [ ] Cancel only allowed on own pending requests — verified server-side, not just UI
- [ ] Approve/reject only allowed for `report_cards.manage`
- [ ] Auto-execute path cannot elevate the actor's privileges — the downstream service call still goes through normal permission checks
- [ ] Notification payloads do not leak cross-tenant identifiers
- [ ] RLS leakage test passes for the requests table

---

## 9. Acceptance criteria

1. Service compiles, unit tests pass
2. Controller exposes all documented routes
3. Teacher can submit and cancel; admin can approve/reject
4. Auto-execute correctly calls the downstream services (if impls 02/04 are available)
5. Notifications fire on submit and review
6. State machine enforced
7. RLS tests pass
8. DI verification passes
9. `turbo test`, `turbo lint`, `turbo type-check` green
10. Log entry added

---

## 10. Architecture doc update check

| File                     | Decision                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `module-blast-radius.md` | **YES** — the teacher requests service imports window and generation services. Update the entry.                                                                                     |
| `event-job-catalog.md`   | Only if new notification jobs are added. If reusing existing notif infra, no update.                                                                                                 |
| `state-machines.md`      | **YES** — document the TeacherRequestStatus lifecycle if not already covered in impl 01                                                                                              |
| `danger-zones.md`        | **Consider:** "Approving a teacher request with auto_execute bypasses the normal wizard review step. Ensure the approver understands they are committing to generation immediately." |

---

## 11. Completion log stub

```markdown
### Implementation 05: Teacher Requests Backend

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Status:** ✅ complete (or ⚠️ partial if impls 02/04 not yet merged and auto-execute is stubbed)
- **Summary:** Built teacher request submission, cancellation, and principal approval flow with optional auto-execute to downstream window/generation services.

**What changed:**

- New `ReportCardTeacherRequestsService` + controller
- Module registration updated with cross-service DI
- E2E tests

**Database changes:**

- None (uses impl 01 table)

**Test coverage:**

- Unit + controller specs
- E2E tests including RLS leakage
- `turbo test`, `turbo lint`, `turbo type-check`: ✅

**Architecture docs updated:**

- `module-blast-radius.md` — updated if cross-module deps changed
- `state-machines.md` — verified TeacherRequestStatus entry

**Blockers or follow-ups:**

- Frontend impl 10 is unblocked

**Notes:**

- If impl 02/04 were not yet merged when this implementation was built, the auto-execute paths were stubbed. Re-enable them when both are merged.
```

---

## 12. If you get stuck

- **Notification service unclear:** search for `NotificationsService` or `notifications.service.ts`. Follow its existing enqueue pattern.
- **Permission to list "my requests":** rely on `@CurrentUser()` decorator to get the user id, then filter.
- **Cross-service injection causes DI cycle:** if the window/generation services import something that transitively imports the request service, you'll see a cycle. Use `forwardRef()` or restructure imports to break the cycle.
