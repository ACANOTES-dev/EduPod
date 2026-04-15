# Stage 2 — JSON contract (pydantic models mirroring SolverInputV2 / SolverOutputV2)

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 1 is `complete` and Stage 2 is `pending`.

## Purpose

Define the over-the-wire contract between the TypeScript worker and the Python sidecar. On the Python side this lives as pydantic v2 models that strictly mirror the TypeScript `SolverInputV2` / `SolverOutputV2` types from `packages/shared/src/scheduler/types-v2.ts`. A round-trip fixture proves every field survives JSON → pydantic → JSON without data loss.

This is the foundation every subsequent stage depends on. If this contract is wrong, CP-SAT gets wrong data and Stage 3 will model the wrong problem.

## Prerequisites

- **Stage 1 complete.** The sidecar service exists with FastAPI + pydantic installed.

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline (a CI run takes ~3 hours and would stall the migration).
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage is **local only** — no server deploy, no lock required.

---

## Scope — what to create

### A. Read the TypeScript source of truth

Open `packages/shared/src/scheduler/types-v2.ts` in full. The authoritative types are:

- `SolverInputV2`
- `YearGroupInput`
- `CurriculumEntry`
- `TeacherInputV2`
- `TeacherCompetencyInput`
- `TeacherAvailabilityWindow`
- `TeacherPreferenceInput`
- `RoomInfoV2`
- `RoomClosureInput`
- `BreakGroupInput`
- `PinnedEntryV2`
- `StudentOverlapV2`
- `PeriodSlotV2`
- `SolverSettingsV2`
- `ClassSubjectOverrideAudit`
- `SolverOutputV2`
- `SolverAssignmentV2`
- `SolverUnassignedEntry`
- `SolverQualityMetrics`

Every field becomes a pydantic field. Every nullable TS field becomes `Optional[...] = None`. Every array becomes `list[...]`. Every literal union becomes a pydantic `Literal[...]`.

### B. `apps/solver-py/src/solver_py/schema/__init__.py` + `input.py` + `output.py`

Split the models so input and output are separate imports:

```python
# schema/input.py
from pydantic import BaseModel, Field
from typing import Literal

PeriodType = Literal["teaching", "supervision", "break", "prep"]
SupervisionMode = Literal["none", "supervised", "self_supervised"]

class PeriodSlotV2(BaseModel):
    weekday: int = Field(ge=0, le=6)
    period_order: int = Field(ge=0)
    start_time: str  # "HH:MM"
    end_time: str    # "HH:MM"
    period_type: PeriodType
    supervision_mode: SupervisionMode
    break_group_id: str | None = None

class YearGroupSection(BaseModel):
    class_id: str
    class_name: str
    student_count: int

class YearGroupInput(BaseModel):
    year_group_id: str
    year_group_name: str
    sections: list[YearGroupSection]
    period_grid: list[PeriodSlotV2]

# ... continue for every type

class SolverInputV2(BaseModel):
    year_groups: list[YearGroupInput]
    curriculum: list[CurriculumEntry]
    teachers: list[TeacherInputV2]
    rooms: list[RoomInfoV2]
    room_closures: list[RoomClosureInput]
    break_groups: list[BreakGroupInput]
    pinned_entries: list[PinnedEntryV2]
    student_overlaps: list[StudentOverlapV2]
    settings: SolverSettingsV2
    overrides_applied: list[ClassSubjectOverrideAudit] | None = None
```

```python
# schema/output.py
from pydantic import BaseModel

class SolverAssignmentV2(BaseModel):
    id: str
    class_id: str
    subject_id: str
    teacher_staff_id: str
    room_id: str | None
    weekday: int
    period_order: int
    is_pinned: bool
    start_time: str | None = None
    end_time: str | None = None

class SolverUnassignedEntry(BaseModel):
    year_group_id: str
    subject_id: str
    class_id: str | None
    periods_remaining: int
    reason: str

# ... etc

class SolverOutputV2(BaseModel):
    entries: list[SolverAssignmentV2]
    unassigned: list[SolverUnassignedEntry]
    quality_metrics: SolverQualityMetrics | None = None
    constraint_summary: ConstraintSummary
    score: int
    max_score: int
    duration_ms: int
```

### C. Round-trip test fixture

Add a JSON fixture at `apps/solver-py/tests/fixtures/solver_input_minimal.json` — a small but complete `SolverInputV2` payload with one year group, one class, one subject, one teacher, one room, one period. Borrow the shape from `packages/shared/src/scheduler/__tests__/class-subject-override.test.ts` (which already builds a valid input via `buildTwoClassInput()`).

Add a pytest at `apps/solver-py/tests/test_schema_roundtrip.py`:

```python
import json
from pathlib import Path
from solver_py.schema.input import SolverInputV2

def test_solver_input_v2_roundtrips():
    raw = json.loads((Path(__file__).parent / "fixtures" / "solver_input_minimal.json").read_text())
    parsed = SolverInputV2.model_validate(raw)
    serialised = parsed.model_dump(mode="json", by_alias=True)
    # The re-serialised form must be structurally identical to the input.
    # Key order is irrelevant; value equality is what matters.
    assert serialised == raw
```

### D. Wire the stub `/solve` to parse input (but still 501 on logic)

Update the stub `/solve` handler to parse the request body as `SolverInputV2`, log a summary (counts of year_groups / teachers / classes / curriculum entries), and return 501 with the structured error envelope. This validates the contract end-to-end even before CP-SAT exists.

```python
@app.post("/solve")
def solve(request: SolverInputV2) -> JSONResponse:
    logger.info(
        "received solve request",
        extra={
            "year_groups": len(request.year_groups),
            "classes": sum(len(yg.sections) for yg in request.year_groups),
            "teachers": len(request.teachers),
            "curriculum_entries": len(request.curriculum),
            "pinned_entries": len(request.pinned_entries),
        },
    )
    return JSONResponse(
        status_code=501,
        content={
            "error": {
                "code": "NOT_IMPLEMENTED",
                "message": "CP-SAT modelling lands in stage 3; input parsed cleanly.",
            }
        },
    )
```

A malformed body should return 422 (FastAPI default for pydantic validation failures) — **don't** rewrite the error to 400. Stage 6's TS client handles 422 specifically.

### E. Add a parity sanity test on the TS side

At `packages/shared/src/scheduler/__tests__/cp-sat-contract.test.ts` — serialise a fixture `SolverInputV2` via `JSON.stringify` and assert the output matches the fixture the pydantic test consumes (byte-for-byte). This catches silent drift between the two ends.

## Non-goals for this stage

- **Do not** solve anything. `/solve` still returns 501.
- **Do not** write CP-SAT modelling code.
- **Do not** touch the worker or TS solver. No TS changes outside the test file.

## Step-by-step

1. Re-read `packages/shared/src/scheduler/types-v2.ts` in full. Note every field, every optional, every literal union.
2. Create `schema/input.py`, `schema/output.py`, `schema/__init__.py` (re-exporting everything).
3. Create the JSON fixture at `tests/fixtures/solver_input_minimal.json`. Keep it small — ~50 lines of JSON.
4. Create `test_schema_roundtrip.py`.
5. Update `main.py` stub `/solve` to parse input and log.
6. Run `pytest` — all tests green.
7. Run `ruff check` and `mypy --strict` — clean.
8. Create `packages/shared/src/scheduler/__tests__/cp-sat-contract.test.ts` with the same fixture (copy the JSON), assert `JSON.stringify(fixture) === fs.readFileSync(fixture_path_py)` or semantically compare via parsed object equality.
9. Run `pnpm --filter @school/shared test -- cp-sat-contract` — green.
10. Commit locally:

    ```
    feat(scheduling): define solver i/o contract as pydantic v2 models

    Mirrors SolverInputV2 / SolverOutputV2 from packages/shared types-v2.ts
    as strict pydantic models in apps/solver-py/src/solver_py/schema/.
    /solve stub now parses input (still 501) so contract drift surfaces
    early. Round-trip fixture shared with TS side via cp-sat-contract.test.
    Ruff + mypy clean; pytest green.

    Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
    ```

## Testing requirements

- `pytest` green in `apps/solver-py/`.
- `ruff check` + `mypy --strict` clean.
- `pnpm --filter @school/shared test -- cp-sat-contract` green.
- Manual: `curl -X POST http://localhost:5557/solve -H "Content-Type: application/json" -d @apps/solver-py/tests/fixtures/solver_input_minimal.json` returns 501 (not 422 — contract accepted).
- Manual: `curl -X POST http://localhost:5557/solve -H "Content-Type: application/json" -d '{"bogus":true}'` returns 422 with pydantic error detail.

## Acceptance criteria

- [ ] All `SolverInputV2` / `SolverOutputV2` types have pydantic equivalents.
- [ ] Round-trip test passes byte-for-byte.
- [ ] TS-side contract test passes.
- [ ] `/solve` parses input correctly; logs summary.
- [ ] `ruff`, `mypy`, pytest, jest all green.
- [ ] Local commit created.
- [ ] Completion entry appended.

## If something goes wrong

- **Pydantic reshapes a field on dump** (e.g. integer serialised as string): check `model_config = ConfigDict(json_schema_serialization_defaults_required=True)` and the field type. Usually means a TS `number` was mapped to `str` by mistake.
- **TS fixture and Python fixture drift:** this is the exact failure mode the contract test guards against. Fix the ones that lose data.
- **Unknown field in fixture:** pydantic v2 default is to allow extra fields silently. Tighten to `model_config = ConfigDict(extra="forbid")` at the root so unknown fields fail loudly.

## What the completion entry should include

- Every pydantic model name created.
- Fixture size (bytes / line count).
- Output of `pytest -v`.
- Commit SHA.
