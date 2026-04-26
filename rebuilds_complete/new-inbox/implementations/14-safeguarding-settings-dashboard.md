# Implementation 14 — Safeguarding Settings + Dashboard Alerts Widget

> **Wave:** 4 (parallel with 10, 11, 12, 13, 15)
> **Depends on:** 01, 08
> **Deploys:** Web restart only

---

## Goal

Two pieces of UI:

1. The **safeguarding settings page** where the safeguarding lead manages the keyword list (add, edit, deactivate, bulk import).
2. The **dashboard alerts widget** on the Owner / Principal / VP home dashboard that surfaces pending `MessageFlag` rows with deep links into the oversight thread view.

## What to build

### 1. The keyword settings page

`apps/web/src/app/[locale]/(school)/settings/communications/safeguarding/page.tsx`

Layout:

- **Page header** — title, description, "Bulk import" button, "+ Add keyword" button
- **Filter bar** — search by keyword text, filter by category, filter by severity, filter by active/inactive
- **Keyword list** — table or card grid of keywords. Columns: keyword, severity (badge), category, active toggle, last updated, actions
- **Pagination** — 50 per page

Each row's actions:

- **Edit** — opens an inline edit form or modal
- **Toggle active** — flips the active flag, calls `PATCH /v1/safeguarding/keywords/:id`
- **Delete** — confirmation modal, calls `DELETE /v1/safeguarding/keywords/:id`

The "+ Add keyword" button opens a modal with:

- **Keyword text** (required)
- **Severity** (required, dropdown: low / medium / high)
- **Category** (free text with autocomplete from existing categories in the tenant)
- Save / Cancel

The "Bulk import" button opens a CSV-paste modal:

- A textarea where the user pastes `keyword,severity,category` lines
- A "Parse" button that previews the rows in a table with validation errors highlighted
- A "Import" button that posts to `POST /v1/safeguarding/keywords/bulk-import`
- Returns `{ imported, skipped }` and shows a success toast

### 2. Page guard

The page is gated behind `safeguarding.keywords.write` — admin tier only. Other staff get 403.

The Communications module sub-strip in the morph bar gains a "Safeguarding" entry that links here.

### 3. The dashboard alerts widget

`apps/web/src/app/[locale]/(school)/_components/dashboard-widgets/safeguarding-alerts-widget.tsx`

A small card that lives on the home dashboard for Owner / Principal / VP only.

The card:

- Title: "Safeguarding alerts"
- A pill showing the count of `pending` flags: "**3 unread**" (or "All clear" when 0)
- A list of the 3 most recent flagged threads with: matched keywords (chips), severity badge, sender name, conversation type, timestamp
- "View all" button → navigates to `/inbox/oversight?filter=flags`

Polls `GET /v1/inbox/oversight/flags?limit=3` every 60 seconds (less aggressive than inbox polling — flags are not as time-sensitive).

When there are 0 pending flags, the card collapses to a single-line "All clear" state with a green check icon. When there are unread flags, the card expands and the title bar gets a yellow attention border.

Click a flagged row → navigate to the oversight thread view (impl 15) with the flag highlighted.

### 4. Where the widget renders

The home dashboard for school-facing routes is at `apps/web/src/app/[locale]/(school)/page.tsx` (verify the actual path — it might be `home/page.tsx` or `dashboard/page.tsx` depending on the existing structure). Find the existing widget grid and add the safeguarding widget to it.

The widget is **only rendered for admin tier users**. Use a conditional render based on the current user's role from the existing user context provider.

### 5. Existing dashboard widget pattern

Find the existing widget pattern in the dashboard. There's almost certainly a `<DashboardCard>` component or similar — wrap the safeguarding widget in it for visual consistency. Don't create a parallel card style.

If no widget pattern exists, create a minimal `<DashboardCard>` wrapper in this implementation that the widget uses, and document it for impl 16's polish pass.

### 6. Severity color mapping

- `low` — yellow (`bg-warning-subtle text-warning`)
- `medium` — orange
- `high` — red

These are token colours from the existing design system. Don't introduce new colours.

### 7. Translation keys

`messages/en.json` and `messages/ar.json` under `safeguarding.*`:

- `safeguarding.title`
- `safeguarding.keywords.add`
- `safeguarding.keywords.bulk_import`
- `safeguarding.keywords.fields.keyword`
- `safeguarding.keywords.fields.severity`
- `safeguarding.keywords.fields.category`
- `safeguarding.keywords.severity.low`
- `safeguarding.keywords.severity.medium`
- `safeguarding.keywords.severity.high`
- `safeguarding.keywords.toggle_active`
- `safeguarding.keywords.delete.confirm`
- `safeguarding.keywords.bulk.parse`
- `safeguarding.keywords.bulk.import`
- `safeguarding.keywords.empty_state`
- `safeguarding.alerts.title`
- `safeguarding.alerts.pending_count`
- `safeguarding.alerts.all_clear`
- `safeguarding.alerts.view_all`
- `safeguarding.alerts.severity.low`
- `safeguarding.alerts.severity.medium`
- `safeguarding.alerts.severity.high`

## Tests

E2E:

- Settings page loads as Principal → keyword list visible
- Add a new keyword → it appears in the list
- Edit a keyword → updates persist
- Toggle active → keyword greyed out, not used by the scanner
- Bulk import 5 keywords → success toast, all 5 in the list
- Search the keyword list → filter works
- As Teacher → settings page returns 403
- Dashboard widget shows 0 flags initially → "All clear"
- Trigger a flag (send a test message containing a seeded keyword) → widget updates within 60s
- Click a flagged row → navigates to oversight thread

Component:

- Severity badge renders correct color
- Bulk import parse handles invalid rows
- Widget collapses to "All clear" state on 0 flags

## Watch out for

- **Don't expose the keyword list to non-admin users.** The endpoint is already gated, but double-check the page route is also gated. Dual-layer guard.
- **The bulk import validates rows individually** and the import is "best effort" — invalid rows are skipped, valid rows go through. Show the user a clear summary of what was imported and what was rejected.
- **Polling cadence.** The dashboard widget polls every 60 seconds, not 30. Don't conflate the cadences — the inbox uses 30s for unread state because users actively wait for messages; the safeguarding widget is a passive monitor.
- **Severity sort order.** The default sort for the flagged threads list is `created_at DESC`, but a tenant with high-severity flags should see them first. Add a secondary sort: `severity DESC, created_at DESC` (with `high > medium > low`).
- **Do not include the message body in the widget.** Showing flagged content on the home dashboard is a privacy risk — admins should click through to the oversight thread to see context. The widget shows matched keywords and metadata only.
- **Don't allow edits to severity or category that change historical flags.** A keyword's severity is captured at flag time (the flag row stores `highest_severity`). Editing the keyword later doesn't retroactively change historical flags. Document this in a tooltip on the severity field.

## Deployment notes

- Web restart only.
- Smoke test:
  - Navigate as Principal to `/settings/communications/safeguarding` → seeded keyword list appears.
  - Add a keyword "TEST_FLAG_KEYWORD".
  - Send a direct message containing "TEST_FLAG_KEYWORD" as a teacher → wait for the safeguarding scanner cron to fire (or trigger immediately by checking the queue).
  - Open the home dashboard as Principal → safeguarding widget shows 1 pending flag.
  - Click the flag row → navigates to the oversight thread view (impl 15 — this lands in the same wave so test together).
  - Delete the test keyword.
