# Phase 4 — P-POD / POD Hub

**Goal:** `/regulatory/ppod` becomes a sub-dashboard. Fix the 3 broken prefetch 404s. Rewrite the PPOD sub-pages (students, sync-log, import, export) on the list / wizard pattern. Decide whether CBA and Transfers stay nested under PPOD or get promoted to top-level regulatory sub-hubs (recommendation: promote).

**Dependencies:** Phases 1, 2.

**Estimated effort:** 6–8 hours (largest phase so far; lots of sub-pages and the most translation debt).

---

## Scope — in

- Rewrite `apps/web/src/app/[locale]/(school)/regulatory/ppod/page.tsx` as a sub-hub.
- Rewrite four leaf pages in the list / wizard pattern:
  - `ppod/students` — list of PPOD student mappings with per-row sync trigger
  - `ppod/sync-log` — audit trail
  - `ppod/import` — CSV import wizard (4 steps)
  - `ppod/export` — CSV export wizard (4 steps)
- Fix the 3 broken nav links in the current PPOD hub (`/regulatory/cba`, `/regulatory/ppod/mappings`, `/regulatory/transfers`).
- Top up every missing translation key for `regulatory.ppod.*` in both `en.json` and `ar.json`.
- Fix the response-envelope crash on the hub.
- **Promote CBA and Transfers** to their own top-level regulatory sub-hubs under `/regulatory/cba` and `/regulatory/transfers` respectively (the PPOD hub links to them, but they are no longer nested under `/regulatory/ppod/*`). Full CBA + Transfers redesign is in Phase 8.

## Scope — out

- CBA and Transfers page rewrites (they're in Phase 8, this phase just redirects the old nested URLs to the promoted ones).
- Backend PPOD / POD sync logic — no changes.

---

## Page composition

### `/regulatory/ppod` (sub-hub)

```
PageHeader
  title: 'P-POD / POD Sync'
  description: 'Synchronise student records with P-POD and POD.'
  back: { href: '/{locale}/regulatory', label: 'Back to Regulatory' }
  actions: <SyncStatusPill> showing last-sync relative time

KPI strip (4 tiles)
  1. Synced (count)
  2. Pending sync (warning tone if > 0)
  3. Errors (danger tone if > 0)
  4. Last sync (relative date)

Database toggle (segmented control)
  [ P-POD  |  POD ]
  Swaps the KPI values and the target DB for sync actions.

HubTile grid (4 tiles, teal accent)
  1. Student Mappings       → /regulatory/ppod/students
  2. Sync History / Log     → /regulatory/ppod/sync-log
  3. Import from CSV        → /regulatory/ppod/import
  4. Export to CSV          → /regulatory/ppod/export

Diff preview section (rounded-2xl)
  Shows the delta between local students and current P-POD snapshot.
  Link to full diff view.
```

### `/regulatory/ppod/students` (list)

- `PageHeader.back` → `/regulatory/ppod`, actions: `"Sync all"` button, `"Export CSV"` link.
- Filters: sync status, class, search by name / PPS.
- Table columns: student, PPS number, external ID, sync status badge, last synced, actions (sync row, view detail).
- Row action button triggers `POST /v1/regulatory/ppod/sync/:studentId`.

### `/regulatory/ppod/sync-log` (list)

- `PageHeader.back` → `/regulatory/ppod`.
- Filters: database (PPOD / POD), sync type, triggered-by, status, date range.
- Table columns: database, sync type, triggered by, started at, status badge, records, duration.
- Row click opens a detail drawer with the full diff JSON for that sync.

### `/regulatory/ppod/import` (4-step wizard)

- Steps: Upload → Preview → Confirm → Result.
- Each step gets a clean teal step indicator (`1 ● 2 ○ 3 ○ 4 ○` style).
- Step 1 needs a proper drop-zone UI (replace the raw-key strings showing today).
- Step 4 shows sync result + link back to `/regulatory/ppod` or `/regulatory/ppod/sync-log` for the just-created log entry.

### `/regulatory/ppod/export` (4-step wizard)

- Same 4-step pattern. Steps: Configure → Preview → Generate → Download.
- Download step surfaces a signed S3 URL + "back to PPOD" link.

---

## Concrete changes

### Files rewritten

- `apps/web/src/app/[locale]/(school)/regulatory/ppod/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/students/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/sync-log/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/import/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/export/page.tsx`

### Files moved (breaking route change)

- `apps/web/src/app/[locale]/(school)/regulatory/ppod/cba/*` → `apps/web/src/app/[locale]/(school)/regulatory/cba/*`
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/transfers/*` → `apps/web/src/app/[locale]/(school)/regulatory/transfers/*`
- Add redirects in `apps/web/next.config.mjs` for the old paths → new paths (keep old deep links working for anyone who bookmarked).
- Note: the rewrites for these pages land in Phase 8 — this phase just moves the files and adds redirects. Visual quality on the moved pages doesn't improve until Phase 8.

### Files created

- `apps/web/src/app/[locale]/(school)/regulatory/ppod/_components/sync-status-pill.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/_components/database-toggle.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/_components/diff-preview-section.tsx`
- Co-located specs.

### Translation keys

All missing `regulatory.ppod.*` keys listed in [BUGS-INVENTORY.md](BUGS-INVENTORY.md) §B get added to `en.json` + `ar.json` in this phase.

---

## Success criteria

- [ ] `/regulatory/ppod` loads without error boundary.
- [ ] Database toggle swaps KPI values correctly.
- [ ] All HubTile links resolve to HTTP 200 (no 404 prefetch errors in console).
- [ ] `/regulatory/ppod/students` and `/regulatory/ppod/sync-log` show no raw translation keys in headers or rows.
- [ ] PPOD import and export wizards show proper localised step labels and body copy.
- [ ] Per-row sync trigger on students page succeeds against the backend.
- [ ] Old URLs `/regulatory/ppod/cba` and `/regulatory/ppod/transfers` redirect to `/regulatory/cba` and `/regulatory/transfers` (they still render the legacy UI until Phase 8).
- [ ] Mobile 375px clean.
- [ ] Arabic locale clean.
- [ ] Lint + type-check + tests pass. CI green.

---

## Testing

- Playwright: `apps/web/e2e/regulatory-ppod.spec.ts` walks hub → each sub-page and back. Verifies the database toggle updates KPIs.
- Manual: run a PPOD import dry-run on NHQS (ideally with a small CSV), confirm each wizard step renders correctly. Run a PPOD export generate, confirm CSV downloads.
- Manual: trigger a single-student sync, confirm it appears in the sync log.

---

## Risks

- **File moves for CBA and Transfers.** Next.js app-router moves are low-risk but test that the redirect entries actually work in prod (the `next.config.mjs` redirects run at the edge).
- **Response envelope on `/v1/regulatory/ppod/status`.** Apply the Phase 1 unwrap convention consistently.
- **Raw translation keys currently block understanding of the page's data shape.** When fixing translations, confirm each column header still maps to the same backend field — don't accidentally rename.
