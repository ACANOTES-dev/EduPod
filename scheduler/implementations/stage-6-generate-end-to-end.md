# Stage 6 — Generate end-to-end on NHQS

**Before you start:** open `../IMPLEMENTATION_LOG.md`. Confirm Stages 1–5 are `complete`. This is the stage where everything the previous five stages built gets exercised for real.

## Purpose

Run a full generation on the NHQS tenant to prove the whole pipeline works: UI → API → queue → worker → solver → results → review → apply → live `schedules` table. Identify any remaining issues and fix them in this stage; do not defer to later stages.

This stage is different from the earlier ones: **there is no spec-driven code change planned**. The work is exercising the system and responding to what breaks.

## Prerequisites

- Stages 1–5 complete. Stage 5 in particular: seeded data is in place and prereqs report `ready: true`.

## Scope

- Exercise the generate flow on prod via the UI.
- Watch worker logs for the solver run.
- Inspect the produced run in the review screen.
- Apply the run.
- Confirm the `schedules` table is populated with the expected entries.
- Confirm the Analytics sub-page shows real numbers.
- Confirm a representative teacher can see their personal timetable.

Bug fixing is in scope: if the solver crashes, the review page doesn't load, or the apply flow writes the wrong data — fix it in this stage, commit locally, redeploy, re-run.

## Non-goals

- Do **not** build the substitutes page — Stage 7.
- Do **not** rewire the downstream consumers — Stage 8. Even if `teaching-allocations` looks wrong after apply, leave it; Stage 8 fixes it. Note the observed behaviour in the log so Stage 8 has a baseline.

## Step-by-step

1. Pre-run checks on prod:
   ```bash
   # Prereqs green?
   curl -H 'cookie: <owner>' 'https://api.nhqs.edupod.app/api/v1/scheduling-runs/prerequisites?academic_year_id=<id>' | jq .ready
   # Worker healthy?
   ssh root@46.62.244.139 'sudo -u edupod pm2 logs worker --lines 30 --nostream' | grep -iE 'error|unhandled' | head
   # Queue empty?
   ssh root@46.62.244.139 'docker exec edupod-redis-1 redis-cli KEYS "bull:scheduling*" | wc -l'
   ```
2. Open Playwright. Log in to `https://nhqs.edupod.app` as `owner@nhqs.test` / `Password123!`.
3. Navigate `/en/scheduling`. Capture the hub snapshot: KPIs, latest run = none.
4. Click **Generate Timetable**. You'll land on `/en/scheduling/auto`.
5. Confirm prerequisites all green on the page. Click **Generate**.
6. Watch the progress indicator. At the same time, `ssh` in a separate shell and `sudo -u edupod pm2 logs worker` to watch the solver run. Expect:
   - Job `scheduling:solve-v2` arrives.
   - Worker updates `scheduling_runs.status` to `running`.
   - Progress updates emit at least one `extendLock` call.
   - Final status = `completed` (or `failed` — capture the reason).
7. If `completed`: follow the UI into the run review page. Verify:
   - Total entries count > 0.
   - No hard-constraint violations.
   - Health score reasonable (>= 60 is fine for a first run; below that investigate).
   - Unassigned count = 0 ideally; if > 0, log the details and decide with the user whether to tune constraints or accept.
8. Click **Apply** on the run review. Confirm:
   - Run status transitions `completed → applied`.
   - `schedules` table on prod populated with rows:
     ```sql
     SELECT COUNT(*) FROM schedules WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
     ```
     Expected: roughly curriculum periods × class count. For NHQS, probably several hundred.
9. Navigate `/en/scheduling/my-timetable`. Confirm something shows up (owner account may have 0 teaching slots — repeat step with a teacher account: `Sarah.daly@nhqs.test` / `Password123!`). Teacher should see their week populated.
10. Navigate `/en/scheduling/dashboard` (Analytics). Confirm workload heatmap, room utilisation, and trend charts render non-empty data.
11. Append completion entry to the log with all captured observations (health score, unassigned count, any bugs found and how they were fixed).

## If a bug surfaces during this stage

Fix it here; do not defer. Typical failure modes and where to look:

| Symptom                                                 | Most likely cause                                                                                                                      | Where to look                                                                                                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker never picks up the job                           | Queue name mismatch                                                                                                                    | `apps/api/src/modules/scheduling-runs/scheduling-runs.service.ts` (the fix that landed at commit `f878053f`) and `apps/worker/src/processors/scheduling/solver-v2.processor.ts`. |
| Solver fails with "no candidate teacher" for some class | Stage 5 seed missed a subject/year-group, or Stage 2 prereq accepts pool coverage but the per-class iteration in the solver rejects it | Prereq service (Stage 2) and seed data (Stage 5).                                                                                                                                |
| Run completes with many unassigned slots                | Over-constrained: teacher availability too narrow, or curriculum too dense                                                             | Check staff_availability (Mon-Fri 08-16 was seeded; if periods extend past 16:00 in some year groups, extend availability).                                                      |
| Apply fails with a Prisma error                         | `schedules` insert may conflict with existing rows (partial state from a previous failed apply)                                        | `SELECT * FROM schedules WHERE tenant_id = '...' AND academic_year_id = '...'` — if rows exist, truncate before retry.                                                           |
| Frontend shows "undefined" in KPI subtitles             | Already-fixed regression (commit `fbc12436`) — verify deployed build                                                                   | `pm2 logs web --lines 10` to confirm build timestamp.                                                                                                                            |

Every bug fix follows the full stage discipline: code change → type-check → lint → DI smoke test → unit test → commit locally → rsync + rebuild + restart → browser re-verify. No fix is claimed until all of these are clean.

## Testing requirements

### Browser — Playwright (mandatory)

All 11 step-by-step observations captured as snapshots or short notes. The minimum evidence set:

- Hub page pre-generate (no runs).
- Auto page prereq check.
- Run in progress.
- Run review page.
- Applied run record with schedule count.
- Teacher personal timetable populated.

### Coverage

No new code expected in the happy path. If bugs required code fixes, apply the standard coverage ratchet.

## Acceptance criteria

- [x] A run reaches `applied` successfully on NHQS.
- [x] `schedules` table has rows.
- [x] Teacher account sees a populated personal timetable.
- [x] Analytics sub-page shows non-empty data.
- [x] All bugs encountered during the run were fixed in this stage, committed locally, deployed, and retested.
- [x] Completion entry lists: run id, health score, unassigned count, any bugs + their fix commits.

## If something goes wrong and you can't finish

This is the one stage where you might genuinely be blocked by something outside the stage's remit — e.g., a solver bug that needs thoughtful redesign. If that happens:

1. **Do not mark the stage complete.**
2. Append a detailed "Stage 6 — in progress" entry to the log explaining what you tried, what failed, and what the next session should investigate first.
3. Leave the status board as `in_progress` with your session tag. Stop.

The next session can pick up from there without losing context.
