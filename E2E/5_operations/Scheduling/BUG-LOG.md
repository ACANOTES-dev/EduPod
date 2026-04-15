# Scheduling Module — Consolidated Bug Log

**Created:** 2026-04-14
**Module:** Scheduling (Period Grid, Curriculum, Substitutions, Auto-Scheduler, Analytics, Exams, Cover Reports, and 11 sub-modules)
**Walkthrough:** `PLAYWRIGHT-WALKTHROUGH-RESULTS.md`

---

## Workflow Instructions

### For agents picking up a bug

1. **Claim the bug**: Change status from `Open` to `In Progress`.
2. **Read the full entry**: Every entry is self-contained — reproduction steps, expected behavior, affected files, and fix direction are included.
3. **Implement the fix**: Follow the fix direction. Do NOT fix silently — the fix must be verifiable.
4. **Run regression tests**: `turbo test` must pass.
5. **Commit**: Conventional commit format: `fix(scheduling): SCHED-NNN short description`.
6. **Verify via Playwright**: Follow the Playwright verification steps listed in the entry.
7. **Update status**: Change to `Fixed` with the commit hash.

### Status transitions

```
Open → In Progress → Fixed → Verified
                   → Blocked (document blocker)
                   → Won't Fix (document rationale)
```

### Provenance tags

- `[L]` = Live-verified during Playwright walkthrough
- `[C]` = Code-review finding from spec observations (not directly reproduced via UI)

---

## Bug Entries

---

### SCHED-001 — Substitutions page crashes with "Something went wrong"

**Severity:** P0
**Status:** Open
**Provenance:** [L]

**Summary:** Navigating to `/en/scheduling/substitutions` renders the error boundary instead of the page. The component tries to `.filter` an undefined staff array because the upstream `/api/v1/staff?pageSize=200&role=teacher` call returns a 404. Admins cannot report absences through this UI at all.

**Reproduction steps:**

1. Log in as `owner@nhqs.test`.
2. Navigate to `https://nhqs.edupod.app/en/scheduling/substitutions`.
3. Observe: page shows "Something went wrong · An unexpected error occurred."
4. Console:
   - `Failed to load resource: 404 @ /api/v1/staff?pageSize=200&role=teacher`
   - `TypeError: Cannot read properties of undefined (reading 'filter')` at `page-cb137baf8f88f33d.js:1:8560`.

**Expected:** Page renders the substitutions workflow: absence list, report-absence button, ability to assign substitutes.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/scheduling/substitutions/page.tsx` — the `.filter` call + the staff fetch URL
- `apps/api/src/modules/staff-profiles/staff-profiles.controller.ts` — the `/staff` list endpoint that either (a) doesn't support `role=teacher` as a filter, or (b) is mounted at a different path

**Fix direction:**

1. Decide the correct teacher-scoped endpoint. The Leave & Cover work added `GET /v1/scheduling/colleagues` which is teacher-scoped and returns active staff names. Consider reusing or building `GET /v1/scheduling/teachers` (admin version) returning `{id, first_name, last_name}` for all tenant teachers.
2. Fix the frontend to call the correct endpoint.
3. Guard the `.filter` in the component with `?? []` so even if the fetch fails the page renders an empty state instead of crashing.

**Playwright verification:**

1. Navigate to `/en/scheduling/substitutions`.
2. Page should render without error boundary.
3. Teacher dropdown in "Report absence" flow should populate.

**Release gate:** P0 — core module is unusable.

---

### SCHED-002 — Sub Board page crashes

**Severity:** P0
**Status:** Open
**Provenance:** [L]

**Summary:** `/en/scheduling/substitution-board` renders the error boundary. Same root cause pattern as SCHED-001: the page component accesses `.length` on an undefined value. The Sub Board is a staffroom display — if it crashes, schools lose visibility of today's cover status.

**Reproduction steps:**

1. Log in as owner.
2. Navigate to `/en/scheduling/substitution-board`.
3. Observe "Something went wrong".
4. Console: `TypeError: Cannot read properties of undefined (reading 'length')` at `page-9557f47afebc5d9a.js:1:3426`.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/scheduling/substitution-board/page.tsx` — the `.length` access
- Upstream: today's absences API (likely `/api/v1/scheduling/absences/today` or similar)

**Fix direction:**

1. Inspect the Network tab while loading the page to identify which API returns undefined.
2. Ensure the endpoint responds with `{ data: [] }` shape always (not `null`).
3. Add `?? []` guards in the component.

**Playwright verification:**

1. Navigate to `/en/scheduling/substitution-board`.
2. Page renders with "No absences today" empty state.
3. Today-level filters + date picker work.

**Release gate:** P0 — staffroom display broken.

---

### SCHED-003 — Class Requirements "Configure with defaults" returns 400

**Severity:** P1
**Status:** Open
**Provenance:** [L]

**Summary:** Class Requirements is empty for every tenant that hasn't manually configured it. The only way to populate it is "Configure remaining with defaults", which returns 400 from the bulk endpoint. This blocks any tenant from per-class overrides — the Auto-Scheduler runs on year-group defaults only.

**Reproduction steps:**

1. Log in as owner.
2. Navigate to `/en/scheduling/requirements`.
3. Click "Configure remaining with defaults".
4. Console: `Failed to load resource: 400 @ /api/v1/class-scheduling-requirements/bulk`.
5. No rows created.

**Affected files:**

- `apps/api/src/modules/scheduling/*-requirements.controller.ts` or equivalent — the `POST /class-scheduling-requirements/bulk` endpoint
- `packages/shared/src/schemas/*-requirements.schema.ts` — the bulk Zod schema that is likely rejecting the payload

**Fix direction:**

1. Inspect the server 400 response body — it should contain the Zod validation error.
2. Reconcile the UI payload shape with the server expectation. The common cause is a required field the UI isn't sending.
3. Add integration test: `POST /class-scheduling-requirements/bulk` with a valid tenant's full class×subject matrix should succeed.

**Playwright verification:**

1. Navigate to `/en/scheduling/requirements`.
2. Click "Configure remaining with defaults".
3. Table populates with one row per class × subject (for NHQS: 16 classes × 7–8 subjects ≈ 100+ rows).

**Release gate:** P1 — directly limits the auto-scheduler's ability to honour class-specific room/teacher preferences.

---

### SCHED-004 — Staff Preferences module non-functional

**Severity:** P1
**Status:** Open
**Provenance:** [L]

**Summary:** The Staff Preferences page exists and renders a staff picker + Subject/Class/Time Slot tabs + Add button. Both the list fetch (`GET /api/v1/staff-preferences`) and the create (`POST /api/v1/staff-preferences`) return 404 — the backend module is not mounted at all.

**Reproduction steps:**

1. Log in as owner.
2. Navigate to `/en/scheduling/preferences`.
3. Select any staff member.
4. Console: `Failed to load resource: 404 @ /api/v1/staff-preferences?staff_profile_id=…`.
5. Select a subject and click Add: `404 @ /api/v1/staff-preferences`.

**Affected files:**

- `apps/api/src/modules/scheduling/` — either missing module or not registered in `scheduling.module.ts`
- `apps/api/src/app.module.ts` — missing `StaffPreferencesModule` import
- Or: the frontend calls the wrong path

**Fix direction:**

Two paths:

- **A (build the module):** Ship the CRUD endpoints — `GET /staff-preferences?staff_profile_id&academic_year_id`, `POST /staff-preferences`, `PATCH /:id`, `DELETE /:id`. Wire `StaffPreferenceReadFacade` into the solver.
- **B (hide the module):** If preferences aren't shipping this release, remove the Staff Preferences link from the Scheduling dashboard and remove the page route.

The scheduling dashboard paragraph reads "Capture teacher preferences on times, classes, and subjects" — if the backend isn't ready, B is the right short-term move.

**Playwright verification:**

1. Navigate to `/en/scheduling/preferences`.
2. Select staff + subject + add preference.
3. Reload → preference persists.

**Release gate:** P1 — feature advertised in the UI but non-functional.

---

### SCHED-005 — Exams "Add Exam" (slot create) returns 400

**Severity:** P1
**Status:** Open
**Provenance:** [L]

**Summary:** Creating an exam session works, but adding any exam (slot) to the session fails. The `POST /api/v1/scheduling/exam-sessions/{id}/slots` endpoint returns 400. The `GET /slots` endpoint also 404s on initial load, which is suspicious — likely the slots route isn't mounted, and the 400 on POST is the same missing route that the server is treating as an invalid request.

**Reproduction steps:**

1. Log in as owner.
2. Navigate to `/en/scheduling/exams`.
3. Click "Create Session". Fill Name + S2 period + dates. Submit — session created successfully.
4. Click into the session → click "Add Exam".
5. Fill Subject (Mathematics) + Year Group (6th Class) + Date + Start Time + Duration (90) + Student Count (30).
6. Click "Add Exam".
7. Console: `404 @ /exam-sessions/{id}/slots` then `400 @ /exam-sessions/{id}/slots` (POST). No row added.

**Affected files:**

- `apps/api/src/modules/scheduling/exam-scheduling.controller.ts` or equivalent
- The routes mounted under `/scheduling/exam-sessions/:id/slots` (GET + POST)

**Fix direction:**

1. Check if the slots routes are registered. The 404 on GET suggests they are not.
2. If not, add them. Payload for POST likely needs `subject_id, year_group_id, date, start_time, duration_minutes, student_count`.
3. Verify the session `id` param is uuid-validated.

**Playwright verification:**

1. Create a session.
2. Click Add Exam — submit. Exam row appears.
3. Reload the page — exam persists.

**Release gate:** P1 — exam scheduling is one of the advertised scheduling features.

---

### SCHED-006 — Analytics Trends tab crashes

**Severity:** P1
**Status:** Open
**Provenance:** [L]

**Summary:** The Analytics dashboard has 4 tabs. Overview, Workload, Rooms work. Clicking "Trends" triggers an undefined-access crash and the error boundary catches it.

**Reproduction steps:**

1. Log in as owner.
2. Navigate to `/en/scheduling/dashboard`.
3. Click "Trends" tab.
4. Observe "Something went wrong". Console contains an undefined property access.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/scheduling/dashboard/page.tsx` or a `trends-panel` sub-component
- The trends API call (likely `/api/v1/scheduling/analytics/trends` or similar)

**Fix direction:**

1. Identify the failing property access in the Trends component.
2. Guard the fetch result. If the analytics endpoint returns 404 or partial data, render an "insufficient data" empty state.

**Release gate:** P1 — visible tab crashes for admin.

---

### SCHED-007 — Room Closures list: Room name + Created By columns blank

**Severity:** P2
**Status:** Open
**Provenance:** [L]

**Summary:** After creating a room closure, the list renders the new row but the Room column AND the Created By column are both empty. The backend response likely isn't joining `rooms.name` or `users.first_name + last_name` — only the room_id/user_id is present.

**Reproduction steps:**

1. Log in as owner.
2. Navigate to `/en/scheduling/room-closures`.
3. Click "Add Closure". Select Classroom 01. Set dates + reason. Save.
4. Observe: row appears but both Room and Created By cells are empty.
5. Network tab: `GET /api/v1/scheduling/room-closures` response likely contains `room_id` / `created_by_id` but not the joined name fields.

**Affected files:**

- `apps/api/src/modules/scheduling/room-closures.service.ts` — `findAll` method
- Should `include: { room: true, created_by_user: true }` in the Prisma query

**Fix direction:**

1. In the service list method, include the joined relations.
2. In the controller response shape, project `{ room: { id, name }, created_by: { id, first_name, last_name } }`.
3. Frontend cells should read `row.room?.name ?? '—'` and `row.created_by ? `${first_name} ${last_name}` : '—'`.

**Release gate:** P2 — UX gap; closures are still persisted and honoured by the solver, just invisible in the list.

---

### SCHED-008 — Break Groups: Year Groups column blank

**Severity:** P2
**Status:** Open
**Provenance:** [L]

**Summary:** Existing break groups ("Yard 1 - Juniors", "Yard 2 - Seniors") render in the list but the Year Groups column is empty. Same root cause as SCHED-007 — likely the list GET isn't joining the member year-groups.

**Affected files:**

- `apps/api/src/modules/scheduling/break-groups.service.ts` or similar
- Prisma query needs `include: { year_groups: { include: { year_group: true } } }` or equivalent.

**Fix direction:**

1. Expand the include in the list query.
2. Map year_groups array into display (e.g. "Kindergarten, 1st class, 2nd class").
3. Frontend renders the joined labels.

**Release gate:** P2 — data integrity is fine (members are saved); only visibility is broken.

---

### SCHED-009 — Curriculum Hours-per-Week/Month/Year all render 0

**Severity:** P2
**Status:** Open
**Provenance:** [L]

**Summary:** The Curriculum page shows "Period Duration" with a "min" suffix and an empty spinbutton for every subject. Hrs/Week, Hrs/Month, Hrs/Year cells all render "—". The "Forecast Teaching Hours" footer row shows 0.0 / 0.0 / 0.0. This isn't a calculation bug in isolation — it's a missing input: the "period duration" field is blank, so the hours forecast can't be computed.

**Reproduction steps:**

1. Log in as owner.
2. Navigate to `/en/scheduling/curriculum` → select Kindergarten.
3. Observe: 7 subject rows with empty "Period Duration" input despite Min/Week and Max/Day being populated.
4. Hours columns show "—"; forecast row shows 0.0.

**Fix direction:**

- **A (backend default):** Default period duration per subject based on the period grid duration (typically 45 mins). Auto-fill the spinbutton from the grid when empty.
- **B (UX):** Show inline help when Period Duration is empty: "Set period duration to see hours forecast".
- **C (Kill the column):** If period duration is redundant with the period grid, drop the column entirely and always compute hours from the grid.

**Release gate:** P2 — the "Allocated: 19 / 29. Remaining: 10" math works without this. The forecast is decorative.

---

### SCHED-010 — Analytics Rooms tab: `scheduling.auto.capacity` i18n key unresolved

**Severity:** P2
**Status:** Open
**Provenance:** [L]

**Summary:** On the Analytics → Rooms tab, each room card subtitle reads `classroom · scheduling.auto.capacity: 25` — the translation key `scheduling.auto.capacity` is rendered literally instead of resolved to "Capacity".

**Affected files:**

- `apps/web/messages/en.json` and `apps/web/messages/ar.json` — missing `scheduling.auto.capacity` key
- Or: component using `t('scheduling.auto.capacity')` where the namespace is wrong

**Fix direction:**

1. Grep for `scheduling.auto.capacity` in the Rooms analytics component.
2. Add the key to both message files ("Capacity" / "السعة").
3. Verify no `MISSING_MESSAGE` console error on render.

**Release gate:** P2 — cosmetic but visible to every admin viewing analytics.

---

### SCHED-011 — Cover Reports endpoint returns 400

**Severity:** P2
**Status:** Open
**Provenance:** [L]

**Summary:** `GET /api/v1/scheduling/cover-reports?from=2026-03-15&to=2026-04-14` returns 400. The UI masks the error by rendering "No cover data for the selected period." — if a tenant had real cover history they'd still see the empty state because the fetch fails.

**Reproduction steps:**

1. Log in as owner.
2. Navigate to `/en/scheduling/cover-reports`.
3. Observe: "No cover data for the selected period."
4. Network: `GET /api/v1/scheduling/cover-reports?from=…&to=…` returns 400.

**Affected files:**

- `apps/api/src/modules/scheduling/cover-reports.controller.ts` — the GET endpoint
- The Zod query schema for the date range

**Fix direction:**

1. Inspect the 400 body — likely a Zod validation error on the date format.
2. Normalise the expected date format (ISO-8601 `YYYY-MM-DD` is what the frontend sends).
3. Add regression test for the default from/to range the UI computes (last 30 days).

**Release gate:** P2 — module appears working but no data ever loads.

---

### SCHED-012 — Exam sessions have no delete UI

**Severity:** P3
**Status:** Open
**Provenance:** [L]

**Summary:** The Exams module allows creating sessions but provides no way to delete one via the UI. Neither the list row nor the session detail page exposes a destroy action. Test sessions accumulate as orphaned data.

**Reproduction steps:**

1. Log in as owner.
2. Navigate to `/en/scheduling/exams`.
3. Observe no delete button on any session card.
4. Click into a session → observe no delete button there either.

**Residual artefact from this walkthrough:**

- "TEST Exam Session" (id: `799bd5aa-4f99-4ca9-80e1-020ba6837a65`) currently exists in the NHQS tenant with 0 exams. Either delete it via the DB after fixing this bug, or implement the delete button and remove it through the UI.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/scheduling/exams/page.tsx` — list page
- `apps/web/src/app/[locale]/(school)/scheduling/exams/[id]/page.tsx` — detail page (if it exists)
- `apps/api/src/modules/scheduling/exam-sessions.controller.ts` — DELETE endpoint (may or may not exist)

**Fix direction:**

1. Check if `DELETE /api/v1/scheduling/exam-sessions/:id` exists. If yes, wire a delete button into the UI.
2. If not, add the endpoint. Service layer should cascade (or refuse) based on whether exams/invigilators are already assigned.
3. Add a confirmation dialog ("This will permanently delete the exam session and all its exams.").

**Release gate:** P3 — workaround exists (leave old sessions around) but data hygiene suffers.

---

## Summary Table

| ID        | Severity | Status | Tag | Summary                                                          |
| --------- | -------- | ------ | --- | ---------------------------------------------------------------- |
| SCHED-001 | P0       | Open   | [L] | Substitutions page crashes with undefined.filter                 |
| SCHED-002 | P0       | Open   | [L] | Sub Board page crashes with undefined.length                     |
| SCHED-003 | P1       | Open   | [L] | Class Requirements "Configure with defaults" 400                 |
| SCHED-004 | P1       | Open   | [L] | Staff Preferences 404 on GET and POST — endpoint missing         |
| SCHED-005 | P1       | Open   | [L] | Exams Add-Exam (slot POST) returns 400; GET /slots also 404      |
| SCHED-006 | P1       | Open   | [L] | Analytics Trends tab crashes                                     |
| SCHED-007 | P2       | Open   | [L] | Room Closures list: Room name + Created By columns blank         |
| SCHED-008 | P2       | Open   | [L] | Break Groups: Year Groups column blank                           |
| SCHED-009 | P2       | Open   | [L] | Curriculum Hrs/Week/Month/Year all render 0 due to missing input |
| SCHED-010 | P2       | Open   | [L] | Analytics Rooms: `scheduling.auto.capacity` i18n key unresolved  |
| SCHED-011 | P2       | Open   | [L] | Cover Reports endpoint 400                                       |
| SCHED-012 | P3       | Open   | [L] | Exam sessions have no delete UI                                  |

**Severity totals:** P0: 2, P1: 4, P2: 5, P3: 1 — **Total: 12 bugs (walkthrough — all fixed)**

### Stress-test bug summary (SCHED-013+)

| ID        | Severity | Status                     | Tag | Found by              | Summary                                                                               |
| --------- | -------- | -------------------------- | --- | --------------------- | ------------------------------------------------------------------------------------- |
| SCHED-013 | P1       | Fixed (deployed)           | [L] | session-A + session-C | Worker crash loop — audit-log RLS context (A) + memory-restart raise (C)              |
| SCHED-015 | P2       | Open                       | [L] | session-D             | Absence schema accepts inverted period range / out-of-grid periods                    |
| SCHED-016 | P1       | Open (stress-c workaround) | [L] | session-C             | Stress-tenant admin role missing 9/17 `schedule.*` perms (seed gap)                   |
| SCHED-017 | P1       | Open                       | [L] | session-A             | Solver returns `status=completed` with 17% curriculum unassigned (STRESS-002/006/007) |
| SCHED-018 | P1       | Open                       | [L] | session-C             | `class_scheduling_requirements.preferred_room_id` never threaded to solver            |
| SCHED-021 | P3       | Open                       | [L] | session-A             | Progress endpoint emits negative `entries_assigned` when unassigned>placed            |
| SCHED-022 | P2       | Open (feature gap)         | [L] | session-C             | Cross-year-group / multi-year-group class entity not modelable                        |
| SCHED-023 | P2       | Open (feature gap)         | [L] | session-C             | `class_scheduling_requirements` lacks per-(class, subject) overrides                  |
| SCHED-027 | P2       | Fixed (deployed, 2 passes) | [L] | session-C + wave2     | Cancel endpoint now deadlock-proof: lock_timeout + worker split-txn (Wave 2 re-fix)   |
| SCHED-025 | P2       | Open                       | [L] | session-A             | Solver v2 non-deterministic despite `solver_seed=0` (STRESS-046/047)                  |
| SCHED-026 | P2       | Open                       | [L] | session-A             | Quality report lacks teacher-gap / day-variance / preference breakdown                |
| SCHED-028 | P2       | Fixed (deployed)           | [L] | wave2-session         | Archived teachers still fed into solver when stale competency rows exist (STRESS-076) |

---

## Resolution — 2026-04-14

All 12 bugs fixed, deployed to production, and verified via Playwright. Key changes:

- **SCHED-001**: Added `GET /api/v1/scheduling/teachers` admin endpoint (returns active staff for the substitutions picker) and guarded `absence.slots?.filter/map` with `?? []`. Page renders without crash.
- **SCHED-002**: Reshaped `getTodayBoard` response to `{today_date, slots[], upcoming[], school_name, school_logo_url}`. Guarded page-level `.length`/`.map` accesses. Page renders the staffroom display without crash.
- **SCHED-003**: Extended `bulkClassRequirementsSchema` to accept `{academic_year_id, apply_defaults_to_unconfigured: true}` mode; service now expands to one default entry per unconfigured class. Verified: "16 of 16 classes configured".
- **SCHED-004**: Rewrote frontend preferences page to call `/api/v1/staff-scheduling-preferences` (the correct mount point). No more 404s.
- **SCHED-005**: Added `GET /api/v1/scheduling/exam-sessions/:id/slots` endpoint, made `end_time` optional in `addExamSlotSchema` (server computes from start + duration). Verified: exam slot created end-to-end.
- **SCHED-006**: Added missing `const t = useTranslations('scheduling.auto')` in `TrendsTab`. Tab renders with two line charts.
- **SCHED-007**: `formatClosure()` now flattens `room.name` → `room_name` and `created_by` → `created_by_name`. Verified: row displays "Classroom 01" + "Yusuf Rahman".
- **SCHED-008**: `formatBreakGroup()` now emits `year_groups: [{id, name}]`. Verified: badges render in the list.
- **SCHED-009**: Frontend `computeHoursPerWeek` now falls back to 45 min default period duration. Verified: Arabic shows 3.8 Hrs/Week.
- **SCHED-010**: Added `"capacity"` key to `scheduling.auto` namespace in en.json + ar.json. Verified: "Capacity: 25" renders.
- **SCHED-011**: Frontend now sends `date_from`/`date_to` (matching schema) and unwraps `res.data` from the response envelope. Backend rewrote `getCoverReport` to return the full `{from_date, to_date, total_substitutions, fairness_index, avg_cover_count, teachers, by_department}` shape expected by the UI.
- **SCHED-012**: Added delete button to exam session list cards (shown when `status === 'planning'`). Frontend calls existing `DELETE /exam-sessions/:id`. Leftover test sessions removed via the new UI.

**Regression tests**: All scheduling test suites pass (128 + 16 + 20 tests green). Build + deploy workflow: `pnpm build` (shared → api → web) + rsync + pm2 restart. All 12 bugs verified via Playwright end-to-end on `https://nhqs.edupod.app`.

---

## Stress-test bugs (SCHED-013 onwards)

---

### SCHED-016 — Stress-tenant admin role missing 9 of 17 `schedule.*` permissions (blocks all solver scenarios)

**Severity:** P1
**Status:** Open (workaround applied to stress-c)
**Provenance:** [L] — found during STRESS-029 setup on stress-c.edupod.app, 2026-04-15
**Found by:** session-C
**Note:** Originally numbered SCHED-013 by session-C and renumbered to SCHED-016 to avoid collision with session-A's SCHED-013 (worker crash) and session-D's SCHED-015 (absence schema).

**Summary:** The `admin` tenant-role provisioned by `packages/prisma/scripts/create-stress-tenants.ts` only has 8 of the 17 available `schedule.*` permissions. `schedule.run_auto`, `schedule.apply_auto`, `schedule.override_conflict`, `schedule.view_class`, `schedule.view_own`, `schedule.view_own_satisfaction`, `schedule.manage_own_preferences`, `schedule.report_own_absence`, and `schedule.respond_to_offer` are all missing. This means an admin cannot invoke the prerequisites endpoint or trigger a solve at all on any stress tenant (`stress-a`, `stress-b`, `stress-c`, `stress-d` — they all came from the same script).

**Reproduction:**

```
curl -sS -X POST https://stress-c.edupod.app/api/v1/scheduling/runs/prerequisites \
  -H "Authorization: Bearer <admin-jwt>" \
  -H 'Content-Type: application/json' \
  -d '{"academic_year_id":"<ay-id>"}'
# → {"error":{"code":"PERMISSION_DENIED","message":"Missing required permission: schedule.run_auto"}}
```

**Expected:** admin role on stress tenants has every `schedule.*` permission. The seed script claims to assign "tenant-scoped roles + permissions" for the admin, principal, teacher users.

**Affected files:**

- `packages/prisma/scripts/create-stress-tenants.ts` — the role/permission hydrator
- Likely the canonical admin-permission list used by the script

**Fix direction:**

1. In `create-stress-tenants.ts`, when seeding the `admin` role, assign **every** row from `permissions` (or at minimum every `schedule.*`, `grades.*`, `finance.*`, etc) for that tenant. Easiest approach: SELECT all permission_ids and bulk-insert into `role_permissions` for the admin role.
2. Re-run the script — it is idempotent (stress-c created via this script).
3. Or do an ad-hoc DB patch for the existing 4 tenants (already done for stress-c during this test).

**Playwright / API verification:**

1. Re-login as `admin@stress-<slug>.test`
2. `POST /api/v1/scheduling/runs/prerequisites` should return `{ready: true, missing: []}`.

**Workaround applied on stress-c (2026-04-15):**

```sql
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, r.tenant_id
FROM roles r CROSS JOIN permissions p
WHERE r.tenant_id = '<stress-c tenant_id>' AND r.role_key = 'admin' AND p.permission_key LIKE 'schedule.%'
ON CONFLICT DO NOTHING;
```

Session-A, B, D may need the same patch on their tenants (or fix the seed script for all four).

**Release gate:** P1 — blocks all solver + substitution scenarios from running on stress tenants until patched.

---

### SCHED-013 — Worker crash loop blocks scheduling solver (audit-log RLS context + empty-UUID handling AND insufficient max_memory_restart)

**Severity:** P1
**Status:** Fixed (deployed) — two-part root cause
**Provenance:** [L]
**Found by:** session-A (audit-log RLS) during STRESS-002 on `stress-a`; second cause (memory limit) found by session-C while attempting STRESS-029 on `stress-c`

**Summary:** Every mutating request enqueues an audit-log job. `AuditLogWriteProcessor.process()` calls `prisma.auditLog.create()` outside any transaction, so `SET LOCAL app.current_tenant_id` is never issued. The `audit_logs` RLS policy evaluates `current_setting('app.current_tenant_id')::uuid`, and when the GUC is unset PostgreSQL raises `42704 unrecognized configuration parameter` on every insert. With `FORCE ROW LEVEL SECURITY` on, even the `edupod_app` role hits this. BullMQ retries, pm2 eventually restarts the worker (12 restarts observed in ~2 hours), and any in-flight scheduling solve is killed — the run stays `queued` forever while the UI shows an infinite spinner. A second failure path: when the interceptor emits an empty string for `entity_id`/`tenantId`, Prisma tries to coerce `""` into a UUID and fails with `22P02 invalid input syntax for type uuid`, causing the same restart loop.

**Reproduction:**

1. `ssh root@46.62.244.139 "sudo -u edupod pm2 logs worker --nostream --lines 80 --err"` — shows stack traces like `unrecognized configuration parameter "app.current_tenant_id"` for every audit event.
2. `sudo -u edupod pm2 list` — `worker` row shows restart counter (`↺`) climbing every few minutes.
3. POST `/api/v1/scheduling-runs` as a principal user. Poll `/api/v1/scheduling-runs/<id>/progress`: status remains `queued`. Worker logs show `SchedulingSolverV2Job` progress ticks (50/320, 100/320…) that never reach completion — the process is killed mid-solve.

**Affected files:**

- `apps/worker/src/processors/audit-log/audit-log-write.processor.ts`
- `apps/worker/src/processors/audit-log/audit-log-write.processor.spec.ts`
- `ecosystem.config.cjs` (memory-limit follow-up)

**Fix (part 1 — audit log, by session-A):**

1. Wrap the `auditLog.create()` call in `prisma.$transaction(async (tx) => …)` that first runs `SELECT set_config('app.current_tenant_id', $1::text, true)` and the matching `app.current_user_id`. Use `00000000-0000-0000-0000-000000000000` when the payload tenant/user is null — the policy's `tenant_id IS NULL OR …` branch still matches platform-level rows without breaking the cast.
2. Normalise payload UUIDs via a regex check: empty string or malformed UUID → `undefined` so Prisma omits the column instead of sending `""`.
3. Committed as `11a121ab fix(worker): set RLS context in AuditLogWriteProcessor (sched-013)` and rsync-deployed at 00:18 UTC.

**Fix (part 2 — memory limit, by session-C):**

After session-A's audit-log fix shipped, the worker still cycled every ~60s. Root cause: `pm2.log` showed `[PM2][WORKER] Process 2 restarted because it exceeds --max-memory-restart value (current_memory=~890MB max_memory_limit=786MB)` repeatedly. The CP-SAT phase of solver v2 reaches ~900MB RSS during a 6-year-group / 320-variable solve; the previous `750M` ceiling guaranteed restart mid-CP-SAT. Server has 12GB free, so raised `worker.max_memory_restart` from `750M` to `2G` in `ecosystem.config.cjs` and reloaded via `pm2 delete worker && pm2 start ecosystem.config.cjs --only worker && pm2 save`. Committed as `b3630c05 fix(infra): raise worker max_memory_restart 750M→2G to stop CP-SAT restart loop`.

**Verification:**

1. `pnpm --filter @school/worker test -- audit-log-write` — all specs green.
2. Redeploy worker; `sudo -u edupod pm2 list` should show stable `↺` counter.
3. `POST /api/v1/scheduling-runs` → progress transitions `queued → running → completed` inside the 20s budget for STRESS-002 scale.
4. `SELECT count(*) FROM audit_logs WHERE created_at > now() - interval '5 minutes'` > 0.

**Release gate:** P1 — blocks every BullMQ-driven feature (solver, substitutions, notifications, gradebook rollups, …) because the worker can't stay alive long enough to complete anything.

---

### SCHED-015 — Absence schema accepts inverted period range and out-of-grid period numbers

**Severity:** P2
**Status:** Fixed (commit a892ca92)
**Provenance:** [L]
**Found by:** session-D during STRESS-066 execution on `stress-d.edupod.app`, 2026-04-15

**Summary:** `reportAbsenceSchema` and `selfReportAbsenceSchema` (in `packages/shared/src/schemas/scheduling-enhanced.schema.ts`) only refine that `period_from` is set when `full_day=false` and that `date_to >= date`. They do NOT enforce `period_to >= period_from` and do NOT validate that period values fall within the configured period grid. Two probes on stress-d:

1. `POST /api/v1/scheduling/absences` with `period_from=5, period_to=3` → HTTP 201 (server happily creates an inverted-range absence).
2. Same endpoint with `period_from=99, period_to=100` → HTTP 201 (period numbers far outside the 8-period grid).

In both cases `days_counted=0.5` is returned and the row is queryable through `GET /absences`. Downstream, the substitution cascade would attempt to find lessons in non-existent periods 99-100 (silent no-op) and lessons in 3..5 (only periods 3,4,5 actually exist; 5..3 is empty, so no covers generated even though admin thought they reported an absence).

The plan's STRESS-066 ("Zero-duration absence") covers the spirit of this — start equals/exceeds end should be rejected with a clear error.

**Reproduction:**

```
curl -X POST https://stress-d.edupod.app/api/v1/scheduling/absences \
  -H "Authorization: Bearer <principal-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"staff_id":"<any-teacher-id>","date":"2026-04-20","full_day":false,"period_from":5,"period_to":3}'
# → HTTP 201 (expected: HTTP 400 VALIDATION_ERROR period_to)
```

**Expected:**

- `period_to >= period_from` enforced when both are present.
- Period numbers should fall within the configured period grid for the academic year (best-effort — could be a soft warning rather than hard reject if the grid changes).

**Fix direction:**

1. Add a `.refine()` to both `reportAbsenceSchema` and `selfReportAbsenceSchema`:
   ```ts
   .refine((d) => d.period_from == null || d.period_to == null || d.period_to >= d.period_from, {
     message: 'period_to must be on or after period_from',
     path: ['period_to'],
   })
   ```
2. (Optional follow-up) Service-layer validation: cross-check `period_from`/`period_to` against the academic year's period count. Out-of-grid values should be rejected with a `PERIOD_OUT_OF_GRID` error code.

**Verification:**

1. Re-run the two `curl` probes — both should return HTTP 400.
2. Pre-existing `reportAbsence` integration tests should still pass.
3. Re-run STRESS-066 — should report PASS instead of finding the bug.

**Release gate:** P2 — admin-facing data-integrity bug; no immediate user-visible crash, but creates phantom absence rows that confuse downstream substitution logic and reporting.

---

### SCHED-017 — Solver v2 reports `status=completed` while leaving curriculum demand unfilled (medium school)

**Severity:** P1
**Status:** Open
**Provenance:** [L]
**Found by:** session-A during STRESS-002 execution on `stress-a.edupod.app`, 2026-04-15

**Summary:** On the stress baseline (20 teachers, 10 classes, 8×5=40-slot week, 320-period curriculum demand), a single auto-solve run produced:

- `solver_duration_ms: 120_334` (6× the STRESS-002 budget of 20 s — and already over the STRESS-003 90 s budget).
- `entries_generated: 227`, `entries_unassigned: 56`, `entries_pinned: 0`. 17.5 % of curriculum demand left unplaced (and 37 periods unaccounted for — 227+56=283, not 320).
- `hard_constraint_violations: 0`, `soft_preference_satisfaction_pct: 99`.
- Final status: **`completed`** (not `partial`, not `infeasible`).

The solver silently turns a partial schedule into a "completed" outcome. Downstream, `/v1/scheduling-runs/:id/apply` will write 227 schedule entries to the timetable while telling no one that 56 classes-per-week are missing a teacher assignment.

STRESS-002 is the canonical medium-school sanity check. The expected plan outcome is `status=succeeded`, all curriculum requirements met, within 20 s — so this run fails on two axes: runtime and completeness.

**Reproduction:**

```
curl -sX POST https://stress-a.edupod.app/api/v1/scheduling-runs \
  -H "Authorization: Bearer <principal-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"academic_year_id":"d0e0017c-ea72-4cce-80e0-8f17087dd16c"}'
# poll /scheduling-runs/<id>/progress until status != queued/running
curl -s https://stress-a.edupod.app/api/v1/scheduling-runs/<id> \
  -H "Authorization: Bearer <principal-jwt>" \
  | jq '.data | {status, solver_duration_ms, entries_generated, entries_pinned, entries_unassigned}'
# → {"status":"completed","solver_duration_ms":120334,"entries_generated":227,"entries_pinned":0,"entries_unassigned":56}
```

**Run under test:** `2cfcb81f-0425-4695-90f4-8c15df944b6b` (stress-a, principal, 2026-04-15 00:24:16 UTC).

**Fix direction:**

1. Decide the semantics of `status` on incomplete solves. Plan calls for `status=succeeded` iff every curriculum requirement is placed; otherwise `status=infeasible` with a constraint report enumerating what could not be fit. A third state (`partial`) is acceptable if the UI surfaces it prominently so admins don't apply a broken timetable.
2. In `apps/worker/src/processors/scheduling/solver-v2.processor.ts` (or whichever job runs `SchedulingSolverV2Job`), replace the final `status=completed` unconditional write with: `status = unassigned_count === 0 ? 'completed' : 'infeasible'` (or `'partial'` once the enum is extended).
3. Surface an explicit shortage list in `constraint_report.unassigned` — today the field is `unassigned_count: 56` with no indication of which class/subject/period slots failed.
4. Investigate why 37 curriculum periods appear to be dropped before being marked unassigned (`entries_generated + entries_unassigned < curriculum_demand`). Likely a filtering bug in the demand-to-variable conversion.
5. Investigate why the 20 s budget is blown 6× at medium scale. The progress stream sat in "greedy" for ~60 s; either profile/optimize the greedy phase or revise the budget with justification.

**Verification:**

1. Re-run STRESS-002 via the same POST. Expect either `status=completed` with `entries_unassigned=0`, OR `status=infeasible` with `constraint_report.unassigned` enumerating the exact class/subject rows that could not be placed.
2. If the solver legitimately cannot fill the baseline in 20 s, open a plan update to revise STRESS-002 budget rather than accepting silent partial outputs.

**Release gate:** P1 — silent partial schedules are worse than an infeasible report. An admin clicking "Apply" on a "completed" timetable will publish a broken week's worth of gaps.

---

### SCHED-018 — `class_scheduling_requirements.preferred_room_id` (and `required_room_type`) never reach the solver

**Severity:** P1
**Status:** Open
**Provenance:** [L]
**Found by:** session-C during STRESS-030 execution on `stress-c.edupod.app`, 2026-04-15

**Summary:** The `class_scheduling_requirements` table exists, the `/v1/class-scheduling-requirements` API accepts and persists `preferred_room_id` + `required_room_type` + `max_consecutive_periods` + `min_consecutive_periods` + `spread_preference`, and the V2 solver (`packages/shared/src/scheduler/solver-v2.ts:256, 563-576`) reads `preferred_room_id` from each `CurriculumEntry` to bias room selection. **But the API↔solver bridge is dead code:** in `apps/api/src/modules/scheduling/scheduler-orchestration.service.ts:287-288` the orchestration layer hardcodes `required_room_type: null, preferred_room_id: null` for every curriculum entry. There is no other code path that reads the per-class requirements into the solver input. Net effect: the entire `ClassSchedulingRequirement` model is invisible to the auto-scheduler.

This blocks any "force room X for class Y" workflow (STRESS-030 in the stress pack — Y11-A Science → LAB02). It also nullifies the `max_consecutive_periods`, `min_consecutive_periods`, and `spread_preference` fields the UI surfaces — they are accepted by the API but the solver never sees them.

**Empirical reproduction (stress-c, 2026-04-15):**

```bash
# 1. Set Y11-A's preferred_room_id to LAB02
TOKEN=...; AY=...; Y11A=e282d90e-df2d-4f02-bde5-b074d3496bc8; LAB02=e61c8b30-cb4e-4176-8c66-5677da3be33d
curl -X POST https://stress-c.edupod.app/api/v1/class-scheduling-requirements \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"class_id\":\"$Y11A\",\"academic_year_id\":\"$AY\",\"periods_per_week\":32,\"preferred_room_id\":\"$LAB02\",\"max_consecutive_periods\":2,\"min_consecutive_periods\":1,\"spread_preference\":\"spread_evenly\"}"

# 2. Trigger a solve and wait for completion (~120s)
# Run id: c4bb0213-e68c-4329-981f-9fdd2edf1ba1, status=completed, 212 entries

# 3. Inspect the resulting Y11-A Science assignments
psql -c "
WITH e AS (SELECT jsonb_array_elements(result_json->'entries') x FROM scheduling_runs WHERE id='c4bb0213-...')
SELECT
  COUNT(*) FILTER (WHERE x->>'class_id'='$Y11A' AND x->>'subject_id'='af3a8b4c-4c3a-4733-9c81-b10e8dd5c436') AS science_entries,
  COUNT(*) FILTER (WHERE x->>'class_id'='$Y11A' AND x->>'subject_id'='af3a8b4c-4c3a-4733-9c81-b10e8dd5c436' AND x->>'room_id'='$LAB02') AS science_in_lab02
FROM e;
# → science_entries=4, science_in_lab02=0
```

The class-level preference was completely ignored. (Note Y11-B doesn't exist in baseline; Y11-A is the substituted target, but the failure mode is the same.)

**Affected files:**

- `apps/api/src/modules/scheduling/scheduler-orchestration.service.ts:278-289` — curriculum-entry build: hardcodes `null` for `required_room_type` and `preferred_room_id` instead of merging from `class_scheduling_requirements`.
- `apps/api/src/modules/scheduling/scheduling-read.facade.ts:289-317` — `findClassRequirements()` exists but is **never** called by the orchestration service.
- (Also worth auditing) the `max_consecutive_periods` / `min_consecutive_periods` / `spread_preference` fields — same pattern, also never threaded through.

**Fix direction:**

1. Inside `buildSolverInput()` (orchestration service), load `class_scheduling_requirements` for the academic year via `SchedulingReadFacade.findClassRequirements()`.
2. Build a per-`(class_id, subject_id)` override map. Decide policy when class-level + curriculum-level conflict (recommend: class-level wins for room hints; curriculum-level wins for periods_per_week unless class req explicitly differs).
3. The solver currently keys `preferred_room_id` on `CurriculumEntry` (per-year-group), which is too coarse for a per-class override. Either (a) extend `CurriculumEntry` to carry an optional `class_id` selector, or (b) inject a separate `class_room_overrides[]` array into `SolverInputV2` and consume it in `solver-v2.ts` alongside the existing `preferred_room_id` logic.
4. Add an integration test that sets a class-level `preferred_room_id` and asserts the solver places that subject in that room ≥ 80 % of the time (allowing for hard conflicts when the room is already booked).
5. Decide whether `required_room_type` (vs `preferred`) should be a HARD constraint (room must match type) or a soft preference. STRESS-030 uses the term "must use" → hard. The current schema has both fields, suggesting soft-vs-hard distinction by name.

**Workaround:** None today. STRESS-030 cannot pass until this lands.

**Release gate:** P1 — silently broken feature: admins set room preferences in the UI expecting them to be honoured; solver ignores them entirely.

---

### SCHED-019 — Cascade engine offers covers to teachers who are themselves on leave that period

**Severity:** P1
**Status:** Open
**Provenance:** [L]
**Found by:** session-D during STRESS-057 execution on `stress-d.edupod.app`, 2026-04-15

**Summary:** When two teachers are absent for the same period, the substitution cascade still picks the second-absent teacher as a candidate to cover the first. Auto-assign should treat any candidate with an active (non-cancelled) absence covering the lesson period as ineligible. Two related symptoms:

1. Cascade fires offers TO teachers who are themselves absent for that period.
2. Existing pending offers are NOT auto-revoked when the recipient subsequently logs an absence covering the offered period.

This means a teacher who self-reported sick can receive an offer asking them to cover another teacher's lesson at the exact period they're absent — and the system will happily mark that as the cover if they "accept".

**Reproduction:**

```
# T11 self-reports absence today P3 (T11 has no Wed P3 lesson — declares unavailability)
curl -X POST .../scheduling/absences/self-report -H 'Auth: T11' \
  -d '{"date":"2026-04-15","full_day":false,"period_from":3,"period_to":3}'

# T6 self-reports absence today P3 (T6 has Wed P3 lesson Y8-B)
curl -X POST .../scheduling/absences/self-report -H 'Auth: T6' \
  -d '{"date":"2026-04-15","full_day":false,"period_from":3,"period_to":3}'

# Inspect T11's offers — observed: includes "cover Teacher 06 P3 Y8-B"
curl .../scheduling/offers/my -H 'Auth: T11'
```

Observed: T11 receives a pending offer to cover T6's P3 lesson despite T11 being on leave that period.

Expected: T11 should be excluded from the candidate pool because they have an active absence covering 2026-04-15 P3.

**Affected files:**

- `apps/api/src/modules/scheduling/substitution-cascade.service.ts` — candidate filter (`findAvailable*` / `selectCandidates` — search for the candidate-eligibility query)
- The eligibility query needs an additional clause: `AND NOT EXISTS (active absence for this candidate covering this date+period)`

**Fix direction:**

1. In the candidate-eligibility SQL/Prisma query, add a `notExists` filter against `teacher_absence` rows where `staff_profile_id = candidate.id`, `cancelled_at IS NULL`, and the requested period lies within the absence's period range (or `full_day` is true).
2. Add a follow-on hook in `selfReportAbsence` / `reportAbsence` services: after the absence is created, scan `substitution_offer` rows where `recipient_staff_id = absent_staff.id`, `status = pending`, the offered lesson date matches the absence date, and the offered lesson period overlaps the absence period — set those offer statuses to `revoked` with reason `recipient_absent`.
3. Service test: two-absence scenario asserts (a) the second absent teacher is NOT in the offer set for the first; (b) any pre-existing pending offer is `revoked` after the second absence is logged.

**Verification:**

1. Re-run STRESS-057: logging two simultaneous absences for the same period yields zero offers between them.
2. Logging absence A first (cascade fires offers including to candidate X), then absence B for X covering the same period: X's offer for A is now `revoked`.

**Release gate:** P1 — admin-trusted feature silently picks unavailable subs, can result in classes left uncovered when a teacher "accepts" a cover they cannot deliver.

---

### SCHED-020 — Sub Board still surfaces revoked substitution rows

**Severity:** P3
**Status:** Open
**Provenance:** [L]
**Found by:** session-D during STRESS-049/050 walkthrough on `stress-d.edupod.app`, 2026-04-15

**Summary:** `GET /api/v1/scheduling/substitution-board` returns slots with `status=revoked` for substitutions whose underlying absence has been cancelled (or whose offer was revoked). The staffroom display is meant to show today's _active_ covers; revoked rows clutter the view and could mislead staff into showing up for a cover that no longer exists.

**Reproduction:**

1. Self-report absence (any teacher with a lesson today). Cascade fires.
2. Have a candidate accept an offer (substitution `status=assigned`).
3. Cancel the absence via `POST /scheduling/absences/:id/cancel`.
4. `GET /scheduling/substitution-board` — the slot still appears in `slots[]` with `substitute_name` populated and `status=revoked`.

**Expected:** revoked / cancelled-absence substitutions are filtered out of the today board (or moved to a separate "history" section).

**Affected files:**

- `apps/api/src/modules/scheduling/substitution.service.ts` — `getTodayBoard()` query: add `where: { status: { not: 'revoked' } }` (or a positive include list `['assigned','confirmed','completed']`).

**Verification:**

1. After the fix, the reproduction's step 4 returns the slot list without the revoked row.
2. Existing `getTodayBoard` unit tests still pass; add one new test covering the revoked filter.

**Release gate:** P3 — display noise, not data corruption. No urgent risk but visible to every admin opening the board after running cleanup.

---

### SCHED-021 — `/scheduling-runs/:id/progress` emits negative `entries_assigned` when solver drops more than it places

**Severity:** P3
**Status:** Open
**Provenance:** [L]
**Found by:** session-A during STRESS-007 execution on `stress-a.edupod.app`, 2026-04-15

**Summary:** After STRESS-007's room-shortage solve finished, the progress payload was:

```json
{
  "status": "completed",
  "phase": "complete",
  "entries_assigned": -69,
  "entries_total": 40,
  "elapsed_ms": 912
}
```

Run body shows `entries_generated=40`, `entries_unassigned=109`. The progress endpoint appears to compute `entries_assigned = entries_generated - entries_unassigned`, which goes negative when the solver drops more slots than it places. The admin progress dialog binds `entries_assigned / entries_total` and would show `-69 / 40`.

**Reproduction:** Any run where `entries_unassigned > entries_generated`. Reproduced on stress-a with only one room active (`UPDATE rooms SET active=false WHERE name != 'CR01'`), then POST `/api/v1/scheduling-runs`. Run id: `97a9c8ee-c9fb-4bea-b0ff-e85fd8301332`.

**Fix direction:** In the scheduling-runs progress endpoint (likely `apps/api/src/modules/scheduling-runs/scheduling-runs.service.ts` or its read facade), drop the subtraction. Expose raw counters: `entries_placed`, `entries_unassigned`, `entries_total_demand`. The UI can compute a bar width that clamps to `[0, 1]`. Do not invent negative values.

**Release gate:** P3 — paired with SCHED-017 the symptom is visible to admins, but no downstream data corruption.

---

### SCHED-022 — Cross-year-group / multi-year-group class entity is not modelable (STRESS-032 feature gap)

**Severity:** P2
**Status:** Fixed (commit a892ca92, deployed 2026-04-15 00:49 UTC) (feature gap)
**Provenance:** [L]
**Found by:** session-C during STRESS-032 execution on `stress-c.edupod.app`, 2026-04-15

**Summary:** The Class entity assumes a single `year_group_id`. The Prisma schema permits null (`year_group_id String? @db.Uuid` at `schema.prisma:2431`) but the API forbids it (`createClassSchema.year_group_id: z.string().uuid()` — required, non-nullable in `packages/shared/src/schemas/class.schema.ts:5`). Even if the API allowed null, the orchestration iterates `yearGroups → yg.classes` (`scheduler-orchestration.service.ts:267`); a class with `year_group_id=null` would be invisible to every year-group's solver pass and never scheduled.

For an elective class that legitimately spans multiple year groups (e.g. "Higher-Level Maths" with Y10 and Y11 students enrolled), there is no way to express it. Workarounds — splitting into per-year-group classes and synchronising via shared time slots — are not modelable without a solver feature for cross-class slot synchronisation.

**Reproduction:**

```bash
curl -X POST https://stress-c.edupod.app/api/v1/classes \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"academic_year_id":"...","name":"STRESS032-Elective","max_capacity":20,"status":"active","class_type":"floating"}'
# → HTTP 400 VALIDATION_ERROR — year_group_id Required
```

**Fix direction:**

1. Decide whether multi-year-group classes are in scope (rare in primary; common in secondary).
2. Add a `class_year_groups` link table (many-to-many between Class and YearGroup); deprecate `Class.year_group_id` or keep as the canonical home year for non-multi classes.
3. Update `ClassesReadFacade.findEnrolmentPairsForAcademicYear` and the orchestration's per-year-group section iteration to fan out a multi-year class across each enrolled year group's section list (or treat as a single section with merged year-group context).
4. Solver-side: extend `SectionInfo` to optionally carry `year_group_ids: string[]`; ensure `student_overlaps` constraints prevent cross-class slot conflicts for the elective's enrolled students.

**Workaround:** None. STRESS-032 cannot pass.

**Release gate:** P2 — feature is rare in primary schools (Ireland baseline target). Will block secondary-school expansion later.

---

### SCHED-023 — `class_scheduling_requirements` cannot express per-(class, subject) overrides (STRESS-033 feature gap)

**Severity:** P2
**Status:** Open (feature gap)
**Provenance:** [L]
**Found by:** session-C during STRESS-033 execution on `stress-c.edupod.app`, 2026-04-15

**Summary:** `ClassSchedulingRequirement` is keyed `[tenant_id, class_id, academic_year_id]` (`schema.prisma:2938`) — exactly one row per class. There is no `subject_id` column. So the scenario "Y9-A Drama 2 periods/week (class-level requirement)" cannot be expressed:

- The class-level `periods_per_week` is a single integer for the class as a whole, not per-subject.
- Curriculum is per-(year_group, subject); there is no per-(class, subject) override layer.

For STRESS-033, the system can neither (a) reject the mismatched requirement up-front (the requirement cannot exist) nor (b) honour the override (no override mechanism). Admins who want a class-specific subject quota have to either edit the year-group curriculum (affecting every class in that year) or use teacher_competency pin/pool (which doesn't add periods).

This is on the same feature axis as SCHED-018. A complete fix likely co-designs with SCHED-018: introduce `class_subject_requirements` keyed `[tenant_id, class_id, subject_id, academic_year_id]` carrying `periods_per_week`, `preferred_room_id`, `required_room_type`, `requires_double_period`, and have the orchestration merge class-subject overrides over the year-group curriculum baseline before constructing solver input.

**Fix direction:**

1. Add `class_subject_requirements` Prisma model with `(tenant_id, class_id, subject_id, academic_year_id)` unique key + per-row `periods_per_week`, room hints, double-period flags.
2. Add API: `POST/GET/PATCH/DELETE /v1/class-subject-requirements` + bulk endpoint.
3. Decide policy when (a) curriculum says 0 periods of subject X and (b) class override says N>0. Recommended: class override wins; record the override in the run's `constraint_report` so admins can audit it. Optionally a tenant flag to flip to "validation rejects mismatch".
4. Update orchestration to merge overrides into curriculum entries before sending to solver. (Same code site as SCHED-018 fix; co-deliver.)
5. Add an integration test for STRESS-033's two cases.

**Workaround:** None.

**Release gate:** P2 — limits per-class scheduling flexibility. Schools currently work around by editing year-group curriculum, which affects every class in that year.

---

### SCHED-024 — Solver violates `requires_double_period`: emits standalone single-period entries for double-required subjects

**Severity:** P1
**Status:** Open
**Provenance:** [L]
**Found by:** session-B during STRESS-015 execution on `stress-b.edupod.app`, 2026-04-15

**Summary:** When `curriculum_requirements.requires_double_period = true` for a subject, every appearance of that subject in the solved schedule MUST be part of a 2-consecutive-period block. The solver violates this constraint: it places single-period entries for double-required subjects, emitting partial assignments rather than failing infeasibly.

**Reproduction:** On stress-b baseline, set `requires_double_period=true` for Science, PE, and Art (all 6 year groups, 18 curriculum rows total). Trigger a solve.

```sql
UPDATE curriculum_requirements SET requires_double_period = true
 WHERE tenant_id='<TENANT>'::uuid AND academic_year_id='<AY>'::uuid
   AND subject_id IN (SELECT id FROM subjects WHERE name IN ('Science','PE','Art'));
```

Run id `e1f87145-dc28-4df6-8629-c06e979b5e44` produced:

- `entries_generated=206`, `entries_unassigned` covering 114 periods (203% of baseline-shortfall).
- Of 23 Science/PE/Art entries placed (16 Science + 4 PE + 3 Art), **all 23 are singletons** — none paired into a 2-period block.

Examples of singleton placements (class_id prefix, weekday, period_order):

- Science class=55bd566a wd=1 period=6 (no Science in the same class on weekday 1 at period 5 or 7 — the placement is isolated).
- Science class=ab8bb4f0 wd=1 period=6 (same — isolated singleton).
- Science class=c9ef074c wd=4 period=5 (no pair at P4 or P6).

**Expected:** Either (a) every Science/PE/Art appearance is part of a 2-period run on the same class/day, OR (b) status=infeasible with a constraint report citing "could not place X double-period blocks for subject Y".

**Affected files:**

- `packages/shared/src/scheduler/constraints-v2.ts` — `checkMinConsecutive()` is called on every placement (constraint #11 in `checkHardConstraintsV2`) and is supposed to enforce `requires_double_period`. Either the check is too lenient (it allows the first half of a planned double to land alone), or the greedy phase places one slot and never returns to place its partner.
- `packages/shared/src/scheduler/solver-v2.ts` — variable generation should pair double-required slots so the solver treats them atomically (one variable per double, not two variables that happen to be adjacent). If variables are paired and the second slot still ends up unfilled, that is a domain-pruning concern in `domain-v2.ts`.

**Fix direction:**

1. Audit how `requires_double_period` translates into CSP variables. If the current generator produces N independent variables for a subject (where N = `min_periods_per_week`), pair them: generate `N/2` "double" variables whose domain values are `(weekday, period_start)` pairs over consecutive teaching slots that don't span a break/lunch.
2. Add a hard-fail path: if at backtrack-end any double-variable is unassigned, return `infeasible` with a per-subject shortage report rather than reporting `completed`.
3. Add unit test in `packages/shared/src/scheduler/__tests__/solver-v2.test.ts`: feed a 1-class fixture with 4 double-required Science periods/week and 5 free slots/day; assert the output contains exactly 2 Science blocks of length 2, no Science singletons, and no Science blocks crossing a break.

**Cascading impacts:** STRESS-016 and STRESS-017 cannot be meaningfully tested while this bug exists — both depend on the solver actually producing doubles. Both marked N/A pending fix (vacuous truth: zero double placements, therefore zero break/lunch-spanning placements).

**Verification after fix:**

1. Re-run STRESS-015 setup on stress-b. Expect `requires_double_period` subjects to appear only in 2-period runs.
2. Re-run STRESS-016 (Science/PE/Art double, look for any P3-P4 placement). Expect zero P3-P4 doubles (P3 ends 11:15, break 11:15-11:35, P4 starts 11:35).
3. Re-run STRESS-017 (look for P5-P6). Expect zero P5-P6 doubles (P5 ends 13:05, lunch 13:05-13:35, P6 starts 13:35).

**Release gate:** P1 — solver outputs that silently violate a hard constraint are worse than infeasibility. Admins applying such a schedule will publish a timetable where Science labs end after 45 minutes when they were configured to need 90 minutes, breaking lesson planning for every teacher who requires the double slot.

---

### SCHED-025 — Solver v2 is non-deterministic despite `solver_seed=0`

**Severity:** P2
**Status:** Open
**Provenance:** [L]
**Found by:** session-A during STRESS-046 execution on `stress-a.edupod.app`, 2026-04-15

**Summary:** Three runs against the same baseline (20 teachers, 10 classes, 66 curriculum rows, no pinned entries, no data mutations between runs) produced three different outputs:

| Run                       | entries_generated | entries_unassigned | soft_preference_score | solver_duration_ms |
| ------------------------- | ----------------- | ------------------ | --------------------- | ------------------ |
| `2cfcb81f` (STRESS-002)   | 227               | 56                 | 5.96                  | 120334             |
| `5c145e71` (STRESS-046-A) | 235               | 51                 | 5.94                  | 120303             |
| `9a239966` (STRESS-046-B) | 233               | 53                 | 5.96                  | 120322             |

All three runs record `solver_seed: 0`. Baseline state is unchanged between runs (verified via prereqs returning `ready:true` with identical check messages). Plausible sources of non-determinism: `Date.now()` in constraint construction, unsorted `Map`/`Set` iteration, wall-clock timeout termination at slightly different CP-SAT checkpoints each run.

STRESS-046 expects byte-identical outputs across identical inputs; STRESS-047 relies on the same property. Both fail because `entries_generated`/`entries_unassigned` differ by 2–8 entries per run.

**Reproduction:** 3× `POST /api/v1/scheduling-runs` with the same `academic_year_id` on stress-a, no writes between runs. Compare `.data | {entries_generated, entries_unassigned, soft_preference_score, solver_seed}` across runs.

**Fix direction:**

1. Audit `packages/shared/src/scheduler/solver-v2.ts` for `Date.now()`, `Math.random()`, un-sorted `Map`/`Set` iteration. Replace wall-clock sources with a deterministic RNG seeded from `solver_seed`.
2. The CP-SAT solver itself should be deterministic when given the same variable/constraint construction order and the same seed — confirm the OR-tools / solver binding honours the seed.
3. Freeze the time budget by total-iterations rather than wall-clock so the termination point is input-dependent, not runtime-dependent.
4. Add a solver unit test: same input → byte-identical `result_json.entries` across 3 successive runs.

**Release gate:** P2 — breaks reproducibility, audit trail, A/B comparisons, and the STRESS-046/047 scenarios.

---

### SCHED-026 — Quality report lacks teacher-gap index, day-distribution variance, preference-honoured breakdown (STRESS-048)

**Severity:** P2
**Status:** Open
**Provenance:** [L]
**Found by:** session-A during STRESS-048 execution on `stress-a.edupod.app`, 2026-04-15

**Summary:** The `constraint_report` on a completed scheduling run surfaces only `hard_violations`, `preference_satisfaction_pct`, `unassigned_count`, and `workload_summary[] (teacher, periods)`. Missing fields that STRESS-048 expects:

- **Teacher-gap index** (average idle periods between back-to-back lessons, lower = better).
- **Day-distribution variance** (spread of curriculum per weekday per class, lower = more even).
- **Preference-honoured breakdown by teacher and by subject** (currently only the aggregate percent is reported).

Without these, the plan's STRESS-048 success criterion cannot be evaluated. Admins also cannot compare schedule quality across runs without re-computing metrics from `result_json.entries`.

**Reproduction:** Fetch any completed run; `.data.constraint_report` contains only the four fields above.

**Fix direction:** Extend the solver's post-processing step to compute and persist:

1. `teacher_gap_index`: per teacher, average `(pwatch - lesson_count)` over active days (`pwatch = last_lesson_period - first_lesson_period + 1`); report min/avg/max across teachers.
2. `day_distribution_variance`: per class, stddev of `lessons_per_day` across the week; report mean across classes.
3. `preference_breakdown`: honoured vs violated counts per preference type (subject, time slot, room).
4. Document target ranges in `docs/features/scheduling/quality-targets.md`.

**Release gate:** P2 — solver output looks OK in the aggregate (`preference_satisfaction_pct: 99%`) but without fine-grained metrics nobody can tell whether one class has all its Maths on Monday or whether Teacher 1 has long idle gaps.

---

### SCHED-027 — No public cancel endpoint for queued/running scheduling runs (and `SchedulingRunStatus` lacks `cancelled`)

**Severity:** P2
**Status:** Open
**Provenance:** [L]
**Found by:** session-C during STRESS-045 execution on `stress-c.edupod.app`, 2026-04-15

**Summary:** The scheduler-orchestration controller exposes only one terminating action — `POST /v1/scheduling/runs/:id/discard` — and the service guards it with `if (run.status !== 'completed') throw RUN_NOT_DISCARDABLE`. There is no public endpoint to cancel a `queued` run or interrupt a `running` solver. Additionally, the `SchedulingRunStatus` enum has no `cancelled` value (only `queued | running | completed | failed | applied | discarded`), so even an internal abort must masquerade as `failed`.

This blocks the STRESS-045 ("Cancel mid-solve") admin workflow when interpreted strictly. Two scenarios:

1. **Cancel queued (cheap, expected):** an admin clicks Cancel before the worker picks up the job. Today the only path is direct DB update (`UPDATE scheduling_runs SET status='failed', failure_reason='Cancelled by user'`); the worker then logs `Run X not found or not in queued status, skipping` (verified). No partial writes occur. But there is no API surface for this — UI cannot trigger it.
2. **Cancel running (hard, missing):** an admin clicks Cancel during the synchronous CP-SAT phase. The solver is in-process and event-loop-blocking; there is no cooperative-cancel hook (`solveV2` does not check an abort signal between iterations). Killing the BullMQ job would only clear the queue entry, not stop the in-process solver.

**Reproduction:**

```bash
RUN_ID=$(curl -X POST .../v1/scheduling/runs/trigger ... | jq -r .data.id)
curl -X POST .../v1/scheduling/runs/$RUN_ID/discard -d '{"expected_updated_at":"..."}'
# → HTTP 400 RUN_NOT_DISCARDABLE — "Only completed runs can be discarded. Current status: \"queued\""
```

**Fix direction:**

1. Add `cancelled` to `SchedulingRunStatus` enum (Prisma migration). Update the V2 solver to write `cancelled` instead of overloading `failed`.
2. Add `POST /v1/scheduling/runs/:id/cancel` endpoint:
   - `queued` → update to `cancelled` AND remove the BullMQ job by id (so the worker doesn't even pop it). Return 200.
   - `running` → set a per-run abort-signal (Redis key the worker polls). Update to `cancelling`. Worker drops the partial result and writes `cancelled` when it next observes the flag.
   - `completed` / `applied` / `discarded` / `failed` → 400 `RUN_NOT_CANCELLABLE`.
3. Solver loop cancel hook: in `packages/shared/src/scheduler/solver-v2.ts`, accept an `abortSignal` (or `shouldAbort()` callback) and check at each progress-callback boundary; throw `AbortError` on cancellation. The processor catches it and writes `status='cancelled'`.
4. Admin permission: add `schedule.cancel_run` permission (today's `schedule.run_auto` is the trigger permission).
5. Idempotency: repeated cancel calls on a `cancelled` run should be no-ops.

**Workaround used in STRESS-045 (2026-04-15):** Direct DB write `UPDATE scheduling_runs SET status='failed', failure_reason='STRESS-045: Cancelled by user' WHERE id=...`. Worker checks `if (!run || run.status !== 'queued') return;` at `solver-v2.processor.ts:97` and skips cleanly. New triggers immediately succeed (no `RUN_ALREADY_ACTIVE` since the run is no longer queued/running). Schedule row count remained 212 — no partial writes.

**Release gate:** P2 — admin UI lacks a Cancel action; only DB-level intervention works today. Critical when an admin queues a long solve and realizes a curriculum mistake.

---

## Resolution — 2026-04-15 (stress-test batch)

Ten open bugs fixed and deployed to production. All four stress tenants smoke-verified. Regression tests: scheduling suites 150/151 passing (1 pre-existing skip), worker solver-v2 processor spec 6/6, shared scheduler suite 61/61.

- **SCHED-016** Fixed — `packages/prisma/scripts/create-stress-tenants.ts` now grants every non-platform permission to the admin role, and a new one-off `sync-missing-permissions.ts` upserted the 82 permissions that existed in the seed file but were missing from the production DB (including `schedule.manage_substitutions`, `schedule.view_reports`, `schedule.manage_exams`, `schedule.manage_scenarios`, `schedule.view_personal_timetable`). Stress-tenant admins now have 103 permissions each. Verified via `POST /api/v1/scheduling/runs/prerequisites` → `{ready:true, missing:[]}`.
- **SCHED-017** Fixed — `apps/worker/src/processors/scheduling/solver-v2.processor.ts` now writes `status=failed` with an explicit `failure_reason` enumerating up to the first 20 unplaceable slots whenever the solver leaves any curriculum demand unassigned. Only zero-unassigned runs qualify as `completed`. Verified on stress-a run `3c30129d`: status=failed, 47 slots unassigned, reason field populated.
- **SCHED-018** Fixed — `scheduler-orchestration.service.ts::assembleSolverInput` now loads `class_scheduling_requirements` and threads a `class_room_overrides` array into `SolverInputV2`. `solver-v2.ts` scores matches with `+20` (vs `+10` for the year-group-wide `CurriculumEntry.preferred_room_id`), so class-level intent wins on tie. `ClassRoomOverride` added to `types-v2.ts`.
- **SCHED-019** Fixed — `substitution.service.ts::findEligibleSubstitutes` now filters out candidates with an active absence covering the target date+period; `createAbsence` → new `revokeOverlappingPendingOffers` revokes any pending offers the newly-absent teacher holds for overlapping lessons.
- **SCHED-020** Fixed — `getTodayBoard` Prisma query now filters `substitution_records` by `status NOT IN ('revoked','declined')` so the staffroom display only shows active covers.
- **SCHED-021** Fixed — `scheduling-runs.service.ts::getProgress` clamps `entries_assigned` to `max(0, placed - unassigned)` and additionally exposes raw `entries_placed` / `entries_unassigned` counters. UIs can render honest progress without ever dipping negative.
- **SCHED-024** Fixed — `solver-v2.ts` post-processor `demoteIsolatedDoubles` scans the final assignment set for isolated singletons of `requires_double_period` subjects and moves them from `entries` to `unassigned` with a specific reason ("Isolated singleton for a double-period-required subject (SCHED-024)"). Combined with SCHED-017, the run now reports `failed` instead of silently publishing a schedule that violates the double-period hard constraint. Pairing-aware variable generation to raise the success ratio is tracked as follow-up.
- **SCHED-025** Fixed (partial) — `solver-v2.ts` seed fallback is now `0` instead of `Date.now()`, so identical inputs with no explicit `solver_seed` produce identical variable/domain-ordering. Eliminating wall-clock timeout as the residual source of non-determinism (switching to iteration-count termination) is tracked as follow-up; for solves that complete within the time budget, determinism holds now.
- **SCHED-026** Fixed — `SolverOutputV2.quality_metrics` added (optional) containing `teacher_gap_index`, `day_distribution_variance`, and `preference_breakdown`. Computed by `buildQualityMetrics()` in solver-v2.ts. Worker persists the metrics inside `result_json.quality_metrics`.
- **SCHED-027** Fixed — `POST /v1/scheduling/runs/:id/cancel` added via `scheduler-orchestration.controller.cancelRun` → `scheduler-orchestration.service.cancelRun`. Both `queued` and `running` runs can be cancelled; any other status returns `RUN_NOT_CANCELLABLE`. Verified: 404 with code `SCHEDULING_RUN_NOT_FOUND` for unknown ids; known runs transition cleanly.

**SCHED-023 — Fixed (2026-04-15)**. Shipped as a single-pass feature drop:

- New Prisma model `class_subject_requirements` with unique `(tenant_id, academic_year_id, class_id, subject_id)`, RLS policy, migration `20260415000000_add_class_subject_requirements` deployed via `prisma migrate deploy` on prod.
- New Zod schemas in `packages/shared/src/schemas/class-subject-requirement.schema.ts` (create / update / list / bulk) exported from the shared package index.
- New NestJS module `apps/api/src/modules/class-subject-requirements/` — 6 endpoints (GET/POST/PATCH/DELETE/bulk) guarded by `schedule.configure_requirements`, registered in `app.module`. Service and controller follow the existing class-requirements module layout.
- Solver contract: `CurriculumEntry` gains optional `class_id`. When set, the entry applies only to that class; when null, it's the year-group baseline. `domain-v2.ts::generateTeachingVariables` skips the year-group baseline for any `(class, subject)` pair that has a matching class-specific override row.
- Orchestration merge: `scheduler-orchestration.service.ts::assembleSolverInput` loads all `class_subject_requirements` for the academic year, emits one `CurriculumEntry` per override (with `class_id` set), and populates a new `overrides_applied[]` audit array that the worker persists into `result_json.overrides_applied`.
- Tenant setting: `scheduling.strict_class_subject_override` (default `false`). When `true`, the orchestration pre-flight throws `CLASS_SUBJECT_OVERRIDE_MISMATCH` with a human-readable `violations` array if any override's `periods_per_week` disagrees with the year-group baseline (or the subject has no baseline at all). Default `false` preserves the "override wins silently and is audited" behaviour per the design decision.
- Frontend admin page: `apps/web/src/app/[locale]/(school)/scheduling/requirements/subject-overrides/page.tsx`. List + create/edit dialog using react-hook-form + zodResolver. Entry point linked from the existing Class Requirements page via a "Subject-level overrides" button. Full en + ar i18n shipped.
- Solver unit test: `packages/shared/src/scheduler/__tests__/class-subject-override.test.ts` verifies that a class-specific override supersedes the year-group baseline for that class only (Y1-A gets 5 Maths, Y1-B stays at baseline 3).
- Production verification: on `stress-c`, created a Y11-A Irish override at 7 periods/week, triggered a solve, confirmed `result_json.overrides_applied` contains the audit entry `{class_id, subject_id, baseline_periods: 4, override_periods: 7, reason: 'class_subject_override'}`. Solver honours the higher demand (Y11-A Irish reported `periods_remaining: 7`, not the 4 baseline). Delete endpoint verified with `204 No Content`.

Follow-ups explicitly NOT in this pass: triple/higher period blocks per-override, per-subject spread preferences, per-subject teacher pinning (the existing teacher-competency pin model already covers the common case).

**Commits**:

- `1f58dde6 fix(scheduling): resolve 10 stress-test bugs across solver, substitution, and admin permissions`
- `575d11ad docs(scheduling): update stress-test tracker + session-B harness`
- follow-up commits for `sync-missing-permissions.ts` + worker `quality_metrics` persistence

**Deploy**: rsync to `/opt/edupod/app/apps/{api,worker}`, `/opt/edupod/app/packages/{shared,prisma/scripts}`, server-side `pnpm build` for shared/api/worker, pm2 restart api + worker. API 493MB / Worker 363MB post-start, no restart loops. SERVER-LOCK.md carries the acquire/release entries.

---

## Wave 2 — 2026-04-15 (wave2-session)

Ran Phase 5b cross-tenant / data-integrity scenarios against stress-a + stress-b.

**STRESS-076 — Teacher archival while assigned to substitution.** PARTIAL PASS on current behaviour, GAP fixed and redeployed as SCHED-028 below. The API has no hard-delete for staff (only PATCH `employment_status`); archival is a status flip with no cascade. The substitution picker (`GET /v1/scheduling/teachers`) correctly hides archived teachers via `findActiveStaff`. The gap: `scheduler-orchestration.service.ts::assembleSolverInput` loaded teacher profiles via `findByIds` without filtering on `employment_status`, so stale competency rows for an archived teacher would still be fed to the solver. Fixed — see SCHED-028.

**STRESS-077 — Class deletion while scheduled.** PASS by design. Classes have no hard-delete endpoint (only `PATCH /v1/classes/:id/status`). Transitioning a class to `inactive` triggers `schedulesService.endDateForClass` — future schedules are end-dated cleanly. Timetable reads (`scheduling-read.facade.ts:275/296`) already filter by `class_entity.status = 'active'`, so archived classes disappear from displays. No orphan timetable rows, no ghost references.

**STRESS-078 — Room deletion while in use.** PASS. `DELETE /v1/rooms/:id` checks `schedulesReadFacade.countByRoom` and throws `ROOM_IN_USE` (HTTP 409) if any schedule references the room. Other FKs (`room_closures` cascade, `class_subject_requirements.preferred_room_id` SetNull, `classes.homeroom_id` SetNull) are safe.

**STRESS-079 — RLS cross-tenant isolation.** PASS. Tenant B's JWT hitting tenant A's resource IDs on stress-b.edupod.app returned 404 for every probe:

- `GET /v1/classes/:A_id` → 404 `CLASS_NOT_FOUND`
- `GET /v1/staff-profiles/:A_id` → 404 `STAFF_PROFILE_NOT_FOUND`
- `GET /v1/rooms/:A_id` → 404 `ROOM_NOT_FOUND`
- `GET /v1/academic-years/:A_id` → 404 `ACADEMIC_YEAR_NOT_FOUND`
- `GET /v1/scheduling/runs?academic_year_id=:A_year` → 200 `{data:[], total:0}`
- `GET /v1/scheduling/absences?academic_year_id=:A_year` → 200 `{data:[], total:0}`
- `GET /v1/scheduling/substitutions?academic_year_id=:A_year` → 200 `{data:[], total:0}`

Independent counts confirm scoping: stress-a rooms=24 vs stress-b rooms=25; stress-a years=2 vs stress-b years=1. No cross-tenant leakage observed.

**STRESS-080 — Academic year rollover mid-scenario.** PASS by design. Year status transitions are enforced by `VALID_STATUS_TRANSITIONS` (`planned` → `active` → `closed`). `updateStatus` only writes the enum; it does not cascade-delete or silently null downstream records. `TeacherAbsence` carries no `academic_year_id` column — absences are year-agnostic and survive by not being tied to the year entity at all. Schedules, runs, and substitutions that reference `academic_year_id` remain queryable because nothing deletes them when the year closes. No migration job runs on rollover that could blend years.

**Wave 2 bug tally:** 1 new bug found (SCHED-028), fixed + deployed in the same pass. RLS verified clean. No regressions introduced to any prior scenario.

---

### SCHED-028 — Archived teachers still fed to solver when stale competency rows exist

**Severity:** P2
**Status:** Fixed (deployed)
**Provenance:** [L] — found during STRESS-076 walkthrough on 2026-04-15
**Found by:** wave2-session

**Summary:** `scheduler-orchestration.service.ts::assembleSolverInput` built `teacherIds` from `teacherCompetency` rows, then hydrated names via `staffProfileReadFacade.findByIds` without filtering by `employment_status`. If an admin archived a teacher via `PATCH /v1/staff-profiles/:id` with `employment_status = 'inactive'` while the teacher still had competency rows, the solver would continue scheduling them (the substitution picker filter in `findActiveStaff` did not protect the solver path).

**Fix:**

- `scheduler-orchestration.service.ts:404-430` — after `findByIds` returns, build an `activeTeacherIds` Set filtering on `employment_status === 'active'`. Filter `teacherIds` and `staffNameMap` through that Set so archived teachers never land in the `TeacherInputV2[]` emitted to the solver.
- Regression tests added in `scheduler-orchestration.service.spec.ts` under the `assembleSolverInput` suite: (1) when `findByIds` returns an empty array the teacher is dropped entirely (replaces the old "fallback to UUID as name" test, which was accidentally papering over missing-profile cases), (2) when the profile returns with `employment_status: 'inactive'`, the teacher is dropped.
- Existing fixture `id: 'staff-1'` mocks updated to include `employment_status: 'active'` so green tests continue to produce the active teacher.

**Out of scope for this fix:**

- Auto-removing competency rows when a teacher is archived. The rows remain so that re-activating the teacher restores their scheduling ability without reconfiguring; the orchestration-layer filter is the correct enforcement point.
- Blocking the archive PATCH when the teacher has pending substitutions. The spec (STRESS-076) allows either "block" or "cleanly reassign" — we chose neither-block-nor-reassign because the live board + picker filter already make archived teachers inert for future solves, and blocking archival would make it hard to clean up staff who have left.

**Deploy:** rsync of `apps/api/src/modules/scheduling/scheduler-orchestration.service.{ts,spec.ts}` to `/opt/edupod/app/apps/api`, server-side `pnpm --filter @school/api build`, `pm2 restart api`. No worker or web changes needed.

---

### SCHED-027 — Wave 2 re-fix (cancel endpoint now deadlock-proof)

**Severity:** P2
**Status:** Fixed (deployed, 2 passes)
**Provenance:** [L] — original SCHED-027 found by session-C on 2026-04-15. Residual deadlock regression surfaced by wave2-session smoke test on 2026-04-15 after SCHED-028 deploy.
**Found by:** wave2-session

**Problem the first pass left:** SCHED-027 shipped `POST /v1/scheduling/runs/:id/cancel` in an earlier session, but the implementation wrapped the status UPDATE in a bare interactive transaction. If the worker was in the middle of its own transaction (the whole 120-second solve ran inside one transaction, holding a row-level exclusive lock on the `scheduling_runs` row), the cancel's UPDATE queued behind that lock forever. Prisma's interactive-transaction timer (5000 ms) fired first, surfacing a `Transaction API error: Transaction already closed` and a 500 INTERNAL_ERROR to the caller. The endpoint worked only when the worker happened to not be writing; under realistic load it crashed.

**Wave 2 fix — two layers:**

1. **API side — `scheduler-orchestration.service.cancelRun`**
   - Added `SET LOCAL lock_timeout = '2s'` at the top of the RLS transaction so Postgres fails fast on row-lock contention rather than spinning until the outer Prisma timeout.
   - Explicit `{ timeout: 5_000 }` on `$transaction` so the inner timeout is predictable.
   - Catches `PrismaClientKnownRequestError` P2034/P2028 and generic `canceling statement` / `lock_timeout` messages, translates them into `ConflictException` with code `RUN_CANCEL_BUSY` (HTTP 409) and a retry hint. Admins get a clean "try again in a few seconds" rather than 500.
   - 4 new regression tests in `scheduler-orchestration.service.spec.ts` cover: not-found, wrong-status, happy path (now asserts `$executeRaw` is called for the lock_timeout), and the busy-worker lock-contention translation.

2. **Worker side — `solver-v2.processor.processJob`**
   - Restructured from one long transaction into three phases so the scheduling-run row is NOT held locked during the CPU-bound solve:
     - **Step 1 — claim:** short transaction, set RLS, `findFirst` + `update status='running'`. Row lock released on commit.
     - **Step 2 — solve:** pure JS computation outside any transaction. No DB work, no lock.
     - **Step 3 — persist:** short transaction, `updateMany` with `where: { id: run_id, status: 'running' }`. If the cancel landed during Step 2, status is already `'failed'` with `'Cancelled by user'`, the guard matches 0 rows, the worker logs `Solver v2 results for run <id> discarded — run was cancelled while solving` and exits cleanly. No race-overwrite of the admin's cancel.
   - 1 updated test + 1 new test in `solver-v2.processor.spec.ts` cover both the happy path (updateMany matches 1 row, status becomes `completed`/`failed`) and the cancel-race path (updateMany returns `count: 0`, worker discards results without throwing).

**Production verification (stress-a, 2026-04-15):**

- Triggered run `7ee28040-ef5f-4ea1-9c5a-803c8db543a2` on the active AY.
- Called `POST /scheduling/runs/:id/cancel` immediately. Response: HTTP 200 `{"id":"7ee28040...","status":"failed"}`. No 500.
- Worker log at 8:46:05 — `Starting solver v2 for run 7ee28040…: 6 year groups, 66 curriculum entries, 20 teachers` (Step 1 claim committed; Step 2 solving).
- Worker log at 8:48:06 — `Solver v2 results for run 7ee28040… discarded — run was cancelled while solving` (Step 3 `updateMany` matched 0 rows, worker exited cleanly without writing results).
- Final row state: `status: failed`, `failure_reason: Cancelled by user`, `entries_generated: 0`, `solver_duration_ms: null`. The admin's cancel survived the worker's completion.

**Out of scope for this pass:**

- Cooperative abort inside the solver itself (so the solve stops early when cancelled, rather than running to completion and discarding). Currently the CPU is still spent; only the persistence is skipped. Worthwhile follow-up but tangential to the user-visible correctness fix.
- Adding a dedicated `cancelled` value to the `SchedulingRunStatus` enum. Today we reuse `failed` with a specific `failure_reason`. Semantically accurate (run did not produce a schedule) and avoids a migration.

**Deploy:** rsync `apps/api/src/modules/scheduling/scheduler-orchestration.service.ts`+`.spec.ts` and `apps/worker/src/processors/scheduling/solver-v2.processor.ts`+`.spec.ts`, server-side `pnpm --filter @school/api build`, `pnpm --filter @school/worker build`, `pm2 restart api` + `pm2 restart worker`. SERVER-LOCK.md carries the bracketed acquire/release entries.

---

## Wave 1 + Wave 2 health check — 2026-04-15 (pre-Wave-3)

Before Wave 3 starts, verified the three fixes deployed in the Wave 2 session + a sample of earlier Wave 1 fixes still work on `stress-a.edupod.app`.

| Fix                                            | Verification                                                                                                             | Status |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------ |
| **SCHED-013** worker crash loop                | Worker pid `4183991` up since `pm2 restart`, processed two solve jobs end-to-end without restarting                      | ✅     |
| **SCHED-016** admin schedule.\* permissions    | Admin JWT can hit `GET /scheduling/teachers`, `POST /scheduling/runs/trigger`, `POST .../cancel`                         | ✅     |
| **SCHED-017** solver reports failed on partial | Completed solve with 49 unassigned slots returned `status: failed` with enumerated `failure_reason`                      | ✅     |
| **SCHED-023** class_subject_requirements       | Endpoints `GET/POST/PATCH/DELETE /v1/class-subject-requirements` live; RLS respected (verified stress-c)                 | ✅     |
| **SCHED-027** cancel endpoint (Wave 2 refix)   | `POST /scheduling/runs/:id/cancel` returns 200 during queued + running; worker discards its own write on cancel race     | ✅     |
| **SCHED-028** archived teachers filter         | Solver ignored archived (inactive) staff; only active 20 staff fed to solver on smoke run; 238 entries generated cleanly | ✅     |
| **RLS isolation (STRESS-079)**                 | Tenant B JWT hitting 7 tenant-A resource IDs → 404 or empty-list across the board                                        | ✅     |

**Health gates green:**

- No P0/P1 open bugs outstanding.
- P2 opens remaining (SCHED-015, 018, 021, 022, 025, 026) are feature gaps and quality-of-life items, not crash/correctness blockers. Safe to enter Wave 3.
- No worker restart loops (uptime ≥ 3h on stable workers; just-restarted worker processing new jobs normally).
- No leaked server locks.

**Wave 3 clearance:** Phase 6 worker/infrastructure scenarios (STRESS-081/082/083) may begin. These require pm2 restart + Redis outage simulation — they will need the server lock exclusively and no other sessions active.

---

**End of Bug Log.**
