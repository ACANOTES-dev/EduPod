# Stage 4 — CP-SAT model: soft preferences and scoring

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 3 is `complete` and Stage 4 is `pending`.

## Purpose

Stage 3 finds a schedule with 0 hard violations. Stage 4 finds a **good** schedule — one that honours teacher preferences, spreads subjects evenly across the week, minimises teacher gaps, maximises room consistency, balances workload across staff, and balances break-duty supervision. The CP-SAT model gains an objective function, soft-weight penalties, and the output gains populated `quality_metrics`.

## Prerequisites

- **Stage 3 complete.** Hard-constraint model works and produces valid schedules.

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline (a CI run takes ~3 hours and would stall the migration).
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage is **local only** — no server deploy, no lock required.

---

## Scope — every soft signal to model

Re-read `packages/shared/src/scheduler/solver-v2.ts` scoring section and `SolverInputV2.settings.global_soft_weights` + `SolverSettingsV2.preference_weights`. Each is an objective-function contribution.

### Global soft weights (per-tenant settings)

1. **`even_subject_spread`** — penalise clusters of the same subject on consecutive days for the same class. Reward even distribution across Mon–Fri.
2. **`minimise_teacher_gaps`** — penalise "free period sandwiched between teaching periods" for a teacher within a single day.
3. **`room_consistency`** — for a `(class, subject)` pair placed N times in the week, reward using the same room across all placements.
4. **`workload_balance`** — minimise variance of `total_periods_per_teacher` across the staff.
5. **`break_duty_balance`** — minimise variance of supervision count across teachers eligible for supervision.

### Teacher-level preferences (per-teacher, priority-weighted)

Each `TeacherInputV2.preferences[]` entry has:

- `preference_type`: one of `preferred_time`, `avoid_time`, `preferred_room`, `avoid_room`, `preferred_subject_slot`, `no_back_to_back`, `prefer_morning`, `prefer_afternoon`
- `preference_payload`: JSON specific to the type
- `priority`: `low | medium | high` → weight multiplier from `settings.preference_weights`

Translate each preference type into a CP-SAT soft term weighted by `preference_weights[priority] * <global prefs weight>`.

### Curriculum soft signals

- `CurriculumEntry.preferred_periods_per_week` — if set, reward hitting this number rather than the `min_periods_per_week` baseline. `max(min, preferred)` is the upper envelope; the objective prefers getting closer to `preferred`.
- `CurriculumEntry.preferred_room_id` — already treated as soft in the legacy solver (see Stage 3 note). Soft reward if assigned, zero otherwise.

### Supervision assignment (if present in input)

- Each break slot with `supervision_mode = "supervised"` needs N supervisors where `N = break_group.required_supervisor_count`.
- Supervisor selection is an assignment problem; assign teachers minimising `break_duty_balance` variance.

## Modelling approach

CP-SAT maximises an objective function (linear combination of variables, possibly with indicator variables bridging logical conditions to numeric penalties). Build the objective as the sum of the contributions below.

### Objective = sum of weighted soft terms, minus penalties

```python
objective_terms = []

# Teacher gap penalty — for each teacher, each day, count gaps
for teacher in teachers:
    for weekday in weekdays:
        gap_var = model.NewIntVar(0, max_gaps, f"gap_{teacher.id}_{weekday}")
        # Reify gap_var = number of periods that are "free but sandwiched"
        # (see OR-Tools conditional_intervals example for the pattern)
        objective_terms.append(-settings.minimise_teacher_gaps * gap_var)

# Even subject spread — penalise clustering
for (class_id, subject_id) in class_subject_pairs:
    placements_per_day = [sum(x[class_id, subject_id, p] for p in periods if p.weekday == d)
                          for d in weekdays]
    # Penalty: max(placements_per_day) - min(placements_per_day)
    max_var = model.NewIntVar(0, 5, "max")
    min_var = model.NewIntVar(0, 5, "min")
    model.AddMaxEquality(max_var, placements_per_day)
    model.AddMinEquality(min_var, placements_per_day)
    objective_terms.append(-settings.even_subject_spread * (max_var - min_var))

# ... continue for every soft signal

model.Maximize(sum(objective_terms))
```

### Weight scale

Legacy scoring uses integer weights where `preference_weights.high = 5, medium = 3, low = 1` and global weights default to 1. CP-SAT is happier with integer coefficients (bounds propagation works better) so keep the scale integer. If you need fractional weights, multiply all terms by 100 and scale back when reporting the score.

### Solve modes

- **Feasibility only** (Stage 3) — `solver.Solve(model)` returns first feasible.
- **Optimise** (Stage 4) — `solver.Solve(model)` keeps searching within the time budget, returning the best found.
- `solver.parameters.num_search_workers = 4` for parallel portfolio search (if the sidecar has the cores; Stage 5 benchmarks).

## SolverQualityMetrics — populate on output

Stage 3 returned `quality_metrics: null`. Stage 4 populates it with:

```python
class SolverQualityMetrics(BaseModel):
    teacher_gap_index: float      # avg gaps per teacher-day
    day_distribution_variance: float   # variance of period counts per day per class
    preference_breakdown: dict[str, int]   # count of honoured preferences per type
    room_consistency_ratio: float  # 0-1, fraction of (class,subject) that used a single room
    workload_std: float            # stdev of periods-per-week across teachers
```

## File layout additions

```
src/solver_py/solver/
├── model.py                    (unchanged)
├── variables.py                (unchanged)
├── hard_constraints.py         (unchanged)
├── soft_constraints.py         (NEW — objective-term builders)
├── objective.py                (NEW — assembles + weights the objective)
├── quality_metrics.py          (NEW — post-solve metrics computation)
└── solve.py                    (updated: call soft_constraints + quality_metrics)
```

## Non-goals for this stage

- **Do not** expose new settings fields beyond what's in `SolverSettingsV2` already.
- **Do not** rewrite hard constraints.
- **Do not** touch the TS worker. Stage 6.

## Step-by-step

1. Study the legacy scoring code in `solver-v2.ts` — function by function. Each scoring contribution becomes a soft-constraint function in `soft_constraints.py`. Preserve the semantic, not the implementation.
2. Build `soft_constraints.py`: one function per soft signal, returns a list of objective-term tuples `(coefficient, variable_or_expression)`.
3. Build `objective.py`: assembles every soft term weighted appropriately, calls `model.Maximize(sum)`.
4. Build `quality_metrics.py`: given a solver result, compute every field of `SolverQualityMetrics` and attach to `SolverOutputV2`.
5. Extend `solve.py` to call soft_constraints and quality_metrics.
6. Add pytest — for each soft signal, a fixture where the only distinguishing factor is that signal. Assert the solver picks the higher-scoring option.
7. Performance checkpoint: run the baseline fixture (from Stage 3 tier 2) with `solver.parameters.max_time_in_seconds = 30`. Solve should complete well inside 30s. If not, check variable count and consider tightening pruning.
8. Determinism check: run the same input twice with `solver.parameters.random_seed = 0` and `num_search_workers = 1`. Output must be byte-identical.
9. Run `ruff`, `mypy --strict`, `pytest` — all green.
10. Commit locally:

    ```
    feat(scheduling): cp-sat soft preferences + quality metrics

    Adds objective function combining even_subject_spread, minimise_teacher_gaps,
    room_consistency, workload_balance, break_duty_balance, per-teacher
    preferences, and preferred-period-count signals. Weights drawn from
    tenant settings.preference_weights + settings.global_soft_weights.
    SolverOutputV2.quality_metrics populated with gap_index, day_variance,
    preference_breakdown, room_consistency_ratio, workload_std. Determinism
    verified under fixed seed + single worker.

    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
    ```

## Testing requirements

- Per-soft-signal fixture test: changing only that signal changes the chosen solution.
- Determinism test: identical seed → identical output.
- Quality metrics sanity test: known-input → known-metrics values.
- Regression: all hard-constraint tests from Stage 3 still pass.

## Acceptance criteria

- [ ] Every soft signal from the list is modelled and weighted.
- [ ] `quality_metrics` populated on every response.
- [ ] Determinism verified (identical seed → identical output).
- [ ] Solve duration on baseline fixture: p50 < 10s on a 4-core dev machine.
- [ ] `ruff`, `mypy --strict`, pytest all green.
- [ ] Local commit created.
- [ ] Completion entry appended with solve-time measurements.

## If something goes wrong

- **Objective is too complex, solver times out without converging:** the most common cause is too-large integer bounds on soft penalty vars. Tighten the upper bounds (`NewIntVar(0, reasonable_max, ...)`) and re-run.
- **Non-determinism despite fixed seed:** confirm `num_search_workers = 1`. Parallel portfolio search is inherently non-deterministic. Single worker loses some speed but gains reproducibility — production default should be 1.
- **Soft signals pull in opposite directions, solver picks a dominated schedule:** check weight scale. If `minimise_teacher_gaps` weight is 100× `even_subject_spread`, the solver will sacrifice spread entirely. Document chosen weights in the completion entry.

## What the completion entry should include

- Objective function structure (pseudocode summary).
- Soft-term coefficient table (signal → weight formula).
- Baseline fixture solve duration and quality-metric values.
- Any weight-tuning decisions and rationale.
- Commit SHA.
