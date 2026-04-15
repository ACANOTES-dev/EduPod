# Stage 9.5.2 — Scale proof: Irish secondary + college-level fixtures (state-of-the-art bar)

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 9.5.1 is `complete` and Stage 9.5.2 is `pending`. **Stage 9.5.1 must have landed early-stop** — this stage's larger budgets are predicated on early-stop ensuring fast closure for easy cases. Without it, a 1-hour budget would waste up to 3540 s of CPU per solve.

## Purpose

Prove CP-SAT scales to state-of-the-art requirements. We are using a state-of-the-art constraint solver; the product's positioning claims the same. That claim is only earned once the solver demonstrably handles real-world scale — and today, we have never measured it above ~440 lessons (NHQS). This stage closes that gap.

**Three scale tiers to exercise:**

1. **Tier 4 — Irish secondary (large)** — 1000-1200 lesson demand. Represents a single school at the upper end of typical Irish / UAE secondary scale: 40-50 classes, 80 teachers, ~200 curriculum entries per week, 45-slot grid.
2. **Tier 5 — MAT / multi-campus** — 2000-2500 lesson demand. Represents a single shared scheduling workload across a Multi-Academy Trust or a multi-campus school: 80-100 classes, 150-180 teachers.
3. **Tier 6 — college / thousands of requirements** — 3000+ lesson demand. Represents a college / large sixth-form or a dense university timetable: 120+ sections, thousands of individual scheduling requirements.

For each tier, the bar is:

- **Placement completeness ≥ 98 %** on a fixture known to be feasible (or documented reason for gap if not).
- **Wall time within a configurable budget** — stage proves the budget architecture works, not that CP-SAT always finishes in 30 s.
- **Deterministic output** under fixed seed.
- **Memory peak under 4 GB** (current sidecar `max_memory_restart` is 2 GB; raise to 4 GB if Tier 6 requires it).

**Secondary deliverable:** calibrate per-tenant-size budget recommendations. A small school should not default to a 30-minute budget; a college should not default to 60 s. The recommendations become part of `PLAN.md` and of the tenant-config documentation.

## Prerequisites

- **Stage 9.5.1 complete.** Early-stop callback in place, validated to halt cleanly on easy cases. Without this, every Tier-6 solve burns 1 hour of CPU.
- Stage 9 carryovers all resolved (supervision fixture rebuilt, STRESS-021 residual handled).
- Production stable post-Stage-9.5.1 deploy.
- `ortools==9.15.6755` still pinned (multi-worker still blocked; single-worker at scale is what this stage measures).

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** No `git push`, no `gh pr create`, no GitHub UI.
- **Deploy via rsync + SSH** to `root@46.62.244.139`.
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH / pm2 / rsync.

This stage is mostly **local fixture synthesis + local solve runs + server-side smoke on the new fixtures**. Some scale tests may exceed local dev-machine capacity; those run on the server directly against the production sidecar with the lock held.

---

## Scope

### A. Fixture synthesis

**File:** new `packages/shared/src/scheduler/__tests__/fixtures/tier-4-5-6-generators.ts`. Checked in alongside the existing parity fixtures.

Three generators, all deterministic via `mulberry32(seed)`:

#### A.1 `buildTier4IrishSecondaryLarge(seed: number): SolverInputV3`

Target shape:

- **Year groups:** 6 (Y7-Y12, matching Irish secondary).
- **Classes per year:** 7-9, total ≈ 50 classes.
- **Teachers:** 80, with realistic competency distributions (core subjects have multiple qualified, specialists have one or two).
- **Subjects:** 18 (English, Maths, Irish, History, Geography, Science, Biology, Chemistry, Physics, PE, Art, Music, Business, Religion, French, Spanish, Technology, IT).
- **Rooms:** 55 (40 classrooms + 3 science labs + 2 art rooms + 1 music room + 2 PE halls + 1 IT lab + 6 break-out / library spaces).
- **Period grid:** 45 slots (5 days × 9 periods).
- **Curriculum demand:** ~1100 lessons/week (realistic Irish secondary figure).
- **Pinned entries:** 3-5 % of lessons (e.g. year-head meetings, fixed-time specialist sessions).
- **Preferences:** 30-40 % of teachers have at least one time-slot or class preference.
- **Supervision:** realistic medium-density (4 zones × 3 breaks × 5 days = 60 slots).

Seed explicit; same seed → byte-identical JSON out.

#### A.2 `buildTier5MultiCampusLarge(seed: number): SolverInputV3`

Target shape:

- **Year groups:** 7 (Y7-Y13 or equivalent).
- **Classes per year:** 12-15, total ≈ 95 classes.
- **Teachers:** 160.
- **Subjects:** 22.
- **Rooms:** 100.
- **Period grid:** 50 slots (5 days × 10 periods).
- **Curriculum demand:** ~2200 lessons/week.
- **Pinned entries:** 5 %.
- **Preferences:** 40 % of teachers.
- **Supervision:** denser; 9 zones × 3 breaks × 5 days = 135 slots.

#### A.3 `buildTier6CollegeLevel(seed: number): SolverInputV3`

Target shape:

- **Year groups:** 3 (equivalent to Year 1 / Year 2 / Year 3 of a college programme).
- **Sections per year:** 40-50, total ≈ 130 sections (larger groupings than secondary classes).
- **Teachers / lecturers:** 180.
- **Subjects / modules:** 35 (more granular than secondary — each module is typically 2-4 hours/week).
- **Rooms:** 130 (including 30 specialist labs / workshops / studios).
- **Period grid:** 50 slots (5 days × 10 periods).
- **Curriculum demand:** ~3200 lessons/week.
- **Pinned entries:** 2-3 %.
- **Preferences:** 50 % of lecturers.
- **Supervision:** minimal (colleges rarely have yard duty; use `break_groups: []`).

**All three generators output canonical JSON via `model_dump(mode="json")` on the Python side for round-trip fixtures.** Add minimal round-trip pytest that reads the TS-generated JSON, parses it through pydantic, re-serialises, and asserts byte equality. Catches contract drift.

**Guardrails on generators:**

- Never produce a structurally infeasible fixture on purpose. Each generator asserts, after construction, that `total_qualified_teacher_periods >= total_demand_periods × 1.1`. If not, scale supply up until it is.
- Output size: Tier 6's JSON will be ~3-5 MB. Keep compressed snapshots (`.json.gz`) alongside `.json` to avoid bloating the repo. CI reads from `.json`; PRs add only the gzipped version when a fixture regenerates.

### B. Escalating-budget measurement harness

**File:** new `apps/solver-py/scripts/benchmark_scale.py`.

For each fixture, run with budgets `[60, 120, 300, 600, 1800, 3600]` seconds. Capture:

- `placed / demand` ratio.
- Soft score / max_score.
- Wall time (actual, not budget).
- `early_stop_triggered` + reason + `time_saved_ms`.
- Memory peak (via `/usr/bin/time -v` or equivalent).
- Hard-constraint violations (should be 0 on every run).
- `cp_sat_status` distribution across runs.

Output a markdown table per fixture + a CSV dump for plotting.

**Run matrix:**

| Fixture | Budgets (seconds)    | Runs per budget                        |
| ------- | -------------------- | -------------------------------------- |
| tier-4  | 60, 120, 300, 600    | 3 (deterministic; should be identical) |
| tier-5  | 120, 300, 600, 1800  | 3                                      |
| tier-6  | 300, 600, 1800, 3600 | 3                                      |

3 runs per cell proves determinism on the fixture + seed under the new early-stop.

**Where to run:**

Tier 4 runs locally on the dev machine. Tier 5 and Tier 6 probably don't — they need more memory / CPU stability than a laptop delivers. Run Tier 5 and Tier 6 on the production server under the server lock, using the already-deployed sidecar. Schedule the runs during low-traffic hours; no tenant impact.

### C. Diminishing-returns analysis

From the matrix in §B, plot for each fixture:

- **Placement completeness vs budget** (x = budget seconds, y = placed / demand).
- **Wall time vs budget** (x = budget, y = actual wall time — verifies early-stop closes fast when possible).
- **Memory peak vs budget**.

Identify the **knee** — the budget past which additional time yields < 1 % additional placement. That's the recommended default for that size tier.

**Expected shapes:**

- Tier 4: knee likely at 120-180 s. Placement approaches 100 % within budget for this scale.
- Tier 5: knee likely at 300-600 s. Placement may reach 95-98 %.
- Tier 6: knee likely at 1800 s. Placement may reach 90-95 %. If lower, investigate whether the bottleneck is greedy-quality (STRESS-021-style) or CP-SAT tree search at scale.

**Do not fabricate the knee.** If the curve is ambiguous or non-monotonic, report it honestly and defer the recommendation until more data is in.

### D. Per-tenant-size budget recommendations

Based on the measured knees, produce a recommendation table for the tenant-config docs:

| Tenant class  | Lesson demand | Recommended `max_solver_duration_seconds` | Max reasonable |
| ------------- | ------------- | ----------------------------------------- | -------------- |
| Very small    | < 100         | 30                                        | 60             |
| Small         | 100-300       | 60 (current default)                      | 120            |
| Medium        | 300-700       | 120                                       | 300            |
| Large         | 700-1500      | 300                                       | 900            |
| Very large    | 1500-3000     | 900                                       | 1800           |
| College / MAT | 3000+         | 1800                                      | 3600           |

(Values above are placeholders — the actual numbers come from §C measurements. Fill in from data.)

Update `docs/features/scheduling.md` (or equivalent tenant-facing doc) with this table and a short "when to raise the budget" paragraph.

### E. Memory ceiling review

**Current:** sidecar `max_memory_restart: '2G'` in `ecosystem.config.cjs`.

**Question:** does Tier 6 at 3600 s budget exceed 2 GB RSS?

**Procedure:** during §B Tier-6 runs, monitor `pm2 monit` + `ps -o rss= -p <solver-py-pid>` every 30 s. Capture peak.

**Decision rule:**

- If peak < 1.5 GB → leave ceiling at 2 GB. Document comfortable headroom.
- If peak 1.5-1.8 GB → raise ceiling to 3 GB, document the headroom choice.
- If peak > 1.8 GB → raise ceiling to 4 GB, investigate whether a memory leak exists (sustained growth over the 3600 s vs one-time allocation).

Update `ecosystem.config.cjs` if raised. This is a server-side deploy concern; bundle with the stage's final commit.

### F. Documentation

Update `PLAN.md`:

- **Target metrics section:** add a "Benchmark 3 — state-of-the-art scale" subsection citing the tier-4/5/6 measurements. Matches the structure already in place for benchmark 1 (stress-a) and benchmark 2 (nhqs).
- **Canonical test tenants section:** mention the new synthetic fixtures even though they aren't DB-backed tenants.
- **Budget architecture paragraph:** explain the 1-hour ceiling, early-stop as safety mechanism, operation-specific budgets (scheduling long, simulation short).

Update `docs/features/scheduling.md` with the §D recommendation table.

Update the Stage 5 parity harness (`cp-sat-regression.test.ts`) to include tier-4 in its CI run (tier-5 and tier-6 too heavy for CI — run as nightly or on-demand).

### G. Optional: Dockerised sidecar for CI

Stage 8 left `cp-sat-regression.test.ts` effectively skipped in CI because the sidecar isn't reachable. Stage 9.5.2 adds tier-4 to that harness; if CI can't run it, we're back to a trivial skip.

**If Stage 9's sidecar-CI slot (Session 2a's work) is in place and working:** extend it to include tier-4 + supervision-realistic-medium. If not: scope a minimal GitHub Actions job that spins up a Docker container with the sidecar, runs `cp-sat-regression.test.ts`, tears down. Out-of-scope only if the existing CI slot is already doing this — verify first.

## Non-goals

- **Do not** build per-solve auto-budget heuristics. Admin configures the budget; we recommend values; we don't infer.
- **Do not** optimise the CP-SAT model for scale unless a specific fixture reveals a genuine defect. This stage measures; it doesn't re-engineer.
- **Do not** attempt to reach 100 % placement on tier-6 if the measurement shows a hard ceiling. Report honestly.
- **Do not** introduce multi-worker. Still upstream-blocked.
- **Do not** build tier-4 / 5 / 6 as DB-backed tenants. Fixtures are in-memory `SolverInputV3` objects. DB-round-tripping is a Stage 9.5.2+ product decision.

## Step-by-step

1. Acquire server lock with reason "Stage 9.5.2 scale proof Tier 4-6".
2. Implement §A generators with unit tests (round-trip JSON, seed determinism, infeasibility-guardrail).
3. Implement §B benchmark script. Run tier-4 locally first. If local wall time + memory look healthy, proceed to tier-5 and tier-6 on the server.
4. Run the full budget matrix (§B). Collect results in a CSV. Check in a copy of the CSV + a markdown summary at `scheduler/OR CP-SAT/scale-proof-results-YYYY-MM-DD.md`.
5. Generate §C plots (matplotlib or equivalent; inline PNG export into the scale-proof markdown). Identify knees.
6. Populate §D recommendation table with measured knees. Update `docs/features/scheduling.md`.
7. §E memory review: capture peak for each tier, decide on `max_memory_restart` ceiling, rsync updated `ecosystem.config.cjs` if needed.
8. Update §F `PLAN.md` target-metrics + benchmark-3 subsection.
9. Extend CI regression harness (§G) to include tier-4.
10. Run local `pnpm --filter @school/shared test`, `apps/solver-py pytest`, DI smoke → all green.
11. Commit locally (grouped):
    - `feat(scheduling): tier-4/5/6 fixture generators + round-trip tests`
    - `chore(scheduling): benchmark_scale.py harness`
    - `test(scheduling): tier-4 added to cp-sat regression harness`
    - `docs(scheduling): scale proof results + budget-size recommendations`
    - `chore(scheduling): raise sidecar max_memory_restart` (if applicable)
12. Deploy sidecar (if memory ceiling changed) + worker (if env changed). Otherwise sidecar untouched; this is mostly a measurement + documentation deploy.
13. Post-deploy smoke: rerun tier-4 on the server sidecar to confirm local-matching-production determinism.
14. Release server lock with summary.
15. Flip status-board row 9.5.2 `pending` → `complete`. Append completion entry.

## Testing requirements

- pytest: fixture round-trip + deterministic-output tests for tier-4, tier-5, tier-6.
- TS: `cp-sat-regression.test.ts` passes with tier-4 added.
- CI: sidecar-dockerised harness runs tier-4 successfully on every PR (if §G lands).
- Benchmark matrix §B complete for all three tiers.
- Memory peak captured for tier-6 at maximum budget.
- Determinism re-verified at scale: 3 runs of tier-4 at 300 s budget produce SHA-256-matching outputs (modulo `duration_ms`).

## Acceptance criteria

- [ ] `tier-4-5-6-generators.ts` present; three generators emit deterministic canonical JSON with seed-explicit output.
- [ ] Python round-trip tests green for all three fixtures.
- [ ] `benchmark_scale.py` present; full matrix run recorded in `scheduler/OR CP-SAT/scale-proof-results-YYYY-MM-DD.md`.
- [ ] Placement completeness reported per tier per budget; diminishing-returns plots generated.
- [ ] Recommended budget defaults documented in `docs/features/scheduling.md` (filled from measured knees, not prescribed).
- [ ] Memory peak captured for tier-6; ceiling decision documented with evidence.
- [ ] `PLAN.md` updated with Benchmark 3 section + budget architecture paragraph.
- [ ] Tier-4 added to `cp-sat-regression.test.ts`; passes locally and in CI.
- [ ] Determinism verified at scale: tier-4 × 3 runs × 300 s → byte-identical `entries` + `unassigned`.
- [ ] Tier-4 placement ≥ 98 % on feasibly-designed fixture.
- [ ] Tier-5 placement ≥ 95 % on feasibly-designed fixture.
- [ ] Tier-6 placement: reported honestly; ≥ 90 % is the bar, but lower acceptable with diagnosis of cause (e.g. "greedy at this scale needs improvements; CP-SAT closes remaining gap in X additional seconds").
- [ ] Server lock released; completion entry appended; status-board row flipped.

## If something goes wrong

- **Tier-6 placement < 90 %.** Diagnose whether the gap is greedy quality (hint is poor at scale → CP-SAT inherits) or CP-SAT tree-search scale (hint is fine, CP-SAT genuinely cannot close in budget). Distinguish via: run tier-6 with CP-SAT disabled (greedy only) and measure placement. If greedy-only matches full-solve placement, the gap is greedy. If CP-SAT+greedy improves over greedy-only, CP-SAT is working, we're just budget-bound. Report the finding; don't force a fix if diagnosis is the deliverable.
- **Tier-6 exceeds 4 GB memory.** OR-Tools internal buffers growing with variable count. Options: (a) reduce the fixture's pruning aggressiveness to produce fewer variables; (b) investigate if OR-Tools has a memory-per-worker tunable; (c) accept that tier-6 requires a more powerful server than the current 2GB-capped pm2 app allows.
- **Memory leak surfaces over successive tier-6 runs.** RSS grows unbounded across 3 consecutive solves of the same fixture. That's a real leak in the sidecar. Investigate before shipping — tier-6 workloads on production would trigger pm2 restart storms.
- **Early-stop fails to trigger on tier-4 with 300 s budget.** Means the stagnation threshold is too loose for small-scale solves. Tune thresholds (probably `stagnation_seconds` down from 8 s) and re-run. Do not ship the stage with "easy cases burn full budget."
- **Tier-4 passing locally but failing in CI via docker.** Container environment / FP determinism differs from macOS dev. CP-SAT is deterministic per spec; any divergence is an OR-Tools version mismatch or a `libc` / `libstdc++` divergence. Pin container base image OS version to match the production server's (Ubuntu 24.04); rebuild.

## What the completion entry should include

- Full benchmark matrix (tier × budget × placement × wall × memory × early-stop-triggered).
- Diminishing-returns plots (embedded or linked).
- Measured budget knees per tier.
- Proposed default budget table (pre vs post — currently all tenants default to 60 s).
- `max_memory_restart` ceiling decision + evidence.
- Determinism verification evidence at scale.
- Any surprises: scale at which greedy quality becomes a bottleneck, memory trajectory shape, CP-SAT tree-search behavior at thousands of variables.
- Commit SHAs per grouping.
- Solver rating update (projected 4.5 → 4.75 if tier-4/5 clean; 4.75 → ~5 if tier-6 also meets bar).
- Which Wave-5 remainders (SCHED-019 sym 2, bulk auto-assign, CSV export) remain untouched.

## Why this stage matters for the enterprise positioning

The product positioning hinges on "state-of-the-art scheduling" — not because CP-SAT is named-dropped in marketing, but because a school can genuinely put a thousand-lesson week in front of it and get a correct schedule. Today, we have not measured that. We have Stage 9's evidence for up to 440 lessons (NHQS), and Stage 5's synthetic Tier-3 gap at 1095 lessons. Until Stage 9.5.2 measures true production-scale workloads with the expanded-budget + early-stop architecture, the "state-of-the-art" claim is theoretical.

This stage turns it from theoretical into measured. If the solver clears tier-4 and tier-5 cleanly, the pitch becomes "we have measured and proven this on 2000-lesson weekly workloads." If tier-6 exposes a ceiling, we report that honestly and plan the next stage of improvements — but we are not shipping a claim we haven't tested. The bar for state-of-the-art is evidence, not aspiration.
