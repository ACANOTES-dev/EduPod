# Implementation 07 — Polish: Tests, Translations, Mobile, Docs

> **Wave:** 5 (serial — single impl in this wave)
> **Classification:** polish
> **Depends on:** 01, 02, 03, 04, 05, 06
> **Deploys:** web + docs

---

## Goal

Close out the rebuild with the work that doesn't fit cleanly into a feature wave but is essential for the module to be considered "done":

1. **Comprehensive regression tests** — RLS leakage tests for the new tables, calculation correctness tests with realistic fixtures, finalisation idempotency tests, end-to-end smoke through the dual paths.
2. **Translation pass** — go through every new `payroll.*` key in `en.json` and produce a proper Arabic copy-edit (Waves 4–5 used literal translations as a baseline).
3. **Mobile responsive sweep** — every payroll page tested on 375px, fixes for any horizontal overflow, table-scroll containers, kebab menus on mobile.
4. **Dead-code removal** — drop the now-unused `autoApplyForRun` (Wave 2 replaced it), the legacy `'payroll:mass-export-payslips'` and `'payroll:generate-sessions'` strings (Wave 4 replaced them with shared constants), the `as unknown as Record<...>` cast in `payroll-calendar.service.ts` (Wave 3 replaced it). Drop the unused `StaffProfilesModule` import in `payroll.module.ts` if Wave 2 didn't.
5. **Architecture-docs update** — refresh `docs/architecture/feature-map.md`, `module-blast-radius.md`, `event-job-catalog.md`, `state-machines.md`, and `danger-zones.md` to reflect the new shape. Add a danger-zone entry about the historical payslip-number format inconsistency on already-finalised pre-rebuild runs.
6. **Pre-launch checklist update** — verify no payroll items are deferred. If any are, document them in `docs/operations/PRE-LAUNCH-CHECKLIST.md` Part 5.
7. **Production smoke** — a manual end-to-end walkthrough on one production tenant: create a run, edit entries, add an allowance + deduction + adjustment + one-off, finalise (via approval), download the mass export, view a staff history, view my-payslips. Document the run in the completion record.

---

## Shared files this impl touches

This is a single-impl wave, so no parallelisation conflicts. But it edits many shared files. Be deliberate.

- `apps/web/messages/en.json` — translation polish + any missed keys. Edit late.
- `apps/web/messages/ar.json` — comprehensive Arabic copy-edit pass. Edit late.
- `docs/architecture/feature-map.md` — update the Payroll section's endpoint count, page count, worker count.
- `docs/architecture/module-blast-radius.md` — refresh the PayrollModule entry (new providers exported, new consumers).
- `docs/architecture/event-job-catalog.md` — refresh the `payroll` queue entry with the new constants.
- `docs/architecture/state-machines.md` — update the PayrollRunStatus section: `pending_approval → cancelled` is now a valid transition.
- `docs/architecture/danger-zones.md` — append `DZ-Payroll-1` (historical payslip-number format inconsistency), `DZ-Payroll-2` (deduction two-phase application: schedule MUST precede commit), `DZ-Payroll-3` (compensation period-bracket assumes the most-recent overlapping row wins).
- `docs/operations/PRE-LAUNCH-CHECKLIST.md` — verify Part 5 has no payroll items left.
- `IMPLEMENTATION_LOG.md` — final completion record. Always in a separate commit.

The audit document itself (`/Users/ram/Desktop/SDB/payrollnew/PLAN.md`) is the user-facing source of truth and stays as-shipped — do not edit retroactively.

---

## What to build

### 1. Regression test suite

#### 1a. RLS leakage tests (`apps/api/test/payroll-rls.e2e-spec.ts`)

Build a comprehensive RLS leakage test that loops through every payroll table with `tenant_id`:

```typescript
const PAYROLL_TENANT_TABLES = [
  'payroll_runs',
  'payroll_entries',
  'payslips',
  'staff_compensation',
  'staff_attendance_records',
  'class_delivery_records',
  'payroll_adjustments',
  'payroll_export_templates',
  'payroll_export_logs',
  'payroll_approval_configs',
  'payroll_allowance_types',
  'staff_allowances',
  'payroll_one_off_items',
  'staff_recurring_deductions',
  'payroll_deduction_applications', // NEW from Wave 1
];

describe('payroll RLS leakage', () => {
  for (const table of PAYROLL_TENANT_TABLES) {
    it(`tenantA cannot read tenantB rows from ${table}`, async () => {
      // 1. Insert as tenantA
      // 2. Switch to tenantB context
      // 3. Query the table — assert empty result
    });
  }
});
```

Plus endpoint-level RLS tests for every new endpoint added in Wave 3:

- `GET /v1/payroll/my-payslips` — tenantA user can't see tenantB payslips even if they share an email or coincidence.
- `GET /v1/payroll/runs/:runId/allowances` — cross-tenant runId returns 404.
- `POST /v1/payroll/runs/:runId/anomalies/:anomalyId/acknowledge` — cross-tenant ids → 404.
- `GET /v1/payroll/staff` — only the calling tenant's staff are returned.
- `POST /v1/payroll/runs/:runId/mass-export` — cross-tenant runId → 404.
- `GET /v1/payroll/runs/:runId/mass-export-pdf` — Redis key is namespaced by tenantId, can't cross-poll.

#### 1b. Calculation correctness tests

Build a fixture for each compensation type with realistic numbers:

- **Salaried**: base 50,000, daysWorked 11/22, no allowances/deductions → net 25,000.
- **Salaried with allowance**: same + allowance 2,000 → net 27,000.
- **Salaried with deduction**: same + deduction 5,000/month → net 22,000.
- **Salaried with adjustment (negative)**: same + correction -500 → net 24,500.
- **Salaried with one-off bonus**: same + one-off 1,000 → net 26,000.
- **Per-class**: 20 delivered × 100 rate = 2,000.
- **Per-class with bonus classes**: 20 + 5 bonus × 1.5 multiplier = 2,000 + 750 = 2,750.
- **Mixed**: 50,000 base + 10 delivered × 100 = 50,000 + 1,000 = 51,000 (subject to days_worked proration).

All values exact to 2 decimal places. Assert `Decimal` equality, not `Number` equality.

#### 1c. Finalisation idempotency tests

`finalisation.service.idempotency.spec.ts`:

- Call `finaliseAtomic` twice on a draft run. Second call is a no-op (returns the already-finalised run).
- Call `finaliseAtomic`, then call `finaliseAtomic` again concurrently. Assert no duplicate payslips, no double-deducted balances. Use a database-level lock or a unique constraint check.
- Simulate a failure mid-transaction: mock `payslip.create` to throw on the third entry. Assert the entire transaction rolls back, no entries have new totals, no payslips created, deduction balances unchanged.

#### 1d. Cross-path equivalence test

`finalisation.cross-path-equivalence.spec.ts`:

- Build a fixture run.
- Clone the database state. On copy A, call `finaliseAtomic` directly (school-owner path). On copy B, call the API to enqueue, simulate the worker callback.
- Assert both paths produce: identical entry totals, identical payslip net_pay, identical snapshot_payload_json (modulo timestamps), payslip-number format `<PREFIX>-YYYYMM-NNNNNN` in both cases.

#### 1e. End-to-end Playwright spec

`apps/web/e2e/payroll-end-to-end.spec.ts`:

Walk through every payroll page on a single tenant:

```typescript
test('payroll end-to-end on a fresh tenant', async ({ page }) => {
  await login(page, 'owner@test-tenant.test', 'password');

  // Hub
  await page.goto('/en/payroll');
  await expect(page.getByText('Payroll')).toBeVisible();

  // Create run
  await page.click('text=Create run');
  await page.fill('[name="period_year"]', '2026');
  await page.fill('[name="period_month"]', '4');
  await page.click('text=Create');
  await expect(page.getByText('Run created')).toBeVisible();

  // Open run detail
  await page.click('text=April 2026');
  await expect(page.getByRole('tab', { name: 'Entries' })).toBeVisible();
  await page.click('text=Allowances');
  await page.click('text=Adjustments');
  await page.click('text=Anomalies');
  await page.click('text=Comparison');
  // None should 404 — assert no error toast appeared

  // Add an allowance
  await page.goto('/en/payroll/compensation');
  // … etc

  // Finalise
  await page.goto('/en/payroll/runs');
  await page.click('text=April 2026');
  await page.click('text=Finalise');
  await page.click('text=Confirm');
  // If approval required, simulate approval

  // My payslips
  await page.goto('/en/payroll/my-payslips');
  await expect(page.getByText('Year to date')).toBeVisible();
});
```

Run on CI as part of the Wave 5 gate. The full e2e takes ~3 minutes; acceptable.

### 2. Translation polish

Open `apps/web/messages/en.json` and `ar.json`. For every key under `payroll.*`:

- Verify the English copy is concise, professional, and uses the same terminology consistently (e.g. "payroll run" not "salary run", "payslip" not "pay slip").
- Verify the Arabic translation is grammatically correct, uses proper Arabic typography, and respects RTL. Get a native speaker review where possible.
- Empty states get explicit copy: "No payslips yet. They appear here once your first payroll run is finalised."
- Error toasts get explicit copy with the action that failed: not "Failed" but "Could not finalise run — please try again or contact support."

### 3. Mobile responsive sweep

Open Chrome DevTools at 375px width. Walk through every page:

- `payroll/page.tsx` — hub tiles stack to 1-column on mobile. Pay-day ribbon truncates gracefully.
- `payroll/runs/page.tsx` — table scrolls horizontally; status filter and create button stay visible.
- `payroll/runs/[id]/page.tsx` — tabs scroll horizontally with a fade hint. Entries table scrolls. Action buttons collapse to a kebab.
- `payroll/compensation/page.tsx` — staff dropdown is full-width. Forms stack 1-column.
- `payroll/staff-attendance/page.tsx` — daily grid wraps or scrolls. Bulk-mark uses card layout on mobile.
- `payroll/class-delivery/page.tsx` — summary cards stack 1-column. Comparison chart shrinks but remains readable.
- `payroll/reports/page.tsx` — variance/forecast tables scroll horizontally.
- `payroll/exports/page.tsx` — template cards stack 1-column.
- `payroll/staff/[staffProfileId]/page.tsx` — payslip table scrolls. Download button is full-width on mobile.
- `payroll/my-payslips/page.tsx` — YTD card full-width. Bar chart shrinks to fit. Payslip list cards.
- `payroll/absences/page.tsx` — table scrolls.

Fix any horizontal overflow. Add `overflow-x-auto` wrappers where needed. Verify all interactive elements are ≥ 44×44px touch targets.

### 4. Dead-code removal

Search for and remove:

- `apps/api/src/modules/payroll/payroll-deductions.service.ts` — the original `autoApplyForRun` method. Wave 2 replaced it with `scheduleApplicationForRun + commitApplications`. Remove or alias to throw.
- Any remaining hardcoded `'payroll:mass-export-payslips'` or `'payroll:generate-sessions'` strings. `grep -r` to find them.
- Any `as unknown as` casts in `payroll-calendar.service.ts` or other payroll services. Wave 3 introduced typed settings; remove the legacy cast.
- The unused `StaffProfilesModule` import in `payroll.module.ts` (audit found it; if Wave 2 didn't drop it, drop it now — verify no other module member uses it).
- `// silent` comments that were paired with `console.error` swallows. Wave 5 should have replaced all of these with toasts. Search for `// silent` and verify each one is gone.
- Unused frontend forms that were superseded by RHF + zod versions. (Specifically: any `useState`-per-field code in compose dialogs that wasn't refactored.)

Run `pnpm turbo run lint` and address any new warnings introduced by the cleanup.

### 5. Architecture docs

#### 5a. `docs/architecture/feature-map.md`

Update the Payroll section's quick-reference: 79 endpoints → 79 + ~10 new = ~89 endpoints (count exact). Pages: 10 (unchanged but each is now functional). Worker jobs: 3 (unchanged in name, fixed in content).

Update the bullet list to reflect new capabilities:

- Self-service payslips and YTD
- Tenant-wide allowances/deductions list endpoints
- Anomaly acknowledgment

Update the "Last verified" date.

#### 5b. `docs/architecture/module-blast-radius.md`

PayrollModule entry: update **Exports** to include `FinalisationService`, `PayrollInputResolver`. Update **Imports** to drop `StaffProfilesModule` if dropped. Update **Notes** to mention the dual-path unification.

#### 5c. `docs/architecture/event-job-catalog.md`

Update the `payroll` queue entry:

- Job names sourced from `@school/shared/payroll/job-names.ts` (single source of truth).
- Redis status keys sourced from `@school/shared/payroll/redis-keys.ts`.
- Add the idempotency keys: `mass-export:${runId}:${locale}`, `session-gen:${runId}`.

#### 5d. `docs/architecture/state-machines.md`

PayrollRunStatus: update the `pending_approval` row to include `→ cancelled`. Update the side-effects section: finalisation now occurs only via `FinalisationService.finaliseAtomic` (single source of truth).

#### 5e. `docs/architecture/danger-zones.md`

Append three new entries:

```markdown
## DZ-Payroll-1: Historical payslip-number format inconsistency

Pre-rebuild, runs finalised through the direct path produced `<PREFIX>-YYYYMM-NNNNNN` (6-digit padding) while runs finalised through the approval-callback worker produced `PS-YYYYMM-NNNNN` (5-digit padding, hardcoded `PS-` prefix). The rebuild standardised both paths to the 6-digit form via `formatPayslipNumber()` in `@school/shared`. **Pre-rebuild payslips retain their original numbers.** Tenants finalising new runs see a format change at the rebuild cutover. If a tenant queries by payslip number, the historical mix is by design.

## DZ-Payroll-2: Deduction two-phase application

Recurring deductions are applied in two phases:

1. `scheduleApplicationForRun` — idempotent insert into `payroll_deduction_applications` (unique on `(payroll_run_id, staff_recurring_deduction_id)`).
2. `commitApplications` — decrements `staff_recurring_deduction.remaining_amount` exactly once per run, stamping `committed_at` on the application row.

Calling `commitApplications` BEFORE `scheduleApplicationForRun` decrements zero applications (no-op). Calling `scheduleApplicationForRun` multiple times has no effect (unique key blocks). The two MUST be called in order, and the commit MUST happen inside the same transaction as run finalisation. Calling them out of sequence in a custom code path will leave deductions un-committed.

## DZ-Payroll-3: Compensation period-bracket "most-recent" rule

When multiple compensation rows for the same staff member overlap a payroll run period (data integrity issue, but possible), the engine selects the row with the most recent `effective_from`. Tenants who have multiple active compensations for the same staff member see only the latest; older overlapping rows are silently ignored. The check happens in `CompensationService.findActiveForPeriod()`. Adding a database-level partial unique constraint on `staff_compensation (staff_profile_id) WHERE effective_to IS NULL` would prevent the overlap entirely; this was not added because it could break tenants with existing overlapping rows during the rebuild. Future maintenance task: clean up overlaps then add the constraint.
```

### 6. Pre-launch checklist verification

Open `docs/operations/PRE-LAUNCH-CHECKLIST.md`. Search for any `payroll` items in Part 5 (Deferred Items) or Part 2 (Known Gaps). For each one:

- If it is now resolved by this rebuild, mark it as DONE with the rebuild commit reference.
- If it is still deferred, leave it — but verify the description is still accurate.

If new items emerged during the rebuild that should be tracked for pre-launch (e.g. "audit the compensation overlap clean-up before going live"), add them to Part 5.

### 7. Production smoke walk-through

On a production tenant, perform an end-to-end walk-through with the user watching:

1. Sign in as an Owner.
2. Navigate to `/payroll`.
3. Create a run for the current month.
4. Open the run, verify all entries render with correct compensation, days_worked, classes_taught.
5. Add an allowance to one staff member. Refresh the run. Verify the allowances_total updates on that entry.
6. Add a one-off bonus to another entry. Refresh. Verify one_off_total updates.
7. Add an adjustment (negative type). Refresh. Verify adjustments_total reflects it (negative).
8. Finalise the run. If approval required, sign in as the approver and approve it.
9. Verify the payslip-number format on the new payslips: `<PREFIX>-202604-000001` style.
10. Trigger a mass export. Wait 30 seconds. Download the PDF. Verify it opens and contains all payslips with all components correctly displayed.
11. Sign in as a regular staff user. Navigate to `/payroll/my-payslips`. Verify they see only their own payslips and YTD.
12. Sign back in as Owner. Navigate to `/payroll/staff/<staffId>`. Verify the page loads with the correct staff name in the title and a downloadable individual PDF.

Document each step's result in the impl 07 completion record.

### 8. Remove the orchestration package on completion

Once the smoke succeeds and all tests pass, this rebuild is "done". The `payrollnew/` directory remains in the repo as a historical artefact (matching the new-inbox/new-admissions convention). DO NOT delete it. The next rebuild creates its own directory.

---

## Tests

This impl IS the test suite. The "tests" section is woven through what to build. The critical assertion: every test class that should exist after the rebuild does exist, every fixture is realistic, every cross-path equivalence is validated.

Run targets:

- `pnpm turbo run test` — full repo
- `pnpm --filter @school/api test --testPathPattern=payroll`
- `pnpm --filter @school/worker test --testPathPattern=payroll`
- `pnpm --filter @school/shared test --testPathPattern=payroll`
- `pnpm --filter @school/web test --testPathPattern=payroll`
- `pnpm --filter @school/web exec playwright test e2e/payroll-end-to-end.spec.ts`

Acceptance: all green. No skipped tests left from the rebuild's stub `.spec.ts` files (Wave 1 stubs should now be filled in — verify by searching `describe.skip` for `payroll-overhaul Wave`).

---

## Watch out for

- **The translation pass.** Don't half-ass this. Bad Arabic copy is the most-visible quality marker for a tenant.
- **The mobile sweep is tedious but mandatory.** Use the Chrome DevTools device emulator at 375x667 (iPhone SE). Verify every page interaction.
- **Architecture-doc drift.** It is tempting to skip this. Don't. The audit found that `module-blast-radius.md` was outdated for payroll; correcting it now sets the precedent.
- **Removing dead code is risky.** Verify `pnpm lint` and the full test suite pass after each removal. Re-run the e2e Playwright suite as a final check.
- **The pre-launch checklist** is the user's tool for shipping. If any payroll item is left there, the rebuild isn't truly done.
- **The cross-path equivalence test** is the single most important regression in this entire rebuild. Without it, the dual-path divergence can re-introduce silently. Make sure it's robust and runs in CI.

---

## Deployment notes

This impl restarts web only (translations + mobile fixes). Tests run in CI but don't deploy to prod.

Sequence:

1. Apply patch.
2. Clear `.next` on the server.
3. Build: `pnpm turbo run build --filter=@school/web`.
4. Restart: `pm2 restart web --update-env`.
5. Smoke tests: the production walk-through described in step 7 above. Document results in the completion record.
6. After this impl ships: append a "Rebuild complete" milestone record to the IMPLEMENTATION_LOG.md noting the start date, end date, total commits, and a 3-line summary of the rebuild's outcome.

If the production walk-through reveals an issue that requires a Wave 2/3/4 fix, file it as a follow-up note with severity, do NOT block this impl on it. Wave 5's job is to verify and document — fixes are tracked separately as patch implementations.
