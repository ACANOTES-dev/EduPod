# Stage 6 — Worker IPC integration

**Before you start:** open `../IMPLEMENTATION_LOG.md` and confirm Stage 5 is `complete` (parity proved — the cutover gate) and Stage 6 is `pending`.

## Purpose

Wire the BullMQ worker to call the CP-SAT sidecar via HTTP — unconditionally. After this stage, a local dev worker always solves via the sidecar; the legacy `solveV2` is no longer called at the integration point. All of the worker's existing behaviour (SCHED-027 split transactions, SCHED-028 archived-teacher filter, timeout enforcement, cancel-race handling) is preserved; only the Step-2 solve body swaps from a JS function call to an HTTP round-trip.

This stage **lands locally only**. Production still has no sidecar — Stage 7 ships the sidecar and the worker change together in one coordinated push. Do not deploy the worker change on its own; it will break every prod tenant.

## Prerequisites

- **Stage 5 complete.** Parity proved — CP-SAT matches or beats legacy on three scale tiers plus adversarial fixtures. This is the cutover gate; if it didn't pass, don't start this stage.
- Sidecar runs locally on port 5557.

## Commit & deploy discipline (every session, non-negotiable)

- **Commit locally only.** `git commit` is fine; `git push`, `git push --force`, `gh pr create`, or any GitHub web-UI interaction are **forbidden**. `main` is rebased manually every ~2 days — pushing breaks that flow.
- **Deploy via rsync + SSH** directly to `root@46.62.244.139`. Server access is granted for this migration; use it. Never via GitHub Actions or any CI pipeline (a CI run takes ~3 hours and would stall the migration).
- **Acquire the server lock** at `E2E/5_operations/Scheduling/SERVER-LOCK.md` before any SSH, pm2, or rsync action. Release it with a summary when done.

This stage is **local only** — Stage 7 handles the atomic production cutover of the Stage-6 code + the sidecar.

---

## Scope

### A. The CP-SAT client

Create `packages/shared/src/scheduler/cp-sat-client.ts`:

```typescript
import type { SolverInputV2, SolverOutputV2 } from './types-v2';

export interface CpSatClientOptions {
  baseUrl: string; // e.g. http://localhost:5557
  timeoutMs: number; // total round-trip cap
  requestId?: string; // correlation id surfaced as X-Request-Id
}

export class CpSatSolveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function solveViaCpSat(
  input: SolverInputV2,
  opts: CpSatClientOptions,
): Promise<SolverOutputV2> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(`${opts.baseUrl}/solve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.requestId ? { 'X-Request-Id': opts.requestId } : {}),
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const err = (body as { error?: { code: string; message: string } }).error;
      throw new CpSatSolveError(
        err?.code ?? 'CP_SAT_ERROR',
        err?.message ?? `Sidecar returned ${res.status}`,
        res.status,
        body,
      );
    }
    return (await res.json()) as SolverOutputV2;
  } catch (err) {
    if (err instanceof CpSatSolveError) throw err;
    // AbortError (timeout) and TypeError (connection refused) both land here.
    throw new CpSatSolveError(
      'CP_SAT_UNREACHABLE',
      err instanceof Error ? err.message : 'Unknown CP-SAT transport error',
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}
```

### B. Update the worker's processJob — drop the legacy path at the integration site

In `apps/worker/src/processors/scheduling/solver-v2.processor.ts`, keep the three-phase transaction pattern from SCHED-027 (Step 1 claim, Step 2 solve, Step 3 write). Replace the Step 2 body:

```typescript
// Step 2 — solve (CP-SAT via sidecar). Legacy solveV2 is still compiled
// but no longer referenced here; Stage 8 deletes the file.
const result: SolverOutputV2 = await solveViaCpSat(configSnapshot, {
  baseUrl: process.env.SOLVER_PY_URL ?? 'http://localhost:5557',
  timeoutMs: (configSnapshot.settings.max_solver_duration_seconds + 30) * 1000,
  requestId: run_id,
});
```

Notes:

- HTTP timeout is `max_solver_duration_seconds + 30s` — gives the sidecar room for HTTP round-trip and presolve overhead on top of the solver's own time budget.
- Errors propagate as `CpSatSolveError` and the existing `try/catch` at the top of `processJob` marks the run as `failed` with a clear reason. **No silent fallback to legacy.** If the sidecar is unavailable, the run fails. This is correct: admins should hear about it.

### C. Remove the legacy import at the integration site

Delete the `import { solveV2 } from '../../../../../packages/shared/src/scheduler'` at the top of `solver-v2.processor.ts`. Leave the file `packages/shared/src/scheduler/solver-v2.ts` itself untouched — it's still exported and still compiles; Stage 8 deletes it.

### D. Tests

- `cp-sat-client.spec.ts` — unit tests for the client: happy path (mock `fetch`), timeout, HTTP 4xx/5xx error mapping, connection-refused → `CP_SAT_UNREACHABLE`, structured-error passthrough.
- `solver-v2.processor.spec.ts` — update existing tests so they no longer expect `solveV2` to be called. Instead they mock `solveViaCpSat` and assert it's invoked with the expected payload. Add a test: "marks run as failed when sidecar throws `CpSatSolveError`."

### E. No production deploy in this stage

Everything is local. Sidecar on dev machine, worker on dev machine. The production worker is unchanged until Stage 7.

**Important:** do not deploy this worker change to production on its own. It will fail to solve on every tenant because the sidecar isn't running there yet. Stage 7 pushes both atomically.

## Non-goals

- **Do not** deploy the sidecar or the worker to production. Stage 7.
- **Do not** introduce a feature flag or tenant setting. There is no backend choice; CP-SAT is the only path.
- **Do not** delete the legacy solver files. Stage 8.
- **Do not** add a frontend control for backend selection — there is no selection.

## Step-by-step

1. Write `cp-sat-client.ts` with full `CpSatClientOptions`, `CpSatSolveError`, `solveViaCpSat` + JSDoc.
2. Write `cp-sat-client.spec.ts`. Cover: happy path, HTTP 500, HTTP 422, timeout (abort), connection refused. Use Jest's built-in fetch mocking or `msw`.
3. Update `solver-v2.processor.ts`:
   - Import `solveViaCpSat` + `CpSatSolveError` from `@school/shared/scheduler`.
   - Delete the import of `solveV2`.
   - Replace Step-2 body as above.
4. Update `solver-v2.processor.spec.ts` mocks: replace `solveV2` expectations with `solveViaCpSat`. Add a failure-path test.
5. `turbo type-check`, `turbo lint --filter=@school/worker --filter=@school/shared` — clean.
6. Run the sidecar locally on 5557. Start the worker locally. Trigger a solve on a local dev tenant (any tenant will do — no flag to set). Confirm:
   - Worker logs show `solveViaCpSat → localhost:5557`.
   - Sidecar logs show the incoming POST + solve completion.
   - `result_json` populated with CP-SAT output.
7. Kill the sidecar. Trigger another solve. Confirm the run fails with `CP_SAT_UNREACHABLE` in `failure_reason`.
8. DI smoke test from `CLAUDE.md` → clean.
9. Commit locally:

   ```
   feat(scheduling): worker always dispatches solve via cp-sat sidecar

   solver-v2.processor.ts Step-2 body replaced with solveViaCpSat HTTP call
   (packages/shared/src/scheduler/cp-sat-client.ts). Timeout =
   max_solver_duration_seconds + 30s. Errors propagate as CpSatSolveError
   and surface as failed-run failure_reason. SCHED-027 three-phase
   transaction pattern preserved. Legacy solveV2 import removed at this
   integration site; the file still exists (Stage 8 deletes it).

   This change is LOCAL ONLY. Do not deploy until Stage 7 pushes the
   sidecar alongside.

   Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
   ```

## Testing requirements

- Unit tests for `cp-sat-client.ts` covering every error path.
- Worker unit tests updated to mock `solveViaCpSat`; one failure-path test added.
- Local manual:
  - With sidecar up → solve succeeds end-to-end.
  - With sidecar down → run fails with `CP_SAT_UNREACHABLE`.
- DI smoke test.

## Acceptance criteria

- [ ] `cp-sat-client.ts` exports `solveViaCpSat` + `CpSatSolveError` + `CpSatClientOptions`.
- [ ] Every client error path returns a typed `CpSatSolveError` (never a bare `Error`).
- [ ] `solver-v2.processor.ts` Step-2 body calls only `solveViaCpSat`; no `solveV2` reference.
- [ ] Unit tests green on both paths.
- [ ] `turbo type-check` + `turbo lint` clean.
- [ ] DI smoke test prints `DI OK`.
- [ ] Local manual confirms success + failure paths.
- [ ] Local commit created. **Not deployed.**
- [ ] Completion entry appended; clearly states "not deployed — Stage 7 is the deploy".

## If something goes wrong

- **Worker can't reach sidecar locally:** check `SOLVER_PY_URL` env var, default `http://localhost:5557`. Confirm sidecar is bound to `127.0.0.1`, not `0.0.0.0`, and that Python is 3.12.
- **Tests fail because `fetch` isn't mocked properly:** Jest's `globalThis.fetch` mock shape differs across versions; use `jest.spyOn(global, 'fetch').mockResolvedValue(...)` and reset between tests.
- **Legacy processor tests still expect `solveV2`:** they will fail after the swap. Update them as part of this stage. If you forget, CI catches it.

## What the completion entry should include

- The exact env-var name (`SOLVER_PY_URL`) and default.
- Unit test coverage delta.
- Manual test evidence from local (one success log, one failure log).
- Confirmation the change is **not yet deployed** — Stage 7 does that.
- Commit SHA.
