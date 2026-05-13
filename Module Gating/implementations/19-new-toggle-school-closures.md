# Implementation 19 — New Toggle: school_closures

> **Phase:** 4 — Wave W4
> **Wave:** W4
> **Depends on:** W1 (01–08)
> **Deploys:** API restart + web rebuild (no worker changes)
> **Model:** Sonnet 4.6 (smallest spec in the initiative; 1 controller + frontend)

---

## Goal

Introduce `school_closures` as a brand-new gateable toggle. Wire `@ModuleEnabled('school_closures')` enforcement on the closures controller and frontend nav for the closures management page. After this ships, an admin can disable closures management for a tenant that handles holiday calendars outside the system — but previously-set closures still affect scheduling/attendance reads.

---

## Critical safety constraints

- **Disabling the toggle hides the UI but does NOT change behaviour of services that READ closures.** SchedulingService, AttendanceService, FinanceService all read `SchoolClosure` rows when computing per-day operations. Those services continue to honour previously-set closures. Only the management UI is hidden.
- **`school_closures` is already in the registry** (per impl 01); migration backfill provisioned rows.
- **No worker processors** for school_closures itself. Other modules (scheduling, attendance) are the consumers; their existing processors work the same.

---

## Files to modify

### Controllers (add `@ModuleEnabled('school_closures')` + `ModuleEnabledGuard`)

- `apps/api/src/modules/school-closures/school-closures.controller.ts` — class-level

### Frontend — nav annotations

- `/settings/school-closures` (and any sub-routes for adding/editing closures) → `moduleKey: 'school_closures'`

### Tests

- Un-skip `school_closures` block in `module-gating-leakage.e2e-spec.ts`. Probes:
  - `GET /api/v1/school-closures` → 404 MODULE_DISABLED when off
  - `POST /api/v1/school-closures` → 404 MODULE_DISABLED when off
- Cross-module integration test: with `school_closures` disabled, an existing SchoolClosure row is still honoured by the scheduling-runs processor (verify via a unit test or manual check).

---

## Acceptance

- [ ] Controller gated. Static-analysis test passes.
- [ ] Frontend nav annotated.
- [ ] Module-gating leakage tests pass for `school_closures`.
- [ ] Smoke test on NHQS: toggle `school_closures` off → settings page hidden; existing closures (e.g., next public holiday) still honoured by scheduling. Toggle on → access restored.
- [ ] Documented behavior: disabling does NOT delete or hide existing closures from downstream consumers.

---

## Notes

- This is the smallest spec in the entire initiative (~1 hour of work).
- The "downstream consumers still honor existing closures" behavior is the right call. Otherwise disabling closures would be a risky operation — you'd suddenly start scheduling classes on holidays. Better to make the toggle just hide the management UI.
- If a tenant wants to fully clear closures + disable the module, they can: clear via UI first (while toggle is on), then disable. Two steps; explicit. Documented in the operations runbook (impl 08).
