# Coverage Lock Protocol

This folder coordinates parallel coverage sessions when a module owner must briefly touch a shared file.

## When to use locks

- Do **not** use locks for files inside your owned module.
- Use a lock before editing any shared file or scope such as:
  - `apps/api/src/common/**`
  - `apps/api/src/modules/configuration/**`
  - shared Jest setup or shared test helper scopes
  - any non-module file that more than one session may need

## Commands

Run all commands from the repo root:

```bash
pnpm coverage:lock acquire --target apps/api/src/common/middleware/rls.middleware.ts --session behaviour-r4 --module behaviour --reason "shared RLS mock" --wait
pnpm coverage:lock heartbeat --target apps/api/src/common/middleware/rls.middleware.ts --session behaviour-r4
pnpm coverage:lock release --target apps/api/src/common/middleware/rls.middleware.ts --session behaviour-r4
pnpm coverage:lock status
pnpm coverage:lock cleanup
```

## Protocol

1. Own your module first.
2. Before touching a shared file, acquire its lock with `--wait`.
3. While you are still editing that shared file, refresh the lock every 60-90 seconds using `acquire` again or `heartbeat`.
4. Release the lock as soon as you leave the file.
5. If a session crashes, `cleanup` or a new `acquire` can reclaim a stale lock after the TTL expires.

## Targets

`--target` can be:

- a real file path, such as `apps/api/src/common/middleware/rls.middleware.ts`
- a logical shared scope, such as `shared:test-helpers` or `shared:jest-config`

Use the smallest scope that prevents collision.

## Safety Defaults

- Default TTL: 300 seconds
- Default polling interval when waiting: 60 seconds
- A lock held by the same `--session` can be refreshed safely
- A stale lock can be reclaimed automatically

## Recommended Session Naming

Use a stable session id per worker, for example:

- `behaviour-r4`
- `pastoral-r4`
- `gradebook-r4`

That keeps refresh and release commands simple.
