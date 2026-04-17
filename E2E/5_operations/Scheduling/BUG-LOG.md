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
**Status:** Fixed (Stage 7 CP-SAT cutover; closed Stage 9 Session 2c 2026-04-15)
**Provenance:** [L]
**Found by:** session-A during STRESS-002 execution on `stress-a.edupod.app`, 2026-04-15

**Closure note (Stage 9 Session 2c, 2026-04-15):** CP-SAT migration (Stage 7 atomic cutover, commit 8795db44) replaced the legacy Solver v2 `status=completed` unconditional write. The Python sidecar + orchestration now surface partial solves as structured output with `cp_sat_status`, per-lesson `unassigned_reason` (e.g. "No competent teacher for class=X subject=Y"), and `hard_constraint_violations` split from soft. `entries_generated + entries_unassigned = curriculum_demand` invariant holds across Wave 4 confirmatory runs. Evidence: stress-a `a8cbac17-32f1-492d-a838-cb2e9825cfad` (320 demand, 319 placed, 1 unassigned, status=completed pre-Wave-4-fixes — all structured); post-Wave-4-fixes stress-a `e6a57dc8…` (320/320). NHQS audit ran `d0a62bf9…` surfaced 8 structural shortage reasons matching the expected shape.

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
**Status:** Fixed (commit 51d65ef8, deployed 2026-04-15 19:25 UTC; closed Stage 9 Session 2c)
**Provenance:** [L]
**Found by:** session-C during STRESS-030 execution on `stress-c.edupod.app`, 2026-04-15

**Closure note (Stage 9 Session 2c, 2026-04-15):** Orchestration was threading `ClassRoomOverride` rows (commit be16b3c5 / SCHED-023) with `subject_id=null` for class-wildcard entries, but the Python sidecar's lookup in `apps/solver-py/src/solver_py/solver/solve.py` keyed strictly on `(class_id, lesson.subject_id)`, missing the wildcard. Fix: `overrides.get((lesson.class_id, lesson.subject_id)) or overrides.get((lesson.class_id, None)) or lesson.preferred_room_id`. Test: `apps/solver-py/tests/test_solve_class_room_override.py::test_class_wildcard_override_is_honoured`. Wave-4-strict verification run: stress-c `fb603ebb-8387-4c32-8bd0-b6214c836e04` — Y11-A has 32/32 Science lessons in LAB02 after a `class_scheduling_requirement` with `preferred_room_id=LAB02` was created. STRESS-030 flipped ❌ → ✅ PASS.

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
**Status:** Fixed (symptom 1); symptom 2 tracked as P3 follow-up (closed Stage 9 Session 2c 2026-04-15)
**Provenance:** [L]
**Found by:** session-D during STRESS-057 execution on `stress-d.edupod.app`, 2026-04-15

**Closure note (Stage 9 Session 2c, 2026-04-15):**

- **Symptom 1 (candidate filter)** CLOSED. `substitution.service.ts:362-398` (`findEligibleSubstitutes`) now loads all same-day `teacher_absence` rows where `cancelled_at IS NULL` and filters any candidate whose absence covers the target period (full-day OR `period_from <= target <= period_to`). Verified live on stress-b 2026-04-15: baseline T2 P3 candidates `[T11..T20]`; after creating absence for T15 Wed P3 (`90791f5f-7375-4cdb-be24-077e5890b2f0`), T15 was removed from T2's suggestion list. Second verification: T11 (currently covering T2's P3) self-reported absence same period (`ce136b7b-bb14-4251-b634-aa3ee9f3d834`) → T11 removed from new candidate queries. STRESS-057 PASS, STRESS-060 PASS.
- **Symptom 2 (auto-revoke existing pending offers when recipient logs absence)** NOT closed here. No hook currently fires when a new absence is created for a staff member who has pending `substitutionOffer.status='pending'` rows. Flagged as remaining P3 follow-up — low urgency because (a) cascade round 2 picks new candidates if round 1 offers expire/decline, so a stale offer from an absent candidate resolves naturally on the next round, (b) existing substitution_records (already assigned) are not auto-revoked either; admins revoke manually via cancel/reassign. Consider adding `revokeOffersForAbsentCandidate(tenantId, staffId, date, periodFrom, periodTo)` called from `reportAbsence`/`selfReportAbsence` after the row is persisted.

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
**Status:** Fixed (commit 51d65ef8, deployed 2026-04-15 19:25 UTC; closed Stage 9 Session 2c)
**Provenance:** [L]
**Found by:** session-C during STRESS-032 execution on `stress-c.edupod.app`, 2026-04-15

**Closure note (Stage 9 Session 2c, 2026-04-15):** New migration `20260415200000_add_class_year_group_links/` introduces a `class_year_group_links` junction table with unique `(tenant_id, class_id, year_group_id)` + cascade FKs + RLS policy. Prisma schema: `ClassYearGroupLink` model + inverse relations on `Class` / `YearGroup` / `Tenant`. Zod `createClassSchema` + `updateClassSchema` in `packages/shared/src/schemas/class.schema.ts` accept optional `additional_year_group_ids: z.array(z.string().uuid()).optional()`, with `.refine()` that rejects duplicating the primary `year_group_id`. `ClassesService.create` persists via `db.classYearGroupLink.createMany({ skipDuplicates: true })`; `update` uses delete-then-rewrite when the caller sends a new array. Scheduling semantics unchanged: primary `year_group_id` drives period-grid selection; cross-year student conflicts continue to route via `class_enrolments → solver student_overlaps`. Verified on stress-c: created test class `e5e4b59f…` "Advanced Music Y10-Y11" with primary=Y10 and `additional_year_group_ids=[Y11]`, junction row persisted in DB (SQL probe via `DATABASE_MIGRATE_URL`). Test class deleted post-verify. STRESS-032 flipped ❌ → ✅ PASS.

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
**Status:** Fixed (commit be16b3c5, deployed 2026-04-15 04:15 UTC; verified Stage 9 Session 2b-strict; closed Stage 9 Session 2c)
**Provenance:** [L]
**Found by:** session-C during STRESS-033 execution on `stress-c.edupod.app`, 2026-04-15

**Closure note (Stage 9 Session 2c, 2026-04-15):** `class_subject_requirements` table landed (module + migration + frontend) in commit be16b3c5 with `(tenant_id, class_id, subject_id, academic_year_id)` unique key + per-row `periods_per_week`, room hints, and optional flags. Orchestration in `scheduler-orchestration.service.ts` merges class-subject overrides over year-group curriculum baseline before sending to sidecar; the override lookup also feeds the room-hint path closed in SCHED-018. Wave 4 strict verification: stress-c run `09ed02b5-a73f-4db5-a543-4f342da85e28` — created a Y10-A Art override of 6 periods/week (baseline Art=2), solver placed exactly 6 Art entries for Y10-A and the other 10 classes kept the baseline 2 each, 356 placed / 0 unassigned. Test class_subject_requirement row cleaned up post-verify (HTTP 204). STRESS-033 flipped ❌ → ✅ PASS.

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
**Status:** Fixed (Stage 7 CP-SAT cutover; closed Stage 9 Session 2c 2026-04-15)
**Provenance:** [L]
**Found by:** session-B during STRESS-015 execution on `stress-b.edupod.app`, 2026-04-15

**Closure note (Stage 9 Session 2c, 2026-04-15):** CP-SAT migration replaced the legacy `checkMinConsecutive` variable generation that admitted partial doubles. The sidecar's `model.py` (~lines 160-200) implements `double_pair_index` anchor + follower pairs: the follower's slot is forced to match the anchor (`period_order[follower] = period_order[anchor] + 1`) within the same contiguous teaching chunk, and the follower's teacher/class/room variables equal the anchor's. Break cells break the chunk so "anchor spans break into follower" is structurally impossible. Infeasible double-period demand now returns `cp_sat_status=infeasible` with the specific shortage reason rather than silently partial. Test: `apps/solver-py/tests/test_solve_double_period.py` (part of the 40-test solver-py suite, all passing as of commit 51d65ef8). STRESS-015/016/017 dispositions: Wave 4 ⚪ N/A because baseline seeds don't set `requires_double_period=true` (would need a custom seed); structural correctness verified via the pytest fixtures.

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
**Status:** Fixed (Stage 7 CP-SAT cutover; closed Stage 9 Session 2c 2026-04-15)
**Provenance:** [L]
**Found by:** session-A during STRESS-046 execution on `stress-a.edupod.app`, 2026-04-15

**Closure note (Stage 9 Session 2c, 2026-04-15):** CP-SAT migration replaced the legacy wall-clock-dependent JS solver with a single-worker OR-tools CP-SAT binding whose search ordering is deterministic given identical input. Sidecar (`apps/solver-py/src/solver_py/solver/solve.py`) pins `num_workers=1` + propagates `random_seed=solver_seed`. STRESS-086 verification (Session 1): two back-to-back solves on stress-a produced byte-identical `result_json.entries` — SHA-256 `7637fe4a…` MATCH across runs `85cee8c6…` and `7c3f3905…`. Re-verified in the Wave-4-fixes commit (51d65ef8) regression sweep — two fresh stress-a solves produced the same canonical-sorted-entry hash. STRESS-046 PASS.

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
**Status:** Fixed (Stage 7 CP-SAT cutover; closed Stage 9 Session 2c 2026-04-15)
**Provenance:** [L]
**Found by:** session-A during STRESS-048 execution on `stress-a.edupod.app`, 2026-04-15

**Closure note (Stage 9 Session 2c, 2026-04-15):** The sidecar's post-processing step computes and returns `quality_metrics` with `teacher_gap_index` (per-teacher avg idle periods between back-to-back lessons), `day_distribution_variance` (per-class stddev of `lessons_per_day`), and `preference_breakdown` (honoured vs violated counts per preference type). Orchestration layer persists these on `scheduling_runs.quality_metrics` JSONB. Every Wave 4 confirmatory run exposed populated metrics — e.g. stress-a `a8cbac17…` and post-fix `e6a57dc8…` both have non-null `teacher_gap_index`, `day_distribution_variance`, `preference_breakdown`. STRESS-048 PASS.

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

## Wave 3 — 2026-04-15 (wave3-session)

Ran Phase 6 worker/infrastructure scenarios (STRESS-081 BullMQ worker crash mid-solve, STRESS-082 Redis unavailable at enqueue, STRESS-083 solve timeout enforcement) solo on stress-a. Two new bugs found and fixed end-to-end in the same pass.

**STRESS-081 — BullMQ worker crash mid-solve.** FAIL on initial run → fixed as SCHED-029 → PASS on verification. Triggered run `524a08e1`, `pm2 restart worker` at ~13s into the solve. Old worker killed at progress 100/320. New worker came up clean but the BullMQ job stayed pinned in the `active` list (lock TTL=-2, but stall-detect never moved it in the 6+ minutes I waited). The DB row stayed `running`, and any subsequent trigger on the same AY hit `RUN_ALREADY_ACTIVE`. Root cause: the stale-reaper job existed but was never wired to a cron; and the processor's Step-1 guard treats `status='running'` on retry as a silent skip. After the fix, re-trigger `a57bb42e` reached terminal state within 1s of worker restart (startup reaper caught it), and the admin's next trigger accepted cleanly.

**STRESS-082 — Redis unavailable at enqueue.** FAIL on three progressively deeper pre-fix runs → fixed as SCHED-030 → PASS on the final run. Root cause is layered: the tenant-resolution middleware, the permission cache, and the BullMQ enqueue path all hard-depended on Redis, so a `docker stop edupod-redis-1` cascaded through every request as HTTP 500 (or, once the first two were fixed, a 60s hang that edge-504'd). After the layered fix, trigger returns HTTP 503 `QUEUE_UNAVAILABLE` in ~5s, the DB row is marked `failed` with a reason enumerating the enqueue timeout, no orphan `queued` row is left behind, and an immediate retrigger (after Redis comes back) succeeds cleanly.

**STRESS-083 — Solve timeout enforcement.** PASS on first run. `max_solver_duration_seconds: 10` → run `851789ad` ended with `solver_duration_ms: 10241` (10.2s, within the bound), `status: failed`, `entries_generated: 38`, `entries_unassigned: 109`, `failure_reason` enumerates the unplaced slots. Cross-check at 15s: run `cee0fab1` → `duration_ms: 15381`. Solver honours the bound proportionally and surfaces partial state honestly. No code change needed. Note: today the timeout path reuses `status: 'failed'` with a specific reason rather than a dedicated `'timeout'` enum value — that's a future-enum addition (per the SCHED-027 note), not a correctness issue.

**Wave 3 bug tally:** 2 new bugs found, both fixed + deployed + re-verified on stress-a in the same pass. No regressions to Wave 1 / Wave 2 fixes (full re-run of the affected Jest suites passes: API scheduler-orchestration + tenant-resolution + permission-cache (138 passed, 1 skipped pre-existing); Worker solver-v2 processor + scheduling-stale-reaper + cron-scheduler (22 passed)).

---

### SCHED-029 — Worker crash mid-solve leaves `scheduling_runs` stuck in `running`, locking the tenant out

**Severity:** P1
**Status:** Fixed (deployed)
**Provenance:** [L] — found during STRESS-081 walkthrough on 2026-04-15
**Found by:** wave3-session

**Summary:** When the worker process is killed (pm2 restart, OOM kill, crash) while a solve is mid-flight, the `scheduling_runs` row stays pinned in `status = 'running'` indefinitely. Admin can no longer trigger a new solve for the same academic year because `findActiveRun` still returns the stuck row, and `triggerSolverRun` responds with HTTP 409 `RUN_ALREADY_ACTIVE`. Evidence from stress-a run `524a08e1`: pm2 killed the worker at 09:24:17; six minutes later the DB row was still `running`, the BullMQ job was still in Redis's `active` list with the lock-TTL already expired to `-2`, and the stall-detect never moved it back to `wait`. Root causes were two architectural gaps working in combination:

1. `SchedulingStaleReaperJob` exists in `apps/worker/src/processors/scheduling-stale-reaper.processor.ts` with a sensible `reapStaleRuns()` routine, but `CronSchedulerService` never registers a repeatable job for it. So there was no ongoing cleanup path at all.
2. Even if BullMQ had delivered a stall-retry, the solver-v2 processor's Step-1 guard (`row.status !== 'queued'`) treats any non-queued status as a silent no-op and exits cleanly, which ALSO marks the BullMQ job complete — permanently losing the ability to recover.

Additionally, the processor's `findMany`/`update` on `scheduling_runs` (an RLS-forced table) was written to run outside a tenant context, so a cron-driven invocation of the reaper would have thrown `invalid input syntax for type uuid: ""` the first time it fired.

**Fix:**

- `apps/worker/src/processors/scheduling-stale-reaper.processor.ts` — rewrote the service:
  - Implements `OnApplicationBootstrap.onApplicationBootstrap()` to call a new `reapOnStartup()` method. On worker boot, any row in `queued` or `running` status that is older than a 30s grace window is marked `failed` with reason "Worker crashed or restarted mid-run — reaped on worker startup (SCHED-029)". Safe because no process is solving yet when the hook runs — any such row is leftover from a predecessor.
  - Kept the cron-driven `process(job)` entrypoint (`SCHEDULING_REAP_STALE_JOB`). Threshold tightened from `max_solver_duration_seconds * 2` to `max_solver_duration_seconds + 60s`, so an admin-observable ceiling is max-duration + ~2 minutes.
  - All reaper queries now iterate over active tenants (via `prisma.tenant.findMany` — `tenants` has no RLS) and run the per-tenant scheduling-run lookup inside its own `$transaction` with `set_config('app.current_tenant_id', tenantId, true)`, mirroring the `CrossTenantSystemJob` pattern used by the other cross-tenant workers. This is required because `scheduling_runs` has FORCE RLS.
  - Per-tenant failures are caught so one tenant's problem cannot stop the rest.
- `apps/worker/src/cron/cron-scheduler.service.ts` — injects `@InjectQueue(QUEUE_NAMES.SCHEDULING)` and registers `SCHEDULING_REAP_STALE_JOB` with `repeat: { pattern: '* * * * *' }`, `jobId: 'cron:scheduling:reap-stale-runs'`, `removeOnComplete: 10`, `removeOnFail: 50`.
- `apps/worker/src/cron/cron-scheduler.service.spec.ts` — constructor now takes a 16th `schedulingQueue` parameter; updated.
- `apps/worker/src/processors/scheduling/solver-v2.processor.ts` — Step-1 claim block now discriminates three cases: `queued` → claim normally; `running` → treat as a BullMQ crash-retry, mark `failed` with reason "Worker crashed mid-solve — BullMQ retry reaped the run (SCHED-029)" and exit; any other terminal status → skip. This is defence in depth for the startup reaper: if BullMQ does eventually deliver a stall-retry after a crash, the processor does the right thing rather than silently no-opping.

**Regression tests:** 8 in `scheduling-stale-reaper.processor.spec.ts` (cron path, per-tenant thresholds, startup reaper single-tenant + multi-tenant + fresh-row-safe + bootstrap hook + failure-swallow + per-tenant failure isolation) and 2 in `solver-v2.processor.spec.ts` (terminal-status skip, running-status crash-retry mark-failed).

**Production verification (stress-a, 2026-04-15):**

- Run `a57bb42e-e2df-4852-8120-002da2f2decf`: triggered at 09:46:17, `pm2 restart worker` at 09:46:35 while solver was at `100/320 (greedy)`. New worker came up at 09:47:11, startup reaper immediately marked the row `failed` with the SCHED-029 reason. `GET /scheduling/runs/<id>` returned `status: failed` at 09:47:20 (9s after restart).
- Immediate re-trigger succeeded — new run `817bb178` created with `status: queued` and no `RUN_ALREADY_ACTIVE` guard trip.
- Worker log at 09:46:02: `Registered repeatable cron: scheduling:reap-stale-runs (every minute)`.
- Worker log at 09:46:02: `Startup reaper complete: 0 run(s) reaped.` (clean-start case).

**Deploy:** rsync `apps/api/src/` + `apps/worker/src/` to `/opt/edupod/app/apps/{api,worker}`, server-side `pnpm --filter @school/api build` + `pnpm --filter @school/worker build`, `pm2 restart api worker`. `SERVER-LOCK.md` carries the bracketed acquire/release entries for the wave3-session.

---

### SCHED-030 — Redis outage cascades API-wide as HTTP 500 / 504, and trigger leaves an orphan `queued` row

**Severity:** P1
**Status:** Fixed (deployed)
**Provenance:** [L] — found during STRESS-082 walkthrough on 2026-04-15
**Found by:** wave3-session

**Summary:** When Redis becomes unavailable (outage, container restart, network blip), the API is not gracefully degraded — every request hard-fails at the first Redis-dependent layer. The scheduling trigger path has a specific compounding issue on top: the `scheduling_runs` row is created in Postgres BEFORE `BullMQ.queue.add` is called, so even once the middleware layers are made Redis-tolerant, a Redis outage at the exact moment of `queue.add` leaves a DB row stranded in `queued` with no BullMQ job behind it — and `findActiveRun` then blocks every future trigger via `RUN_ALREADY_ACTIVE`. Three observable failure modes seen during this scenario:

1. Redis `GET` in `TenantResolutionMiddleware` throws `MaxRetriesPerRequestError` → outer `catch` returns HTTP 500 `INTERNAL_ERROR`. Every API request is affected, not just scheduling.
2. After fixing (1), Redis `GET` in `PermissionCacheService.isOwner` / `.getPermissions` (called from `PermissionGuard`) throws the same → HTTP 500 from the guard path.
3. After fixing (1) and (2), the trigger handler now reaches `schedulingQueue.add`, which internally retries the Redis connection with exponential backoff for ~60s before surfacing the error. The edge proxy (nginx/Cloudflare) 504s the request first. If Redis happens to come back within that window, the orphan `queued` row is silently picked up by the worker and the admin gets a 504 for a run that actually kicks off.

**Fix:**

- `apps/api/src/common/middleware/tenant-resolution.middleware.ts` — wrap every `redis.getClient().get` / `.setex` / `.set` call in a new private trio `safeRedisGet` / `safeRedisSet` / `safeRedisSetex`. On Redis failure, `safeRedisGet` logs once at `warn` and returns `null` (treat as cache miss), while the set variants log and no-op. The caller then falls through to the authoritative Postgres lookup (`findDomainRecord`, `findUnique`, etc.), which keeps serving requests.
- `apps/api/src/common/services/permission-cache.service.ts` — same treatment: `safeRedisGet` / `safeRedisSetex` wrappers around the `owner:` and `permissions:` cache reads/writes. The guard chain (`isOwner` → `getPermissions`) now degrades to direct DB lookups on cache failure.
- `apps/api/src/modules/scheduling/scheduler-orchestration.service.ts::triggerSolverRun`:
  - Wrap `schedulingQueue.add(...)` in `Promise.race` against a 5-second timeout, so BullMQ's internal retry/backoff can't wedge the admin request until the edge 504s. If the race rejects (either a real connection error or the timeout), enter the catch path.
  - In the catch path, issue a follow-up RLS transaction that updates the just-committed `scheduling_runs` row to `status: 'failed'` with `failure_reason: "Queue unavailable at enqueue — job not accepted (<underlying error>)"`. This leaves the row in a terminal state so the tenant is not locked out of future triggers.
  - Throw `ServiceUnavailableException` with `{ code: 'QUEUE_UNAVAILABLE', message: 'Scheduling queue is unavailable. Please try again in a moment.' }` (HTTP 503).
  - Also pass explicit `{ attempts: 1, removeOnComplete: 50, removeOnFail: 200 }` to `schedulingQueue.add` so the scheduling queue uses the same retry / retention policy at the producer side that the worker registers (previously only the worker-side default applied).

**Regression tests:** 3 updated in `tenant-resolution.middleware.spec.ts` (Redis GET failure → DB fallback; non-Error Redis failure → DB fallback; non-Redis failure like DB down → still 500); 1 new in `scheduler-orchestration.service.spec.ts` (`mockQueue.add` rejects → trigger throws 503 with `QUEUE_UNAVAILABLE`, `scheduling_runs` row is updated to `failed` with reason starting with "Queue unavailable"); the existing happy-path trigger test updated to match the new 3-arg `queue.add(name, data, opts)` signature.

**Out of scope for this fix:**

- Applying the same `safeRedis*` wrappers to every service in the app that reads Redis (auth session, rate-limit, audit interceptor). STRESS-082 only exercises the trigger path; any remaining Redis-fragile callers will surface in their own stress tests. The pattern is now in place for them to adopt.
- A dedicated health-gate for Redis that short-circuits requests before any middleware runs. The existing `/health` endpoint covers DB; extending it to Redis is a separate observability improvement.

**Production verification (stress-a, 2026-04-15):**

- `docker stop edupod-redis-1`. Trigger → HTTP 503 `{"error":{"code":"QUEUE_UNAVAILABLE","message":"Scheduling queue is unavailable. Please try again in a moment."}}` in ~5s (capped by the enqueue timeout).
- DB row `af93032a-4b35-4ab1-b65e-c152765d4c26` exists with `status: failed`, `failure_reason: "Queue unavailable at enqueue — job not accepted (Scheduling queue enqueue timed out after 5000ms (Redis likely unavailable))"`. No row left in `queued`.
- `docker start edupod-redis-1`. Immediate re-trigger succeeded — new run `7f955a66-c565-4000-b979-84914969d52b` created with `status: queued`.
- API log sequence: `Redis GET failed for key tenant_domain:stress-a.edupod.app; falling back to DB`, `Redis SETEX failed for key ... (best effort)`, handler continues, enqueue times out, catch block marks row failed, 503 response. No 500s.

**Deploy:** rsync `apps/api/src/` to `/opt/edupod/app/apps/api`, server-side `pnpm --filter @school/api build`, `pm2 restart api`. `SERVER-LOCK.md` carries the bracketed acquire/release entries for the wave3-session.

---

### SCHED-031 — Admin cross-perspective Student picker shows 100 blank options

**Severity:** P1
**Status:** Open
**Provenance:** [L] — found 2026-04-17 PWC session

**Summary:** On `/en/timetables` (Cross-Perspective Timetable), switching to the **Student** tab opens a `<Select>` populated with 100 entries — but every option label is empty. Admins cannot pick a student because they can't tell them apart, even though the underlying data (id, first_name, last_name) is fetched correctly.

**Reproduction steps:**

1. Log in as `owner@nhqs.test`.
2. Navigate to `https://nhqs.edupod.app/en/timetables`.
3. Click the **Student** tab.
4. Click the picker → dropdown opens with 100 visually-blank rows.

**Expected:** Each option labelled with the student's full name (e.g. "Adam Moore — 2A"), in the same shape as the Teacher and Class pickers on the same page.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/timetables/page.tsx` — the students-fetch hook (line ~131) calls `apiClient<ListResponse<SelectOption>>('/api/v1/students?pageSize=100', { silent: true })`. The `/students` API returns `{ id, first_name, last_name, ... }`, not `{ id, name }`. The code stashes the raw rows into `students` state and at line ~254 uses them directly: `entityOptions = ... activeTab === 'student' ? students`. Because `SelectOption.name` is `undefined`, every Radix `<SelectItem>` renders an empty label.

**Fix direction:**

Map the response to `{ id, name: \`${first_name} ${last_name}\` }` before storing in state:

```ts
.then((res) => setStudents(
  res.data.map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}` })),
));
```

Optionally append the class name (`s.class_name ? \` — ${s.class_name}\`` : '') so the picker is readable even with similarly-named siblings.

**Playwright verification:**

1. Navigate to `/en/timetables`.
2. Open the Student tab; open the picker.
3. Each row shows a non-empty label.

**Release gate:** P1 — admin cannot use the published-feature without picking by name.

---

### SCHED-032 — Students have no in-app timetable view (data published, UI absent)

**Severity:** P0
**Status:** Open
**Provenance:** [L] — found 2026-04-17 PWC session

**Summary:** A student's published weekly timetable is fully present in the `schedules` table (verified: 21 rows for Adam Moore's class 2A under run `f4a87d4c-…`), but the student-facing app provides no path to view it. The student dashboard top-nav has only **Home** and **Reports** — no Timetable. Every plausible URL (`/en/scheduling/my-timetable`, `/en/timetables`, `/en/scheduling`) redirects students to `/dashboard/student`. The frontend route `/scheduling/my-timetable` exists but is gated to `schedule.view_own`, which the production student role does not hold; even if it did, the `getMyTimetable` controller resolves `staff` records, not `students`.

**Reproduction steps:**

1. SSH into prod, confirm published schedule exists for student's class:
   ```sql
   -- as edupod_app, with tenant set
   SELECT count(*) FROM schedules s
   JOIN students st ON st.class_id = s.class_id
   WHERE st.id = 'c5ddc653-6bae-4756-86e9-03abfcab74a8';
   -- 21
   ```
2. Log in to https://nhqs.edupod.app/en/login as `adam.moore@nhqs.test`.
3. Lands at `/en/dashboard/student`. No Timetable nav button.
4. Try `/en/scheduling/my-timetable` → bounces to `/dashboard/student`.
5. Try `/en/timetables` → bounces to `/dashboard/student`.

**Expected:** A student can view their own published timetable (the same weekday × period grid teachers see for themselves), with subject + room + period info, with print + .ics export options.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/dashboard/student/page.tsx` — has no timetable widget and no link to one.
- `apps/api/src/modules/scheduling/scheduling-enhanced.controller.ts:439` — `GET /v1/scheduling/timetable/my` is implemented as `getMyTimetable → personalTimetableService.getTeacherTimetableByUserId(...)`. It resolves a staff_profile from the JWT, so it returns 404 for students even if the permission was granted.
- `packages/shared/src/permissions.ts` (or wherever `schedule.view_own` is defined) — student role does not include this permission.

**Fix direction (option A — re-use the existing route, add a student branch):**

1. Extend `personalTimetableService` with a `getStudentTimetableByUserId(tenantId, userId, query)` that resolves the user → student record → class_id → existing class-timetable assembly.
2. Update `getMyTimetable` controller to attempt staff resolution first; if not found, attempt student resolution; if neither, throw `NOT_AUTHORIZED`.
3. Add `schedule.view_own` to the student role's default permissions.
4. Add a Timetable card / quick-link to `dashboard/student/page.tsx` linking to `/scheduling/my-timetable`.

**Fix direction (option B — dedicated student route):**

1. New endpoint `GET /v1/scheduling/timetable/student-self` (permission `schedule.view_own_student` or simply `students.view_own`).
2. New page at `/en/dashboard/student/timetable` (or extend the student dashboard with a "This week" widget).

Option A is less code; option B is cleaner separation of concerns and easier permission auditing.

**Playwright verification:**

1. Log in as `adam.moore@nhqs.test`.
2. Navigate to the new timetable page.
3. Grid renders 21 lessons across the week with subject + room labels.
4. Printable variant renders.

**Release gate:** P0 — students literally cannot see their own schedule. Day-1 expectation for any school.

---

### SCHED-033 — Scheduling hub shows "Total Slots: 0 / Completion: 0%" despite 356 published rows

**Severity:** P1
**Status:** Open
**Provenance:** [L] — found 2026-04-17 PWC session

**Summary:** `/en/scheduling` (the Scheduling hub dashboard) shows two key tiles permanently at zero ("Total Slots: 0", "Completion: 0%") even immediately after a successful Apply that wrote 356 rows to `schedules`. Other tiles (Active Teachers / Classes / Subjects) populate correctly, so the underlying tenant + permission context is fine — only the slot counter is broken.

**Reproduction steps:**

1. Confirm there is at least one applied run with `entries_generated > 0`:
   ```sql
   SELECT id, status, entries_generated, applied_at FROM scheduling_runs
   WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
     AND status = 'applied' ORDER BY applied_at DESC LIMIT 1;
   ```
2. As `owner@nhqs.test`, navigate to `/en/scheduling`.
3. "Total Slots" tile shows `0`. "Completion" shows `0%`.

**Expected:** Total Slots = sum of period × weekday capacity (e.g., 6 periods × 5 weekdays × 16 classes = 480) — or whatever measure the tile is meant to convey. Completion = `entries_generated / total_slots`. With 356 published rows over ~480 slot capacity → ~74%.

**Affected files:**

- `apps/api/src/modules/scheduling-runs/scheduling-dashboard.controller.ts` (or wherever `GET /v1/scheduling-dashboard/summary` is defined) and the corresponding service. The hub almost certainly calls a `/dashboard/summary` endpoint that aggregates from a stale source (e.g., `scheduling_drafts` instead of `schedules`, or `runs WHERE status='draft'` instead of `status='applied'`).
- `apps/web/src/app/[locale]/(school)/scheduling/page.tsx` — the tile component reading `totalSlots` and `completionPct`.

**Fix direction:**

1. Open the dashboard service, find the slot-aggregation query.
2. If it's reading from drafts only: switch to the latest `applied` run's entry counts, or `count(*) from schedules`.
3. Compute total-slot capacity from `period_grid_periods × period_grid_weekdays × classes` for the tenant.
4. Verify the tile renders correctly post-Apply.

**Playwright verification:**

1. Apply any run.
2. Navigate to `/en/scheduling`.
3. Total Slots > 0; Completion > 0%.

**Release gate:** P1 — dashboard misleads admin into thinking nothing is published.

---

### SCHED-034 — Student dashboard renders raw i18n keys (`dashboard.greeting`, `common.subjects`, `common.active`, `reportCards.noReportCards`)

**Severity:** P2
**Status:** Open
**Provenance:** [L] — found 2026-04-17 PWC session

**Summary:** When a student logs in, the dashboard heading shows the literal string `dashboard.greeting` (instead of "Good morning, Adam"). Three other strings on the same page also leak as raw keys. Console fires `MISSING_MESSAGE` errors from `next-intl` for each one.

**Reproduction steps:**

1. Log in as `adam.moore@nhqs.test`.
2. Observe page heading and stat-card labels.
3. Devtools console shows `l: MISSING_MESSAGE: dashboard.greeting (en)` etc.

**Expected:** All four strings render in English (and equivalents in Arabic on `/ar/*`).

**Affected files:**

- `apps/web/src/app/[locale]/(school)/dashboard/student/page.tsx` — uses `t('dashboard.greeting')`, `t('common.subjects')`, `t('common.active')`, `t('reportCards.noReportCards')` but those keys are not in `messages/en.json` (or `ar.json`).

**Fix direction:**

1. Open `apps/web/messages/en.json` and `apps/web/messages/ar.json`.
2. Add the four missing keys with appropriate values.
3. Confirm the `useTranslations` namespace in the page matches the JSON nesting (e.g. if the page does `useTranslations('dashboard')` then the JSON needs `dashboard.greeting`).
4. Same fix for Arabic.

**Playwright verification:**

1. Log in as Adam.
2. Page heading shows "Good morning, Adam" (or the localised equivalent).
3. No `MISSING_MESSAGE` console errors.
4. Switch locale to `ar` — Arabic strings render.

**Release gate:** P2 — visually broken but no functional loss.

---

### SCHED-035 — Parent timetable tab calls a backend endpoint that is not registered (`GET /api/v1/parent/timetable` → 404)

**Severity:** P0
**Status:** Open
**Provenance:** [L] — found 2026-04-17 PWC session

**Summary:** The parent dashboard's **Timetable** tab calls `GET /api/v1/parent/timetable?student_id=<sid>`, but no controller in the backend handles that route. NestJS / Express returns the default `Cannot GET /api/v1/parent/timetable?student_id=...` error which the frontend surfaces as a toast and renders "No timetable available." Parents have zero way to see any published schedule for their children.

**Reproduction steps:**

1. Log in as `parent@nhqs.test` (Zainab Ali).
2. Navigate to `/en/dashboard/parent`.
3. Click the **Timetable** tab.
4. Page renders "No timetable available." Toast: `Cannot GET /api/v1/parent/timetable?student_id=...`.

**Code-side verification:**

```bash
grep -rn "parent/timetable" apps/api/src   # → 0 matches
grep -rn "parent/timetable" apps/web/src   # → 2 matches (the broken callers)
```

**Expected:** Endpoint returns the same shape as `GET /v1/scheduling/timetable/class/:classId` but resolved via the requesting parent's authorised child relationships.

**Affected files:**

- New file: `apps/api/src/modules/parent-portal/parent-timetable.controller.ts` (or extend existing parent controller) registering `GET /v1/parent/timetable`.
- `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/timetable-tab.tsx:80`
- `apps/web/src/app/[locale]/(school)/dashboard/_components/parent-home.tsx:127`

**Fix direction:**

1. Add a parent-scoped controller endpoint:
   ```ts
   @Get('parent/timetable')
   @RequiresPermission('parent.view_timetable')   // new permission
   async getChildTimetable(
     @CurrentTenant() tenant,
     @CurrentUser() user,
     @Query('student_id', ParseUUIDPipe) studentId: string,
     @Query(new ZodValidationPipe(timetableQuerySchema)) query,
   ) {
     // 1. Verify (parent_user_id = user.sub, student_id) link exists in parent_student_links.
     // 2. Resolve student → class_id.
     // 3. Delegate to personalTimetableService.getClassTimetable(...).
   }
   ```
2. Add `parent.view_timetable` to default parent role permissions.
3. (Optional) Ensure the child's class is `is_published = true` before returning.

**Playwright verification:**

1. Log in as `parent@nhqs.test`.
2. Click Timetable tab.
3. Adam Moore's 21 published lessons render in a weekday × period grid.

**Release gate:** P0 — parent-portal feature documented in spec is non-functional.

---

### SCHED-036 — Parent dashboard fires 7 toast errors on initial load (permission + missing endpoint)

**Severity:** P1
**Status:** Open
**Provenance:** [L] — found 2026-04-17 PWC session

**Summary:** Logging in as `parent@nhqs.test` fires a burst of background fetches up-front: many of them hit endpoints that require permissions the default parent role does not hold, and one hits an endpoint that does not exist. Every failure surfaces as a user-visible toast. Parent landing experience: 7 red error toasts before the user has done anything.

**Errors observed (devtools / Sonner toasts):**

1. `Missing required permission: parent.view_engagement` (×2 — fired by two separate widgets)
2. `Missing required permission: parent.view_finances`
3. `Missing required permission: homework.view_diary`
4. `Missing required permission: parent.homework` (×2)
5. `Cannot POST /api/v1/reports/parent-insights` (endpoint not registered)

**Reproduction steps:**

1. Log in as `parent@nhqs.test`.
2. Land at `/en/dashboard/parent`.
3. Watch toasts pile up over ~2 seconds.

**Expected:**

- Permission-denied responses (403) on background widget fetches should NOT show user-visible toasts. The widget should hide / show a soft empty state.
- 404 responses on missing endpoints should be reported once via console, not toast.
- Or: align the parent role's default permission set with the widgets the dashboard renders — give parents `parent.view_engagement`, `parent.view_finances`, `parent.homework`, `homework.view_diary`.
- Or: stop rendering widgets the role cannot access (gate the widget render on permission first, then fetch).

**Affected files:**

- `apps/web/src/lib/api-client.ts` — toast policy on 403/404. Currently looks like every error becomes a toast unless `silent: true` is passed.
- `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx` (and `parent-home.tsx`) — should pass `silent: true` for background widget fetches OR check permissions client-side before issuing the request.
- `apps/api/src/modules/reports/...` — register or remove the `POST /v1/reports/parent-insights` route (frontend currently expects it).
- `packages/shared/src/permissions.ts` — possibly add the missing permissions to default parent role.

**Fix direction:**

1. Decide for each missing permission: should default parent have it, or should the widget be removed?
2. For widgets that should remain but require permission: gate the fetch on `usePermission('parent.view_engagement')` (etc.) so unauthorised parents see an empty card instead of a fetch attempt.
3. For the `/api/v1/reports/parent-insights` POST: either register the endpoint or remove the AI Insight widget's POST call.
4. Update `api-client.ts` (or per-call) so widget fetches use `silent: true` and report errors via console, not toast.

**Playwright verification:**

1. Log in as `parent@nhqs.test`.
2. Watch toasts: zero unexpected error toasts within 5 seconds of landing.
3. Console may still log expected 403/404; UI should not surface them.

**Release gate:** P1 — first impression to parents is "the platform is broken." Trust-destroying on day one.

---

### SCHED-037 — Reserved (intentionally numbered to keep the gap; see SCHED-033 for the dashboard-counts bug originally drafted under this ID)

**Severity:** —
**Status:** N/A — see SCHED-033

---

### SCHED-038 — Student account creation flow leaves accounts un-loginable (broken bcrypt hash + unverified email)

**Severity:** P2
**Status:** Open
**Provenance:** [L] — found 2026-04-17 PWC session

**Summary:** The student account `adam.moore@nhqs.test` was created earlier in the project lifecycle (per memory: "created 2026-04-11 via direct DB insert"). Today's PWC found the account un-loginable for two compounding reasons: `password_hash` was 28 characters (not a valid 60-char bcrypt hash), and `email_verified_at` was `NULL` (the login flow refuses unverified accounts). Both had to be patched in production today to allow profile-verification testing to proceed. Whatever code path is used in production to create student accounts (admissions intake, parent-portal student linking, admin direct-create from `/en/admissions/intake/...`) must be audited — if it produces records like Adam's, every newly created student is silently un-loginable.

**Reproduction steps (post-fix, but the bug was present in production today):**

1. Pre-fix: `SELECT length(password_hash), email_verified_at FROM users WHERE email='adam.moore@nhqs.test';` → `(28, NULL)`.
2. Attempt login → "Invalid email or password" (no clue that the hash is malformed or that verification is missing).

**Expected:**

- All student account creation paths must produce `password_hash = bcrypt(plaintext, 10)` (60 chars).
- System-created student accounts (vs self-registered) must default `email_verified_at = now()` so the verification email step is not required to log in.
- Login error path should distinguish between "invalid credentials" and "account not yet verified" so an admin can diagnose without DB access.

**Audit targets:**

```bash
grep -rn "INSERT INTO users\|prisma.user.create\|password_hash" apps/api/src
grep -rn "INSERT INTO users\|prisma.user.create" packages/prisma/scripts
```

Specifically check:

- `apps/api/src/modules/admissions/...` — if the admissions intake flow creates the linked student `users` row, does it bcrypt the password?
- `apps/api/src/modules/students/students.service.ts` — student create path.
- `packages/prisma/scripts/seed*.ts` — seed-time creators.

**Fix direction:**

1. Find the student-create path that produced Adam's bad row (likely a seed or one-shot script).
2. Replace the hash-write with `await bcrypt.hash(password, 10)`.
3. Set `email_verified_at: new Date()` for all system-initiated student account creates.
4. Backfill: scan `users` for `length(password_hash) <> 60` and either reset (force password-reset email) or mark for manual remediation.
5. Add a unit test asserting that any helper that writes `users.password_hash` produces a 60-char bcrypt string.

**Playwright verification:**

1. Run the affected create-student path with a known plaintext password.
2. Inspect the new row — `length(password_hash) = 60`, `email_verified_at IS NOT NULL`.
3. Log in with that plaintext password → succeeds without verification email.

**Release gate:** P2 — only one known affected user today (Adam), but blast radius is "every future student created via the same path" so this should land before any tenant onboards a real cohort.

---

### SCHED-039 — Capacity gap: 4th-6th class lesson demand exceeds weekly slot capacity

**Severity:** P3
**Status:** Open (config / data, not code)
**Provenance:** [L] — observed 2026-04-17 PWC; quantified from `f4a87d4c-…` run output

**Summary:** With the current period grid (5 teaching weekdays × 6 periods/day − 1 break/day = 29 teaching slots/week) and the curriculum requirements as seeded for NHQS, the upper-elementary classes have:

- 4th class (`4A`/`4B`): 33 lesson-instances/week required, 29 available → **4 unplaced lessons inevitable per class**.
- 5th class (`5A`/`5B`): 35 required, 29 available → **6 unplaced inevitable**.
- 6th class (`6A`/`6B`): 39 required, 29 available → **10 unplaced inevitable**.

Solver report on `f4a87d4c-…` shows 37 entries unassigned, broken down by class, matching the analysis above (4A=4, 5A=7 (rounded up), 6A=10, plus other tier overflow). No CSP search strategy can recover this — the inputs are infeasible.

**Reproduction:**

```sql
-- Demand per class (sum of curriculum_requirements.weekly_lessons)
SELECT c.name, sum(cr.weekly_lessons)
FROM curriculum_requirements cr JOIN classes c ON c.id = cr.class_id
WHERE cr.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
GROUP BY c.name ORDER BY sum DESC;

-- Capacity = teaching slots/week per class
SELECT 5 * (count(*) FILTER (WHERE NOT is_break)) AS slots_per_week
FROM period_grid_periods
WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
-- 29
```

**Resolution paths (NHQS-data-side; not a code bug):**

1. **Add a 7th period** to the day, or reinstate Friday-morning teaching → +5 to +12 slots/week.
2. **Reduce per-subject hours** for upper elementary (e.g. drop one PE / one Art weekly).
3. **Accept the gap** as the published norm — explicitly mark unplaced lessons as "to be assigned in cover board" or "delivered as homework / online".

**Release gate:** Not a code release blocker; flag at NHQS data-readiness review. Until resolved, expect ~9% solver-unplaced as steady state.

---

### SCHED-040 — K1B subject-coverage gap: only Arabic teacher exists for the class

**Severity:** P3
**Status:** Open (data, not code)
**Provenance:** [L] — observed 2026-04-17 PWC

**Summary:** Curriculum requirement query returns 432 lesson-instances for NHQS this term, but the solver's input-assembly normalised the demand down to 393 — a 39-row gap. Cause: K1B has subject requirements (Quran, Arabic Literature, …) for which no teacher in `teacher_competencies` is qualified. The orchestration layer drops "uncoverable" requirements before passing the model to CP-SAT to avoid trivial infeasibility, but does so silently.

**Reproduction:**

```sql
-- Find required (subject × class) pairs with zero qualified teacher
SELECT cr.class_id, c.name AS class_name, cr.subject_id, s.name AS subject_name
FROM curriculum_requirements cr
JOIN classes c ON c.id = cr.class_id
JOIN subjects s ON s.id = cr.subject_id
WHERE cr.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
  AND NOT EXISTS (
    SELECT 1 FROM teacher_competencies tc
    WHERE tc.tenant_id = cr.tenant_id
      AND tc.subject_id = cr.subject_id
      AND (tc.class_id = cr.class_id OR tc.class_id IS NULL)
  );
-- Returns rows for K1B + a few others
```

**Resolution paths (NHQS-data-side):**

1. Hire / mark existing teachers as competent for K1B Quran/Arabic-Lit.
2. Surface an admin warning in the run-review UI: "39 requirements have no qualified teacher and were excluded from this run." Right now the gap is invisible.

**Code-side defence-in-depth:**

- Make the orchestration layer emit a structured warning into `scheduling_runs.coverage_warnings` (new JSONB column) so the run-review UI can show "N requirements were silently dropped — these will never be scheduled." This converts a silent data issue into an admin-visible diagnostic.

**Release gate:** P3 today (NHQS pilot only); the silent-drop behaviour itself is a P2 product gap and worth its own ticket if the team chooses.

---

### SCHED-041 — CP-SAT solver does not improve on greedy seed within 3600s deadline

**Severity:** P1
**Status:** Open
**Provenance:** [L] — observed 2026-04-17 PWC across run `f4a87d4c-…` and 3 prior attempts

**Summary:** On the NHQS dataset (393 effective demand, ~480 capacity) the CP-SAT solver returns its initial greedy seed (320 lessons placed in <1s) and then makes no further improvement during the next 3,599 seconds before hitting the configured `max_solver_duration_seconds = 3600` ceiling. Final result: 91% placement, 84.2% soft-preference score, 0 hard violations — but every minute past second 1 was wasted. Runs ID `f4a87d4c-…`, `3fb9b3d7-…`, `6b399caf-…`, `5821d940-…` all exhibit the same plateau.

**Hypothesised causes (in priority order):**

1. **No solver hints** — the greedy assignment isn't being passed back into CP-SAT as a starting solution, so the solver re-explores from scratch and times out before reaching the greedy quality.
2. **Soft-preference weights too dense** — the objective function may have ~thousands of weighted terms, swamping CP-SAT's branch-and-bound.
3. **No symmetry breaking** — equivalent (teacher × period) assignments may explode the search space.
4. **Phase-saving / value-ordering not tuned** — default CP-SAT search on a hard scheduling problem rarely beats a hand-tuned greedy.

**Reproduction:**

1. Trigger any auto-run on NHQS.
2. Watch run-detail page: greedy line "320/393 (greedy)" appears in <1s.
3. No further "Improving …" log lines for 3,600s.
4. Run completes at 3,604s with the greedy assignment as final result.

**Affected files:**

- `apps/worker/python/solver_v2/main.py` (or wherever the CP-SAT model is built — Python sidecar).
- `packages/shared/src/scheduler/` if there is a TypeScript-side seed/objective construction layer.
- Tenant config: `scheduling_configs.max_solver_duration_seconds`.

**Fix direction:**

1. Pass the greedy assignment as `model.AddHint(...)` for every (lesson, slot) pair before `solver.Solve(model)`. This guarantees the solver never returns _worse_ than greedy and gives it a basin to improve from.
2. Tighten objective: rather than ~1000 weighted soft terms, normalise to ~10 categorical objectives (teacher fairness, room-distance, double-period preference, etc.) and run lexicographic optimisation on them.
3. Add `solver.parameters.num_search_workers = 8` (or whatever the sidecar host has) to use multi-threaded LNS.
4. Add early-exit: once `objective_value > 0.95 * best_known`, allow the solver to terminate at the next checkpoint instead of running the full 3,600s.
5. Surface the solver's `reason_for_termination` in `scheduling_runs.solver_diagnostics_jsonb` so admins can see "OPTIMAL" / "FEASIBLE_AT_DEADLINE" / "INFEASIBLE" without having to read worker logs.

**Playwright verification:**

1. Apply hints + multi-thread + tightened objective.
2. Re-trigger on NHQS.
3. Greedy seed visible in <1s.
4. At least one "Improving to N/393" log line within the first 60s.
5. Either: solver terminates with `OPTIMAL` < 600s, or terminates at deadline with provably better solution than the greedy seed.

**Release gate:** P1 — wasting 1h of CPU per run for no quality gain. At pilot tenant scale this is tolerable; at multi-tenant scale this is a worker-pool capacity problem.

---

### SCHED-042 — Three consecutive `failed` runs after the successful Apply — root cause not investigated

**Severity:** P2
**Status:** Open
**Provenance:** [L] — observed 2026-04-17 PWC

**Summary:** Immediately after applying run `f4a87d4c-…` successfully, three further runs were triggered (to test re-run behaviour and Apply-overwrite semantics). All three ended `failed`:

- `3fb9b3d7-…`
- `6b399caf-…`
- `5821d940-…`

The `failure_reason` and `result_json` were not captured during the live walkthrough (got pulled into the Adam Moore login fix). Worth a 15-minute dig on the DB + worker logs to confirm the failure mode.

**Reproduction:**

1. SSH to prod, set tenant context, query:
   ```sql
   SELECT id, status, failure_reason, created_at, completed_at,
          (extract(epoch FROM (completed_at - created_at))) AS dur_s
   FROM scheduling_runs
   WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
     AND id IN ('3fb9b3d7-...', '6b399caf-...', '5821d940-...');
   ```
2. Cross-check worker logs in the same window:
   ```bash
   pm2 logs worker --lines 5000 | grep -E '3fb9b3d7|6b399caf|5821d940'
   ```

**Hypotheses (untested):**

1. The Apply step set `is_published = true` on derived rows that the next solver attempt then refused to overwrite — should have surfaced a structured "ALREADY_PUBLISHED" failure_reason rather than a generic failure.
2. Solver sidecar got OOM-killed by the 3rd run (stress-side resource pressure) and BullMQ marked the runs failed via stalled-handler.
3. The stale-reaper (every 60s, max_solver_duration + 60s threshold) picked up a still-in-flight run because the cron triggered at the worst moment.

**Resolution direction:**

1. First — go look. Don't ship a fix until the failure_reason is read.
2. If hypothesis (1): expose a clear `RUN_AGAINST_PUBLISHED_SCHEDULE` failure reason and a "force overwrite" admin toggle.
3. If hypothesis (2): Worker memory profile + sidecar memory budget review.
4. If hypothesis (3): widen the reaper threshold or add solver-progress heartbeats so reaper does not interrupt healthy runs.

**Release gate:** P2 — three terminal failures with no root cause is uncomfortable, even if they were "post-success retest" attempts. Don't want to ship NHQS not knowing what failure these represent.

---

**End of Bug Log.**
