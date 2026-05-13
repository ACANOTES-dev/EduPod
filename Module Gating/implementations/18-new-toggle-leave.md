# Implementation 18 — New Toggle: leave

> **Phase:** 4 — Wave W4 (new toggles)
> **Wave:** W4
> **Depends on:** W1 (01–08)
> **Deploys:** API restart + worker restart + web rebuild
> **Model:** Sonnet 4.6 (small surface; 2 controllers + frontend)

---

## Goal

Introduce `leave` as a brand-new gateable toggle. Wire `@ModuleEnabled('leave')` enforcement on the leave-requests controllers, frontend nav for leave management surfaces, and the seed/registry side. After this ships, an admin can disable leave for a tenant that handles leave manually outside the system.

---

## Critical safety constraints

- **`leave` IS already in the registry** (per impl 01). The migration backfill (impl 02) created `tenantModule` rows for every tenant with `default_enabled=true`. Existing tenants have leave on by default.
- **Cover cascade dependency**: when `leave` is enabled but `auto_scheduling` is disabled, an approved leave still creates a record but doesn't auto-trigger cover suggestions. Documented in the depends_on hint.
- **Payroll integration**: leave records affect payroll calculations (paid vs unpaid leave days). When `leave` is disabled mid-payroll-cycle, the payroll service falls back to all-days-present. Document this as expected behavior.

---

## Files to modify

### Controllers (add `@ModuleEnabled('leave')` + `ModuleEnabledGuard`)

- `apps/api/src/modules/leave/leave-requests.controller.ts` — class-level
- `apps/api/src/modules/leave/payroll-attendance.controller.ts` — class-level (this controller is in the leave module despite the name; gates with `leave`)

### Worker processors

- Verify whether the leave module has any cron processors. If yes (e.g., a daily approval-reminder), add Pattern B check.

### Frontend — nav annotations

- `nav.leave` (and sub-entries for staff leave management) → `moduleKey: 'leave'`
- `/settings/leave-types` → `moduleKey: 'leave'`
- `/scheduling/leave-requests` (the cross-module surface where scheduling shows leave-driven gaps) → `moduleKey: 'leave'`
- Parent portal staff leave view (if present) → `moduleKey: 'leave'`

### Tests

- Un-skip `leave` block in `module-gating-leakage.e2e-spec.ts`. Probes:
  - `GET /api/v1/leave/requests` → 404 MODULE_DISABLED when off
  - `POST /api/v1/leave/requests` → 404 MODULE_DISABLED when off
- Add cross-module integration test: with `leave` disabled, an admin attempting to mark staff absent via the payroll-attendance route gets 404. With `leave` enabled, the route works.

---

## Acceptance

- [ ] Both controllers gated. Static-analysis test passes.
- [ ] Frontend nav for `leave` annotated; `/scheduling/leave-requests` cross-module entry annotated.
- [ ] Module-gating leakage tests pass for `leave`.
- [ ] Smoke test on NHQS: toggle `leave` off → leave management hidden; staff cannot submit a request; existing approved leave records remain in DB. Toggle on → access restored; existing records visible.
- [ ] Verify cross-module behavior: with leave on + auto_scheduling off, an approved leave request creates the record but cover cascade doesn't fire (as expected per dependency hint).

---

## Notes

- `leave` is a small module today (2 controllers, ~14 endpoints, 3 tables). Implementation effort is ~2 hours.
- The payroll dependency means any tenant disabling leave mid-payroll-month will see a discrepancy in next payroll calc. Documented as expected; not a bug.
- The `cover.requested_for_leave` notification type is part of the leave module's notifications. When leave is disabled, no cover-request notifications are emitted (the trigger never fires).
