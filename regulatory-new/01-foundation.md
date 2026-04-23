# Phase 1 — Foundation

**Goal:** prepare the ground. Register teal as regulatory's accent, retire the sub-strip + in-page nav, settle the response-envelope convention, audit shared primitives.

**Dependencies:** none. This is the first phase.

**Estimated effort:** 2–3 hours.

---

## Why first

Every subsequent phase rebuilds pages. If we don't settle the shell wiring and the response-envelope convention up front, each phase ends up reinventing those decisions and drifting from the pattern.

---

## Scope — in

1. Add regulatory as an entry in `docs/plans/ux-redesign-final-spec.md` §14.4 with the teal gradient pair.
2. Delete the `regulatory: [...]` sub-strip block from `apps/web/src/lib/nav-config.ts`.
3. Remove every import of `./_components/regulatory-nav` from regulatory pages; do not render it anywhere.
4. Verify the morph-bar "Regulatory" hub pill still activates on every `/regulatory/*` route after the sub-strip removal (exercise the `activeHub` memo in `apps/web/src/app/[locale]/(school)/layout.tsx:204-211`).
5. **Decide and document the response-envelope convention** for this module. Options:
   - **Option A:** extend `apiClient` so it always unwraps `{ data }` when present. Cleanest, but touches a shared utility used elsewhere — needs a careful regression pass.
   - **Option B:** each regulatory page unwraps at the call site: `apiClient<{ data: T }>(...).then((r) => setData(r.data))`. Contained blast radius, aligns with the existing `fix(leave): unwrap /v1/leave/balance response envelope` commit.
   - **Recommendation:** Option B for this redesign (matches the pattern Daisy already shipped for leave). Record the choice in this file and in `docs/architecture/danger-zones.md` as a cross-module convention note.
6. Audit that these primitives exist and are exported cleanly (they should all already be in place):
   - `PageHeader` (w/ `back`, `actions`)
   - `KpiTile`, `CardSkeleton`
   - `QuickAction`
   - `HubTile`
   - `EmptyState`
   - `StatusBadge`
   - `DataTable` (if list pages will use it)
     If any gap exists, widen its interface in this phase rather than every phase re-wrapping it.

## Scope — out

- No page rewrites yet. `/regulatory`, `/regulatory/tusla`, `/regulatory/ppod` etc. still render their legacy UIs at the end of Phase 1 — just without the sub-strip or the in-page nav.
- No new translation keys (those land with their consuming pages).
- No fixes to the API path bugs or response-envelope crashes (they're fixed by the pages that own them, Phases 2–10).

---

## Concrete changes

### Files modified

- `docs/plans/ux-redesign-final-spec.md` — add a row to the §14.4 table for **Regulatory**:
  - Gradient: `from-teal-400 via-teal-500 to-teal-600`
  - Icon bg: `bg-teal-100 text-teal-700`
- `apps/web/src/lib/nav-config.ts` — delete the `regulatory: [...]` entry from `subStripConfigs` (or equivalent export). Keep the morph-bar hub pill.
- `apps/web/src/app/[locale]/(school)/regulatory/page.tsx` — remove `<RegulatoryNav />` rendering + import (the page will still crash until Phase 2; that's expected).
- Every other file under `apps/web/src/app/[locale]/(school)/regulatory/**/page.tsx` that imports and renders `RegulatoryNav` — strip the import and the JSX. Grep:
  ```
  grep -rl "regulatory-nav" apps/web/src/app/\[locale\]/\(school\)/regulatory/
  ```
- `docs/architecture/danger-zones.md` — append a short entry documenting the response-envelope unwrap convention for this module.

### Files deleted

- `apps/web/src/app/[locale]/(school)/regulatory/_components/regulatory-nav.tsx` — retire once no file imports it.

### Files created

- None.

---

## Success criteria

- [ ] `docs/plans/ux-redesign-final-spec.md` §14.4 contains a **Regulatory** row with teal tokens.
- [ ] `apps/web/src/lib/nav-config.ts` no longer contains a `regulatory` sub-strip block.
- [ ] `grep -r "regulatory-nav" apps/web/src/` returns zero matches.
- [ ] Morph-bar "Regulatory" pill still highlights as active on every `/regulatory/*` route (verify on `/tusla`, `/ppod`, `/safeguarding`, `/submissions`, `/dpa`).
- [ ] `turbo lint`, `turbo type-check`, `turbo test` all pass.
- [ ] CI green. Deploy to prod. Visual spot-check on NHQS.
- [ ] Sentry has no new error signatures in the first 15 min post-deploy.

---

## Testing

- Local: `pnpm dev`, log in to NHQS-dev, walk every `/regulatory/*` route. Confirm morph bar pill activation, absence of sub-strip + in-page nav.
- Playwright regression: re-run the walk from [BUGS-INVENTORY.md](BUGS-INVENTORY.md). Error boundaries still present in Phase 1 — that's expected until Phases 2+. The purpose here is to confirm Phase 1 didn't introduce new failures.
- Post-deploy: verify on prod same way.

---

## Risks

- **Removing the sub-strip reveals how empty the sub-pages look.** That's a feature, not a bug — Phase 2 onwards fills them. Be prepared for the demo story to look worse for a few hours until Phase 2 lands.
- **`nav-config.ts` touch may have cross-module spill.** Confirm the `subStripConfigs` object doesn't get destructured anywhere that assumes a `regulatory` key. Grep + type-check catch this.
- **`RegulatoryNav` may still be referenced from tests.** Confirm with grep before deleting the component file.
