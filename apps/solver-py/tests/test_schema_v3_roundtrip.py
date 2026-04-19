"""Round-trip the canonical SolverInputV3 fixture through pydantic.

Guards against contract drift between TypeScript ``types-v3.ts`` and the
pydantic V3 models in ``solver_py.schema.v3``. Mirrors
``test_schema_roundtrip.py`` (V2) in structure.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from solver_py.schema.v3 import SolverInputV3, SolverOutputV3
from solver_py.schema.v3.adapters import v3_input_to_v2

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "solver_input_v3_minimal.json"


def _load_fixture() -> dict[str, object]:
    return json.loads(FIXTURE_PATH.read_text())  # type: ignore[no-any-return]


def test_solver_input_v3_roundtrips_byte_for_byte() -> None:
    raw = _load_fixture()
    parsed = SolverInputV3.model_validate(raw)
    serialised = parsed.model_dump(mode="json", by_alias=True)
    assert serialised == raw


def test_solver_input_v3_rejects_unknown_top_level_field() -> None:
    raw = _load_fixture()
    raw["bogus_extra_field"] = True
    with pytest.raises(ValidationError):
        SolverInputV3.model_validate(raw)


def test_solver_input_v3_rejects_unknown_nested_field() -> None:
    raw = _load_fixture()
    raw["settings"]["bogus"] = True  # type: ignore[index]
    with pytest.raises(ValidationError):
        SolverInputV3.model_validate(raw)


def test_solver_input_v3_rejects_invalid_period_type() -> None:
    raw = _load_fixture()
    raw["period_slots"][0]["period_type"] = "lunch"  # type: ignore[index]
    with pytest.raises(ValidationError):
        SolverInputV3.model_validate(raw)


def test_solver_input_v3_rejects_invalid_solve_status() -> None:
    """SolveStatusV3 is upper-case; lowercase should fail."""
    output_blob = {
        "solve_status": "optimal",  # wrong case
        "entries": [],
        "unassigned": [],
        "quality_metrics": {
            "teacher_gap_index": {"min": 0, "avg": 0, "max": 0},
            "day_distribution_variance": {"min": 0, "avg": 0, "max": 0},
            "preference_breakdown": [],
            "cp_sat_objective_value": None,
            "greedy_hint_score": 0,
            "cp_sat_improved_on_greedy": False,
        },
        "objective_breakdown": [],
        "hard_violations": 0,
        "soft_score": 0,
        "soft_max_score": 0,
        "duration_ms": 100,
        "constraint_snapshot": [],
        "early_stop_triggered": False,
        "early_stop_reason": "not_triggered",
        "time_saved_ms": 0,
    }
    with pytest.raises(ValidationError):
        SolverOutputV3.model_validate(output_blob)


def test_solver_output_v3_accepts_valid_blob() -> None:
    output_blob = {
        "solve_status": "OPTIMAL",
        "entries": [],
        "unassigned": [],
        "quality_metrics": {
            "teacher_gap_index": {"min": 0, "avg": 0, "max": 0},
            "day_distribution_variance": {"min": 0, "avg": 0, "max": 0},
            "preference_breakdown": [],
            "cp_sat_objective_value": 1200,
            "greedy_hint_score": 1000,
            "cp_sat_improved_on_greedy": True,
        },
        "objective_breakdown": [
            {
                "term_name": "placement",
                "weight": 100,
                "contribution": 100,
                "best_possible": 100,
            }
        ],
        "hard_violations": 0,
        "soft_score": 95,
        "soft_max_score": 100,
        "duration_ms": 5000,
        "constraint_snapshot": [],
        "early_stop_triggered": False,
        "early_stop_reason": "not_triggered",
        "time_saved_ms": 0,
    }
    parsed = SolverOutputV3.model_validate(output_blob)
    assert parsed.solve_status == "OPTIMAL"
    assert parsed.quality_metrics.cp_sat_improved_on_greedy is True


def test_v3_input_adapter_round_trip() -> None:
    """V3 → V2 adapter produces a valid SolverInputV2."""
    raw = _load_fixture()
    v3 = SolverInputV3.model_validate(raw)
    v2 = v3_input_to_v2(v3)
    # The v2 payload should have the same number of year groups, teachers, etc.
    assert len(v2.year_groups) >= 1
    assert len(v2.teachers) == len(v3.teachers)
    assert len(v2.rooms) == len(v3.rooms)
    # Curriculum should be generated from demand
    assert len(v2.curriculum) == len(v3.demand)
    # Pinned entries should be converted
    assert len(v2.pinned_entries) == len(v3.pinned)
