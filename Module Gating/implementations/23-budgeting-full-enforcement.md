# Implementation 23 — Budgeting Full Enforcement

> **Phase:** 3 — Wave W3 (full enforcement pass)
> **Wave:** W3 (gap fix — should have shipped alongside impls 12–17 but was missed)
> **Depends on:** W1 (01–08); aware of impl 14 finance (budgeting `depends_on: ['finance']` per the registry — informational only)
> **Deploys:** API restart + worker restart + web rebuild
> **Model:** Sonnet 4.6 (template-driven; 11 controllers + 4 cron processors + nav)

---

## Goal

Wire `@ModuleEnabled('budgeting')` enforcement across the entire budgeting surface — 11 controllers + 4 cron processors + frontend nav for budgeting management surfaces. After this ships, toggling `budgeting` off cleanly hides budgeting UI, prevents new financial models / scenarios / line items / event budgets / variance refreshes, and skips the shareable-link cleanup cron for that tenant.

This implementation closes a gap left when the original W3 specs (12–17) were drafted — `budgeting` is in the canonical registry per impl 01 and seeded per impl 02, but no per-module enforcement spec was written for it. The data layer works; the enforcement layer doesn't. This spec brings budgeting into parity with the other W3 modules.

---

## Critical safety constraints

- **Public shareable-links controller (`shareable-links.public.controller.ts`) MUST remain ungated.** External viewers (board members, finance committee) reach shared budget reports without authenticated sessions, via short-lived tokens embedded in the share link. Add an inline doc comment matching the pattern from impl 14 (Stripe webhook) and impl 19 (public website): `// PUBLIC: intentionally ungated. Shareable link viewers reach this without an authenticated session via short-lived tokens embedded in the link. Disabling 'budgeting' hides the admin/management UI but does NOT invalidate already-issued share links.`
- **In-flight board-pack renders may complete** (we don't kill in-flight). Resulting PDFs/Excels land in S3 but are inaccessible via the gated `/finance/budgeting/exports` endpoints. Acceptable; matches gradebook (impl 13) report-card semantic.
- **The `depends_on: ['finance']` hint in the registry is informational only.** Disabling `finance` does NOT auto-disable `budgeting`. If both are off, both are off; if finance is off but budgeting is on, the budgeting service can still query the variance source (which queries finance tables directly via Prisma, bypassing finance API gates). The variance numbers may be wrong if finance was disabled mid-cycle and re-enabled, but that's a data freshness concern, not an enforcement concern. Document the cross-module behaviour in the spec but don't add cross-module guards.
- **The static-analysis test from impl 07 will catch missing-guard regressions** — verify that no controller in `apps/api/src/modules/budgeting/` (other than the documented public one) exists with `@ModuleEnabled` but without `ModuleEnabledGuard` in `@UseGuards`.

---

## Files to modify

### Controllers (add `@ModuleEnabled('budgeting')` + `ModuleEnabledGuard` at class level)

All 10 admin/staff controllers under `apps/api/src/modules/budgeting/`:

- `event-budgets/event-budgets.controller.ts`
- `exports/exports.controller.ts`
- `financial-models/financial-models.controller.ts`
- `line-items/line-items.controller.ts`
- `scenarios/scenarios.controller.ts`
- `shareable-links/shareable-links.controller.ts` (the admin-side; manages issuance/revocation)
- `snapshots/snapshots.controller.ts`
- `tenant-preferences/tenant-preferences.controller.ts`
- `trip-fee-integration/trip-fee-integration.controller.ts`
- `variance/variance.controller.ts`

### Controller — remain ungated (public viewer)

- `apps/api/src/modules/budgeting/shareable-links/shareable-links.public.controller.ts` — add the doc comment from §Critical safety constraints above. The existing token-validation logic stays as the access gate.

### Worker processors (Pattern B — top-of-process check)

- `apps/worker/src/processors/budgeting/budgeting-queue.processor.ts` — at the top of `process()`, check `TenantModuleService.isEnabled(job.data.tenant_id, 'budgeting')`; silently return if disabled.
- `apps/worker/src/processors/budgeting/shareable-link-cleanup.processor.ts` — same.
- `apps/worker/src/processors/budgeting/board-pack-render.processor.ts` — same. If a render is in-flight when the toggle flips off, the existing job completes; the resulting S3 object is orphaned (acceptable per the constraint above).
- `apps/worker/src/processors/budgeting/variance-refresh.processor.ts` — same. Variance computations skipped while disabled means stale `VarianceCache` rows on re-enable; the existing variance-refresh-bootstrap cron picks them up at the next scheduled tick.

### Frontend — nav annotations

- `nav.budgeting` (and any sub-entries: `/finance/budgeting/financial-models`, `/finance/budgeting/scenarios`, `/finance/budgeting/snapshots`, `/finance/budgeting/exports`, `/finance/budgeting/shareable-links`, `/finance/budgeting/variance`, `/finance/budgeting/event-budgets`) → `moduleKey: 'budgeting'`
- The budgeting hub lives under `nav.finance` per the existing morph-shell sub-strip layout; the budgeting moduleKey is independent of the finance moduleKey. When `finance` is enabled but `budgeting` is disabled, the Finance hub renders but the Budgeting sub-link is hidden — no visual gap (the sub-strip just has fewer entries).

### Tests

- Un-skip the `budgeting` block in `apps/api/test/module-gating-leakage.e2e-spec.ts`. Probes:
  - `GET /api/v1/finance/budgeting/financial-models` → 404 MODULE_DISABLED when off
  - `GET /api/v1/finance/budgeting/scenarios` → 404 MODULE_DISABLED when off
  - `GET /api/v1/finance/budgeting/variance/:id` → 404 MODULE_DISABLED when off
  - `GET /api/v1/finance/budgeting/shared/:token` (the public viewer) → 200 (or whatever happy-path is for a valid token) regardless of toggle (verify with a dedicated test).
- New unit test in `shareable-links.public.controller.spec.ts`: a public token request succeeds when budgeting is disabled (the gating MUST NOT block this endpoint).
- Worker test: enqueue `budgeting:variance-refresh` for a disabled tenant; verify the processor returns success without writing to `VarianceCache`.

---

## Acceptance

- [ ] All 10 admin/staff budgeting controllers gated with `@ModuleEnabled('budgeting')` + `ModuleEnabledGuard` at class level. Static-analysis test from impl 07 passes (zero violations).
- [ ] `shareable-links.public.controller.ts` remains ungated with the explicit doc comment.
- [ ] All 4 worker processors have the Pattern B check.
- [ ] Frontend nav entries for budgeting under the Finance hub annotated with `moduleKey: 'budgeting'`.
- [ ] Module-gating leakage tests pass for `budgeting`.
- [ ] Public shareable-link viewer test confirms 200 for a valid token even when `budgeting` is disabled.
- [ ] Smoke test on NHQS:
  - Toggle `budgeting` off via the admin console (or the existing toggle endpoint) → admin loses /finance/budgeting/\* access; existing financial models + scenarios remain in DB.
  - Trigger a board-pack render via the API → 404 (gated).
  - Hit a previously-issued shareable link → still works (public viewer ungated).
  - Toggle back on → access restored within 60s; variance-refresh resumes on next cron tick.
- [ ] IMPLEMENTATION_LOG.md updated: impl 23 marked ✅ with the commit SHA(s), CI run link, and any surprising findings noted.

---

## Notes

- This spec is a STRAIGHT TEMPLATE COPY of impl 12 (admissions) and impl 19 (school_closures). The work is mechanical: add the decorator + guard to 10 controllers, the Pattern B check to 4 processors, the moduleKey annotation to the nav config, and the test scaffold to the leakage spec. Estimated effort: 2-3 hours.
- The reason this gap existed: my original W3 specs (12-17) covered the modules with the highest-risk surfaces or cleanest split needs (admissions, gradebook, finance, homework, scheduling, compliance). Budgeting got registered in the canonical list but no dedicated enforcement spec was written. The static-analysis test (impl 07) only flags "decorated but no guard" — it does NOT flag "module in registry, no controllers gated." This is a class of gap worth a follow-up: a CI-time check that every key in `MODULE_REGISTRY` is referenced by at least one `@ModuleEnabled('<key>')` somewhere in the codebase. Out of scope for impl 23 itself; flagged here for later consideration.
- After impl 23 ships, total enforcement waves are W2 + W3 + W4 = the canonical 20 modules all properly gated. Console work (Session 3E in particular) can rely on the toggle being honest end-to-end for every module in the registry.
- The audit log for the rollout (per impl 21 migration runbook) should be updated with a one-line note recording when impl 23 brought budgeting into parity. The existing `module_gating.system_rolled_out` audit row was inserted before impl 23 shipped, so its `modules_snapshot` correctly recorded `budgeting=true` (default) but the enforcement was incomplete. A new audit row is not necessary; a comment in the runbook is sufficient.
