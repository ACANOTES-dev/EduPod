# Session Locks — Parallel Worktree Orchestration

File-based mutex for coordinating parallel Claude Code sessions across multiple git worktrees of the same repository.

## Why this exists

When you run multiple Claude Code sessions in parallel across several git worktrees to speed up implementation work, they all share the same local Postgres and Redis. If two sessions run `turbo test` simultaneously, they collide on test fixtures, tenant IDs, and DB state — producing non-deterministic failures that look like real bugs.

This lock lets sessions coordinate **only around the commands that actually need serialising** (`turbo test`, `prisma migrate`, etc.) while leaving everything else — editing files, running lint, type-checking, building — truly parallel.

## How it works

- Each session identifies itself with a stable ID (e.g., `impl-04`, `impl-05`, `impl-06`).
- Before running a shared-state command, the session runs `lock.sh acquire <session-id> <command>`. This blocks until no other session holds the lock, then writes a `.start` marker.
- After the command finishes (success or failure), the session runs `lock.sh release <session-id> <command>`. This writes a `.complete` marker and removes the `.start`.
- Any session trying to acquire while another holds the lock polls every 5 seconds until the holder releases.

### Where the lock files live

**Not here.** The lock files themselves live at `.git/session-locks/` inside the primary repository's git directory. That directory is **shared across all worktrees** of the same repo (via `git rev-parse --git-common-dir`). This means a session running in `../SDB-impl05` can see locks held by a session running in the primary `/Users/ram/Desktop/SDB` tree, with no manual path coordination.

This `.session-locks/` folder in the tracked tree only contains the **helper script and this README** — both tracked in git, both copied into every worktree automatically when you create one.

## Usage

```bash
# before running turbo test, acquire
.session-locks/lock.sh acquire impl-04 turbo-test

# run the actual command
turbo test

# release — regardless of whether the test passed or failed
.session-locks/lock.sh release impl-04 turbo-test
```

### Pattern for robustness — release on success AND failure

The release should happen whether tests passed or failed, so the next session isn't blocked waiting forever. Use a `trap` or run release conditionally:

```bash
.session-locks/lock.sh acquire impl-04 turbo-test
turbo test
RESULT=$?
.session-locks/lock.sh release impl-04 turbo-test
exit $RESULT
```

Or as a one-liner with `&&` / `;` semantics:

```bash
.session-locks/lock.sh acquire impl-04 turbo-test && { turbo test; R=$?; .session-locks/lock.sh release impl-04 turbo-test; exit $R; }
```

### Checking status

```bash
.session-locks/lock.sh status
```

Example output:

```
Lock directory: /Users/ram/Desktop/SDB/.git/session-locks

🔒 Active:
   • impl-04.turbo-test  (started 2026-04-09 18:30:14)

✅ Completed:
   • impl-05.turbo-test  (completed 2026-04-09 18:25:02)
```

### Cleaning up after a crashed session

If a Claude Code session crashes mid-test, its `.start` file is left behind and will block every other session forever. To recover, wipe that session's lock files:

```bash
.session-locks/lock.sh cleanup impl-04
```

This removes both `.start` and `.complete` files for `impl-04`.

## Which commands need locking?

Lock commands that touch shared state (local DB, Redis, storage):

| Command                                      | Lock it? | Lock name                     |
| -------------------------------------------- | -------- | ----------------------------- |
| `turbo test`                                 | **Yes**  | `turbo-test`                  |
| `pnpm --filter api test`                     | **Yes**  | `api-test`                    |
| `pnpm --filter api test:e2e`                 | **Yes**  | `api-e2e`                     |
| `pnpm prisma migrate dev`                    | **Yes**  | `prisma-migrate`              |
| `pnpm prisma migrate reset`                  | **Yes**  | `prisma-reset`                |
| `pnpm prisma db seed`                        | **Yes**  | `prisma-seed`                 |
| `turbo lint`                                 | No       | —                             |
| `turbo type-check`                           | No       | —                             |
| `turbo build`                                | No       | —                             |
| Prisma client generation (`prisma generate`) | No       | per-worktree, no shared state |
| Editing files, reading files                 | No       | the merge is git's job        |
| DI verification script (compiles in-memory)  | No       | no DB                         |

Different commands have different lock names, so they don't block each other. You can safely run `lint` in one session while another session holds the `turbo-test` lock.

## Session ID convention for the Report Cards redesign

Each implementation uses an ID matching its number:

- Implementation 04 → `impl-04`
- Implementation 05 → `impl-05`
- Implementation 06 → `impl-06`
- …and so on

Stable, predictable, unique across worktrees.

## Known limitations

1. **TOCTOU race window.** There is a tiny window (~milliseconds) between checking if the lock is free and writing the `.start` file. In a 4-session setup this is negligible but not zero. If you need bulletproof atomicity for high-concurrency setups, use `flock`.
2. **Stale locks.** If a session crashes during a lock, the `.start` file stays until manually cleaned up via `lock.sh cleanup`. The script does not auto-detect dead sessions.
3. **No timeout.** Acquire blocks forever by default. If that's ever a problem, wrap the call with `gtimeout` (install via `brew install coreutils`) or add a max-wait loop in the caller.
4. **Single repo only.** The lock directory is scoped to one repository's `.git/` — if you have multiple unrelated projects running tests against the same local DB, they don't see each other's locks. In practice this is fine because the shared DB belongs to one project.

## For the Report Cards redesign specifically

Every implementation prompt in `report-card-spec/prompts.md` that runs `turbo test` references this protocol. When you dispatch parallel sessions (e.g., impl 05 and impl 06 in separate worktrees while impl 04 runs on main), each session acquires its own lock and waits its turn for the test phase. They still code and lint in parallel — only the DB-hitting commands serialise.

Example of how a session should incorporate this:

```
# in the Claude Code session for impl-05, running in ../SDB-impl05 worktree

# ... do the implementation work, create files, etc. ...

# before running tests:
.session-locks/lock.sh acquire impl-05 turbo-test
turbo test
TEST_RESULT=$?
.session-locks/lock.sh release impl-05 turbo-test

# handle the test result
if [[ $TEST_RESULT -ne 0 ]]; then
  # fix failures and retry
fi
```
