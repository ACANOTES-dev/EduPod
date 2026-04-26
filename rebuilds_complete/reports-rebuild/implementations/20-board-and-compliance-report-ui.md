# Implementation 20 — Board Report + Compliance Report UI

> **Wave:** 4 (parallel, web restart)
> **Depends on:** 01, 06, 07
> **Deploys:** web restart only

---

## Goal

Build the frontend for the board and compliance reports, consuming the aggregation services from impls 06 and 07. These are high-ceremony reports — their pages prioritise correctness, clarity, and printability over interactivity.

## What to change

### 1. Board report page rewrite

Full rewrite: `apps/web/src/app/[locale]/(school)/reports/board/page.tsx`.

**Layout:**

- Page header: "Board Report" + generated-at timestamp if already generated this term.
- **Generation controls** (top card):
  - Academic year picker (default: current).
  - Term picker (default: current).
  - Sections checkboxes: Executive / Enrolment / Attendance / Academic / Behaviour / Safeguarding / Finance / Staffing. Default all 8 checked.
  - Anonymise toggle (default on). Tooltip: "When on, student names appear as initials in the academic and behaviour sections. Disable for internal review only."
  - "Generate" button — triggers `POST /v1/reports/board/generate`.
- **Generated report display** (once data returned):
  - Each section rendered as a card with its title, summary bullets, and a drill-down chart/table.
  - Sections collapsible.
  - Executive summary always expanded by default.
- **Export bar** — PDF / Excel / Word buttons at the top of the generated report.
- **Share** button — opens share dialog with the exported board-report PDF attached.
- **History sidebar** — prior generations (`GET /v1/reports/board/history`); click to load a prior generation in read-only mode.

### 2. Section components

One component per section under `apps/web/src/app/[locale]/(school)/reports/board/_components/`:

- `executive-summary-section.tsx` — summary bullets + key numbers.
- `enrolment-section.tsx` — year-group bar + gender pie + nationality breakdown.
- `attendance-section.tsx` — year-group bar + day-of-week pattern + chronic list.
- `academic-section.tsx` — pass/fail bar + subject averages + anonymised top/bottom lists.
- `behaviour-section.tsx` — incident type stacked bar + sanction outcomes.
- `safeguarding-section.tsx` — open count + age histogram + critical-incidents summary line.
- `finance-section.tsx` — collection rate gauge + outstanding bar + cash-flow snapshot.
- `staffing-section.tsx` — headcount by department + cover stats + absence trend.

Each section takes the typed section-shape from `BoardReport` as its prop.

### 3. Compliance report page rewrite

Full rewrite: `apps/web/src/app/[locale]/(school)/reports/compliance/page.tsx`.

**Layout:**

- Page header: "Compliance Report" + academic year picker.
- **Field checklist** — left sidebar: all fields organised by category (Student-facing / Staff-facing / Finance / Operations). Checkbox per field. Top: "Select all" / "Deselect all". Default all selected.
- **Preview pane** — right: each selected field renders as a row:
  - Field label.
  - Value (or "—" if `has_gap`).
  - Source line ("from {table}").
  - Last verified ("updated {relative}").
  - Red warning icon + reason if `has_gap`.
- **Generate** button — fires `POST /v1/reports/compliance/generate` with selected fields.
- **Export bar** — PDF / Excel / Word for the generated report.
- **Share** button — shares via inbox.
- **History sidebar** — prior generations.

### 4. Error handling and gap visibility

When a field has `has_gap: true`:

- Show a warning icon (amber) inline with the field.
- Hover/focus shows the `gap_reason`.
- In PDF/Excel/Word exports, the gap note renders alongside the field.

Regulators must see the gap; do not hide it.

### 5. Permission gating

- Board report page: `reports.view` + `analytics.view`.
- Compliance report page: `compliance.view` (existing permission; verify).
- Anonymise-off requires `safeguarding.view_detail` (if exists; else `reports.view_detail`).

### 6. Print styling

Board and compliance exports are often printed. Add print-optimised CSS:

- Hide navigation, sidebars, export bar in print.
- Use page-break CSS to put each section on a new page in PDF-via-browser-print.
- Greyscale-friendly colour palette.

## Testing requirements

- **Component tests** for each section with fixture data.
- **Playwright e2e** — generate a board report, verify all requested sections render, export PDF, verify download.
- **Gap display test** — compliance report with a gap field shows the warning.
- **Anonymise toggle test** — academic section shows initials with anonymise on, full names with it off (and proper permissions).

## Post-deploy verification

1. `/reports/board` — generate a term 2 board report with all sections, anonymise on.
2. Verify all 8 sections render with real data matching the underlying sources.
3. Toggle anonymise off; re-generate; verify names appear (requires permission).
4. Export PDF; confirm multi-section PDF.
5. `/reports/compliance` — select all fields; generate; verify each row shows value + source.
6. Verify `qualified_teachers_percent` shows a real number or an honest gap.

## Follow-ups for subsequent waves

- **Impl 22 (Polish)** — mobile pass.
- Out of scope: scheduled board reports (can be set up via impl 17's UI but require the board-report endpoint to work via the scheduled worker flow — minor adaptation left to a later cycle).

## Rollback

`git revert <sha>` — pages revert to stubs. Safe but undesirable.
