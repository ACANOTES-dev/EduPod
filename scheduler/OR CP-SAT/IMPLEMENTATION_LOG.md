# OR-Tools CP-SAT Migration — Implementation Log

**This file is the shared state across every session that works on this migration.** Read it before starting. Update it the moment you finish your stage.

## Before you start a stage

1. Check the status board below. Find the first stage with status `pending` whose prerequisites are all `complete`.
2. If no such stage exists, stop. The work is either finished or the next stage is blocked.
3. Open `implementations/stage-N.md` for that stage.
4. Do the work.
5. Run all tests required by the stage doc — including parity / stress re-runs where applicable.
6. Append your completion entry to the matching section below.
7. Flip the status on the board from `pending` → `complete`.
8. Stop.

## Session hard rules (repeat of README.md; do not violate)

- **Commit locally only.** `git commit` is fine. `git push`, `gh pr create`, GitHub web UI — forbidden.
- **Deploy via rsync + SSH** to `root@46.62.244.139`, not via GitHub.
- **Direct cutover at Stage 7.** There is no per-tenant feature flag. The sidecar + worker change deploy atomically; every tenant is on CP-SAT from that moment. Parity (Stage 5) is the safety net that authorises cutover. Rollback is `git revert` + rsync.
- **You do not finish without testing.** Parity tests (Stage 5) and stress re-runs (Stage 9) are mandatory — describe which tests were run in your log entry.
- **Update this log in the same session you do the work.** Don't defer.

## Status board

| #   | Stage                              | Status    | Owner (session/date) | Notes |
| --- | ---------------------------------- | --------- | -------------------- | ----- |
| 1   | Python sidecar scaffold            | `pending` | —                    | —     |
| 2   | JSON contract                      | `pending` | —                    | —     |
| 3   | CP-SAT model — hard constraints    | `pending` | —                    | —     |
| 4   | CP-SAT model — soft preferences    | `pending` | —                    | —     |
| 5   | Parity testing (cutover gate)      | `pending` | —                    | —     |
| 6   | Worker IPC integration             | `pending` | —                    | —     |
| 7   | Production cutover (atomic deploy) | `pending` | —                    | —     |
| 8   | Legacy retire                      | `pending` | —                    | —     |
| 9   | Full stress re-run                 | `pending` | —                    | —     |
| 10  | Contract reshape                   | `pending` | —                    | —     |
| 11  | Orchestration rebuild              | `pending` | —                    | —     |

## Parallelisation

**None.** Every stage is strictly sequential. See `PLAN.md` → Stage graph for the reasoning. Do not start a stage whose prerequisites are incomplete.

---

## Completion entries

Each stage appends its own entry here when finished. Use this template exactly:

```
### Stage N — <name>

**Completed:** YYYY-MM-DD
**Local commit(s):** <short SHA> <commit subject>
**Deployed to production:** yes / no — if yes, date and what restarted (api/web/worker/solver-py)

**What was delivered:**
- bullet
- bullet

**Files changed (high level):**
- bullet

**Tests added / updated:**
- unit (TS): N new, M updated — located at <paths>
- unit (Python / pytest): N new, M updated — located at <paths>
- parity: <describe if applicable>
- stress re-run: <which scenarios, outcomes>
- coverage delta: <current> vs <previous>

**Performance measurements (where applicable):**
- solve duration (p50 / p95): <legacy> vs <cp_sat>
- completeness ratio: <legacy> vs <cp_sat>
- memory peak (MB): <cp_sat>

**Verification evidence:**
- <what you actually checked, e.g. pm2 logs, SQL output, curl against sidecar>

**Surprises / decisions / deviations from the plan:**
- anything a later stage needs to know

**Known follow-ups / debt created:**
- anything explicitly left unfinished (should be rare; prefer to not defer)
```

---

_No stages completed yet. First session to pick this up starts with Stage 1._
