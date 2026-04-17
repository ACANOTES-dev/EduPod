# Worker / Background-Job Test Specification: Scheduling Module

> **Leg 3 of the `/e2e-full` release-readiness pack for Scheduling.** This spec exercises every BullMQ queue, processor, cron schedule, retry policy, dead-letter path, and async side-effect chain in the Scheduling module — things the UI, API contract, and integration specs cannot directly observe. Runnable by a Jest + BullMQ harness with direct Redis + Postgres access.

**Module:** Scheduling (CSP solver runs, stale-run reaping, cover/substitution side-effects)
**Target executor:** Jest + BullMQ test harness; direct Redis access for queue inspection; Postgres access for `scheduling_runs` row inspection
**Prereqs:** Two tenants (`nhqs`, `test-b`) + staging Redis instance + a mockable solver sidecar (HTTP) at `SOLVER_PY_URL`

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Out of Scope](#2-out-of-scope)
3. [Queue and Processor Inventory](#3-queue-and-processor-inventory)
4. [TenantAwareJob Base Class](#4-tenantawarejob-base-class)
5. [Job: scheduling:solve-v2](#5-job-schedulingsolve-v2)
6. [Job: scheduling:reap-stale-runs](#6-job-schedulingreap-stale-runs)
7. [Cron Registration](#7-cron-registration)
8. [Job Chains and Side-Effect Cascade](#8-job-chains-and-side-effect-cascade)
9. [Failure Modes](#9-failure-modes)
10. [Tenant Isolation](#10-tenant-isolation)
11. [Idempotency and Replay Safety](#11-idempotency-and-replay-safety)
12. [Observability](#12-observability)
13. [Test Rows — End-to-End Scenarios](#13-test-rows--end-to-end-scenarios)
14. [Observations and Gaps Spotted](#14-observations-and-gaps-spotted)
15. [Sign-off](#15-sign-off)

---

## 1. Prerequisites

- BullMQ + Redis instance reachable from the test harness; the harness can read keys: `bull:scheduling:wait`, `bull:scheduling:active`, `bull:scheduling:delayed`, `bull:scheduling:failed`, `bull:scheduling:completed`, `bull:scheduling:meta`, `bull:scheduling:stalled-check`, `bull:scheduling:repeat:*`.
- Prisma client with the `RlsMiddleware` engaged so any worker query that does NOT set `app.current_tenant_id` will fail.
- A mock solver sidecar bound to `SOLVER_PY_URL` (default `http://localhost:5557`). The mock must be able to:
  - return a happy-path solution payload (`status='OPTIMAL'`, entries, scores)
  - hang past the configured timeout (to test timeout path)
  - return HTTP 5xx (to test retry path)
  - simulate solver crash (TCP RST mid-stream)
- Two seeded tenants: `nhqs` and `test-b`, each with the **`scheduling`** module enabled and prerequisites satisfied (calendar, classes, subjects, staff competencies, periods).
- A test tenant with `tenant_scheduling_settings.max_solver_duration` overridable per-test (used for the stale-reaper grace check).
- Worker process replicas count = 1 (the `scheduling` queue is single-concurrency by `WorkerHost` default; multi-replica behaviour is asserted explicitly).
- Test fixtures for `scheduling_runs` rows in every status: `queued`, `running`, `completed`, `failed`, `applied`.
- The harness can clock-shift via `jest.useFakeTimers()` AND advance Redis time via a wrapper for delayed-job scheduling assertions.

---

## 2. Out of Scope

This spec covers job-runtime behaviour. It does NOT cover:

- UI behaviour of run progress, run review, or apply flow — covered by `admin_view/scheduling-admin-view-spec.md`
- API contract of `/v1/scheduling-runs/*` endpoints (request/response shapes, permission gating, validation) — covered by `integration/scheduling-integration-spec.md` (the worker spec only touches the enqueue surface — i.e., what the controller hands to BullMQ)
- OWASP / authz audit of the scheduling controller — covered by `security/scheduling-security-spec.md`
- Solver throughput, latency budgets, p95/p99 timings — covered by `perf/scheduling-perf-spec.md`
- The solver sidecar's internal CP-SAT correctness — that is the solver's own test suite (`packages/shared/src/scheduler/`)
- Calendar export ICS regeneration — that is in the scheduling integration spec
- Code-level changes — this spec is documentation only; Jest implementations follow

---

## 3. Queue and Processor Inventory

### 3.1 Queues

| #     | Queue constant              | Queue name (string) | Concurrency            | Job types carried                                                        | Critical SLA                              |
| ----- | --------------------------- | ------------------- | ---------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| 3.1.1 | `QUEUE_NAMES.SCHEDULING`    | `scheduling`        | 1 (WorkerHost default) | `scheduling:solve-v2`, `scheduling:reap-stale-runs`                      | 5 min canary (queue.constants.ts line 49) |
| 3.1.2 | `QUEUE_NAMES.NOTIFICATIONS` | `notifications`     | 5 (pool)               | Cover/substitution dispatch (enqueued from API layer, NOT solver worker) | 2 min                                     |

**Source:** `apps/worker/src/base/queue.constants.ts` (lines 1-51).

### 3.2 Queue configuration (defaults applied at registration)

| #     | Queue                    | Default concurrency | removeOnComplete | removeOnFail | lockDuration | stalledInterval | maxStalledCount | Rate-limit | Dead-letter policy                                                 | Pass/Fail |
| ----- | ------------------------ | ------------------- | ---------------- | ------------ | ------------ | --------------- | --------------- | ---------- | ------------------------------------------------------------------ | --------- |
| 3.2.1 | `scheduling`             | 1                   | 100              | 200          | 300_000 ms   | 60_000 ms       | 2               | none       | After max stalls, BullMQ moves to `failed` set; manual replay only |           |
| 3.2.2 | `scheduling` (cron only) | 1                   | 10               | 50           | n/a          | n/a             | n/a             | none       | Repeat job retained metadata; missed cron ticks NOT backfilled     |           |

> Note: `removeOnComplete` and `removeOnFail` for the cron job (`scheduling:reap-stale-runs`) are 10 / 50 per `.inventory-worker.md` §2; for the solve job they are 100 / 200.

### 3.3 Processors

| #     | Processor file                                                    | Class                         | Queue        | Job names handled            |
| ----- | ----------------------------------------------------------------- | ----------------------------- | ------------ | ---------------------------- |
| 3.3.1 | `apps/worker/src/processors/scheduling/solver-v2.processor.ts`    | `SchedulingSolverV2Processor` | `scheduling` | `scheduling:solve-v2`        |
| 3.3.2 | `apps/worker/src/processors/scheduling-stale-reaper.processor.ts` | `SchedulingStaleReaperJob`    | `scheduling` | `scheduling:reap-stale-runs` |

> **Single-queue, multi-processor pattern:** Both job types share `QUEUE_NAMES.SCHEDULING`. The processor is responsible for `if (job.name !== EXPECTED_JOB) return;` routing.

### 3.4 Queue isolation assertions

| #     | Assertion                                                                                                        | Expected                                       | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------- |
| 3.4.1 | A `scheduling:solve-v2` job is never picked up by an unrelated processor (e.g. notifications)                    | Job stays in `scheduling` queue only           |           |
| 3.4.2 | Jobs from tenant A and tenant B coexist in the `scheduling` queue with concurrency=1 — they run sequentially     | No interleaving inside a single solver call    |           |
| 3.4.3 | The solve and reap processors share the queue; reap can run while a solve is in `active` (different job names)   | Both make progress; reap does not starve solve |           |
| 3.4.4 | A job with an unknown `job.name` (e.g. `scheduling:does-not-exist`) is acknowledged and dropped without crashing | Both processors return early; no retry storm   |           |

---

## 4. TenantAwareJob Base Class

All scheduling processors that touch `scheduling_runs` must extend `TenantAwareJob<TenantJobPayload>`. The base class:

1. Reads `tenant_id` from the payload (Zod-validated UUID).
2. Opens a Prisma interactive transaction.
3. Sets `SET LOCAL app.current_tenant_id = <tenant_id>` and `SET LOCAL app.current_user_id = <user_id or SYSTEM_USER_SENTINEL>`.
4. Calls `processJob(data, tx)` inside the RLS context.
5. Commits or rolls back.

The cross-tenant cron (`scheduling:reap-stale-runs`) does NOT set a single tenant context at the job boundary — it iterates active tenants and sets `app.current_tenant_id` per iteration inside its own transaction.

### 4.1 Contract assertions

| #     | Assertion                                                                                                                                | Expected                                                                                | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------- |
| 4.1.1 | Enqueueing `scheduling:solve-v2` WITHOUT `tenant_id` — service rejects at enqueue time                                                   | `BadRequestException` thrown synchronously by service                                   |           |
| 4.1.2 | Enqueueing with `tenant_id` that is not a UUID — Zod payload validator rejects                                                           | `ZodError` thrown synchronously                                                         |           |
| 4.1.3 | Enqueueing with a `tenant_id` for a tenant that does not have the `scheduling` module enabled                                            | API layer rejects; never reaches the queue                                              |           |
| 4.1.4 | Job arrives with a `tenant_id` that exists but `run_id` belongs to a different tenant — RLS prevents the conditional-claim from matching | `claim` updateMany returns 0 rows; processor logs and exits cleanly; run is NOT mutated |           |
| 4.1.5 | A successful processor commits the transaction; `scheduling_runs` row reflects `result_json` and `status='completed'`                    | Persisted after commit                                                                  |           |
| 4.1.6 | An exception inside `processJob` between claim and write → claim is committed (separate tx); `scheduling_runs.status` left as `running`  | Caught by stale-reaper next minute                                                      |           |
| 4.1.7 | RLS is ACTIVE inside `processJob` — any cross-tenant SELECT or UPDATE is blocked by Postgres policy                                      | DB-level error, not application-level                                                   |           |
| 4.1.8 | `user_id` defaults to `SYSTEM_USER_SENTINEL` when the cron-driven reaper writes failure rows                                             | Audit trail attributes failure to the system user                                       |           |

---

## 5. Job: `scheduling:solve-v2`

**File:** `apps/worker/src/processors/scheduling/solver-v2.processor.ts`
**Class:** `SchedulingSolverV2Processor` (line 27)
**Queue:** `scheduling`
**Constant:** `SCHEDULING_SOLVE_V2_JOB` → string `'scheduling:solve-v2'`
**Trigger:** `POST /v1/scheduling-runs` → `SchedulingRunsService.create()` enqueue at lines 120-124
**Payload schema:**

```ts
{
  tenant_id: string,   // UUID, required
  run_id:    string,   // UUID, required, FK to scheduling_runs.id
}
```

**Retry policy:**

- `lockDuration`: 300_000 ms (5 min)
- `stalledInterval`: 60_000 ms (lock extended every minute)
- `maxStalledCount`: 2 (after 2 stalls → moved to `failed`)
- `removeOnComplete`: 100
- `removeOnFail`: 200
- No `attempts` override — relies on stalled-detection rather than throw-and-retry

### 5.1 Payload validation at enqueue

| #     | Scenario                                                                             | Expected                                                                            | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------- |
| 5.1.1 | Service called with valid `{ tenant_id, run_id }`                                    | Job lands in `bull:scheduling:wait` with `name='scheduling:solve-v2'`               |           |
| 5.1.2 | Service called with missing `tenant_id`                                              | `BadRequestException` synchronously; nothing enqueued; Redis `wait` count unchanged |           |
| 5.1.3 | Service called with missing `run_id`                                                 | `BadRequestException`                                                               |           |
| 5.1.4 | Service called with malformed UUIDs                                                  | `ZodError`/`BadRequestException`                                                    |           |
| 5.1.5 | `run_id` references a row that has already been deleted before enqueue               | API layer should fail the create call before enqueue (depends on controller path)   |           |
| 5.1.6 | API layer `create()` already detected an active run (queued/running) for this tenant | API rejects with 409; nothing enqueued                                              |           |

### 5.2 Conditional claim (queued → running)

| #     | Scenario                                                                                         | Expected                                                                                                                                      | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.2.1 | Worker picks up job; row is `status='queued'` for this tenant                                    | `updateMany({ where: { id: run_id, status: 'queued' }, data: { status: 'running', started_at: now() } })` returns count=1; processor proceeds |           |
| 5.2.2 | Two workers race on the same job (multi-replica scenario) — both fire the claim                  | Exactly one `updateMany` returns count=1; the other returns count=0 and exits cleanly. Solver is invoked exactly once.                        |           |
| 5.2.3 | Row already `status='running'` (replay after partial success)                                    | Claim updateMany returns 0; processor logs `already_claimed`; exits without invoking solver                                                   |           |
| 5.2.4 | Row already `status='failed'` or `status='completed'` (stale job revived)                        | Claim returns 0; processor exits cleanly                                                                                                      |           |
| 5.2.5 | Row deleted between enqueue and processing                                                       | Claim returns 0; safe skip                                                                                                                    |           |
| 5.2.6 | Tenant context (RLS) prevents claim from seeing another tenant's row even with matching `run_id` | Claim returns 0; no cross-tenant write possible                                                                                               |           |

### 5.3 Solver invocation

| #     | Scenario                                                                                                                               | Expected                                                                                                                  | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.3.1 | Claim succeeded; processor calls `solveViaCpSatV3(SOLVER_PY_URL, input, { timeout: max(120_000, max_solver_duration*1000 + 60_000) })` | HTTP POST hits `SOLVER_PY_URL`; timeout matches expression                                                                |           |
| 5.3.2 | Solver returns `status='OPTIMAL'` with entries, scores, durations                                                                      | Conditional write proceeds (see 5.4)                                                                                      |           |
| 5.3.3 | Solver returns `status='FEASIBLE'` (sub-optimal but valid)                                                                             | Treated as success; `scheduling_runs.status='completed'`                                                                  |           |
| 5.3.4 | Solver returns `status='INFEASIBLE'` (no valid timetable)                                                                              | `scheduling_runs.status='completed'` with `hard_constraint_violations` populated and `entries_unassigned` reflecting gaps |           |
| 5.3.5 | Solver returns HTTP 500                                                                                                                | Processor catches, marks `status='failed'`, `failure_reason='Solver 500: <body>'`                                         |           |
| 5.3.6 | Solver returns HTTP 4xx (e.g. malformed input)                                                                                         | `status='failed'`, `failure_reason='Solver 4xx: <body>'`; no retry                                                        |           |
| 5.3.7 | Solver hangs past timeout                                                                                                              | HTTP client aborts; `status='failed'`, `failure_reason` includes 'Solver timeout' and the configured timeout value        |           |
| 5.3.8 | Solver crash mid-stream (TCP RST)                                                                                                      | Network error caught; `status='failed'`, `failure_reason` includes the network error class                                |           |
| 5.3.9 | Worker process killed mid-solve (SIGKILL)                                                                                              | Lock expires after `lockDuration=300s`; BullMQ marks stalled; retry up to `maxStalledCount=2`                             |           |

### 5.4 Conditional write (running → completed | failed)

| #     | Scenario                                                                                                                 | Expected                                                                                                                            | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.4.1 | Solver succeeded; processor writes via `updateMany({ where: { id: run_id, status: 'running' }, data: { status, ... } })` | updateMany returns 1; row reflects `result_json`, `entries_generated`, `entries_pinned`, `entries_unassigned`, `solver_duration_ms` |           |
| 5.4.2 | Same processor finishes, but stale-reaper has already failed the run between solve start and write (race)                | Row is `status='failed'`; conditional write `where: { status: 'running' }` matches 0; **no overwrite**; processor logs `lost_race`  |           |
| 5.4.3 | Row was cancelled (`status='failed'` with `failure_reason='cancelled'`) by user via `POST /:id/cancel` mid-solve         | Conditional write 0 rows affected; cancellation preserved; solver result discarded                                                  |           |
| 5.4.4 | Solver failure (timeout/5xx) → write `status='failed'` via `updateMany({ where: { id: run_id, status: 'running' } })`    | Row failure reason populated; if reaper already failed it, this write is also a no-op (one wins, both end at failed — acceptable)   |           |
| 5.4.5 | DB connection drops between solver result and write                                                                      | Processor throws; tx rolls back; lock released; BullMQ retries via stalled detection; eventual stale-reaper safety net              |           |
| 5.4.6 | Successful write commits; downstream consumers (UI poll on `/:id/progress`) see the new status                           | Eventual consistency within poll interval                                                                                           |           |

### 5.5 Solver input assembly (assertion that orchestration ran before enqueue)

> Input assembly happens in `SchedulerOrchestrationService.assembleSolverInputV3()` synchronously inside `SchedulingRunsService.create()` BEFORE enqueue. The job payload itself only carries `{ tenant_id, run_id }`; the snapshot lives in `scheduling_runs.config_snapshot`. The processor reads it from DB, not from the payload.

| #     | Assertion                                                                               | Expected                                                      | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------- |
| 5.5.1 | Processor reads `config_snapshot` from `scheduling_runs` row inside the RLS transaction | Read scoped to tenant                                         |           |
| 5.5.2 | If `config_snapshot` is null/empty (corrupted row)                                      | `status='failed'`, `failure_reason='Missing config snapshot'` |           |
| 5.5.3 | Solver input is shipped over HTTP without persisting elsewhere                          | No file write, no second DB write, no second queue            |           |

### 5.6 Result persistence

| #     | Field                        | Source                                           | Pass/Fail |
| ----- | ---------------------------- | ------------------------------------------------ | --------- |
| 5.6.1 | `result_json`                | Solver response body                             |           |
| 5.6.2 | `hard_constraint_violations` | Solver response                                  |           |
| 5.6.3 | `soft_preference_score`      | Solver response                                  |           |
| 5.6.4 | `soft_preference_max`        | Solver response                                  |           |
| 5.6.5 | `entries_generated`          | Length of solver output entries array            |           |
| 5.6.6 | `entries_pinned`             | Count of pinned entries from input               |           |
| 5.6.7 | `entries_unassigned`         | Count of unassigned slots from solver            |           |
| 5.6.8 | `solver_duration_ms`         | Wall-clock measured by processor                 |           |
| 5.6.9 | `solver_seed`                | Echoed from solver response (deterministic runs) |           |

---

## 6. Job: `scheduling:reap-stale-runs`

**File:** `apps/worker/src/processors/scheduling-stale-reaper.processor.ts`
**Class:** `SchedulingStaleReaperJob`
**Queue:** `scheduling`
**Constant:** `SCHEDULING_REAP_STALE_JOB` → string `'scheduling:reap-stale-runs'`
**Trigger:** Cron `* * * * *` (every minute) registered in `cron-scheduler.service.ts` lines 115-127
**Payload:** `{}` (cross-tenant — iterates every active tenant)

### 6.1 Cross-tenant iteration

| #     | Scenario                                                                                        | Expected                                                                                                            | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1.1 | Two tenants exist; both have at least one stale run                                             | Processor iterates each tenant, sets `app.current_tenant_id` per iteration, processes each tenant's stale runs only |           |
| 6.1.2 | One tenant is deleted/inactive between iterations                                               | Iteration skipped; no crash; other tenants still processed                                                          |           |
| 6.1.3 | Iteration does NOT use a single global tx — each tenant has its own RLS transaction             | Verified via mock: `$transaction` invoked once per tenant                                                           |           |
| 6.1.4 | A failure inside one tenant's iteration does NOT abort the cron — other tenants still processed | Verified                                                                                                            |           |

### 6.2 Stale-detection criteria

| #     | Scenario                                                                          | Expected                                                                       | Pass/Fail |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| 6.2.1 | Run is `status='queued'` and `created_at < now() - (max_solver_duration + 60s)`   | Marked `status='failed'`, `failure_reason='Reaped: queued past grace period'`  |           |
| 6.2.2 | Run is `status='running'` and `started_at < now() - (max_solver_duration + 60s)`  | Marked `status='failed'`, `failure_reason='Reaped: running past grace period'` |           |
| 6.2.3 | Run is `status='completed'` (older than grace)                                    | Skipped — only queued/running candidates considered                            |           |
| 6.2.4 | Run is `status='failed'` (already failed) — even with old timestamp               | Skipped — reaper does NOT re-fail an already-failed run                        |           |
| 6.2.5 | Run is `status='applied'`                                                         | Skipped                                                                        |           |
| 6.2.6 | Run is recent (within grace window)                                               | Skipped                                                                        |           |
| 6.2.7 | `tenant_scheduling_settings.max_solver_duration` overridden to 600s; grace = 660s | Reaper respects the per-tenant value                                           |           |
| 6.2.8 | `tenant_scheduling_settings` row missing for a tenant — defaults applied          | Default grace used (per code default in solver settings)                       |           |

### 6.3 Conditional write — race with solver

| #     | Scenario                                                                                                  | Expected                                                                                                                         | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.3.1 | Reaper picks up a `status='running'` row at T; solver writes success at T+1ms before reaper write commits | Whichever commits first wins. If solver wins, reaper's `updateMany where status IN ('queued','running')` matches 0; no overwrite |           |
| 6.3.2 | Reaper writes failure at T; solver tries to write success at T+1ms                                        | Solver's `updateMany where status='running'` matches 0; success result discarded; UI shows failed (acceptable known race)        |           |
| 6.3.3 | Reaper and solver attempt write in same instant on different connections                                  | Postgres serialises; one commits, the other is a no-op (matched 0 rows, no error)                                                |           |

### 6.4 Idempotency and replay

| #     | Scenario                                                                                          | Expected                                                                  | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| 6.4.1 | Reaper runs twice in the same minute (clock skew or manual trigger)                               | Second run finds no candidates → no-op                                    |           |
| 6.4.2 | Reaper run completes; replay (BullMQ retry after worker restart) processes the same payload again | All previously-failed runs are skipped; only newly stale runs are touched |           |
| 6.4.3 | No active tenants                                                                                 | Job completes with summary `{ tenants: 0, reaped: 0 }`; no error          |           |

### 6.5 Failure path

| #     | Scenario                                                       | Expected                                                                                             | Pass/Fail |
| ----- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 6.5.1 | DB unreachable                                                 | Job throws; retried via stalled detection; no rows mutated                                           |           |
| 6.5.2 | Single tenant iteration throws (e.g. corrupted settings JSONB) | Caught and logged; other tenants still processed; job overall succeeds                               |           |
| 6.5.3 | All tenant iterations throw                                    | Job marked failed; appears in `bull:scheduling:failed`; next cron tick still fires (independent job) |           |

---

## 7. Cron Registration

Registered in `apps/worker/src/cron/cron-scheduler.service.ts` (lines 115-127) via `OnModuleInit`.

### 7.1 Registration assertions

| #     | Field            | Expected                          | Pass/Fail |
| ----- | ---------------- | --------------------------------- | --------- |
| 7.1.1 | jobId            | `cron:scheduling:reap-stale-runs` |           |
| 7.1.2 | Cron expression  | `* * * * *` (every minute)        |           |
| 7.1.3 | Job name         | `scheduling:reap-stale-runs`      |           |
| 7.1.4 | Payload          | `{}` (empty — cross-tenant cron)  |           |
| 7.1.5 | removeOnComplete | 10                                |           |
| 7.1.6 | removeOnFail     | 50                                |           |

### 7.2 Deduplication

| #     | Scenario                                                                       | Expected                                                                                    | Pass/Fail |
| ----- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------- |
| 7.2.1 | Worker boots twice (e.g. rolling restart); both invoke `OnModuleInit`          | Second registration is a no-op for the same `jobId` — exactly one repeat job in BullMQ      |           |
| 7.2.2 | Manual trigger of `scheduling:reap-stale-runs` from a debug endpoint           | Independent of cron; runs once on demand; cron continues unaffected                         |           |
| 7.2.3 | Cron schedule changed (e.g. `* * * * *` → `*/2 * * * *`) and worker redeployed | Old `repeat:*` key removed; new schedule registered (manual cleanup may be required — flag) |           |

### 7.3 Missed-tick semantics

| #     | Scenario                                                                                                            | Expected                                                                              | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| 7.3.1 | Worker offline for 10 minutes, then reboots                                                                         | BullMQ does NOT backfill 10 missed ticks; next tick fires on the next minute boundary |           |
| 7.3.2 | This is acceptable because the reaper is idempotent — 1 minute of accumulated stale runs is reaped on the next tick | No duplicate failures; no stuck rows                                                  |           |

---

## 8. Job Chains and Side-Effect Cascade

> **There are NO explicit job chains in the scheduling worker.** Both `scheduling:solve-v2` and `scheduling:reap-stale-runs` are leaf jobs — they don't enqueue further worker jobs themselves. Side-effect chains are **API-layer**, triggered when a user calls `POST /v1/scheduling-runs/:id/apply` AFTER the worker run completes.

### 8.1 Solver completion → downstream effects (informational)

| #     | Trigger (API, not worker)                             | Cascade                                                                                                                     | Pass/Fail |
| ----- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1.1 | `POST /:id/apply` after run reaches `completed`       | Schedules persisted; existing schedules archived; `scheduling_runs.status='applied'` — synchronous, no worker job enqueued  |           |
| 8.1.2 | Apply triggers calendar regeneration (if implemented) | Verify whether calendar export tokens require invalidation — flag as TBD if no explicit job exists today                    |           |
| 8.1.3 | Apply triggers notification fan-out (if implemented)  | Check `notifications` queue for any enqueued `communications:dispatch-notifications` after apply — flag as TBD if absent    |           |
| 8.1.4 | Cancellation via `POST /:id/cancel` while running     | Service writes `status='failed'`, `failure_reason='cancelled'` synchronously; in-flight worker's conditional write is no-op |           |

### 8.2 Substitution / cover (cross-module touch)

| #     | Trigger                                             | Cascade                                                                                              | Pass/Fail |
| ----- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 8.2.1 | API-layer `CoverNotificationsService.notify()` call | Enqueues `communications:dispatch-notifications` on the `notifications` queue (NOT scheduling queue) |           |
| 8.2.2 | This is NOT a scheduling worker concern             | Tested in `communications/worker/communications-worker-spec.md`                                      |           |

---

## 9. Failure Modes

### 9.1 Solver-side failures

| #     | Failure                                          | Detection                                                                   | Recovery                                                                                           | Pass/Fail |
| ----- | ------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 9.1.1 | Solver sidecar timeout                           | HTTP client aborts at `max(120_000ms, max_solver_duration*1000 + 60_000ms)` | Processor catches `AbortError`; conditional write `failed`, `failure_reason='Solver timeout (Xs)'` |           |
| 9.1.2 | Solver sidecar HTTP 5xx                          | Response body captured                                                      | `failed`, `failure_reason='Solver 5xx: <body>'`                                                    |           |
| 9.1.3 | Solver sidecar HTTP 4xx (malformed input)        | Response body captured                                                      | `failed`, `failure_reason='Solver 4xx: <body>'`; not retried                                       |           |
| 9.1.4 | Solver sidecar process down (connection refused) | Network error class                                                         | `failed`, `failure_reason` includes ECONNREFUSED                                                   |           |
| 9.1.5 | DNS failure for `SOLVER_PY_URL`                  | Network error                                                               | `failed`, `failure_reason` includes ENOTFOUND                                                      |           |
| 9.1.6 | TLS handshake failure (if HTTPS sidecar)         | Network error                                                               | `failed` with TLS error message                                                                    |           |

### 9.2 Worker-process failures

| #     | Failure                                          | Detection                                                  | Recovery                                                                                                                                                                     | Pass/Fail |
| ----- | ------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.2.1 | Worker SIGKILL'd mid-solve                       | BullMQ lock expires after 300s; stalled-check ticks at 60s | Job re-delivered to a worker; re-claim attempt sees `status='running'` (set by previous worker) → no-op claim → solver NOT re-invoked; stale-reaper eventually fails the run |           |
| 9.2.2 | Worker SIGTERM'd mid-solve (graceful shutdown)   | Worker should release lock cleanly                         | Job re-queued; re-claim sees `status='running'` → no-op; stale-reaper safety net                                                                                             |           |
| 9.2.3 | Worker stalls > 2 times (`maxStalledCount`)      | BullMQ moves to `bull:scheduling:failed`                   | Manual replay only; row may already be in `failed` via reaper; if not, manual repair required                                                                                |           |
| 9.2.4 | Out-of-memory crash during solver result parsing | Worker process restarts                                    | Same as 9.2.1                                                                                                                                                                |           |
| 9.2.5 | Postgres connection pool exhausted               | Tx-open throws                                             | Job throws; retry via stalled detection                                                                                                                                      |           |
| 9.2.6 | Redis connection lost mid-job                    | BullMQ heartbeat fails                                     | Job becomes stalled on next tick; redelivered                                                                                                                                |           |

### 9.3 Reaper-induced failures

| #     | Failure                                                                                                     | Expected                                                                                                 | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| 9.3.1 | Reaper marks a `running` job as failed; original worker is still alive and currently inside `solveViaCpSat` | Original worker's eventual conditional write matches 0 rows; solver result is discarded; UI shows failed |           |
| 9.3.2 | Reaper marks a `queued` job as failed; pickup worker has not started solving                                | Pickup worker's claim updateMany matches 0; processor exits; no solver call                              |           |
| 9.3.3 | Reaper grace window misconfigured to 0                                                                      | Reaper would fail every job immediately — flag as a misconfiguration risk in §14                         |           |

### 9.4 DLQ semantics (this codebase uses `moveToFailed`, not a dedicated DLQ)

| #     | Assertion                                                                                       | Expected                                                                     | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| 9.4.1 | After `maxStalledCount` exceeded, BullMQ calls `moveToFailed` with `removeOnFail=200` retention | Job appears in `bull:scheduling:failed` set; payload retained for inspection |           |
| 9.4.2 | No automatic DLQ replay — manual operator action required                                       | Verified by absence of replay job in the codebase                            |           |
| 9.4.3 | Failed job count > 200 → oldest failed jobs evicted per `removeOnFail` policy                   | LIFO retention; observability of replay payload eventually lost              |           |

---

## 10. Tenant Isolation

### 10.1 Enqueue-time guarantees

| #      | Assertion                                                                                                                                                                | Expected                                    | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | --------- |
| 10.1.1 | `SchedulingRunsService.create(tenantId, ...)` always passes `tenantId` into the job payload                                                                              | Verified                                    |           |
| 10.1.2 | If `tenantId` arrives as `undefined` to the service                                                                                                                      | Service throws synchronously BEFORE enqueue |           |
| 10.1.3 | If `tenantId` arrives as a non-UUID string                                                                                                                               | Zod validator rejects; nothing enqueued     |           |
| 10.1.4 | API-layer permission guards are NOT bypassed by the worker — even if the payload says `tenant_id=X`, the worker still validates the row belongs to X via RLS-scoped read | Verified                                    |           |

### 10.2 Runtime guarantees inside processor

| #      | Assertion                                                                                                         | Expected                                                         | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------- |
| 10.2.1 | `TenantAwareJob` sets `app.current_tenant_id = payload.tenant_id` BEFORE any DB operation                         | Verified by mocking RLS middleware and asserting call order      |           |
| 10.2.2 | Tampered payload: `tenant_id=A` but `run_id` is row owned by tenant B — claim updateMany finds 0 rows (RLS scope) | Processor exits cleanly; nothing leaked, nothing mutated         |           |
| 10.2.3 | Two concurrent jobs for tenant A and tenant B in the same queue (concurrency=1, so sequential)                    | Each job sets its own RLS context; no leakage between iterations |           |
| 10.2.4 | A test that asserts cross-tenant SELECT throws when issued inside `processJob` with the wrong tenant context      | Postgres-level error (RLS policy)                                |           |

### 10.3 Cron tenant scope

| #      | Assertion                                                                                           | Expected                                                                           | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- |
| 10.3.1 | `scheduling:reap-stale-runs` payload is `{}` — empty                                                | Processor reads tenant list from `tenants` table (or `tenant_scheduling_settings`) |           |
| 10.3.2 | For each tenant, processor opens its own RLS transaction with `app.current_tenant_id = <tenant.id>` | Verified                                                                           |           |
| 10.3.3 | One tenant's reaping must not be visible (data leak) to another tenant's iteration                  | Verified — each iteration is a fresh tx                                            |           |
| 10.3.4 | A new tenant created mid-iteration is NOT processed in the current cron tick (acceptable)           | Picked up on next minute                                                           |           |

---

## 11. Idempotency and Replay Safety

### 11.1 Solve job replay

| #      | Scenario                                                                                 | Expected                                                                                                                                                  | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1.1 | Solve job redelivered after worker crash; row already `status='running'`                 | Conditional claim `where: status='queued'` returns 0; processor exits without invoking solver                                                             |           |
| 11.1.2 | Solve job redelivered after solver succeeded but write was lost (rare: tx commit failed) | Row may still be `status='running'`. New worker will re-claim 0 (already running), exit. Stale-reaper eventually marks failed. **Documented limitation.** |           |
| 11.1.3 | Same `run_id` enqueued twice manually                                                    | First claim wins; second exits (already running)                                                                                                          |           |
| 11.1.4 | Solver returns identical result twice for the same `run_id` (replay)                     | Second write `where: status='running'` returns 0 (status now `completed`); no overwrite                                                                   |           |

### 11.2 Reap job replay

| #      | Scenario                                                                   | Expected                                                                                             | Pass/Fail |
| ------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 11.2.1 | Reaper job redelivered (BullMQ stalled retry)                              | Already-failed runs skipped; no duplicate `failure_reason` appended                                  |           |
| 11.2.2 | Reaper job replayed manually for the same minute                           | No-op for runs already failed; only newly stale ones touched                                         |           |
| 11.2.3 | Reaper writes `failure_reason='Reaped: ...'` — second pass would overwrite | Conditional write `where: status IN ('queued','running')` excludes already-failed rows; no overwrite |           |

### 11.3 Cancellation idempotency

| #      | Scenario                                                    | Expected                                                                                               | Pass/Fail |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| 11.3.1 | User calls `POST /:id/cancel` twice                         | Second call is a no-op (row already `failed` with `failure_reason='cancelled'`)                        |           |
| 11.3.2 | Cancel arrives mid-solve; solver result arrives later       | Solver's conditional write `where: status='running'` returns 0 (status now `failed`); result discarded |           |
| 11.3.3 | Cancel arrives after solver has already written `completed` | Cancel rejected at API layer (state machine: `completed` → `failed` is not a valid cancel transition)  |           |

---

## 12. Observability

### 12.1 Logging

| #      | Assertion                                                                                      | Expected                      | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------- | ----------------------------- | --------- |
| 12.1.1 | `SchedulingSolverV2Processor` logs `[Scheduling] tenant=<id> run=<id> status=running` on claim | Log line emitted via `Logger` |           |
| 12.1.2 | Logs duration of solver call in ms                                                             | Present                       |           |
| 12.1.3 | On failure, logs `failure_reason` (full message)                                               | Present                       |           |
| 12.1.4 | Logs do NOT include `config_snapshot` body (PII / size)                                        | Verified                      |           |
| 12.1.5 | Stale-reaper logs `[StaleReaper] tenant=<id> reaped=<n>` per tenant iteration                  | Present                       |           |

### 12.2 Failure-reason field is mandatory

| #      | Failure path            | `failure_reason` value                                          | Pass/Fail |
| ------ | ----------------------- | --------------------------------------------------------------- | --------- |
| 12.2.1 | Solver timeout          | Includes string `'Solver timeout'` and configured timeout value |           |
| 12.2.2 | Solver 5xx              | `'Solver 5xx: <truncated body>'`                                |           |
| 12.2.3 | Solver 4xx              | `'Solver 4xx: <truncated body>'`                                |           |
| 12.2.4 | Network error           | `'<ErrCode>: <message>'`                                        |           |
| 12.2.5 | Reaped queued           | `'Reaped: queued past grace period'`                            |           |
| 12.2.6 | Reaped running          | `'Reaped: running past grace period'`                           |           |
| 12.2.7 | Cancellation            | `'cancelled'`                                                   |           |
| 12.2.8 | Missing config snapshot | `'Missing config snapshot'`                                     |           |

### 12.3 Canary / SLA

| #      | Assertion                                                                                   | Expected                                                                        | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| 12.3.1 | `scheduling` queue is registered with a 5-minute canary SLA in `queue.constants.ts` line 49 | Canary alert fires if a job remains in `wait` or `active` longer than 5 minutes |           |
| 12.3.2 | Canary fires for an over-grace solve job                                                    | Alert payload includes `queue=scheduling`, `job_name`, `tenant_id`              |           |
| 12.3.3 | Reaper jobs are sub-second — should never trip the canary                                   | Verified                                                                        |           |
| 12.3.4 | Failed jobs in `bull:scheduling:failed` are surfaced to operations dashboards               | Verified                                                                        |           |

### 12.4 Job return values

| #      | Job                           | Return value                                                             | Pass/Fail |
| ------ | ----------------------------- | ------------------------------------------------------------------------ | --------- |
| 12.4.1 | `scheduling:solve-v2` success | `{ run_id, status: 'completed', solver_duration_ms, entries_generated }` |           |
| 12.4.2 | `scheduling:solve-v2` failure | Throws or returns `{ run_id, status: 'failed', failure_reason }`         |           |
| 12.4.3 | `scheduling:reap-stale-runs`  | `{ tenants: N, reaped: M }` (summary across all tenants)                 |           |

---

## 13. Test Rows — End-to-End Scenarios

This is the canonical row-by-row test list. Each row maps 1:1 to a Jest test in the harness.

### 13.1 Happy path

| #         | Scenario                                        | Trigger                                                   | Expected                                                                                                                                  | Actual | Pass/Fail |
| --------- | ----------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-W-001 | Single-tenant happy path                        | API enqueues `scheduling:solve-v2` for nhqs               | Job picked up; claim succeeds; solver mock returns OPTIMAL; row → `status='completed'`, `result_json` populated, `solver_duration_ms` set |        |           |
| SCH-W-002 | Solver returns FEASIBLE (sub-optimal but valid) | Solver mock returns `status='FEASIBLE'`                   | Row → `status='completed'` with `soft_preference_score < soft_preference_max`                                                             |        |           |
| SCH-W-003 | Solver returns INFEASIBLE                       | Solver mock returns `status='INFEASIBLE'` with violations | Row → `status='completed'` with `hard_constraint_violations > 0`, `entries_unassigned > 0`                                                |        |           |
| SCH-W-004 | Two tenants enqueue solve in same minute        | A then B (queue concurrency=1)                            | A runs to completion; B then runs; both rows `completed`; no interleaving in solver calls                                                 |        |           |
| SCH-W-005 | Solve job emits return value with summary       | Successful solve                                          | `job.returnvalue` matches `{ run_id, status: 'completed', solver_duration_ms, entries_generated }`                                        |        |           |

### 13.2 Solver-side failures

| #         | Scenario                        | Trigger                                                   | Expected                                                                                    | Actual | Pass/Fail |
| --------- | ------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-W-010 | Solver timeout                  | Solver mock hangs > configured timeout                    | Row → `status='failed'`, `failure_reason` contains `'Solver timeout'` and the timeout value |        |           |
| SCH-W-011 | Solver returns 500              | Solver mock returns 500 with body `{ error: 'segfault' }` | Row → `status='failed'`, `failure_reason='Solver 5xx: segfault'`                            |        |           |
| SCH-W-012 | Solver returns 400              | Solver mock returns 400 with `{ error: 'bad input' }`     | Row → `status='failed'`, `failure_reason='Solver 4xx: bad input'`; no retry attempted       |        |           |
| SCH-W-013 | Solver TCP connection refused   | SOLVER_PY_URL points at unreachable port                  | Row → `status='failed'`, `failure_reason` contains `'ECONNREFUSED'`                         |        |           |
| SCH-W-014 | Solver returns malformed JSON   | Solver mock returns 200 with body `not-json`              | Row → `status='failed'`, `failure_reason` includes JSON parse error                         |        |           |
| SCH-W-015 | Solver responds with empty body | Solver mock returns 200 with empty body                   | Row → `status='failed'`, `failure_reason` mentions empty/invalid response                   |        |           |
| SCH-W-016 | Solver dropped TCP mid-stream   | Solver mock RSTs after partial body                       | Row → `status='failed'`, `failure_reason` indicates network truncation                      |        |           |

### 13.3 Worker-process failures

| #         | Scenario                               | Trigger                                                 | Expected                                                                                                                                         | Actual | Pass/Fail |
| --------- | -------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| SCH-W-020 | Worker SIGKILL'd mid-solve             | Kill worker process while solver mock holds the request | Lock expires after 300s; BullMQ marks stalled; redelivered; new worker re-claim returns 0 (status=running); stale-reaper eventually marks failed |        |           |
| SCH-W-021 | Worker stalls > maxStalledCount=2      | Repeatedly kill workers as they pick up the same job    | Job moved to `bull:scheduling:failed`; row already `failed` via reaper                                                                           |        |           |
| SCH-W-022 | Worker SIGTERM'd (graceful)            | Send SIGTERM during active job                          | Worker releases lock; redelivered; same as 9.2.2                                                                                                 |        |           |
| SCH-W-023 | Postgres pool exhausted on solve write | Saturate pool; trigger solve                            | Job throws; retry via stalled detection                                                                                                          |        |           |
| SCH-W-024 | Redis disconnect during active solve   | Pause Redis; solver completes                           | Worker fails to update job status; lock expires; redelivered                                                                                     |        |           |

### 13.4 Stale-reaper coverage

| #         | Scenario                                             | Trigger                                                               | Expected                                                         | Actual | Pass/Fail |
| --------- | ---------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- | ------ | --------- |
| SCH-W-030 | Reaper picks up an abandoned `running` row           | Seed row with `started_at = now() - 600s`, `max_solver_duration=120s` | Row → `status='failed'`, `failure_reason` contains `'Reaped'`    |        |           |
| SCH-W-031 | Reaper picks up an abandoned `queued` row            | Seed row with `created_at = now() - 600s`                             | Row → `status='failed'`                                          |        |           |
| SCH-W-032 | Reaper skips a recently `running` row (within grace) | Seed row with `started_at = now() - 30s`                              | Row unchanged                                                    |        |           |
| SCH-W-033 | Reaper skips an already-failed row                   | Seed row `status='failed'`, `failure_reason='Solver timeout'`         | Row unchanged; original `failure_reason` preserved               |        |           |
| SCH-W-034 | Reaper skips a `completed` row                       | Seed completed row                                                    | Row unchanged                                                    |        |           |
| SCH-W-035 | Reaper skips an `applied` row                        | Seed applied row                                                      | Row unchanged                                                    |        |           |
| SCH-W-036 | Reaper iterates two tenants                          | Stale rows in nhqs and test-b                                         | Both tenants reaped; iteration uses separate RLS contexts        |        |           |
| SCH-W-037 | Reaper survives a single tenant's iteration error    | Inject error in tenant A's iteration                                  | Tenant B still reaped; job overall succeeds; A error logged      |        |           |
| SCH-W-038 | Reaper run summary                                   | Two stale rows across two tenants                                     | `job.returnvalue` is `{ tenants: 2, reaped: 2 }`                 |        |           |
| SCH-W-039 | Reaper respects per-tenant `max_solver_duration`     | Tenant A: 120s. Tenant B: 600s. Both rows aged 300s.                  | A's row reaped (300 > 120+60). B's row NOT reaped (300 < 600+60) |        |           |

### 13.5 Race conditions and replay

| #         | Scenario                                              | Trigger                                                                | Expected                                                                                                            | Actual | Pass/Fail |
| --------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-W-040 | Two enqueues for same `run_id` collide                | Manually enqueue twice                                                 | First claim returns 1; second claim returns 0; solver invoked exactly once                                          |        |           |
| SCH-W-041 | Solver completes at the same instant reaper fires     | Coordinate: reaper writes failure at T; solver writes success at T+1ms | One commits, the other is no-op (matched 0 rows). UI shows whichever wrote first; no `failure_reason` overwritten   |        |           |
| SCH-W-042 | Solve job replayed after success was already written  | Manually re-deliver completed job                                      | Re-claim returns 0; solver NOT re-invoked; row unchanged                                                            |        |           |
| SCH-W-043 | Reap job replayed in same minute                      | Manually re-trigger reap                                               | No rows mutated (already-failed skipped); job succeeds with `reaped: 0`                                             |        |           |
| SCH-W-044 | Cancel arrives mid-solve; solver result arrives later | API cancel at T; solver returns at T+5s                                | Cancel writes `status='failed', failure_reason='cancelled'`; solver's conditional write returns 0; result discarded |        |           |
| SCH-W-045 | Cancel after solve completed (state machine reject)   | API cancel after row already `completed`                               | API rejects with state-machine error; row unchanged                                                                 |        |           |

### 13.6 Tenant isolation

| #         | Scenario                                                                    | Trigger                                      | Expected                                                                                      | Actual | Pass/Fail |
| --------- | --------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-W-050 | Enqueue with `tenant_id` missing                                            | Service called with undefined tenant         | `BadRequestException` synchronously; nothing reaches Redis                                    |        |           |
| SCH-W-051 | Enqueue with `tenant_id` not a UUID                                         | Service called with `tenant_id='not-a-uuid'` | `BadRequestException` (Zod)                                                                   |        |           |
| SCH-W-052 | Enqueue with `tenant_id=A` but `run_id=B`'s row                             | Manually craft payload                       | Worker claim returns 0 (RLS scope); processor exits; no cross-tenant write                    |        |           |
| SCH-W-053 | Concurrent solves: tenant A then tenant B                                   | Two enqueues, each with own tenant_id        | Each runs in own RLS tx; no leakage; both rows updated correctly under their own tenant scope |        |           |
| SCH-W-054 | RLS-disabled mock raises in `processJob` if `app.current_tenant_id` not set | Sabotage middleware                          | Test fails loudly; verifies the safety net exists                                             |        |           |
| SCH-W-055 | Reaper iteration leak guard                                                 | Mock RLS to track context-set calls          | `SET LOCAL app.current_tenant_id` called once per tenant; never re-used across iterations     |        |           |

### 13.7 Cron registration and dedupe

| #         | Scenario                                                                            | Trigger                                             | Expected                                                       | Actual | Pass/Fail |
| --------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- | ------ | --------- |
| SCH-W-060 | Worker boot registers exactly one cron repeat for `cron:scheduling:reap-stale-runs` | Boot → inspect `bull:scheduling:repeat:*`           | Exactly one entry                                              |        |           |
| SCH-W-061 | Worker reboot does not duplicate the repeat                                         | Reboot worker; inspect again                        | Still exactly one entry                                        |        |           |
| SCH-W-062 | Cron payload is empty `{}`                                                          | Inspect job data                                    | `data` is `{}`                                                 |        |           |
| SCH-W-063 | Cron name is `scheduling:reap-stale-runs`                                           | Inspect job name                                    | Matches                                                        |        |           |
| SCH-W-064 | Reaper retention `removeOnComplete=10`, `removeOnFail=50`                           | Run 100 reaper ticks; inspect completed/failed sets | Sizes capped at 10 and 50 respectively                         |        |           |
| SCH-W-065 | Solve job retention `removeOnComplete=100`, `removeOnFail=200`                      | Run 300 solve jobs; inspect sets                    | Sizes capped at 100 and 200 respectively                       |        |           |
| SCH-W-066 | Worker offline 10 minutes does not backfill missed cron ticks                       | Stop worker; advance clock 10 min; restart          | Next reap fires once on next minute boundary; no 10-tick burst |        |           |

### 13.8 Edge / configuration

| #         | Scenario                                                                                  | Trigger                    | Expected                                                                                                                                       | Actual | Pass/Fail |
| --------- | ----------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-W-070 | `tenant_scheduling_settings` row missing                                                  | Tenant has no settings row | Default `max_solver_duration` used; no crash                                                                                                   |        |           |
| SCH-W-071 | `tenant_scheduling_settings.max_solver_duration` set to extremely high value (e.g. 3600s) | Override per-test          | Solver timeout = 3660s; reaper grace = 3660s                                                                                                   |        |           |
| SCH-W-072 | `tenant_scheduling_settings.max_solver_duration=0` (misconfiguration)                     | Override                   | Solver timeout floor of 120s applied (per `max(120, ...)` expression). Document reaper behaviour separately — flag if reaper fails immediately |        |           |
| SCH-W-073 | `config_snapshot` is null on the `scheduling_runs` row                                    | Manually corrupt row       | Processor catches; `status='failed'`, `failure_reason='Missing config snapshot'`                                                               |        |           |
| SCH-W-074 | `config_snapshot` JSONB does not match solver schema                                      | Inject malformed snapshot  | Solver returns 4xx; row → `failed`; failure reason captures malformed-input error                                                              |        |           |
| SCH-W-075 | Run row deleted between job pickup and claim                                              | Delete row mid-flight      | Claim returns 0; processor exits; no error                                                                                                     |        |           |
| SCH-W-076 | Tenant deleted between enqueue and processing                                             | Soft-delete tenant         | Processor exits cleanly; reaper iteration skips                                                                                                |        |           |

### 13.9 Observability

| #         | Scenario                                                                 | Trigger                                 | Expected                                                                                 | Actual | Pass/Fail |
| --------- | ------------------------------------------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------- | ------ | --------- |
| SCH-W-080 | Logger emits `[Scheduling] tenant=<id> run=<id> status=running` on claim | Spy on Logger                           | Log present                                                                              |        |           |
| SCH-W-081 | Logger emits `[Scheduling] solver_duration_ms=<n>` on completion         | Spy                                     | Log present                                                                              |        |           |
| SCH-W-082 | Logger emits `[StaleReaper] tenant=<id> reaped=<n>` per iteration        | Spy                                     | One log per tenant                                                                       |        |           |
| SCH-W-083 | Solver request body NOT logged (size + PII)                              | Spy                                     | Body not in any log                                                                      |        |           |
| SCH-W-084 | Failure reason NEVER null when `status='failed'`                         | All failure paths                       | `failure_reason` populated in every case                                                 |        |           |
| SCH-W-085 | Canary alert fires when a solve job sits in `wait` > 5 min               | Block worker; enqueue job; advance time | Alert payload includes `queue=scheduling`, `job_name='scheduling:solve-v2'`, `tenant_id` |        |           |
| SCH-W-086 | Reaper jobs never trip the canary                                        | Run reaper 10 times                     | No canary alert                                                                          |        |           |

### 13.10 Job-name routing (single queue, multi processor)

| #         | Scenario                                                                       | Trigger                          | Expected                                                       | Actual | Pass/Fail |
| --------- | ------------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------- | ------ | --------- |
| SCH-W-090 | `scheduling:solve-v2` is NOT processed by `SchedulingStaleReaperJob`           | Inspect processor job-name guard | Reaper sees and ignores via `if (job.name !== ...) return;`    |        |           |
| SCH-W-091 | `scheduling:reap-stale-runs` is NOT processed by `SchedulingSolverV2Processor` | Inspect processor job-name guard | Solver sees and ignores                                        |        |           |
| SCH-W-092 | Unknown job name `scheduling:does-not-exist` enqueued onto `scheduling`        | Manually enqueue                 | Both processors return early; job acknowledged; no retry storm |        |           |

---

## 14. Observations and Gaps Spotted

The following items were noticed during inventory analysis. Each is a candidate for a separate ticket — none of them are fixed in this spec.

1. **Stalled-but-running rows are not self-healing** — If a worker dies after writing `status='running'` but the solver actually never started (because the worker crashed before invoking it), the row sits in `running` until the stale-reaper picks it up a minute later. This is the documented intent, but the gap window (60s + max_solver_duration) means a tenant may see their UI stuck on a "running" row for several minutes. Consider a faster worker-restart hook that re-claims its own previously-claimed runs.

2. **`maxStalledCount=2` then no DLQ replay** — Once a job exceeds `maxStalledCount`, BullMQ moves it to `failed` (retained for 200 entries via `removeOnFail`). There is no automatic replay job and no DLQ inspection UI in the codebase. Operations would need raw Redis access to inspect — flag for ops runbook.

3. **Cron does not backfill missed ticks after worker downtime** — Acceptable because reaper is idempotent, but if the solver queue is also offline for >60s, runs may sit beyond their natural grace window with no visible failure. Add an alert on `bull:scheduling:repeat:*` heartbeat.

4. **Reaper grace = `max_solver_duration + 60s`** — Hard-coded buffer. If a tenant configures `max_solver_duration=3600s`, grace becomes 3660s, which is also the solver HTTP timeout. A solver that hangs at 3601s will be killed by the HTTP timeout AND by the reaper near-simultaneously. Document this overlap.

5. **`SchedulingSolverV2Processor` class name vs file structure** — Per `.inventory-worker.md` §4, both jobs are "handled by single SchedulingSolverV2Processor (job.name routing)". But §3.3 of this spec lists them as two separate classes (`SchedulingSolverV2Processor` and `SchedulingStaleReaperJob`). Verify the actual code structure during test implementation; if the inventory note is correct, test 5.x._ and 6.x._ both exercise the same class via job-name routing.

6. **No explicit DLQ semantics** — The codebase relies on `moveToFailed` + `removeOnFail` retention. There is no replay endpoint, no DLQ-specific monitoring, and no re-queue-from-failed tooling. Document explicitly that "DLQ" in this module means "the BullMQ failed set, manually inspectable".

7. **`tenant_id` mismatch detection** — The TenantAwareJob base class sets RLS context but does NOT explicitly assert that `payload.run_id` belongs to `payload.tenant_id`. The protection comes implicitly from RLS (claim updateMany returns 0). Consider adding an explicit guard log when a mismatch is detected, to surface tampering attempts.

8. **`config_snapshot` size** — JSONB column with no documented size cap. A pathological tenant with many classes/teachers could create a snapshot that exceeds Postgres TOAST sizes or chokes the solver HTTP body. No test asserts an upper bound today.

9. **No retry attempts override on `scheduling:solve-v2`** — Job relies entirely on stalled detection (`maxStalledCount=2`). A solver that returns deterministic 5xx will fail fast (no retry), which may be desired — but it means a transient solver flap (e.g. Python worker restarting) will fail user runs. Consider adding `attempts: 2, backoff: { type: 'exponential', delay: 30_000 }` for transient-error tolerance.

10. **Apply / cancellation side-effects are API-layer, not worker-layer** — Calendar regeneration, ICS token invalidation, and cover-notification fan-out happen in the API path. None of these are worker jobs in this module. If any of them become async in the future, this spec needs a new section.

---

## 15. Sign-off

| Role                  | Name | Date | Signature |
| --------------------- | ---- | ---- | --------- |
| Worker engineer       |      |      |           |
| QA lead               |      |      |           |
| SRE / on-call         |      |      |           |
| Tech lead, Scheduling |      |      |           |

**Pre-sign-off checklist:**

- [ ] Every test row in §13 has a corresponding Jest test file
- [ ] BullMQ harness can deterministically simulate worker SIGKILL
- [ ] Solver-mock supports timeout, 5xx, 4xx, malformed JSON, TCP RST modes
- [ ] Reaper grace can be overridden per test via `tenant_scheduling_settings`
- [ ] All §14 observations have been triaged (ticketed or knowingly accepted)
- [ ] Sign-off only after at least one full pass with all rows green on staging Redis
