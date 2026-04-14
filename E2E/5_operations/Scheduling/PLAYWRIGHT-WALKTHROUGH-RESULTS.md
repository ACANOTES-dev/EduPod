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
