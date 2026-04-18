"""CP-SAT exam solver.

Takes an ``ExamSolverInput`` and returns an ``ExamSolverOutput`` by modelling
the problem as a CP-SAT constraint program:

Decision variables
------------------
* ``slot_assign[e][d][s]``  — 1 iff exam *e* runs on day *d*, slot *s*.
* ``uses_room[e][r]``        — 1 iff exam *e* uses room *r* (in-person only).
* ``invig_assign[e][i]``     — 1 iff invigilator *i* covers exam *e*.
* Auxiliary AND-products for "room busy at (d, s)" and "invig busy at (d, s)".

Hard constraints
----------------
* Each exam placed exactly once.
* Exam duration must fit the chosen slot window.
* Paper 1 and Paper 2 of the same subject-config must be on *different* days.
* Max exams per day per year group.
* For each year-group day+slot, at most one exam runs (student-clash guard).
* If min_gap_minutes forces morning/afternoon incompatibility, same year-group
  exams can only share a day when the gap is satisfied.
* In-person exams: chosen rooms' capacities must cover student_count.
* Rooms/invigilators can't double-book within a (day, slot).
* Exactly ``invigilators_required`` invigilators per exam.

Soft objective (minimised)
--------------------------
* Prefer earlier dates (per-exam ``date_index`` penalty).
* Fairness: minimise ``max_invig_load - min_invig_load`` among the active
  invigilators (those assigned at least once).

The solver is strictly additive to ``solve.py`` — no shared state — so the
timetable scheduler remains unaffected. Single-worker (``num_search_workers=1``)
matches the existing sidecar stability profile.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

from ortools.sat.python import cp_model

from solver_py.schema.exam import (
    ExamSolverExam,
    ExamSolverInput,
    ExamSolverOutput,
    ExamSolverRoomAssignment,
    ExamSolverSlot,
)
from solver_py.solver.early_stop import WallClockWatchdog

logger = logging.getLogger("solver_py.exam")

ExamEarlyStopReason = Literal["stagnation", "gap", "cancelled", "not_triggered"]

# Default stagnation threshold (seconds without an improvement) before the
# exam solver halts. Same 8s value as the timetable solver — long enough to
# avoid tripping on deep branch explorations, short enough that a plateau at
# first-feasible doesn't burn the full 450s budget.
_EXAM_STAGNATION_SECONDS = 8.0
_EXAM_GAP_THRESHOLD = 0.001
_EXAM_MIN_RUNTIME_SECONDS = 2.0


class ExamEarlyStopCallback(cp_model.CpSolverSolutionCallback):
    """Minimise-aware early-stop callback for the exam CP-SAT solver.

    Mirrors the shape of the timetable solver's ``EarlyStopCallback`` but
    inverts the improvement / floor checks for minimise objectives. We do
    not touch the shared callback because altering its direction semantics
    would be a high-risk change to the already-live timetable path.

    The exam solver has no greedy warm-start, so there is no "hint floor"
    to beat before stagnation becomes eligible. Instead we treat the first
    feasible solution as the floor: once CP-SAT has found anything at all,
    8 seconds of quiet (no strict improvement) is enough to halt.

    Watchdog surface area matches the timetable callback (``last_callback_
    monotonic``, ``mark_watchdog_triggered``) so the existing
    :class:`WallClockWatchdog` can be reused verbatim — critical because
    CP-SAT only fires the callback on strict improvements, so a plateau at
    first-feasible would never trip the callback's own stagnation check.
    """

    def __init__(
        self,
        stagnation_seconds: float = _EXAM_STAGNATION_SECONDS,
        gap_threshold: float = _EXAM_GAP_THRESHOLD,
        min_runtime_seconds: float = _EXAM_MIN_RUNTIME_SECONDS,
    ) -> None:
        super().__init__()
        self._stagnation_seconds = stagnation_seconds
        self._gap_threshold = gap_threshold
        self._min_runtime_seconds = min_runtime_seconds
        self._best_objective: float | None = None
        self._last_improvement_wall: float = 0.0
        self._last_callback_monotonic: float = time.monotonic()
        self._triggered = False
        self._reason: ExamEarlyStopReason = "not_triggered"
        self._first_solution_objective: float | None = None
        self._first_solution_wall_time: float | None = None
        self._improvements_found = 0

    @property
    def triggered(self) -> bool:
        return self._triggered

    @property
    def reason(self) -> ExamEarlyStopReason:
        return self._reason

    @property
    def best_objective(self) -> float | None:
        return self._best_objective

    @property
    def first_solution_wall_time(self) -> float | None:
        return self._first_solution_wall_time

    @property
    def improvements_found(self) -> int:
        return self._improvements_found

    @property
    def last_callback_monotonic(self) -> float:
        return self._last_callback_monotonic

    def mark_watchdog_triggered(self) -> None:
        """Called by :class:`WallClockWatchdog` just before ``stop_search``."""
        if not self._triggered:
            self._triggered = True
            self._reason = "stagnation"

    def OnSolutionCallback(self) -> None:  # noqa: N802 — CP-SAT API
        self._last_callback_monotonic = time.monotonic()
        try:
            current = self.objective_value
        except RuntimeError:
            return

        wall = self.wall_time

        if self._first_solution_objective is None:
            self._first_solution_objective = current
            self._first_solution_wall_time = wall

        # Minimise semantics: strict improvement is a DECREASE.
        improved = self._best_objective is None or current < self._best_objective
        if improved:
            self._best_objective = current
            self._last_improvement_wall = wall
            self._improvements_found += 1

        # ── Trigger 1: stagnation past first feasible ────────────────────────
        # Unlike the timetable path, there's no greedy floor — the first
        # feasible IS the floor. Stop if nothing has improved for N seconds.
        if (
            self._best_objective is not None
            and (wall - self._last_improvement_wall) >= self._stagnation_seconds
        ):
            self._triggered = True
            self._reason = "stagnation"
            self.stop_search()
            return

        # ── Trigger 2: gap closure (minimise variant) ────────────────────────
        if wall < self._min_runtime_seconds:
            return
        try:
            best_bound = self.best_objective_bound
        except RuntimeError:
            return
        if self._best_objective is None:
            return
        denom = max(1.0, abs(self._best_objective))
        # For minimise: best_bound <= best_objective, so gap = (best - bound) / denom.
        gap = (self._best_objective - best_bound) / denom
        if gap < self._gap_threshold:
            self._triggered = True
            self._reason = "gap"
            self.stop_search()

# ─── Helpers ────────────────────────────────────────────────────────────────

_SLOT_NAMES = ("morning", "afternoon")


def _parse_hhmm(value: str) -> int:
    """Minutes since midnight for ``HH:MM``."""
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def _minutes_to_hhmm(total: int) -> str:
    total = max(0, total) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _iter_allowed_dates(
    start: date, end: date, allowed_weekdays: list[int]
) -> list[date]:
    """Return the in-window dates whose weekday (Sun=0..Sat=6) is allowed.

    Python's ``datetime.weekday()`` is Mon=0..Sun=6. The TS side uses
    ``Date.getUTCDay()`` which is Sun=0..Sat=6. We convert to the Sun=0
    convention to stay compatible with the TS greedy + the Zod schema.
    """

    def sun_weekday(d: date) -> int:
        # Python Mon=0..Sun=6  →  Sun=0..Sat=6
        return (d.weekday() + 1) % 7

    days: list[date] = []
    cur = start
    while cur <= end:
        if sun_weekday(cur) in allowed_weekdays:
            days.append(cur)
        cur = cur + timedelta(days=1)
    return days


@dataclass
class _SlotGeometry:
    """Geometry of the two slots in a day (start/end/duration)."""

    morning_start: int
    morning_end: int
    afternoon_start: int
    afternoon_end: int

    def fits(self, slot_index: int, duration_minutes: int) -> bool:
        if slot_index == 0:
            return self.morning_start + duration_minutes <= self.morning_end
        return self.afternoon_start + duration_minutes <= self.afternoon_end

    def slot_start(self, slot_index: int) -> int:
        return self.morning_start if slot_index == 0 else self.afternoon_start


# ─── Solver ────────────────────────────────────────────────────────────────


def solve_exam_schedule(payload: ExamSolverInput) -> ExamSolverOutput:
    """Run the CP-SAT exam solver on ``payload`` and return the output."""
    started = time.perf_counter()

    start_dt = datetime.strptime(payload.start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(payload.end_date, "%Y-%m-%d").date()
    dates = _iter_allowed_dates(start_dt, end_dt, payload.allowed_weekdays)

    if not dates:
        return ExamSolverOutput(
            status="infeasible",
            slots=[],
            solve_time_ms=int((time.perf_counter() - started) * 1000),
            message="No allowed weekdays inside the session window",
        )

    geom = _SlotGeometry(
        morning_start=_parse_hhmm(payload.morning_window.start),
        morning_end=_parse_hhmm(payload.morning_window.end),
        afternoon_start=_parse_hhmm(payload.afternoon_window.start),
        afternoon_end=_parse_hhmm(payload.afternoon_window.end),
    )

    exams = payload.exams
    rooms = payload.rooms
    invigilators = payload.invigilators

    if not exams:
        return ExamSolverOutput(
            status="optimal",
            slots=[],
            solve_time_ms=int((time.perf_counter() - started) * 1000),
            message="No exams to schedule",
        )

    model = cp_model.CpModel()
    num_days = len(dates)
    num_slots = 2
    num_exams = len(exams)
    num_rooms = len(rooms)
    num_invig = len(invigilators)

    # ─── slot_assign[e][d][s] ────────────────────────────────────────────
    slot_assign: list[list[list[cp_model.IntVar]]] = []
    for e_idx, exam in enumerate(exams):
        per_exam: list[list[cp_model.IntVar]] = []
        for d_idx in range(num_days):
            per_day: list[cp_model.IntVar] = []
            for s_idx in range(num_slots):
                fits = geom.fits(s_idx, exam.duration_minutes)
                var = model.NewBoolVar(f"slot_e{e_idx}_d{d_idx}_s{s_idx}")
                if not fits:
                    model.Add(var == 0)
                per_day.append(var)
            per_exam.append(per_day)
        slot_assign.append(per_exam)

    # Each exam placed exactly once
    for e_idx in range(num_exams):
        model.Add(
            sum(
                slot_assign[e_idx][d][s]
                for d in range(num_days)
                for s in range(num_slots)
            )
            == 1
        )

    # ─── Paper-1 / Paper-2 different day ─────────────────────────────────
    paper_groups: dict[str, list[int]] = {}
    for e_idx, exam in enumerate(exams):
        paper_groups.setdefault(exam.exam_subject_config_id, []).append(e_idx)
    for cfg_id, group in paper_groups.items():
        if len(group) < 2:
            continue
        # All papers of the same config must live on distinct days.
        for d_idx in range(num_days):
            model.Add(
                sum(
                    slot_assign[e][d_idx][s]
                    for e in group
                    for s in range(num_slots)
                )
                <= 1
            )

    # ─── Year-group caps + student-clash ─────────────────────────────────
    yg_exams: dict[str, list[int]] = {}
    for e_idx, exam in enumerate(exams):
        yg_exams.setdefault(exam.year_group_id, []).append(e_idx)

    for yg_id, members in yg_exams.items():
        if len(members) == 0:
            continue
        for d_idx in range(num_days):
            # Max exams/day per year group
            model.Add(
                sum(
                    slot_assign[e][d_idx][s]
                    for e in members
                    for s in range(num_slots)
                )
                <= payload.max_exams_per_day_per_yg
            )
            # Student-clash: at most one exam for a year group per slot.
            for s_idx in range(num_slots):
                model.Add(
                    sum(slot_assign[e][d_idx][s_idx] for e in members) <= 1
                )

        # Min-gap between morning + afternoon for same year group.
        # Forbid morning+afternoon co-scheduling when the gap between
        # the morning exam's end and the afternoon slot start is below
        # min_gap_minutes.
        if payload.min_gap_minutes > 0:
            for d_idx in range(num_days):
                for m_idx in members:
                    m_exam = exams[m_idx]
                    m_end = geom.morning_start + m_exam.duration_minutes
                    gap = geom.afternoon_start - m_end
                    if gap >= payload.min_gap_minutes:
                        continue
                    for a_idx in members:
                        # Don't forbid self-pair; a single exam can only sit
                        # in one slot anyway.
                        if a_idx == m_idx:
                            continue
                        model.Add(
                            slot_assign[m_idx][d_idx][0]
                            + slot_assign[a_idx][d_idx][1]
                            <= 1
                        )

    # ─── Room assignment ─────────────────────────────────────────────────
    uses_room: list[list[cp_model.IntVar]] = []
    for e_idx, exam in enumerate(exams):
        row: list[cp_model.IntVar] = []
        for r_idx in range(num_rooms):
            var = model.NewBoolVar(f"usesroom_e{e_idx}_r{r_idx}")
            if exam.mode != "in_person" or exam.student_count == 0:
                model.Add(var == 0)
            row.append(var)
        uses_room.append(row)

    # Capacity covers student count for in-person exams
    for e_idx, exam in enumerate(exams):
        if exam.mode != "in_person" or exam.student_count == 0:
            continue
        model.Add(
            sum(
                uses_room[e_idx][r] * rooms[r].capacity
                for r in range(num_rooms)
            )
            >= exam.student_count
        )

    # Room busy at (d, s) = AND(slot_assign, uses_room)
    # For each (d, s, r) over all e: at most one exam uses the room at that slot.
    for d_idx in range(num_days):
        for s_idx in range(num_slots):
            for r_idx in range(num_rooms):
                room_busy_vars: list[cp_model.IntVar] = []
                for e_idx in range(num_exams):
                    # Only in-person exams consume rooms; others have uses_room=0.
                    aux = model.NewBoolVar(
                        f"roombusy_e{e_idx}_d{d_idx}_s{s_idx}_r{r_idx}"
                    )
                    # aux == slot_assign[e][d][s] AND uses_room[e][r]
                    model.Add(aux <= slot_assign[e_idx][d_idx][s_idx])
                    model.Add(aux <= uses_room[e_idx][r_idx])
                    model.Add(
                        aux
                        >= slot_assign[e_idx][d_idx][s_idx]
                        + uses_room[e_idx][r_idx]
                        - 1
                    )
                    room_busy_vars.append(aux)
                model.Add(sum(room_busy_vars) <= 1)

    # ─── Invigilator assignment ──────────────────────────────────────────
    invig_assign: list[list[cp_model.IntVar]] = []
    for e_idx, exam in enumerate(exams):
        row = [
            model.NewBoolVar(f"invig_e{e_idx}_i{i}") for i in range(num_invig)
        ]
        invig_assign.append(row)
        # Exactly invigilators_required per exam (if any available)
        required = min(exam.invigilators_required, num_invig)
        model.Add(sum(row) == required)

    # Invigilator no double-book per (d, s)
    for d_idx in range(num_days):
        for s_idx in range(num_slots):
            for i_idx in range(num_invig):
                busy_vars: list[cp_model.IntVar] = []
                for e_idx in range(num_exams):
                    aux = model.NewBoolVar(
                        f"invigbusy_e{e_idx}_d{d_idx}_s{s_idx}_i{i_idx}"
                    )
                    model.Add(aux <= slot_assign[e_idx][d_idx][s_idx])
                    model.Add(aux <= invig_assign[e_idx][i_idx])
                    model.Add(
                        aux
                        >= slot_assign[e_idx][d_idx][s_idx]
                        + invig_assign[e_idx][i_idx]
                        - 1
                    )
                    busy_vars.append(aux)
                model.Add(sum(busy_vars) <= 1)

    # ─── Objective ────────────────────────────────────────────────────────
    # Component 1: prefer earlier dates (weight 10 per day index).
    earliness_terms = []
    for e_idx in range(num_exams):
        for d_idx in range(num_days):
            for s_idx in range(num_slots):
                earliness_terms.append(
                    slot_assign[e_idx][d_idx][s_idx] * d_idx
                )

    # Component 2: fairness of invigilator load.
    load_vars: list[cp_model.IntVar] = []
    max_per_invig = num_exams  # upper bound
    for i_idx in range(num_invig):
        load = model.NewIntVar(0, max_per_invig, f"load_i{i_idx}")
        model.Add(load == sum(invig_assign[e][i_idx] for e in range(num_exams)))
        load_vars.append(load)
    if load_vars:
        load_max = model.NewIntVar(0, max_per_invig, "load_max")
        load_min = model.NewIntVar(0, max_per_invig, "load_min")
        model.AddMaxEquality(load_max, load_vars)
        model.AddMinEquality(load_min, load_vars)
        fairness = load_max - load_min
    else:
        fairness = 0

    # Weights: earliness weight 10, fairness weight 100 — fairness dominates
    # so we don't pile every exam onto day-0.
    model.Minimize(10 * sum(earliness_terms) + 100 * fairness)

    # ─── Solve ────────────────────────────────────────────────────────────
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(payload.max_solver_duration_seconds)
    solver.parameters.num_search_workers = 1
    solver.parameters.log_search_progress = False

    callback = ExamEarlyStopCallback()
    watchdog = WallClockWatchdog(
        solver,
        callback,
        threshold_seconds=_EXAM_STAGNATION_SECONDS,
    )
    watchdog.start()
    try:
        status = solver.Solve(model, callback)
    finally:
        watchdog.stop()
    solve_ms = int((time.perf_counter() - started) * 1000)

    # Time saved is the difference between the configured budget and the
    # actual sidecar wall-clock — meaningful only when early stop halted
    # the solver before the ceiling.
    time_saved_ms = max(
        0, payload.max_solver_duration_seconds * 1000 - solve_ms
    ) if callback.triggered else 0

    logger.info(
        "exam solve finished",
        extra={
            "status": solver.StatusName(status),
            "exams": num_exams,
            "days": num_days,
            "rooms": num_rooms,
            "invigilators": num_invig,
            "duration_ms": solve_ms,
            "early_stop_triggered": callback.triggered,
            "termination_reason": callback.reason,
            "improvements_found": callback.improvements_found,
            "first_solution_wall_time_seconds": callback.first_solution_wall_time,
            "final_objective_value": callback.best_objective,
            "time_saved_ms": time_saved_ms,
        },
    )

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        status_label: str
        if status == cp_model.INFEASIBLE:
            status_label = "infeasible"
        else:
            status_label = "unknown"
        return ExamSolverOutput(
            status=status_label,  # type: ignore[arg-type]
            slots=[],
            solve_time_ms=solve_ms,
            message=(
                "CP-SAT could not place every exam within the window/resources. "
                "Widen the session, add rooms, or enlarge the invigilator pool."
            )
            if status == cp_model.INFEASIBLE
            else f"Solver returned {solver.StatusName(status)}",
            early_stop_triggered=callback.triggered,
            termination_reason=callback.reason,
            improvements_found=callback.improvements_found,
            first_solution_wall_time_seconds=callback.first_solution_wall_time,
            final_objective_value=callback.best_objective,
            time_saved_ms=time_saved_ms,
        )

    out_slots: list[ExamSolverSlot] = []
    for e_idx, exam in enumerate(exams):
        chosen_d = -1
        chosen_s = -1
        for d_idx in range(num_days):
            for s_idx in range(num_slots):
                if solver.Value(slot_assign[e_idx][d_idx][s_idx]) == 1:
                    chosen_d = d_idx
                    chosen_s = s_idx
                    break
            if chosen_d >= 0:
                break
        if chosen_d < 0:
            # Should never happen — constraint forces exactly 1 placement.
            continue

        start_minutes = geom.slot_start(chosen_s)
        end_minutes = start_minutes + exam.duration_minutes

        room_assignments = _assign_rooms_to_exam(
            exam=exam,
            used_room_indices=[
                r
                for r in range(num_rooms)
                if solver.Value(uses_room[e_idx][r]) == 1
            ],
            rooms=payload.rooms,
        )

        invig_ids = [
            invigilators[i].staff_profile_id
            for i in range(num_invig)
            if solver.Value(invig_assign[e_idx][i]) == 1
        ]

        out_slots.append(
            ExamSolverSlot(
                exam_subject_config_id=exam.exam_subject_config_id,
                paper_number=exam.paper_number,
                date=dates[chosen_d].isoformat(),
                start_time=_minutes_to_hhmm(start_minutes),
                end_time=_minutes_to_hhmm(end_minutes),
                room_assignments=room_assignments,
                invigilator_ids=invig_ids,
            )
        )

    status_label: str = "optimal" if status == cp_model.OPTIMAL else "feasible"
    return ExamSolverOutput(
        status=status_label,  # type: ignore[arg-type]
        slots=out_slots,
        solve_time_ms=solve_ms,
        early_stop_triggered=callback.triggered,
        termination_reason=callback.reason,
        improvements_found=callback.improvements_found,
        first_solution_wall_time_seconds=callback.first_solution_wall_time,
        final_objective_value=callback.best_objective,
        time_saved_ms=time_saved_ms,
    )


def _assign_rooms_to_exam(
    *,
    exam: ExamSolverExam,
    used_room_indices: list[int],
    rooms: list[object],
) -> list[ExamSolverRoomAssignment]:
    """Split student_count across the chosen rooms (largest-first).

    CP-SAT only decides *which* rooms an exam uses — how many students sit
    in each is determined here so the sum-of-capacity constraint stays
    linear. Largest-first is the natural choice for an in-person exam:
    fill the biggest room first, spill into smaller rooms only as needed.
    """
    if exam.mode != "in_person" or exam.student_count == 0 or not used_room_indices:
        return []
    picked = [rooms[r] for r in used_room_indices]  # type: ignore[index]
    picked.sort(key=lambda r: getattr(r, "capacity"), reverse=True)  # type: ignore[attr-defined]
    remaining = exam.student_count
    assignments: list[ExamSolverRoomAssignment] = []
    for r in picked:
        if remaining <= 0:
            break
        cap = int(getattr(r, "capacity"))  # type: ignore[attr-defined]
        take = min(cap, remaining)
        assignments.append(
            ExamSolverRoomAssignment(
                room_id=str(getattr(r, "room_id")),  # type: ignore[attr-defined]
                capacity=cap,
                student_count_in_room=take,
            )
        )
        remaining -= take
    return assignments
