# Stage 3 — CP-SAT model: hard constraints

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 2 is `complete` and Stage 3 is `pending`.

## Purpose

Translate every hard constraint from the legacy solver into an OR-Tools CP-SAT model. When this stage finishes, `POST /solve` accepts a `SolverInputV2`, builds a CP-SAT model, calls `solver.Solve()`, and returns a `SolverOutputV2` whose `entries` contain a valid placement with **0 hard violations** (or returns a clear UNSAT response if the problem is infeasible). Soft preferences and scoring come in Stage 4 — for now everything is unweighted feasibility.

## Prerequisites

- **Stage 2 complete.** Contract + pydantic models exist. `/solve` parses input cleanly.
- External reading (do before coding): the OR-Tools CP-SAT Python primer at `developers.google.com/optimization/cp/cp_solver` and the employee-scheduling example in the OR-Tools GitHub repo. Timetabling is a "disjunctive scheduling + assignment" hybrid; know the pattern before you model.

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline (a CI run takes ~3 hours and would stall the migration).
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage is **local only** — no server deploy, no lock required.

---

## Scope — every hard constraint to honour

Re-read `packages/shared/src/scheduler/constraints-v2.ts` line by line. Each of the constraints below must be enforced in CP-SAT. Missing any one is a Stage 3 failure.

1. **Teacher no double-booking** — a teacher cannot be assigned to two different (class, period) cells at the same (weekday, period_order).
2. **Class no double-booking** — a class cannot be in two different lessons at the same (weekday, period_order).
3. **Room no double-booking (exclusive rooms)** — a room flagged `is_exclusive=true` cannot host two different (class, period) cells at the same time. Non-exclusive rooms have no such constraint.
4. **Room-type matching** — if `CurriculumEntry.required_room_type` is set, every assigned room for that entry must match.
5. **Preferred room honour (hard)** — if `CurriculumEntry.preferred_room_id` is set and the room is free in the required time slot, the solver must use it. If not free, fall back to room-type matching. (NB: current legacy solver treats this as soft; for parity, keep it soft. **Re-check with the product in Stage 5 before making it hard.**)
6. **Teacher competency** — only teachers whose `competencies[]` contain a matching `(subject_id, year_group_id)` (and either `class_id = null` pool or `class_id = <exact>` pin) may teach that entry.
7. **Teacher availability windows** — a teacher assigned to `(weekday, period_order)` must have an `availability[]` entry covering that slot.
8. **Teacher max_periods_per_week / max_periods_per_day** — when set, a teacher's assignments must respect the caps.
9. **Curriculum demand** — for each `(class, subject)` pair, the number of lessons placed must equal `CurriculumEntry.min_periods_per_week`. If the entry has `class_id != null` (SCHED-023 override), that override supersedes the year-group baseline for only that class.
10. **Max periods per day per subject** — `CurriculumEntry.max_periods_per_day` bounds how many lessons of the same subject land on the same weekday for a given class.
11. **Double-period requirement** — if `requires_double_period=true` with `double_period_count=N`, the solver must place N double-periods (two consecutive teaching slots on the same day with the same teacher and same room). SCHED-024 rules apply: isolated singletons of a double-required subject are invalid.
12. **Pinned entries are immovable** — every `PinnedEntryV2` is fixed at its `(weekday, period_order, class_id, subject_id, teacher_staff_id, room_id)`. The solver cannot move them.
13. **Break groups** — periods whose `period_type = "break"` are not teaching slots. Supervision slots with `supervision_mode = "supervised"` must have a supervising teacher assigned (separate decision from teaching assignments; Stage 4 handles supervision optimisation).
14. **Room closures** — a room cannot host any lesson on a date that falls within a closure window. In the weekly-template model, translate closures into per-(weekday, period_order) blocked-room sets for the date range.
15. **Period type must be `teaching`** — assignments only land on slots where `period_type = "teaching"`.
16. **Class-subject override (SCHED-023)** — if a `CurriculumEntry` has `class_id` set, the year-group baseline entry for that same `(year_group, subject)` is ignored for that specific class. Already enforced in `domain-v2.ts` variable generation; the CP-SAT model must replicate.
17. **Archived teachers (SCHED-028)** — teachers with `employment_status != 'active'` are already filtered out in `assembleSolverInput` before the input reaches the sidecar, so CP-SAT doesn't need to re-check. Verify input fixtures don't include archived staff.

## Modelling approach (reference sketch)

The natural CP-SAT variable set for timetabling is:

```
x[c, s, p, t, r] ∈ {0, 1}
```

where:

- `c` = class_id
- `s` = subject_id
- `p` = period slot (weekday, period_order) — encoded as an int index
- `t` = teacher_staff_id
- `r` = room_id

`x = 1` means "class `c` has subject `s` taught by teacher `t` in room `r` at period `p`."

That's a 5-dimensional boolean space, which for realistic sizes (10 classes × 10 subjects × 40 periods × 30 teachers × 25 rooms) = 3M variables. Too many. **Prune aggressively:**

- Only enumerate `(c, s)` pairs that appear in the curriculum.
- For each `(c, s)` pair, only enumerate `t` values from competent teachers for that pair.
- For each `(c, s, t)` triple, only enumerate `r` values matching the room type (or unrestricted if no type required).
- Only enumerate `p` values where the slot is a teaching period and the teacher is available.

After pruning, the variable count for the realistic baseline is typically 30k–80k, well within CP-SAT's comfort zone.

Alternative cleaner shape (recommended — see OR-Tools `shift_scheduling_sat.py`):

```
teaches[c, s, p] = IntVar(0, num_teachers)    # 0 = unassigned, teacher idx otherwise
uses_room[c, s, p] = IntVar(0, num_rooms)
```

with `AllDifferentExcept0` per-period per-teacher, plus element constraints for teacher competency. Fewer variables, uses CP-SAT's native integer inference. Decide which shape in the first day of this stage and document it in the completion entry.

## File layout inside `apps/solver-py/`

```
src/solver_py/
├── main.py                     (unchanged from Stage 2; /solve now calls solve())
├── config.py                   (unchanged)
├── schema/                     (unchanged from Stage 2)
└── solver/
    ├── __init__.py
    ├── model.py                 (builds the CP-SAT CpModel from SolverInputV2)
    ├── variables.py             (pruned variable enumeration)
    ├── hard_constraints.py      (every hard constraint listed above)
    ├── solve.py                 (orchestrator: build model, solve, serialise output)
    └── pruning.py               (helpers to compute legal (c,s,t,r,p) tuples)
```

## Non-goals for this stage

- **Do not** implement soft preference scoring, workload balancing, teacher gap minimisation, subject spread, or room consistency. Stage 4.
- **Do not** emit `quality_metrics` in output. Emit `null`. Stage 4.
- **Do not** touch the TS worker. Stage 6.
- **Do not** optimise for speed beyond the pruning. Speed tuning is Stage 4/5.

## Step-by-step

1. Pick the variable shape (5D boolean vs. 3D integer) — document the tradeoff.
2. Implement `pruning.py` — given `SolverInputV2`, produce sets of legal assignments. Verify pruning with pytest: the minimal fixture from Stage 2 should produce a small, finite set of legal tuples.
3. Implement `variables.py` — instantiate CP-SAT `BoolVar` (or `IntVar`) for each legal tuple.
4. Implement `hard_constraints.py` — add one constraint function per item 1–16 above. Each takes the `CpModel` + variable map + input, mutates the model. Each has a pytest.
5. Implement `solve.py` — the orchestrator. Builds the model, calls `solver.Solve()`, translates back to `SolverOutputV2`. Handles `OPTIMAL` / `FEASIBLE` / `INFEASIBLE` / `UNKNOWN` / `MODEL_INVALID` statuses.
6. Wire `main.py` `/solve` handler to call `solve()`. Replace the 501 with a real 200 + `SolverOutputV2`.
7. Add timeout handling — `solver.parameters.max_time_in_seconds = input.settings.max_solver_duration_seconds`. If the solver hits the timeout and produced no feasible solution, return `SolverOutputV2` with empty `entries`, all demand in `unassigned`, status logged.
8. Add determinism — `solver.parameters.random_seed = input.settings.solver_seed or 0`. Single worker thread (`num_search_workers = 1`) during dev; Stage 5 tunes this.
9. Pytest: build 5 progressively harder fixtures (start from `solver_input_minimal.json`, add classes / teachers / conflicts) and assert:
   - Every returned `SolverAssignmentV2` is a member of the pre-computed legal set.
   - No teacher is double-booked across returned assignments.
   - No class is double-booked.
   - No exclusive room is double-booked.
   - `validateSchedule` (call the TS one via the parity test setup in Stage 5 — here just reproduce its logic in Python) reports 0 hard violations.
   - If the input is deliberately infeasible (e.g. only one teacher competent for 10 classes at the same time), the output lists everything in `unassigned` with `reason` populated and `status_code` reflects UNSAT-like behaviour.
10. Run `ruff`, `mypy --strict`, `pytest` — all green.
11. Commit locally:

    ```
    feat(scheduling): cp-sat hard-constraint model for solver sidecar

    Models every hard constraint from constraints-v2.ts in OR-Tools CP-SAT:
    teacher / class / exclusive-room no-overlap, competency, availability,
    max-per-week/day, curriculum demand, max-per-day-per-subject, double-
    period, pinned entries, room closures, class-subject overrides. Variable
    shape: <5d bool|3d int — document choice>. /solve now returns
    SolverOutputV2 with 0 hard violations on feasible inputs and empty
    entries + populated unassigned on infeasible inputs. Quality metrics
    and soft scoring land in stage 4.

    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
    ```

## Testing requirements

### Unit (pytest)

- 5+ fixture inputs across difficulty tiers:
  - minimal (1 class, 1 subject, 1 teacher, 4 periods) — must produce full placement.
  - two-class same subject override (from class-subject-override.test.ts) — Y1-A 5 periods, Y1-B 3 periods.
  - conflict (2 teachers, both competent, 1 must be assigned) — any solution valid.
  - room-type constrained (science requires lab, 1 lab available) — must use the lab.
  - infeasible (over-demand) — must return unassigned with reason.
- Per-constraint unit tests in `tests/test_hard_*.py`.

### Property-based (optional but recommended)

- Hypothesis or custom generators producing random legal inputs; assert every returned assignment is legal.

### Manual

- `curl -X POST localhost:5557/solve -d @tests/fixtures/two_class_override.json | jq .entries | length` — should return expected count.

## Acceptance criteria

- [ ] All hard constraints from the list are implemented.
- [ ] Pytest green across all fixture tiers.
- [ ] Infeasible inputs return a clean `unassigned`-populated response, not an exception.
- [ ] `solver.parameters.max_time_in_seconds` is honoured.
- [ ] `solver.parameters.random_seed` produces identical output across two consecutive runs on the same input.
- [ ] `ruff` + `mypy --strict` clean.
- [ ] Local commit created.
- [ ] Completion entry appended with variable-shape choice and per-fixture solve durations.

## If something goes wrong

- **Model is infeasible for a fixture you believe should be feasible:** re-check pruning. Most commonly a `(c, s)` pair has zero legal teachers because of an off-by-one in competency matching.
- **Solver returns UNKNOWN after hitting time limit:** expected behaviour on large inputs at this stage. Stage 4 adds presolve tuning and Stage 5 benchmarks.
- **Pinned entries conflict with each other in the input:** validate before passing to CP-SAT (SCHED-019 era check) and return 400 before modelling. Pinned-vs-pinned double-booking is a data bug, not a solver bug.
- **Double-period constraint explodes variable count:** model as auxiliary IntVars `num_double_periods[c, s] >= double_period_count` using a helper that reifies "two consecutive same-teacher same-room placements." See OR-Tools `scheduling_with_transitions.py` for the pattern.

## What the completion entry should include

- Variable shape chosen (5D bool vs 3D int) with rationale.
- Variable count on the minimal fixture and on the baseline fixture.
- Solve duration (median of 5 runs) on each fixture tier.
- Which constraints required non-obvious modelling (log the pattern for the next reader).
- Commit SHA.
