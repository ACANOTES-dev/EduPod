# Implementation 07 — Frontend Overview, Matrix & Library

**Wave:** 3 (frontend fan-out)
**Depends on:** 01 (schema — for Zod types), 06 (matrix + library backend)
**Blocks:** nothing critical (12 cleanup removes old page)
**Can run in parallel with:** 08, 09, 10
**Complexity:** medium (mostly gradebook-mirror work)

---

## 1. Purpose

Rebuild the frontend Report Cards surface to match the gradebook experience: a landing page with class cards grouped by year, a per-class matrix view, and a library page listing generated PDFs. All three pages are under `/[locale]/(school)/report-cards/`.

**Authoritative design:** `report-card-spec/design-spec.md` Sections 6, 11.

---

## 2. Scope

### In scope

1. Rebuild `/[locale]/(school)/report-cards/page.tsx` — landing with class cards by year
2. Create `/[locale]/(school)/report-cards/[classId]/page.tsx` — per-class matrix view
3. Create `/[locale]/(school)/report-cards/library/page.tsx` — generated documents library
4. Translation keys added to `en.json` and `ar.json`
5. E2E tests for key flows

### Out of scope

- Generation wizard UI (impl 09)
- Comment editor UI (impl 08)
- Settings page UI (impl 09)
- Teacher requests UI (impl 10)
- PDF template visuals (impl 11)

---

## 3. Prerequisites

1. Impl 06 merged — matrix and library endpoints available
2. `apiClient<T>()` helper understood — see `apps/web/src/lib/api-client.ts`
3. Familiarity with the gradebook pages (`apps/web/src/app/[locale]/(school)/gradebook/page.tsx` and `.../[classId]/results-matrix.tsx`)

---

## 4. Task breakdown

### 4.1 Landing page — class cards grouped by year

**File:** `apps/web/src/app/[locale]/(school)/report-cards/page.tsx`

**Shape:** near-identical to `apps/web/src/app/[locale]/(school)/gradebook/page.tsx`. Differences:

- Data source: call `apiClient<ListResponse<ClassRecord>>('/api/v1/classes?pageSize=100')` and `apiClient<ListResponse<YearGroup>>('/api/v1/year-groups?pageSize=100')` just like gradebook
- For each class, check whether any report card has been generated OR whether grades exist — a class with no data yet shows on the list with a muted state ("No grades yet"). Only suppress empty classes with zero enrolments.
- Card subtitle: count of students with any grade in any period, or a simple "X students"
- Click navigates to `/[locale]/report-cards/[classId]`
- Add a top-right "Library" button that navigates to `/[locale]/report-cards/library`

**Follow the existing gradebook landing EXACTLY** for visual structure (year group headers, card grid, gradient accent, icon), just swap the semantics. Use `BookOpen` or `FileText` icon instead of gradebook's.

### 4.2 Class matrix view

**File:** `apps/web/src/app/[locale]/(school)/report-cards/[classId]/page.tsx`

**Structure:**

```tsx
'use client';

export default function ReportCardsClassPage({ params }: { params: { classId: string } }) {
  const t = useTranslations('reportCards');
  const [periodFilter, setPeriodFilter] = React.useState('all');
  const [displayMode, setDisplayMode] = React.useState<'score' | 'grade'>('grade');
  const [matrix, setMatrix] = React.useState<MatrixData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const res = await apiClient<MatrixData>(
          `/api/v1/report-cards/classes/${params.classId}/matrix?academic_period_id=${periodFilter}`,
        );
        if (!cancelled) setMatrix(res);
      } catch (err) {
        console.error('[ReportCardsClassPage]', err);
        if (!cancelled) setMatrix(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.classId, periodFilter]);

  // ... render
}
```

**Visuals:**

- Page header: class name + year group
- Toolbar: period selector (left) + score/grade toggle (right)
- Top-right "Library" button
- Matrix table:
  - Header row: Subject names (one column per subject) + "Overall" column at the end
  - One row per student with student name + cells per subject + overall cell at end
  - Overall cell shows weighted average and grade
  - Rank badge (top 3 only) appears next to the student name — "★ Top 1", "★ Top 2", "★ Top 3" — styled like the existing per-student analytics rank pill
- Cells display either score (`87.3%`) or letter grade (`A`) based on the toggle
- Clicking a cell opens a popover with the underlying assessments (read-only) — reuse popover pattern from the gradebook matrix

**Mobile responsiveness:**

- Table: wrap in `<div className="overflow-x-auto">`
- On narrow screens, pin the student name column with `sticky start-0 bg-surface`
- Period selector: `w-full sm:w-auto`
- Score/grade toggle: always visible

**Empty states:**

- No grades: empty state message with icon
- Class not found: 404 state with back link

### 4.3 Library page

**File:** `apps/web/src/app/[locale]/(school)/report-cards/library/page.tsx`

**Structure:**

- Page header: "Report Cards Library"
- Toolbar filters: class selector, year group selector, period selector, language selector (en/ar/all)
- Data table (use the existing `DataTable` component from `@/components/data-table`):
  - Columns: Student, Class, Period, Template, Languages, Generated, Actions
  - "Languages" shows chips like "EN | AR" or just "EN"
  - "Actions" column has "Download EN" and "Download AR" buttons (only the available ones)
- Pagination: client-managed, `pageSize = 20`
- Download buttons call the backend to get a fresh signed URL then open in a new tab

**Permissions:** the backend scopes the response per role, so the frontend doesn't need to gate based on role. Teachers naturally see only their own students' documents.

### 4.4 Translation keys

Add to both `apps/web/messages/en.json` and `apps/web/messages/ar.json` under a `reportCards` section:

```json
{
  "reportCards": {
    "title": "Report Cards",
    "librarySection": "Library",
    "librarySectionButton": "View Library",
    "classMatrix": {
      "periodFilter": "Period",
      "allPeriods": "All periods",
      "displayMode": "Display",
      "score": "Score",
      "grade": "Grade",
      "overall": "Overall",
      "noGradesYet": "No grades recorded for this class yet.",
      "topRankBadge": "Top {rank}"
    },
    "library": {
      "title": "Report Cards Library",
      "filterClass": "Class",
      "filterYearGroup": "Year group",
      "filterPeriod": "Period",
      "filterLanguage": "Language",
      "downloadEn": "Download (EN)",
      "downloadAr": "Download (AR)",
      "generatedAt": "Generated",
      "noDocuments": "No report cards have been generated yet."
    }
  }
}
```

Arabic: provide translations for every key. Do NOT copy English into `ar.json`.

### 4.5 Navigation wiring

The Report Cards module is already in the Learning hub sub-strip. Verify the links point to the new paths (`/[locale]/report-cards`, `/[locale]/report-cards/library`). Update the sub-strip configuration file (search for the nav config).

---

## 5. Files to create

- `apps/web/src/app/[locale]/(school)/report-cards/[classId]/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/library/page.tsx`
- `apps/web/e2e/report-cards-overview.spec.ts`
- `apps/web/e2e/report-cards-library.spec.ts`

## 6. Files to modify

- `apps/web/src/app/[locale]/(school)/report-cards/page.tsx` — rebuilt
- `apps/web/messages/en.json` — new keys under `reportCards`
- `apps/web/messages/ar.json` — Arabic translations
- Navigation config (find it via grep for existing report-cards hub entry)

## 7. Files to DELETE (caution)

- Do NOT delete the old flat-table page contents without first verifying the frontend no longer references any removed helpers. The whole `page.tsx` is being rebuilt, so the old code is gone in the rewrite.

---

## 8. Testing requirements

### 8.1 Component/page tests (optional but recommended)

If the repo has component test infrastructure (React Testing Library), add a basic test for the matrix page's loading state and successful render with a mocked `apiClient`. If not, rely on E2E.

### 8.2 E2E tests

**`report-cards-overview.spec.ts`:**

- Navigate to `/en/report-cards`
- Expect the page header
- Expect at least one year group header
- Expect at least one class card
- Click a card → expect URL to change to `/en/report-cards/{classId}`
- Expect the matrix view to load

**`report-cards-library.spec.ts`:**

- Navigate to `/en/report-cards/library`
- Expect the header
- Expect filters
- Expect at least one row (use test fixtures with pre-generated reports)
- Click download → expect a new tab to open (or at least the click handler to fire)

Use the existing Playwright setup in `apps/web/e2e/`.

### 8.3 Regression

```bash
turbo test && turbo lint && turbo type-check
```

Also run the frontend build:

```bash
turbo build --filter=@school/web
```

---

## 9. Mobile / RTL checklist

- [ ] Landing page works at 375px — cards stack to one column
- [ ] Matrix page works at 375px — horizontal scroll with sticky student column
- [ ] Library page works at 375px — table wraps in `overflow-x-auto`
- [ ] Every use of physical classes (`ml-`, `pr-`, `text-left`, etc.) replaced with logical equivalents
- [ ] Arabic RTL verified visually by switching locale to `ar`
- [ ] Touch targets at least 44×44px on all buttons
- [ ] Input font-size at least `text-base` (16px)

---

## 10. Acceptance criteria

1. Landing page displays class cards grouped by year group matching the gradebook visual pattern
2. Clicking a card navigates to the matrix view
3. Matrix view shows students × subjects with the correct data from the new backend
4. Period filter works
5. Score/grade toggle works
6. Top-3 rank badges appear only on ranks 1-3
7. Library page lists generated documents with working download links
8. Filters and pagination work
9. Arabic RTL renders correctly
10. Mobile (375px) usable
11. E2E tests pass
12. `turbo test`, `turbo lint`, `turbo type-check`, `turbo build` all green
13. Log entry added

---

## 11. Architecture doc update check

| File                     | Decision                              |
| ------------------------ | ------------------------------------- |
| `module-blast-radius.md` | NO — frontend only                    |
| `event-job-catalog.md`   | NO                                    |
| `state-machines.md`      | NO                                    |
| `danger-zones.md`        | NO                                    |
| `feature-map.md`         | Do NOT update unilaterally — ask user |

---

## 12. Completion log stub

```markdown
### Implementation 07: Frontend Overview, Matrix & Library

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Status:** ✅ complete
- **Summary:** Rebuilt report cards landing as year-grouped class cards, added per-class matrix view and library page, all mirroring the gradebook experience. Arabic RTL verified.

**What changed:**

- `/report-cards/page.tsx` — rebuilt
- `/report-cards/[classId]/page.tsx` — new
- `/report-cards/library/page.tsx` — new
- `messages/en.json`, `messages/ar.json` — new keys
- 2 new E2E tests

**Test coverage:**

- E2E: overview + library
- `turbo test`, `turbo lint`, `turbo type-check`, `turbo build`: ✅

**Blockers or follow-ups:**

- Impl 12 (cleanup) will remove any lingering references to the old flat-overview pattern
```

---

## 13. If you get stuck

- **Matrix table layout:** read `apps/web/src/app/[locale]/(school)/gradebook/[classId]/results-matrix.tsx` and copy the structure. The DOM is already solved — you only need different data.
- **Sticky first column on mobile:** `position: sticky; inset-inline-start: 0;` with a `bg-surface` class. Test in RTL too.
- **Signed URL handling:** the backend returns a short-lived signed URL. Open it directly in a new tab with `window.open(url, '_blank')` — do NOT fetch it via `apiClient` (that would add auth headers that the signed URL doesn't expect).
