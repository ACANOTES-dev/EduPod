# Implementation 05 — Walk-in Wizard + Admin Surfaces

> **Wave:** 3 (parallel-risky with impl 04)
> **Classification:** frontend
> **Depends on:** 02, 03
> **Deploys:** Web restart only

---

## Goal

Surface the new household-number primitive in the three admin-facing spots it needs to live:

1. **Walk-in registration wizard** — the household step previews an auto-generated household number with a refresh button (same pattern the staff form uses for staff numbers). The number is locked-in on wizard completion.
2. **Household detail page** — displays the household number prominently alongside the household name.
3. **Admissions queue rows** — shows a small "Sibling" badge on applications where `is_sibling_application = true`, so the admin can see at a glance which waiting-list entries have sibling priority.

No other admin surfaces are touched in this impl. The student detail page, the household list page, the admissions detail page — none need edits for this primitive to work. They all already render `student_number` as a plain text field; the value is different now (`XYZ476-01` instead of `STU-000212`) but the display is identical.

## Shared files this impl touches

- `apps/web/messages/en.json` — adds a small cluster of keys: `registrationWizard.household.numberPreview`, `registrationWizard.household.refreshNumber`, `householdDetail.householdNumberLabel`, `admissionsQueues.siblingBadge`. Edit in the final commit window. Buffer while coding.
- `apps/web/messages/ar.json` — same keys, Arabic translations. Edit in the final commit window.
- `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-household.tsx` — adds the household-number preview row and refresh button. Impl 05 owns this but document the WHAT (new UI element, one `useEffect` to fetch a preview on mount, one button handler to regenerate).
- `apps/web/src/app/[locale]/(school)/households/[id]/page.tsx` — adds the household number display alongside the existing name. Impl 05 owns this.
- `apps/web/src/app/[locale]/(school)/admissions/_components/application-row.tsx` — adds the sibling badge. Impl 05 owns this.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Separate commit.

The translation files (en.json / ar.json) are the conflict zone with impl 04. Follow Rule H8/H9 — buffer the keys locally and merge-write them in the final commit.

## What to build

### Sub-step 1: Preview endpoint (client-side helper)

The wizard needs a way to fetch a candidate household number from the backend. The existing `HouseholdNumberService.previewForTenant` method (impl 02) is reachable via a new admin-authenticated endpoint:

**Minor backend addition — fold into the frontend impl because it's one endpoint:**

Create `apps/api/src/modules/households/households.controller.ts` route:

```ts
@Get('next-number')
@RequiresPermission('students.manage')
async nextNumber(@CurrentTenant() tenant: TenantContext) {
  return this.householdsService.previewNumber(tenant.tenant_id);
}
```

The service method wraps `HouseholdNumberService.previewForTenant` inside a short read-only RLS transaction. Returns `{ household_number: 'XYZ476' }`.

Add this endpoint, wire into `households.module.ts` controllers, snapshot-update the API surface.

Alternative: if you'd rather keep backend changes in impl 03, move this to impl 03 and consume it here. I'm folding it into impl 05 because it's a single 15-line endpoint that logically pairs with the wizard preview UI. Judgement call — either placement is defensible. If impl 03 already shipped when impl 05 starts, make the change here.

### Sub-step 2: Wizard household step

Edit `step-household.tsx`. Add a row just below the "Household name" input:

```tsx
<div className="mb-4 rounded-lg border border-border bg-surface-secondary px-4 py-3">
  <div className="flex items-center justify-between">
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-text-tertiary">
        {t('household.numberPreviewLabel')}
      </p>
      <p className="font-mono text-lg font-semibold text-text-primary" dir="ltr">
        {householdNumber ?? '—'}
      </p>
    </div>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleRefreshNumber}
      disabled={refreshing}
    >
      <RefreshCw className={`me-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
      {t('household.refreshNumber')}
    </Button>
  </div>
  <p className="mt-2 text-xs text-text-tertiary">{t('household.numberPreviewHelper')}</p>
</div>
```

Behaviour:

- On wizard step mount, call `apiClient<{data: {household_number: string}}>('/api/v1/households/next-number')` and store the result in local state. Clear any error toast on success.
- "Refresh" button re-calls the endpoint and replaces the state value. (Don't cache — the user wants a fresh candidate every time.)
- The displayed value is NOT persisted until wizard submission. When the wizard commits, the server-side household creation path (impl 02) calls `generateUniqueForTenant` and may actually insert a DIFFERENT value if there's been a concurrent collision. Accept this — the preview is informational, not a reservation. The helper text should say this: **"This is a suggested number. The final number is assigned when you save the household."**

Don't show the preview on UPDATE flows (the wizard's edit-existing path, if any). Only on CREATE.

### Sub-step 3: Household detail page

Edit `apps/web/src/app/[locale]/(school)/households/[id]/page.tsx`.

Find the header area where the household name is rendered. Add a monospaced household-number display immediately next to it:

```tsx
<div className="flex items-center gap-3">
  <h1 className="text-2xl font-semibold text-text-primary">{household.name}</h1>
  {household.household_number ? (
    <span
      className="rounded-full bg-surface-secondary px-3 py-1 font-mono text-sm text-text-secondary"
      dir="ltr"
    >
      {household.household_number}
    </span>
  ) : null}
</div>
```

For legacy households without a household number, just render the name. Do not show a placeholder.

Also surface the number in any list / table view of households (the households index page). Same conditional — only show for households that have one.

### Sub-step 4: Sibling badge on admissions queues

Edit `apps/web/src/app/[locale]/(school)/admissions/_components/application-row.tsx` (or wherever the queue row component lives — may be inline in `ready-to-admit/page.tsx` if it wasn't extracted).

Extend the row type to carry `is_sibling_application: boolean`. The API already returns this field (impl 01 added the column; impl 03 includes it in the queue read paths — if it doesn't, that's a follow-up to impl 03).

Render a small badge next to the applicant name:

```tsx
<span className="font-medium text-text-primary">{row.student_name}</span>;
{
  row.is_sibling_application && (
    <span className="ms-2 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
      {t('siblingBadge')}
    </span>
  );
}
```

The badge appears on ready-to-admit, waiting-list, conditional-approval, and rejected rows. The detail page can also show it in the header — nice-to-have, fold into this impl if it's trivial.

### Sub-step 5: Tests

- Unit test for the preview fetch in `step-household.tsx`: mounts, calls apiClient, shows the returned number.
- Unit test for the refresh button: click, second call happens, new value shown.
- Unit test for household detail page: renders the number when present, hides the pill when absent.
- Unit test for the application-row sibling badge: renders when flag is true, hidden when false.

## Watch out for

- **en.json / ar.json conflict with impl 04.** Both impls add top-level keys to these files. Apply Rule H5/H8/H9 — buffer your keys in a scratch memo while coding, then in the final commit window re-read the file (impl 04 may have already written keys), deep-merge your additions, write. Do NOT diff the file content from 30 minutes ago against fresh edits.
- The preview endpoint uses the same `generateUniqueForTenant` method that the actual household create path uses. The preview and the commit CAN return different values under concurrency — that's expected. Document it in the helper text.
- `apps/web/src/app/[locale]/(school)/households/` may have two versions of the "household detail" page if it was rewritten recently. Check that you're editing the current one — grep for the import path in the households list page's row click handler.
- The sibling badge color (`bg-sky-100 text-sky-800`) conflicts with the amber near-expiry badge on conditional-approval rows. Use a DIFFERENT color — sky for sibling, amber for near-expiry — so they can render side-by-side on the same row.
- If impl 03 did not include `is_sibling_application` in the queue response shape, file a follow-up and ask the user — either extend impl 03 retroactively or include the field in a fast-follow PR. Don't silently assume it's there.
- The walk-in wizard uses `react-hook-form`. The household number preview is NOT a form field — it's display-only state that lives alongside the form state. Don't register it with RHF or the useless field will appear in the form values on submit.

## Deployment notes

1. Commit by sub-step.
2. Final commit is the translations merge. Re-read `en.json` / `ar.json` immediately before writing. Impl 04 may have landed new keys in the meantime — merge, don't replace.
3. Pre-deploy serialisation per Rule 6b: if impl 04 is `deploying` (also web target), wait.
4. Clear `.next`, rebuild with `--force`, restart web. (And API build + restart if you added the `next-number` endpoint — backend changes require API rebuild too.)
5. Smoke tests (Playwright):
   - `/en/households/new` → wizard household step shows the preview + refresh button
   - Refresh button changes the number
   - Complete wizard → new household saved with a household number
   - `/en/households/<id>` → shows the number pill
   - `/en/admissions/waiting-list` → sibling rows show the badge
6. Flip log to `completed` in a separate commit.
