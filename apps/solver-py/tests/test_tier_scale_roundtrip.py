"""Stage 9.5.2 §A — round-trip the tier-4/5/6 fixtures through pydantic.

Each fixture is a JSON snapshot produced by
``packages/shared/src/scheduler/__tests__/fixtures/tier-4-5-6-generators.ts``
via the ``generate-tier-snapshots.ts`` script. The round-trip here
catches contract drift in either direction — a TS field that Python
doesn't know about, or a pydantic schema change that makes old JSON
invalid.

Also acts as a feasibility guardrail witness for future reviewers:
if a fixture ever produces unparsed output, regenerate with the same
seed and inspect the diff — the generator must have drifted from the
shared type.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from solver_py.schema import SolverInputV2

FIXTURES_DIR = Path(__file__).parent / "fixtures"

TIER_FIXTURES = [
    ("tier-4-irish-secondary-large.seed42.json", 50, 80, 55),
    ("tier-5-multi-campus-large.seed7.json", 95, 160, 100),
    ("tier-6-college-level.seed11.json", 130, 180, 130),
]


@pytest.mark.parametrize(
    ("filename", "expected_classes", "expected_teachers", "expected_rooms"),
    TIER_FIXTURES,
    ids=[t[0].split(".")[0] for t in TIER_FIXTURES],
)
def test_tier_fixture_roundtrips_and_matches_shape(
    filename: str,
    expected_classes: int,
    expected_teachers: int,
    expected_rooms: int,
) -> None:
    """Parse each tier snapshot through pydantic and assert byte equality
    on re-serialisation. Also confirms the spec-expected shape (class /
    teacher / room counts) in case a future generator drift silently
    changes dimensions."""
    path = FIXTURES_DIR / filename
    raw = json.loads(path.read_text())
    parsed = SolverInputV2.model_validate(raw)

    # Shape assertions — catch accidental drift in the generator's sizing.
    total_classes = sum(len(yg.sections) for yg in parsed.year_groups)
    assert total_classes == expected_classes, (
        f"{filename}: expected {expected_classes} classes, got {total_classes}"
    )
    assert len(parsed.teachers) == expected_teachers, (
        f"{filename}: expected {expected_teachers} teachers, got {len(parsed.teachers)}"
    )
    assert len(parsed.rooms) == expected_rooms, (
        f"{filename}: expected {expected_rooms} rooms, got {len(parsed.rooms)}"
    )

    # Round-trip: parse → re-emit → compare. Absent optional top-level
    # fields in the TS output (``class_room_overrides``, ``overrides_applied``)
    # are filled in with ``None`` on the pydantic side because the schema
    # declares ``list[...] | None = None`` rather than
    # ``list[...] = default_factory=list``. That's a legitimate emit
    # difference, not a semantic drift — we normalise the raw input to
    # include these optional fields as ``None`` so the round-trip compare
    # is strictly byte-equivalent modulo that known emit detail.
    normalised_raw = {
        "class_room_overrides": None,
        "overrides_applied": None,
        **raw,
    }
    serialised = parsed.model_dump(mode="json")
    assert serialised == normalised_raw, (
        f"{filename}: round-trip object mismatch — pydantic parse + re-emit "
        "produced a different object than the TS-emitted JSON. Likely a "
        "schema drift between types-v2.ts and solver_py.schema."
    )


def test_all_tier_fixtures_feasibility_guardrail() -> None:
    """Per-fixture supply-vs-demand ratio is ≥ 1.10, matching the TS
    generator's ``assertFeasibleSupply`` guardrail. If a TS drift ever
    under-supplies a generator (e.g. fewer teachers than the spec), the
    TS unit test catches it first; this is a belt-and-braces guard on
    the snapshot side."""
    for filename, _, _, _ in TIER_FIXTURES:
        path = FIXTURES_DIR / filename
        parsed = SolverInputV2.model_validate(json.loads(path.read_text()))

        demand = 0
        for c in parsed.curriculum:
            sections = next(
                (len(yg.sections) for yg in parsed.year_groups if yg.year_group_id == c.year_group_id),
                0,
            )
            demand += c.min_periods_per_week * sections

        supply = sum((t.max_periods_per_week or 20) for t in parsed.teachers)

        ratio = supply / max(demand, 1)
        assert ratio >= 1.1, (
            f"{filename}: supply/demand ratio {ratio:.2f} < 1.10 — "
            f"supply={supply} demand={demand}"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
