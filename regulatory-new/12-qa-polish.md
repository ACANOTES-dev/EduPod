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

- [ ] Every row in [BUGS-INVENTORY.md](BUGS-INVENTORY.md) marked ✅.
- [ ] Mobile 375px walk has zero horizontal-overflow incidents.
- [ ] RTL walk has zero physical-direction rendering bugs.
- [ ] Keyboard-only workflow: log in → navigate to `/regulatory/tusla/reduced-days` → create a record → save → confirm row appears. Done without touching the mouse.
- [ ] Lighthouse mobile Performance ≥ 85 on `/regulatory` landing.
- [ ] No new Sentry signatures in the 48h post-deploy window.
- [ ] `docs/architecture/feature-map.md` regulatory section reflects the real surface.

---

## Testing

- Full Playwright sweep: `pnpm test:e2e --grep regulatory` — every spec written across Phases 2–10.
- Manual Lighthouse on `/regulatory` in Chrome DevTools.
- `npx @axe-core/cli https://nhqs.edupod.app/en/regulatory` — accessibility spot-check.

---

## Risks

- **Regression sneaks in.** Any Phase 1–10 spec that wasn't written properly may have passed trivially. This phase is the backstop. Be willing to go back and beef up specs in earlier phases if the QA walk reveals gaps.
- **Performance budget.** If Lighthouse score < 85, likely causes: too many KPI tiles doing their own fetch, too many hub-tile images, unoptimised SVG icons. Profile first, fix second.
