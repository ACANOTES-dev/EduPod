# Stage 12 — Diagnostics module overhaul (state-of-the-art explainability)

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 11 is `complete`, Stage 9 shows clean production traffic under CP-SAT, and Stage 12 is `pending`. If Stage 11 is not done, stop — the contract reshape must land first because this stage assumes the Stage-10/11 `SolverInputV3` / `SolverOutputV3` shape.

## Purpose

Make the diagnostics module as powerful and as battle-tested as the solver it pairs with.

The existing `SchedulingDiagnosticsService` (`apps/api/src/modules/scheduling-runs/scheduling-diagnostics.service.ts`) was built for the legacy TypeScript solver. It runs four post-solve passes, surfaces reasonable diagnostics, and links to config pages with recommended solutions. It is a genuine strength of the product today. But it has three structural limits that CP-SAT lets us shatter:

1. **It's post-solve only.** A tenant with structurally impossible data waits the full solver budget for a partial answer before discovering they had a data problem. A pre-solve feasibility sweep could catch the same issues in < 50 ms.
2. **It reasons about symptoms, not root causes.** "teacher supply shortage" is a category — correct and useful — but it doesn't tell the admin _which specific constraint interaction_ produced the shortage. CP-SAT can. The solver has a formal certificate of infeasibility (Irreducible Infeasible Subset, "IIS") — the minimal set of constraints that together prove no solution exists. That's the real root cause. We can extract it, translate it, and surface it.
3. **It doesn't quantify trade-offs.** Every diagnostic says "do X, effort is quick/medium/long." What it should also say is: "doing X unblocks 8 of your 12 unplaced periods; doing Y unblocks 4; doing Z has no placement impact and is cosmetic." That is the information that drives admin behaviour.

On top of those, the migration itself creates new diagnostic opportunities:

- The greedy + CP-SAT hybrid (Stage 4) produces additional signal — e.g., "the greedy placed these 252 lessons; CP-SAT confirmed no better placement exists with your current constraints." Admins should see that as validation, not internal plumbing.
- The Stage 10 contract reshape surfaces CP-SAT-native fields that didn't exist in V2 — we should render them.

**The north star:** a non-technical school admin opens the diagnostics panel after a run and walks away knowing (a) what's broken, (b) exactly what to change, (c) the expected impact of each change, and (d) ranked priority — without needing to read any optimisation terminology. If they can't, we haven't finished the stage.

## Prerequisites

- **Stage 11 complete.** `SolverInputV3` / `SolverOutputV3` are the shape we target. Re-building diagnostics on the legacy shape would mean re-building a second time after Stage 11.
- **Stage 9 clean.** Production has been running on CP-SAT for ≥ 7 days with no sidecar restarts and no SCHED-### regressions. This stage is quality-of-life, not a shipping blocker.
- Sidecar (`apps/solver-py/`) is the authoritative solve engine and exposes `POST /solve` returning `SolverOutputV3`.
- The existing `SchedulingDiagnosticsService` is untouched since Stage 11 (Stage 10/11 only reshape the contract; this stage rebuilds the explainability layer on top of it).

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted; use it. Never via GitHub Actions.
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH / pm2 / rsync action. Release it with a summary when done.

This stage deploys to production (api rebuild + web rebuild + sidecar restart with a new `/diagnose` endpoint). Lock is required.

---

## Scope — what state-of-the-art diagnostics actually looks like

The rebuild has six pillars. Each is its own section below.

### A. Pre-solve feasibility sweep (new capability)

**Purpose:** Catch structural infeasibility in < 50 ms, _before_ the solver runs, so tenants find out in seconds instead of minutes.

Create `apps/api/src/modules/scheduling-runs/feasibility/feasibility.service.ts`. Public entrypoint:

```typescript
async runFeasibilitySweep(
  tenantId: string,
  input: SolverInputV3,
): Promise<FeasibilityReport>;
```

where `FeasibilityReport` is:

```typescript
export interface FeasibilityReport {
  verdict: 'feasible' | 'infeasible' | 'tight';
  checks: FeasibilityCheck[];
  ceiling: {
    total_demand_periods: number;
    total_qualified_teacher_periods: number;
    slack_periods: number; // positive = feasible, negative = definitively infeasible
  };
  diagnosed_blockers: FeasibilityBlocker[]; // ready to render verbatim
}
```

**Checks to implement** (all pure, deterministic, pre-solve — no CP-SAT call):

| Check                             | Test                                                                                                                                                                | Category                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Global capacity                   | `Σ (qualified-teacher-periods, per subject) ≥ Σ (demand-periods, per subject)`                                                                                      | `global_capacity_shortfall`  |
| Per-subject capacity              | For each subject _s_: `Σ (availability-periods of qualified teachers for s) ≥ demand(s)`                                                                            | `subject_capacity_shortfall` |
| Per-(class, subject) reachability | For each mandatory `(class, subject)`: at least one teacher exists who is (a) qualified for subject, (b) has ≥ 1 available slot overlapping class's available slots | `unreachable_class_subject`  |
| Weekly period budget              | For each class: `Σ (mandatory subject demand) ≤ weekly slot count − (pinned cells)`                                                                                 | `class_weekly_overbook`      |
| Pin conflict — teacher            | No two pinned entries assign the same teacher to overlapping slots                                                                                                  | `pin_conflict_teacher`       |
| Pin conflict — class              | No two pinned entries assign the same class to overlapping slots                                                                                                    | `pin_conflict_class`         |
| Pin conflict — room               | No two pinned entries assign the same room to overlapping slots                                                                                                     | `pin_conflict_room`          |
| Room-type coverage                | For each subject requiring a specific room type: `Σ (rooms of that type × weekly slots) ≥ demand`                                                                   | `room_type_shortfall`        |
| Double-period feasibility         | For each double-period subject: class and teacher each have ≥ 1 pair of consecutive available slots in the same day                                                 | `double_period_infeasible`   |
| Availability ∩ per-day cap        | For each teacher with `max_periods_per_day < availability_per_day`: warn; for each teacher where `max_per_day × active_days < demand`: infeasibility                | `per_day_cap_conflict`       |

Each failing check emits a `FeasibilityBlocker` record:

```typescript
export interface FeasibilityBlocker {
  id: string; // stable id for UI keying
  check: FeasibilityCheckCategory;
  severity: 'critical' | 'high';
  headline: string; // plain English, already translated
  detail: string; // plain English, one paragraph
  affected: {
    teachers?: { id: string; name: string }[];
    classes?: { id: string; label: string }[];
    subjects?: { id: string; name: string }[];
    rooms?: { id: string; name: string }[];
    slots?: { day: string; period: number }[];
  };
  quantified_impact: {
    blocked_periods: number; // how many periods this blocker prevents placing
    blocked_percentage: number; // blocked_periods / total_demand
  };
  solutions: DiagnosticSolution[]; // same shape as existing
}
```

**Wire into the orchestration flow:** `scheduler-orchestration.service.triggerSolverRun` calls the feasibility sweep _after_ `assembleSolverInput` but _before_ enqueueing the BullMQ job. If the verdict is `infeasible`, write the report to `scheduling_runs.feasibility_report` and set the run to `status = 'blocked'` with a new `failure_reason_code = 'STRUCTURAL_INFEASIBILITY'`. The worker skips blocked runs. The admin sees the diagnosis in < 1 s from clicking Generate.

If the verdict is `tight` or `feasible`, the run proceeds normally but the feasibility report is persisted so the post-solve diagnostics can cross-reference against it.

### B. Post-solve IIS extraction from CP-SAT (new capability)

**Purpose:** When CP-SAT returns unassigned lessons, ask it _why_ — and get a formal answer.

CP-SAT exposes `CpSolver.sufficient_assumptions_for_infeasibility()` when a model is UNSAT. For models that are SAT-but-partial (our case — greedy placed 252/260, CP-SAT can't improve) we use the _assumption-based refinement_ pattern:

- For each unassigned lesson _l_, temporarily add an assumption variable `a_l = 1` forcing _l_ to be placed.
- Call `solver.solve()` with assumptions `{a_k for k in unassigned}`.
- If UNSAT: `solver.sufficient_assumptions_for_infeasibility()` returns the minimal subset of lessons whose joint placement is infeasible.
- For each such subset, walk the model's constraint graph to identify the minimal set of _domain constraints_ (teacher availability, room capacity, pin, etc.) that together block those lessons.

**Implementation location:** new endpoint `POST /diagnose` on the sidecar. Request body:

```json
{
  "input": <SolverInputV3>,
  "output": <SolverOutputV3>,
  "max_subsets": 8
}
```

Response:

```json
{
  "subsets": [
    {
      "lessons": [{ "lesson_id": "...", "class_id": "...", "subject_id": "..." }],
      "blocking_constraints": [
        {
          "type": "teacher_unavailable",
          "teacher_id": "...",
          "slots": [{ "day": "mon", "period": 3 }]
        },
        {
          "type": "subject_demand_exceeds_capacity",
          "subject_id": "...",
          "shortfall_periods": 2
        }
      ]
    }
  ],
  "timed_out": false,
  "duration_ms": 420
}
```

Guardrails:

- Cap `max_subsets` at 20; each subset adds a solver call, each call capped at 3 s. The whole diagnose call is capped at 30 s total.
- Deterministic: fixed seed, single worker (diagnose mode, not parallel), sorted lesson iteration order.
- If CP-SAT times out on a subset, emit the subset with `timed_out: true` rather than omitting it.

**Wire into the API:** new method `diagnosticsService.refineWithIIS(tenantId, runId)` which:

1. Reads `config_snapshot` and `result_json` from the run.
2. Calls the sidecar `POST /diagnose` endpoint (via `cp-sat-client.ts` — add new method).
3. Folds each IIS subset into a `rootCauseDiagnostic` that replaces or augments the existing heuristic passes.
4. Persists the diagnosis to `scheduling_runs.diagnostics_refined_report` (new JSONB column).

**Caching:** refinement is expensive (up to 30 s). Compute it lazily on first diagnostics fetch _after_ a run completes, persist it, and serve from cache on subsequent requests. Expose a `POST /v1/scheduling-runs/:id/diagnostics/refresh` endpoint to force recomputation.

### C. Plain-English translation layer (new module)

**Purpose:** A single, audited registry that converts CP-SAT constraint names, IIS outputs, and feasibility-check identifiers into human-readable English and Arabic explanations.

Create `apps/api/src/modules/scheduling-runs/diagnostics-i18n/`:

```
diagnostics-i18n/
├── translator.service.ts
├── translator.service.spec.ts
└── translations/
    ├── en.ts                 // all English strings keyed by diagnostic code
    ├── ar.ts                 // all Arabic strings keyed by diagnostic code
    └── __tests__/coverage.spec.ts   // fails if a code has no en + ar translation
```

Every diagnostic code used anywhere in the stage (feasibility-check categories, IIS constraint types, legacy category names) MUST have an entry in both `en.ts` and `ar.ts`. The coverage spec enumerates all codes via a single source-of-truth `DIAGNOSTIC_CODES` enum and asserts bilingual coverage — so a new code cannot ship without translations.

**Translation shape:**

```typescript
interface DiagnosticTranslation {
  headline: (ctx: DiagnosticContext) => string; // "Mrs. Ahmed is over-subscribed for Arabic"
  detail: (ctx: DiagnosticContext) => string; // one-paragraph explanation with numbers
  solution_templates: Array<{
    id: string;
    effort: 'quick' | 'medium' | 'long';
    headline: (ctx: DiagnosticContext) => string;
    detail: (ctx: DiagnosticContext) => string;
    link_template: (ctx: DiagnosticContext) => string; // deep-links to config page
  }>;
}
```

Context is typed. `ctx.teacher.name`, `ctx.subject.name`, `ctx.shortfall_periods`, etc. are populated by the caller from the IIS or feasibility-check output. The translation functions are pure; they produce the exact strings the UI renders, no runtime interpolation in the frontend.

**Audit discipline:** every translation must be reviewed by a non-technical stakeholder before merge. The governance process for Stage 12 includes a "non-technical user test" — show each of the top 20 diagnostics to a teacher or head-of-year and verify they can state what needs to change without asking for clarification. Translations that fail this test are rewritten before the stage ships.

### D. Ranked, quantified solutions (rebuild of existing capability)

**Purpose:** Every solution must show _what it changes_, _how much it unblocks_, and _how much effort it costs_.

The existing diagnostics emit `Solution[]` with `effort` badges and deep-links. Stage 12 augments that with **quantified impact**:

```typescript
export interface DiagnosticSolution {
  id: string;
  headline: string;
  detail: string;
  effort: 'quick' | 'medium' | 'long';
  impact: {
    would_unblock_periods: number; // from simulation (§E) or heuristic
    would_unblock_percentage: number; // / total unassigned
    side_effects: string[]; // e.g., "may increase teacher Ahmed's daily load"
    confidence: 'high' | 'medium' | 'low'; // high = simulated, medium = heuristic, low = guess
  };
  link: { href: string; label: string };
  affected_entities: {
    teachers?: string[];
    subjects?: string[];
    classes?: string[];
    rooms?: string[];
  };
}
```

**Ranking algorithm:** primary sort by `impact.would_unblock_periods` descending, tie-break by `effort` (quick > medium > long), tie-break by `confidence` (high > medium > low). Return top 5 by default; "show all" expands the list. No non-actionable diagnostics in the top 5 — if the top item has `would_unblock_periods = 0` something is wrong with the ranker.

**Heuristic vs simulated impact:** for feasibility-sweep and simple workload-cap diagnostics, impact is computed heuristically (e.g., "adding a qualified teacher for this subject with 5 periods of availability unblocks min(5, demand-gap) periods"). For harder cases, impact is computed by **simulation** (§E). Every solution declares which it used via `confidence`.

### E. What-if simulation (new capability — the killer feature)

**Purpose:** "If you qualify Sarah for Chemistry, this unblocks 8 lessons" — quantified, proven, rendered inline.

New API: `POST /v1/scheduling-runs/:id/diagnostics/simulate` with body:

```json
{
  "overrides": [
    { "type": "add_teacher_competency", "teacher_id": "...", "subject_id": "..." },
    { "type": "remove_pin", "pin_id": "..." },
    { "type": "extend_teacher_availability", "teacher_id": "...", "day": "mon", "period": 7 }
  ]
}
```

Response:

```json
{
  "baseline": { "placed": 252, "unassigned": 8 },
  "projected": { "placed": 258, "unassigned": 2 },
  "delta": { "would_unblock_periods": 6, "remaining_blockers": [...] },
  "duration_ms": 3100
}
```

**How it works:**

1. API takes the `config_snapshot` of the run (not live DB state — we want "if you had done this at solve time, would it have mattered?").
2. Applies the requested overrides in memory producing a modified `SolverInputV3`.
3. Posts to sidecar `POST /solve` with a tight budget (5 s — we're projecting, not committing).
4. Compares output to the original `result_json`.
5. Returns the delta.

**Guardrails:**

- Rate-limited per tenant per run (max 10 simulations per run per hour).
- Simulations are tagged in sidecar logs with `X-Simulation-Run-Id` so they don't pollute real-solve telemetry.
- Result is NOT persisted — it's a view, not a commitment. The admin must still make the underlying config change themselves.

**UI integration:** simulation is opt-in. From any solution card, a "Preview impact" button fires the simulation and renders the projected delta inline. If the admin likes it, a separate "Apply" button deep-links to the config page where they actually make the change. The simulation itself never writes to the DB.

### F. Audit & hardening (existing module fixes)

Carried forward from the Stage 4 sidecar-side observations and the original diagnostics module audit:

- **Remove the 50-minute period hardcode** in `analyseAvailabilityPinch`. Replace with `period_duration_minutes` derived from the tenant's period template.
- **Add `pin_conflict` as a first-class diagnostic category** (symmetry with the feasibility-sweep category — post-solve detection is a safety net if somehow pre-solve missed it).
- **Add availability-pinch unit test.** One deterministic fixture: teacher X available 3 slots, demand 5 periods — assert diagnostic surfaces.
- **CP-SAT sidecar emits `reason` strings** in `UnassignedSlotV3.reason` using the translation registry, so the existing diagnostics service sees consistent text even in the legacy `unassigned_slots` fallback pass.
- **Retire the four legacy passes** (`analyseSupplyShortage`, `analyseWorkloadCaps`, `analyseAvailabilityPinch`, `buildUnassignedFallback`). After Stage 12 these are subsumed by the pre-solve sweep + IIS refinement + simulation. Retiring them is not optional — having two code paths that might produce diverging diagnostics for the same run is a bug-factory. Retire in the same commit as the new module lands.

### G. UI overhaul — the admin-facing surface

**File:** `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/review/page.tsx` → `DiagnosticsPanel`.

The existing panel is a good skeleton. Stage 12 upgrades it:

1. **Feasibility verdict banner** at the top of the panel:
   - Green: "100% placeable — solver confirmed every required period has a valid slot."
   - Yellow: "Tight fit — X periods are at risk; see diagnostics below."
   - Red: "N periods cannot be placed with your current data — see diagnostics below."
   - If the run was blocked pre-solve (status = 'blocked'): a distinct banner "Scheduling could not start because of X structural issues. Fix the items below, then re-run." with no partial timetable shown.

2. **Top-5 ranked solutions card** (new): highest-impact, lowest-effort fixes with `would_unblock_periods` rendered as a prominent number. Each card has "Preview impact" (runs §E simulation) and "Fix it" (deep-link).

3. **Full diagnostics list** as today, but each entry now exposes the quantified-impact badges.

4. **"Why not 100%?" explainer** at the bottom of the panel, always visible when there are unassigned periods:
   - Structural breakdown: "Of your N unplaced periods: X are blocked by data structure (add / change config), Y are blocked by conflicting pins (review pins), Z are within solver budget but not yet placed (extend budget / retry)."
   - Each category links to the relevant solution set.

5. **Non-technical language everywhere.** No "IIS," no "hard constraints," no "infeasibility." The translator is responsible. If a string leaks through that reads like engineer jargon, it's a bug.

**Responsiveness:** mobile-first; 375px wide, single-column, each solution card is a tap target. Follow the existing scheduling page's responsive patterns.

### H. Persistence changes

Migration: `add_diagnostics_artifacts_to_scheduling_runs`.

```prisma
model SchedulingRun {
  // ... existing fields
  feasibility_report          Json?  @map("feasibility_report")
  diagnostics_refined_report  Json?  @map("diagnostics_refined_report")
  diagnostics_computed_at     DateTime? @map("diagnostics_computed_at") @db.Timestamptz
}
```

RLS policy on the new columns follows the existing `scheduling_runs_tenant_isolation` policy — no new policy needed since we're extending an already-protected table. Confirm in the migration's `post_migrate.sql` that the existing policy still matches.

**Data lifecycle:** feasibility report is written pre-solve (populated even on success for audit trail). Refined report is written lazily on first diagnostics fetch. Both are overwritten on refresh.

## Non-goals

- **Do not** rework the scheduler itself — this stage is purely the explainability layer. If the sidecar returns 252/260, diagnostics explains the gap; it doesn't close it.
- **Do not** add new scheduling features (manual overrides, teacher availability editors, etc.). Stage 12 _surfaces_ the need to change config; the config pages handle the actual changes.
- **Do not** build a generalized "what-if" timetable editor. Simulation (§E) projects a delta number; it doesn't render a modified timetable.
- **Do not** expose the sidecar's `/diagnose` endpoint publicly. Loopback only, like `/solve`.
- **Do not** block a solve run on a `tight` feasibility verdict — only `infeasible` blocks. Tight runs proceed and produce the best output possible.

## Step-by-step

1. Acquire server lock with reason "Stage 12 diagnostics overhaul".
2. Read the Stage 4 completion entry and the existing `SchedulingDiagnosticsService` once through — this stage rewrites both against the V3 contract, so fresh memory is useful.
3. Implement §H migration first: adds the three new columns and the timestamp. Run locally, verify the Prisma client regenerates, confirm RLS coverage is unchanged.
4. Implement §C translation module scaffold. Start with `DIAGNOSTIC_CODES` enum and the coverage spec (failing). Seed `en.ts` with empty placeholders so the coverage spec compiles. Build `ar.ts` in parallel (translators work from the English).
5. Implement §A feasibility sweep. Tests first: one fixture per check, expected blocker output asserted. Then the service itself. Wire into `triggerSolverRun` after full green on unit tests.
6. Implement §B IIS sidecar endpoint. Pytest fixtures: one SAT (no IIS), one UNSAT with obvious conflict (pin collision), one partial-SAT (matches the realistic baseline — assume 8 of 260 cannot be placed, and subsets surface them correctly). Cap all individual solver calls at 3 s; cap total call at 30 s.
7. Implement `cp-sat-client.ts` addition — new `diagnoseViaCpSat(input, output, opts)` function mirroring `solveViaCpSat`'s error handling. Unit tests for happy path, HTTP 500, 4xx, timeout, connection refused.
8. Implement §D ranked-solutions ranking — deterministic, unit-tested on hand-built fixtures.
9. Implement §E what-if simulation. Service in `apps/api`, controller route, rate-limit guard, e2e test hitting the real sidecar.
10. Implement §F audit fixes as a cleanup commit. Retire the four legacy diagnostic passes; ensure all call sites now go through the new module.
11. Implement §G UI. Follow the redesign spec (`docs/plans/ux-redesign-final-spec.md`); do not introduce legacy sidebar patterns. Mobile-first. Verify at 375 px.
12. Non-technical user test: pick 5 real-world diagnostics output by the new module on a mocked-infeasible fixture. Read each to a non-technical stakeholder (ideally a teacher or school admin, failing that a product person who was not involved in building the solver). If any fail the "can they state what to change without clarification" test, rewrite translations and retest.
13. `turbo lint`, `turbo type-check`, `turbo test` — all green.
14. Python side: `ruff check`, `mypy --strict`, `pytest` — all green.
15. DI smoke test per `CLAUDE.md` — `DI OK`.
16. Commit locally, grouped:
    - `refactor(scheduling): retire legacy diagnostics passes (subsumed by stage-12 rebuild)`
    - `feat(scheduling): pre-solve feasibility sweep`
    - `feat(scheduling): cp-sat iis extraction via sidecar /diagnose endpoint`
    - `feat(scheduling): diagnostics translator with bilingual coverage gate`
    - `feat(scheduling): ranked quantified-impact solutions`
    - `feat(scheduling): what-if simulation endpoint`
    - `feat(scheduling): diagnostics panel ui overhaul for cp-sat`
    - `feat(scheduling): add feasibility + refined report columns to scheduling_runs`
17. Deploy via rsync:
    - sidecar `apps/solver-py/` (new `/diagnose` endpoint)
    - api `apps/api/src/modules/scheduling-runs/`
    - shared `packages/shared/src/scheduler/cp-sat-client.ts`
    - web `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/review/`
    - prisma migration
    - ecosystem config if changed (no new pm2 app expected)
18. On server: run migration, `chown`, rebuild shared + api + web + worker workspaces, `pm2 restart api web worker solver-py`.
19. Smoke:
    - stress-a: run full solve, open diagnostics, confirm verdict = feasible, no blockers, placement 100%.
    - nhqs: run full solve, open diagnostics, confirm IIS surfaces the real blockers, confirm top-5 solutions have non-zero quantified impact.
    - hand-crafted infeasible fixture (uploaded temporarily as a new tenant config): confirm pre-solve sweep blocks the run in < 1 s with rendered verdict.
20. 24h observation — watch `pm2 logs solver-py` for `/diagnose` 500s and `pm2 logs api` for `SchedulingDiagnosticsService` errors. Should be zero.
21. Release server lock.

## Testing requirements

- Unit: feasibility sweep (one per check), translator (coverage spec), ranking (deterministic orderings on fixtures), simulation service (mocked sidecar calls).
- Python: IIS extraction on SAT / UNSAT / partial-SAT fixtures.
- Integration: full diagnostics flow on stress-a (feasibility + solve + refined report + UI render).
- e2e: simulate endpoint hitting real sidecar on a small fixture.
- **Non-technical user test:** 5 diagnostics reviewed by a non-engineer; every top-5 solution must be actionable without clarification. This is a pass/fail acceptance criterion, not a nice-to-have.
- Coverage: `apps/api` diagnostics module coverage ≥ 90%; `apps/solver-py` IIS module coverage ≥ 90%.

## Acceptance criteria

- [ ] Pre-solve feasibility sweep runs in < 50 ms on stress-a (feasible) and < 100 ms on the hand-crafted infeasible fixture; blocks the run before worker enqueue on `infeasible`.
- [ ] Sidecar `POST /diagnose` extracts IIS subsets within the 30 s cap on the NHQS baseline; returns structured JSON.
- [ ] Translator coverage spec is green — every `DIAGNOSTIC_CODES` value has `en` and `ar` entries; `headline`, `detail`, and every `solution_template.headline` + `solution_template.detail` are callable.
- [ ] Every solution in the top 5 on a real NHQS run has `impact.would_unblock_periods > 0` and `confidence ∈ {high, medium}`.
- [ ] What-if simulation returns a projected delta on a real NHQS run in < 5 s.
- [ ] UI renders the verdict banner, top-5 card, full list, and "Why not 100%?" explainer per §G.
- [ ] Legacy `analyseSupplyShortage` / `analyseWorkloadCaps` / `analyseAvailabilityPinch` / `buildUnassignedFallback` are deleted; every call site now goes through the new module.
- [ ] 50-minute period hardcode is gone; period duration derives from template.
- [ ] Non-technical user test passed: 5/5 diagnostics actionable without clarification.
- [ ] RLS policies verified on new columns via a leakage test that creates two tenants, writes a `feasibility_report` for each, and asserts tenant B cannot read tenant A's report.
- [ ] `turbo lint`, `turbo type-check`, `turbo test` all green.
- [ ] Python `ruff`, `mypy --strict`, `pytest` all green.
- [ ] DI smoke test prints `DI OK`.
- [ ] Deployed and 24h observation clean.
- [ ] Commits present per §16; completion entry appended to `IMPLEMENTATION_LOG.md`.

## If something goes wrong

- **Pre-solve sweep rejects a run that's actually feasible.** Means a check is too strict. Add the specific fixture as a regression test, relax the check, confirm it still catches the original infeasibility cases. Do not deploy a workaround; fix the check.
- **IIS subset extraction times out on NHQS.** Means the `max_subsets` cap or the per-subset budget is wrong for production scale. First, reduce `max_subsets` from 8 → 4 and see if coverage is still acceptable (usually the top 2-3 subsets diagnose the majority of blockers). If not, consider incremental IIS with warm-starting between subsets.
- **Translator coverage spec fails in CI.** A new diagnostic code was added without a translation. Either add the translation or delete the code. Never suppress the spec.
- **What-if simulation returns unexpected deltas (e.g., extending availability makes placement worse).** This can legitimately happen — CP-SAT may find a different local optimum under the expanded search space. Confirm via determinism: same override, same seed, same delta. If non-deterministic, it's a sidecar bug.
- **Non-technical user test fails.** Translations are the fix. Rewrite with input from the user who failed the test. Retest with a different non-technical stakeholder. Do not ship with a failed user test — the stage is a half-product without it.

## What the completion entry should include

- Pre/post: count of diagnostic categories, size of translator registry, top-level diagnostics module LOC.
- Feasibility sweep performance: p50/p95 on stress-a and NHQS.
- IIS extraction performance: p50/p95 on NHQS.
- Non-technical user test outcome: who tested, how many diagnostics, how many passed first try, any that needed rewrites.
- Screenshots of the new UI (verdict banner, top-5 card, "Why not 100%?" explainer).
- Commit SHAs (one per §16 grouping).
- Whether any solutions surfaced impact of 0 on the top-5 list (indicates ranker bug).
- Whether production had any `/diagnose` 500s in the 24h observation window.

## Why this stage exists at all (for the session reading this cold)

The solver is half of an enterprise-grade product. The other half is the system's ability to explain why the solver's output is what it is — especially when it's _not_ a clean 100% placement. Non-technical school admins cannot be asked to reason about constraint satisfaction; they can be asked to fix specific, named data problems if the system points them out.

Stages 1-11 build the solver. Stage 12 builds the explanation. Shipping one without the other is a half-product. The target audience is teachers and heads-of-school, not optimisation engineers. A "97% placed" output with no further explanation is a frustrating user experience; a "97% placed, and here are 3 specific fixes that unblock the remaining 3%" output is a tool the admin can act on. That gap — between _correct answer_ and _actionable answer_ — is what Stage 12 closes.

Do not skip pillars. Do not defer the non-technical user test. Do not ship translations without the bilingual coverage gate. The diagnostics module is held to the same bar as the solver itself: enterprise-grade, deterministic, tested, documented, and genuinely useful to the person who opens the page.
