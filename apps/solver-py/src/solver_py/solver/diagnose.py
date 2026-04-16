"""IIS-inspired root-cause extraction for unassigned lessons.

Stage 12, §B.

For each unassigned lesson, we analyse the input constraints to identify
which specific resources (teacher availability, room capacity, etc.) block
placement. This is a constraint-graph analysis — not a full CP-SAT IIS
extraction (which would require assumption variables per lesson and N
solver calls). The trade-off: we're faster (< 5s on realistic inputs)
and deterministic, but may miss subtle multi-lesson interactions.

The sidecar exposes this as ``POST /diagnose``.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Any

from solver_py.schema.v3.input import (
    DemandV3,
    SolverInputV3,
    TeacherV3,
)
from solver_py.schema.v3.output import SolverOutputV3

logger = logging.getLogger(__name__)


def _time_to_minutes(hhmm: str) -> int:
    parts = hhmm.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def diagnose_unassigned(
    v3_input: SolverInputV3,
    v3_output: SolverOutputV3,
    max_subsets: int = 8,
) -> dict[str, Any]:
    """Analyse unassigned lessons and return blocking constraint subsets.

    Returns a JSON-serialisable dict matching the /diagnose response spec.
    """
    start = time.perf_counter()

    if not v3_output.unassigned:
        return {
            "subsets": [],
            "timed_out": False,
            "duration_ms": 0,
        }

    # Build lookup maps
    demand_by_key: dict[str, DemandV3] = {}
    for d in v3_input.demand:
        demand_by_key[f"{d.class_id}|{d.subject_id}"] = d

    class_yg: dict[str, str] = {}
    for c in v3_input.classes:
        class_yg[c.class_id] = c.year_group_id

    # Teaching slots per year group per weekday
    slots_by_yg_day: dict[str, int] = defaultdict(int)
    for slot in v3_input.period_slots:
        if slot.period_type == "teaching":
            key = f"{slot.year_group_id}|{slot.weekday}"
            slots_by_yg_day[key] += 1

    # Teacher availability as (weekday, available_periods) map
    # (period_duration is implicitly embedded in the slot structure;
    # teacher availability is checked by slot overlap, not minutes.)

    # Qualified teachers per (subject, year_group)
    qualified: dict[str, list[TeacherV3]] = defaultdict(list)
    for t in v3_input.teachers:
        for comp in t.competencies:
            key = f"{comp.subject_id}|{comp.year_group_id}"
            qualified[key].append(t)

    # Assigned teacher periods from the output
    assigned_per_teacher: dict[str, int] = defaultdict(int)
    for entry in v3_output.entries:
        if entry.teacher_staff_id:
            assigned_per_teacher[entry.teacher_staff_id] += 1

    # Analyse each unassigned lesson
    subsets: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    for unassigned in v3_output.unassigned[:max_subsets * 3]:
        lesson_key = f"{unassigned.class_id}|{unassigned.subject_id}|{unassigned.lesson_index}"
        if lesson_key in seen_keys:
            continue
        seen_keys.add(lesson_key)

        yg_id = class_yg.get(unassigned.class_id, "")
        qual_key = f"{unassigned.subject_id}|{yg_id}"
        teachers_for_lesson = qualified.get(qual_key, [])

        blocking_constraints: list[dict[str, Any]] = []

        # 1. No qualified teachers at all?
        if not teachers_for_lesson:
            blocking_constraints.append({
                "type": "subject_demand_exceeds_capacity",
                "subject_id": unassigned.subject_id or "",
                "shortfall_periods": 1,
                "detail": "No teacher is qualified for this (subject, year group)",
            })
        else:
            # 2. Are all qualified teachers overloaded?
            overloaded = []
            for t in teachers_for_lesson:
                cap = t.max_periods_per_week if t.max_periods_per_week is not None else 999
                assigned = assigned_per_teacher.get(t.staff_profile_id, 0)
                if assigned >= cap:
                    overloaded.append(t)

            if len(overloaded) == len(teachers_for_lesson):
                blocking_constraints.append({
                    "type": "teacher_overloaded",
                    "teacher_ids": [t.staff_profile_id for t in overloaded],
                    "detail": "All qualified teachers are at their weekly cap",
                })

            # 3. Do qualified teachers lack availability overlap?
            has_overlap = False
            for t in teachers_for_lesson:
                for avail in t.availability:
                    slot_key = f"{yg_id}|{avail.weekday}"
                    if slots_by_yg_day.get(slot_key, 0) > 0:
                        has_overlap = True
                        break
                if has_overlap:
                    break

            if not has_overlap:
                blocking_constraints.append({
                    "type": "teacher_unavailable",
                    "teacher_ids": [t.staff_profile_id for t in teachers_for_lesson],
                    "detail": "No qualified teacher has availability overlapping with class slots",
                })

        # 4. Room constraint?
        demand = demand_by_key.get(
            f"{unassigned.class_id}|{unassigned.subject_id}"
        )
        if demand and demand.required_room_type:
            rooms_of_type = [
                r for r in v3_input.rooms if r.room_type == demand.required_room_type
            ]
            if not rooms_of_type:
                blocking_constraints.append({
                    "type": "room_capacity_exceeded",
                    "room_type": demand.required_room_type,
                    "detail": f"No room of type '{demand.required_room_type}' exists",
                })

        # 5. Pin blocking?
        class_pins = [
            p for p in v3_input.pinned if p.class_id == unassigned.class_id
        ]
        class_teaching_slots = sum(
            v for k, v in slots_by_yg_day.items() if k.startswith(f"{yg_id}|")
        )
        total_demand_for_class = sum(
            d.periods_per_week
            for d in v3_input.demand
            if d.class_id == unassigned.class_id
        )
        if len(class_pins) + total_demand_for_class > class_teaching_slots:
            blocking_constraints.append({
                "type": "pin_blocks_placement",
                "pin_count": len(class_pins),
                "available_slots": class_teaching_slots,
                "total_demand": total_demand_for_class,
                "detail": "Pinned entries + demand exceed available slots for this class",
            })

        if not blocking_constraints:
            # Fallback — likely a complex multi-lesson interaction
            blocking_constraints.append({
                "type": "class_conflict",
                "detail": (
                    "No single blocking constraint identified — "
                    "likely a multi-lesson scheduling conflict"
                ),
            })

        subsets.append({
            "lessons": [{
                "lesson_id": lesson_key,
                "class_id": unassigned.class_id,
                "subject_id": unassigned.subject_id or "",
            }],
            "blocking_constraints": blocking_constraints,
        })

        if len(subsets) >= max_subsets:
            break

    duration_ms = round((time.perf_counter() - start) * 1000, 1)
    timed_out = duration_ms > 30000

    logger.info(
        "diagnose complete",
        extra={
            "subsets": len(subsets),
            "unassigned_total": len(v3_output.unassigned),
            "duration_ms": duration_ms,
        },
    )

    return {
        "subsets": subsets,
        "timed_out": timed_out,
        "duration_ms": duration_ms,
    }
