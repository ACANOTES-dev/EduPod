# Implementation 06 — Polish, Translations, Docs, Regression Tests

> **Wave:** 4 (serial — runs alone)
> **Classification:** polish
> **Depends on:** 04, 05
> **Deploys:** Web restart only

---

## Goal

Final cleanup pass for the household-numbers rebuild. Translations sweep (catch any key impls 04/05 missed), architecture docs updates, regression test run, feature map update, end-to-end smoke test via Playwright following the same pattern as the new-admissions rebuild verification.

Nothing in this impl adds new behaviour. It's a wash-and-dry pass to make sure the rebuild is actually complete and discoverable.

## Shared files this impl touches

- `apps/web/messages/en.json` — final sweep for missing / stale keys. This is the last chance to fix translation debt before the rebuild ships.
- `apps/web/messages/ar.json` — same.
- `docs/architecture/module-blast-radius.md` — adds cross-module dependency lines for the new HouseholdNumberService usage across households/students/admissions.
- `docs/architecture/state-machines.md` — note the tiered-FIFO auto-promotion rule change in the `ApplicationStatus` section.
- `docs/architecture/event-job-catalog.md` — no new jobs, but note that `admissions:auto-promoted` now runs against a tiered queue.
- `docs/architecture/feature-map.md` — add `household_number` primitive and the multi-student application endpoint.
- `docs/features/admissions.md` — add a section on household numbers, sibling priority, and the multi-student flow.
- `IMPLEMENTATION_LOG.md` — final status flip + completion record. Separate commit.

Nothing in this impl creates new files besides an E2E test spec; it's all edits to existing documentation and translation files.

## What to build

### Sub-step 1: Translations sweep

Run `pnpm i18n:check` (if the repo has it) or just grep the codebase for any `t('publicApplyForm.*')`, `t('registrationWizard.household.*')`, `t('householdDetail.*')`, `t('admissionsQueues.siblingBadge')` calls and verify every key is defined in BOTH en.json and ar.json.

Add any missing ones. Replace any machine-translated placeholders that slipped through impls 04/05 (commonly marked with `[AR]` prefix) with reviewed Arabic.

### Sub-step 2: Architecture docs

`docs/architecture/module-blast-radius.md`:

Under `HouseholdsModule`, add:

```
- **Contract (extended 2026):** household_number generation via HouseholdNumberService
  (exported to StudentsModule for student-number assembly and to AdmissionsModule
  for the conversion-to-student path). Per-tenant unique 6-char alphanumeric
  identifier, random, capped at 99 students per household.
- **New consumers:**
  - StudentsModule — reads household_number at student-create time to assemble
    `{household_number}-{nn}` student numbers
  - AdmissionsModule — calls `HouseholdNumberService.generateUniqueForTenant` from
    `ApplicationConversionService` when materialising a new household from an
    approved new-family batch, and `incrementStudentCounter` when creating any
    student under a household with a number
```

Under `AdmissionsModule`:

```
- **Batch applications:** the public apply path now creates N Application rows
  per submission, bundled by `submission_batch_id`. Each flows through its own
  state machine independently. Conversion of the first approval in a
  new_household batch materialises the household and retro-links the rest of
  the batch.
- **Sibling priority:** auto-promotion runs tiered FIFO —
  `ORDER BY is_sibling_application DESC, apply_date ASC`. Siblings always
  promote from the waiting list ahead of non-siblings.
```

`docs/architecture/state-machines.md`:

In the `ApplicationStatus` section, add a note under "Side effects":

```
- `waiting_list → ready_to_admit` (auto-promotion): the FIFO order is now
  TIERED — applications with `is_sibling_application = true` promote ahead
  of non-sibling waiting-list entries, regardless of `apply_date`.
  Within each tier, FIFO by `apply_date` holds.
```

`docs/architecture/event-job-catalog.md`:

Under `notifications` queue → `admissions:auto-promoted`, add:

```
- **Tiered FIFO:** the underlying auto-promotion scan orders by
  `is_sibling_application DESC, apply_date ASC`. The notification payload is
  unchanged but the set of promoted applications differs under contention.
```

`docs/architecture/feature-map.md`:

Add an entry under "Admissions":

```
### Household numbers & multi-student applications
- **Primitive**: 6-char alphanumeric household identifier (`XYZ476`).
- **Student numbers**: derived as `{household_number}-{nn}` for households
  that have a number; legacy households continue on `STU-NNNNNN`.
- **Public API**: one submission can create up to 20 applications. Existing
  families authenticate via household number + parent email; new families
  provide their details up front.
- **Sibling priority**: waiting-list auto-promotion runs tiered FIFO.
- **Location**: see `household-numbers/PLAN.md`.
```

### Sub-step 3: `docs/features/admissions.md` update

Add a section at the bottom (or near the top if admissions.md has a TOC):

```markdown
## Household numbers & sibling flow

- Every household gets a stable 6-character identifier (e.g. `XYZ476`) at creation.
- Student numbers are derived from the household number (`XYZ476-01`, `XYZ476-02`), making sibling relationships obvious at a glance.
- The public apply form supports new families (with full household detail) and existing families (via household-number + parent-email lookup).
- Multiple children can be added in one submission — each becomes its own Application row linked to a shared `submission_batch_id`.
- Sibling applications get priority on the waiting list: auto-promotion runs tiered FIFO, picking siblings first before non-siblings.
- Hard cap: 99 students per household.

See `household-numbers/PLAN.md` for the full design.
```

### Sub-step 4: E2E Playwright spec

Create `apps/web/e2e/journeys/household-flow.journey.ts`:

```ts
test.describe('Household numbers and sibling flow', () => {
  test('mode picker renders with both options', async ({ page }) => {
    await page.goto('/en/apply/nhqs');
    await expect(
      page.getByRole('heading', { name: /new family or adding a child/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /new family applying/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /adding a child to an existing family/i }),
    ).toBeVisible();
  });

  test('existing family lookup shows error on bad data', async ({ page }) => {
    await page.goto('/en/apply/nhqs');
    await page.getByRole('button', { name: /adding a child to an existing family/i }).click();
    await page.getByLabel(/household number/i).fill('ZZZ000');
    await page.getByLabel(/parent email/i).fill('nobody@example.com');
    await page.getByRole('button', { name: /find our family/i }).click();
    // The toast appears after the failed API call — assert visible
    await expect(page.getByText(/couldn't find a family matching/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('new family form shows parents → address → students → emergency order', async ({ page }) => {
    await page.goto('/en/apply/nhqs');
    await page.getByRole('button', { name: /new family/i }).click();
    // Section headings must appear in this order
    const h2s = await page.locator('h2').allTextContents();
    const parent1Index = h2s.findIndex((h) => /primary parent/i.test(h));
    const studentsIndex = h2s.findIndex((h) => /children applying/i.test(h));
    const emergencyIndex = h2s.findIndex((h) => /emergency contact/i.test(h));
    expect(parent1Index).toBeGreaterThanOrEqual(0);
    expect(studentsIndex).toBeGreaterThan(parent1Index);
    expect(emergencyIndex).toBeGreaterThan(studentsIndex);
  });

  test('add another child button appends a new student block', async ({ page }) => {
    await page.goto('/en/apply/nhqs');
    await page.getByRole('button', { name: /new family/i }).click();
    const addBtn = page.getByRole('button', { name: /add another child/i });
    await expect(addBtn).toBeVisible();
    const before = await page.getByText(/child \d+/i).count();
    await addBtn.click();
    const after = await page.getByText(/child \d+/i).count();
    expect(after).toBe(before + 1);
  });
});
```

This is a render-smoke journey — it verifies the new UI exists and the add-student button works. Full data-seeded E2E (submit → admin approve → verify student created with `{hh}-01` number) follows the same pattern as the new-admissions journey spec and can be added if time permits.

### Sub-step 5: Regression test run

```bash
pnpm turbo run test --filter=@school/api --filter=@school/web --filter=@school/shared --filter=@school/prisma
pnpm turbo run type-check
pnpm turbo run lint
```

Fix anything that surfaced. No new features — just fixups.

### Sub-step 6: Manual smoke test via Playwright

Mirror the new-admissions verification pass:

1. Log in as `owner@nhqs.test / Password123!`
2. Create a new household via the walk-in wizard — confirm the household-number preview shows, refresh button works, the saved household displays its assigned number
3. Log out
4. Submit a public new-family application with 2 students via `/en/apply/nhqs` (mode picker → new family → fill all sections → add second child → submit)
5. Log back in as owner → `/en/admissions/ready-to-admit` — confirm both applications appear, sibling badge is NOT shown (new family, no existing siblings)
6. Approve both → confirm they land in conditional approval
7. Record cash payment on one → confirm student is created with `{new_household_number}-01`
8. Record cash payment on the second → confirm student `{new_household_number}-02`
9. Submit another public application in existing-family mode, looking up the household we just created, for one additional child → confirm:
   - Lookup screen finds the household by its number + parent email
   - Submit creates one more application
   - Application shows the sibling badge
   - Approve + record payment → student `{hh}-03`
10. Fill a year group to capacity-minus-one, submit a sibling application to a full slot, confirm it lands in waiting_list with the sibling badge and promotes first when capacity frees

## Watch out for

- The polish impl is the last chance to catch translation debt. Don't skip the en.json/ar.json sweep.
- The E2E spec cannot assume seeded data exists. Keep it to render smoke — data-dependent scenarios should be scoped to manual verification or a separate fixture-seeded test run.
- The feature-map update is not optional per `.claude/rules/feature-map-maintenance.md` — but only after confirming with the user. Ask before flipping the feature map.
- If any impl 02/03/04/05 shipped with a known follow-up that should be closed in polish, close it here.

## Deployment notes

1. Commit code by sub-step.
2. Final commit is the translation sweep — re-read both files before writing.
3. No serialisation needed since impl 06 is serial in its own wave.
4. Clear `.next`, rebuild with `--force`, restart web.
5. Run the manual Playwright smoke test.
6. Flip log to `completed` in a separate commit.
7. Close out the rebuild: tell the user the rebuild is done and awaiting the final CI push.
