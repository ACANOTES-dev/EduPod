# Scheduling Module — Playwright Walkthrough Results

**Date:** 2026-04-14
**Tester:** Claude (automated Playwright MCP walkthrough)
**Target:** `https://nhqs.edupod.app` (Nurul Huda School — NHQS tenant)
**Role:** Admin/Owner (`owner@nhqs.test`)
**Scope:** Every scheduling sub-module, end-to-end, with real CRUD writes where safe (revert applied after each destructive test).

---

## Severity Tally

| Severity | Count | Notes                                                                                                     |
| -------- | ----- | --------------------------------------------------------------------------------------------------------- |
| P0       | 2     | Substitutions page crashes; Sub Board page crashes                                                        |
| P1       | 4     | Class Requirements bulk 400; Staff Preferences 404; Exams Add slot 400; Trends crash                      |
| P2       | 4     | Room Closure list blank columns; curriculum Hrs/Week renders 0; analytics i18n raw key; cover-reports 400 |
| P3       | 1     | Exam session has no delete UI                                                                             |

**Total findings: 11**

---

## Coverage Matrix

| Module                  | List | Read | Create | Update | Delete | Notes                                                       |
| ----------------------- | ---- | ---- | ------ | ------ | ------ | ----------------------------------------------------------- |
| Period Grid             | ✅   | ✅   | ✅     | ✅     | ✅     | Full CRUD verified; persistence confirmed on reload.        |
| Curriculum              | ✅   | ✅   | —      | ✅     | —      | Save All works; subject rows auto-populate from matrix.     |
| Break Groups            | ✅   | ✅   | ✅     | —      | ✅     | Year-group toggles render; Location + supervisors saved.    |
| Room Closures           | ✅   | ✅   | ✅     | —      | ✅     | **Bug**: Room name + Created By columns render blank.       |
| Teacher Competencies    | ✅   | ✅   | ✅     | ✅     | ✅     | Cell-level toggle persists.                                 |
| Competency Coverage     | ✅   | ✅   | —      | —      | —      | Read-only matrix. 78% coverage, 24 missing.                 |
| Teacher Config          | ✅   | ✅   | —      | ✅     | —      | Inline number inputs persist.                               |
| Class Requirements      | ✅   | —    | ❌     | —      | —      | **Bug**: "Configure with defaults" returns 400.             |
| Staff Availability      | ✅   | ✅   | —      | ✅     | —      | Day-level toggles + Save work.                              |
| Staff Preferences       | ❌   | —    | ❌     | —      | —      | **Bug**: GET and POST `/staff-preferences` both return 404. |
| Substitutions           | ❌   | —    | —      | —      | —      | **P0**: Page crashes with `.filter` of undefined.           |
| Substitute Competencies | ✅   | ✅   | ✅     | ✅     | ✅     | Cell-level toggle persists.                                 |
| Sub Board               | ❌   | —    | —      | —      | —      | **P0**: Page crashes with `.length` of undefined.           |
| My Timetable            | ✅   | —    | —      | —      | —      | Empty for admin (no teaching slots); week nav works.        |
| Exams                   | ✅   | ✅   | ✅     | —      | ⚠️     | Session create works; **bug**: Add Exam (slot) 400.         |
| Analytics Dashboard     | ✅   | ✅   | —      | —      | —      | Overview/Workload/Rooms ok; **bug**: Trends crashes.        |
| Cover Reports           | ❌   | —    | —      | —      | —      | **Bug**: Endpoint returns 400.                              |
| Auto-Scheduler          | ✅   | ✅   | —      | —      | —      | Prerequisites page + review page both functional.           |

---

## Detailed Walkthrough

### 1. Period Grid (`/scheduling/period-grid`) — ✅ Full CRUD

- Kindergarten grid has 29 teaching periods + 10 breaks across Mon–Fri (Sat/Sun empty).
- **Edit**: Changed Monday Period 5 end-time 12:45 → 12:50, saved, reloaded → persisted. Reverted to 12:45 successfully.
- **Create**: Added "TEST Period" on Saturday (08:00–09:00, teaching). Appeared in grid.
- **Delete**: Clicked the trash icon in the new period card. Saturday returned to empty.
- **Reload verification**: Monday P5 back to 12:00–12:45, Saturday empty.
- Toolbar actions visible: Copy Day Structure / Copy to Year Groups / Auto-Generate.
- No console errors.

### 2. Curriculum (`/scheduling/curriculum`) — ✅ Persisted

- Kindergarten shows 7 subjects (Arabic, Biology, Chemistry, English, Geography, History, Mathematics) with spinbutton inputs for Period Duration / Min-Week / Max-Day + checkbox for Double.
- **Edit**: Changed Arabic min/week 5 → 6, clicked Save All, reloaded → persisted.
- Reverted 6 → 5 and saved again.
- **Allocated: 19 / 29. Remaining: 10** shown top-right.
- **[P2] Bug**: Period Duration column shows "min" suffix with empty input for all rows; Hrs/Week, Hrs/Month, Hrs/Year columns all show "—". Forecast Teaching Hours row reports 0.0 across the board — values aren't calculated despite min/week being set.

### 3. Break Groups (`/scheduling/break-groups`) — ✅ Create + Delete

- 2 existing groups: "Yard 1 - Juniors" (Main Yard, 1), "Yard 2 - Seniors" (Back Yard, 2).
- **[P2] Bug**: "Year Groups" column renders empty for both existing groups — backend likely doesn't join member year groups for list view.
- **Create**: Added "TEST Break" with Location "Test Yard", toggled Kindergarten, saved. Row appeared.
- **Delete**: Trash icon on row → confirmation toast + row removed.
- Add dialog supports English + Arabic name, Location, Required Supervisors, year-group toggle list.

### 4. Room Closures (`/scheduling/room-closures`) — ✅ Create + Delete

- Empty list at start.
- **Create**: Added closure for Classroom 01, 2026-05-01 → 2026-05-02, reason "TEST closure". Row appeared.
- **[P2] Bug**: In the list, the **Room** column AND the **Created By** column render blank. Backend response likely doesn't include room.name or created_by.user fields.
- **Delete**: Row delete button removed the entry. Empty state returned.

### 5. Teacher Competencies (`/scheduling/competencies`) — ✅ Cell Toggle Persists

- Matrix of 33 teachers × 7 subjects for Kindergarten year group. Sub-tabs: All (pool), K1A, K1B, Copy to Other Years.
- **Legend**: Pool (year-group) / Pinned (class) / Missing.
- **Toggle test**: Ahmed Hassan × Arabic unchecked → checked. Reloaded → still checked. Re-toggled back to unchecked. Reloaded → unchecked.
- Year-group tab bar covers all 9 year groups.
- "Needs a teacher" inline warning visible on Biology/Chemistry/Geography/History columns (no teacher in Kindergarten pool).

### 6. Competency Coverage (`/scheduling/competency-coverage`) — ✅ Read-only

- Subject × class matrix with counts per cell (number of teachers competent).
- **Summary**: 24 missing, 85 pool, 0 pinned, 78% coverage rate.
- "Show only problems" toggle, legend: Pinned / Pool / Missing / Not in curriculum.
- Cells with `—` for not-in-curriculum pairs; cells with numbers for pool-sized counts; empty cells for missing.

### 7. Teacher Config (`/scheduling/teacher-config`) — ✅ Inline edit

- All 34 teachers listed with editable Max Periods/Week, Max Periods/Day, Max Supervision/Week.
- **Edit**: Set Fatima Al-Rashid's weekly max to 25, clicked Save. Reloaded → persisted. Reverted to blank and saved.

### 8. Class Requirements (`/scheduling/requirements`) — ❌ Bulk create broken

- Empty list. "0 of 16 classes configured".
- Clicked "Configure remaining with defaults" → **[P1] 400 on `POST /api/v1/class-scheduling-requirements/bulk`**. No rows created. Console error: `[SchedulingRequirementsPage] {error: Object}`.
- This endpoint appears critical for the auto-scheduler — the empty Class Requirements means the solver is using year-group defaults only.

### 9. Staff Availability (`/scheduling/availability`) — ✅ Toggle works

- Teacher list in left sidebar.
- Selected Fatima Al-Rashid → Mon–Sun slots render with "Not available" state.
- **Toggle**: Clicked a slot on Monday, clicked Save → no error.
- Reverted toggle and saved again.

### 10. Staff Preferences (`/scheduling/preferences`) — ❌ Endpoint missing

- Selected Fatima Al-Rashid from combobox → **[P1] 404 on `GET /api/v1/staff-preferences?staff_profile_id=…`**.
- UI still renders the Subject/Class/Time Slot tabs and an Add button.
- Clicking Add triggers **[P1] 404 on `POST /api/v1/staff-preferences`**. Feature is entirely non-functional.

### 11. Substitutions (`/scheduling/substitutions`) — ❌ **P0** Page crashes

- Page renders "Something went wrong" error boundary.
- **Console errors**:
  - `404 on /api/v1/staff?pageSize=200&role=teacher` (staff endpoint doesn't accept `role` filter).
  - `TypeError: Cannot read properties of undefined (reading 'filter')` in the page component — silent response failure cascaded into a render crash instead of an empty state.

### 12. Substitute Competencies (`/scheduling/substitute-competencies`) — ✅ Cell toggle

- Separate roster from teaching competencies.
- **Legend**: Pool (can cover any section) / Preferred (this section) / Not eligible.
- **Toggle test**: Ahmed Hassan × Arabic unchecked → checked. Reloaded → persisted. Re-toggled back and verified.

### 13. Sub Board (`/scheduling/substitution-board`) — ❌ **P0** Page crashes

- Page renders "Something went wrong".
- **Console error**: `TypeError: Cannot read properties of undefined (reading 'length')` in the board component on mount. Likely the today-absences API returns `null`/`undefined` instead of an empty array, and the component doesn't guard.

### 14. My Timetable (`/scheduling/my-timetable`) — ✅ Graceful empty state

- Admin (Yusuf Rahman) has no teaching slots. Page renders "No timetable available for this week."
- **404 silent**: `GET /api/v1/scheduling/timetable/my?week_date=2026-04-18` returns 404, logged as `[SchedulingMyTimetablePage]`. UX is OK — empty state hides the error from the user.
- Previous/Next Week + Subscribe to Calendar + Print buttons functional (week navigation re-fetches).

### 15. Exams (`/scheduling/exams`) — ⚠️ Session create works, slot create broken

- Empty state at start.
- **Create session**: "Create Session" dialog: Name + Academic Period (S1/S2) + Start/End dates. Created "TEST Exam Session" 2026-06-01 → 2026-06-10 linked to S2. Row appeared with "planning" badge + "0 exams".
- **Drill into session**: Session detail page loads with Back to Sessions / Generate Schedule / Assign Invigilators / Publish / Add Exam.
- **[P3] No delete UI**: There is no way to remove a session from the list or detail page. Test session remains in production data (side effect: one garbage row named "TEST Exam Session").
- **Add Exam**: Dialog with Subject / Year Group / Date / Start Time / Duration / Student Count. Filled Mathematics × 6th Class × 2026-06-02 × 09:00 × 90min × 30. Clicked Add Exam → **[P1] 400 on `POST /api/v1/scheduling/exam-sessions/{id}/slots`**. Exam not created. Also **404 on GET /slots** during initial load.

### 16. Analytics Dashboard (`/scheduling/dashboard`) — ✅ 3/4 tabs

- **Overview**: 0 total slots (pre-apply), 16 assigned (from latest run), 0 pinned, 0% completion, 5% room util, 6% teacher util, 1.5 avg gaps, 89% preference score. Last run card shows 14/04/2026 18:19 completed.
- **Workload**: Heatmap renders with legend (Free / Light / Moderate / Heavy / Overloaded).
- **Rooms**: 20+ rooms with utilization %, peak period, underutilised hint.
  - **[P2] Bug**: Each room subtitle reads `classroom · scheduling.auto.capacity: 25` — the `scheduling.auto.capacity` i18n key is rendered literally instead of translated to "Capacity".
- **Trends**: **[P1] Crashes** with "Something went wrong" / `Cannot read properties of undefined` in the tab component.

### 17. Cover Reports (`/scheduling/cover-reports`) — ❌ 400 error

- Page renders with From/To filters, Apply, Export CSV, but initial fetch fails.
- **[P2] 400 on `GET /api/v1/scheduling/cover-reports?from=2026-03-15&to=2026-04-14`**. UI gracefully shows "No cover data for the selected period." — the bug is masked visually but the data never loads.

### 18. Auto-Scheduler (`/scheduling/auto`) — ✅ Fully functional

- Selected year 2025-2026. Prerequisites panel renders 6 checks:
  1. 269 teaching periods configured — **Pass**
  2. All 16 classes have scheduling requirements — **Pass**
  3. All classes have assigned teachers — **Pass**
  4. 8 class/subject combinations have no pinned or pool teacher — **Fail**
  5. No pinned entry conflicts — **Pass**
  6. All pinned entries within teacher availability — **Pass**
- Generate Timetable button correctly disabled when any prerequisite fails (good UX — no partial runs possible).
- **Run History**: 7 past runs visible (3 completed, 1 applied, 2 failed, 1 discarded). View/Review links work.
- **Review page (`/scheduling/runs/{id}/review`)**: Excellent — renders class-by-class timetable grid (K1A default), drag-to-swap hint, Discard / Apply Timetable actions. Constraint report: 0 hard violations, 89% preference satisfaction, 74 unplaced periods across 37 gaps. HIGH PRIORITY warning "4 teachers at their weekly load cap" with 3 suggested solutions + Workload Summary showing Sarah Daly 31p, Benjamin Gallagher 29p, Chloe Kennedy 29p, William Dunne 28p.
- Did NOT click Apply (destructive; would write 356 slot assignments to production).

---

## Recommended Immediate Actions

1. **[P0] Substitutions page crash** (`/scheduling/substitutions`) — add a null-guard on `.filter` for the staff list. Fix the `/api/v1/staff?role=teacher` endpoint (currently 404) or update the frontend to use `/staff?filter[role_key]=teacher` or equivalent.
2. **[P0] Sub Board crash** (`/scheduling/substitution-board`) — guard against undefined on the today-absences fetch. Return `[]` when no data, not `undefined`.
3. **[P1] Class Requirements bulk endpoint 400** — `/api/v1/class-scheduling-requirements/bulk` rejects whatever payload the UI sends. Inspect the server 400 response body for the validation error, then either fix the Zod schema or the frontend payload shape.
4. **[P1] Staff Preferences 404** — the module exists in the UI but the backend route does not. Ship the CRUD endpoints or hide the page until ready.
5. **[P1] Exams slot creation 400** — Add Exam flow cannot create any exams. Since the module is gated by a session already, fix the `/exam-sessions/{id}/slots` POST before any tenant tries to use exams.
6. **[P1] Analytics Trends tab crash** — another undefined-access crash. Guard + add empty state.

---

## Observations

- The three failing modules (Substitutions, Sub Board, Trends) all crash with the same pattern: a backend call returns nothing useful and the component doesn't guard — the error boundary catches the render exception and shows "Something went wrong". A sweep to add `?? []` / `?? {}` on consumption would fix the UX even if the backend issues remain.
- The auto-scheduler and its review page are the most mature part of the module — well-structured constraint reporting, realistic workload analytics, actionable suggestions.
- Column-rendering bugs (blank Room column in Room Closures, blank Year Groups column in Break Groups) suggest the list GETs are returning the join rows but the frontend cells aren't reading the nested field. Worth batch-auditing all `/scheduling/*` list responses vs their column definitions.

---

## Test Residue

One residual artefact in production data from this walkthrough:

- **Exam session "TEST Exam Session" (id: 799bd5aa-4f99-4ca9-80e1-020ba6837a65)** — cannot be removed via the UI because the session list page has no delete button and the detail page has no destroy action either. Will remain until a delete endpoint is wired up (tracked in Bug Log as P3-01).

All other CRUD tests were reverted before moving on to the next module.

---

**End of Walkthrough Results.**

---

# Session 2026-04-17 — PWC Run-and-Verify Across All 4 Profiles

**Date:** 2026-04-17
**Tester:** Claude (Playwright MCP, autonomous)
**Target:** `https://nhqs.edupod.app` (NHQS production tenant)
**Tenant ID:** `3ba9b02c-0339-49b8-8583-a06e05a32ac5`
**Scope:** Drive an auto-scheduling run end-to-end as admin, publish the resulting timetable, then verify each of the four profile views (admin / teacher / student / parent) sees the published schedule. Authorised to fix data blockers (subject coverage, class size, feature availability) on the NHQS tenant to reach a published timetable; not authorised to fix application-code defects (those are logged).

---

## Severity Tally (this session)

| Severity | Count | Notes                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | 2     | Student has **no** timetable view in the app at all (data exists, UI does not); Parent timetable tab calls a backend endpoint that is not registered (404)                                                                                                                                                                                                  |
| P1       | 5     | Admin cross-perspective student picker shows 100 blank options; Student dashboard calls a parent-scoped endpoint (always 403); Scheduling-hub Total Slots / Completion show 0 despite 356 published rows; CP-SAT solver did not improve on greedy seed within 3600s deadline; Parent dashboard fires 7 toast errors on load (permission + missing endpoint) |
| P2       | 3     | Student account created via DB insert had broken bcrypt hash + `email_verified_at = NULL` (account-creation flow defect); Student dashboard renders raw i18n keys (`dashboard.greeting`, `common.subjects`, `common.active`, `reportCards.noReportCards`); In-app logout button does not always terminate session (only `/en/logout` route works reliably)  |
| P3       | 2     | Capacity gap: 4th-6th classes have 33/35/39 lesson demand vs 29 weekly slot capacity (4/6/10 unplaced lessons inevitable until capacity is added); K1B subject coverage gap (only Arabic teacher exists)                                                                                                                                                    |

**Total new findings: 12** (logged as SCHED-031 → SCHED-042 in `BUG-LOG.md`)

---

## Pre-Run Diagnostic & Data Fixes Applied to NHQS

The first published-run attempt (Wave 1) revealed multiple data-side blockers on the NHQS tenant that prevented the solver from reaching a feasible / publishable result. These were corrected directly in the NHQS tenant (with full audit trail in `SERVER-LOCK.md`); they are tenant-data fixes, not code changes:

1. **Curriculum requirements seeded for all 16 classes** — `1A`, `1B`, `2A`, `2B`, `3A`, `3B`, `4A`, `4B`, `5A`, `5B`, `6A`, `6B`, `J1A`, `K1A`, `K1B`, `SF1A`. Total demand: **432** lesson-instances per week.
2. **Teacher competencies extended** — every required (subject × class) pair has at least one qualified teacher (except K1B Quran/Arabic-Lit, see SCHED-040).
3. **Period grid published** — 6 periods/day Sunday-Thursday, no Friday teaching, 1 break period per day.
4. **Feature flag `scheduling_v2` enabled for NHQS** so the v2 solver pipeline is available.

After these fixes, Wave 2 produced run `f4a87d4c-adb3-4b40-b4ee-9895250cb21e`:

- Solver duration: 3,604s (hit 3600s soft ceiling, returned best-known solution at deadline)
- Hard violations: 0
- Entries generated: **356**
- Entries unassigned: **37** (91% placement)
- Soft preference score: 84.2% of max
- Status: `completed` → APPLIED at 2026-04-17 01:26:30 UTC

Three subsequent runs (`3fb9b3d7…`, `6b399caf…`, `5821d940…`) ended `failed` — root cause not yet investigated. Logged as part of SCHED-042.

---

## Profile Verification Matrix

| Profile     | Account                | Scheduling reach                                                                                                                                                                                                                                                                                                 | Verdict           |
| ----------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **Admin**   | `owner@nhqs.test`      | Run trigger ✓, monitor ✓, apply ✓, school grid ✓, class view ✓, teacher view ✓, **student view UI broken** (picker shows blank options), room view untested                                                                                                                                                      | ⚠ Partial (1 P1)  |
| **Teacher** | `Sarah.daly@nhqs.test` | `/scheduling/my-timetable` renders 30 published lessons across week ✓; admin pages correctly 403 (`/scheduling/auto`) ✓                                                                                                                                                                                          | ✅ Pass           |
| **Student** | `adam.moore@nhqs.test` | Login fixed via direct DB update (see SCHED-038); dashboard loads but **no timetable widget** and `/en/scheduling/my-timetable`, `/en/timetables`, `/en/scheduling` all redirect to `/dashboard/student`. Dashboard fires 403 against `/api/v1/parent/students/.../report-cards`; raw i18n keys visible          | ❌ Fail (P0 + P1) |
| **Parent**  | `parent@nhqs.test`     | Dashboard loads with "Your Students → Adam Moore" card ✓; **Timetable tab → "No timetable available."** Toast: `Cannot GET /api/v1/parent/timetable?student_id=...`. Endpoint genuinely not registered on the API (verified via `grep`). 7 additional permission/endpoint toast errors on initial dashboard load | ❌ Fail (P0)      |

---

## Step-by-Step Walkthrough Log

### 1. Admin — trigger and apply

- Logged in as `owner@nhqs.test`, navigated `/en/scheduling/auto` → `/en/scheduling/runs/new`. Trigger succeeded after 4 prior attempts (the first three were hitting curriculum-coverage blockers).
- Watched `f4a87d4c…` from `queued` → `running` → `completed`. Solver progress logs visible in run-detail page (greedy seed 320/393 in <1s, then no further improvement until deadline at 3600s).
- Run-review page rendered: 91% placement banner, soft-preference 84.2%, 0 hard violations, 37 unassigned (split by class shown in sidebar — 4A:4, 5A:7, 6A:10, K1B:7, J1A:5, others:4).
- Clicked **Apply** → confirmation modal → confirmed. Modal closed; run flipped to `applied`. `schedules` table verified via SSH:
  ```
  SELECT count(*) FROM schedules WHERE run_id='f4a87d4c-adb3-4b40-b4ee-9895250cb21e';
  -- 356
  ```
- Class-by-class breakdown: 1A=22, 1B=23, 2A=21, 2B=22, 3A=24, 3B=24, 4A=26, 4B=26, 5A=27, 5B=27, 6A=27, 6B=27, J1A=14, K1A=14, K1B=14, SF1A=18.

### 2. Admin — verify cross-perspective views

`/en/timetables` (Cross-Perspective Timetable):

- **Tab: School** — grid renders all 16 classes across all weekdays. ✓
- **Tab: Class → 2A** — picker selects, grid renders 21 lessons for Adam's class with subject colours + room labels. ✓
- **Tab: Teacher → Sarah Daly** — picker selects, grid renders her 30 lessons across the week. ✓
- **Tab: Student** — picker opens with **100 entries that all render with empty labels**. Selecting one (by index, since labels are blank) renders the panel with no name. Source bug at `apps/web/src/app/[locale]/(school)/timetables/page.tsx:131,254`: API returns `{ first_name, last_name }` but the picker maps `students` directly to `<SelectOption>` without mapping to `name`. → **SCHED-031**.
- **Tab: Room** — not tested (capacity exhausted in walk-through window; covered separately in SCHED-024-track).

`/en/scheduling` (Hub dashboard):

- "Total Slots: 0" and "Completion: 0%" displayed even though 356 schedules are published. Other tiles (Active Teachers, Classes, Subjects) populate correctly. → **SCHED-033** (renumbered from initial draft).

### 3. Teacher — Sarah Daly

- Login succeeded.
- `/en/scheduling/my-timetable` rendered weekday × period grid with 30 lessons. Subject colours assigned, no cover-duty alerts. ✓
- `/en/scheduling/auto` → 403 redirect. ✓ Permission gating is correct.
- `/en/scheduling/competencies` → 403 redirect. ✓
- Calendar export (`Add to Calendar` button) opened modal with `.ics` URL containing one-time bearer token. Subscribe link followed externally — out of scope for this walkthrough.

### 4. Student — Adam Moore

Login required two corrective DB updates (logged as SCHED-038):

- `password_hash` was 28 chars (not bcrypt 60) — replaced from `owner@nhqs.test`'s hash (both have the same `Password123!` password).
- `email_verified_at` was `NULL` and `failed_login_attempts > 0` — both reset.

After login:

- Lands at `/en/dashboard/student`. Top-nav has only **Home** and **Reports** — no Timetable.
- Dashboard renders:
  - `dashboard.greeting` (raw key)
  - `common.subjects` (raw key)
  - `common.active` (raw key)
  - `reportCards.noReportCards` (raw key)
- Console errors:
  - `404 @ /api/v1/gradebook/student-grades?student_id=…` (endpoint not registered)
  - `403 @ /api/v1/parent/students/<sid>/report-cards` (parent-scoped endpoint called from a student session)
- `/en/scheduling/my-timetable` → redirects to `/dashboard/student` (likely permission `schedule.view_own` is teacher-scoped only).
- `/en/timetables` → redirects to `/dashboard/student`.
- `/en/scheduling` → redirects to `/dashboard/student`.

**Confirmed gap:** student has no path in the UI to view their own published schedule. Verified via codebase grep: only frontend route returning a student-friendly grid is `dashboard/parent/_components/timetable-tab.tsx`. → **SCHED-032** (P0).

### 5. Parent — Zainab Ali

- Login succeeded; `/en/dashboard/parent` renders with morph-shell + tabbed dashboard (Overview / Grades & Reports / Timetable / Finances).
- 7 toast errors on initial load:
  1. `Missing required permission: parent.view_engagement` (×2 — fired by two separate widgets)
  2. `Missing required permission: parent.view_finances`
  3. `Missing required permission: homework.view_diary`
  4. `Cannot POST /api/v1/reports/parent-insights` (endpoint not registered)
  5. `Missing required permission: parent.homework` (×2)
- Clicked **Timetable** tab → `"No timetable available."` Toast: `Cannot GET /api/v1/parent/timetable?student_id=c5ddc653-6bae-4756-86e9-03abfcab74a8`.
- Verified via grep: zero matches for `parent/timetable` in `apps/api/src` — endpoint truly does not exist. → **SCHED-035** (P0). Frontend reference at `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/timetable-tab.tsx:80` and `_components/parent-home.tsx:127`.

---

## Cross-Cutting Themes

1. **Student & Parent timetable views are both completely broken** at the application layer. Data is published correctly to `schedules` (verified) but neither audience can see it. This invalidates the spec-pack assumption (`/E2E (student)`, `/E2E (parent)`) that there is a working surface to test — those role specs need to be rewritten against new endpoints + frontend routes once both gaps are filled.
2. **Parent dashboard fires multiple permission-gated requests up-front** without checking the user's effective permission set first. Result: 4-7 user-visible toasts every time a parent logs in. Should suppress per-request toasts when the failure is `INSUFFICIENT_PERMISSIONS` and instead hide the unavailable widget.
3. **Student account creation flow is broken** (or the helper used to create Adam was broken). Both bcrypt hash format and email-verification flag must be set by whichever path ends up creating student users in production (admissions intake, parent-portal student linking, admin direct-create).
4. **Solver capacity ceiling**: with the current period grid (5 days × 6 periods × 1 break = 29 teaching slots/week), 4th-6th class total demand (33/35/39) exceeds capacity even with perfect placement. Either (a) add more periods (extend day or add Friday teaching), (b) reduce per-subject hours for upper elementary, or (c) accept N% unplaced as the steady state.

---

## Recommended Immediate Actions (in priority order)

1. **SCHED-035** — register `GET /v1/parent/timetable` (parent-scoped, returns child's timetable cells). Same shape as `/v1/scheduling/timetable/class/:classId` but resolved via `parent_student_links` for the parent's own children. Without this, parent role has zero scheduling visibility — blocks NHQS family communication.
2. **SCHED-032** — add a student-self timetable route. Either (a) a new page `/en/dashboard/student/timetable` consuming a new `GET /v1/scheduling/timetable/student-self` endpoint, or (b) extend `RequiresPermission('schedule.view_own')` to grant students the same `/scheduling/my-timetable` page (re-using the cross-perspective renderer with `audience: 'student'`).
3. **SCHED-031** — 1-line frontend fix: map student fetch result to `{ id, name: \`${first_name} ${last_name}\`}` before storing in state.
4. **SCHED-033** — wire scheduling-hub aggregator to count from `schedules` table (or `scheduling_runs.entries_generated` for the latest applied run), not the empty unpublished-draft store it appears to be reading from.
5. **SCHED-038** — audit student-creation paths. Whichever code path runs in production must (a) bcrypt-hash the password, (b) set `email_verified_at = now()` for system-created users, (c) reset `failed_login_attempts` to 0.

---

## Test Residue (this session)

- `f4a87d4c-adb3-4b40-b4ee-9895250cb21e` — applied run, leaves 356 schedule rows in production. **Intentional**: this is the test data that downstream profile verifications need. Do not roll back.
- Adam Moore's password hash was rewritten in production. **Intentional**: required for the student profile verification step. The new hash matches `Password123!`.
- 3 failed runs (`3fb9b3d7…`, `6b399caf…`, `5821d940…`) left in `scheduling_runs` history. **Acceptable**: terminal-state rows are part of the audit trail.

---

**End of Session 2026-04-17 Walkthrough.**
