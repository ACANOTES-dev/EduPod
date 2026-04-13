# Stage 8 — Downstream rewire

**Before you start:** open `../IMPLEMENTATION_LOG.md`. Confirm Stages 1–7 are `complete`. Stage 8 is the final stage: it moves three downstream features from reading `teacher_competencies` (their current, year-group-ish source) to reading the live `schedules` table (the authoritative, class-level source after a timetable has been applied).

After Stage 8, **no part of the application outside the competencies CRUD and the solver input assembly reads from `teacher_competencies` directly**. Everything else asks "what does the live timetable say?"

## Purpose

Three services today reconstruct "who teaches what to whom" by cross-joining `teacher_competencies` with the curriculum matrix and active classes. That was necessary when competencies were year-group-grained and no class-level source of truth existed. After Stage 6, the live `schedules` table _is_ that source of truth. Switch the reads, handle the "no timetable yet" empty state honestly, and let every downstream feature self-update when a schedule is regenerated.

## Prerequisites

- Stages 1–7 complete.
- NHQS has an applied timetable — Stage 6 produced one. You can re-run Stage 6 before starting Stage 8 if the apply has been discarded since.

## Scope

### Consumer 1 — Teaching allocations

`apps/api/src/modules/gradebook/teaching-allocations.service.ts`

- Today: fetches all teacher_competencies for the academic year, filters by staff, cross-joins with class_subject_grade_configs and active classes to derive `(class, subject, teacher)` tuples. Returns an `is_primary: boolean` for display.
- New: query the `schedules` table directly, filtered by `tenant_id, academic_year_id, teacher_staff_id` (if scoping to a teacher) or `tenant_id, academic_year_id` (if admin view). Group by `(class_id, subject_id, teacher_staff_id)` to dedupe across multiple period slots for the same assignment.
- Drop the `is_primary` field from the response — there is no concept of primary anymore. Callers already only display it; removing it is safe once the frontend updates (include the frontend change in this stage).
- Empty state: if the teacher has no `schedules` rows for this year, return an empty array with a `status` hint: `{ data: [], meta: { reason: 'no_timetable_applied' } }`. UI renders that as "No timetable has been applied yet — assignments will appear here after generation."

### Consumer 2 — Report comment scoping

`apps/api/src/modules/gradebook/report-cards/report-comment-windows.service.ts`

- Today: `getLandingScopeForActor` fetches competencies, intersects with curriculum matrix, returns authorised `(class, subject)` pairs.
- New: query `schedules` for the actor teacher. The authorised set is literally `SELECT DISTINCT class_id, subject_id FROM schedules WHERE teacher_staff_id = :me AND tenant_id = :tenant AND academic_year_id = :ay`.
- Empty state: authorised set is empty → the report-comments landing page shows "No classes assigned yet." Same copy as above.

### Consumer 3 — Report cards library authorisation

`apps/api/src/modules/gradebook/report-cards/report-cards-queries.service.ts` → `resolveAuthorisedStudents`

- Today: competencies → curriculum → active classes → students.
- New: `schedules` → class_ids for the teacher → students enrolled in those classes.
- Empty state: teacher cannot see any students until a timetable is applied. Ensure callers handle a 403 / empty list gracefully.

### Shared helper

Rather than duplicate the "SELECT DISTINCT (class_id, subject_id) FROM schedules WHERE teacher = X" query across three services, extract to `apps/api/src/modules/schedules/schedules-read.facade.ts` or similar. Methods:

- `getTeacherAssignmentsForYear(tenantId, academicYearId, staffProfileId): Promise<Array<{ class_id, subject_id }>>`
- `getAllAssignmentsForYear(tenantId, academicYearId): Promise<Array<{ class_id, subject_id, teacher_staff_id }>>`
- `hasAppliedSchedule(tenantId, academicYearId): Promise<boolean>` — for empty-state checks.

### Frontend

Drop any `is_primary` display across the gradebook/assessment UI. Add empty-state UX for:

- `/en/gradebook/teaching-allocations` (or wherever that dashboard lives) — "No timetable applied yet" with a CTA link to `/scheduling/auto`.
- `/en/report-comments` — same empty-state pattern.
- Report cards library pages — no change needed if the authorisation returns an empty set gracefully, but verify via Playwright.

### i18n

Two new keys:

- `gradebook.noTimetableApplied` = "No timetable has been applied yet. Assignments will appear here after a schedule is generated and applied."
- `gradebook.goToScheduler` = "Go to scheduling →"

Mirror in ar.

## Non-goals

- Do **not** delete the `teacher_competencies` table or its CRUD routes. Those remain the source of truth for _who can teach what_ (before a timetable exists) and are read by the solver input assembly.
- Do **not** re-introduce the cover-teacher service. Substitutions flow from Stage 7.
- Do **not** touch substitute_teacher_competencies — it's only for the substitution board.

## Step-by-step

1. Read each of the three target files carefully. Identify every call site that consumes their results — you'll need to adapt return types and call-site expectations.
2. Build the shared helper `schedules-read.facade.ts`. Unit-test it first.
3. Rewire each consumer one at a time:
   - Rewire `teaching-allocations.service.ts`. Run its unit tests — update as needed. Commit locally.
   - Rewire `report-comment-windows.service.ts`. Run tests. Commit locally.
   - Rewire `report-cards-queries.service.ts`. Run tests. Commit locally.
4. Update the frontend pages for empty-state UX. i18n updates.
5. Run `turbo type-check` and `turbo lint` clean.
6. DI smoke test.
7. Deploy: rsync changed API and web source. Rebuild. Restart api and web.
8. **Playwright verification** (mandatory — two flows, see below).
9. Append completion entry to the log. Mark Stage 8 `complete` on the status board. The rebuild is done.

## Testing requirements

### Unit

For each of the three services, update existing `.spec.ts` files. Minimum tests:

- With an applied schedule: returns expected (class, subject) pairs.
- With no applied schedule: returns empty result with the `reason: 'no_timetable_applied'` hint (if the response shape supports it).
- RLS leakage: tenant A cannot see tenant B's allocations / scoping / authorised students.

For the new shared helper:

- `getTeacherAssignmentsForYear` with mixed assignments: correct dedupe.
- `hasAppliedSchedule` returns true/false correctly.

### Integration

Run the full gradebook + report-cards e2e suite: `pnpm --filter @school/api test:e2e -- --testPathPattern='gradebook|report-cards'`. Must be green.

### Browser — Playwright (mandatory)

Two flows against `nhqs.edupod.app`, in **this order**:

**Flow A — with the applied schedule from Stage 6 still live:**

1. Log in as `Sarah.daly@nhqs.test`. Navigate to her gradebook dashboard or teaching-allocations view. Confirm she sees the classes she's scheduled to teach (from the Stage 6 timetable) and only those.
2. Navigate to the report-comments page. Confirm she sees the same classes as commentable subjects.
3. Log in as `owner@nhqs.test`. Confirm the admin view shows every teacher's allocations.
4. Open a student's report card as owner; confirm it loads.

**Flow B — discard the timetable and test the empty state:**

1. As `owner`, navigate to `/en/scheduling/runs` → find the latest applied run → click **Discard** (or if no discard action exists in the UI, hit the `POST /v1/scheduling-runs/:id/discard` endpoint directly).
2. As `Sarah.daly`, reload the teaching-allocations page. Confirm the empty-state message renders with the CTA link.
3. Reload the report-comments page. Same empty state.
4. Optionally re-apply a run to restore normal state for future sessions.

Capture snapshots for both flows in the log entry.

### Coverage

Ratchet up as improvements land; never down.

## Acceptance criteria

- [x] All three target services read from `schedules` (via the shared helper).
- [x] `is_primary` references removed from the three service response shapes and any frontend that displayed them.
- [x] Empty-state copy rendered correctly when no timetable is applied.
- [x] Unit + integration tests green.
- [x] Playwright Flow A and Flow B both pass.
- [x] type-check / lint / DI clean.
- [x] Local commit(s); nothing pushed.
- [x] Completion entry appended; status board flipped to `complete` for Stage 8.

## After this stage

- The rebuild is done.
- The `IMPLEMENTATION_LOG.md` status board shows all 8 stages `complete`.
- Leave the scheduler/ folder intact in the repo for historical reference and for future scheduler iterations.
- Any follow-up work (e.g. class_scheduling_requirements, room type constraints, teacher preferences, etc.) should be planned as new stages _appended_ to this package — don't start a new package unless the scope is unrelated to scheduling.

## If something goes wrong

- **Report-comments page crashes** after rewiring — usually a missing `?.` on a now-nullable field from the new helper. Walk the render tree for optional chains.
- **Playwright Flow B shows allocations despite discarded run** — you may have multiple applied runs. Only the latest `applied` run is live; make sure the query filters correctly.
- **Coverage regression** — report-comments tests might have mocked the old competency shape. Update mocks to match the new schedule-based source.
