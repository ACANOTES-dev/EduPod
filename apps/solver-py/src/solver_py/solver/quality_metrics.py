"""Post-solve quality metrics — pure function of the final entry list.

Mirrors ``buildQualityMetrics`` in ``solver-v2.ts``. No solver state, no
side effects. Add or remove a metric here without touching the solve
pipeline.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable

from solver_py.schema import (
    PreferenceBreakdownEntry,
    PreferenceSatisfaction,
    QualityMetricRange,
    QualityMetricsV2,
    SolverAssignmentV2,
    SolverInputV2,
)


def build_quality_metrics(
    input_payload: SolverInputV2,
    entries: list[SolverAssignmentV2],
    per_entry_satisfaction: list[PreferenceSatisfaction],
) -> QualityMetricsV2:
    """Aggregate per-teacher / per-class / per-pref-type signals from the schedule."""
    return QualityMetricsV2(
        teacher_gap_index=_teacher_gap_index(entries),
        day_distribution_variance=_day_distribution_variance(input_payload, entries),
        preference_breakdown=_preference_breakdown(input_payload, per_entry_satisfaction),
    )


# ─── Teacher gap index ───────────────────────────────────────────────────────


def _teacher_gap_index(entries: list[SolverAssignmentV2]) -> QualityMetricRange:
    """For each teacher × weekday, ``(span - lesson_count)``; average per teacher,
    then min / avg / max across teachers with ≥1 active day."""
    by_teacher_day: dict[tuple[str, int], list[int]] = defaultdict(list)
    for e in entries:
        if e.teacher_staff_id is None or e.is_supervision:
            continue
        by_teacher_day[(e.teacher_staff_id, e.weekday)].append(e.period_order)

    per_teacher_gaps: dict[str, list[int]] = defaultdict(list)
    for (teacher_id, _weekday), periods in by_teacher_day.items():
        if not periods:
            continue
        span = max(periods) - min(periods) + 1
        per_teacher_gaps[teacher_id].append(span - len(periods))

    teacher_averages: list[float] = []
    for gaps in per_teacher_gaps.values():
        if not gaps:
            continue
        teacher_averages.append(sum(gaps) / len(gaps))
    return _min_avg_max(teacher_averages)


# ─── Day distribution variance ───────────────────────────────────────────────


def _day_distribution_variance(
    input_payload: SolverInputV2, entries: list[SolverAssignmentV2]
) -> QualityMetricRange:
    """Per-class stddev of ``lessons_per_day`` across all working weekdays."""
    by_class_day: dict[tuple[str, int], int] = defaultdict(int)
    classes_seen: set[str] = set()
    for e in entries:
        if not e.class_id or e.is_supervision:
            continue
        classes_seen.add(e.class_id)
        by_class_day[(e.class_id, e.weekday)] += 1

    working_days: set[int] = set()
    for yg in input_payload.year_groups:
        for slot in yg.period_grid:
            working_days.add(slot.weekday)
    day_count = max(len(working_days), 1)

    class_stddevs: list[float] = []
    for class_id in classes_seen:
        per_day = [by_class_day.get((class_id, d), 0) for d in working_days]
        mean = sum(per_day) / day_count
        variance = sum((c - mean) ** 2 for c in per_day) / day_count
        class_stddevs.append(variance**0.5)
    return _min_avg_max(class_stddevs)


# ─── Preference breakdown ────────────────────────────────────────────────────


def _preference_breakdown(
    input_payload: SolverInputV2, per_entry_satisfaction: list[PreferenceSatisfaction]
) -> list[PreferenceBreakdownEntry]:
    pref_type_by_id: dict[str, str] = {}
    for teacher in input_payload.teachers:
        for pref in teacher.preferences:
            pref_type_by_id[pref.id] = pref.preference_type

    counts: dict[str, dict[str, int]] = {}
    for sat in per_entry_satisfaction:
        ptype = pref_type_by_id.get(sat.preference_id)
        if ptype is None:
            continue
        row = counts.setdefault(ptype, {"honoured": 0, "violated": 0})
        if sat.satisfied:
            row["honoured"] += 1
        else:
            row["violated"] += 1

    return [
        PreferenceBreakdownEntry(
            preference_type=ptype,  # type: ignore[arg-type]
            honoured=row["honoured"],
            violated=row["violated"],
        )
        for ptype, row in counts.items()
    ]


# ─── Min / avg / max helper ──────────────────────────────────────────────────


def _min_avg_max(values: Iterable[float]) -> QualityMetricRange:
    materialised = list(values)
    if not materialised:
        return QualityMetricRange(min=0, avg=0, max=0)
    avg = sum(materialised) / len(materialised)
    return QualityMetricRange(
        min=_round_int_or_float(min(materialised)),
        avg=round(avg, 2),
        max=_round_int_or_float(max(materialised)),
    )


def _round_int_or_float(value: float) -> int | float:
    """Match the legacy: integer when input was integer, float otherwise."""
    if value == int(value):
        return int(value)
    return round(value, 2)


__all__ = ["build_quality_metrics"]
