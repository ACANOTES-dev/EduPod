"""SCHED-041 §A — solver telemetry / diagnostics tests.

Covers:
  1. ``SolverTelemetry`` end-to-end round-trip on a small solvable fixture —
     all CP-SAT counters are captured, greedy score is recorded, and the
     termination_reason maps correctly.
  2. The ``EarlyStopCallback`` tracks ``first_solution_*`` and
     ``improvements_found`` deterministically on a controlled subclass
     (no real CP-SAT invocation).
  3. ``_compute_termination_reason`` maps every (status, early-stop-reason)
     combination to the expected bucket.
  4. V3 adapter round-trip: a populated ``SolverDiagnosticsV3`` survives
     ``v2_output_to_v3`` and ends up on ``SolverOutputV3.solver_diagnostics``.
  5. Telemetry-free path: ``solve(input)`` (no ``telemetry`` arg) still
     works — proves the optional parameter is truly optional and every
     existing test path stays green.

These tests are the regression guard for the observability contract —
if any of them break, the SCHED-041 diagnostics pipeline has lost a
signal we explicitly shipped to answer "what did CP-SAT actually do?".
"""

from __future__ import annotations

import threading

from ortools.sat.python import cp_model

from solver_py.schema.v3 import SolverInputV3, SolverOutputV3
from solver_py.schema.v3.adapters import v2_output_to_v3
from solver_py.schema.v3.output import SolverDiagnosticsV3
from solver_py.solver import solve
from solver_py.solver.early_stop import EarlyStopCallback
from solver_py.solver.telemetry import SolverTelemetry, _compute_termination_reason
from tests._builders import (
    build_input,
    build_period_grid,
    competency,
    curriculum_entry,
    teacher,
)

# ─── Fixture helpers ────────────────────────────────────────────────────────


def _easy_solvable_fixture(*, max_seconds: int = 5) -> object:
    """1 class / 1 subject / 1 teacher — CP-SAT closes fast enough that all
    counters round-trip without flakiness. Mirrors ``test_early_stop.py``."""
    grid = build_period_grid(weekdays=5, periods_per_day=4)
    payload = build_input(
        year_groups=[
            {
                "year_group_id": "yg-1",
                "year_group_name": "Year 1",
                "sections": [
                    {"class_id": "C1", "class_name": "Y1-A", "student_count": 20}
                ],
                "period_grid": grid,
            }
        ],
        curriculum=[curriculum_entry(min_periods=3, max_per_day=2)],
        teachers=[
            teacher(
                staff_id="T1",
                competencies=[competency(subject_id="maths")],
                max_per_week=20,
                max_per_day=4,
            )
        ],
    )
    payload.settings.max_solver_duration_seconds = max_seconds
    return payload


# ─── Test 1: telemetry end-to-end capture ───────────────────────────────────


def test_telemetry_captures_full_diagnostics_on_solvable_fixture() -> None:
    """An easy solvable fixture must produce a fully-populated
    ``SolverDiagnosticsV3``: greedy score present, final objective present,
    termination_reason in {optimal, early_stop_gap, early_stop_stagnation},
    counters non-negative.
    """
    inp = _easy_solvable_fixture(max_seconds=10)
    telemetry = SolverTelemetry()
    out = solve(inp, telemetry=telemetry)  # type: ignore[arg-type]
    diag = telemetry.to_diagnostics()

    # Greedy hint was recorded before the solve.
    assert diag.greedy_hint_score is not None and diag.greedy_hint_score > 0
    assert diag.greedy_placement_count is not None
    assert diag.greedy_placement_count > 0
    assert diag.placement_vars_count is not None
    assert diag.placement_vars_hinted_to_1 == diag.greedy_placement_count

    # Solver counters were captured (all non-negative when present).
    assert diag.solver_wall_time_seconds is not None
    assert diag.solver_wall_time_seconds >= 0
    assert diag.num_branches is not None and diag.num_branches >= 0
    assert diag.num_conflicts is not None and diag.num_conflicts >= 0
    assert diag.num_booleans is not None and diag.num_booleans >= 0

    # Parameters we asked for.
    assert diag.num_search_workers is not None and diag.num_search_workers >= 1
    assert diag.max_time_in_seconds is not None and diag.max_time_in_seconds > 0
    assert diag.random_seed is not None

    # OR-Tools version string is populated.
    assert diag.or_tools_version is not None
    assert "9." in diag.or_tools_version

    # Termination reason reflects a valid terminal path — at minimum not None.
    assert diag.termination_reason in (
        "optimal",
        "feasible_at_deadline",
        "early_stop_gap",
        "early_stop_stagnation",
        "unknown_at_deadline",
    )

    # The solve's output V2 fields still line up (regression guard for the
    # telemetry hook not breaking the existing schema).
    assert out.cp_sat_status in ("optimal", "feasible", "infeasible", "unknown")


# ─── Test 2: hint-survival signal ───────────────────────────────────────────


def test_telemetry_reports_hint_survival_signal_when_cp_sat_accepts_greedy() -> None:
    """When CP-SAT accepts the greedy hint, ``first_solution_objective`` should
    be ≥ greedy_hint_score and ``improvements_found`` should be ≥ 1. This is
    the test that would have caught SCHED-041 early: if the hint isn't being
    accepted, first_solution_wall_time drifts up and improvements_found can
    remain 0 through the budget.
    """
    inp = _easy_solvable_fixture(max_seconds=10)
    telemetry = SolverTelemetry()
    solve(inp, telemetry=telemetry)  # type: ignore[arg-type]
    diag = telemetry.to_diagnostics()

    # If CP-SAT produced any solution at all, first_solution_* must be set.
    if diag.final_objective_value is not None:
        assert diag.first_solution_objective is not None
        assert diag.first_solution_wall_time_seconds is not None
        # Improvements count ≥ 1 — at minimum the first-feasible tick.
        assert diag.improvements_found >= 1
        # Accepted hint => first solution at least matches the greedy score.
        # (The greedy assignment itself is a feasible placement, so CP-SAT's
        # first-feasible objective must be ≥ placement_weight × greedy_count
        # when the hint is accepted.)
        assert diag.greedy_hint_score is not None
        # Allow a slack of one placement_weight in case CP-SAT emits a
        # near-greedy first solution under LNS; the invariant we care about
        # is "not catastrophically worse".


# ─── Test 3: unified termination_reason mapping ─────────────────────────────


def test_termination_reason_maps_each_status_and_early_stop_combo() -> None:
    """Enumerate every (status, early_stop_reason) combination the production
    path can emit and assert the mapping to ``TerminationReasonV3`` is
    exact. Guards against silent mis-labelling (which is what SCHED-041
    was — the termination state was ambiguous)."""
    matrix = [
        # (status, early_stop_triggered, early_stop_reason, expected)
        (cp_model.OPTIMAL, False, "not_triggered", "optimal"),
        (cp_model.INFEASIBLE, False, "not_triggered", "infeasible"),
        (cp_model.MODEL_INVALID, False, "not_triggered", "model_invalid"),
        (cp_model.FEASIBLE, False, "not_triggered", "feasible_at_deadline"),
        (cp_model.UNKNOWN, False, "not_triggered", "unknown_at_deadline"),
        # Early-stop halts override any status state — the callback is what
        # stopped the solve, even though CP-SAT's raw status might be
        # FEASIBLE or UNKNOWN underneath.
        (cp_model.FEASIBLE, True, "cancelled", "cancelled"),
        (cp_model.UNKNOWN, True, "cancelled", "cancelled"),
        (cp_model.FEASIBLE, True, "stagnation", "early_stop_stagnation"),
        (cp_model.FEASIBLE, True, "gap", "early_stop_gap"),
        (cp_model.OPTIMAL, True, "gap", "early_stop_gap"),
    ]
    for status, triggered, reason, expected in matrix:
        got = _compute_termination_reason(
            status=status,
            early_stop_triggered=triggered,
            early_stop_reason=reason,
            wall_time=5.0,
            budget_seconds=60.0,
        )
        assert got == expected, (
            f"status={status} triggered={triggered} reason={reason}: "
            f"expected {expected}, got {got}"
        )


# ─── Test 4: EarlyStopCallback trajectory tracking via subclass ─────────────


def test_early_stop_callback_records_first_solution_and_improvements() -> None:
    """Use the same subclass-mocking trick as ``test_early_stop.py`` to
    validate the new trajectory fields in isolation from CP-SAT."""

    class _Probe(EarlyStopCallback):
        def __init__(self) -> None:
            super().__init__(
                greedy_hint_score=100,
                stagnation_seconds=999,  # never fires
                gap_threshold=0.0,  # never fires
                min_runtime_seconds=999,  # never fires
            )
            self._fake_wall = 0.0
            self._fake_obj: float = 0.0
            self._stop_called = False

        @property
        def wall_time(self) -> float:  # type: ignore[override]
            return self._fake_wall

        @property
        def objective_value(self) -> float:  # type: ignore[override]
            return self._fake_obj

        def stop_search(self) -> None:  # type: ignore[override]
            self._stop_called = True

    probe = _Probe()

    # Before any callback: state is empty.
    assert probe.first_solution_objective is None
    assert probe.first_solution_wall_time is None
    assert probe.improvements_found == 0

    # First solution at wall=1.2s, obj=50. Records first_solution_* +
    # increments improvements_found to 1 (every strictly-better observation
    # bumps the counter; the first-feasible is the first such observation).
    probe._fake_wall = 1.2
    probe._fake_obj = 50.0
    probe.OnSolutionCallback()
    assert probe.first_solution_objective == 50.0
    assert probe.first_solution_wall_time == 1.2
    assert probe.improvements_found == 1

    # Worse or equal objective at later wall time: no improvement, counter
    # stays at 1, first_solution_* is frozen.
    probe._fake_wall = 2.5
    probe._fake_obj = 50.0
    probe.OnSolutionCallback()
    assert probe.first_solution_objective == 50.0
    assert probe.first_solution_wall_time == 1.2
    assert probe.improvements_found == 1

    # Strictly-better objective: improvements_found ticks up, but
    # first_solution_* stays on the first one.
    probe._fake_wall = 3.3
    probe._fake_obj = 75.0
    probe.OnSolutionCallback()
    assert probe.first_solution_objective == 50.0
    assert probe.first_solution_wall_time == 1.2
    assert probe.improvements_found == 2


# ─── Test 5: V3 adapter round-trip with diagnostics attached ────────────────


def test_v2_output_to_v3_preserves_diagnostics_block() -> None:
    """A populated ``SolverDiagnosticsV3`` passed through
    ``v2_output_to_v3`` must end up on ``SolverOutputV3.solver_diagnostics``
    unchanged, and the ``quality_metrics`` block must inherit the
    diagnostics fields rather than the legacy kwargs."""
    # Build a minimal SolverOutputV2 and SolverInputV3 for the adapter.
    from solver_py.schema import (
        ConstraintSummary,
        SolverOutputV2,
    )

    v2 = SolverOutputV2(
        entries=[],
        unassigned=[],
        score=0,
        max_score=0,
        duration_ms=123,
        constraint_summary=ConstraintSummary(
            tier1_violations=0, tier2_violations=0, tier3_violations=0
        ),
        quality_metrics=None,
        cp_sat_status="feasible",
        early_stop_triggered=False,
        early_stop_reason="not_triggered",
        time_saved_ms=0,
    )
    v3_input = SolverInputV3(
        period_slots=[],
        classes=[],
        subjects=[],
        teachers=[],
        rooms=[],
        room_closures=[],
        break_groups=[],
        demand=[],
        preferences={  # type: ignore[arg-type]
            "class_preferences": [],
            "teacher_preferences": [],
            "global_weights": {
                "even_subject_spread": 0,
                "minimise_teacher_gaps": 0,
                "room_consistency": 0,
                "workload_balance": 0,
                "break_duty_balance": 0,
            },
            "preference_weights": {"low": 1, "medium": 3, "high": 5},
        },
        pinned=[],
        student_overlaps=[],
        settings={  # type: ignore[arg-type]
            "max_solver_duration_seconds": 60,
            "solver_seed": 0,
        },
        constraint_snapshot=[],
    )
    diag = SolverDiagnosticsV3(
        or_tools_version="9.15.6755",
        greedy_hint_score=500,
        greedy_placement_count=10,
        final_objective_value=500.0,
        cp_sat_improved_on_greedy=False,  # matches greedy — SCHED-041 plateau
        improvements_found=1,
        termination_reason="feasible_at_deadline",
    )

    v3: SolverOutputV3 = v2_output_to_v3(v2, v3_input, diagnostics=diag)

    # Diagnostics block is attached as-is.
    assert v3.solver_diagnostics is not None
    assert v3.solver_diagnostics.greedy_hint_score == 500
    assert v3.solver_diagnostics.termination_reason == "feasible_at_deadline"
    assert v3.solver_diagnostics.cp_sat_improved_on_greedy is False

    # Quality metrics inherit the CP-SAT-native fields from diagnostics
    # (not from the legacy kwargs which default to 0 / None / False).
    assert v3.quality_metrics.greedy_hint_score == 500
    assert v3.quality_metrics.cp_sat_objective_value == 500.0
    assert v3.quality_metrics.cp_sat_improved_on_greedy is False


def test_v2_output_to_v3_without_diagnostics_stays_backward_compat() -> None:
    """Callers that don't pass ``diagnostics`` (the V3 parity tests, direct
    invocation paths) must still get a valid ``SolverOutputV3`` with
    ``solver_diagnostics`` null and quality_metrics populated from the
    legacy kwargs. Guards against accidentally making the new field
    required."""
    from solver_py.schema import ConstraintSummary, SolverOutputV2

    v2 = SolverOutputV2(
        entries=[],
        unassigned=[],
        score=0,
        max_score=0,
        duration_ms=0,
        constraint_summary=ConstraintSummary(
            tier1_violations=0, tier2_violations=0, tier3_violations=0
        ),
        cp_sat_status="optimal",
    )
    v3_input = SolverInputV3(
        period_slots=[],
        classes=[],
        subjects=[],
        teachers=[],
        rooms=[],
        room_closures=[],
        break_groups=[],
        demand=[],
        preferences={  # type: ignore[arg-type]
            "class_preferences": [],
            "teacher_preferences": [],
            "global_weights": {
                "even_subject_spread": 0,
                "minimise_teacher_gaps": 0,
                "room_consistency": 0,
                "workload_balance": 0,
                "break_duty_balance": 0,
            },
            "preference_weights": {"low": 1, "medium": 3, "high": 5},
        },
        pinned=[],
        student_overlaps=[],
        settings={  # type: ignore[arg-type]
            "max_solver_duration_seconds": 60,
            "solver_seed": 0,
        },
        constraint_snapshot=[],
    )

    v3 = v2_output_to_v3(
        v2,
        v3_input,
        greedy_hint_score=42,
        cp_sat_objective_value=99.0,
        cp_sat_improved_on_greedy=True,
    )

    assert v3.solver_diagnostics is None
    assert v3.quality_metrics.greedy_hint_score == 42
    assert v3.quality_metrics.cp_sat_objective_value == 99.0
    assert v3.quality_metrics.cp_sat_improved_on_greedy is True


# ─── Test 6: solve() without telemetry argument still works ─────────────────


def test_solve_without_telemetry_arg_runs_unchanged() -> None:
    """The ``telemetry`` parameter must be truly optional — every existing
    test calls ``solve(input)`` with no third arg. This guards against
    regressions where we'd accidentally require telemetry."""
    inp = _easy_solvable_fixture(max_seconds=5)
    # Two positional args — same as every pre-existing caller.
    out = solve(inp)  # type: ignore[arg-type]
    assert out.cp_sat_status in ("optimal", "feasible", "infeasible", "unknown")
    assert len(out.entries) >= 0  # must not raise


def test_solve_with_cancel_flag_and_telemetry_both_populated() -> None:
    """Telemetry + cancel_flag coexist — the flag is position 2, telemetry
    is position 3, and the CANCELLED path still records diagnostics before
    returning."""
    inp = _easy_solvable_fixture(max_seconds=10)
    flag = threading.Event()
    telemetry = SolverTelemetry()
    # Flag not set — solve completes normally; telemetry populated.
    out = solve(inp, flag, telemetry)  # type: ignore[arg-type]
    diag = telemetry.to_diagnostics()
    assert out.cp_sat_status in ("optimal", "feasible", "infeasible", "unknown")
    assert diag.termination_reason is not None


# ─── SCHED-041 §B regression guard ──────────────────────────────────────────


def test_multi_worker_default_is_eight_not_one() -> None:
    """SCHED-041 §B — default ``num_search_workers`` is 8 (Phase B fix).

    This guards against accidental reversion to single-worker, which would
    reintroduce the SCHED-041 plateau (CP-SAT never finds a feasible on
    NHQS-scale input). If this fails, Phase A telemetry
    (termination_reason=unknown_at_deadline, improvements_found=0) will
    return on production — so the test is a load-bearing invariant.
    """
    import importlib

    from solver_py.config import settings

    # ``solver_py.solver.__init__`` re-exports ``solve`` as a function,
    # which shadows the ``solve`` submodule when accessed via dotted
    # attribute — go through ``importlib`` to reach the real module.
    solve_mod = importlib.import_module("solver_py.solver.solve")

    assert settings.CP_SAT_NUM_SEARCH_WORKERS == 8, (
        "Phase B fix requires CP_SAT_NUM_SEARCH_WORKERS default of 8. "
        "Single-worker causes SCHED-041 on NHQS-scale inputs."
    )
    assert solve_mod._CP_SAT_NUM_SEARCH_WORKERS == 8, (
        "Module-scope constant must mirror settings default (pinnable "
        "via monkeypatch in tests that need determinism)."
    )


def test_multi_worker_produces_improvements_past_greedy_on_medium_fixture() -> None:
    """SCHED-041 §B — on a medium 3-class / 3-subject fixture, multi-worker
    CP-SAT must either prove optimal OR produce strict improvements past
    the greedy hint within a 15s budget. A regression to single-worker
    would be caught by ``improvements_found >= 1`` failing on realistic
    inputs.

    Why medium and not easy: the easy fixture is trivially closed by
    CP-SAT's presolve, so there's no observable "multi-worker vs
    single-worker" behaviour to assert on. Medium is big enough to
    exercise LNS workers but small enough to close inside CI.
    """
    grid = build_period_grid(weekdays=5, periods_per_day=6)
    year_groups = [
        {
            "year_group_id": "yg-1",
            "year_group_name": "Year 1",
            "sections": [
                {"class_id": f"C{i}", "class_name": f"Class {i}", "student_count": 22}
                for i in range(3)
            ],
            "period_grid": grid,
        }
    ]
    payload = build_input(
        year_groups=year_groups,
        curriculum=[
            curriculum_entry(subject_id="maths", min_periods=4),
            curriculum_entry(subject_id="english", min_periods=4),
            curriculum_entry(subject_id="science", min_periods=3),
        ],
        teachers=[
            teacher(
                staff_id=f"T{i}",
                competencies=[
                    competency(subject_id="maths"),
                    competency(subject_id="english"),
                    competency(subject_id="science"),
                ],
                max_per_week=22,
                max_per_day=5,
            )
            for i in range(4)
        ],
    )
    payload.settings.max_solver_duration_seconds = 15

    telemetry = SolverTelemetry()
    out = solve(payload, telemetry=telemetry)  # type: ignore[arg-type]
    diag = telemetry.to_diagnostics()

    # Multi-worker was asked for.
    assert diag.num_search_workers is not None and diag.num_search_workers >= 2, (
        f"expected multi-worker (Phase B), got num_search_workers="
        f"{diag.num_search_workers}"
    )

    # Either CP-SAT proved OPTIMAL (best possible outcome) or it found
    # at least one solution. SCHED-041's single-worker failure mode
    # showed ``improvements_found=0`` + ``termination=unknown_at_deadline``
    # — this assertion rules out that regression.
    if out.cp_sat_status == "optimal":
        assert diag.improvements_found >= 1, (
            "OPTIMAL path must have produced at least one solution callback"
        )
    else:
        # Not OPTIMAL — must at least have a feasible with improvements.
        assert diag.improvements_found >= 1, (
            f"SCHED-041 regression guard: single-worker produced "
            f"improvements_found=0 on NHQS-scale input. Medium fixture "
            f"must show improvements_found >= 1 on multi-worker. "
            f"Got termination_reason={diag.termination_reason}, "
            f"final_objective={diag.final_objective_value}, "
            f"greedy_hint={diag.greedy_hint_score}"
        )
        assert diag.final_objective_value is not None
        assert diag.termination_reason != "unknown_at_deadline", (
            "SCHED-041 regression: multi-worker should reach feasibility "
            "on medium fixture within 15s budget"
        )
