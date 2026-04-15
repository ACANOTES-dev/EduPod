# Stage 7 — Production cutover (atomic deploy)

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 6 is `complete` and Stage 7 is `pending`. Acquire the server lock in `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH action. **Do not start this stage without Stage 5 (parity) and Stage 6 (worker integration) both green.**

## Purpose

Deploy the CP-SAT sidecar and the worker change **atomically** so every tenant cuts over to CP-SAT at the same moment. There is no per-tenant toggle. Stage 5's parity proof is the safety net that authorised this; Stage 6 integrated the client locally; this stage is the single moment of production cutover.

The stage succeeds when:

- The sidecar is online on the server as a supervised pm2 app.
- The worker on production is running the Stage 6 code and is calling the sidecar for every solve.
- Smoke runs on stress-a, stress-b, nhqs all solve via CP-SAT end-to-end.
- Legacy code still exists in the repo (Stage 8 deletes it), so a `git revert` + rsync rollback is possible if a pathological tenant surfaces a model bug.

## Prerequisites

- **Stage 5 complete.** Parity proved — you have numbers to back up the cutover decision.
- **Stage 6 complete.** Worker change landed locally. Commit SHA on hand.
- **Wave 1 + Wave 2 + Wave 3 green.** The stress pack is in a known-good state so any new failure is attributable to the migration, not pre-existing debt.
- Server lock obtained.

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline (a CI run takes ~3 hours and would stall the migration).
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage **is the production deploy**. Lock is mandatory. Treat every command as high-stakes; the server is live.

---

## Scope — the coordinated push

This stage touches several things in one sitting. Do them in the order below. Each step is reversible up to the pm2 restart at the end.

### A. Install Python on the server

- Verify Python 3.12 is available: `ssh root@46.62.244.139 "python3.12 --version"`.
- If not: `apt install -y python3.12 python3.12-venv python3.12-dev`. Add deadsnakes PPA if Ubuntu's default repo lacks 3.12.
- Do NOT use system `python3` — pin explicitly to 3.12.

### B. Deploy the sidecar source

```bash
rsync -az --delete \
  --exclude='.venv' --exclude='__pycache__' --exclude='*.egg-info' \
  --exclude='.pytest_cache' --exclude='.ruff_cache' --exclude='.mypy_cache' \
  apps/solver-py/ root@46.62.244.139:/opt/edupod/app/apps/solver-py/
```

On the server:

```bash
ssh root@46.62.244.139 "chown -R edupod:edupod /opt/edupod/app/apps/solver-py"
ssh root@46.62.244.139 "su - edupod -c 'cd /opt/edupod/app/apps/solver-py && python3.12 -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install -e .'"
```

`ortools` installs a prebuilt wheel on Linux x86_64 — ~150MB download, takes a few minutes. No compilation needed.

### C. Add the sidecar to pm2

Edit `ecosystem.config.cjs` on the server. Add a new app entry:

```javascript
{
  name: 'solver-py',
  script: '/opt/edupod/app/apps/solver-py/.venv/bin/uvicorn',
  args: 'solver_py.main:app --host 127.0.0.1 --port 5557',
  cwd: '/opt/edupod/app/apps/solver-py',
  interpreter: 'none',
  env: {
    SOLVER_PY_PORT: '5557',
    LOG_LEVEL: 'INFO',
    PYTHONUNBUFFERED: '1',
  },
  max_memory_restart: '2G',
  autorestart: true,
  max_restarts: 10,
  min_uptime: '30s',
  error_file: '/home/edupod/.pm2/logs/solver-py-err.log',
  out_file: '/home/edupod/.pm2/logs/solver-py-out.log',
}
```

Key points:

- `host: '127.0.0.1'` — **loopback only**. Never expose the sidecar to the public internet. Nginx does not proxy to it. Worker reaches it via localhost.
- `max_memory_restart: '2G'` — matches worker, covers CP-SAT's larger models.
- `min_uptime: '30s'` — if the sidecar exits within 30s of start, pm2 considers it unstable and backs off.
- `interpreter: 'none'` — we're running the venv's uvicorn directly; pm2 doesn't wrap in Node.

### D. Update the worker env

Worker needs `SOLVER_PY_URL`. Add `SOLVER_PY_URL: 'http://127.0.0.1:5557'` to the worker's env block in `ecosystem.config.cjs`.

### E. Rsync the Stage 6 worker change

```bash
rsync -az \
  --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' \
  --exclude='.env' --exclude='.env.local' --exclude='.turbo' --exclude='*.tsbuildinfo' \
  apps/worker/src/processors/scheduling/ \
  root@46.62.244.139:/opt/edupod/app/apps/worker/src/processors/scheduling/

rsync -az \
  packages/shared/src/scheduler/cp-sat-client.ts \
  packages/shared/src/scheduler/cp-sat-client.spec.ts \
  root@46.62.244.139:/opt/edupod/app/packages/shared/src/scheduler/
```

### F. Rebuild the TS workspaces

```bash
ssh root@46.62.244.139 "chown -R edupod:edupod /opt/edupod/app"
ssh root@46.62.244.139 "su - edupod -c 'cd /opt/edupod/app && pnpm --filter @school/shared build && pnpm --filter @school/worker build'"
```

### G. The cutover — one pm2 sequence

```bash
ssh root@46.62.244.139 "su - edupod -c 'pm2 start ecosystem.config.cjs --only solver-py && pm2 save'"

# Verify sidecar health BEFORE restarting worker. If health fails, stop and diagnose.
ssh root@46.62.244.139 "curl -s http://127.0.0.1:5557/health"
# expect: {"status":"ok","version":"0.1.0"}

# Sidecar healthy → restart worker to pick up SOLVER_PY_URL + new code.
ssh root@46.62.244.139 "su - edupod -c 'pm2 restart worker --update-env'"
```

### H. End-to-end smoke on three tenants

Run one solve on each of stress-a, stress-b, and nhqs. Three different input shapes and three different memberships — if all three succeed, the model generalises.

```bash
# stress-a
TOK=$(curl -sS -X POST https://stress-a.edupod.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@stress-a.test","password":"StressTest2026!"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["access_token"])')

curl -X POST https://stress-a.edupod.app/api/v1/scheduling/runs/trigger \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"academic_year_id":"<active_year_id>"}'
```

For each run: poll until terminal, then verify:

- `entries` count ≥ legacy Wave 1 baseline (80% = 212 entries on stress-a).
- `unassigned` count ≤ legacy.
- `quality_metrics` populated.
- `duration_ms` < `max_solver_duration_seconds * 1000`.
- No `CpSatSolveError` in worker logs.

### I. Commit the ecosystem.config.cjs change

The server-side edit to `ecosystem.config.cjs` needs to land in the repo. Rsync it back:

```bash
rsync -az root@46.62.244.139:/opt/edupod/app/ecosystem.config.cjs ./ecosystem.config.cjs
git add ecosystem.config.cjs
```

Commit locally with all the Stage 7 changes (Stage-6 code is already committed; this commit adds the ops config):

```
feat(scheduling): production cutover to cp-sat sidecar

Atomic deploy:
- solver-py rsynced to /opt/edupod/app/apps/solver-py/
- python3.12 venv created, ortools installed
- solver-py registered as pm2 app on loopback 5557
- worker env gains SOLVER_PY_URL=http://127.0.0.1:5557
- stage-6 worker change deployed
- all workspaces rebuilt; pm2 restarted worker with --update-env

End-to-end smoke verified on stress-a, stress-b, and nhqs:
- placement ratios: <a>%, <b>%, <c>%
- solve durations: <a>, <b>, <c> ms
- quality_metrics populated on all three
- 0 CpSatSolveError in worker logs over <N>-minute observation

No feature flag. Every tenant is on cp-sat from this deploy. Legacy
solver code still present in repo for git-revert rollback until stage 8.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

### J. Observe for 24 hours

- `pm2 list` every few hours — sidecar should have 0 restarts, stable memory.
- Worker should show 0 `CpSatSolveError` in logs.
- If any tenant surfaces a run failure: grab the `config_snapshot` JSON, reproduce locally against the sidecar, fix the model, rsync, pm2 restart. This is why parity mattered — the expected rate of new failures is zero.

## Rollback path (if something breaks)

This is what the direct-cutover approach replaces the feature flag with. Read it before starting so you know the shape.

```bash
# 1. Revert the stage-6 worker commit locally.
git revert <stage-6-commit-sha>

# 2. Rsync the reverted worker source.
rsync -az apps/worker/src/processors/scheduling/ \
  root@46.62.244.139:/opt/edupod/app/apps/worker/src/processors/scheduling/
ssh root@46.62.244.139 "chown -R edupod:edupod /opt/edupod/app && su - edupod -c 'cd /opt/edupod/app && pnpm --filter @school/worker build && pm2 restart worker'"

# 3. (Optional) stop the sidecar so it's clear it's offline.
ssh root@46.62.244.139 "su - edupod -c 'pm2 stop solver-py'"
```

Total rollback time: ~60 seconds. Legacy `solveV2` is still in the repo (Stage 8 hasn't deleted it yet); the reverted worker calls it again.

## Non-goals

- **Do not** delete the legacy solver. Stage 8.
- **Do not** reshape the `SolverInputV2` / `SolverOutputV2` contract. Stage 10.
- **Do not** touch `assembleSolverInput`. Stage 11.
- **Do not** flip a tenant setting — there isn't one.
- **Do not** expose the sidecar publicly. Loopback only.

## Step-by-step

1. Acquire server lock in `SERVER-LOCK.md` with reason "Stage 7 CP-SAT production cutover".
2. Confirm Python 3.12 available on server; install if not.
3. Rsync `apps/solver-py/`; `chown`; create venv; `pip install -e .`.
4. Edit `ecosystem.config.cjs`, add `solver-py` app entry + worker `SOLVER_PY_URL` env.
5. Rsync `apps/worker/src/processors/scheduling/` + `packages/shared/src/scheduler/cp-sat-client.*`.
6. `chown`, rebuild shared + worker workspaces on server.
7. `pm2 start … --only solver-py`; `pm2 save`.
8. Health check: `curl 127.0.0.1:5557/health` on server. If fails, STOP and diagnose before the next step.
9. `pm2 restart worker --update-env`.
10. Run smoke on stress-a, stress-b, nhqs. Collect metrics.
11. If any smoke fails: execute rollback path above. Investigate model. Reattempt later.
12. Rsync `ecosystem.config.cjs` back to repo; `git add`; commit.
13. Release server lock with summary.
14. 24h observation. Append any notable events to the completion entry.

## Testing requirements

- Server-side `curl /health` returns 200.
- Three tenants (different shapes) solve successfully via CP-SAT.
- Worker logs over the 24h window contain 0 `CpSatSolveError`.
- `pm2 list` shows `solver-py` online with ≤1 restart during deploy window.

## Acceptance criteria

- [ ] Python 3.12 on server.
- [ ] Sidecar rsynced; venv installed; `ortools` + deps resolved.
- [ ] `solver-py` in pm2, status `online`.
- [ ] Worker env has `SOLVER_PY_URL`; worker restarted with `--update-env`.
- [ ] End-to-end smoke succeeded on stress-a, stress-b, nhqs.
- [ ] 24h observation clean — 0 sidecar restarts from crashes, 0 `CpSatSolveError` in worker logs.
- [ ] `ecosystem.config.cjs` change rsynced back and committed locally.
- [ ] Server lock released.
- [ ] Completion entry appended with deploy evidence (log excerpts, curl outputs, run IDs).
- [ ] Rollback path re-read; everyone on this stage knows the shape without scrambling.

## If something goes wrong

- **Sidecar health fails (step 8) before worker restart:** nothing broken yet — worker still on legacy code in prod. Debug the sidecar. Fix and retry. If stuck, release lock and regroup.
- **Worker restart fails (step 9):** worker was on legacy before; pm2 should auto-restart to previous working binary. If it doesn't, manually `git revert` + rsync + rebuild the worker. You're now in the rollback path.
- **A tenant's smoke run fails:** execute full rollback (see section above). Capture the failing `config_snapshot` JSON for offline repro. Do not leave the cutover partially applied.
- **`pm2 start` fails for solver-py:** check `pm2 logs solver-py --err`. Common causes: wrong venv path, `ortools` import fails because of missing `libstdc++` on older Ubuntu (`apt install libstdc++6`).
- **Worker calls sidecar, sidecar 500s on real input:** copy the input JSON from the run's `config_snapshot` and run it locally against the sidecar. Iterate on the Stage 3/4 model, redeploy sidecar only.

## What the completion entry should include

- Exact Python version on the server.
- `pip freeze` output from the server venv (attach as artifact).
- pm2 list snapshot after deploy.
- Smoke-run metrics table (tenant × placement × duration × quality).
- 24h observation summary.
- Commit SHA.
- Whether rollback was invoked at any point; if so, what triggered it and how it was resolved.
