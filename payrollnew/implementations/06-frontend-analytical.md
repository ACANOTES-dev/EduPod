# Implementation 06 — Frontend Analytical + Self-Service Pages

> **Wave:** 4 (parallel-risky with impl 05 — they share `messages/en.json` and `ar.json`)
> **Classification:** frontend
> **Depends on:** 01, 02, 03
> **Deploys:** web only

---

## Goal

Rebuild the analytical and self-service frontend pages so every fetch resolves, every form is RHF + zod, every error toasts, and the staff self-service surface (`/my-payslips`) actually works for the first time.

Pages owned by this impl:

1. `payroll/page.tsx` — payroll hub dashboard (anomalies + pay-day ribbon now render because Wave 3 returns them).
2. `payroll/reports/page.tsx` + `_components/` — variance and forecast tabs hit the new endpoints.
3. `payroll/exports/page.tsx` — PUT-not-PATCH on edit, export-logs from the new tenant-wide endpoint, log re-send button.
4. `payroll/staff/[staffProfileId]/page.tsx` — path = `/payroll/reports/staff/:id/history` (or the alias added in Wave 3), PDF download via `downloadAuthenticatedPdf`.
5. `payroll/my-payslips/page.tsx` — completely new functional page on top of Wave 3's `GET /v1/payroll/my-payslips` and `/ytd` endpoints.
6. `payroll/absences/page.tsx` — minor: native `<select>` → `@school/ui` Select, ensure permission gate is respected.

Impl 05 (parallel) owns operational pages: runs, compensation, staff-attendance, class-delivery. The two impls share zero page files but BOTH write to `apps/web/messages/en.json` and `apps/web/messages/ar.json`. Hardened parallel-coding rules apply.

---

## Shared files this impl touches

- `apps/web/messages/en.json` — adds `payroll.hub.*`, `payroll.reports.*`, `payroll.exports.*`, `payroll.staffHistory.*`, `payroll.myPayslips.*`, `payroll.absences.*` keys. **Edit in the final commit window.** Re-read immediately before write.
- `apps/web/messages/ar.json` — same keys, Arabic. Same rule.
- `apps/web/src/lib/api-client.ts` — verify `downloadAuthenticatedPdf` exists (impl 05 may have added it; if it did not, ADD it here). One-time addition.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit.

All page and component files under `apps/web/src/app/[locale]/(school)/payroll/` listed above are owned by this impl. Impl 05 never edits them.

---

## What to build

### 1. Build the Zod schemas in `@school/shared` first (sub-step 1, isolated, commit early)

For the forms in this impl, define new Zod schemas in `@school/shared/payroll/schemas/`:

- `createExportTemplateSchema` — name, columns selection, filter options.
- `updateExportTemplateSchema` — same as create with all fields optional.
- `sendExportLogSchema` — log id, optional `to: string[]` for accountant overrides.

If impl 05 owns some of these schemas (overlap is unlikely but possible), coordinate via the IMPLEMENTATION_LOG: which impl owns the schema file. By default, each schema belongs to whichever impl's form first uses it. Conflicts in `packages/shared/src/payroll/schemas/index.ts` are handled by deep-merging the barrel export — ALL exported schemas, regardless of which impl added them.

Commit the schema additions as the first commit of this impl, before any frontend changes.

### 2. `payroll/page.tsx` — Hub Dashboard (sub-step 2)

The audit found two broken sections:

- `data.anomalies` — Wave 3 added it. The attention-surfaces section now renders if the array is non-empty.
- `data.payroll_calendar` — Wave 3 added it. The pay-day ribbon now renders.

The `cost_trend` chart's `total_allowances` series is now populated (Wave 3 includes it in the trend points). The chart renders with three series: gross, net, allowances.

Other changes:

- Replace silent `console.error` in the catch block with `toast.error(t('hubLoadFailed'))`.
- Add a permission gate: if the user lacks `payroll.view`, show a friendly "no access" placeholder instead of a 403-rejected dashboard fetch.
- Mobile: ensure the hub-tile grid uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

### 3. `reports/page.tsx` (sub-step 3)

URL changes:

- Variance: `GET /payroll/reports/variance?runId={optional}` (Wave 3 added this; runId optional, defaults to latest finalised).
- Forecast: `GET /payroll/reports/forecast` (Wave 3 added the `/reports/` alias).

The response shape for variance is `{ data: VarianceRow[], summary: VarianceSummary }`. The frontend reads both keys; verify the `apiClient` doesn't unwrap a multi-key response.

Each tab (variance, forecast, cost-trend, ytd, bonus) has a loading state, empty state, and error state. Errors toast.

`_components/variance-table.tsx` and `_components/cost-trend-chart.tsx` etc. — these probably already exist. Update them only if the data shape changes (it might, since Wave 3 includes new fields).

The variance tab needs an optional run picker — let the user pick which run they want to compare against the prior. Default is "latest finalised". A `<Select>` with run options.

### 4. `exports/page.tsx` (sub-step 4)

URL fixes:

- `GET /export-logs` — Wave 3 added this tenant-wide list endpoint (returning logs across all runs, paginated, with run + user metadata flattened).
- `PATCH /export-templates/:id` — Wave 3 added the `@Patch` alias on top of `@Put`. The existing call works.
- `POST /export-logs/:logId/send` — Wave 3 added this. Wire the "Re-send" button on each log row.

Forms:

- Template create/edit dialog: RHF + `createExportTemplateSchema` / `updateExportTemplateSchema`.
- Send-to-accountant dialog (if exists on this page): RHF + `sendExportLogSchema`.

Each `catch` toasts.

History tab now renders real data (Wave 3 made the endpoint).

### 5. `staff/[staffProfileId]/page.tsx` (sub-step 5)

URL fix: `GET /api/v1/payroll/staff/:id/history` — Wave 3 added the alias on top of `/payroll/reports/staff/:id/history`. Existing call site works.

Title: read `res.meta.staff_name` from the response. Wave 3 should expose `staff_name` in the meta object — verify, and if not, fetch the staff profile separately via `apiClient<{ data: StaffProfile }>('/v1/staff-profiles/:id')` and use `data.user.first_name + last_name` for the title. Either approach works.

PDF download: replace `window.open(...)` with `downloadAuthenticatedPdf('/api/v1/payroll/payslips/:id/pdf')`. The endpoint is `payslips/:id/pdf` (not run-scoped) — Wave 3's spec.

Add error toasts for fetch failures.

### 6. `my-payslips/page.tsx` (sub-step 6 — NEW functional page)

This page was completely dead. Wave 3 added the endpoints (`GET /v1/payroll/my-payslips` and `/my-payslips/ytd`). This impl builds the actual page.

Layout:

- A YTD summary card at the top: "Year to date earnings: <gross>, deductions: <total_deductions>, net: <net>".
- A by-month bar chart: gross + net per month.
- A list of payslips below: most recent first, each with a "Download" button.

Permission gate: requires `payroll.self_service`. Use the permission helper.

Critical privacy note: the page never accepts a `staff_profile_id` query param — the API enforces "scope to calling user's own staff_profile". The frontend just calls `apiClient` with no scope arg.

Empty state: "You have no payslips yet. They appear here once your first payroll run is finalised."

PDF download: `downloadAuthenticatedPdf('/api/v1/payroll/payslips/:id/pdf')` — same pattern as the staff history page.

### 7. `absences/page.tsx` (sub-step 7 — minor polish)

The audit identified this as the only page that actually works. Polish only:

- Replace native `<select>` with `<Select>` from `@school/ui` for consistency.
- Verify the permission gate (`payroll.manage_attendance`) is respected. If the user lacks it but should be able to see the page (e.g. read-only), surface a friendly read-only mode rather than 403'ing the user out.
- Tighten error toasts.

### 8. `apiClient` extension — `downloadAuthenticatedPdf` (sub-step 8)

If impl 05 didn't add this helper, add it here. Pattern:

```typescript
import { getAccessToken } from './auth-token';

export async function downloadAuthenticatedPdf(path: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`/api${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').pop() ?? 'document.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

The auth-token helper exists in the codebase (it powers `apiClient`'s `Authorization` header).

### 9. Translation keys

Each page introduces new translation keys under `payroll.hub.*`, `payroll.reports.*`, `payroll.exports.*`, `payroll.staffHistory.*`, `payroll.myPayslips.*`, `payroll.absences.*`. Buffer them in scratch comments during sub-steps 2-7. Write into `messages/en.json` and `messages/ar.json` ONLY in the final commit (sub-step 9).

Same hardened rules as impl 05: re-read the messages file immediately before writing, deep-merge into the current content, write. Sibling impl 05 may have already added their keys.

If both impls land translation commits within a few minutes of each other, the second one wins on conflicts within their own keyspace, but the deep-merge ensures the other impl's keys are preserved. Verify before commit by `cat apps/web/messages/en.json | jq '.payroll'` and confirming both impl-05 and impl-06 keyspaces are present.

---

## Tests

- For each new RHF form: zodResolver test (rejects invalid, accepts valid).
- For `my-payslips/page.tsx`: a smoke test that mounts with mocked `apiClient` returning fixture payslips, asserts the YTD summary renders, asserts the list renders, asserts the download button calls `downloadAuthenticatedPdf` with the right path.
- For the hub dashboard: assert the anomalies section renders when `data.anomalies.length > 0` and is hidden otherwise. Same for the pay-day ribbon.
- For the variance tab: assert the run picker defaults to "latest finalised" and updates the URL query string when a different run is selected.
- For the staff-history page: assert the page does NOT call `window.open` (it should call `downloadAuthenticatedPdf`).

E2E (Playwright) — defer to Wave 5.

---

## Watch out for

- **`apiClient` multi-key passthrough.** If `apiClient` is auto-unwrapping `{ data }` and the variance endpoint returns `{ data, summary }`, the helper must NOT unwrap. Verify by inspecting `apiClient.ts` — there should be a heuristic like "wrap only if the response is a single-key `{ data: ... }` object". If not, the variance call needs a different shape (e.g. `{ rows, summary }`) or the helper needs an `autoUnwrap: false` opt-out.
- **YTD summary aggregation.** The `/my-payslips/ytd` endpoint returns `{ year, gross_total, net_total, total_deductions, by_month: [...] }`. The page just renders these — no client-side aggregation. If the client tries to sum across the list of payslips itself, it'll be wrong (different runs, different states, etc.).
- **`@school/ui Select` import.** The component library is in `packages/ui/`. Verify the Select component exposes RTL-safe rendering. If it has known issues with RTL, use the underlying Radix primitive directly.
- **Permission rendering for `/my-payslips`.** Granted to all users. But a user without a linked `staff_profile` (e.g. a parent who is also a user) would see an empty page. Render a friendly "You don't have a staff payroll record" message in that case (the API returns empty data; the UI can ask the API to confirm the user has a staff_profile separately).
- **PDF download UX.** `downloadAuthenticatedPdf` triggers a download. Some browsers block this if it's not in response to a user click — make sure the function is called inside an `onClick` handler, not in a `useEffect`.
- **Hub dashboard `cost_trend` chart**. Recharts is the codebase's chart library. The chart already exists; only the data shape changes (allowances series is no longer flat-zero). Verify the chart's series mapping reads the new `total_allowances` field correctly.
- **Final commit window for translations**. Write `messages/en.json` and `messages/ar.json` ONLY at the very end. Re-read both files immediately before write. Deep-merge.

---

## Deployment notes

This impl restarts web only. Same flow as impl 05.

Sequence:

1. Apply patch.
2. Clear `.next` on the server.
3. Build: `pnpm turbo run build --filter=@school/web`.
4. Restart: `pm2 restart web --update-env`.
5. Smoke tests:
   - `/en/payroll` — hub dashboard renders. Anomalies section appears if there are anomalies. Pay-day ribbon shows next pay date.
   - `/en/payroll/reports` — every tab loads. Variance tab shows comparison data with optional run picker.
   - `/en/payroll/exports` — template list, edit succeeds (PATCH). Logs tab renders. Re-send button on a log triggers the call and toasts.
   - `/en/payroll/staff/<staffId>` — page loads with correct staff name. PDF download succeeds (auth header present in the network panel).
   - `/en/payroll/my-payslips` — for a user with `payroll.self_service` and a linked staff_profile, shows YTD summary, by-month chart, and payslip list. Verify a different user sees only their own payslips.
   - `/en/payroll/absences` — works as before; native select replaced with `@school/ui`.
   - `/ar/payroll` — RTL layout intact, Arabic strings present.
6. Mobile responsive check on 375px width: every page scrolls cleanly.
7. **Sibling check**: `cat apps/web/messages/en.json | jq '.payroll | keys'` shows both `hub`, `reports`, `exports`, `staffHistory`, `myPayslips`, `absences` (this impl) AND `runs`, `runDetail`, `compensation`, `staffAttendance`, `classDelivery` (impl 05). If any are missing, the deep-merge step had a conflict — investigate before deploying.
