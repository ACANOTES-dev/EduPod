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

| ID        | Severity | Status | Tag | Summary                                                                                     |
| --------- | -------- | ------ | --- | ------------------------------------------------------------------------------------------- |
| SCHED-001 | P0       | Open   | [L] | Substitutions page crashes with undefined.filter                                            |
| SCHED-002 | P0       | Open   | [L] | Sub Board page crashes with undefined.length                                                |
| SCHED-003 | P1       | Open   | [L] | Class Requirements "Configure with defaults" 400                                            |
| SCHED-004 | P1       | Open   | [L] | Staff Preferences 404 on GET and POST — endpoint missing                                    |
| SCHED-005 | P1       | Open   | [L] | Exams Add-Exam (slot POST) returns 400; GET /slots also 404                                 |
| SCHED-006 | P1       | Open   | [L] | Analytics Trends tab crashes                                                                |
| SCHED-007 | P2       | Open   | [L] | Room Closures list: Room name + Created By columns blank                                    |
| SCHED-008 | P2       | Open   | [L] | Break Groups: Year Groups column blank                                                      |
| SCHED-009 | P2       | Open   | [L] | Curriculum Hrs/Week/Month/Year all render 0 due to missing input                            |
| SCHED-010 | P2       | Open   | [L] | Analytics Rooms: `scheduling.auto.capacity` i18n key unresolved                             |
| SCHED-011 | P2       | Open   | [L] | Cover Reports endpoint 400                                                                  |
| SCHED-012 | P3       | Open   | [L] | Exam sessions have no delete UI                                                             |
| SCHED-013 | P1       | Open   | [L] | Stress-tenant admin role missing 9/17 schedule.\* permissions (blocks all solver scenarios) |

**Severity totals:** P0: 2, P1: 5, P2: 5, P3: 1 — **Total: 13 bugs**

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

### SCHED-013 — Stress-tenant admin role missing 9 of 17 `schedule.*` permissions (blocks all solver scenarios)

**Severity:** P1
**Status:** Open
**Provenance:** [L] — found during STRESS-029 setup on stress-c.edupod.app, 2026-04-15

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

### SCHED-013 — Worker crash loop blocks scheduling solver (audit-log processor missing RLS context + empty-UUID handling)

**Severity:** P1
**Status:** Fixed (pending deploy + verification)
**Provenance:** [L]
**Found by:** session-A during STRESS-002 execution on `stress-a.edupod.app`

**Summary:** Every mutating request enqueues an audit-log job. `AuditLogWriteProcessor.process()` calls `prisma.auditLog.create()` outside any transaction, so `SET LOCAL app.current_tenant_id` is never issued. The `audit_logs` RLS policy evaluates `current_setting('app.current_tenant_id')::uuid`, and when the GUC is unset PostgreSQL raises `42704 unrecognized configuration parameter` on every insert. With `FORCE ROW LEVEL SECURITY` on, even the `edupod_app` role hits this. BullMQ retries, pm2 eventually restarts the worker (12 restarts observed in ~2 hours), and any in-flight scheduling solve is killed — the run stays `queued` forever while the UI shows an infinite spinner. A second failure path: when the interceptor emits an empty string for `entity_id`/`tenantId`, Prisma tries to coerce `""` into a UUID and fails with `22P02 invalid input syntax for type uuid`, causing the same restart loop.

**Reproduction:**

1. `ssh root@46.62.244.139 "sudo -u edupod pm2 logs worker --nostream --lines 80 --err"` — shows stack traces like `unrecognized configuration parameter "app.current_tenant_id"` for every audit event.
2. `sudo -u edupod pm2 list` — `worker` row shows restart counter (`↺`) climbing every few minutes.
3. POST `/api/v1/scheduling-runs` as a principal user. Poll `/api/v1/scheduling-runs/<id>/progress`: status remains `queued`. Worker logs show `SchedulingSolverV2Job` progress ticks (50/320, 100/320…) that never reach completion — the process is killed mid-solve.

**Affected files:**

- `apps/worker/src/processors/audit-log/audit-log-write.processor.ts`
- `apps/worker/src/processors/audit-log/audit-log-write.processor.spec.ts`

**Fix:**

1. Wrap the `auditLog.create()` call in `prisma.$transaction(async (tx) => …)` that first runs `SELECT set_config('app.current_tenant_id', $1::text, true)` and the matching `app.current_user_id`. Use `00000000-0000-0000-0000-000000000000` when the payload tenant/user is null — the policy's `tenant_id IS NULL OR …` branch still matches platform-level rows without breaking the cast.
2. Normalise payload UUIDs via a regex check: empty string or malformed UUID → `undefined` so Prisma omits the column instead of sending `""`.

**Verification:**

1. `pnpm --filter @school/worker test -- audit-log-write` — all specs green.
2. Redeploy worker; `sudo -u edupod pm2 list` should show stable `↺` counter.
3. `POST /api/v1/scheduling-runs` → progress transitions `queued → running → completed` inside the 20s budget for STRESS-002 scale.
4. `SELECT count(*) FROM audit_logs WHERE created_at > now() - interval '5 minutes'` > 0.

**Release gate:** P1 — blocks every BullMQ-driven feature (solver, substitutions, notifications, gradebook rollups, …) because the worker can't stay alive long enough to complete anything.

---

**End of Bug Log.**
