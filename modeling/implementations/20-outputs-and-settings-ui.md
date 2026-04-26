# Implementation 20 — Outputs UI + Settings Page

> **Wave:** 4
> **Depends on:** 01, 09, 11
> **Deploys:** web restart only

---

## Goal

Two surfaces:

1. **Export buttons** (`Export PDF` / `Export Excel`) used across the workspace, snapshot list, and snapshot detail drawer. They drive the asynchronous render pipeline from phase 09 — when a render isn't ready, the button enters a polling state until it is, then triggers the download via the signed URL.
2. **Settings page** at `/finance/budgeting/settings` where the tenant configures budgeting defaults: default horizon, default household share %, default contingency %, default export format, max-expiry for shareable links, and the set of KPIs hidden from the workspace strip.

Both write to or read from `BudgetingTenantPreferences` (created in phase 01) and the export job pipeline (built in phase 09 / 11).

## What to change

### 1. `_components/export-buttons.tsx` — NEW (shared)

Reusable component embedded in the workspace header (phase 13), snapshot list rows (phase 16), and the snapshot detail drawer (phase 16).

Props:

```ts
type Props = {
  modelId: string;
  snapshotId: string;
  variant?: 'inline' | 'dropdown'; // 'inline' = two side-by-side buttons; 'dropdown' = "Export ▼" menu
  formats?: Array<'pdf' | 'excel'>; // default: ['pdf', 'excel']
};
```

Internal state per format:

```ts
type ExportState =
  | { kind: 'idle' }
  | { kind: 'rendering'; jobId: string; pollAttempt: number; nextPollAt: number }
  | { kind: 'ready'; downloadUrl: string }
  | { kind: 'failed'; message: string };
```

Two parallel state machines (one per format), so PDF and Excel can be in different stages at the same time.

Behaviour:

```ts
const handleClick = async (format: 'pdf' | 'excel') => {
  setExportState(format, {
    kind: 'rendering',
    jobId: '',
    pollAttempt: 0,
    nextPollAt: Date.now() + 10_000,
  });
  try {
    const response = await apiClient<
      | { data: { ready: false; render_job_id: string } }
      | { data: { ready: true; download_url: string } }
    >(`/api/v1/budgeting/financial-models/${modelId}/snapshots/${snapshotId}/exports/${format}`);
    const result = unwrap(response);
    if ('ready' in result && result.ready) {
      // Already rendered + signed URL ready.
      window.location.href = result.download_url;
      setExportState(format, { kind: 'ready', downloadUrl: result.download_url });
      return;
    }
    // 202 — render in flight; start polling.
    setExportState(format, {
      kind: 'rendering',
      jobId: result.render_job_id,
      pollAttempt: 1,
      nextPollAt: Date.now() + 10_000,
    });
  } catch (err) {
    setExportState(format, { kind: 'failed', message: err.message ?? t('exports.errors.unknown') });
    toast.error(err.message ?? t('exports.errors.unknown'));
  }
};
```

Polling:

- 10-second interval per attempt.
- Max 12 attempts (2 minutes total) before transitioning to `failed`.
- Poll endpoint: `GET /api/v1/budgeting/financial-models/:id/snapshots/:sid/exports/:format` (same endpoint; same shape).
- Each poll: if ready, trigger `window.location.href = downloadUrl` and set state to `ready`. Otherwise increment `pollAttempt`, schedule next poll.
- On `failed` after max attempts: toast "Render is taking longer than expected. Try again in a moment."
- Cleanup: on unmount, clear pending timers.

Button copy per state (PDF example):

| State     | Button text                                    | Disabled? |
| --------- | ---------------------------------------------- | --------- |
| idle      | "Export PDF"                                   | no        |
| rendering | "Rendering... (try again in 30s)" with spinner | yes       |
| ready     | "Download PDF" with download icon              | no        |
| failed    | "Retry PDF export"                             | no        |

Variant `inline`:

```
[ Export PDF ] [ Export Excel ]
```

Variant `dropdown` (used on mobile and when the parent is space-constrained):

```
[ Export ▼ ]
   ├─ Export PDF
   └─ Export Excel
```

The dropdown variant uses shadcn `DropdownMenu`. Each item shows the same per-format state.

The component picks variant automatically: `inline` at `md:` and above, `dropdown` at `< md:`. The parent can override via `variant` prop.

A11y:

- Buttons have explicit `aria-label` reflecting state ("Export PDF", "Rendering PDF", "Download PDF — ready").
- `aria-busy={state.kind === 'rendering'}` while polling.
- Dropdown is keyboard-navigable per shadcn defaults.

### 2. Where to embed

- **Workspace header** (phase 13): `<ExportButtons modelId={...} snapshotId={current_snapshot_id} variant="inline" />`. Hidden when no snapshot exists yet (i.e. model is `draft` and never published).
- **Snapshots list rows** (phase 16): `<ExportButtons modelId snapshotId variant="dropdown" />` per row.
- **Snapshot detail drawer** (phase 16): `<ExportButtons modelId snapshotId variant="inline" />` in the drawer header.

This phase OWNS the component. Phases 13 / 16 (already shipped or being built in parallel) consume it. If phase 13 / 16 land before this phase, leave a stub that renders no-op buttons; this phase backfills the real implementation. Coordinate via the wave's shared-file claims.

### 3. Settings route — `apps/web/src/app/[locale]/(school)/finance/budgeting/settings/page.tsx` — NEW

`'use client'`. Single-page form for the tenant's `BudgetingTenantPreferences` row.

Permission: `budgeting.manage` (or higher — Owner / Principal / Vice Principal). Hidden from the budgeting hub navigation when the user lacks the permission. Direct URL access without permission renders a 403-friendly empty state with a back link.

Page layout:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Breadcrumb: Finance / Budgeting / Settings                            │
├──────────────────────────────────────────────────────────────────────┤
│  Header                                                                │
│  - Title: "Budgeting settings"                                         │
│  - Subtitle: "Defaults applied to new financial models and event       │
│    budgets. Existing budgets are not affected."                        │
├──────────────────────────────────────────────────────────────────────┤
│  Form sections (single column):                                        │
│                                                                        │
│  Section: New financial models                                         │
│  - Default horizon (1 / 3 / 5)                                         │
│  - Hidden KPI keys (multi-select)                                      │
│                                                                        │
│  Section: New event budgets                                            │
│  - Default household share %                                           │
│  - Default contingency %                                               │
│                                                                        │
│  Section: Exports                                                      │
│  - Default export format (PDF / Excel / Both)                          │
│                                                                        │
│  Section: Shareable links                                              │
│  - Max expiry (days)                                                   │
│                                                                        │
│  ─────────────────────────────────────────                             │
│  [ Discard changes ] [ Save ] (sticky at bottom)                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 4. `_components/settings-form.tsx` — NEW

The actual form. `react-hook-form` + `zodResolver(budgetingTenantPreferencesSchema)`.

Schema (defined in `@school/shared/budgeting/tenant-preferences.ts` — extend phase 01's Zod schema bundle if not present):

```ts
export const budgetingTenantPreferencesSchema = z.object({
  default_horizon_years: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  default_household_share_pct: z.number().min(0).max(100),
  default_contingency_pct: z.number().min(0).max(30),
  default_export_format: z.enum(['pdf', 'excel', 'both']),
  shareable_link_max_days: z.number().int().min(1).max(365),
  hidden_kpi_keys: z.array(
    z.enum([
      'revenue_per_student',
      'expenditure_per_student',
      'net_per_student',
      'breakeven_students',
    ]),
  ),
});
export type BudgetingTenantPreferences = z.infer<typeof budgetingTenantPreferencesSchema>;
```

Form fields:

1. **Default horizon** — radio cards `1 year` / `3 years` / `5 years`. Single selection. Description: "When you create a new annual model, the default horizon."

2. **Default household share %** — slider 0..100 with numeric input echo. Helper text: "When you create a new event budget, the default percentage of cost households pay (the rest is school subsidy)."

3. **Default contingency %** — slider 0..30 with numeric input echo. Helper text: "Buffer applied to event budgets to absorb cost overruns."

4. **Default export format** — radio cards PDF / Excel / Both. Helper text: "When publishing a snapshot, which export format(s) are pre-selected for rendering."

5. **Shareable link max days** — number input clamped 1..365. Helper text: "The maximum expiry users can choose when issuing a shareable link. Defaults to 30 days."

6. **Hidden KPI keys** — multi-select from a list of the 4 workspace KPIs:
   - Revenue per student
   - Expenditure per student
   - Net per student
   - Breakeven students

   Each checkbox renders the KPI name + a small preview ("e.g. £8,200"). Helper text: "KPIs you uncheck won't appear in the workspace KPI strip. Useful if a metric isn't relevant to your school."

Submit:

```ts
const onSubmit = async (values: BudgetingTenantPreferences) => {
  try {
    const response = await apiClient<{ data: BudgetingTenantPreferences }>(
      '/api/v1/budgeting/tenant-preferences',
      { method: 'PATCH', body: JSON.stringify(values) },
    );
    toast.success(t('settings.saveSuccess'));
    form.reset(unwrap(response)); // re-sync form to canonical server state
  } catch (err) {
    toast.error(err.message ?? t('settings.saveError'));
    console.error('[settings-save]', err);
  }
};
```

Optimistic update: while in flight, the Save button shows a spinner. The form's value is the current source of truth for the UI — no prefetch invalidation needed because there's only one row per tenant and only this page edits it.

Discard changes: resets the form to the last-fetched server state. Disabled when form is not dirty.

Sticky footer: only shown when `form.formState.isDirty`. Animates in via `slide-in-from-bottom` so it doesn't take space when not needed.

### 5. Initial data fetch

```tsx
const [initialValues, setInitialValues] = React.useState<BudgetingTenantPreferences | null>(null);

React.useEffect(() => {
  let cancelled = false;
  void (async () => {
    try {
      const response = await apiClient<{ data: BudgetingTenantPreferences }>(
        '/api/v1/budgeting/tenant-preferences',
      );
      if (cancelled) return;
      setInitialValues(unwrap(response));
    } catch (err) {
      console.error('[settings-fetch]', err);
      // If the tenant preferences row doesn't exist yet, server returns defaults.
      // No fallback needed — the API guarantees a row.
    }
  })();
  return () => {
    cancelled = true;
  };
}, []);
```

While `initialValues` is null, the page renders a skeleton form (input shapes greyed out, no form state hydrated).

### 6. API contract (consumed; defined in phase 01 / 09 / 11)

- `GET /api/v1/budgeting/tenant-preferences` — returns the row; if absent, server returns defaults populated from the schema.
- `PATCH /api/v1/budgeting/tenant-preferences` — body is the full preferences shape. Server upserts.
- `GET /api/v1/budgeting/financial-models/:id/snapshots/:sid/exports/:format` (`format` ∈ `pdf` | `excel`):
  - 200 response: `{ data: { ready: true, download_url: string } }` — render is complete; URL is signed and short-lived.
  - 202 response: `{ data: { ready: false, render_job_id: string } }` — render is in flight; client polls.
  - 404 response: `{ error: { code: 'SNAPSHOT_NOT_FOUND' | 'FORMAT_NOT_SUPPORTED', message: string } }`.
  - 403 response: `{ error: { code: 'PERMISSION_DENIED', message: string } }`.

### 7. Module hub navigation

The settings page should appear in the budgeting hub (phase 12) as a top-level link, but ONLY for users with `budgeting.manage`. Phase 12 owns the hub; this phase's only contribution is adding the link to the hub config — coordinate via shared-file claim if phase 12 ships first.

If phase 12 lands first without the settings link, the settings page is still reachable via direct URL — no functional regression, just a hub navigation gap that this phase backfills.

### 8. i18n

All keys under `budgeting.settings.*`:

- `.title`
- `.subtitle`
- `.sections.financialModels`
- `.sections.eventBudgets`
- `.sections.exports`
- `.sections.shareableLinks`
- `.fields.defaultHorizon.label` / `.helper`
- `.fields.defaultHorizon.option1Year` / `.option3Years` / `.option5Years`
- `.fields.defaultHouseholdShare.label` / `.helper`
- `.fields.defaultContingency.label` / `.helper`
- `.fields.defaultExportFormat.label` / `.helper` / `.optionPdf` / `.optionExcel` / `.optionBoth`
- `.fields.shareableLinkMaxDays.label` / `.helper`
- `.fields.hiddenKpiKeys.label` / `.helper`
- `.kpiNames.revenuePerStudent` / `.expenditurePerStudent` / `.netPerStudent` / `.breakevenStudents`
- `.discardChanges`
- `.save`
- `.saving`
- `.saveSuccess`
- `.saveError`

And export-related keys under `budgeting.exports.*`:

- `.exportPdf` / `.exportExcel` / `.exportBoth`
- `.rendering`
- `.tryAgainIn` (with interpolated seconds)
- `.downloadPdf` / `.downloadExcel`
- `.retryPdf` / `.retryExcel`
- `.errors.renderFailed`
- `.errors.timeout`
- `.errors.unknown`

### 9. Mobile

- Settings form: single-column on all viewports (it's already single-column). At `< sm:`, the radio cards (horizon, export format) collapse to vertical stack from horizontal grid.
- Sticky footer: full-width on mobile.
- Sliders: ensure the slider's track + thumb are touch-friendly (≥ 24px thumb).
- Export buttons: dropdown variant on mobile (the inline variant is too wide for narrow viewports). Verify the dropdown trigger is ≥ 44×44px.

### 10. KPI hide preview

Below the "Hidden KPI keys" multi-select, show a small preview line:

```
KPIs visible in workspace: Revenue per student · Expenditure per student
KPIs hidden: Net per student · Breakeven students
```

Updates live as the user toggles checkboxes. Helps the user understand the consequence of their setting.

The phase 13 workspace (KPI strip) reads `BudgetingTenantPreferences.hidden_kpi_keys` and filters the strip accordingly. This phase doesn't need to touch phase 13's component — that phase already reads the preferences.

### 11. Read-only export buttons for snapshots without a current PDF

If a snapshot has no `pdf_object_key` AND no `excel_object_key`, the buttons render in `idle` state. First click triggers the render. Subsequent clicks (after render completes) re-fetch the signed URL — signed URLs are short-lived (1 hour per `PLAN.md §11.1`).

If the user clicks during a poll, the button is already disabled (per the state machine) so no action.

### 12. Permission-denied UX

When the API returns 403 (e.g. user without `budgeting.manage` somehow lands on `/finance/budgeting/settings` via a stale link):

```
┌─────────────────────────────────────────────────────────┐
│       You don't have permission                          │
│                                                           │
│       Only Owner, Principal, and Vice Principal roles     │
│       can manage budgeting settings.                      │
│                                                           │
│       [ Back to budgeting hub ]                           │
└─────────────────────────────────────────────────────────┘
```

This is a friendly redirect-equivalent rendered on the page (no programmatic redirect — keeps the URL stable so the user understands what they tried to access).

## Testing requirements

- **Component tests:**
  - `export-buttons.spec.tsx` — table-driven tests for each state machine transition: idle → rendering → ready (200 path), idle → rendering → polling → ready (202 + poll path), idle → failed (after max attempts), retry from failed.
  - `settings-form.spec.tsx` — form renders all fields, submitting fires PATCH, dirty state shows the sticky footer, discard resets, validation errors render inline.

- **Page-level test:** `settings/page.spec.tsx` — mock `apiClient`, render the page, walk through fetch → render → edit → save.

- **Playwright smoke (phase 21):**
  - As `owner@nhqs.test`, navigate to `/finance/budgeting/settings`.
  - Modify `default_household_share_pct` from 100 to 75.
  - Click Save.
  - Assert toast appears.
  - Reload the page.
  - Assert the value persisted as 75.
  - Capture `browser_console_messages(level: 'error')`; assert empty.

  Per memory: cap at ~20 minutes; delete screenshots.

  For exports:
  - Navigate to a published model's snapshot detail drawer.
  - Click "Export PDF".
  - Assert button transitions to `rendering` state.
  - The smoke does NOT wait the full 2 minutes for a real render — instead, mock the API response or assert the polling fired correctly within the first 30 seconds.

## Post-deploy verification

1. Rsync `apps/web/`. `pm2 restart web`.
2. Open `/finance/budgeting/settings` as `owner@nhqs.test`. Verify the form loads with current preferences.
3. Modify `default_horizon_years` to 3, save. Toast appears. Reload — value persists.
4. Open a published snapshot's detail drawer. Click "Export PDF". Verify the button shows the rendering state.
5. Wait ~30 seconds, click again — if the render completed, the button shows "Download PDF" and clicking triggers download. If still rendering, polling continues.
6. Test the dropdown variant on mobile (resize to 375px).
7. Spot-check a user without `budgeting.manage` — direct-URL access to `/finance/budgeting/settings` shows the 403 friendly state.
8. Confirm console: zero errors.

## Follow-ups for subsequent waves

- Phase 21 (polish) writes the Playwright smoke covering settings save + export polling, runs Arabic translation pass, audits a11y.
- The settings page reads / writes `BudgetingTenantPreferences` (created in phase 01). The phase 12 hub, phase 13 workspace, phase 17 event workspace, and phase 19 share modal all consume specific fields from this row — all already wired in their respective phases per the schema reference in phase 01.

## Rollback

`git revert <sha>`. Web-only restart.

If phase 13 / 16 already ship the export-buttons component as a stub before this phase lands, the revert leaves them as stubs (no-op buttons). If this phase ships the real component first, the revert removes export functionality across the workspace. Either is graceful — no data loss, no broken state.

The settings page reverts cleanly: if users had modified preferences, the row remains in the DB unchanged; reverting the UI just removes the edit surface. Defaults from phase 01 still apply.

The PATCH endpoint (phase 09 / 11) and `BudgetingTenantPreferences` table (phase 01) are untouched.
