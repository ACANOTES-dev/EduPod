# Implementation 15 — Individual Report Pages UI (kill mocks + title fixes)

> **Wave:** 4 (parallel, web restart)
> **Depends on:** 01, 05
> **Deploys:** web restart only

---

## Goal

Delete every `MOCK_*` constant from the individual report pages and wire them to the real backend endpoints finished in impl 05. Fix the inconsistent translation-key namespaces and remove stub labels (`en.json:233 "gradeAnalytics": "Analytics"`). Add the AI summary panel (flag-gated) to every page.

Pages touched (all under `apps/web/src/app/[locale]/(school)/reports/`):

- `attendance/page.tsx` — already real; add AI panel + info tooltips on sub-KPIs.
- `grades/page.tsx` — **delete** `MOCK_PASS_FAIL`, `MOCK_DISTRIBUTION`, `MOCK_TOP_PERFORMERS`; wire `/v1/reports/grades/*` endpoints.
- `demographics/page.tsx` — delete `NATIONALITY_DATA`, `GENDER_BY_YEAR`, `AGE_DISTRIBUTION`; wire.
- `admissions/page.tsx` — verify real; if any mock constants remain, remove.
- `staff/page.tsx` — verify real; add AI panel.
- `student-progress/page.tsx` — delete mocks; add AI prediction panel per student (flag-gated).
- `insights/page.tsx` — delete `MOCK_SCATTER`, `MOCK_COST`, `MOCK_HEALTH`; wire cross-module insights.

## What to change

### 1. Universal changes per report page

- **Delete every `MOCK_*` constant.** Grep: `grep -rn "MOCK_\|_DATA = " apps/web/src/app/\[locale\]/\(school\)/reports/` — nothing in a data-role constant should be hardcoded at module scope.
- **Add real data fetching** via `apiClient<T>` in `useEffect`.
- **Add error state** — bordered card on fetch failure, no silent mock fallback.
- **Add loading state** — skeleton placeholders matching the layout.
- **Add info-icon tooltips** on all sub-KPIs (the mini-dashboards at the top of each report page).
- **Add AI Summary Panel** at the top of every report page, flag-gated behind `reports_narration`.
- **Add Export buttons** in the header — `<Button>PDF</Button> <Button>Excel</Button> <Button>Word</Button>` that fire `POST /v1/reports/analytics/:reportKey/export`. Disabled if the page has no meaningful tabular export.
- **Add Schedule button** that opens the scheduled-reports modal (from impl 17) pre-filled with this report's identifier.

### 2. Translation-key normalisation

In one sweep across `messages/en.json`:

- **Delete** line 233 stub `"gradeAnalytics": "Analytics"` (and any mirror in `messages/ar.json`).
- **Every report title** uses `reports.analytics.<name>` (not `reports.<name>`).
- **Rename** `reports.studentExport` → `reports.analytics.studentExport`, same for `writeOffs`, `notificationDelivery`. Update the two files + every component that references them.
- **Add** missing `<key>Desc` entries for each tile that doesn't have a description.
- **Add** missing `<key>Desc` entries for each report page's subtitle.

Run `grep -rn "reports\." apps/web/src/` to find every usage and adjust.

### 3. Title fixes per page

For each page, the `PageHeader` prop `title` reads `t('analytics.<reportKey>')`. The title value in the JSON must be:

- Attendance Analytics → "Attendance Analytics"
- Grade Analytics → "Grade Analytics"
- Student Demographics → "Student Demographics"
- Student Progress Tracker → "Student Progress"
- Admissions Funnel → "Admissions Funnel"
- Staff Analytics → "Staff Analytics"
- Cross-Module Insights → "Cross-Module Insights"

Description keys (subtitles under each title) are added to `en.json` with short, plain descriptions.

### 4. Data wiring specifics per page

**Grades (`grades/page.tsx`):**

- Pass/fail rates: `GET /v1/reports/grades/pass-fail-rates?academic_period_id=<current>`
- Distribution histogram: `GET /v1/reports/grades/distribution?...`
- Top/bottom performers: `GET /v1/reports/grades/top-bottom-performers?limit=10`
- Subject difficulty: `GET /v1/reports/grades/subject-difficulty?...`

**Demographics (`demographics/page.tsx`):**

- Nationality: `GET /v1/reports/demographics/nationality`
- Gender balance: `GET /v1/reports/demographics/gender-balance`
- Age distribution: `GET /v1/reports/demographics/age-distribution`
- Year group sizes: `GET /v1/reports/demographics/year-group-sizes`

**Insights (`insights/page.tsx`):**

- Attendance vs grades scatter: `GET /v1/reports/insights/attendance-vs-grades`
- Cost per student: `GET /v1/reports/insights/cost-per-student`
- Year group health: `GET /v1/reports/insights/year-group-health`

**Student Progress (`student-progress/page.tsx`):**

- Cohort trends: `GET /v1/reports/student-progress/trends?year_group_id=<x>`
- Per-student progress: `GET /v1/reports/student-progress/:studentId`
- At-risk (new this week): `GET /v1/reports/student-progress/at-risk-new`

All filter controls (year group selector, term selector, date range) lift to local component state and re-fetch on change.

### 5. AI Prediction panel (student-progress page only)

Flag-gated by `reports_predictions`. When a student is selected, show an AI Prediction panel:

- Risk score (0-100) with a colour-coded bar.
- 2-sentence narrative.
- Factor list (high/medium/low weight).
- "Regenerate" button (forces `?refresh=true`).

Fetch from `GET /v1/reports/predictions/student-risk/:studentId`.

### 6. Remove dead translation keys

Do NOT leave renamed-from keys as aliases. Delete them outright. Playwright/CI will catch any missed usage.

## Testing requirements

- **Component test per page** — with a mocked API client returning fixture data, the page renders without errors and displays the right number of cards/charts.
- **No `MOCK_` at module scope** — lint rule or a grep-gate in CI that fails if `MOCK_` appears at module scope in `apps/web/src/app/\[locale\]/\(school\)/reports/` pages.
- **Translation-key test** — a scripted check that every `t('<key>')` in the reports pages has a matching entry in `en.json`.

## Post-deploy verification

1. Navigate to each of the 7 pages.
2. Verify real data shows (not the 195 / 93 / 75 familiar mock numbers).
3. Verify titles read correctly (no "Analytics" where "Grade Analytics" was expected).
4. Verify info tooltips work on sub-KPIs.
5. Enable AI narration flag — verify AI Summary Panel appears on each page.
6. Disable flag — panel disappears.
7. Enable AI predictions — student-progress page shows per-student risk panel.

## Follow-ups for subsequent waves

- **Impl 22 (Polish)** does the full Arabic translation parity.

## Rollback

`git revert <sha>` — pages revert to mock data. Safe but undesirable.
