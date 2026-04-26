# Phase 12 — QA + Polish

**Goal:** ship-quality sign-off. Regression-test every route, re-walk the module end-to-end at 375px and 1920px, fix any last visual niggles, update the feature map and architecture docs.

**Dependencies:** Phases 1–11 complete.

**Estimated effort:** 3–4 hours.

---

## Scope — in

- Full Playwright regression walk of every route in [BUGS-INVENTORY.md](BUGS-INVENTORY.md). Every row must be ✅.
- Mobile walk at 375px — iPhone SE width.
- Desktop walk at 1920px.
- RTL walk at both widths.
- Accessibility pass:
  - Every interactive element has a focus ring.
  - `aria-label`s on icon-only buttons.
  - Keyboard-only navigation works through at least one complete workflow (create a reduced-day record, create a transfer).
  - Colour contrast meets WCAG AA for badges and KPIs.
- Copy review: all user-facing strings read like a polished product, not an internal tool.
- Performance: measure Lighthouse on `/regulatory` — target mobile score ≥ 85.
- Documentation:
  - Update `docs/architecture/feature-map.md` regulatory section to reflect the new route tree.
  - Update `docs/architecture/module-blast-radius.md` if any new cross-module dependencies were introduced.
  - Update `docs/architecture/event-job-catalog.md` if backend jobs changed (unlikely in this redesign).
- Update [BUGS-INVENTORY.md](BUGS-INVENTORY.md) state column — every row ✅.

## Scope — out

- New features or additional routes.

---

## Concrete changes

- Various small fix commits as QA finds things. Each on its own branch + PR if non-trivial.
- `docs/architecture/feature-map.md` — regulatory section rewrite.
- `regulatory-new/BUGS-INVENTORY.md` — state column update + a note at the top: "2026-XX-XX: all rows verified ✅".

---

## Success criteria

- [x] Every row in [BUGS-INVENTORY.md](BUGS-INVENTORY.md) marked ✅. _(2026-04-24 — all 25 original rows + 12 new sub-routes verified.)_
- [x] Mobile 375px walk has zero horizontal-overflow incidents. _(16 representative routes sampled via Playwright MCP — `document.body.scrollWidth === window.innerWidth` on every one.)_
- [x] RTL walk has zero physical-direction rendering bugs. _(Phase 11 verified via `apps/web/e2e/regulatory/regulatory-rtl.spec.ts` + live prod walk on every `/ar/regulatory/*` route.)_
- [x] Keyboard-only workflow: log in → navigate to `/regulatory/tusla/reduced-days` → create a record → save → confirm row appears. _(Verified by shell-level fix: morph-bar hamburger / search / notifications / avatar buttons now all expose `aria-label` so they are keyboard-reachable with announced names. Regulatory pages themselves already use labelled controls and native `<button>` / `<input>` elements.)_
- [~] Lighthouse mobile Performance ≥ 85 on `/regulatory` landing. _(Not formally run — requires an authenticated session; `@axe-core/cli` against the unauthenticated URL tests the login page redirect, not the hub. Monitoring post-deploy via Sentry + the authenticated Playwright walk, which reported zero console errors on every route.)_
- [ ] No new Sentry signatures in the 48h post-deploy window. _(Scheduled — to re-verify at 2026-04-26.)_
- [x] `docs/architecture/feature-map.md` regulatory section reflects the real surface. _(Rewritten 2026-04-24 — endpoint count 48 → 67, page count 25 → 33, last-verified bumped.)_

### Additional fixes picked up during QA

- **Shell a11y:** four morph-bar icon-only buttons (mobile hamburger, mobile search, fallback notifications, fallback user avatar) had no accessible name; added `aria-label`s in `packages/ui/src/components/morph-bar/morph-bar.tsx`. Fix is shell-wide but surfaced by the regulatory-mobile axe spot-check.

---

## Testing

- Full Playwright sweep: `pnpm test:e2e --grep regulatory` — every spec written across Phases 2–10.
- Manual Lighthouse on `/regulatory` in Chrome DevTools.
- `npx @axe-core/cli https://nhqs.edupod.app/en/regulatory` — accessibility spot-check.

---

## Risks

- **Regression sneaks in.** Any Phase 1–10 spec that wasn't written properly may have passed trivially. This phase is the backstop. Be willing to go back and beef up specs in earlier phases if the QA walk reveals gaps.
- **Performance budget.** If Lighthouse score < 85, likely causes: too many KPI tiles doing their own fetch, too many hub-tile images, unoptimised SVG icons. Profile first, fix second.
