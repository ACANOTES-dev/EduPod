"""Round-trip the canonical SolverInputV2 fixture through pydantic.

Guards against contract drift between TypeScript ``types-v2.ts`` and the
pydantic models in ``solver_py.schema``. The same fixture is consumed by
``packages/shared/src/scheduler/__tests__/cp-sat-contract.test.ts`` on
the TypeScript side.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from solver_py.schema import SolverInputV2

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "solver_input_minimal.json"


def _load_fixture() -> dict[str, object]:
    return json.loads(FIXTURE_PATH.read_text())  # type: ignore[no-any-return]


def test_solver_input_v2_roundtrips_byte_for_byte() -> None:
    raw = _load_fixture()
    parsed = SolverInputV2.model_validate(raw)
    serialised = parsed.model_dump(mode="json", by_alias=True)
    assert serialised == raw


def test_solver_input_v2_rejects_unknown_top_level_field() -> None:
    raw = _load_fixture()
    raw["bogus_extra_field"] = True
    with pytest.raises(ValidationError):
        SolverInputV2.model_validate(raw)


def test_solver_input_v2_rejects_unknown_nested_field() -> None:
    raw = _load_fixture()
    raw["settings"]["bogus"] = True  # type: ignore[index]
    with pytest.raises(ValidationError):
        SolverInputV2.model_validate(raw)


def test_solver_input_v2_rejects_invalid_period_type() -> None:
    raw = _load_fixture()
    raw["year_groups"][0]["period_grid"][0]["period_type"] = "lunch"  # type: ignore[index]
    with pytest.raises(ValidationError):
        SolverInputV2.model_validate(raw)
