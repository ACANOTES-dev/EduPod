# Implementation 18 — AI Panel UI (Ask-AI, Narration, Predictions)

> **Wave:** 4 (parallel, web restart)
> **Depends on:** 01, 10, 11, 12
> **Deploys:** web restart only

---

## Goal

Surface the three AI features (Ask-AI, Narration, Predictions) as polished, trustworthy UI components that the user can reach from the dashboard, individual report pages, and the custom builder. Every AI component is flag-gated — off → not rendered. This is the UI flagship.

## What to change

### 1. Ask-AI page rewrite

`apps/web/src/app/[locale]/(school)/reports/ask-ai/page.tsx` — full rewrite.

**Layout:**

- Centred column, max-w-3xl.
- Page header: title "Ask AI", description "Describe the report you want in plain English, and AI will build it for you."
- Large input textarea at the top (auto-resizing, min 3 rows).
- Below: "Suggestions" — 5 pill buttons with the existing `askAiSuggestion1..5` keys + 5 new tailored suggestions declared for impl 22.
- Submit button — disabled until input is non-empty.
- On submit: loading indicator.
- **Result area**:
  - Rationale strip: "I built this for you…" + 1-sentence explanation.
  - Warnings (if any) in amber.
  - "Open in builder" button — navigates to `/reports/builder` with the query pre-populated (via URL-param or local-storage handoff).
  - "Run now" button — executes inline + shows the result table.
  - Confidence badge (high/medium/low).
- **History section** — last 20 queries with a "Save this" star and a "Run again" button.

Flag-gated by `reports_ask_ai`. When flag off, show a centred "This feature is disabled. Contact an admin to enable AI reports." + a link to settings (if user has `reports.settings`).

### 2. AI Summary Panel (reusable)

New component `apps/web/src/app/[locale]/(school)/reports/_components/ai-summary-panel.tsx`.

Props:

```ts
type AiSummaryPanelProps = {
  contextKey: string; // e.g. 'dashboard', 'attendance-report', 'saved-report:abc123'
  generateEndpoint: string; // POST endpoint to call
  generatePayload?: Record<string, unknown>;
};
```

Render:

- Card with left border accent (violet).
- Header: "AI summary" + "✨" icon.
- Body: narrative text (loading skeleton while fetching).
- Footer: Regenerate button + Copy button + "Disable" link to `/settings/reports#ai-narration`.
- If flag off (fetched separately), render nothing.

Used by:

- `/reports` (dashboard) — `generateEndpoint: '/v1/reports/analytics/ai-summary'`.
- Each individual report page — `generateEndpoint: '/v1/reports/ai-narrator/report/:reportKey'`.
- Custom builder saved-report view — `generateEndpoint: '/v1/reports/ai-narrator/saved/:id'`.

Fetch happens on first view; result cached in component state until page unmount. Regenerate re-fetches.

### 3. Prediction Panel (reusable)

New component `apps/web/src/app/[locale]/(school)/reports/_components/prediction-panel.tsx`.

Props:

```ts
type PredictionPanelProps = {
  kind: 'student_risk' | 'attendance_forecast' | 'cash_flow';
  subjectId?: string; // for student_risk and attendance_forecast
};
```

Render:

- Card with indigo accent.
- Title depends on kind.
- Body: renders the specific shape of each prediction kind:
  - **Student risk** — score gauge (0-100), 2-sentence narrative, factor list.
  - **Attendance forecast** — Recharts line with the forecast + shaded confidence interval.
  - **Cash-flow** — Recharts area with expected daily receipts.
- Footer: Regenerate + Copy + generated-at timestamp.
- Flag-gated by `reports_predictions`.

### 4. Flag fetching

New hook `useAiFlags()`:

```ts
const flags = useAiFlags();
// flags.reports_narration: boolean | 'loading'
// flags.reports_ask_ai: boolean | 'loading'
// flags.reports_predictions: boolean | 'loading'
```

Fetches once per session via `GET /v1/tenant/ai-flags` (filter to reports keys). SWR-style cache. Revalidates on window focus.

All AI components consume this hook and render nothing until their flag loads (then renders or hides based on the boolean).

### 5. Cost-awareness copy

Every AI feature has a small subtle line under its header when first generating:

> "This uses AI credits. {N} previous generations this month."

Where {N} is a tenant-level counter pulled from `ai_logs` count query. If the tenant is in a "quota-exceeded" state (future feature — out of scope for this rebuild), swap for "AI credits exhausted for this month."

### 6. Error handling

Every AI call can fail with:

- `AI_DISABLED` — redirect or show "feature disabled" state.
- `AI_UNAVAILABLE` — "AI is temporarily unavailable, try again in a moment" + Retry button.
- `AI_RATE_LIMITED` — "You've hit the rate limit (20 requests/hour). Try again later."
- `AI_PREDICTION_UNPARSEABLE` — "AI couldn't produce a valid prediction. Please refresh."

All error copy localised via translation keys.

## Testing requirements

- **Component tests** for each panel: loading, success, error, flag-off states.
- **Flag hook test** — fetches, caches, revalidates on focus.
- **Ask-AI e2e** — submit a query, verify result, click "Open in builder", verify builder populates.

## Post-deploy verification

1. Enable `reports_narration` — AI Summary Panel appears on dashboard; generate; narrative renders; regenerate works.
2. Enable `reports_ask_ai` — Ask AI page loads; submit a query; rationale + warnings + result appear.
3. Enable `reports_predictions` — open student-progress for a student; Prediction Panel renders with score.
4. Disable all three — all AI UI disappears entirely; no error dangling anywhere.

## Follow-ups for subsequent waves

- **Impl 21 (Settings page)** — the "Disable" link lands here.

## Rollback

`git revert <sha>` — AI UI disappears. Backend still works, just no UI surface. Safe.
