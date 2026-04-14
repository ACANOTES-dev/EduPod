# Stage 9 — Audience-specific timetable views

**Before you start:** open `../IMPLEMENTATION_LOG.md`. Confirm Stages 1–8 are `complete`. Stage 9 is the first stage _after_ the rebuild — it adds end-user views on top of the schedules table that's now the source of truth.

## Purpose

The scheduler now generates and persists timetables. Teachers can already see their own (`/scheduling/my-timetable`). What's missing is a coherent set of **read-only timetable views** for each audience:

| Audience | Views they need                                                           |
| -------- | ------------------------------------------------------------------------- |
| Admin    | All classes, all teachers, all students, all rooms (selector + grid each) |
| Teacher  | Any class, own timetable                                                  |
| Student  | Own class, own personal timetable                                         |
| Parent   | Each enrolled child's timetable                                           |

The shared mental model: **one weekly grid component**, four data sources behind it, route-level permission gating, audience-specific entity pickers.

## Prerequisites

- Stages 1–8 complete; an applied schedule exists for the active academic year (run an end-to-end if NHQS is empty).
- The grid component pattern from `/scheduling/my-timetable` is reusable (week selector + period rows + day columns); Stage 9 lifts it into a shared `<TimetableGrid />` so each new page is just a fetch + props pass.

## Scope

### Backend

Most of the work is already done:

- ✅ `GET /v1/timetables/teacher/:staffProfileId?academic_year_id=…&week_start=YYYY-MM-DD` — gates on `schedule.manage` OR `schedule.view_own` + same-user check.
- ✅ `GET /v1/timetables/room/:roomId?…` — `schedule.manage`.
- ✅ `GET /v1/timetables/student/:studentId?…` — `students.view`.
- ❌ **Add** `GET /v1/timetables/class/:classId?academic_year_id=…&week_start=YYYY-MM-DD` — `schedule.manage` OR `schedule.view_own_class` (new permission for students/teachers viewing the class they belong to). The data path already exists via `SchedulesReadFacade.findClassTimetable`; just expose it.

Also extend the parent-facing layer:

- New permission check on `GET /v1/timetables/student/:studentId` (or a separate `/v1/parent/timetables/student/:studentId` route): allow `parents.view_own_children` when the student is in the parent's `student_parents` link.

### Shared component

`apps/web/src/components/timetable-grid.tsx` (new) — extracted from `/scheduling/my-timetable`'s render code:

- Props: `entries: TimetableEntry[]`, `weekStart: Date`, `weekdays: number[]`, `periods: PeriodRow[]`, `getCellLabel: (entry) => { primary, secondary, tertiary }`, `dir: 'ltr' | 'rtl'`.
- Renders the standard period × weekday grid with cell content driven by `getCellLabel`. The same grid is used for all audiences; only the cell label differs (teacher view shows class+subject+room, room view shows class+teacher+subject, etc.).
- Print-friendly variant: `<TimetableGrid printMode />` strips the morph shell and renders an A4-portrait table for sticking on a door (for room view especially).

### Frontend pages

#### Admin pages (under `/scheduling/timetables/…`, gated by ADMIN_ROLES)

1. `/scheduling/timetables/classes/page.tsx` — class selector (year-group filter → class list), then `<TimetableGrid />` filtered by class.
2. `/scheduling/timetables/teachers/page.tsx` — teacher selector (department filter → teacher list), then grid.
3. `/scheduling/timetables/students/page.tsx` — student selector (class filter → student list), then grid.
4. `/scheduling/timetables/rooms/page.tsx` — room selector (room-type filter → room list), then grid + a "Print" button that opens the print-mode variant in a new tab.

These four pages share a layout pattern: left rail is the entity picker (with search), right side is the grid. On mobile, picker collapses to a top dropdown.

#### Teacher pages

5. `/scheduling/my-timetable` — already exists. Add a "Browse other classes" link that navigates to `/scheduling/timetables/classes` (gated by a new `schedule.view_class` permission auto-granted to teachers).
6. `/scheduling/timetables/classes/page.tsx` — same admin page, but the route-roles map allows `teacher` in addition to ADMIN_ROLES. Permission gate prevents misuse.

#### Student pages

7. `/dashboard/student/timetable/page.tsx` — own personal view. Same `<TimetableGrid />`, fetches `/v1/timetables/student/${selfStudentId}`. Add a "Show class timetable" toggle that swaps to the class endpoint with the student's enrolled class id.

#### Parent pages

8. `/parents/students/[id]/timetable/page.tsx` — parent picks a child from their dashboard, lands here. Backend gate enforces the parent-child link.
9. Surface a "Timetable" link on the existing parent dashboard's per-child card.

### Hub tile updates

`/scheduling/page.tsx` — add a new "Timetable Views" category between "Day-to-day Operations" and "Analytics & Reports", containing four tiles (Classes / Teachers / Students / Rooms). Each tile only renders if the current user has the matching permission.

### i18n

New keys under `scheduling.timetables.*` for the page titles, selector labels, empty states, and print button. Mirror in `ar.json`.

### Permissions

Add three new permission strings to the seed (and to the platform tenant's permission registry):

- `schedule.view_class` — teacher / student can view any class's timetable.
- `parents.view_own_children` — parent can view their own children's data (likely already exists; verify).
- (existing) `schedule.manage` and `schedule.view_own` continue to gate teacher routes.

## Non-goals

- iCal / Google Calendar export — Stage 10.
- Live "now" indicator on the grid (red line at current time) — out of scope.
- Substitution overlays (when a teacher is absent, mark cells with a sub) — already partially handled in personal-timetable.service for own view; not extended to other audiences in Stage 9.
- Edit-in-place — read-only views only. Edits remain at `/scheduling/runs/[id]/review` for admin.
- Conflict highlighting — out of scope. (Conflicts are caught at solver/apply time; live editing isn't part of this stage.)

## Step-by-step

1. **Backend — class endpoint.** Add `GET /v1/timetables/class/:classId` to `timetables.controller.ts`. Wire to `TimetablesService.getClassTimetable` (mirror the teacher method's permission flow: `schedule.manage` OR `schedule.view_class`). Unit-test.
2. **Backend — parent gate on student endpoint.** Extend the student endpoint's permission check to allow parents who are linked to that student. Update spec.
3. **Shared component.** Extract `<TimetableGrid />` from `/scheduling/my-timetable/page.tsx` into `components/timetable-grid.tsx`. Refactor my-timetable to use it (proves the abstraction). Run the existing my-timetable Playwright check.
4. **Admin — classes page.** Build `/scheduling/timetables/classes/page.tsx`. Picker on the left (year-group dropdown filters list), grid on the right. Empty-state when no class selected.
5. **Admin — teachers page.** Mirror with teacher picker (department filter) + teacher endpoint.
6. **Admin — students page.** Mirror with student picker (class filter) + student endpoint.
7. **Admin — rooms page.** Mirror with room picker (room-type filter) + room endpoint. Add print button → new tab to `/scheduling/timetables/rooms/[roomId]/print` route that wraps `<TimetableGrid printMode />` in a minimal layout (no shell).
8. **Hub tile updates.** Add the four tiles to `/scheduling/page.tsx`. Add i18n.
9. **Teacher access.** Update `route-roles.ts` to allow `teacher` on `/scheduling/timetables/classes`. Confirm permission check.
10. **Student own view.** Build `/dashboard/student/timetable/page.tsx`. Surface in the student dashboard.
11. **Student class toggle.** On the student timetable page, add a "Show class view" toggle.
12. **Parent — child timetable.** Build `/parents/students/[id]/timetable/page.tsx`. Surface on parent dashboard cards.
13. **Permission seed.** Add `schedule.view_class` to the platform permission registry seed and assign to teacher + student roles by default.
14. **i18n.** All new keys in en + ar.
15. **type-check + lint + DI smoke.**
16. **Deploy** — rsync api + web, rebuild, restart.
17. **Playwright verification** (mandatory; see below).
18. **Append completion entry to log; flip status board to `complete` for Stage 9.**

## Testing requirements

### Unit

- `timetables.controller.spec.ts` — extend with class endpoint test (manage + view_class permission paths).
- Parent gate on student endpoint — both the linked-parent allow case and the unlinked-parent denial case.
- `<TimetableGrid />` component test — render a known set of entries, verify cell labels.

### Integration

- `apps/api/test/scheduling/timetables.e2e-spec.ts` — exercise all four endpoints with permission denials per role.

### Browser — Playwright (mandatory)

Five flows on `nhqs.edupod.app`:

1. **Owner Yusuf**: navigate `/en/scheduling/timetables/classes` → pick K1A → grid renders. Repeat for teachers, students, rooms. Print room view in a new tab.
2. **Teacher Sarah Daly**: `/en/scheduling/my-timetable` → grid renders. Click "Browse classes" → `/en/scheduling/timetables/classes` → pick K1A → grid renders. Confirm she cannot navigate to `/scheduling/timetables/teachers` or `/rooms` (admin-only).
3. **Student Adam Moore**: `/en/dashboard/student/timetable` → own grid renders. Toggle "Show class view" → grid swaps to class 2A.
4. **Parent Zainab Ali**: dashboard → click child → `/en/parents/students/<adamId>/timetable` → grid renders. Confirm she cannot view another student's timetable (404 / 403).
5. **RTL pass** on `/ar/scheduling/timetables/classes` — `dir="rtl"`, header + selector translated, grid days stay in correct order (logical layout, weekdays right-to-left).

### Coverage

Ratchet up.

## Acceptance criteria

- [ ] Backend `GET /v1/timetables/class/:classId` live; parent gate on student endpoint live.
- [ ] Shared `<TimetableGrid />` extracted; `/scheduling/my-timetable` refactored without regression.
- [ ] Four admin pages live: classes, teachers, students, rooms.
- [ ] Room print page works in a new tab.
- [ ] Student personal + class views live.
- [ ] Parent child-timetable view live with backend gate enforced.
- [ ] Hub tiles permission-aware.
- [ ] i18n en + ar; RTL renders cleanly.
- [ ] Playwright flows 1–5 pass.
- [ ] type-check / lint / DI clean.
- [ ] Local commit; nothing pushed.
- [ ] Completion entry appended; status board flipped.

## After this stage

- Stage 10 candidates: iCal export, mobile-native print, "now" indicator, substitution overlays for non-self audiences, classroom-display kiosk mode (auto-rotating room views).

## If something goes wrong

- **Parent sees no children**: the `student_parents` table link may be missing. Verify the join in `findStudentsForParent` and confirm the parent has at least one active row.
- **Student class toggle shows wrong class**: the student → class resolution must use the active enrolment for the current academic year, not historical.
- **Print mode includes the morph shell**: the `printMode` variant must opt out of the `(school)` route group's layout. Use a separate route segment like `/scheduling/timetables/rooms/[roomId]/print` outside the `(school)` group, OR use `display: print` CSS to hide the shell.
- **Permission deny on teacher viewing class**: confirm `schedule.view_class` was assigned to the teacher role in the seed, OR fall back to a runtime check that the teacher is scheduled for that class.
