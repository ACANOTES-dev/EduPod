# Coverage Session Prompts With Lock Protocol

Use `GPT-5.4` with `high` reasoning for each module worker.

## Shared Lock Rules For All Sessions

Add this block to every module prompt:

```text
Shared-file lock protocol:
- You own your module files and may edit them freely without locks.
- If you need to edit any file outside your owned module, you must use the repo lock system first.
- Acquire a lock before touching the shared file:
  pnpm coverage:lock acquire --target <shared-file-or-scope> --session <session-id> --module <module-name> --reason "<why>" --wait
- While still editing that shared file, refresh the lock every 60-90 seconds with either:
  pnpm coverage:lock acquire --target <shared-file-or-scope> --session <session-id> --module <module-name> --reason "<why>"
  or
  pnpm coverage:lock heartbeat --target <shared-file-or-scope> --session <session-id>
- Release it immediately when finished:
  pnpm coverage:lock release --target <shared-file-or-scope> --session <session-id>
- If you discover the work requires multiple shared files, lock them one at a time where possible instead of claiming a huge scope.
- Do not edit a shared file without a lock.
```

## Behaviour Prompt

```text
You are working in /Users/ram/Desktop/SDB.

Goal: raise branch coverage for apps/api/src/modules/behaviour to at least 90.0% with the smallest safe set of test changes.

Current module coverage baseline:
- behaviour branch coverage: 81.3%
- behaviour statements: 95.1%
- behaviour functions: 93.6%
- behaviour lines: 95.7%

Hard boundaries:
- Only edit files under apps/api/src/modules/behaviour/** unless you explicitly lock a shared file first
- Do not touch architecture docs, Jest config, or other modules unless absolutely unavoidable
- Prefer adding or extending co-located specs over refactoring production code
- Keep changes production-safe and type-safe
- Do not revert unrelated changes

Shared-file lock protocol:
- You own your module files and may edit them freely without locks.
- If you need to edit any file outside your owned module, you must use the repo lock system first.
- Acquire a lock before touching the shared file:
  pnpm coverage:lock acquire --target <shared-file-or-scope> --session behaviour-r4 --module behaviour --reason "<why>" --wait
- While still editing that shared file, refresh the lock every 60-90 seconds with either:
  pnpm coverage:lock acquire --target <shared-file-or-scope> --session behaviour-r4 --module behaviour --reason "<why>"
  or
  pnpm coverage:lock heartbeat --target <shared-file-or-scope> --session behaviour-r4
- Release it immediately when finished:
  pnpm coverage:lock release --target <shared-file-or-scope> --session behaviour-r4
- If you discover the work requires multiple shared files, lock them one at a time where possible instead of claiming a huge scope.
- Do not edit a shared file without a lock.

Workflow:
1. Identify the behaviour files with the biggest untested branch gaps.
2. Add focused tests to cover missed decision paths, guard clauses, error branches, and state transitions.
3. Run targeted tests for behaviour.
4. Run targeted coverage for behaviour and confirm the final branch percentage.
5. Summarize:
   - final behaviour branch/statements/functions/lines
   - files changed
   - any remaining files preventing >90%
   - any shared locks used
```

## Pastoral Prompt

```text
You are working in /Users/ram/Desktop/SDB.

Goal: raise branch coverage for apps/api/src/modules/pastoral to at least 90.0% with the smallest safe set of test changes.

Current module coverage baseline:
- pastoral branch coverage: 81.8%
- pastoral statements: 97.5%
- pastoral functions: 97.0%
- pastoral lines: 97.8%

Hard boundaries:
- Only edit files under apps/api/src/modules/pastoral/** unless you explicitly lock a shared file first
- Do not touch architecture docs, Jest config, or other modules unless absolutely unavoidable
- Prefer adding or extending co-located specs over refactoring production code
- Keep changes production-safe and type-safe
- Do not revert unrelated changes

Shared-file lock protocol:
- You own your module files and may edit them freely without locks.
- If you need to edit any file outside your owned module, you must use the repo lock system first.
- Acquire a lock before touching the shared file:
  pnpm coverage:lock acquire --target <shared-file-or-scope> --session pastoral-r4 --module pastoral --reason "<why>" --wait
- While still editing that shared file, refresh the lock every 60-90 seconds with either:
  pnpm coverage:lock acquire --target <shared-file-or-scope> --session pastoral-r4 --module pastoral --reason "<why>"
  or
  pnpm coverage:lock heartbeat --target <shared-file-or-scope> --session pastoral-r4
- Release it immediately when finished:
  pnpm coverage:lock release --target <shared-file-or-scope> --session pastoral-r4
- If you discover the work requires multiple shared files, lock them one at a time where possible instead of claiming a huge scope.
- Do not edit a shared file without a lock.

Workflow:
1. Find the pastoral files with the highest missed-branch counts.
2. Add focused tests for branching logic, fallbacks, permission paths, empty states, and failure handling.
3. Run targeted tests for pastoral.
4. Run targeted coverage for pastoral and confirm the final branch percentage.
5. Summarize:
   - final pastoral branch/statements/functions/lines
   - files changed
   - any remaining blockers to >90%
   - any shared locks used
```

## Gradebook Prompt

```text
You are working in /Users/ram/Desktop/SDB.

Goal: raise branch coverage for apps/api/src/modules/gradebook to at least 90.0% with the smallest safe set of test changes.

Current module coverage baseline:
- gradebook branch coverage: 80.4%
- gradebook statements: 96.2%
- gradebook functions: 96.4%
- gradebook lines: 96.8%

Hard boundaries:
- Only edit files under apps/api/src/modules/gradebook/** unless you explicitly lock a shared file first
- Do not touch architecture docs, Jest config, or other modules unless absolutely unavoidable
- Prefer adding or extending co-located specs over refactoring production code
- Keep changes production-safe and type-safe
- Do not revert unrelated changes

Shared-file lock protocol:
- You own your module files and may edit them freely without locks.
- If you need to edit any file outside your owned module, you must use the repo lock system first.
- Acquire a lock before touching the shared file:
  pnpm coverage:lock acquire --target <shared-file-or-scope> --session gradebook-r4 --module gradebook --reason "<why>" --wait
- While still editing that shared file, refresh the lock every 60-90 seconds with either:
  pnpm coverage:lock acquire --target <shared-file-or-scope> --session gradebook-r4 --module gradebook --reason "<why>"
  or
  pnpm coverage:lock heartbeat --target <shared-file-or-scope> --session gradebook-r4
- Release it immediately when finished:
  pnpm coverage:lock release --target <shared-file-or-scope> --session gradebook-r4
- If you discover the work requires multiple shared files, lock them one at a time where possible instead of claiming a huge scope.
- Do not edit a shared file without a lock.

Workflow:
1. Identify the gradebook files with the largest branch gaps.
2. Add focused tests for conditional grading paths, optional or fallback logic, edge cases, and error branches.
3. Run targeted tests for gradebook.
4. Run targeted coverage for gradebook and confirm the final branch percentage.
5. Summarize:
   - final gradebook branch/statements/functions/lines
   - files changed
   - any remaining blockers to >90%
   - any shared locks used
```
