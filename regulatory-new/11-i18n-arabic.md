# Phase 11 — Arabic i18n Coverage

**Goal:** parity between EN and AR for every key added or changed across Phases 1–10. Full RTL regression pass of the module.

**Dependencies:** Phases 1–10 complete (all UI surfaces finalised and all EN keys added).

**Estimated effort:** 3–4 hours (translation + RTL walk).

---

## Scope — in

- Audit every `regulatory.*` key in `apps/web/messages/en.json` against `apps/web/messages/ar.json`. Fill any gaps.
- Re-translate any keys added during earlier phases that were rushed or left in EN under an AR key.
- Full RTL walk of every route in [BUGS-INVENTORY.md](BUGS-INVENTORY.md). Check:
  - Chevrons that should flip in RTL do flip (`rtl:rotate-180`).
  - No physical directional classes snuck into new components.
  - Dates / codes wrap `dir="ltr"` where appropriate.
  - Numbers use Western numerals in both locales (product rule).
- Fix any bugs found during the RTL walk.

## Scope — out

- New UI changes. This phase is translation + RTL polish only.

---

## Concrete changes

### Files modified

- `apps/web/messages/en.json` — audit only, should already be complete.
- `apps/web/messages/ar.json` — fill missing keys, translate any EN-placeholders.

### Files potentially modified (if RTL bugs found)

- Any regulatory page that uses physical direction classes (ideally zero).
- Any chevron / arrow component missing `rtl:rotate-180`.

### Verification script

Consider adding a quick script or spec at `apps/web/test/i18n-parity.spec.ts` that compares key sets between `en.json` and `ar.json` for the `regulatory` namespace and fails if keys diverge. Worth keeping as a regression guard.

---

## Success criteria

- [ ] `diff <(jq -r '.regulatory | paths(scalars) | join(".")' messages/en.json | sort) <(jq -r '.regulatory | paths(scalars) | join(".")' messages/ar.json | sort)` shows no differences.
- [ ] Playwright RTL spec walks every route in `/ar/regulatory/*` — no missing-translation console warnings, no physical-direction overflow bugs.
- [ ] Arabic text reads naturally (translations reviewed by a native speaker or well-regarded LLM pass if native review unavailable).
- [ ] Lint + type-check pass.

---

## Testing

- `apps/web/e2e/regulatory-rtl.spec.ts` — one spec that walks the 25 routes in Arabic locale and asserts no `MISSING_MESSAGE` warnings.
- Manual review pass of every sub-hub + key pages in AR.

---

## Risks

- **Ireland-specific terminology.** Words like "Bí Cineálta", "Tusla", "PPOD", "Garda vetting" don't translate meaningfully. Keep them in Latin script with a short Arabic explanation.
- **Date formatting.** Default `toLocaleDateString('ar')` uses Arabic-Indic digits by default; the product rule forces Western digits. Confirm every date formatter passes the right locale + options.
