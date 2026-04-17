# Solver Performance 2026-04 — SCHED-041 Stage

Owner: Platform / Scheduling
Shipped: 2026-04-17
Status: ✅ Deployed to production, NHQS live-verified

---

## TL;DR

SCHED-041 reported "CP-SAT doesn't improve on greedy seed within the 3,600s
budget". Diagnostic telemetry (Phase A) proved the real problem was
different: **single-worker CP-SAT never finds a feasible solution at all**
on NHQS-scale input — it burns the entire budget in LP relaxation and the
user sees only the Python greedy fallback. The fix (Phase B) is one line:
`num_search_workers = 1` → `8`. Multi-worker CP-SAT uses its LNS strategies
(`graph_var_lns`, `graph_cst_lns`) with the greedy hint as starting point
and produces real improvements in under 60s.

Production verified on NHQS: 46 improvements, first feasible at 39.6s,
final objective beats greedy by ~31k points, 6 more placements than
greedy.

---

## Phase A — structured telemetry (commit `6cb15e90`)

Added `SolverDiagnosticsV3` Pydantic + TS schema, `SolverTelemetry` capture
class, `scheduling_runs.solver_diagnostics` JSONB column, and wired the
data pipeline end-to-end from OR-Tools' `CpSolver` internals → sidecar
V3 output → worker processor → DB.

Captured per solve:

- **Environment**: OR-Tools version, `num_search_workers`, `max_time_in_seconds`, `random_seed`.
- **Hint survival**: `placement_vars_count`, `placement_vars_hinted_to_1`, `greedy_placement_count`, `greedy_hint_score`.
- **Objective trajectory** (the SCHED-041 core signal):
  - `first_solution_objective` / `first_solution_wall_time_seconds` — when CP-SAT's first feasible arrived.
  - `improvements_found` — count of strictly-better objective ticks. `0` is the "never found a feasible" signature.
  - `final_objective_value` / `final_objective_bound` / `final_relative_gap`.
  - `cp_sat_improved_on_greedy` — whether the final objective beat the greedy hint.
- **Solver counters**: `num_booleans`, `num_branches`, `num_conflicts`, `num_binary_propagations`, `num_integer_propagations`, `num_restarts`, `num_lp_iterations`, wall/user/deterministic time.
- **Terminal state**: `termination_reason` (unified bucket — optimal / feasible_at_deadline / infeasible / model_invalid / unknown_at_deadline / cancelled / early_stop_stagnation / early_stop_gap), `solution_info` (CP-SAT's own label for the best solution's source).
- **Raw dump**: `response_stats_text` — CP-SAT's `response_stats()` multi-line dump, truncated to 16 KB.

Persistence: worker processor writes to `scheduling_runs.solver_diagnostics`
JSONB via Prisma (using `Prisma.DbNull` pattern). RLS inherited from the
existing `scheduling_runs_tenant_isolation` policy.

Mirror in `result_json.meta` + `cp_sat.solve_complete` log line so
operators can triage via `pm2 logs worker | grep cp_sat.solve_complete`
without needing to read the DB column.

---

## Phase A — what the telemetry revealed about NHQS

NHQS run on 2026-04-17 — 393 effective demand, 45,473 placement vars, 180s
budget, seed 42, `num_search_workers=1`:

```
improvements_found:          0
first_solution_objective:    None        ← solution callback never fired
first_solution_wall_time:    None
final_objective_value:       -11682      ← pre-solution bound artifact
final_relative_gap:          204.97      ← meaningless without a solution
termination_reason:          unknown_at_deadline
solve_status:                UNKNOWN
num_branches:                21,128
num_conflicts:               0           ← no backtracking — still in presolve
num_lp_iterations:           159,861     ← budget spent in LP
cp_sat_improved_on_greedy:   False       ← trivially — improved on nothing
```

The `386 placed` output that users saw was the Python greedy pre-solver's
work, surfaced via `_build_greedy_output` fallback when CP-SAT returns
`UNKNOWN`. CP-SAT itself contributed zero lessons.

The original bug-log hypothesis ("CP-SAT finds the greedy hint and then
plateaus") was incorrect. The real failure mode: CP-SAT never reaches
its conflict-driven search phase at all.

---

## Phase B — `num_search_workers` experiment matrix

Same NHQS input, same seed 42, same 180s budget. Three configurations:

| #            | `num_search_workers` | `repair_hint` | Outcome                                                                                                                                                                                                                                                                |
| ------------ | -------------------: | :-----------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A (baseline) |                    1 |     false     | `improvements_found=0`, termination=unknown_at_deadline. CP-SAT never reached feasibility.                                                                                                                                                                             |
| B            |                    8 |     false     | `improvements_found=53`, first feasible at **40.2s**, final **2,032,249** vs greedy 2,001,410, termination=feasible_at_deadline, relative_gap=0.148 (14.8%), 392 placed (+6 vs greedy), `solution_info=graph_var_lns [hint]`. **Satisfies SCHED-041 acceptance gate.** |
| C            |                    8 |     true      | **`std::bad_function_call` crash at 115s.** CP-SAT 9.15 bug, validates the prior code comment. Unsafe.                                                                                                                                                                 |

Config B shipped as Phase B fix (commit `dc839a2b`).

### Why single-worker fails where multi-worker succeeds

CP-SAT's solve strategies run as parallel workers when `num_search_workers

> 1`. In particular the Large Neighbourhood Search (LNS) workers —
`graph_var_lns`, `graph_cst_lns`, `rnd_var_lns`, etc. — take the greedy
hint as their starting neighbourhood and improve it incrementally.
Single-worker doesn't run LNS; it runs `fixed_search` + the LP relaxation,
> which on this problem shape means the LP never gets far enough for
> feasibility.

The 180s sidecar budget covers only ~160k LP iterations on a 45k-variable
model in single-worker mode — roughly two full LP relaxations. Nowhere
near enough for feasibility. With 8 workers, LNS workers produce their
first feasible in under 60s because they are starting from the greedy
hint, not from scratch.

---

## Phase B — benchmark matrix

### Realistic baseline (Tier-2 proxy, ~260 lessons, 15s budget)

| Metric                     |           workers=1 |            workers=8 |
| -------------------------- | ------------------: | -------------------: |
| Placed                     |                 252 |                  252 |
| Wall time                  |               15.2s |                16.9s |
| Termination                | unknown_at_deadline | feasible_at_deadline |
| `improvements_found`       |                   0 |                    5 |
| `first_solution_wall_time` |                None |                12.0s |
| `num_lp_iterations`        |              12,780 |                    0 |
| Solution source            |                   — | `rnd_cst_lns [hint]` |

Single-worker fails to find feasibility even at Tier-2 scale. Multi-worker
overshoots deadline by 1.7s (~11%) — acceptable margin.

### Tier-4 Irish-secondary fixture (~1100 lessons, 60s budget)

| Metric               |           workers=1 |           workers=8 |
| -------------------- | ------------------: | ------------------: |
| Placed               |                1100 |                1100 |
| Wall time            |               63.7s |               64.5s |
| Termination          | unknown_at_deadline | unknown_at_deadline |
| `improvements_found` |                   0 |                   0 |
| `num_branches`       |               6,617 |               2,806 |
| `num_lp_iterations`  |              53,960 |               7,110 |

Neither config reaches feasibility in 60s on Tier-4 — expected given the
10× scale relative to NHQS. Multi-worker doesn't regress placement;
longer budgets (300-600s) would be needed to see LNS improvements at
this scale. Larger tenants should provision budget ≥ 600s.

### NHQS production — Phase B verification (180s budget, seed 42)

| Metric                      |   workers=1 (pre-fix) |                      workers=8 (shipped) |
| --------------------------- | --------------------: | ---------------------------------------: |
| Placed                      | 386 (greedy fallback) |                             **392** (+6) |
| `improvements_found`        |                     0 |                                   **46** |
| `first_solution_wall_time`  |                  None |                                **39.6s** |
| `final_objective_value`     |               −11,682 |                            **2,032,239** |
| `final_relative_gap`        |                204.97 |                                **0.251** |
| `cp_sat_improved_on_greedy` |                 False |                                 **True** |
| Termination                 |   unknown_at_deadline |                 **feasible_at_deadline** |
| Solution source             |                     — | `graph_cst_lns [hint]` ∥ `graph_var_lns` |

All SCHED-041 acceptance criteria met. Full SolverDiagnosticsV3 persisted
to `scheduling_runs.solver_diagnostics` column for every run.

---

## Tunable values chosen

| Setting                             |                 Value | Rationale                                                                                                                                                     |
| ----------------------------------- | --------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `num_search_workers`                |                 **8** | Config B — escapes single-worker LP trap, produces LNS improvements, satisfies acceptance gate. Tier-4 shows no regression.                                   |
| `repair_hint`                       |             **false** | Config C crashed CP-SAT 9.15 (`std::bad_function_call`). Safe to revisit on OR-Tools upgrade.                                                                 |
| `interleave_search`                 |   **false** (default) | Prior "4-7× deadline overshoot" finding was with this on. Off keeps the budget honest.                                                                        |
| `CP_SAT_NUM_SEARCH_WORKERS` env var |       **unset** (→ 8) | Per-deployment override to fall back to 1 if a tenant blows the pm2 `max_memory_restart` ceiling. Not currently needed.                                       |
| Early-stop gap threshold            | **0.001** (unchanged) | Existing Stage 9.5.1 callback. Original brief proposed loosening to 5% — unnecessary; Config B runs the full budget because the achievable gap is still >14%. |

---

## Memory budget note

The Stage 10 OOM finding ("Tier-5 OOM at `num_search_workers > 1`") was
measured with `interleave_search=true`. Plain `num_search_workers=8` (as
shipped here) has not been re-measured at Tier-5. The pm2
`max_memory_restart = 7G` ceiling gives headroom; Tier-5 tenants don't
exist yet on production.

If Tier-5 onboarding happens and memory becomes an issue, set
`CP_SAT_NUM_SEARCH_WORKERS=4` (or `1`) per-deployment via the sidecar's
env block in `ecosystem.config.cjs`. The source change lands cleanly
without a new deploy of the source tree.

---

## Non-goals / dropped from scope

- **Lexicographic objective restructuring** — the original bug-log proposal.
  Dropped: the telemetry shows CP-SAT IS improving on the weighted-sum
  objective (46 improvements / 14.8% gap at deadline on NHQS). Objective
  shape isn't the bottleneck. Filed as future work if we want to close
  from 14.8% → 2-3%.
- **Early-exit at 95% of best known bound** — dropped. Existing 0.1% gap
  callback works correctly; Config B ran full budget because gap is 14.8%.
  Loosening to 5% would trim runs but isn't gating for the bug.
- **Tier-5 memory audit under `num_search_workers=8`** — deferred until a
  Tier-5 tenant onboards. Per-deployment env override is the containment.

---

## How to reproduce

### Local (realistic fixture)

```bash
cd apps/solver-py
source .venv/bin/activate
python scripts/benchmark_sched_041_phase_b.py --fixture realistic --budget 15 --seed 42
```

Exit code is 0 on success, 2 if workers=8 regresses placement below workers=1.

### Production (sidecar direct)

```bash
# Get most recent config_snapshot from scheduling_runs
psql "$DATABASE_MIGRATE_URL" -Atc \
  "SELECT config_snapshot FROM scheduling_runs WHERE tenant_id = '<tenant_uuid>' \
   ORDER BY created_at DESC LIMIT 1" > /tmp/input_v3.json

# Patch the budget + seed for reproducibility
python3 -c "
import json
d = json.load(open('/tmp/input_v3.json'))
d['settings']['max_solver_duration_seconds'] = 180
d['settings']['solver_seed'] = 42
json.dump(d, open('/tmp/input_v3_180s.json', 'w'))
"

# POST to sidecar
curl -sS -X POST http://127.0.0.1:5557/v3/solve \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: solver-perf-repro' \
  -d @/tmp/input_v3_180s.json > /tmp/result.json

# Inspect the diagnostics
python3 -c "
import json
d = json.load(open('/tmp/result.json'))
diag = d['solver_diagnostics']
print('termination:', diag['termination_reason'])
print('improvements:', diag['improvements_found'])
print('improved_on_greedy:', diag['cp_sat_improved_on_greedy'])
print('first_feasible_at:', diag['first_solution_wall_time_seconds'], 's')
print('solution_info:', diag['solution_info'])
"
```

### Admin UI path (end-to-end via worker)

Currently requires the feasibility-preview gate (`c9ec9395`) to pass.
NHQS and stress-a currently trip the gate on curriculum/capacity
mismatch (SCHED-039/040). Once those data issues are resolved, the
normal auto-run flow writes the full `solver_diagnostics` column via
the worker processor.

---

## Architecture touchpoints

- `apps/solver-py/src/solver_py/solver/solve.py` — one-line fix + comment.
- `apps/solver-py/src/solver_py/config.py` — new `CP_SAT_NUM_SEARCH_WORKERS` env var.
- `apps/solver-py/src/solver_py/solver/telemetry.py` (new) — `SolverTelemetry` capture.
- `apps/solver-py/src/solver_py/schema/v3/output.py` — `SolverDiagnosticsV3` Pydantic.
- `apps/solver-py/src/solver_py/schema/v3/adapters.py` — pass diagnostics through V2→V3.
- `apps/solver-py/src/solver_py/main.py` — instantiate telemetry in `/v3/solve`.
- `apps/solver-py/tests/test_solver_diagnostics.py` (new) — 10 tests covering telemetry, adapter round-trip, termination mapping, multi-worker regression guard.
- `apps/solver-py/tests/test_{early_stop,cancel,solve_feasible}.py` — monkey-patch workers=1 for determinism invariants.
- `apps/solver-py/scripts/benchmark_sched_041_phase_b.py` (new) — A/B benchmark harness.
- `packages/shared/src/scheduler/types-v3.ts` — `SolverDiagnosticsV3` + `TerminationReasonV3` mirror.
- `packages/prisma/schema.prisma` + migration `20260417100000_add_solver_diagnostics_to_scheduling_runs` — new JSONB column.
- `apps/worker/src/processors/scheduling/solver-v2.processor.ts` — persist solver_diagnostics, mirror key signals into `result_json.meta` and `cp_sat.solve_complete` log.

---

## References

- Original bug: `E2E/5_operations/Scheduling/BUG-LOG.md` entry SCHED-041.
- Phase A commit: `6cb15e90 feat(scheduling): sched-041 §a — cp-sat solver telemetry instrumentation`.
- Phase B commit: `dc839a2b fix(scheduling): sched-041 §b — enable multi-worker cp-sat (num_search_workers=8)`.
- OR-Tools version: `9.15.6755` (pinned in `apps/solver-py/requirements.txt`).
