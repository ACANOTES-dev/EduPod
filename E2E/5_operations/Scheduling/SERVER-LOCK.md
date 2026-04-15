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
