# Phase 3 — Tusla Hub

**Goal:** `/regulatory/tusla` becomes a proper sub-dashboard with its own KPI strip and hub tiles. Every Tusla workflow (SAR, AAR, Reduced-days, Absence mappings) gets a back button to this hub and conforms to the list / wizard patterns.

**Dependencies:** Phase 1 (foundation), Phase 2 (super dashboard — for the tile that links here).

**Estimated effort:** 4–6 hours.

---

## Scope — in

- Rewrite `apps/web/src/app/[locale]/(school)/regulatory/tusla/page.tsx` to the sub-hub pattern.
- Bring sub-pages in line with the system: SAR wizard, AAR wizard, Reduced-days list + create, Absence mappings list + create.
- Extract a Tusla-specific KPI strip: students approaching threshold, students exceeded, open suspensions/expulsions, last SAR submitted (relative date).
- Wire in every translation key the sub-hub needs.
- Every sub-page gets `PageHeader.back` → `/regulatory/tusla`.

## Scope — out

- Cross-module changes to the behaviour/attendance modules that feed Tusla data.
- Backend Tusla business logic changes (unless a KPI needs a new endpoint).

---

## Page composition

### `/regulatory/tusla` (sub-hub)

```
PageHeader
  title: 'Tusla Compliance'
  description: 'Attendance monitoring, Tusla reports, reduced-day tracking.'
  back: { href: '/{locale}/regulatory', label: 'Back to Regulatory' }
  actions: Button "Generate SAR" → /regulatory/tusla/sar

KPI strip (4 tiles)
  1. Approaching threshold   (warning tone if > 0)
  2. Exceeded threshold      (danger tone if > 0)
  3. Open suspensions        (neutral)
  4. Last SAR submitted      (relative date or "Never")

HubTile grid (4 tiles, teal accent)
  1. SAR Generation          → /regulatory/tusla/sar
  2. AAR Generation          → /regulatory/tusla/aar
  3. Reduced School Days     → /regulatory/tusla/reduced-days
  4. Absence Code Mappings   → /regulatory/tusla/mappings

Threshold Monitor section (rounded-2xl, bg-surface)
  List of students approaching / exceeding the 20-day threshold.
  Each row: student name, class, days absent, trend arrow.
  Filters: class, absence-type.
```

### `/regulatory/tusla/sar` (wizard)

- Keep 3-step wizard, but wrap in `PageHeader.back` → `/regulatory/tusla`, add teal accent on the step indicator, add proper label translations (currently the steps show bare `"1 / 2 / 3"` labels).

### `/regulatory/tusla/aar`

- Mirror SAR pattern.

### `/regulatory/tusla/reduced-days` (list)

- `PageHeader.back` → `/regulatory/tusla`, primary action "Add Record" opening a dialog.
- Filters: status, student, date range.
- Table columns: student, start, end, hours/day, reason, tusla notified, status, actions.
- Per [PATTERNS.md §3](PATTERNS.md#3-list-page).
- Create/edit dialog uses `react-hook-form` + `zodResolver(createReducedDaySchema)`.

### `/regulatory/tusla/mappings` (new)

- New route — the feature already exists via the backend (`/v1/regulatory/tusla/absence-mappings`) but there is no current frontend page.
- List of absence-code → Tusla-code mappings with create/delete actions.

---

## Concrete changes

### Files rewritten

- `apps/web/src/app/[locale]/(school)/regulatory/tusla/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/sar/page.tsx` (header + accent only; don't rewrite the wizard logic)
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/aar/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/reduced-days/page.tsx`

### Files created

- `apps/web/src/app/[locale]/(school)/regulatory/tusla/mappings/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/_components/threshold-monitor-section.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/_components/reduced-day-dialog.tsx`
- Co-located specs for each new page.

### Files modified

- `apps/web/messages/en.json` — add `regulatory.tusla.*` keys.
- `apps/web/messages/ar.json` — Arabic parity.

### Backend

- Likely none — `/v1/regulatory/tusla/*` already provides threshold-monitor, suspensions/expulsions, and mapping CRUD.
- If the KPI needs "Last SAR submission date", confirm it's returned from the dashboard endpoint or add it to the dashboard service in this phase.

---

## Success criteria

- [ ] `/regulatory/tusla` renders with PageHeader + back button + KPI strip + 4 HubTiles + threshold monitor.
- [ ] SAR, AAR, Reduced-days, Mappings pages all have working back buttons pointing to `/regulatory/tusla`.
- [ ] `/regulatory/tusla/mappings` list + create + delete work end-to-end on NHQS.
- [ ] Reduced-days dialog uses `react-hook-form` + Zod.
- [ ] Threshold monitor pulls real students (if any exceed/approach 20-day threshold on NHQS).
- [ ] No console errors or missing-translation warnings on any Tusla route.
- [ ] Mobile layout clean at 375px.
- [ ] RTL: Arabic locale renders correctly.
- [ ] Lint + type-check + tests pass. CI green. Prod verified.

---

## Testing

- Playwright: `apps/web/e2e/regulatory-tusla.spec.ts` — walks hub → each sub-page and back via the back button.
- Verify create/edit of a reduced-day record end-to-end on NHQS.
- Verify create/delete of an absence mapping end-to-end on NHQS.

---

## Risks

- **SAR/AAR wizard logic is non-trivial.** This phase touches only the header and step-indicator styling. Do not rewrite the wizard state machine.
- **Threshold monitor depends on attendance data.** If NHQS has no attendance data today, the section renders the empty state. Confirm empty-state copy reads well.
