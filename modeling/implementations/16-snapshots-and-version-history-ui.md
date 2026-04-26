# Implementation 16 — Snapshots & Version History UI

> **Wave:** 4
> **Depends on:** 01 (schema), 05 (snapshots service), 09 (export pipeline)
> **Deploys:** web restart only (`pm2 restart web`)

---

## Goal

Build the version history view at `/finance/budgeting/models/[id]/snapshots` AND wire the publish flow that lives on the workspace page header (impl 13). This phase delivers two surfaces:

1. **Snapshots list page** — every published version of the model in reverse chronological order. Each row exposes the executive summary preview, render-status of PDF/Excel exports, and three actions: Restore as draft / Download PDF / Download Excel. A side-drawer ("Snapshot detail") shows the full state of a snapshot read-only without leaving the page.
2. **Publish modal** — opened from the workspace header's "Publish" button. Captures the executive summary, confirms, POSTs the publish endpoint, redirects to the snapshots list with a success toast.

The phase 19 "Share via link" button is a placeholder here — it lives on snapshot rows but is gated until phase 19 ships. Per the brief, do NOT build the share UI in this phase; just leave the button disabled with a "Coming soon" tooltip.

## What to change

### 1. Snapshots list page — `apps/web/src/app/[locale]/(school)/finance/budgeting/models/[id]/snapshots/page.tsx`

NEW. `'use client'`.

**State:**

```typescript
type SnapshotsState = {
  model: FinancialModel | null;
  snapshots: SnapshotRow[] | null;
  isLoading: boolean;
  detailDrawerSnapshotId: string | null; // null = closed
  restoreInFlightId: string | null;
  toast: { type: 'success' | 'error'; message: string } | null;
};
```

`SnapshotRow` shape (from impl 05):

```typescript
type SnapshotRow = {
  id: string;
  version_number: number;
  published_at: string; // ISO timestamp
  published_by: { id: string; name: string };
  executive_summary: string | null;
  pdf_object_key: string | null;
  excel_object_key: string | null;
  rendered_at: string | null;
  pdf_render_status: 'pending' | 'rendering' | 'ready' | 'failed';
  excel_render_status: 'pending' | 'rendering' | 'ready' | 'failed';
};
```

**Effect: load model + snapshots.**

```typescript
const [modelRes, snapshotsRes] = await Promise.all([
  apiClient<{ data: FinancialModel }>(`/api/v1/budgeting/financial-models/${id}`),
  apiClient<{ data: SnapshotRow[] }>(
    `/api/v1/budgeting/financial-models/${id}/snapshots?sort=published_at:desc`,
  ),
]);
```

If the model has no snapshots yet (empty array): render an empty state — "No snapshots yet. Publish your first to lock in a version of the model." with a "Back to workspace" CTA.

**Layout:**

```
<div className="flex flex-col gap-6 pb-10 p-6">
  <PageHeader title={t('title')} description={modelName} back={...} />
  {isLoading ? <SkeletonList /> : snapshots.length === 0 ? <EmptyState /> : (
    <ul className="flex flex-col gap-3">
      {snapshots.map((s) => <SnapshotRow key={s.id} ... onView={() => setDrawerId(s.id)} ... />)}
    </ul>
  )}
</div>

<SnapshotDetailDrawer open={drawerId !== null} snapshotId={drawerId} onClose={() => setDrawerId(null)} />
```

PageHeader `back` prop: `{ href: \`/finance/budgeting/models/${id}\`, label: t('backToWorkspace') }`.

The page is read-only viewing + a few specific actions (restore, download). No model editing happens here.

### 2. Snapshot row — `_components/snapshot-row.tsx`

NEW. List item for a single snapshot.

- Props: `{ snapshot: SnapshotRow; canPublish: boolean; canShare: boolean; modelId: string; onView: () => void; onRestoreClick: () => void; locale: string }`.
- Layout (LTR; everything mirrors via logical properties):

  ```
  ┌──────────────────────────────────────────────────────────────────┐
  │ [Version v3 chip]   Published 12 March 2026 by Aisha Khan        │
  │                                                                    │
  │ "We're projecting a £42k surplus this year on the back of..."     │
  │ (executive summary first line, truncated at 2 lines)               │
  │                                                                    │
  │ [PDF: ready ✓] [Excel: rendering…] [Restore as draft] [Share…]    │
  └──────────────────────────────────────────────────────────────────┘
  ```

- The whole row is tappable (sets `onView` to open the detail drawer).
- Action buttons stop event propagation so they don't also trigger `onView`.
- Version chip: `<Badge variant="outline">v{snapshot.version_number}</Badge>`. The latest snapshot also gets a small "Current" pill in green.
- Render status indicators per export format:
  - `pending` / `rendering` → spinner + "Rendering" label, button disabled.
  - `ready` → green check + "PDF" / "Excel" label, button is a link to the download endpoint.
  - `failed` → red X + "Render failed" label + retry icon (clicking it POSTs to the regenerate endpoint).
- Download buttons: hit `GET /v1/budgeting/financial-models/${modelId}/snapshots/${snapshot.id}/exports/pdf` (or `/exports/excel`). The endpoint returns a signed URL the browser can stream. Use the existing `downloadPdf` / `download-utils` pattern in `apps/web/src/lib/`. If the endpoint returns 409 with `code: 'EXPORT_NOT_READY'` (because polling is racy), show a toast "Rendering — try again in 30 seconds" and don't proceed.
- "Restore as draft" button: gated on `canPublish` (permission `budgeting.publish`). Click → opens a small confirm dialog ("Restore this version as a new editable draft? Your current draft will be replaced.") → on confirm, calls `POST /api/v1/budgeting/financial-models/${modelId}/snapshots/${snapshot.id}/restore`. On success, toast "Snapshot restored as draft" + redirect to `/finance/budgeting/models/${modelId}`.
- "Share via link" button: gated on `canShare` (permission `budgeting.share`). For phase 16, render the button as `<Button disabled title="Available after phase 19">Share via link</Button>`. Phase 19 will replace the disabled state with the share-modal trigger.

- Mobile: row content stacks vertically (version + date / summary / action buttons in three rows).

### 3. Snapshot detail drawer — `_components/snapshot-detail-drawer.tsx`

NEW. Slides in from the end edge, shows the snapshot's full state read-only.

- Props: `{ open: boolean; modelId: string; snapshotId: string | null; onClose: () => void }`.
- On open, fetch the snapshot detail:

  ```typescript
  apiClient<{ data: SnapshotDetail }>(
    `/api/v1/budgeting/financial-models/${modelId}/snapshots/${snapshotId}`,
  );
  ```

  `SnapshotDetail` shape:

  ```typescript
  type SnapshotDetail = SnapshotRow & {
    payload: {
      drivers: Drivers;
      scenarios: Scenario[];
      line_items: FinancialModelLineItem[];
      totals_by_year: YearTotals[];
      per_pupil_economics: PerPupilEconomics[];
      source_snapshot_json: SourceDataSnapshot;
    };
  };
  ```

- Drawer body sections (each collapsible):
  - **Header** — version, published date/by, executive summary (full text rendered with line breaks preserved).
  - **KPI strip** — same shape as the workspace's KPI strip but reading from `payload.totals_by_year[0]` and `payload.per_pupil_economics[0]`.
  - **Drivers** — humanized list of every driver value (the canonical 11 + capex items + per-year overrides if present). Use the same humanizing logic from impl 13's drivers drawer, just rendered as read-only key-value pairs.
  - **Line items** — categorised, no edit affordance. Reuses a simplified read-only flavour of impl 13's `LineItemTable`. Currency cells in JetBrains Mono.
  - **Scenarios** — collapsible per alternative; each shows its driver overrides and line items.
- Footer: "Download PDF" / "Download Excel" / "Restore as draft" buttons (same as the row actions).
- Mobile: drawer becomes a full-screen sheet.
- Close: X button + `Esc` key + click-outside.

### 4. Publish modal — `_components/publish-modal.tsx`

NEW. Owned by impl 16 BUT triggered from the workspace page header (impl 13).

- Export this component from `_components/publish-modal.tsx` so impl 13 can import it.
- Props: `{ open: boolean; modelId: string; modelName: string; onClose: () => void; onPublished: (snapshotId: string) => void }`.
- react-hook-form + zodResolver. Schema `publishSnapshotSchema` from `@school/shared/budgeting`:
  ```typescript
  z.object({
    executive_summary: z.string().max(4000).optional(),
  });
  ```
- Modal body:
  - Heading: "Publish snapshot"
  - Description: "This freezes a version of {modelName}. You'll continue editing in a new draft afterwards. The snapshot stays accessible forever."
  - Textarea: `executive_summary` — multi-line, ~6 rows visible. Placeholder: "Write a short summary for the board (optional). 1–2 paragraphs is ideal." Character counter at the bottom (e.g. "324 / 4000").
  - Confirmation checkbox: "I understand this will lock the current state as a permanent version."
  - Submit button: "Publish snapshot" (disabled until checkbox is ticked).
  - Cancel button.
- Submit: `POST /api/v1/budgeting/financial-models/${modelId}/snapshots/publish` with body `{ executive_summary }`. Returns `{ data: { id, version_number } }`.
- On success: close modal, call `onPublished(snapshotId)` which (per the contract with impl 13's workspace page) triggers a redirect to `/finance/budgeting/models/${modelId}/snapshots` with a success toast "Published v{n} ✓". The redirect happens via `router.push()` from the parent page, not the modal itself.
- On error:
  - 409 `code: 'NO_CHANGES_TO_PUBLISH'` → toast "No changes since the last published version".
  - Other → generic toast.

- Permission: the button to open this modal (on the workspace) requires `budgeting.publish`. The modal itself trusts the parent component's gating + the backend's re-check.

- Mobile: modal becomes a bottom sheet at <768px (use `@school/ui` `Modal` with `mobileLayout="sheet"` if supported, otherwise an explicit `<Sheet side="bottom">`).

### 5. Workspace integration (cross-impl coordination)

Impl 13's workspace page (`/models/[id]/page.tsx`) will import and render `<PublishModal>` from this phase. Concretely, after impl 16 ships:

- Workspace state adds `publishModalOpen: boolean`.
- Workspace header's "Publish snapshot" button (gated on `budgeting.publish` AND `model.status === 'draft'`) sets `publishModalOpen = true`.
- Workspace renders `<PublishModal open={publishModalOpen} modelId={id} modelName={model.name} onClose={() => setPublishModalOpen(false)} onPublished={(sid) => { router.push(\`/${locale}/finance/budgeting/models/${id}/snapshots\`); toast.success(t('published', { version: ... })) }} />`.

Per IMPLEMENTATION_LOG.md Rule 17 (shared-file ownership), this is a known cross-impl edit on `apps/web/src/app/[locale]/(school)/finance/budgeting/models/[id]/page.tsx`. Coordination plan:

- If impl 13 deploys before impl 16: impl 13 leaves the Publish button disabled with a placeholder tooltip and exposes a TODO comment in the workspace page.
- When impl 16 deploys, the implementing session amends the workspace page to import `PublishModal` and wire the button.
- This phase claims `apps/web/src/app/[locale]/(school)/finance/budgeting/models/[id]/page.tsx` per Rule 17 BEFORE editing it. Append the claim to §5 of the log.

If impl 13 is already in `completed` status when this phase starts, the wiring edit lands in this phase's commit — no coordination needed.

### 6. Restore confirmation

Inline in `snapshot-row.tsx` or a tiny separate component. Modal asks:

> Restore version v{n} as a new draft?
>
> The model's current draft will be replaced with the state from this snapshot. The snapshot itself stays in history.

Two buttons: Cancel / Restore as draft. Submit calls the restore endpoint; on success, redirect to `/models/{id}` and toast "Snapshot v{n} restored as draft".

Permission re-check: backend rejects restore for users without `budgeting.publish`; frontend hides the button when missing.

### 7. Render-status polling

When a snapshot's `pdf_render_status` or `excel_render_status` is `pending` or `rendering`, the list page polls for updates every 10 seconds (only for visible rows, capped at 5 minutes total). Use a single shared timer in the page component:

```typescript
React.useEffect(() => {
  if (!snapshots) return;
  const hasPending = snapshots.some(
    (s) =>
      s.pdf_render_status === 'pending' ||
      s.pdf_render_status === 'rendering' ||
      s.excel_render_status === 'pending' ||
      s.excel_render_status === 'rendering',
  );
  if (!hasPending) return;
  const t = setInterval(async () => {
    const res = await apiClient<{ data: SnapshotRow[] }>(
      `/api/v1/budgeting/financial-models/${id}/snapshots`,
    );
    setSnapshots(res.data);
  }, 10_000);
  return () => clearInterval(t);
}, [snapshots, id]);
```

Stop polling once all rows are `ready` or `failed` (or after 5 minutes, whichever comes first).

### 8. Translation keys

Add to `apps/web/messages/en.json`:

```json
{
  "financeBudgetingSnapshots": {
    "title": "Snapshots",
    "backToWorkspace": "Back to workspace",
    "empty": {
      "title": "No snapshots yet",
      "body": "Publish your first to lock in a version of the model.",
      "cta": "Back to workspace"
    },
    "row": {
      "publishedAt": "Published {date} by {name}",
      "currentPill": "Current",
      "versionPill": "v{n}",
      "renderStatus": {
        "pending": "Rendering…",
        "rendering": "Rendering…",
        "ready": "Ready",
        "failed": "Render failed",
        "retry": "Retry"
      },
      "downloadPdf": "PDF",
      "downloadExcel": "Excel",
      "restore": "Restore as draft",
      "share": "Share via link",
      "shareDisabled": "Available after phase 19"
    },
    "detail": {
      "title": "Snapshot v{n}",
      "executiveSummaryHeader": "Executive summary",
      "noSummary": "No executive summary written for this snapshot.",
      "kpiHeader": "Headline numbers",
      "driversHeader": "Drivers",
      "lineItemsHeader": "Line items",
      "scenariosHeader": "Alternatives",
      "downloadPdf": "Download PDF",
      "downloadExcel": "Download Excel",
      "restore": "Restore as draft"
    },
    "publishModal": {
      "title": "Publish snapshot",
      "body": "This freezes a version of {modelName}. You'll continue editing in a new draft afterwards. The snapshot stays accessible forever.",
      "executiveSummaryLabel": "Executive summary",
      "executiveSummaryPlaceholder": "Write a short summary for the board (optional). 1–2 paragraphs is ideal.",
      "characterCount": "{count} / 4000",
      "confirmCheckbox": "I understand this will lock the current state as a permanent version.",
      "submit": "Publish snapshot",
      "cancel": "Cancel",
      "publishedToast": "Published v{version}",
      "noChangesError": "No changes since the last published version"
    },
    "restoreModal": {
      "title": "Restore version v{n} as a new draft?",
      "body": "The model's current draft will be replaced with the state from this snapshot. The snapshot itself stays in history.",
      "submit": "Restore as draft",
      "cancel": "Cancel",
      "restoredToast": "Snapshot v{n} restored as draft"
    },
    "exportNotReady": "Rendering — try again in 30 seconds"
  }
}
```

Mirror identical English values into `messages/ar.json`.

### 9. Mobile

- Snapshot rows: stack vertically. Each action button full-width.
- Detail drawer: full-screen sheet.
- Publish modal: bottom sheet.
- Restore confirm: native-feeling alert dialog.

### 10. RTL

- Drawer slides from start edge in RTL (logical via `<Sheet side="end">`).
- Action button rows use `gap-2` + flex; no `mr-` / `ml-` anywhere.
- Currency / version numbers in `<span dir="ltr">`.

## Testing requirements

- **Component tests** (Jest + RTL):
  - `snapshot-row.spec.tsx`:
    - Renders version chip, published-at line, summary preview.
    - PDF button enabled when status `ready`, disabled / spinner when `pending|rendering`, error icon when `failed`.
    - "Current" pill on the latest snapshot.
    - Restore button hidden without `canPublish`.
    - Share button always disabled (until phase 19) with the right tooltip.
  - `snapshot-detail-drawer.spec.tsx`:
    - Fetches the detail when opened, renders sections.
    - Returns null when `snapshotId` is null.
  - `publish-modal.spec.tsx`:
    - Submit disabled until checkbox ticked.
    - Submits with executive_summary; calls onPublished on success.
    - Surfaces NO_CHANGES_TO_PUBLISH error.
- **Integration test** for the snapshots page:
  - Empty state when no snapshots.
  - List renders sorted desc by published_at.
  - Polling timer fires when a row has pending status; stops when all rows ready.
  - Restore flow round-trips and redirects.
- **No regression** — `pnpm turbo run test --filter=@school/web`.
- **Type-check + lint** at root.

## Post-deploy verification

1. Local gauntlet passes.
2. Commit (`feat(budgeting): snapshots & version history UI + publish modal`), rsync, chown, `pnpm --filter @school/web build`, `pm2 restart web`.
3. `/api/health` 200; PM2 logs clean.
4. Acquire Playwright lock and run:
   - Authenticate as `owner@nhqs.test`.
   - Pre-condition: NHQS needs at least one model. Use the model from impls 12/13 verification.
   - **Publish flow** (from impl 13's workspace):
     - `browser_navigate('https://nhqs.edupod.app/en/finance/budgeting/models/<id>')`.
     - Click "Publish snapshot" in the workspace header. Assert: modal opens.
     - Type "Test executive summary for verification run" into the textarea.
     - Tick the confirm checkbox.
     - Click "Publish snapshot". Assert: modal closes, redirect to `/snapshots`, success toast.
   - **Snapshots list**:
     - Assert: 1 row visible. Version chip shows "v1". "Current" pill present.
     - PDF and Excel render-status indicators visible — likely in `pending` or `rendering` state for the first 30–90 seconds (impl 09's worker handles this asynchronously).
     - Wait up to 60 seconds (`browser_wait_for({ text: 'Ready' })`). Assert: PDF and Excel both turn `ready`.
     - Click PDF download button. Assert: a download is initiated (a network response with PDF mime type, OR a new browser tab opening the signed URL — confirm via `browser_network_requests`).
   - **Detail drawer**:
     - Click the row. Assert: drawer opens with KPI strip, drivers section, line items section.
     - Close via X.
   - **Restore flow**:
     - Edit the model in workspace (change a driver) so a new draft state diverges.
     - Return to snapshots list, click "Restore as draft" on v1.
     - Confirm in the modal. Assert: redirect to workspace, toast "Snapshot v1 restored as draft", workspace shows restored values.
   - Resize to 375px:
     - Snapshot rows stack vertically.
     - Detail drawer is full-screen sheet.
     - Publish modal is bottom sheet.
   - Capture `browser_console_messages(level: 'error')`. Assert empty.
5. Release Playwright lock; append §5 record.

## Follow-ups

- Phase 19 will replace the disabled "Share via link" button with the working share modal — that phase imports nothing from this phase, only adds an editable trigger.
- Phase 21 may add a small "compare versions" affordance (diff between v3 and v4) — not in v1 scope.
- The polling cadence for render status (10s, 5min cap) is a starting point; phase 21 may tune based on observed worker latency.

## Rollback

`git revert <commit-sha>` then `pm2 restart web`. The revert removes the snapshots page and the publish modal. Workspace's "Publish" button (impl 13) routes to nowhere — leave a TODO note in the rollback completion record. Restore that workspace integration in the next forward-fix commit. No DB changes; published snapshots stay in `financial_model_snapshots` and are still accessible via the API; only the UI surface is removed.
