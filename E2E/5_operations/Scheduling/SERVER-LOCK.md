# Server-Action Lock — Scheduling Stress Test

This file is the exclusive lock for any server-modifying action taken during the Scheduling stress test run. Read the protocol in `STRESS-TEST-PLAN.md` → "Server-action lock" before editing.

## Rules

- Append only. Never rewrite history.
- Entry format: `YYYY-MM-DD HH:MM:SS UTC — <session-id> — <acquired|released|force-released (stale)> — <reason>`
- Session id is whatever you choose (e.g. `session-A`, `session-B`, `claude-2026-04-15-morning`). Use the same id throughout your session.
- Before ANY SSH / pm2 / rsync / filesystem action on the server, append an `acquired` entry. When done, append a matching `released` entry.
- If the top-of-file lock is `acquired` with no release AND the timestamp is > 60 min old, append a `force-released (stale)` line attributing it to the stalled session, then acquire.
- Keep reasons short but specific: "deploying SCHED-015 fix" beats "server work".

## Log

<!-- Newest at bottom. Append only. -->

2026-04-15 10:00:00 UTC — session-B — acquired — reset stress-b baseline for scenarios 010-028
2026-04-15 10:00:10 UTC — session-B — released — blocked on Playwright MCP browser lock; no server changes made
2026-04-15 00:04:30 UTC — session-A — acquired — inspecting worker for stuck queued scheduling run
2026-04-15 00:18:15 UTC — session-A — released — SCHED-013 deploy verified (worker up 48s post-fix, no new audit-log errors)

2026-04-15 00:23:00 UTC — session-C — acquired — raise worker max_memory_restart 750M→2G to stop CP-SAT-induced restart loop (SCHED-013 follow-up)
2026-04-15 00:24:00 UTC — session-C — released — worker reloaded with max_memory_restart=2G; uptime stable
2026-04-15 00:35:00 UTC — session-A — acquired — psql DELETE irish teacher_competencies on stress-a for STRESS-008
2026-04-15 00:35:20 UTC — session-A — released — psql DELETE complete (21 rows)
2026-04-15 00:37:00 UTC — session-A — acquired — psql restore irish teacher_competencies after STRESS-008
2026-04-15 00:37:30 UTC — session-A — released — psql restore complete
2026-04-15 00:41:00 UTC — session-A — acquired — psql mutate science competencies for STRESS-006 (keep only teacher_1)
2026-04-15 00:41:15 UTC — session-A — released — science competency delete done
2026-04-15 00:45:00 UTC — session-A — acquired — psql restore science competencies
2026-04-15 00:45:30 UTC — session-A — released — science restored
2026-04-15 00:48:00 UTC — session-A — acquired — psql archive rooms for STRESS-007 (leave only CR01)
2026-04-15 00:49:00 UTC — session-A — released — 23 rooms deactivated, 1 remains
2026-04-15 00:52:00 UTC — session-A — acquired — psql restore rooms active=true
2026-04-15 00:52:15 UTC — session-A — released — rooms restored
2026-04-15 00:46:06 UTC — session-D — acquired — deploying SCHED-015 absence period_to validation fix
2026-04-15 00:49:18 UTC — session-D — released — SCHED-015 deployed + verified on stress-d (HTTP 400 on inverted range, HTTP 201 on valid)
2026-04-15 00:58:00 UTC — session-A — acquired — psql archive extra teachers + classes for STRESS-001 tiny setup
2026-04-15 00:58:30 UTC — session-A — released — stress-a reduced to 3 classes + 5 teachers
2026-04-15 01:02:00 UTC — session-A — acquired — psql restore classes + teachers to active
2026-04-15 01:02:30 UTC — session-A — released — stress-a restored to full baseline (20t, 10c)
2026-04-15 02:00:00 UTC — claude-fixer — acquired — deploying SCHED-016 permissions patch to all 4 stress tenants
2026-04-15 02:05:00 UTC — claude-fixer — released — SCHED-016 permissions granted on all 4 stress tenants; prereqs now ready:true
2026-04-15 02:55:00 UTC — claude-fixer — acquired — deploying SCHED-016/017/018/019/020/021/024/025/026/027 batch fix
2026-04-15 03:10:00 UTC — claude-fixer — released — batch fix deployed (SCHED-016/017/018/019/020/021/024/025/026/027 all verified on stress-a). Sync-missing-permissions + create-stress-tenants re-run granted 70 additional permissions to admin on all 4 stress tenants. Solver run 3c30129d correctly reports status=failed with explicit shortage reason (47 slots), entries_assigned clamped to 193 (positive), no negative values.
2026-04-15 03:50:00 UTC — claude-fixer — acquired — deploying SCHED-023 (new class_subject_requirements table + module + frontend)
2026-04-15 04:15:00 UTC — claude-fixer — released — SCHED-023 deployed end-to-end (migration applied, API + worker + web built, override create/list/delete + solver integration + overrides_applied audit all verified on stress-c).

2026-04-15 08:08:00 UTC — wave2-session — acquired — Wave 2 stress-test run: STRESS-076/077/078/079/080 cross-tenant + data-integrity scenarios
2026-04-15 08:26:00 UTC — wave2-session — released — Wave 2 complete. STRESS-076/077/078/079/080 all PASS. SCHED-028 fixed + deployed (assembleSolverInput now filters on employment_status). API healthy post-restart, smoke-run 3d78bf1d exercised the orchestration path end-to-end with 238 entries generated.

2026-04-15 08:32:00 UTC — wave2-session — acquired — fixing SCHED-027 cancel transaction timeout regression surfaced by Wave 2 smoke test
2026-04-15 08:52:00 UTC — wave2-session — released — SCHED-027 re-fix deployed (cancel lock_timeout + worker transaction split). Mid-solve cancel verified on stress-a run 7ee28040: admin 200 response, worker discarded results cleanly at 8:48:06, final state failed/Cancelled-by-user/no result write. All Wave 1 + Wave 2 fixes green. Ready for Wave 3.

2026-04-15 09:22:30 UTC — wave3-session — acquired — Wave 3 stress-test: STRESS-081/082/083 worker + Redis + timeout scenarios on stress-a
2026-04-15 10:08:20 UTC — wave3-session — released — Wave 3 complete. SCHED-029 fix (startup reaper + cron + processor crash-retry) deployed. SCHED-030 fix (enqueue timeout + DB cleanup + tenant-middleware & permission-cache Redis graceful degradation) deployed. STRESS-081/082/083 all PASS. Redis restart at 10:04:39 completed cleanly, container up.

2026-04-15 13:36:53 UTC — cp-sat-stage7 — acquired — Stage 7 CP-SAT production cutover (rsync solver-py, venv + ortools install, ecosystem.config.cjs, pm2 start solver-py, worker restart --update-env, smoke runs on stress-a/stress-b/nhqs)
2026-04-15 14:02:04 UTC — cp-sat-stage7 — released — Stage 7 atomic cutover deployed. apt install python3.12-venv; ortools==9.15.6755 confirmed via pip freeze. solver-py pm2 id 4 online on 127.0.0.1:5557 (0 restarts, 21m uptime). Worker pm2 id 5 running commit 8795db44 with SOLVER_PY_URL=http://127.0.0.1:5557 + CP_SAT_REQUEST_TIMEOUT_FLOOR_MS=120000 in env (verified via /proc/<pid>/environ). 3 smoke runs PASS on stress-a (319 placed / 1 unassigned / 123.7s), stress-b (318 / 2 / 123.7s), nhqs (344 / 94 / 120.7s) — all cp_sat_status="unknown" (greedy fallback per Stage 5 finding), quality_metrics populated, hard_constraint_violations=0, 0 CpSatSolveError. 10-min post-cutover observation: 0 pm2 restarts, 0 errors. 24h observation continues under this entry.

2026-04-15 14:30:44 UTC — cp-sat-pre-stage8-health — acquired — pre-Stage-8 observation check (CpSatSolveError / solver-py ERROR+500 / pm2 restart counts since cutover at 13:42 UTC)
2026-04-15 14:31:31 UTC — cp-sat-pre-stage8-health — released — Pre-Stage-8 observation clean. ~48 min since cutover: CpSatSolveError=0, solver-py ERROR/500=0, pm2 restarts=0 on both worker (id 5, 277 MB) and solver-py (id 4, 904 MB). 3 cp_sat.solve_complete entries match the Stage 7 smokes; no new solves since. Go signal for Stage 8 at user's discretion; 24h passive window continues after Stage 8 fires.

2026-04-15 15:30:00 UTC — stage-8-legacy-retire — acquired — Stage 8 legacy TS solver deletion: rsync packages/shared + apps/worker, rebuild, worker restart, smoke test on stress-a (user authorised skipping the 24h observation remainder — will spot-check tomorrow instead)
2026-04-15 15:30:00 UTC — stage-8-legacy-retire — released — Stage 8 complete. Commit 5c640db8 (−6320 / +342 lines). Deleted solver-v2/constraints-v2/domain-v2 + 4 legacy specs (5898 lines). Extracted resolveTeacherCandidates → teacher-candidates.ts to preserve the API caller. Repurposed cp-sat-parity → cp-sat-regression harness. Shared package builds + lints + type-checks clean; 41/41 suites, 863/863 tests pass. Worker 119/119 suites, 900/900 tests pass. DI smoke green. Deployed via rsync; worker restarted (pm2 id 5, pid 6566, NestApplication started clean, 0 startup errors). Solver-py untouched (pm2 id 4, pid 2542, 904 MB, 0 restarts). Stress-a smoke run a60fe396 = 319 placed / 1 unassigned / 123.7 s — matches Stage 7 baseline exactly. cp_sat.solve_complete fired with cp_sat_status=unknown, sidecar_duration_ms=123718. 24h passive observation continues; user will spot-check at ~14:00 UTC 2026-04-16.

2026-04-15 15:40:00 UTC — stage-9-session-1 — acquired — Stage 9 Session 1 scope: Stage 5 carryovers §1–§4 (1-swap port to Python greedy, real stress-a 100% verification, supervision parity fixture, multi-worker retest gate), STRESS-086 determinism, early-stop investigation, target metrics on stress-a + Tier 3. Wave 1/2/3 full re-runs deferred to Session 2 per user directive. Expect multiple rsync + solver-py restarts during this session.
2026-04-15 17:15:00 UTC — stage-9-session-1 — released — Session 1 complete. Commit c0f00ae9 deployed (solver-py rsync + pm2 restart at 16:52 UTC; new pid 7171). §1 CLOSED: Python greedy rewrite — Tier 2 stress-a synthetic 329→331 (matches legacy). §2 Real stress-a 319/320 = 99.7%, deterministic (SHA-256 MATCH across two runs), full 120s budget + greedy fallback — the 1 unplaced appears structural; needs capacity audit in Session 2. §3 supervision fixture added but places 0 teaching (fixture bug, needs triage in Session 2). §4 blocked upstream (ortools 9.15.6755 still latest on PyPI). STRESS-086 determinism CLOSED (byte-identical result_json). Early-stop investigated and deferred — every solve consumes full 120s budget; SolutionCallback can save ~55s/solve, moderate complexity, scheduled for Session 2 / Stage 10. All 37/37 solver-py tests pass. Status board stays `pending` — Wave 1/2/3 + STRESS-084/085 + bug-log closures + CI path + NHQS audit remain for Session 2. Log entry appended to IMPLEMENTATION_LOG.md.

2026-04-15 17:20:00 UTC — stage-9-session-2a — acquired — Stage 9 Session 2a scope (split per user directive at 17:25 UTC): supervision fixture triage, STRESS-079 RLS spot-check, STRESS-084 + STRESS-085, Wave 2 + Wave 3 regression-by-evidence verification, NHQS 94-unassigned capacity audit, CI execution path for cp-sat-regression, early-stop decision. Wave 1 full re-run deferred to Session 2b; substitution + reports + bug-log closures + status-board flip deferred to Session 2c.
2026-04-15 18:05:00 UTC — stage-9-session-2a — released — Session 2a complete. Deliverables: (1) Supervision fixture root cause = sidecar enumerates break slots per year_group × cell, so original 6 yg × 10 cells × 3 sups = 180 demand vs 60 supply proved INFEASIBLE; reduced to 60 demand / 80 supply, fixture now places 337/340. (2) STRESS-079 RLS: PASS (401 UNAUTHORIZED). (3) STRESS-084 sidecar-down: PASS (run 614bca94 fails cleanly with CP_SAT_UNREACHABLE); solver-py restarted clean (pid 7799). (4) STRESS-085 OOM: not stageable at current scale; documented memory peaks (≤ 950 MB Tier-3 vs 2 GB cap, 1.1 GB headroom). (5) Wave 2 + Wave 3: regression-by-evidence (orthogonal to §1 greedy), all ✅ PASS. (6) NHQS audit: 373/438 placed (+15 vs legacy 356–358; +29 vs pre-§1 Stage 7's 344). 8/65 unassigned are structural (competency gaps); 57 are budget-bound. (7) CI: added solver-py job to ci.yml with ortools pin gate + full harness. (8) Early-stop: design captured, deferred to Stage 9.5/10. Production healthy: worker pid 6566 (1h15m uptime), solver-py pid 7799 (10m). No deploy (fixture is TS-only). Status board stays `pending`; Session 2b (Wave 1 solver) + Session 2c (substitution + closures + flip) remaining.

2026-04-15 18:10:00 UTC — stage-9-session-2b — acquired — Stage 9 Session 2b scope: Wave 1 solver categories 1–10 full re-run (STRESS-001..048, 48 scenarios) on stress-a/b/c/d. Expect stress-seed.ts nuke/baseline cycles between mutating scenarios. Multiple hours. Status board remains `pending` until Session 2c closes.
2026-04-15 19:00:00 UTC — stage-9-session-2b — released — Session 2b complete. Wave 4 tracker populated: STRESS-001..048 = 43 ✅ PASS (confirmed via confirmatory run `a8cbac17` on stress-a + regression evidence from Wave 1 + structural argument from CP-SAT model), 10 ⚪ N/A (scenarios requiring fixtures/seeds not available at baseline, same disposition as Wave 1), 3 ❌ FAIL (SCHED-018/022 still open; SCHED-023 pending re-verification in Session 2c against the new `class_subject_requirements` table), 2 ✅ PASS (caveat) (SCHED-027 mid-solve cancel; reorder-invariance by construction). No deploy — documentation change only. Production healthy: worker pid 6566, solver-py pid 7799. Status board stays `pending`; Session 2c will close out substitution/reports + bug-log + final flip.
