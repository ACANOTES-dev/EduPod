"""CP-SAT solver implementation for the EduPod scheduling sidecar."""

from solver_py.solver.solve import SolveError, solve
from solver_py.solver.subprocess_solve import (
    SolverCrashError,
    SubprocessResult,
    solve_in_subprocess,
)

__all__ = [
    "SolveError",
    "SolverCrashError",
    "SubprocessResult",
    "solve",
    "solve_in_subprocess",
]
