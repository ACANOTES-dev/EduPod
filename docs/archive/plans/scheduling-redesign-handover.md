# Scheduling Module Redesign — Handover Document

## Purpose

This document provides a new session with everything needed to fix bugs, restructure navigation, and improve the scheduling module. The auto-scheduler engine itself works — the problems are in the configuration screens feeding it and the UI structure.

**Full specification**: `/Users/ram/Downloads/scheduling-spec-notes.md` (the user's original notes — read this first)

---

## Current Architecture

### Sidebar Navigation (apps/web/src/app/[locale]/(school)/layout.tsx)

The Scheduling section currently lists 8 items:

- Rooms → `/rooms`
- Schedules → `/schedules`
- Timetables → `/timetables`
- Auto-Scheduling → `/scheduling/auto`
- Period Grid → `/scheduling/period-grid`
- Curriculum → `/scheduling/curriculum`
- Competencies → `/scheduling/competencies`
- Runs → `/scheduling/runs`

### Frontend Pages

| Route                                                         | Purpose                                 |
| ------------------------------------------------------------- | --------------------------------------- |
| `apps/web/src/app/[locale]/(school)/rooms/`                   | Room management (works fine)            |
| `apps/web/src/app/[locale]/(school)/schedules/`               | Schedule list view                      |
| `apps/web/src/app/[locale]/(school)/timetables/`              | Timetable view (duplicate of schedules) |
| `apps/web/src/app/[locale]/(school)/scheduling/`              | Sub-pages with horizontal nav bar       |
| `apps/web/src/app/[locale]/(school)/scheduling/auto/`         | Auto-scheduler                          |
| `apps/web/src/app/[locale]/(school)/scheduling/period-grid/`  | Period grid config                      |
| `apps/web/src/app/[locale]/(school)/scheduling/curriculum/`   | Curriculum requirements                 |
| `apps/web/src/app/[locale]/(school)/scheduling/competencies/` | Teacher-subject-year mapping            |
| `apps/web/src/app/[locale]/(school)/scheduling/runs/`         | Scheduling run history                  |

The `/scheduling/` route has its own horizontal nav bar layout that lists: Dashboard, Period, Curriculum, Competencies, Break Groups, Teacher Config, Room Closures, Staff Availability, Staff Preference, Staff Requirements, Auto Scheduler, Scheduling Runs. This overlaps significantly with the main sidebar.

### Backend

| Module                      | Path                                                       |
| --------------------------- | ---------------------------------------------------------- |
| Scheduling service          | `apps/api/src/modules/scheduling/`                         |
| Schedule CRUD               | `apps/api/src/modules/scheduling/schedules.service.ts`     |
| Period grid                 | `apps/api/src/modules/scheduling/period-grid.service.ts`   |
| Curriculum                  | `apps/api/src/modules/scheduling/curriculum.service.ts`    |
| Competencies                | `apps/api/src/modules/scheduling/competencies.service.ts`  |
| Auto-scheduler (CSP solver) | `packages/shared/src/scheduler/`                           |
| Scheduling controller       | `apps/api/src/modules/scheduling/scheduling.controller.ts` |

### Key Database Models

- `Schedule` — individual schedule entries (class, teacher, room, weekday, start/end time)
- `PeriodGridEntry` — defines the period structure per year group per day
- `CurriculumEntry` — subject period requirements per year group
- `TeacherCompetency` — teacher-subject-year mapping
- `BreakGroup` — break/supervision periods
- `StaffAvailability` — teacher available hours per day
- `StaffPreference` — teacher subject preferences
- `SchedulingRun` — auto-scheduler run history

### Work Days Setting (already built)

The `workDays` array in tenant settings (`[0,1,2,3,4,5,6]` where 0=Sunday, 6=Saturday) was added in this session. The scheduling module needs to use this for:

- Displaying correct day columns in period grid, timetable views, staff availability
- The auto-scheduler should only generate schedules for configured work days

---

## Phase A: Critical Bug Fixes (do first)

### Bug 1: Teacher names invisible in dropdowns (CRITICAL)

**Affects**: Every teacher dropdown across the entire scheduling module (schedules, timetables, competencies, staff availability, staff preference, teacher config).

**Likely cause**: CSS/theme issue — the dropdown renders rows but text colour matches background. Probably a missing text colour class on the option/item elements, or a dark-mode-specific issue where selected state sets white text on white background.

**How to find**: Search for teacher dropdown/select components in the scheduling frontend pages. Check what component renders teacher names — likely a `Select`/`SelectItem` or `Combobox`. Compare with working dropdowns elsewhere (e.g., student form household combobox). The fix is likely one CSS class change that resolves it everywhere.

### Bug 2: Dark mode white-on-white (CRITICAL)

**Affects**: Staff availability day selection, possibly other selected states.

**Same root cause** as Bug 1. When a day or item is selected, background turns white but text is also white. In light mode everything is visible. Fix the colour handling for selected/active states throughout scheduling components.

**Approach**: Search for the scheduling layout/shared components. There's likely a shared component or utility class used across all scheduling sub-pages that sets incorrect colours.

### Bug 3: Dashboard "Validation failed" error on load

**Location**: `/scheduling/` dashboard page

**Likely cause**: An API call on mount is sending invalid params or hitting a non-existent endpoint. Check the useEffect/data fetching in the dashboard component. Could be a missing academic year param or wrong query structure.

### Bug 4: Period Grid "Validation failed" error on load

**Location**: `/scheduling/period-grid/`

**Same pattern** as Bug 3. Check the initial data fetch.

### Bug 5: Curriculum — subject name shows as "–"

**Location**: `/scheduling/curriculum/`

**Issue**: Subject saves successfully but name renders as hyphen. The API likely returns the subject relation data but the frontend is reading the wrong property (e.g., `subject.name` vs `subject_name` vs `subject?.name`). Check the response shape vs what the component renders.

### Bug 6: Curriculum — false "requires more periods than available" error

**Location**: `/scheduling/curriculum/`

**Issue**: Error shows "Allocated 5 from 0, remaining -5" — the available period count is zero. The system isn't reading the period grid configuration. Check how the curriculum page queries available periods — it likely needs the academic year + year group to look up period grid entries, and one of those params is missing or wrong.

### Bug 7: Curriculum — "preferred per week" auto-fills from minimum

**Location**: Curriculum creation/edit form

**Fix**: Remove the auto-fill logic. The `preferred_per_week` field should default to empty/null, not copy from `min_periods_per_week`.

### Bug 8: Competencies — checkbox toggle broken

**Location**: `/scheduling/competencies/`

**Issue**: Single click does nothing, double click either unchecks or throws error. This is likely a state management bug — the onClick handler may be firing twice, or the optimistic update conflicts with the API response. Check the toggle handler and whether it's using controlled vs uncontrolled state correctly.

### Bug 9: Competencies — teacher names not rendering in "By Subject" view

**Location**: `/scheduling/competencies/` — "By Subject and Year" tab

**Same root cause** as Bug 5 (curriculum subject name). The teacher relation data exists but the frontend reads the wrong property path.

### Bug 10: Teacher Configuration — non-functional

**Location**: Likely `/scheduling/teacher-config/` or a tab within the scheduling layout

**Issue**: Interface shows but cannot add or edit teaching load limits. Investigate whether the API endpoints exist and whether the frontend form is wired up. This may be a partially implemented feature.

---

## Phase B: Navigation Restructure

### Step 1: Collapse main sidebar

Change the Scheduling section in `apps/web/src/app/[locale]/(school)/layout.tsx` from 8 items to 2:

```
Scheduling:
  - Rooms → /rooms
  - Scheduling → /scheduling
```

Remove: Schedules, Timetables, Auto-Scheduling, Period Grid, Curriculum, Competencies, Runs from the main sidebar.

### Step 2: Vertical sub-navigation inside /scheduling

Replace the current horizontal scrolling nav bar in the scheduling layout with a **vertical sidebar** (secondary nav). The scheduling layout at `apps/web/src/app/[locale]/(school)/scheduling/layout.tsx` needs to render a left sidebar with these items:

- Dashboard → `/scheduling`
- Period Grid → `/scheduling/period-grid`
- Curriculum → `/scheduling/curriculum`
- Competencies → `/scheduling/competencies`
- Break Groups → `/scheduling/break-groups`
- Teacher Config → `/scheduling/teacher-config`
- Room Closures → `/scheduling/room-closures`
- Staff Availability → `/scheduling/staff-availability`
- Staff Preference → `/scheduling/staff-preference`
- Staff Requirements → `/scheduling/staff-requirements`
- Auto Scheduler → `/scheduling/auto`
- Scheduling Runs → `/scheduling/runs`

### Step 3: Dashboard cleanup

Remove the 6 shortcut cards from the scheduling dashboard body. Replace with summary/status information (e.g., "12 classes configured", "3 teachers without competencies", "Auto-scheduler ready / not ready" with prerequisite checklist).

---

## Phase C: Merge Schedules + Timetables into Calendar Grid

### What to build

Consolidate `/schedules` and `/timetables` into a single view. Can live at `/scheduling/timetable` inside the scheduling sub-nav, or as a top-level `/timetables` route.

**Filters**: Class (homeroom dropdown), Teacher, Room, Day — all with "All" option.

**Display**: Visual calendar grid:

- Columns = work days (from tenant settings `workDays`)
- Rows = periods/time slots (from period grid configuration)
- Each cell = subject name, teacher name, room name
- Styled like a real printed timetable

**When Class is selected**: Shows that class's weekly timetable
**When Teacher is selected**: Shows that teacher's weekly teaching schedule
**When Room is selected**: Shows that room's usage schedule

### Remove

- "Create Schedule" button from the view page (schedules come from auto-scheduler only)
- Student filter from timetables (replace with Class filter)
- The old flat list/table view of schedules

### Data source

`GET /api/v1/schedules` already returns schedule entries with class, teacher, room, weekday, start_time, end_time. The frontend just needs to render them as a grid instead of a table.

---

## Phase D: Export + Parent Portal Integration

### PDF export

Add a "Download PDF" button to the timetable calendar grid view. Render the grid as HTML, send to Puppeteer for PDF generation. Follow the same pattern as report card PDF generation.

### "Make Available to Parents" button

**Validation**: Only enabled when a single class is selected (not "All Classes").

**Behaviour**: Creates a dynamic link in the parent portal — NOT a one-time PDF. When a parent views their student's profile, they see the current timetable. If the schedule changes, parents see the updated version automatically.

**Implementation**: Add a `timetable_published` boolean (or timestamp) to the class or a new `published_timetables` table. The parent portal queries schedules for the student's class and renders the same calendar grid component.

### Parent portal — student profile additions

The parent portal student profile should include tabs/sections for:

- Timetable/Schedule (from this module)
- Attendance (from attendance module)
- Gradebook/Grades (from gradebook module — depends on gradebook redesign)
- Report Cards (from report cards module — depends on report cards Phase G)

**Note**: Only build the timetable tab now. The others depend on their respective modules being complete.

---

## Phase E: Work Days Integration

The `workDays` tenant setting is already built. It needs to flow into:

1. **Period grid** — only show columns for configured work days, not hardcoded Mon-Sat
2. **Staff availability** — only show configured work days
3. **Timetable/calendar grid** — columns match work days
4. **Auto-scheduler** — only generate schedules for work days

This is mostly a matter of fetching `GET /api/v1/settings` and using `settings.attendance.workDays` to filter displayed days. Could be done as part of the bug fixes or as a separate pass.

---

## Key Files to Reference

| Purpose                            | Path                                                       |
| ---------------------------------- | ---------------------------------------------------------- |
| Main sidebar navigation            | `apps/web/src/app/[locale]/(school)/layout.tsx`            |
| Scheduling layout (horizontal nav) | `apps/web/src/app/[locale]/(school)/scheduling/layout.tsx` |
| Scheduling frontend pages          | `apps/web/src/app/[locale]/(school)/scheduling/*/`         |
| Schedules page                     | `apps/web/src/app/[locale]/(school)/schedules/`            |
| Timetables page                    | `apps/web/src/app/[locale]/(school)/timetables/`           |
| Rooms page                         | `apps/web/src/app/[locale]/(school)/rooms/`                |
| Scheduling backend                 | `apps/api/src/modules/scheduling/`                         |
| CSP solver                         | `packages/shared/src/scheduler/`                           |
| Tenant settings (workDays)         | `packages/shared/src/schemas/tenant.schema.ts`             |
| Settings service                   | `apps/api/src/modules/configuration/settings.service.ts`   |
| Translation files                  | `apps/web/messages/en.json`, `apps/web/messages/ar.json`   |
| User's full spec                   | `/Users/ram/Downloads/scheduling-spec-notes.md`            |

## Implementation Order

```
Phase A (bug fixes)  →  Phase B (nav restructure)  →  Phase C (calendar grid view)
                                                          ↓
                                                     Phase D (PDF export + parent portal)
                                                          ↓
                                                     Phase E (work days integration)
```

Phase A is a standalone session — lots of small fixes. Phase B can be combined with A if time permits. Phase C is a medium-sized feature. Phase D depends on C. Phase E can be woven into any phase.

**Important**: The auto-scheduler itself (Phase 4b in the original build plan) is already built. It just can't run because upstream config screens are broken. Fixing Phases A-B unblocks it.
