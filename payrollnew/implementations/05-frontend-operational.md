# Implementation 05 — Frontend Operational Pages

> **Wave:** 4 (parallel-risky with impl 06 — they share `messages/en.json` and `ar.json`)
> **Classification:** frontend
> **Depends on:** 01, 02, 03
> **Deploys:** web only

---

## Goal

Rebuild the operational frontend pages so every fetch call resolves against the now-correct backend contract, every form uses `react-hook-form` + `zodResolver` with a Zod schema from `@school/shared`, every `catch` surfaces a toast, every hardcoded English string flows through `useTranslations`, and every page works on mobile.

Pages owned by this impl:

1. `payroll/runs/page.tsx` — runs list (status filter i18n key fix, error toasts).
2. `payroll/runs/[id]/page.tsx` + components — run detail (the worst offender; 5 of 11 fetches were 404).
3. `payroll/runs/_components/create-run-dialog.tsx` — RHF + zod, drop hardcoded `total_working_days: 22`, localized month names.
4. `payroll/compensation/page.tsx` + components — paths fixed, RHF forms, staff dropdown reads `user.first_name + last_name`.
5. `payroll/staff-attendance/page.tsx` — completely rebuilt against the `/attendance/...` paths.
6. `payroll/class-delivery/page.tsx` — paths fixed, status-change uses the new alias, summary chart hits the new endpoint.

Impl 06 (parallel) owns analytical and self-service pages: hub, reports, exports, staff history, my-payslips, absences. The two impls share zero page files but BOTH write to `apps/web/messages/en.json` and `apps/web/messages/ar.json`. The hardened parallel-coding rules (H1–H10 in IMPLEMENTATION_LOG.md) apply.

---

## Shared files this impl touches

- `apps/web/messages/en.json` — adds `payroll.runs.*`, `payroll.runDetail.*`, `payroll.compensation.*`, `payroll.staffAttendance.*`, `payroll.classDelivery.*` keys. **Edit in the final commit window.** Re-read the file immediately before writing — sibling impl 06 may have already added their keys.
- `apps/web/messages/ar.json` — same keys, Arabic. **Edit in the final commit window.** Same re-read rule.
- `apps/web/src/lib/api-client.ts` — verify it already exists and has `apiClient<T>(path, options?)` plus `downloadAuthenticatedPdf(path)`. If `downloadAuthenticatedPdf` does not exist, ADD it (one new function). Owned addition.
- `apps/web/src/lib/use-payroll-permissions.ts` (NEW, optional) — a small helper hook that reads `useAuth()` and exposes typed flags (`canManageRuns`, `canFinaliseRuns`, etc.). Optional — only add if it materially simplifies the page code.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit.

All page and component files under `apps/web/src/app/[locale]/(school)/payroll/` listed above are owned by this impl. Impl 06 never edits them.

---

## What to build

### 1. Build the Zod schemas in `@school/shared` first (sub-step 1, isolated, commit early)

For every form this impl rebuilds, define a Zod schema in `@school/shared/payroll/schemas/`:

- `createPayrollRunSchema` — `period_year`, `period_month`, `total_working_days`, optional `notes`.
- `updatePayrollEntrySchema` — `actual_days_worked: number().nullable()`, `actual_classes_taught: number().nullable()`, `override_total_pay: number().nullable()`, `override_note: string().nullable()`, etc.
- `createCompensationSchema` — `staff_profile_id`, `compensation_type`, `base_salary`, `per_class_rate`, `bonus_class_multiplier`, `effective_from`, `effective_to`.
- `createAllowanceSchema` — `staff_profile_id`, `allowance_type_id`, `amount`, `effective_from`, `effective_to`.
- `createDeductionSchema` — staff/profile, monthly amount, total amount, start date.
- `markStaffAttendanceSchema` — `staff_profile_id`, `date`, `status`.
- `bulkMarkStaffAttendanceSchema` — `entries: array(markStaffAttendanceSchema)`.
- `confirmDeliverySchema` — `status`, `delivered_count`, `notes`.

Each schema gets a `.refine()` for cross-field validation where needed (e.g. `effective_to >= effective_from`).

Export from `@school/shared/payroll/schemas/index.ts` and re-export from `@school/shared/index.ts`. Wave 4 frontend imports them directly.

This sub-step is isolated to `packages/shared/` files. Commit it as the first commit of the impl, before any frontend changes. This way the next sub-step can `import { createPayrollRunSchema } from '@school/shared'`.

### 2. `runs/_components/create-run-dialog.tsx` — RHF + zod (sub-step 2)

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { createPayrollRunSchema, type CreatePayrollRunDto } from '@school/shared';

export function CreateRunDialog({ onCreated }: Props) {
  const t = useTranslations('payroll.runs');
  const locale = useLocale();
  const form = useForm<CreatePayrollRunDto>({
    resolver: zodResolver(createPayrollRunSchema),
    defaultValues: {
      period_year: new Date().getFullYear(),
      period_month: new Date().getMonth() + 1,
      total_working_days: 22,
    },
  });

  const months = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: fmt.format(new Date(2000, i, 1)),
    }));
  }, [locale]);

  const onSubmit = async (data: CreatePayrollRunDto) => {
    try {
      const run = await apiClient<{ data: PayrollRun }>('/api/v1/payroll/runs', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      toast.success(t('runCreated'));
      onCreated(run.data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('runCreateFailed'));
    }
  };

  return <form onSubmit={form.handleSubmit(onSubmit)}>...</form>;
}
```

Drop the hardcoded `total_working_days: 22`. Add a numeric input — default 22 is fine, but the user can override.

Localize month names via `Intl.DateTimeFormat(locale, { month: 'long' })`. No hardcoded English month array.

### 3. `runs/page.tsx` — runs list (sub-step 3)

Two small changes:

- Status filter dropdown: `<SelectItem value="all">{t('allStatuses')}</SelectItem>` — fix the `allStaff` i18n key bug.
- The catch block currently swallows errors with `console.error('[setTotal]', err)`. Replace with `toast.error(...)`.

### 4. `runs/[id]/page.tsx` — run detail (sub-step 4 — the big one)

Rewrite this page top-to-bottom. The audit found 5 of 11 fetches were 404; Wave 3 added the missing endpoints; this impl aligns the frontend.

Endpoint changes:

- `/runs/:id/allowances` — now exists (Wave 3). Read `res.data` as the allowance list.
- `/runs/:id/adjustments` — now exists. Same pattern.
- `/runs/:id/anomalies` — now exists. Wire the anomalies tab to render this list.
- `/runs/:id/comparison` — now exists. Wire the comparison tab.
- `/runs/:id/auto-populate-classes` — Wave 3 added the alias, so the existing call works. Add a polling hook that reads `/runs/:id/session-generation-status` and shows a progress indicator until `completed`.
- `/runs/:id/send-to-accountant` and `/send-payslips` — Wave 3 added aliases. Existing calls work. Both should toast on success and on failure.
- `/runs/:id/anomalies/:anomalyId/acknowledge` — now exists (Wave 3). Wire the acknowledge button.
- The Cancel and Finalise buttons: replace `window.confirm(...)` with a `<Dialog>` confirm flow (RTL-safe, localized).
- All `// silent` catches: replace with `toast.error(t('action.failed') + ': ' + (e as Error).message)`.

The entries table:

- Reads top-level `staff_name` (Wave 3 flattened it). Drop any `entry.staff_profile?.user?.first_name + ...` fallback logic — assume the flattened field is present.
- Inline editing of `actual_days_worked`, `actual_classes_taught`, `override_total_pay`, `override_note` should use a small RHF form per row OR stay as inline `useState` (the audit accepted this is a cell-editor not a form, so RHF is optional). At minimum, validate via `updatePayrollEntrySchema.parse(...)` before sending.

Tabs (the page has 4: Entries, Allowances, Adjustments, Anomalies, Comparison — 5 actually):

- Each tab fetches lazy: only when the user clicks it.
- Each tab has a loading state and an empty state.
- Each tab catches errors and toasts.

Mobile:

- Tabs collapse to a horizontally scrollable strip on `< md`.
- The entries table wraps in `overflow-x-auto`.
- All actions move into a kebab menu on mobile.

### 5. `runs/[id]/_components/finalise-dialog.tsx` (sub-step 5)

Rebuild as a `<Dialog>` with two states: `idle` and `pending`. On submit, call `POST /v1/payroll/runs/:id/finalise`:

- If response is `{ pending: true, run }` (approval required): show a "Submitted for approval" success toast, close the dialog, refresh the page state.
- If response is `{ pending: false, run }` (school owner direct): show "Run finalised" toast, close, refresh.

Surface the approval-required state on the run-metadata card too. Wave 2's Wave-3 contract is the source of truth for response shape — read it.

### 6. `compensation/page.tsx` (sub-step 6)

URL changes:

- `GET /payroll/staff-allowances?include=all` (Wave 3 added this no-staff_profile_id list endpoint) — instead of the old call without the param.
- `GET /payroll/staff-deductions` — Wave 3 added this alias to the canonical `/deductions` endpoint.
- `POST /payroll/staff-deductions` and `PATCH /payroll/staff-deductions/:id` — Wave 3 added aliases. Existing call sites work as-is.
- `GET /payroll/staff?pageSize=200` — Wave 3 added this. Use it for the staff filter dropdown.

Forms (on this page or in dialogs spawned from it):

- Compensation create/edit → RHF + `createCompensationSchema`.
- Allowance create → RHF + `createAllowanceSchema`.
- Deduction create → RHF + `createDeductionSchema`.

Each `catch` toasts.

### 7. `compensation/_components/compensation-form.tsx` (sub-step 7)

Rewrite with RHF + zod. Critical fix: the staff dropdown.

Old:

```tsx
const res = await apiClient('/api/v1/staff-profiles?pageSize=100&fields=id,full_name');
// rendered res.data.map(s => s.full_name) — always blank
```

New:

```tsx
const res = await apiClient<{ data: { id: string; full_name: string }[] }>(
  '/api/v1/payroll/staff?pageSize=200', // The Wave 3 endpoint that flattens full_name
);
const options = res.data.map((s) => ({ value: s.id, label: s.full_name }));
```

The Wave 3 endpoint returns `full_name` as a top-level field. The form binds to it directly.

### 8. `compensation/_components/bulk-import-dialog.tsx` (sub-step 8)

URL fix: `POST /api/v1/payroll/compensation/bulk-import` (was `/import`). One-line change.

Add proper file-upload validation (CSV mime check, size limit) via Zod schema before submitting. Toast on success/failure.

### 9. `staff-attendance/page.tsx` (sub-step 9 — large rewrite)

Currently every API call returns 404. Rewrite end-to-end:

URL changes:

- Daily view: `GET /api/v1/payroll/attendance/daily?date=YYYY-MM-DD`.
- Monthly view: `GET /api/v1/payroll/attendance/monthly?year=&month=`.
- Bulk mark: `POST /api/v1/payroll/attendance/bulk` with body validated against `bulkMarkStaffAttendanceSchema`.

Form: the bulk-mark form is RHF + zod. Each row of the daily grid is a small inline editor that updates a controlled list and submits in batch.

Permission gate: this page requires `payroll.manage_attendance`. Use the optional `usePayrollPermissions()` hook (or whatever permission-checking primitive the codebase has) to render a "permission required" placeholder if the user lacks it.

Mobile: replace native `<input type="date">` with the `@school/ui` DatePicker if it exists; if not, leave the native input but ensure it works with `text-base` (16px) to avoid iOS auto-zoom.

### 10. `class-delivery/page.tsx` (sub-step 10)

URL fixes:

- `/class-delivery` list — exists, no change.
- `/class-delivery/summary` — Wave 3 added this if needed (verify; if it didn't, add it as a thin endpoint that aggregates by teacher and date range; but check first).
- `/class-delivery/comparison` — same.
- Inline status change: was `PATCH /class-delivery/:recordId`. Wave 3 added `PATCH` as an alias. The existing call works as-is — verify.
- Auto-populate: was `POST /class-delivery/auto-populate` — exists, no change.

The page currently renders a teacher summary card grid that depends on `/summary` and a comparison bar chart that depends on `/comparison`. If Wave 3 didn't build these, this impl flags it as a `🛑 blocked` and asks the user to extend Wave 3 or descope the cards.

Forms: the inline status change uses `confirmDeliverySchema` for client-side validation; toast on success/failure.

### 11. Translation keys

Each page introduces new translation keys under `payroll.runs.*`, `payroll.runDetail.*`, `payroll.compensation.*`, `payroll.staffAttendance.*`, `payroll.classDelivery.*`. Buffer them in a scratch comment at the top of each page during sub-steps 2-10. Write them into `messages/en.json` and `messages/ar.json` ONLY in the final commit (sub-step 11).

When you write the translations: open the messages files immediately before writing, deep-merge your additions into the existing structure, save. If sibling impl 06 has already added their keys (which they should have done minutes earlier), don't overwrite their keys — merge.

Recommended Arabic baseline: literal translations of the English strings. Wave 5 (polish) does a proper Arabic copy-edit pass.

---

## Tests

Frontend tests are the project's weakest area, so the bar is moderate but enforced:

- For each new RHF form: a unit test asserting the zod resolver rejects an invalid payload (e.g. `effective_to < effective_from`) and accepts a valid one.
- For each rebuilt page: a smoke test using `@testing-library/react` that mounts the page with mocked `apiClient` returning fixture data, asserts the loading skeleton appears, asserts the data renders, asserts an action click triggers the right `apiClient` call.
- For the staff dropdown fix in `compensation-form.tsx`: a test that mounts the form with `apiClient` returning `{ data: [{ id: 'a', full_name: 'Aisha Ali' }, ...] }` and asserts the `<Select>` renders "Aisha Ali" as an option label.
- For `staff-attendance/page.tsx`: a test that asserts the page calls `/api/v1/payroll/attendance/daily` (not `/staff-attendance`).

E2E (Playwright) — defer to Wave 5 polish. This impl ships unit + component tests only.

---

## Watch out for

- **The morph-shell layout.** The pages already use the morph-shell pattern. DO NOT add a sub-strip or re-introduce a sidebar. The hub-tile pattern is correct (per CLAUDE.md frontend rules). If a page needs sub-navigation, use `PageHeader` with `back` like the existing pages.
- **`apiClient` response unwrapping.** The `apiClient` helper auto-unwraps single-key `{ data }` responses but passes through multi-key responses. For variance and forecast, the response is `{ data, summary }` — verify the helper passes both keys through.
- **`downloadAuthenticatedPdf` helper.** If it doesn't exist, ADD it. Pattern (from project memory): use `getAccessToken()` to add an Authorization header, plus `credentials: 'include'`, then `Blob` → `URL.createObjectURL` → `<a download>`. Don't use `window.open` — it strips auth.
- **RHF + zod imports.** Use the canonical pattern: `import { zodResolver } from '@hookform/resolvers/zod'`. `react-hook-form` is already a dep. Verify on `apps/web/package.json`.
- **`usePayrollPermissions` hook.** Optional — if you build it, give it a clear API: `const { canManageAttendance } = usePayrollPermissions()`. If the codebase already has a generic `useHasPermission(code)` hook, prefer that.
- **Translation file shape.** The existing `en.json` is a deeply nested object. Don't replace it. Read, deep-merge, write. Use a small JS helper if needed, or do it manually with care.
- **Hardened-coding rule reminder**: re-read `messages/en.json` and `ar.json` IMMEDIATELY before your final commit. Sibling impl 06 may have updated them in the past 30 minutes. Deep-merge your keys, do not overwrite.
- **The audit found `window.confirm()`** in `runs/[id]/page.tsx` for cancel. Replace with a proper `<AlertDialog>` from `@school/ui`. RTL-safe and localized.
- **`payroll.self_service` permission**: this impl's pages do NOT require it (they require admin permissions). The self-service page (`my-payslips`) is impl 06's territory.

---

## Deployment notes

This impl restarts web only.

Sequence:

1. Apply patch.
2. Clear `.next`: `ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app/apps/web && rm -rf .next"'`.
3. Build: `pnpm turbo run build --filter=@school/web`.
4. Restart: `pm2 restart web --update-env`.
5. Smoke tests:
   - `/en/payroll/runs` — list loads, status filter has "All", filter changes propagate.
   - `/en/payroll/runs/<draftRunId>` — every tab clicks through and renders without 404 in the network panel. Cancel and Finalise both succeed (or surface a clear error toast).
   - `/en/payroll/compensation` — staff dropdown shows real names. Allowance/deduction creation succeeds.
   - `/en/payroll/staff-attendance` — daily view loads (might be empty if no records exist, but no 404). Bulk-mark works.
   - `/en/payroll/class-delivery` — summary cards render with real teacher names and counts.
   - `/ar/payroll/runs` — RTL layout intact, Arabic strings present (even if literal translations).
6. Lighthouse / responsive check on mobile width 375px:
   - All pages scroll without horizontal overflow.
   - Tables scroll within their container, not the page.
   - No 16px-cap touch targets — all buttons ≥ 44px.

If the smoke test surfaces a 404 on any endpoint that Wave 3 was supposed to add, file a `🛑 blocked` and re-engage Wave 3 to extend.
