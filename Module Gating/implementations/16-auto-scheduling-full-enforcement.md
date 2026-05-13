# Implementation 16 — Auto-Scheduling Full Enforcement

> **Phase:** 3 — Wave W3
> **Wave:** W3 (largest single-module surface in this wave; touches solver + sidecar + 13 controllers)
> **Depends on:** W1 (01–08)
> **Deploys:** API restart + worker restart + web rebuild
> **Model:** Opus 4.7 / **Max effort** (CSP solver + cp-sat sidecar coordination + cover cascade)

---

## Goal

Wire `@ModuleEnabled('auto_scheduling')` enforcement across the auto-scheduling surface — 13 controllers across `apps/api/src/modules/scheduling/` + `apps/api/src/modules/scheduling-runs/`, the SolverV2Processor + ExamSolverProcessor + SchedulingStaleReaperProcessor in the worker, and frontend nav for the scheduling hub + sub-routes. After this ships, toggling `auto_scheduling` off prevents new solver runs, hides the scheduling UI, and skips the stale-reaper cron for that tenant.

---

## Critical safety constraints

- **Read-side timetables stay accessible.** The `schedules/` module (separate from `scheduling/`) handles student/staff timetable READ. Schedules is core. Disabling `auto_scheduling` should NOT hide a teacher's "my timetable" view. Verify that `schedules` module controllers are unaffected by this spec.
- **In-flight solver run** (a job already running on the cp-sat sidecar): we do not kill it. The job completes; the resulting `SchedulingRun` row is created. The admin can't view the run (UI gated) but the data exists. Re-enable restores visibility.
- **Cover cascade** (when `leave` triggers a substitution request → `auto_scheduling`'s ai-substitution.service.ts) — when `auto_scheduling` is disabled, leave can still be approved but the cover suggestion is empty. This is acceptable; documented as a depends_on hint in the registry.
- **`scheduling-public.controller.ts`** — published timetables for students/parents to view. Stays UNGATED so families can still see their child's timetable when scheduling admin features are disabled. Add doc comment.

---

## Files to modify

### Controllers (add `@ModuleEnabled('auto_scheduling')` + `ModuleEnabledGuard`)

All 12 admin scheduling controllers under `apps/api/src/modules/scheduling/` and `scheduling-runs/`:

- `scheduling-enhanced.controller.ts`
- `exam-scheduling-v2.controller.ts`
- `scheduler-orchestration.controller.ts`
- `scheduler-validation.controller.ts`
- `break-groups.controller.ts`
- `curriculum-requirements.controller.ts`
- `substitute-competencies.controller.ts`
- `teacher-competencies.controller.ts`
- `teacher-scheduling-config.controller.ts`
- `room-closures.controller.ts`
- `scheduling-dashboard.controller.ts`
- `scheduling-runs.controller.ts`

### Controller — remain ungated (public-published timetables)

- `apps/api/src/modules/scheduling/scheduling-public.controller.ts` — add doc comment: `// PUBLIC-FACING: published timetables for students/parents. Intentionally ungated. Disabling auto_scheduling hides the admin scheduler UI but does NOT hide already-published timetables that families need to read daily.`

### Worker processors (Pattern B)

- `apps/worker/src/processors/scheduling/solver-v2.processor.ts` (SolverV2Processor) — Pattern B at top of process(). If disabled, log + ack as success (do NOT mark the run as failed; that would be misleading).
- `apps/worker/src/processors/scheduling/exam-solver.processor.ts` (ExamSolverProcessor) — same.
- `apps/worker/src/processors/scheduling/stale-reaper.processor.ts` (or wherever SCHEDULING_REAP_STALE_JOB lives) — Pattern B; if disabled, the reaper skips this tenant's stale runs.
- `apps/api/src/modules/scheduling/ai-substitution.service.ts` — ALREADY gated by impl 11 (under `ai_functions`); ALSO add `@ModuleEnabled('auto_scheduling')` upstream check. Layered: both `auto_scheduling` AND `ai_functions` must be on for AI substitution to fire.

### Frontend — nav annotations

- `nav.scheduling` (and sub-entries: `/scheduling`, `/scheduling/auto`, `/scheduling/exam-schedules`, `/scheduling/dashboard`, `/scheduling/period-grid`, `/scheduling/curriculum`, `/scheduling/requirements`, `/scheduling/break-groups`, `/scheduling/teacher-config`, `/scheduling/cover-reports`, `/scheduling/room-closures`, `/scheduling/preferences`) → `moduleKey: 'auto_scheduling'`
- Staff/teacher views: `/scheduling/my-timetable`, `/scheduling/my-satisfaction` — DO NOT annotate if these read from the `schedules` module (which is core). Verify which module owns the route. If they're scheduling-module routes, gate them; if they're schedules-module read-side, leave them ungated.

### Tests

- Un-skip `auto_scheduling` block in `module-gating-leakage.e2e-spec.ts`. Probes:
  - `GET /api/v1/scheduling/dashboard` → 404 MODULE_DISABLED
  - `POST /api/v1/scheduling-runs` → 404 MODULE_DISABLED
  - `GET /api/v1/scheduling/public/timetable/:classId` → 200 (public; not gated)
- Worker test: trigger a solver job for a disabled tenant; verify silent return + ack; no `SchedulingRun` row created (or one created with status `skipped` — pick one and document).

---

## Acceptance

- [ ] All 12 admin scheduling controllers gated. Static-analysis test passes.
- [ ] `scheduling-public.controller.ts` remains ungated with explicit doc comment.
- [ ] SolverV2Processor + ExamSolverProcessor + StaleReaper gated with Pattern B.
- [ ] AI substitution service has both `auto_scheduling` and `ai_functions` checks.
- [ ] Frontend nav annotations applied; "my timetable" view (read from `schedules` module) confirmed unaffected.
- [ ] Module-gating leakage tests pass for `auto_scheduling`.
- [ ] Smoke test on NHQS: toggle off → admin can't open scheduler; teachers/parents can still see published timetables; trigger a solver run via API → 404. Toggle back on → access restored, solver works on next user trigger.
- [ ] cp-sat sidecar logs are clean — no failed connection attempts because no jobs are dispatched when disabled.

---

## Notes

- The `schedules` (read-side) vs `scheduling` (compute-side) split matters here. Verify by reading the module structure: `schedules` provides student/staff timetable READS that everyone needs; `scheduling` provides the auto-scheduler that admin uses to GENERATE timetables. Only the latter is gated.
- The cp-sat sidecar (`SOLVER_PY_URL` per the architecture docs) is unaware of tenant module state. It just receives solver inputs from the worker. When disabled, the worker's Pattern B check ensures no inputs reach the sidecar.
- Cover reporting + leave-driven cover requests: when `auto_scheduling` is off, `leave` (impl 18) can still record approved leave but the cover suggestion automation is unavailable. Cover assignments fall back to manual.
- This spec is the second-largest in W3 by surface area (gradebook is first). Allocate ~1 day.
