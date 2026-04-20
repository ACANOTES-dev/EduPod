# Implementation 10 — Frontend Page Crash Fixes

> **Wave:** 4 (**parallel-risky** — apply rules H1–H10 from `IMPLEMENTATION_LOG.md` §2b)
> **Classification:** frontend
> **Depends on:** 02, 03
> **Deploys:** Web restart only

---

## Goal

Five pages render the global error boundary on first load because their TypeScript code dereferences fields that may be undefined when an API returns an empty/different shape. Fix each with defensive null/array guards. Do not change page layout or copy. Do not add new features. The user-visible result is "page renders the empty state instead of crashing".

The five crashes (from the live audit):

1. `/wellbeing/dashboard` — `TypeError: Cannot read properties of undefined (reading 'mean')`
2. `/wellbeing/reports` — page-level error boundary
3. `/wellbeing/resources` — `TypeError: Cannot read properties of undefined (reading 'length')`
4. `/pastoral/checkins` — `TypeError: F.map is not a function`
5. `/early-warnings/settings` — `TypeError: Cannot read properties of undefined (reading 'attendance')` (during Array.reduce)

## Shared files this impl touches

- `IMPLEMENTATION_LOG.md` — separate commit.

That's it. This impl owns five distinct page files; nothing shared with sibling impls 11 and 12.

Hot-zone severity: **none.** No translation edits. No nav-config edits. Five focused page fixes.

## What to build

For each page, the recipe is the same:

1. Read the page file.
2. Identify the unsafe access (often a `.map`, `.reduce`, `.length`, `.field` on a value that may be `undefined` when the API returns a different/empty shape).
3. Add a null-safe guard at the top of the render function: `if (!data || !data.someField) { return <EmptyState />; }`.
4. Render the existing empty state (already in the file in most cases) instead of crashing.
5. Verify the network response shape with curl against production. If the backend response is genuinely wrong (not just empty), file a follow-up; this impl does not modify the backend.

### Page-by-page

**`/wellbeing/dashboard`** — `apps/web/src/app/[locale]/(school)/wellbeing/dashboard/page.tsx`

- The crash is on `.mean` access during workload-summary rendering. Likely the response is `null` (impl 04 did not yet fix the underlying 404, but Wave 5 impl 15 retires this whole page anyway).
- Defensive fix: render `<UnableToLoad />` placeholder when `summary === null` or any nested field is missing. Keep the existing retry button.
- Note in completion record: this page is being retired by impl 15; the fix is just to stop the crash in the meantime so test users can navigate past it.

**`/wellbeing/reports`** — `apps/web/src/app/[locale]/(school)/wellbeing/reports/page.tsx`

- Same defensive pattern. Render existing "Not Available" placeholder when termly-summary endpoint returns null/empty.
- Same retirement note (impl 15 folds this page).

**`/wellbeing/resources`** — `apps/web/src/app/[locale]/(school)/wellbeing/resources/page.tsx`

- Crash on `.length` of resources array. Add `(resources ?? []).length === 0` guard.
- Retirement note: impl 15 folds this page.

**`/pastoral/checkins`** — `apps/web/src/app/[locale]/(school)/pastoral/checkins/page.tsx`

- Crash on `F.map is not a function` — response is an object `{ data: [...] }` and code calls `.map` on the response root.
- Fix: extract `data` properly: `const items = response?.data ?? [];` then `.map`.
- This page stays — pastoral is untouched by the rebuild, but the crash fix is permitted as part of stop-the-bleeding.

**`/early-warnings/settings`** — `apps/web/src/app/[locale]/(school)/early-warnings/settings/page.tsx`

- Crash on `.attendance` during reduce — settings response is empty (no row exists for this tenant) and code assumes per-domain config object.
- Fix: when settings response is empty/missing, render a "Defaults will be initialised on first save" state with a Save button that POSTs the default config (inline default in TS, mirroring the backend default the impl 01 seed ships).
- Behaviour after fix: tenant with no early-warning settings sees a usable settings page with default values pre-filled, can save to materialise the row.

### Approach for each fix

Per Rule H2, commit after each page fix. Five pages = five commits. Pattern:

```bash
# After fixing wellbeing/dashboard
git status   # verify only that one file shows
git add apps/web/src/app/[locale]/\(school\)/wellbeing/dashboard/page.tsx
git commit -m "fix(wellbeing): null-guard dashboard summary access (impl 10)"

# Then move on to wellbeing/reports, repeat
```

After all five page fixes, do the log update in a separate sixth commit (Rule H7).

## Tests

- For each page, add a unit test or integration test that mounts the component with `null` / empty response and asserts no crash + correct empty state.
- Run `pnpm turbo run test --filter=@school/web` and ensure no regressions.
- Live verification on production after deploy: visit each of the 5 URLs as the seeded NHQS principal account; confirm each renders without "Something went wrong".

## Watch out for

- **Don't refactor the page** — the four pages slated for retirement (1, 2, 3) are about to be deleted/redirected by impl 15. Don't waste effort on cleanup.
- **`/early-warnings/settings` deserves a real fix** because it stays and impl 16 builds on top of it. Make sure the default-init pattern is clean.
- **Pre-deploy serialisation** with sibling impls 11 and 12 — all three deploy `pm2 restart web`. First-come-first-served per the slash command's Step 6a.

## Deployment notes

- Restart: web only.
- Smoke: navigate to each of the 5 URLs after deploy. Each should render its empty state (or for early-warnings/settings, a usable settings page with defaults). No `Something went wrong` boundary anywhere.
