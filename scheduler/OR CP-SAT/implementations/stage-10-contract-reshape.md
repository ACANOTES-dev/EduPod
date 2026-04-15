# Stage 10 — Contract reshape (SolverInputV2 / SolverOutputV2 → CP-SAT-native)

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 9 is `complete` (full stress re-run green) and Stage 10 is `pending`.

## Purpose

`SolverInputV2` and `SolverOutputV2` were designed around the hand-rolled TypeScript solver's internals: variable-per-class-subject generation, curriculum "min_periods_per_week" framing, `unassigned[]` with human-readable `reason` strings, `overrides_applied[]` audit arrays bolted on for SCHED-023, `quality_metrics` added in SCHED-026. None of that is wrong but it's legacy scar tissue; CP-SAT models the problem differently and the contract should reflect that.

This stage reshapes the JSON contract to be **CP-SAT-native** — structured around decision variables, domains, and objective terms — and propagates the new shape through the sidecar's pydantic models, the TypeScript client, the worker's `result_json` persistence, the API endpoints that return run results, the frontend run-detail page, and the apply flow.

**This is a deliberate contract break.** Downstream consumers of `result_json` will need to be updated in lockstep. That's the whole point: clean the interface once the migration has proven out.

## Prerequisites

- **Stage 9 complete.** Full stress re-run green on CP-SAT. All SCHED-### solver bugs closed or explicitly accepted.
- Decision made on the target shape — see "Design choices" below.

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline (a CI run takes ~3 hours and would stall the migration).
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage ends with a **sidecar redeploy** (new v3 endpoint alongside v2). Lock is required for that step.

---

## Design choices to make before coding

The following decisions shape every other file. Commit to them before writing pydantic models.

### 1. Decision-variable shape

Option A — **"assignment rows"**: `output.entries[]` is an array of `{ class_id, subject_id, period_index, teacher_id, room_id }` tuples. Today's shape, minimally changed. Consumers barely have to adjust.

Option B — **"assignment matrix"**: output is a sparse 3D map `entries[period_index][class_id] = { subject_id, teacher_id, room_id }`. Closer to CP-SAT's native variable shape; faster lookup when rendering a timetable by period.

**Recommendation:** stay with Option A for output; add a derived matrix view as a secondary API if the UI needs it.

### 2. Period encoding

Today: `{ weekday, period_order }` pairs. CP-SAT natively works with integer slot indices. Convert at the contract boundary or inside the sidecar?

**Recommendation:** the contract carries integer `period_index`, and a parallel `period_slots[]` list maps `index → { weekday, period_order, start_time, end_time, period_type }`. Simpler to model; single source of truth for the grid.

### 3. Demand specification

Today: `CurriculumEntry { min_periods_per_week, max_periods_per_day, requires_double_period, double_period_count, preferred_periods_per_week, ... }` — a mix of hard and soft signals in one struct.

CP-SAT-native: split into **hard demand** (`periods_per_week`, `max_per_day`, `required_doubles`) and **preferences** (`preferred_periods_per_week`, `preferred_room_id`). The hard side is what the model must satisfy; the preference side is what goes into the objective.

**Recommendation:** split. Introduces explicit `demand[]` and `preferences[]` arrays.

### 4. Unassigned representation

Today: `unassigned[]` array of `{ year_group_id, subject_id, class_id, periods_remaining, reason }`.

CP-SAT's natural shape: the sidecar returns `{ solve_status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'MODEL_INVALID' | 'UNKNOWN' }` plus, if feasible, a full assignment. "Unassigned" only exists when the curriculum is over-demanded relative to supply.

**Recommendation:** the new output carries a `solve_status` enum; `unassigned[]` stays (admins want to see exactly what didn't fit) but it's populated only when status is `FEASIBLE` with incomplete demand.

### 5. Quality metrics

Today: `quality_metrics.{ teacher_gap_index, day_distribution_variance, preference_breakdown, ... }`.

CP-SAT-native: add the **objective-value breakdown** — for each objective term, the weight, the achieved penalty/reward, and the bound. That gives admins actionable feedback: "the schedule lost 40 points on teacher_gap_minimisation — try widening teacher availability."

**Recommendation:** keep current metrics + add `objective_breakdown[] { term_name, weight, contribution, best_possible }`.

### 6. Overrides audit

Today: `overrides_applied[]` added in SCHED-023. This is specifically about class-subject overrides.

**Recommendation:** rename to `constraint_snapshot` and generalise. It becomes a record of every non-default modelling decision the orchestration layer made — class-subject overrides, pin inclusion, break-group supervision resolution, etc. Useful for admin-visible "why is the schedule this way" reports.

## Scope — what changes

### A. Define the new contract types

New file: `packages/shared/src/scheduler/types-v3.ts`. Keep `types-v2.ts` untouched for now — Stage 11 is when `assembleSolverInput` emits v3 and we delete v2.

```typescript
export type PeriodIndex = number; // 0..N, mapped via period_slots

export interface PeriodSlotV3 {
  index: PeriodIndex;
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  period_type: PeriodType;
  supervision_mode: SupervisionMode;
  break_group_id: string | null;
}

export interface DemandV3 {
  class_id: string;
  subject_id: string;
  periods_per_week: number;
  max_per_day: number | null;
  required_doubles: number;
}

export interface PreferencesV3 {
  class_preferences: Array<{
    class_id: string;
    subject_id: string;
    preferred_periods_per_week: number | null;
    preferred_room_id: string | null;
  }>;
  teacher_preferences: Array<TeacherPreferenceV3>;
  global_weights: GlobalSoftWeightsV3;
}

export interface SolverInputV3 {
  period_slots: PeriodSlotV3[];
  classes: ClassV3[];
  subjects: SubjectV3[];
  teachers: TeacherV3[];
  rooms: RoomV3[];
  room_closures: RoomClosureV3[];
  break_groups: BreakGroupV3[];
  demand: DemandV3[];
  preferences: PreferencesV3;
  pinned: PinnedAssignmentV3[];
  student_overlaps: StudentOverlapV3[];
  settings: SolverSettingsV3;
  constraint_snapshot: ConstraintSnapshotEntry[];
}

export type SolveStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'MODEL_INVALID' | 'UNKNOWN';

export interface SolverOutputV3 {
  solve_status: SolveStatus;
  entries: AssignmentV3[];
  unassigned: UnassignedDemandV3[];
  quality_metrics: QualityMetricsV3;
  objective_breakdown: ObjectiveBreakdownEntry[];
  hard_violations: number;
  soft_score: number;
  soft_max_score: number;
  duration_ms: number;
  constraint_snapshot: ConstraintSnapshotEntry[];
}
```

Complete every field before moving on. Review against the current v2 to ensure nothing semantic is lost.

### B. Mirror pydantic models on the sidecar

`apps/solver-py/src/solver_py/schema/v3/` — new submodule. Mirror every v3 type. Keep `schema/input.py` + `schema/output.py` (v2 versions) around for this stage; the sidecar supports **both** during Stage 10's transition window.

### C. Sidecar: accept both v2 and v3

Add content negotiation: the client sends `Accept: application/vnd.edupod.solver+json; version=3`. The sidecar branches on the version header and returns the matching shape. v2 clients still work, v3 clients get the new shape.

Alternative: different URL paths — `/solve` (v2, to be deprecated) and `/v3/solve` (v3). Simpler than content negotiation; recommend this unless you have a reason otherwise.

### D. Client: new `solveViaCpSatV3`

`packages/shared/src/scheduler/cp-sat-client.ts` gains a new function `solveViaCpSatV3(input: SolverInputV3): Promise<SolverOutputV3>`. Legacy `solveViaCpSat` stays until Stage 11 switches the worker over.

### E. Worker: temporarily carry both code paths

The worker's `processJob` calls the legacy `solveViaCpSat` during Stage 10 rollout. After Stage 10 proves out, switch to `solveViaCpSatV3`. During this stage we're only introducing the new path; we don't yet use it in the worker.

### F. Downstream consumers of `result_json`

Every consumer of `scheduling_runs.result_json` needs to either continue reading v2 (until Stage 11) or be updated to read v3 via a version field. List:

- `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/page.tsx` — run detail UI.
- `scheduler-orchestration.service.applyRun` — writes `result_json.entries` to the `schedules` table.
- `scheduling-runs.controller` — exposes `result_json` via GET `/v1/scheduling/runs/:id`.
- Any analytics queries that read `result_json` fields.

**Approach:** tag every persisted run with a `result_schema_version` field (`'v2'` or `'v3'`). Consumers branch on that. When Stage 11 is done and no more v2 runs are being produced, we can strip the v2 path later.

### G. Tests

- Pydantic round-trip test for v3.
- TS contract test — fixture shared between the TS type definition and the pydantic model.
- Sidecar `/v3/solve` end-to-end test against the Stage 5 Tier 2 fixture.
- Worker unit tests: assert v2 path still works unchanged.
- Parity: v2 output → equivalent v3 output for the same input (semantic equivalence, not byte equality).

## Non-goals

- **Do not** change `assembleSolverInput` yet. Stage 11.
- **Do not** delete `types-v2.ts` or the v2 sidecar endpoint. Kept until Stage 11 switches the worker.
- **Do not** change DB schema. `scheduling_runs.result_json` stays JSONB; only the _shape_ it holds evolves. Tag version in the blob itself.

## Step-by-step

1. Review and lock the 6 design choices in the section above. Document decisions in the completion entry.
2. Write `packages/shared/src/scheduler/types-v3.ts` with every type fully defined.
3. Write `apps/solver-py/src/solver_py/schema/v3/` pydantic models mirroring types-v3.ts.
4. Add `/v3/solve` endpoint in the sidecar. Legacy `/solve` stays.
5. Build the CP-SAT model adaptation to v3 in `apps/solver-py/src/solver_py/solver/v3/` — mostly a translation of existing Stage 3+4 code to the new input shape.
6. Write `solveViaCpSatV3` in the client. Unit tests mirror `solveViaCpSat`'s.
7. Add `result_schema_version` tagging in the worker's write path. v2 runs tag `'v2'`; v3 runs tag `'v3'` (we'll start producing v3 in Stage 11).
8. Update `result_json` consumers to branch on the version tag. List is in Section F.
9. Parity test: v2 vs v3 output on the Tier 2 fixture, semantic equivalence asserted.
10. Full `turbo test` + sidecar `pytest` + `ruff` + `mypy` all clean.
11. Commit locally:

    ```
    feat(scheduling): cp-sat-native contract v3 (SolverInputV3 / SolverOutputV3)

    Introduces a cleaner version of the solver i/o contract designed around
    cp-sat natives: integer period indexes, split hard demand vs preferences,
    solve_status enum, objective_breakdown on output, generalised
    constraint_snapshot. Contract v2 remains for one more stage until stage
    11's assembleSolverInput rewrite emits v3.

    Sidecar serves both /solve (v2) and /v3/solve (v3). Worker still calls
    v2 path; stage 11 switches. result_json blob tagged with
    result_schema_version so downstream consumers branch safely.

    Design decisions in the stage-10 completion entry.

    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
    ```

12. Rsync v3 pydantic models + sidecar changes to prod. Rebuild sidecar, `pm2 restart solver-py`. No worker change required yet.
13. Smoke: `curl /v3/solve` with a v3 fixture, confirm 200 + expected shape.

## Testing requirements

- TS type-check clean on v3 types.
- Pydantic round-trip green.
- Sidecar serves both v2 and v3 without regression to v2 behaviour.
- Parity test: v2 and v3 produce semantically equivalent output on Tier 2.
- v2 consumers still work against v2 runs post-tagging.

## Acceptance criteria

- [ ] 6 design choices documented and resolved.
- [ ] `types-v3.ts` defined and exported.
- [ ] Sidecar pydantic v3 models defined; `/v3/solve` endpoint live.
- [ ] `solveViaCpSatV3` client function shipped with unit tests.
- [ ] `result_schema_version` tagging in worker's persist path; consumers branch on it.
- [ ] Parity (v2 vs v3) confirmed semantically equivalent on Tier 2.
- [ ] Full test suite green.
- [ ] Sidecar redeployed; both endpoints live.
- [ ] Local commit created.
- [ ] Completion entry appended with design-choice rationale.

## If something goes wrong

- **A design choice turns out wrong halfway through:** stop and re-plan. Better to restart the stage than to ship half a contract. The whole point of doing this in its own stage is to get the shape right.
- **Sidecar exposes both endpoints but v2 regresses:** isolate which pydantic model or solver translation broke v2. Don't ship Stage 10 with any v2 regression; Stage 11 can't start until v2 is clean at the sidecar.
- **Consumer update (step 8) misses a file:** `result_schema_version` defaults to `'v2'` for every run today, so consumers seeing an un-tagged blob treat it as v2. That's the safe default. Stage 11 will start tagging new runs as `'v3'`.

## What the completion entry should include

- The 6 design choices with rationale (one paragraph each).
- List of v3 types and pydantic models.
- List of consumers updated for versioned `result_json` + any left unresolved.
- Parity test evidence (v2 vs v3 on Tier 2).
- Commit SHA.
