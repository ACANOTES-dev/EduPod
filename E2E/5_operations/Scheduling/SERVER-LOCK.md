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
