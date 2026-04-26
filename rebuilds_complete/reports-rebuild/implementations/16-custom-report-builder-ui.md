# Implementation 16 — Custom Report Builder UI

> **Wave:** 4 (parallel, web restart)
> **Depends on:** 01, 02, 11
> **Deploys:** web restart only

---

## Goal

Rebuild the custom report builder frontend as a genuinely user-friendly tool that a non-technical school admin can operate in under 3 minutes. It consumes the subject registry + query engine from impl 02 and (optionally) the Ask-AI translator from impl 11. It auto-saves drafts, names saved reports, previews live, and offers every visualisation mode Recharts supports.

## What to change

### 1. Page restructure

Delete the existing `apps/web/src/app/[locale]/(school)/reports/builder/page.tsx` content and rebuild with a three-pane layout:

- **Left pane (300px)** — Saved reports sidebar: sections "Mine", "Shared with me", with a search box.
- **Centre pane (grows)** — Active editor: subject picker + filters + group-by + visualisation toggle.
- **Right pane (grows)** — Live preview: table / chart / KPI depending on visualisation mode.

On mobile, panes stack vertically with a sticky header.

### 2. Subject picker

Top of the centre pane. When no subject is selected, show a 3-column grid of `SubjectCard`s. Each card: icon, name, one-line description, a subtle "selected" outline when chosen. Clicking expands the rest of the editor.

Data source: `GET /v1/reports/subject-registry` — returns the caller's permission-scoped list.

### 3. Field tree

Component `field-tree.tsx`. Renders a collapsible tree grouped by `domain`. Each leaf has a checkbox. Features:

- **Search** — top-of-tree input; typing filters the tree to matching fields (by label or id), expands matching branches.
- **Checkbox** — selects the field as a column in the report. Order of checking determines column order.
- **Drag handle** on selected fields (right pane) — drag to reorder columns.
- **"Use as filter" button per field** — adds a filter row below the tree.
- **"Use as group-by" button** — only visible on `groupable: true` fields; single-select.

Permission-scoped fields are already filtered by the API, so the UI just renders what it gets.

### 4. Filter builder

Component `filter-builder.tsx`. Below the field tree. Renders active filters as rows:

```
[Field picker]   [Operator picker]   [Value input]   [× remove]
```

- **Field picker** — dropdown with the subject's filterable fields.
- **Operator picker** — operators allowed for the field's type (e.g. `contains, starts_with, ends_with, is_null` for strings; `gt, lt, between, on` for dates).
- **Value input** — type-aware: text input for strings, number input for numbers, date picker for dates, a Select for enums.
- **Combinator toggle** at group level — AND / OR. Default AND.
- **"Add filter" button** — appends a new row.
- **"Add filter group" button** — creates a nested group with its own combinator.

Suggested filter presets for common cases: "This academic year", "This term", "This month", "Active students only", "This class". Rendered as one-click chips above the filter list.

### 5. Group-by toggle

Component `group-by-toggle.tsx`. A switch "Summarise this report". When on:

- A group-by field picker appears (single-select from groupable fields).
- Each selected column without an aggregation prompts the user to choose one (`count, sum, avg, min, max`). Default aggregations are suggested based on field type (number → sum, string → count).
- Filter and non-aggregate columns hidden if their shape doesn't work.

### 6. Visualisation toggle

Top-right of the preview pane: radio pills for Table / Bar / Line / Pie / KPI.

- **Table** — default. Shows 50 rows. Pagination controls.
- **Bar / Line / Pie** — requires an x-axis (dimension) and y-axis (measure). User picks from column dropdowns. Invalid combinations (no measure, no dimension) show a hint.
- **KPI** — single number, large. User picks which column is the headline value.

Chart rendering via Recharts.

### 7. Live preview

Component `preview-table.tsx` (plus chart components). Debounced by 500ms: on any editor change, fires `POST /v1/reports/builder/preview` with the current query. Preview shows 50 rows max with the row count above ("Showing 50 of 3,421 rows").

Error states (row cap, timeout, invalid query) render inline with a clear message.

### 8. Ask AI input

A prominent input at the top of the centre pane when `reports_ask_ai` flag is on (check via `GET /v1/tenant/ai-flags`). Placeholder:

> Describe the report you want in plain English. For example: "Year 10 students with attendance below 85%"

On submit:

- Loading spinner in the input.
- Call `POST /v1/reports/ai-ask-ai`.
- If translation successful (confidence = high / medium): populate the builder with the returned query, show the rationale above the subject picker with "AI filled this in. Edit as you like." + a "Discard" button to clear.
- If confidence low OR warnings present: show warnings but still populate. Let user refine.
- If `query: null`: show the warnings, don't populate.

Cache translation history surfaces in the left sidebar under "Recent AI queries".

### 9. Auto-save drafts

On every change to the editor, debounce 500ms, then `PUT /v1/reports/builder/draft` with the current state. On page load, `GET /v1/reports/builder/draft` — if present, restore into editor and show a subtle "Draft restored" toast.

When the user saves a named report, `DELETE /v1/reports/builder/draft`.

### 10. Save dialog

Triggered by the "Save report" button. Modal asks:

- **Name** (required, min 2 chars, max 80, unique per tenant — validate on submit).
- **Description** (optional).
- **Visibility** — private (default) / shared. Inline hint: "Shared reports are visible to all users with Reports access in your school."
- **Favorite** — boolean star toggle.

On submit: `POST /v1/reports/builder` (or `PUT` if `:id` present in URL) → success toast + redirect to `/reports/builder/<id>`.

Name-conflict returns a backend 400 `SAVED_REPORT_NAME_TAKEN` which the modal renders inline.

### 11. Saved reports sidebar

- Groups: "Mine" (user-owned) + "Shared with me" (visibility=shared, owned by others).
- Each item: star icon (favorite), name, last modified, 3-dot menu with Rename / Duplicate / Delete / Share.
- Click a report to open it in the builder at `/reports/builder/<id>`.
- Search box filters the list by name.

### 12. Export + Share buttons (header)

On a saved report, the page header has:

- **Run** — re-executes the query, refreshes preview.
- **Export** dropdown — PDF / Excel / Word.
- **Share** — opens the share dialog (impl 19).
- **Schedule** — opens the scheduled-reports modal (impl 17) pre-filled.

Guarded by the relevant permissions (`reports.share`, etc.).

### 13. Delete

From the 3-dot menu or the page header. Confirmation dialog. On confirm: `DELETE /v1/reports/builder/:id` → toast + redirect to `/reports/builder` (empty builder).

## Testing requirements

- **Component tests** — each component renders with fixture data.
- **Subject picker** — grid renders, selection propagates.
- **Field tree** — checkboxes add/remove columns, search filters, permission-scoped fields absent.
- **Filter builder** — add/remove/type-aware inputs.
- **Preview** — debounced fetch, renders table/chart.
- **Save dialog** — name validation, name-conflict error path.
- **Ask AI** — flag off hides input; flag on shows; submission calls endpoint.
- **Playwright e2e** — full round-trip: pick subject → add columns → add filter → preview → save with name → reopen → edit → export PDF → delete.

## Post-deploy verification

1. `/reports/builder` loads; three-pane layout present.
2. Pick "Student" subject; field tree renders; check First Name, Last Name, Year Group, Overall GPA.
3. Preview shows 50 students within < 2s.
4. Add filter: `Attendance Rate < 85%`. Preview updates.
5. Click Save; name "Year 10 Underperformers"; save.
6. Reopen from sidebar; matches.
7. Enable `reports_ask_ai` flag; try "list Year 11 students with more than 2 behaviour incidents this term"; AI populates the builder; preview shows results.
8. Export PDF; download; confirm it's a real PDF.

## Follow-ups for subsequent waves

- **Impl 19 (Share dialog)** wires the Share button.
- **Impl 17 (Scheduled UI)** wires the Schedule button.
- **Impl 22 (Polish)** — mobile responsiveness for the three-pane layout (collapses to single-pane with bottom sheet on narrow screens).

## Rollback

`git revert <sha>` — old builder returns. The old builder is partially functional; rollback is safe but degrading.
