# Scheduler Rebuild — Implementation Log

**This file is the shared state across every session that works on this rebuild.** Read it before starting. Update it the moment you finish your stage.

## Before you start a stage

1. Check the status board below. Find the first stage with status `pending` whose prerequisites are all `complete`.
2. If no such stage exists, stop. The work is either finished or the next stage is blocked.
3. Open `implementations/stage-N.md` for that stage.
4. Do the work.
5. Run all tests required by the stage doc — including Playwright where applicable.
6. Append your completion entry to the matching section below.
7. Flip the status on the board from `pending` → `complete`.
8. Stop.

## Session hard rules (repeat of README.md; do not violate)

- **Commit locally only.** `git commit` is fine. `git push`, `gh pr create`, GitHub web UI — forbidden.
- **Deploy via rsync + SSH** to `root@46.62.244.139`, not via GitHub.
- **You do not finish without testing.** Playwright browser testing is required for anything with a user-facing surface; describe which tests were run in your log entry.
- **Update this log in the same session you do the work.** Don't defer.

## Status board

| #   | Stage                                    | Status    | Owner (session/date) | Notes              |
| --- | ---------------------------------------- | --------- | -------------------- | ------------------ |
| 1   | Schema migration + cover-teacher removal | `pending` | —                    | —                  |
| 2   | Solver core updates                      | `pending` | —                    | Blocked by Stage 1 |
| 3   | API surface updates                      | `pending` | —                    | Blocked by Stage 2 |
| 4   | Competencies page UI rebuild             | `pending` | —                    | Blocked by Stage 3 |
| 5   | Seed NHQS data                           | `pending` | —                    | Blocked by Stage 4 |
| 6   | Generate end-to-end on NHQS              | `pending` | —                    | Blocked by Stage 5 |
| 7   | Substitutes page + table                 | `pending` | —                    | Blocked by Stage 6 |
| 8   | Downstream rewire                        | `pending` | —                    | Blocked by Stage 7 |

## Parallelisation

**None.** Every stage is strictly sequential. See `PLAN.md` → Stage graph for the reasoning. Do not start a stage whose prerequisites are incomplete.

---

## Completion entries

Each stage appends its own entry here when finished. Use this template exactly:

```
### Stage N — <name>

**Completed:** YYYY-MM-DD
**Local commit(s):** <short SHA> <commit subject>
**Deployed to production:** yes / no — if yes, date and what restarted (api/web/worker)

**What was delivered:**
- bullet
- bullet

**Files changed (high level):**
- bullet

**Migrations / schema changes:**
- <migration name> — applied to prod at <timestamp> via `prisma migrate deploy`
- (or: "none")

**Tests added / updated:**
- unit: N new, M updated — located at <paths>
- integration: N new, M updated
- Playwright: <flows exercised>, target <URL>
- coverage delta: <current> vs <previous>; thresholds adjusted: <yes/no>

**Verification evidence:**
- <what you actually checked, e.g. SQL output, browser snapshot, pm2 logs>

**Surprises / decisions / deviations from the plan:**
- anything a later stage needs to know

**Known follow-ups / debt created:**
- anything explicitly left unfinished (should be rare; prefer to not defer)
```

### Stage 1 — Schema migration + cover-teacher removal

_Pending — will be populated when Stage 1 completes._

### Stage 2 — Solver core updates

_Pending — will be populated when Stage 2 completes._

### Stage 3 — API surface updates

_Pending — will be populated when Stage 3 completes._

### Stage 4 — Competencies page UI rebuild

_Pending — will be populated when Stage 4 completes._

### Stage 5 — Seed NHQS data

_Pending — will be populated when Stage 5 completes._

### Stage 6 — Generate end-to-end on NHQS

_Pending — will be populated when Stage 6 completes._

### Stage 7 — Substitutes page + table

_Pending — will be populated when Stage 7 completes._

### Stage 8 — Downstream rewire

_Pending — will be populated when Stage 8 completes._

---

## Orchestration history

Keep a short chronological record of significant orchestration events (not per-stage completions — those are above).

- **Orchestration package created** — 2026-04-13. Eight-stage plan written. All stages `pending`. Context: following a wiring-bug fix (commit `f878053f`) that made `POST /v1/scheduling-runs` enqueue `scheduling:solve-v2`; that fix is already live on prod and is a prerequisite for the rest of this work but is **not** itself one of the eight stages.
