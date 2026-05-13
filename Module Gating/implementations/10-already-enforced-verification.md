# Implementation 10 — Already-Enforced Verification (pastoral, behaviour, sen, staff_wellbeing)

> **Phase:** 2 — Wave W2
> **Wave:** W2
> **Depends on:** W1 (01–08)
> **Deploys:** Web rebuild (nav annotations); no API behaviour change
> **Model:** Sonnet 4.6 acceptable

---

## Goal

Four modules (`pastoral`, `behaviour`, `sen`, `staff_wellbeing`) already have full API-level enforcement (every controller decorated, every guard wired). What they don't have is frontend nav-level filtering: the nav still renders entries that 404 when clicked. This spec adds the `moduleKey` annotations and verifies that the existing API enforcement is genuinely complete (no surprise ungated controller hiding).

After this ships, the four modules are "ship-ready for the admin console" — toggling them off via the API hides their nav entries within 60s, blocks their endpoints with 404 MODULE_DISABLED, and leaves no orphan code paths.

---

## Critical safety constraints

- **No API code changes unless verification reveals a missing decorator.** This is a verification + frontend spec. If a controller is found that should have `@ModuleEnabled` but doesn't, document it and add it; otherwise leave the API alone.
- **Frontend nav additions are additive.** No existing nav entries are removed or renamed.
- **Smoke test on NHQS for each module** before marking the spec shipped. NHQS is the test tenant; we can toggle modules on/off without harm.

---

## Files to modify

### Verification (read-only sweep)

For each of the 4 modules:

- `ls apps/api/src/modules/<module>/` and confirm every `*.controller.ts` (excluding `*.spec.ts`) has `@ModuleEnabled('<key>')` AND `ModuleEnabledGuard` in `@UseGuards`.
- The static-analysis test from impl 07 should already catch any miss; running it locally confirms.

### Frontend nav annotations (the actual work)

Find `apps/web/src/components/morph-shell/nav-config.ts` (or the equivalent — check the redesign per `docs/plans/ux-redesign-final-spec.md`). For each nav entry pointing into one of the 4 modules, add `moduleKey: '<key>'`:

- `nav.pastoral` (and any pastoral sub-entries: cases, concerns, critical-incidents, referrals, sst, checkins, interventions, reports, etc.) → `moduleKey: 'pastoral'`
- `nav.behaviour` (and sub-entries: incidents, students, tasks, sanctions, exclusions, appeals, amendments, admin, analytics, alerts, guardian-restrictions) → `moduleKey: 'behaviour'`
- `nav.sen` and `nav.senParent` → `moduleKey: 'sen'`
- `nav.wellbeing` (the wellbeing hub itself + sub-entries: dashboard, my-workload, surveys, staff, resources, reports, settings) → `moduleKey: 'staff_wellbeing'`. NOTE: the wellbeing hub also surfaces `early_warning` data on dashboard cards — those cards stay visible regardless of `staff_wellbeing` because `early_warning` is its own module. Use `<IfModuleEnabled module="staff_wellbeing">` around staff_wellbeing-specific content if mixed.

### Tests — un-skip in leakage spec

In `apps/api/test/module-gating-leakage.e2e-spec.ts`, un-skip the four `it.skip` blocks for `pastoral`, `behaviour`, `sen`, `staff_wellbeing`. Verify all pass.

In `apps/web/src/__tests__/module-gating/nav-filter.spec.tsx`, un-skip the four corresponding tests.

---

## Acceptance

- [ ] All controllers under `apps/api/src/modules/{pastoral,behaviour,sen,staff-wellbeing}/` confirmed to have `@ModuleEnabled` + `ModuleEnabledGuard`. Static-analysis test passes (zero violations).
- [ ] `nav.pastoral`, `nav.behaviour`, `nav.sen`, `nav.senParent`, `nav.wellbeing` (and all sub-entries) annotated with the correct `moduleKey`.
- [ ] Module-gating leakage tests pass for all 4 modules (un-skipped + green).
- [ ] Frontend nav filter test passes for all 4 modules.
- [ ] Smoke test on NHQS for each module:
  - Toggle module off via API.
  - Within 60s (per impl 06 polling), the corresponding nav entries disappear from the morph-shell.
  - Direct navigation to a module URL (e.g. `/school/pastoral/cases`) redirects to the disabled landing page with a toast.
  - Toggle back on; nav reappears within 60s; deep links work again.

---

## Notes

- The four modules are the simplest cases — they're already enforced. The work is mostly verification + adding the nav annotations the new system requires.
- Wellbeing hub deserves attention: it aggregates content from multiple modules (`staff_wellbeing` survey data, `early_warning` risk scores, `pastoral` aggregates). The hub itself should be visible if ANY of these are enabled; per-card visibility is via `<IfModuleEnabled>`. Don't gate the hub on `staff_wellbeing` exclusively or you'll hide the wellbeing entry point for tenants using `early_warning` only.
- This spec is the smallest of W2 (~3-4 hour effort). Use it to flush out any missing pieces of the W1 foundation before tackling the bigger waves.
