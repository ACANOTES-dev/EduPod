"""Physical slot enumeration and wall-clock equivalence classes.

Each ``YearGroupInput`` carries its own period grid. Two grids may share a
weekday but place a slot at different times, so teacher no-overlap can't
just key on ``(weekday, period_order)``. We enumerate every grid cell as
a ``PhysicalSlot`` and group cells whose wall-clock intervals overlap into
the same ``time_group_id``. A teacher can appear in at most one cell per
``time_group_id`` — the legacy uses the same wall-clock comparison in
``checkTeacherDoubleBookingV2``.
"""

from __future__ import annotations

from dataclasses import dataclass

from solver_py.schema import PeriodSlotV2, PeriodType, SolverInputV2, SupervisionMode


@dataclass(frozen=True)
class PhysicalSlot:
    slot_id: int
    year_group_id: str
    weekday: int
    period_order: int
    start_time: str
    end_time: str
    period_type: PeriodType
    supervision_mode: SupervisionMode
    break_group_id: str | None
    time_group_id: int


def _times_overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    return a_start < b_end and b_start < a_end


def _build_time_groups(raw_cells: list[tuple[int, int, str, str, PeriodSlotV2]]) -> list[int]:
    """Assign each cell a ``time_group_id`` so wall-clock-overlapping cells share one.

    Same weekday + overlapping (start, end) intervals belong to the same
    group. Different weekdays never share a group.
    """
    groups: list[int] = [-1] * len(raw_cells)
    next_group = 0
    for i, (_, weekday_i, start_i, end_i, _) in enumerate(raw_cells):
        if groups[i] != -1:
            continue
        groups[i] = next_group
        for j in range(i + 1, len(raw_cells)):
            if groups[j] != -1:
                continue
            (_, weekday_j, start_j, end_j, _) = raw_cells[j]
            if weekday_i == weekday_j and _times_overlap(start_i, end_i, start_j, end_j):
                groups[j] = next_group
        next_group += 1
    return groups


def enumerate_slots(input_payload: SolverInputV2) -> list[PhysicalSlot]:
    """Flatten every year-group's grid into a global, ordered ``PhysicalSlot`` list.

    Ordering is stable: by year-group declaration order, then weekday, then
    period_order. Slot indices are zero-based and dense.
    """
    raw_cells: list[tuple[int, int, str, str, PeriodSlotV2]] = []
    yg_indices: list[str] = []
    for yg_idx, yg in enumerate(input_payload.year_groups):
        for slot in yg.period_grid:
            raw_cells.append((yg_idx, slot.weekday, slot.start_time, slot.end_time, slot))
            yg_indices.append(yg.year_group_id)

    time_groups = _build_time_groups(raw_cells)

    slots: list[PhysicalSlot] = []
    for slot_id, ((_, weekday, start, end, slot), tg, yg_id) in enumerate(
        zip(raw_cells, time_groups, yg_indices, strict=True)
    ):
        slots.append(
            PhysicalSlot(
                slot_id=slot_id,
                year_group_id=yg_id,
                weekday=weekday,
                period_order=slot.period_order,
                start_time=start,
                end_time=end,
                period_type=slot.period_type,
                supervision_mode=slot.supervision_mode,
                break_group_id=slot.break_group_id,
                time_group_id=tg,
            )
        )
    return slots


def teaching_slots_by_year_group(slots: list[PhysicalSlot]) -> dict[str, list[PhysicalSlot]]:
    by_yg: dict[str, list[PhysicalSlot]] = {}
    for slot in slots:
        if slot.period_type != "teaching":
            continue
        by_yg.setdefault(slot.year_group_id, []).append(slot)
    return by_yg


def supervision_slots_by_break_group(
    slots: list[PhysicalSlot],
) -> dict[str, list[PhysicalSlot]]:
    by_bg: dict[str, list[PhysicalSlot]] = {}
    for slot in slots:
        if slot.break_group_id is None:
            continue
        if slot.supervision_mode != "yard":
            continue
        by_bg.setdefault(slot.break_group_id, []).append(slot)
    return by_bg


def adjacent_classroom_break_window(
    slot: PhysicalSlot, all_slots_for_yg: list[PhysicalSlot]
) -> tuple[str, str]:
    """Return the effective availability window for a teaching slot.

    If the teaching slot is adjacent to a ``classroom_previous`` or
    ``classroom_next`` break in the same year-group grid, the teacher's
    required availability extends to cover the break — mirrors
    ``checkTeacherAvailabilityV2`` in the legacy.
    """
    start = slot.start_time
    end = slot.end_time
    same_day = [s for s in all_slots_for_yg if s.weekday == slot.weekday]
    same_day_sorted = sorted(same_day, key=lambda s: s.period_order)
    for idx, s in enumerate(same_day_sorted):
        if s.period_order != slot.period_order:
            continue
        if idx > 0:
            prev = same_day_sorted[idx - 1]
            if prev.supervision_mode == "classroom_next":
                start = min(start, prev.start_time)
        if idx + 1 < len(same_day_sorted):
            nxt = same_day_sorted[idx + 1]
            if nxt.supervision_mode == "classroom_previous":
                end = max(end, nxt.end_time)
        break
    return start, end
