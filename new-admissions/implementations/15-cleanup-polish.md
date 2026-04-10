# Implementation 15 — Cleanup, Translations, and Operations Hub Live Counts

> **Wave:** 5 (serial — depends on 10, 11, 12, 13, 14 all complete)
> **Depends on:** 10, 11, 12, 13, 14
> **Deploys:** Web restart only

---

## Goal

Final cleanup pass. Delete the old forms area entirely, fold the Admissions card on the Operations hub into live-count mode, tidy translations, add end-to-end Playwright tests for the main flow, and close out anything loose. After this impl, there are no dead routes, no unused components, and every piece of the new flow is exercised by at least one integration test.

## What to do

### 1. Delete the old forms area

```
apps/web/src/app/[locale]/(school)/admissions/forms/
apps/web/src/app/[locale]/(school)/admissions/forms/new/
apps/web/src/app/[locale]/(school)/admissions/forms/[id]/
apps/web/src/app/[locale]/(school)/admissions/[id]/convert/
```

All of the above — delete the directories and every file inside. These are fully replaced by impls 13 and 05. Verify by grepping for any import of a deleted file and fixing the strays.

Also delete any frontend components that were only used by the deleted pages — check `apps/web/src/components/admissions/` for anything that's no longer imported. Remove unused files.

### 2. Update the Operations hub card

The Operations hub at `apps/web/src/app/[locale]/(school)/operations/page.tsx` has a placeholder Admissions card. Make it live:

```tsx
// Fetch the dashboard summary on mount
const [admissionsCount, setAdmissionsCount] = useState<number | null>(null);
useEffect(() => {
  apiClient<{ data: { counts: { ready_to_admit: number } } }>(
    '/api/v1/admissions/dashboard-summary',
    { silent: true },
  )
    .then((res) => setAdmissionsCount(res.data.counts.ready_to_admit))
    .catch(() => setAdmissionsCount(null));
}, []);
```

Then the Admissions card description becomes:

- `null` → "Manage enquiries, applications, and enrolment."
- `0` → "No applications waiting for review"
- `> 0` → "{count} application(s) waiting for your decision"

Add an amber badge to the card when count > 0, same pattern as the Conditional Approval card on the Admissions dashboard.

### 3. Remove the old legacy status-tabs table

If impl 10 parked any of the old list-view code in an `_legacy` folder, delete it now. The dashboard hub is the entire `page.tsx` content.

### 4. Clean up translations

- Remove unused keys from `en.json` and `ar.json` related to the old form builder (`admissions.createForm`, `admissions.generateSystemForm`, `admissions.systemFormCreated`, `admissions.formName`, etc.).
- Run `pnpm i18n:check` to find any missing translations — add them.
- Verify the Arabic forms of the new `admissionsHub`, `admissionsQueues`, and `publicApplyForm` namespaces are complete. If machine-translated placeholders were used during earlier waves, replace them with reviewed translations now.

### 5. RBAC seed

If new permissions were added (`admissions.view`, `admissions.manage`), verify they're in the RBAC seed and that the default roles have the right assignments:

- `school_owner` / `school_principal` / `admin` / `school_vice_principal`: both.
- `front_office`: view + limited manage (can approve, record cash, but not override).
- `teacher`: none.
- `parent`: none.

Update the seed file if needed.

### 6. Analytics page enum update

The existing `/admissions/analytics/page.tsx` was left largely alone during the rebuild but still references old enum values (`under_review`, `accepted`, `pending_acceptance_approval`). Update the funnel chart to the new state set:

- New funnel steps: submitted → ready_to_admit → conditional_approval → approved.
- Drop the old steps.
- Update any label translations.

Do NOT redesign the analytics page in this impl — just fix the enum references so it compiles and renders.

### 7. E2E tests (Playwright)

Add a new test file: `apps/web/e2e/admissions-flow.spec.ts`.

Test scenarios (high-level, these are integration-level happy paths):

1. **Public submission → Ready to Admit**
   - Visit `/en/apply/<test-tenant-slug>`.
   - Fill in the form.
   - Submit.
   - See thank-you page with reference.
   - Log in as an admin, go to `/en/admissions/ready-to-admit`, verify the application appears.

2. **Ready to Admit → Conditional Approval**
   - Click Approve on the row.
   - Confirm the dialog.
   - Verify the row disappears.
   - Go to `/en/admissions/conditional-approval`, verify the application appears with the payment amount and deadline.

3. **Record cash payment → Approved → Student created**
   - Click Record Payment → Cash tab.
   - Enter exact amount.
   - Submit.
   - Verify success toast.
   - Go to `/en/students`, verify the new student appears.

4. **Waiting list auto-promotion**
   - Seed a test year group at full capacity.
   - Submit a new application → verify it lands in Waiting List.
   - Open the Classes page, add a new class with capacity 5.
   - Go back to Admissions → Ready to Admit, verify the application auto-promoted.

5. **Force Approve with Override**
   - With a principal user, open an application in Conditional Approval.
   - Click Force Approve.
   - Enter justification and override type.
   - Submit.
   - Verify the student was created and an override audit row exists.

Use the existing Playwright test infrastructure and fixtures. If the tenant provisioning in E2E tests needs new data (year groups, classes with capacity), extend the fixture helpers.

### 8. Documentation updates

- Update `docs/architecture/module-blast-radius.md` with the new cross-module dependencies:
  - `classes` → `admissions` (auto-promotion hook)
  - `finance` → `admissions` (webhook branch)
  - `admissions` → `finance` (fee resolution facade, tenant Stripe config)
- Update `docs/architecture/state-machines.md` with the new `ApplicationStatus` graph.
- Update `docs/architecture/event-job-catalog.md` with the new jobs:
  - `admissions:payment-link` (on-demand, fires when entering conditional approval)
  - `admissions:payment-expiry` (cron every 15 min)
  - `admissions:auto-promoted` (notification fires when FIFO promotes)
- Add a short entry to `docs/features/admissions.md` (create if missing) with links to `new-admissions/PLAN.md` so the rebuild is discoverable from the docs tree.

### 9. Overrides log page (optional, time-permitting)

If impl 15 has time left over:

- Build `/admissions/overrides/page.tsx` — a read-only listing of `AdmissionOverride` rows, paginated, filterable by date range + role. Targets the endpoint from impl 07.
- Link from the Overrides card on the Admissions dashboard.

If time is tight, skip this and leave the card linking to a placeholder 404. Mark as a follow-up.

## Deployment

1. Commit locally.
2. Patch → production.
3. Run `pnpm i18n:check` locally before deploying.
4. Build `@school/web`, restart web.
5. Run E2E tests against the production URL (or staging).
6. Smoke test: walk the entire flow manually one more time.
7. Update `IMPLEMENTATION_LOG.md` with the final completion record.

## Definition of done

- Old forms area deleted, no dead imports.
- Operations hub Admissions card shows live count.
- Legacy code removed.
- Translations cleaned, no missing keys.
- RBAC seed verified.
- Analytics page compiles with new enum.
- E2E tests added for the happy path (at least scenarios 1-3; 4-5 if time permits).
- Architecture docs updated.
- Final completion record added to the log.

## After this impl

The rebuild is done. The user will manually push the accumulated commits to GitHub, triggering the full CI gate. If the CI fails, fix-forward with targeted commits. Do not re-run the full rebuild.

The Admissions module is now financially gated, FIFO-safe, capacity-aware, and has a single source of truth for both walk-in and online paths. The school can finally stop being the bad guy at fee-collection time.
