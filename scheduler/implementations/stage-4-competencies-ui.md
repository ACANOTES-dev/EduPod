# Stage 4 — Competencies page UI rebuild

**Before you start:** open `../IMPLEMENTATION_LOG.md`. Confirm Stages 1, 2, and 3 are `complete`. Read Stage 3's completion entry carefully — especially the exact shape of the `coverage` endpoint response and any surprises from the API rebuild.

## Purpose

Replace the two-tab ("By Teacher" / "By Subject + Year") competencies page with a single year-group-centred page that exposes both **pool entries** (teacher is qualified for the whole year group) and **pins** (teacher is assigned to a specific subclass). Rebuild the coverage page to match the new per-class granularity from Stage 3.

## Prerequisites

- Stage 3 complete: API accepts `class_id` on create/update, coverage endpoint returns per-class rows.

## Scope

### Pages

- `apps/web/src/app/[locale]/(school)/scheduling/competencies/page.tsx` — complete rebuild.
- `apps/web/src/app/[locale]/(school)/scheduling/competency-coverage/page.tsx` — rebuild to show per-class coverage grid.
- Any `_components/` subfolder for these pages — rebuild or replace.

### User flow for the new competencies page

1. User lands on `/scheduling/competencies` — back link to `/scheduling` (already provided by the scheduling layout; just make sure the page doesn't render its own back link).
2. Page header: "Teacher Competencies" + description "Who can teach what. Assign teachers at the year-group level, or pin to a specific section."
3. A **year group picker** (select or chip bar) across the top. Selecting a year group is the primary navigation action.
4. On selection, the page body renders:
   - A **subtab bar** listing every class in that year group (e.g., `1A | 1B`), plus a leading tab `All (pool)`.
   - The **"All (pool)" tab** shows a grid: rows = subjects in this year group's curriculum, columns = all teachers on staff. A ticked cell means "this teacher is pooled for this subject in this year group" → `POST teacher_competencies { year_group_id, subject_id, class_id: null }`.
   - Each **class subtab** (e.g., `1A`) shows the same rows (subjects) but one column per teacher, with radio/select semantics: **at most one teacher per (class, subject)**. Picking a teacher here creates a pin `POST teacher_competencies { year_group_id, subject_id, class_id: <1A> }`. Picking "none" deletes any existing pin.
5. Empty / missing state: a subject that appears in the curriculum for this year group but has no competency (pool or pin) anywhere renders with a red dot and a "Needs a teacher" hint.
6. A visible legend at the top distinguishing pool (blue chip) from pinned (filled cell) from missing (red dot).

### Coverage page

- Replace the current year-group-level matrix with a per-class matrix.
- Columns: one per class across all year groups (grouped visually by year).
- Rows: subjects (union of curriculum across all year groups).
- Cell states: `covered` (green), `pool-only` (blue — a pool entry exists but no class-level pin), `pinned` (solid green), `missing` (red).
- A filter toggle "show only problems" highlights missing rows.

### Drop these artefacts

- The "By Teacher" tab and its component.
- The "By Subject + Year" tab and its component.
- Any star/primary toggle in the UI.
- The hook or component that read `is_primary`.

### i18n

Update `messages/en.json` and `messages/ar.json` under `scheduling.v2`:

- Remove any strings referencing "primary" / "secondary".
- Add: `poolMode`, `pinMode`, `poolLabel`, `pinLabel`, `missingLabel`, `selectYearGroup`, `selectClass`, `selectTeacher`, `noTeacherForSubject`, legend strings.
- Mirror in `ar.json`.

## Non-goals

- Do **not** seed or wipe data. Stage 5.
- Do **not** generate a schedule. Stage 6.
- Do **not** build the substitutes page. Stage 7.
- Do **not** modify consumer pages (assessments dashboard, report comments). Stage 8.

## Step-by-step

1. Read the current `competencies/page.tsx` top-to-bottom. Note every data dependency (what endpoints it hits, what hooks it uses). You'll replace this, but existing components that are generic (e.g., loading spinners, PageHeader) remain.
2. Sketch the component tree before coding:
   - `<CompetenciesPage>` — fetches year groups, picks one.
   - `<YearGroupBoard yearGroupId>` — fetches curriculum for the year group + classes + competencies + staff list.
   - `<PoolMatrix yearGroupId, subjects, teachers, competencies>` — rows = subjects, cols = teachers.
   - `<PinMatrix classId, subjects, teachers, competencies>` — rows = subjects, one-of-N per row.
3. Build data hooks:
   - `useYearGroups(academicYearId)`.
   - `useYearGroupClasses(yearGroupId)`.
   - `useCurriculumForYearGroup(yearGroupId)`.
   - `useCompetenciesForYearGroup(yearGroupId)` (returns both pool and pinned for that year group).
   - `useStaffList()`.
     Reuse existing `apiClient<T>` with `useEffect` — do **not** introduce server-component fetching.
4. Build the `<PoolMatrix>`:
   - A ticked checkbox creates a competency with `class_id: null`.
   - Unticking deletes the matching competency.
   - Optimistic update with toast on failure.
5. Build the `<PinMatrix>` per class:
   - One `<Select>` per subject row. Options: `— none —` plus every teacher who has a pool entry for that subject in this year group (preferred), then every other teacher (still selectable; creates an implicit pin without a pool).
   - Changing the selection creates or replaces the pin for `(class_id, subject_id)`.
   - Only one pin can exist per `(class_id, subject_id)`; if one already exists, the create call will 409 and the UI must handle that by deleting the existing and creating the new in one flow (helper service method).
6. Build the new coverage page. Column-first rendering; CSS grid or a sticky-header table.
7. Update i18n keys; validate JSON parses.
8. `turbo type-check` clean. `turbo lint` clean. RTL check: **never** use `ml-`, `mr-`, `pl-`, `pr-`, `text-left`, `text-right` etc. Logical properties only (`ms-`, `me-`, `ps-`, `pe-`, `text-start`, `text-end`).
9. Write unit tests for any complex logic (e.g., the optimistic update reducer).
10. Deploy: rsync source files, rebuild `@school/web`, restart `web` PM2.
11. **Playwright verification** (mandatory — see below).
12. Commit locally, append to the log.

## Testing requirements

### Unit

If you extracted reducers / helpers, unit-test them. React component tests aren't mandatory for this project but are welcome.

### Browser — Playwright (mandatory)

Run on `https://nhqs.edupod.app` as `owner@nhqs.test` / `Password123!`. **This stage is not complete without these flows passing.**

1. Navigate `/en/scheduling` → "Teaching Staff" card → "Competencies".
2. Confirm the old "By Teacher" / "By Subject+Year" tabs are gone.
3. Select a year group (e.g. "1st class").
4. "All (pool)" tab: verify the matrix renders with subjects × teachers. Tick a cell. Observe toast. Refresh — cell stays ticked.
5. Switch to a class subtab (e.g. "1A"). Verify the subject list matches curriculum.
6. For a subject, pick a teacher. Verify the pin is saved (refresh persists).
7. Change the pin to a different teacher. Verify the previous pin is replaced, not duplicated.
8. Set the pin back to `— none —`. Verify the pin is deleted.
9. Navigate to `/en/scheduling/competency-coverage`. Verify per-class columns, per-subject rows.
10. With at least one subject missing a teacher, confirm the red "missing" state renders in the coverage page.
11. RTL sanity: switch locale to `ar`, reload both pages, confirm layout mirrors correctly. No physical directional classes in the rendered DOM (`ml-`, `mr-`, etc.).

Attach relevant `browser_snapshot` output summaries to the log entry.

### Coverage

Web-side coverage isn't strictly enforced in CI; still run `pnpm --filter @school/web test` if tests exist and ensure they pass.

## Acceptance criteria

- [x] Old tabs deleted; new year-group-centred layout live.
- [x] Pool entries create / delete via `class_id: null`.
- [x] Pin entries create / delete via `class_id: <uuid>`; at-most-one per `(class, subject)`.
- [x] Coverage page per-class.
- [x] i18n keys updated for en + ar; JSON parses.
- [x] No RTL lint violations (`turbo lint`).
- [x] Playwright flows pass on nhqs prod.
- [x] Local commit; nothing pushed.
- [x] Completion entry appended.

## If something goes wrong

- **Pin replacement 409s**: your service method isn't deleting the existing pin before creating the new one. Centralise the "set pin for (class, subject)" logic in a single helper so there's one code path.
- **Pool ticks appear to persist but disappear on refresh**: optimistic update is fine but the actual POST failed silently. Check the catch block — every POST must surface errors via `toast.error(msg)`.
- **Coverage page shows blank**: the API returns an array; ensure the frontend expects the Stage 3 shape (`{ class_id, subject_id, mode, ... }`), not the legacy shape.
