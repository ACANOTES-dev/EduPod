# OR-Tools CP-SAT Migration — Orchestration Package

This folder coordinates the migration of the scheduling solver from the hand-rolled TypeScript `solveV2` engine (greedy + repair + backtracking) to Google OR-Tools **CP-SAT** — the tournament-winning constraint programming solver used in production at Google for fleet routing, shift scheduling, and resource allocation.

Every session working on this effort — human or AI — starts here.

## Why this exists

Wave 1 + Wave 2 stress testing demonstrated that the hand-rolled solver leaves **18–22% of curriculum demand unplaced** on the smallest tested tenant (20 teachers, 10 classes, 66 curriculum entries). At realistic Irish-school scale (40–80 teachers, 20–40 classes) the gap is expected to widen further. CP-SAT is an industry-standard engine with provably-optimal behaviour, deterministic output under seeding, and native scaling to thousands of variables. Full rationale in `PLAN.md` → "Why this work exists".

The migration is twelve stages, not eleven. Stages 1–11 swap the solver engine; Stage 12 rebuilds the diagnostics module on top of CP-SAT's formal infeasibility certificates. Both halves are required for the product to be enterprise-grade — school administrators are not optimisation engineers, and an unexplained "97% placed" output is a half-product. Stage 12 is the stage that makes the system genuinely actionable for non-technical users.

## What to read, in order, before doing anything

1. **`IMPLEMENTATION_LOG.md`** — shared state across sessions. Tells you which stages are complete, which is next, and what previous sessions discovered. **Never skip this.**
2. **`PLAN.md`** — the overall architecture, target model, and stage graph. Explains _why_ the work is shaped this way.
3. **`implementations/stage-N.md`** — the stage you are assigned. Self-contained: you should be able to do the stage with just this document plus the log.

## The hard rules (apply to every stage)

### Commit locally only. Deploy via rsync + SSH. Never through GitHub.

This is the **single most important rule** of this migration. Every session — human or AI — must honour it without exception.

**Forbidden:**

- `git push`, `git push --force`, `git push origin <anywhere>`.
- `gh pr create`, GitHub web UI, any pull-request creation.
- GitHub Actions / CI-driven deploys for this work.

**Required:**

- `git commit` locally as often as makes sense. Commits accumulate on `main` on your machine.
- **Deploy by rsync + SSH directly to `root@46.62.244.139`.** Server access is granted for this migration; use it freely. Exclude the usual: `.git`, `node_modules`, `.next`, `dist`, `.env`, `.env.local`, `.turbo`, `*.tsbuildinfo`, plus Python build artefacts (`.venv`, `__pycache__`, `*.egg-info`).
- **Acquire the server lock** (`E2E/5_operations/Scheduling/SERVER-LOCK.md`) before any SSH, pm2, or rsync action; release it with a short summary when done.

**Why:** the repo has ~16,000 unit tests today. A single CI run through GitHub Actions takes roughly three hours and each run typically surfaces one or two conflicts. The current workflow is: commit locally, deploy directly, and every two days the user does a single large rebase. Pushing breaks that flow and grinds development to a halt. If you see yourself about to run `git push`, `gh pr create`, or similar — **stop**. Ask the user before taking any action that talks to GitHub.

Every stage doc under `implementations/` repeats this rule near the top — it's non-negotiable at the start of every session, not just the first one.

### Don't claim completion without testing.

A stage is not done until it is proven to work:

- **Unit / integration tests** for every meaningful code change in TypeScript or Python. Coverage must not regress.
- **Parity tests** (Stage 5) — the same fixture run through both the legacy TS solver and the CP-SAT backend must produce comparable output, with CP-SAT at least as good on hard-constraint satisfaction. This is the gate that authorises cutover.
- **Stress re-run** (Stage 9) — every scenario from Waves 1, 2, 3 must re-pass against CP-SAT.
- **Playwright** for stages touching the UI (Stage 10 onward if any UI changes to surface CP-SAT-native output).

If it's not tested, the stage is not finished. The completion log entry must list the tests that were run.

### Direct cutover — no feature flag.

At Stage 7, the sidecar and the worker change deploy atomically and every tenant moves to CP-SAT at once. There is no per-tenant `solver_backend` setting. Parity (Stage 5) is the safety net that proves CP-SAT is ready; once it passes, we commit fully. Rollback = rsync the legacy code back from git and redeploy. It's a 60-second operation because deploys are rsync, not push.

### Follow all existing project conventions.

Every scheduling table is tenant-scoped with RLS enforced. All interactive DB writes go through `createRlsClient(...).$transaction(async (tx) => { ... })`. TypeScript strict mode, no `any`, no `@ts-ignore`. Python side uses `pydantic` for validation, `ruff` for lint, `pytest` for tests, strict type hints via `mypy`. Run `turbo lint` and `turbo type-check` on the TS side; `ruff check`, `mypy`, `pytest` on the Python side, before committing.

### Commit messages use conventional commits.

`feat(scheduling): ...`, `fix(scheduling): ...`, `refactor(scheduling): ...`, etc. Every commit must end with the `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>` footer.

### Update the log the moment you finish.

The log is useless if it lags. When your stage is genuinely done (tested, deployed, verified), append your completion entry to `IMPLEMENTATION_LOG.md` immediately in the same session. Never defer that write.

## What happens at session boundaries

Each session that picks up this work is expected to:

1. Open `IMPLEMENTATION_LOG.md` and read it in full.
2. Identify the next stage whose prerequisites are all marked complete.
3. Open `implementations/stage-N.md` for that stage.
4. Do the work.
5. Append the completion entry to the log.
6. Stop.

Do not start a stage whose prerequisites are incomplete. The log will tell you the dependency order. This is enforced in the plan.

## File map

```
scheduler/OR CP-SAT/
├── README.md                ← you are here
├── PLAN.md                  ← architecture, target model, stage graph, shared conventions
├── IMPLEMENTATION_LOG.md    ← running state; updated by every session
└── implementations/
    ├── stage-1-python-sidecar-scaffold.md
    ├── stage-2-json-contract.md
    ├── stage-3-cpsat-hard-constraints.md
    ├── stage-4-cpsat-soft-preferences.md
    ├── stage-5-parity-testing.md
    ├── stage-6-worker-ipc-integration.md
    ├── stage-7-production-cutover.md
    ├── stage-8-legacy-retire.md
    ├── stage-9-full-stress-rerun.md
    ├── stage-10-contract-reshape.md
    ├── stage-11-orchestration-rebuild.md
    └── stage-12-diagnostics-overhaul.md
```
