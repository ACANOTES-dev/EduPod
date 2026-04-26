# Implementation 14 — Reports Hub + KPI Dashboard UI

> **Wave:** 4 (parallel, web restart)
> **Depends on:** 01, 03
> **Deploys:** web restart only

---

## Goal

Rewrite `/reports/page.tsx` as the hub dashboard: the 10 new movable KPIs from impl 03, info-icon tooltips on every card, real error states (no silent mock fallback), the hub's quick-link grid (15 report tiles), and an optional AI summary panel at the top (renders only when `reports_narration` flag is on for the tenant).

## What to change

### 1. Delete the silent mock fallback

In `apps/web/src/app/[locale]/(school)/reports/page.tsx`, lines 328–347 — the `.catch` that falls back to `{ total_students: 195, attendance_rate: 93, ... }`. Replace with:

```ts
.catch((err) => {
  console.error('[ReportsPage]', err);
  setError({ code: err?.code ?? 'UNKNOWN', message: err?.message ?? t('analytics.loadError') });
})
```

Add an `error` state variable. When error is set, render a bordered card with:

- Icon (AlertTriangle, red)
- Title: `t('analytics.loadErrorTitle')` → "Unable to load live data"
- Body: `t('analytics.loadErrorBody')` → "We couldn't reach the reporting service. Please refresh, or contact support if this continues."
- Retry button — calls `fetchData()`.

No mock fallback. Ever.

### 2. KpiCard component rewrite

New file: `apps/web/src/app/[locale]/(school)/reports/_components/kpi-card.tsx`.

Props:

```ts
type KpiCardProps = {
  kpi: KpiCard; // from the API response
};
```

Renders:

- Icon (Lucide icon, resolved from a static map by `kpi.key`).
- Info icon (ⓘ) top-right, with a Radix Tooltip trigger. Tooltip content = `t(kpi.tooltip_key)`. Keyboard-accessible (tab-focusable trigger).
- Value (large, from `kpi.value`).
- Delta row — arrow-up or arrow-down icon + delta string + colour based on `kpi.delta.direction` + `kpi.delta.better_when`.
- Sparkline — Recharts `<AreaChart>` with a single `<Area>`, 28px height, colour = the card's themed colour.
- If `kpi.severity === 'warning'` or `'critical'`, add a left border in amber or red.
- Click anywhere on the card (except the info icon) → navigates to `kpi.drill_down_href`.

### 3. Tooltip content

Translation keys per KPI, all under `reports.analytics.kpiTooltip.{key}`. Declare every key in impl 22's translation sweep but **stub them here** with the English text from PLAN.md §3. Arabic translations land in impl 22.

### 4. Dashboard layout

Grid: 2 cols on mobile, 3 on md, 5 on xl. Cards responsive. Fixed height per card so the grid stays stable as data loads.

Between the KPI grid and the quick-link grid, an **AI Summary Panel** (`ai-summary-panel.tsx`):

- Renders only if the AI narration flag is on (the frontend fetches flag state via a new endpoint `GET /v1/tenant/ai-flags` and caches per session).
- If flag off: don't render.
- If flag on but narrative not yet generated: show a "Generate AI summary" button.
- On click: POST `/v1/reports/analytics/ai-summary` → shows 3-sentence narrative + refresh button + copy button + "Disable AI" link (to settings page).

### 5. Quick-link grid

The existing 15-tile quick-link grid stays in place but with these fixes:

- **Normalize translation keys** — every label uses `reports.analytics.<name>` (not a mix of `reports.analytics.*` and `reports.*`). Fix the 3 inconsistent keys (`reports.studentExport`, `reports.writeOffs`, `reports.notificationDelivery`) by renaming to `reports.analytics.studentExport` etc. The actual translation values land in impl 22; this phase updates the key references in the page component.
- **Add short descriptions** under each title, pulled from the corresponding `<key>Desc` translation keys.
- **Sort** by intended workflow priority (dashboard first, then operational reports, then audit reports).

### 6. Refresh + loading states

- Refresh button in the top-right of `PageHeader`. Same behaviour as today (triggers fetch) but also invalidates the AI narrative cache if present.
- Loading state: skeleton cards while first fetch is in flight.
- Loaded state: real cards.
- Error state: error card (§1).

### 7. Trends chart

The big trends chart at the bottom — consumes `trends.weeks`, `trends.attendance`, `trends.grades`, `trends.collection` from the same endpoint. Replace `MOCK_TRENDS` usage with the real data.

## Testing requirements

- **Component test** (Vitest + React Testing Library) — KpiCard with each severity variant renders correctly.
- **Component test** — Tooltip opens on hover and focus.
- **Playwright e2e** — `/reports` loads, all 10 cards visible, info-icon opens tooltip, click on a card navigates to drill-down. Smoke only; don't over-invest.
- **Error state test** — force API error via network mock, verify error card renders, retry works.

## Post-deploy verification

1. Login to NHQS as owner, navigate to `/reports`.
2. All 10 KPI cards render with real numbers (not 195/93/75 mock).
3. Hover info icon on each card — tooltip shows.
4. Click "Attendance today" — navigates to `/reports/attendance`.
5. Trigger an error by revoking a permission temporarily — error card renders, no silent mock.
6. Enable AI narration flag — AI Summary Panel appears; click generate; narrative renders.
7. 5 minutes later the dashboard auto-refreshes; AI summary stays (it's cached separately).

## Follow-ups for subsequent waves

- **Impl 15 (Individual Report Pages UI)** — similar treatment for each domain report.
- **Impl 21 (Settings page)** — AI flag toggles drive the presence of the AI Summary Panel.
- **Impl 22 (Translation sweep)** — fills in all tooltip translations + Arabic parity.

## Rollback

`git revert <sha>` — the old mock-fallback page returns. Not desirable but functional. Safe.
