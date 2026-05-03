# Implementation 13 — Expansion Polish / Cleanup Pass

> **Phase:** 5.6 — Expansion close-out
> **Wave:** 13 (serial — final implementation in this expansion)
> **Depends on:** 12.5 complete & deployed
> **Deploys:** API restart + worker restart + web restart through the normal GitHub Actions deploy
> **Model:** GPT-5.5 / High effort

---

## Goal

Close the multi-language expansion after Romanian and the PDF template-bundle pass.

This implementation is a polish/cleanup pass. It is **not** a Polish (`pl`) language-pack rollout.

After this ships:

- The implementation log and strategy no longer describe implementation 13 as a `pl` rollout.
- `pl` remains registered metadata-only and inactive.
- No `apps/web/messages/pl.json` exists.
- No Polish notification or PDF catalogue is added.
- No NHQS `supported_locales` update is performed for `pl`.
- Existing active locales remain: `en`, `ar`, `fr`, `es`, `de`, `ga`, `it`, `ro`.
- Architecture notes document the Tier 2 guard with only active Tier 2 locales (`it`, `ro`).
- Production verification confirms NHQS readback, public/auth flows, locale picker, and Sentry are clean after the close-out.

---

## Critical Safety Constraints

- Do **not** activate `pl` in the i18n registry.
- Do **not** create `apps/web/messages/pl.json`.
- Do **not** add `pl-ltr`, `pl-mobile`, or Polish visual baselines.
- Do **not** append `pl` to any tenant's `supported_locales`.
- Do **not** add Polish notification or PDF bundles.
- Preserve the existing registered-but-inactive `pl` metadata unless a future dedicated language implementation explicitly removes or ships it.
- Keep the 12.5 PDF template bundles limited to the locales already shipped by this expansion.

---

## Files to Modify

- `New Languages/IMPLEMENTATION_LOG.md`
- `New Languages/STRATEGY.md`
- `New Languages/implementations/13-expansion-cleanup.md`
- `New Languages/implementations/12.5-pdf-template-bundles.md`
- `apps/web/i18n/tier-scopes.ts`
- `apps/web/src/__tests__/i18n/registry.spec.ts`
- `docs/architecture/danger-zones.md`

Do not update `docs/architecture/feature-map.md` in this pass. Per the feature-map maintenance rule, flag it to Ram only if a future product-scope documentation pass is needed.

---

## Detailed Task Breakdown

### Task 1 — Replace the stale implementation 13 plan

- Rename/rewrite `implementations/13-polish.md` as this cleanup spec.
- Update the implementation index so 13 is "Polish / cleanup pass", not "Polish (`pl`) parent+student catalogue".
- Remove the Phase 6 pending `pl` tenant rollout row.
- Update summary metrics and live-language notes.

### Task 2 — Correct strategy documentation

- Update Tier 2 scope to list Italian and Romanian as the shipped Tier 2 languages.
- Leave `pl` described only as registered inactive metadata for a future dedicated rollout.
- Update session counts to include the inserted 12.5 PDF template-bundle gate and final cleanup pass.
- Remove P5-PL execution recommendations from the active plan.

### Task 3 — Tighten runtime guard documentation/tests

- Update Tier 2 route-scope comments and danger-zone notes so they name `it` and `ro` as active Tier 2 locales.
- Keep registry tests asserting `pl` is registered but inactive and absent from active runtime locales.
- Keep PDF tests asserting `pl` has no template bundle.

### Task 4 — Validate locally

Run the targeted documentation/code guard battery:

```bash
pnpm exec prettier --check "New Languages/IMPLEMENTATION_LOG.md" "New Languages/STRATEGY.md" "New Languages/implementations/13-expansion-cleanup.md" "New Languages/implementations/12.5-pdf-template-bundles.md" docs/architecture/danger-zones.md apps/web/i18n/tier-scopes.ts apps/web/src/__tests__/i18n/registry.spec.ts
pnpm --filter @school/web test -- registry tier-scopes translation-parity --runInBand
pnpm --filter @school/api test -- pdf-rendering.service index --runInBand
pnpm i18n:check
git diff --check
```

If the pre-push hook runs the full validation suite, treat that as the final local regression gate.

### Task 5 — Commit, push, watch deploy

- Stage only the files touched by this implementation.
- Pre-push check `origin/main..HEAD`.
- Push to `main`.
- Watch GitHub Actions through deploy success.

### Task 6 — Production close-out verification

- Confirm NHQS public tenant readback still lists `en,ar,fr,es,de,ga,it,ro` and not `pl`.
- Confirm a representative public flow still loads.
- Confirm an authenticated NHQS parent/student-relevant locale picker still offers only supported active locales.
- Confirm `/pl/...` does not render a missing-message 500.
- Check Sentry for no new `MISSING_MESSAGE` or `MISSING_PDF_TEMPLATE` issues after deployment.

### Task 7 — Final log update

Update `IMPLEMENTATION_LOG.md` with:

- Commit SHA(s)
- CI run URL(s)
- Deploy timestamp(s)
- Production verification notes
- Confirmation that no NHQS `supported_locales` SQL was required
- Confirmation that implementation 13 did not ship Polish (`pl`)

Commit, push, and watch that documentation update too.

---

## Acceptance Criteria

- [ ] Implementation 13 is documented as a cleanup/polish pass, not a Polish language pack.
- [ ] `pl` remains registered but inactive.
- [ ] `ACTIVE_LOCALE_CODES` remains `['en', 'ar', 'ga', 'fr', 'de', 'es', 'it', 'ro']`.
- [ ] No `apps/web/messages/pl.json`.
- [ ] No Polish Playwright projects, notification catalogues, PDF bundles, or NHQS rollout.
- [ ] Tier 2 route guard docs mention active Tier 2 locales accurately.
- [ ] Local targeted validation passes.
- [ ] CI green and production deploy successful.
- [ ] Production readback confirms NHQS supported locales remain `en, ar, fr, es, de, ga, it, ro`.
- [ ] Sentry has no `MISSING_MESSAGE` or `MISSING_PDF_TEMPLATE` events from the close-out.
- [ ] `IMPLEMENTATION_LOG.md` marks the expansion complete.

---

## Rollback

This pass is documentation and guardrail cleanup. Roll back by reverting the implementation 13 cleanup commit(s).

There is no tenant-locale rollback SQL because this implementation must not mutate `supported_locales`.
