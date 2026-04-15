"""Stage 9.5.2 §B — escalating-budget benchmark harness.

Runs the tier-4 / tier-5 / tier-6 fixture through the CP-SAT sidecar
across a configurable budget matrix, capturing placement completeness,
wall time, memory peak (if running locally against psutil), and
early-stop telemetry. Emits a CSV + a markdown summary.

Usage (from repo root):

    # Tier 4 local matrix (default 4 budgets × 3 runs each).
    python3 apps/solver-py/scripts/benchmark_scale.py --tier 4

    # Tier 6 on the server against the already-deployed sidecar.
    python3 apps/solver-py/scripts/benchmark_scale.py \
        --tier 6 \
        --sidecar-url http://127.0.0.1:5557 \
        --budgets 300,600,1800,3600 \
        --runs 3

    # Full matrix (all three tiers) — beware, tier-6 at 3600s × 3 runs
    # alone is ~3 hours wall clock.
    python3 apps/solver-py/scripts/benchmark_scale.py --tier all

Output lands in ``scheduler/OR CP-SAT/scale-proof-results-YYYY-MM-DD/``:

    scale-proof-results-YYYY-MM-DD/
      matrix.csv        raw run data (one row per (tier, budget, run_idx))
      summary.md        human-readable per-tier tables + markdown headers

The harness is deliberately unopinionated about *where* the sidecar
runs — it just talks to the URL. ``--sidecar-url`` defaults to the
localhost solver-py. Memory peaks are captured via psutil when
``--psutil-pid`` is set (typically when running locally with the
sidecar as a child uvicorn); in production-server mode the
orchestrator captures peaks out-of-band via ``ps -o rss=``.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import statistics
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = REPO_ROOT / "apps" / "solver-py" / "tests" / "fixtures"

DEFAULT_BUDGETS: dict[int, list[int]] = {
    4: [60, 120, 300, 600],
    5: [120, 300, 600, 1800],
    6: [300, 600, 1800, 3600],
}

FIXTURE_PATHS: dict[int, Path] = {
    4: FIXTURES_DIR / "tier-4-irish-secondary-large.seed42.json",
    5: FIXTURES_DIR / "tier-5-multi-campus-large.seed7.json",
    6: FIXTURES_DIR / "tier-6-college-level.seed11.json",
}


@dataclass
class RunResult:
    tier: int
    budget_seconds: int
    run_index: int
    seed: int
    status_code: int
    wall_seconds: float
    placed: int
    unassigned: int
    demand: int
    score: int
    max_score: int
    hard_violations: int
    cp_sat_status: str
    early_stop_triggered: bool
    early_stop_reason: str
    time_saved_ms: int
    sidecar_duration_ms: int
    memory_peak_mb: Optional[float]
    request_id: str
    error_code: Optional[str]
    error_message: Optional[str]
    raw: dict[str, Any] = field(default_factory=dict, repr=False)


def _load_fixture(tier: int) -> dict[str, Any]:
    path = FIXTURE_PATHS[tier]
    if not path.exists():
        sys.stderr.write(
            f"Fixture for tier {tier} missing at {path}. "
            "Run `pnpm --filter @school/shared exec ts-node "
            "src/scheduler/__tests__/fixtures/generate-tier-snapshots.ts` first.\n"
        )
        sys.exit(1)
    return json.loads(path.read_text())


def _patched(fixture: dict[str, Any], budget_s: int, seed: int) -> dict[str, Any]:
    """Return a shallow-patched copy with the desired budget + seed."""
    copy = json.loads(json.dumps(fixture))  # cheap deep copy for determinism
    copy["settings"]["max_solver_duration_seconds"] = budget_s
    copy["settings"]["solver_seed"] = seed
    return copy


def _post_solve(
    sidecar_url: str,
    payload: dict[str, Any],
    request_id: str,
    timeout_seconds: float,
) -> tuple[int, dict[str, Any]]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{sidecar_url.rstrip('/')}/solve",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Request-Id": request_id,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        try:
            body_json = json.loads(err.read().decode("utf-8"))
        except Exception:
            body_json = {"error": {"code": "UNKNOWN", "message": str(err)}}
        return err.code, body_json


def _memory_peak_mb(pid: Optional[int]) -> Optional[float]:
    if pid is None:
        return None
    try:
        import psutil  # type: ignore[import-untyped]
    except ImportError:
        sys.stderr.write(
            "psutil not installed; skipping memory peak capture. "
            "`pip install psutil` in the solver-py venv to enable.\n"
        )
        return None
    try:
        proc = psutil.Process(pid)
        rss = proc.memory_info().rss
        for child in proc.children(recursive=True):
            try:
                rss += child.memory_info().rss
            except psutil.NoSuchProcess:
                continue
        return rss / (1024 * 1024)
    except psutil.NoSuchProcess:
        return None


def _run_one(
    tier: int,
    budget_s: int,
    run_index: int,
    sidecar_url: str,
    psutil_pid: Optional[int],
    seed: int,
    request_id_prefix: str,
) -> RunResult:
    fixture = _load_fixture(tier)
    payload = _patched(fixture, budget_s, seed)
    demand = sum(
        c["min_periods_per_week"]
        * sum(
            len(yg["sections"])
            for yg in payload["year_groups"]
            if yg["year_group_id"] == c["year_group_id"]
        )
        for c in payload["curriculum"]
    )

    request_id = f"{request_id_prefix}-t{tier}-b{budget_s}-r{run_index}"
    timeout_seconds = max(budget_s + 120, 300)

    start = time.perf_counter()
    status_code, body = _post_solve(sidecar_url, payload, request_id, timeout_seconds)
    wall = time.perf_counter() - start

    # Memory peak, best-effort. Sampled once at end; in practice pm2's
    # monitor gives a better time series if you need it.
    mem = _memory_peak_mb(psutil_pid)

    if status_code != 200:
        err = body.get("error", {}) if isinstance(body, dict) else {}
        return RunResult(
            tier=tier,
            budget_seconds=budget_s,
            run_index=run_index,
            seed=seed,
            status_code=status_code,
            wall_seconds=wall,
            placed=0,
            unassigned=demand,
            demand=demand,
            score=0,
            max_score=0,
            hard_violations=0,
            cp_sat_status="error",
            early_stop_triggered=False,
            early_stop_reason="not_triggered",
            time_saved_ms=0,
            sidecar_duration_ms=0,
            memory_peak_mb=mem,
            request_id=request_id,
            error_code=str(err.get("code")),
            error_message=str(err.get("message", "")),
            raw=body if isinstance(body, dict) else {},
        )

    entries = body.get("entries", [])
    unassigned = body.get("unassigned", [])
    return RunResult(
        tier=tier,
        budget_seconds=budget_s,
        run_index=run_index,
        seed=seed,
        status_code=status_code,
        wall_seconds=wall,
        placed=len(entries),
        unassigned=len(unassigned),
        demand=demand,
        score=int(body.get("score", 0)),
        max_score=int(body.get("max_score", 0)),
        hard_violations=int(body.get("constraint_summary", {}).get("tier1_violations", 0)),
        cp_sat_status=str(body.get("cp_sat_status", "unknown")),
        early_stop_triggered=bool(body.get("early_stop_triggered", False)),
        early_stop_reason=str(body.get("early_stop_reason", "not_triggered")),
        time_saved_ms=int(body.get("time_saved_ms", 0)),
        sidecar_duration_ms=int(body.get("duration_ms", 0)),
        memory_peak_mb=mem,
        request_id=request_id,
        error_code=None,
        error_message=None,
        raw=body,
    )


def _emit_csv(results: list[RunResult], out_path: Path) -> None:
    columns = [
        "tier",
        "budget_seconds",
        "run_index",
        "seed",
        "status_code",
        "wall_seconds",
        "placed",
        "unassigned",
        "demand",
        "placement_ratio",
        "score",
        "max_score",
        "hard_violations",
        "cp_sat_status",
        "early_stop_triggered",
        "early_stop_reason",
        "time_saved_ms",
        "sidecar_duration_ms",
        "memory_peak_mb",
        "request_id",
        "error_code",
    ]
    with out_path.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(columns)
        for r in results:
            ratio = r.placed / max(r.demand, 1) if r.demand else 0.0
            w.writerow(
                [
                    r.tier,
                    r.budget_seconds,
                    r.run_index,
                    r.seed,
                    r.status_code,
                    f"{r.wall_seconds:.3f}",
                    r.placed,
                    r.unassigned,
                    r.demand,
                    f"{ratio:.4f}",
                    r.score,
                    r.max_score,
                    r.hard_violations,
                    r.cp_sat_status,
                    r.early_stop_triggered,
                    r.early_stop_reason,
                    r.time_saved_ms,
                    r.sidecar_duration_ms,
                    f"{r.memory_peak_mb:.1f}" if r.memory_peak_mb is not None else "",
                    r.request_id,
                    r.error_code or "",
                ]
            )


def _emit_markdown(
    results: list[RunResult], out_path: Path, started_at: str, sidecar_url: str
) -> None:
    by_tier: dict[int, list[RunResult]] = {}
    for r in results:
        by_tier.setdefault(r.tier, []).append(r)

    lines: list[str] = []
    lines.append(f"# Stage 9.5.2 scale-proof matrix — run {started_at}")
    lines.append("")
    lines.append(f"- Sidecar: `{sidecar_url}`")
    lines.append(f"- Results: {len(results)} runs")
    lines.append(f"- Fixtures: {', '.join(FIXTURE_PATHS[t].name for t in sorted(by_tier.keys()))}")
    lines.append("")

    for tier in sorted(by_tier.keys()):
        tier_results = by_tier[tier]
        lines.append(f"## Tier {tier}")
        lines.append("")
        lines.append(
            "| Budget (s) | Run | Placed / Demand | Ratio | Wall (s) | CP-SAT | Early-stop | Time saved (ms) | Memory (MB) |"
        )
        lines.append(
            "| ---------: | --: | :-------------: | ----: | -------: | :----- | :--------- | --------------: | ----------: |"
        )
        for r in sorted(
            tier_results, key=lambda r: (r.budget_seconds, r.run_index)
        ):
            ratio = r.placed / max(r.demand, 1) if r.demand else 0.0
            mem = f"{r.memory_peak_mb:.0f}" if r.memory_peak_mb is not None else "—"
            lines.append(
                f"| {r.budget_seconds} | {r.run_index} | {r.placed}/{r.demand} | "
                f"{ratio * 100:.1f}% | {r.wall_seconds:.1f} | {r.cp_sat_status} | "
                f"{r.early_stop_reason} | {r.time_saved_ms} | {mem} |"
            )
        lines.append("")

        # Summary stats per budget (mean / stdev wall, determinism check).
        buckets: dict[int, list[RunResult]] = {}
        for r in tier_results:
            buckets.setdefault(r.budget_seconds, []).append(r)
        lines.append("### Per-budget summary (mean of runs)")
        lines.append("")
        lines.append(
            "| Budget (s) | Avg placed | Avg wall (s) | Wall stdev | CP-SAT status dist | Early-stop dist | Max memory |"
        )
        lines.append(
            "| ---------: | ---------: | -----------: | ---------: | :----------------- | :-------------- | ---------: |"
        )
        for budget in sorted(buckets.keys()):
            bucket = buckets[budget]
            walls = [r.wall_seconds for r in bucket]
            placed_avg = statistics.mean(r.placed for r in bucket)
            mem_values = [r.memory_peak_mb for r in bucket if r.memory_peak_mb is not None]
            max_mem = f"{max(mem_values):.0f} MB" if mem_values else "—"
            stdev = (
                f"{statistics.stdev(walls):.2f}"
                if len(walls) >= 2
                else "—"
            )
            cp_dist = _count_dist(r.cp_sat_status for r in bucket)
            es_dist = _count_dist(r.early_stop_reason for r in bucket)
            lines.append(
                f"| {budget} | {placed_avg:.1f} | {statistics.mean(walls):.1f} | "
                f"{stdev} | {cp_dist} | {es_dist} | {max_mem} |"
            )
        lines.append("")

    out_path.write_text("\n".join(lines))


def _count_dist(values: Any) -> str:
    counts: dict[str, int] = {}
    for v in values:
        counts[str(v)] = counts.get(str(v), 0) + 1
    return ", ".join(f"{k}:{c}" for k, c in sorted(counts.items()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tier",
        choices=("4", "5", "6", "all"),
        default="4",
        help="Which tier(s) to benchmark. Defaults to 4.",
    )
    parser.add_argument(
        "--budgets",
        default=None,
        help="Comma-separated budget list in seconds. Defaults to the tier's spec matrix.",
    )
    parser.add_argument("--runs", type=int, default=3, help="Runs per budget (default 3).")
    parser.add_argument(
        "--sidecar-url",
        default=os.environ.get("SOLVER_PY_URL", "http://127.0.0.1:5557"),
        help="Sidecar URL (defaults to SOLVER_PY_URL env or localhost:5557).",
    )
    parser.add_argument(
        "--seeds",
        default="0,0,0",
        help=(
            "Comma-separated seed list (one per run) for determinism verification. "
            "Defaults to `0,0,0` — same seed across runs so we can check byte-"
            "identical output."
        ),
    )
    parser.add_argument(
        "--psutil-pid",
        type=int,
        default=None,
        help="Sidecar PID for local memory-peak capture via psutil.",
    )
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Override output dir (default: scheduler/OR CP-SAT/scale-proof-results-YYYY-MM-DD).",
    )
    parser.add_argument(
        "--request-id-prefix",
        default=f"scale-{datetime.now(tz=timezone.utc).strftime('%Y%m%d%H%M%S')}",
        help="Prefix for per-run X-Request-Id headers.",
    )
    args = parser.parse_args()

    tiers = [int(args.tier)] if args.tier != "all" else [4, 5, 6]
    seeds = [int(s) for s in args.seeds.split(",")]
    if len(seeds) < args.runs:
        # Repeat-pad the last seed to fill runs.
        seeds = seeds + [seeds[-1]] * (args.runs - len(seeds))
    seeds = seeds[: args.runs]

    out_dir = (
        Path(args.out_dir)
        if args.out_dir
        else REPO_ROOT
        / "scheduler"
        / "OR CP-SAT"
        / f"scale-proof-results-{datetime.now(tz=timezone.utc).strftime('%Y-%m-%d')}"
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    started_at = datetime.now(tz=timezone.utc).isoformat(timespec="seconds")

    results: list[RunResult] = []
    for tier in tiers:
        budget_list = (
            [int(b) for b in args.budgets.split(",")]
            if args.budgets
            else DEFAULT_BUDGETS[tier]
        )
        for budget_s in budget_list:
            for run_index in range(args.runs):
                sys.stderr.write(
                    f"[{datetime.now(tz=timezone.utc).strftime('%H:%M:%S')}] "
                    f"tier={tier} budget={budget_s}s run={run_index+1}/{args.runs} "
                    f"seed={seeds[run_index]}…\n"
                )
                sys.stderr.flush()
                r = _run_one(
                    tier=tier,
                    budget_s=budget_s,
                    run_index=run_index,
                    sidecar_url=args.sidecar_url,
                    psutil_pid=args.psutil_pid,
                    seed=seeds[run_index],
                    request_id_prefix=args.request_id_prefix,
                )
                results.append(r)
                sys.stderr.write(
                    f"  → placed {r.placed}/{r.demand} in {r.wall_seconds:.1f}s "
                    f"(cp_sat={r.cp_sat_status}, early_stop={r.early_stop_reason})\n"
                )
                sys.stderr.flush()

    csv_path = out_dir / "matrix.csv"
    md_path = out_dir / "summary.md"
    _emit_csv(results, csv_path)
    _emit_markdown(results, md_path, started_at, args.sidecar_url)

    sys.stderr.write(f"\nWrote {csv_path}\nWrote {md_path}\n")


if __name__ == "__main__":
    main()
