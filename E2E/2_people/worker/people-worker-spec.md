# People — Worker / Background-Job Test Specification

> **Generated:** 2026-04-12  
> **Module slug:** `people`  
> **Scope:** BullMQ queues, cron, retry + dead-letter, async side-effect chains, idempotency, failure isolation, tenant-aware payload check.

The People module itself does NOT register a cron scheduler. Its async surface is two entries on the shared **`search-sync`** queue plus implicit reactions to mutations (audit-log interceptor runs in-process; the `audit-log` queue persists events asynchronously — covered by the audit-log worker spec in a cross-module leg, not here).

This spec focuses on what IS owned by People:

1. `search:index-entity` — per-entity upsert/delete on the `search-sync` queue.
2. `search:full-reindex` — tenant-wide bulk reindex.

Plus the integration points where People mutations enqueue those jobs, and the failure + isolation behaviour of the processors.

---

## Table of Contents

1. [Prerequisites & fixture seeding](#1-prerequisites--fixture-seeding)
2. [Queue inventory](#2-queue-inventory)
3. [Job inventory](#3-job-inventory)
4. [`search:index-entity` — happy path](#4-searchindex-entity--happy-path)
5. [`search:index-entity` — tenant-aware payload](#5-searchindex-entity--tenant-aware-payload)
6. [`search:index-entity` — retry + dead-letter](#6-searchindex-entity--retry--dead-letter)
7. [`search:index-entity` — idempotency](#7-searchindex-entity--idempotency)
8. [`search:index-entity` — failure isolation](#8-searchindex-entity--failure-isolation)
9. [`search:full-reindex` — happy path + batch](#9-searchfull-reindex--happy-path--batch)
10. [`search:full-reindex` — retry + scale](#10-searchfull-reindex--retry--scale)
11. [Async side-effect chains (People → search-sync)](#11-async-side-effect-chains-people--search-sync)
12. [Cron schedules (none owned by People)](#12-cron-schedules-none-owned-by-people)
13. [Observability + logging](#13-observability--logging)
14. [Sign-off](#14-sign-off)

---

## 1. Prerequisites & fixture seeding

| #   | What to run                                                                                                                                                                                                                                       | Expected                 | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------- |
| 1.1 | Test Redis instance dedicated to the test suite (e.g. `redis://localhost:6380/1`). All BullMQ queues connect to this instance — NOT the dev Redis.                                                                                                | Set via env `REDIS_URL`. |           |
| 1.2 | Test Postgres with Tenants A + B seeded per integration spec §1.1.                                                                                                                                                                                | Ready.                   |           |
| 1.3 | Worker process (`apps/worker`) started with fake timers (if testing cron) or real timers (if not).                                                                                                                                                | Worker booted.           |           |
| 1.4 | Helper `await drainQueue(queueName, timeout=10000)` — returns when queue waiting+active+delayed = 0, or throws if timeout exceeded.                                                                                                               | Helper ready.            |           |
| 1.5 | Helper `await queueState(queueName): { waiting, active, completed, failed, delayed }`.                                                                                                                                                            | Helper ready.            |           |
| 1.6 | Helper `await enqueue(queueName, jobName, payload, opts): JobId`.                                                                                                                                                                                 | Ready.                   |           |
| 1.7 | Search service is **stubbed** — the actual Meilisearch integration is not wired (per the processor comments: "TODO: Push document to Meilisearch"). Tests assert the processor reaches the stub log line, not that a remote document was indexed. | Acknowledged.            |           |

---

## 2. Queue inventory

The People module reads/writes only one queue: `search-sync` (`QUEUE_NAMES.SEARCH_SYNC`).

| Queue name    | Constant                  | Retry policy                                                                       | Removal policy                                                        | Concurrency                                                                                         | Rate limiter | Notes                           |
| ------------- | ------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------ | ------------------------------- |
| `search-sync` | `QUEUE_NAMES.SEARCH_SYNC` | BullMQ default (3 attempts, exponential backoff) unless overridden at enqueue time | `removeOnComplete: 10`, `removeOnFail: 50` (per CLAUDE.md convention) | 1 processor × `lockDuration: 30_000ms` for index-entity, `lockDuration: 120_000ms` for full-reindex | None         | Two processors share this queue |

| #   | What to Check                                                                                                                                                                          | Expected                             | Pass/Fail |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------- |
| 2.1 | Queue registered in `apps/worker/src/base/queue.constants.ts` at line 22: `SEARCH_SYNC: 'search-sync'`.                                                                                | Present.                             |           |
| 2.2 | Both processors use this queue: `SearchIndexProcessor` (`search:index-entity`) + `SearchReindexProcessor` (`search:full-reindex`).                                                     | Both processors active on the queue. |           |
| 2.3 | `stalledInterval: 60_000, maxStalledCount: 2` set on both.                                                                                                                             | Correct.                             |           |
| 2.4 | No `@Processor` decorator for another module accidentally reuses this queue name. `grep -rn "QUEUE_NAMES.SEARCH_SYNC" apps/worker/src` returns exactly these two files (plus imports). | Isolated.                            |           |
| 2.5 | `redis-cli KEYS "bull:search-sync:*"` after each test run has `removeOnComplete` honored — no unbounded growth.                                                                        | Bounded.                             |           |

---

## 3. Job inventory

### 3.1 `search:index-entity`

- **Constant:** `SEARCH_INDEX_ENTITY_JOB = 'search:index-entity'` (`search-index.processor.ts:19`)
- **Processor:** `SearchIndexProcessor` (`apps/worker/src/processors/search-index.processor.ts`)
- **Payload:**
  ```ts
  interface SearchIndexEntityPayload extends TenantJobPayload {
    tenant_id: string; // required
    entity_type: 'student' | 'parent' | 'staff' | 'household' | 'homework_assignment';
    entity_id: string;
    action: 'upsert' | 'delete';
  }
  ```
- **Trigger:** enqueued by People services after create/update of a student, parent, staff, or household. Also by homework module for assignment events.
- **Side effects:** loads entity from DB via RLS-aware tx, builds search document, pushes to Meilisearch (currently stubbed — logs only).
- **Error modes:** missing tenant_id → throws (rejects the job, non-retryable in practice as the payload is invalid). DB read failure during build → retryable.

### 3.2 `search:full-reindex`

- **Constant:** `SEARCH_FULL_REINDEX_JOB = 'search:full-reindex'` (`search-reindex.processor.ts:16`)
- **Processor:** `SearchReindexProcessor`
- **Payload:**
  ```ts
  type SearchFullReindexPayload = TenantJobPayload; // just tenant_id
  ```
- **Trigger:** no automatic trigger in the current codebase. Ops can enqueue manually via a management script / BullBoard.
- **Side effects:** batches through students, parents, staff, households (batch size 200) for the tenant, logs stub.
- **Error modes:** DB failure during batch → retryable.

### 3.3 Search-sync enqueue sites in the People module

Grep the code: `grep -rn "search:index-entity\|SEARCH_INDEX_ENTITY_JOB" apps/api/src/modules/{students,parents,households,staff-profiles}`.

**Observation W1**: as of 2026-04-12, none of the People services appear to enqueue a `search:index-entity` job directly on create/update. The job is designed to be consumed but there may be no producer yet (the search integration is stubbed end-to-end). Confirm by running the grep. If no producer is wired:

- The "Enqueue on create" rows below (5.1–5.4, 7.1) become N/A until the producer is added.
- Flag W1 as a coverage gap: the module has a reactive search index design but the trigger is missing. Either wire it via an event-bus / after-commit hook, or remove the processor from the search-sync queue until the producer lands.

For the remainder of this spec, every "enqueue on X" row lists both outcomes: the expected behaviour if W1 is fixed, and the current N/A outcome.

---

## 4. `search:index-entity` — happy path

### 4.1 Upsert — student

| #     | What to run                                                                                                                                                                                                                                                                                                                                                               | Expected                                                  | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| 4.1.1 | Enqueue `{ tenant_id: <A>, entity_type: 'student', entity_id: <knownStudentA>, action: 'upsert' }`.                                                                                                                                                                                                                                                                       | Job transitions waiting → active → completed within ≤ 5s. |           |
| 4.1.2 | Worker log contains: `Processing search:index-entity — upsert student:<id> for tenant <A>`.                                                                                                                                                                                                                                                                               | Matches.                                                  |           |
| 4.1.3 | Worker log contains the stub line: `[stub] Would upsert student:<id> to search index for tenant <A>`.                                                                                                                                                                                                                                                                     | Present.                                                  |           |
| 4.1.4 | RLS context set correctly — the DB read inside `buildDocument` succeeds only for a student in tenant A. Confirm by enqueueing an upsert for a student whose `tenant_id` column in DB is B but the job's `tenant_id` payload is A: the `findFirst` with both filters returns null, processor logs a `Entity not found during upsert` warning, and completes without error. | Correct.                                                  |           |
| 4.1.5 | Completed job visible via `queue.getCompleted()`. `attemptsMade=1`.                                                                                                                                                                                                                                                                                                       | Correct.                                                  |           |

### 4.2 Upsert — parent

| #     | What to run                                                                                       | Expected                                                   | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------- |
| 4.2.1 | Enqueue `{ tenant_id: <A>, entity_type: 'parent', entity_id: <knownParentA>, action: 'upsert' }`. | Completes. Stub log: `[stub] Would upsert parent:<id>...`. |           |

### 4.3 Upsert — staff

| #     | What to run                                                                                                                                    | Expected             | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------- |
| 4.3.1 | Enqueue `{ tenant_id: <A>, entity_type: 'staff', entity_id: <knownStaffA>, action: 'upsert' }`.                                                | Completes. Stub log. |           |
| 4.3.2 | `buildDocument` for staff reads `staff_profiles.user`, so the user row must exist. If missing, processor returns null → warning + no stub log. | Covered.             |           |

### 4.4 Upsert — household

| #     | What to run               | Expected   | Pass/Fail |
| ----- | ------------------------- | ---------- | --------- |
| 4.4.1 | Enqueue household upsert. | Completes. |           |

### 4.5 Delete — any entity

| #     | What to run                                                                                    | Expected                                                                                                                              | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.5.1 | Enqueue `{ tenant_id: <A>, entity_type: 'student', entity_id: 'any-uuid', action: 'delete' }`. | Processor hits the else branch. Stub log: `[stub] Would delete student:<id> from search index for tenant <A>`. No DB read. Completes. |           |
| 4.5.2 | Deletes work even for entity_ids that no longer exist in DB (idempotent — just a stub).        | Completes.                                                                                                                            |           |

### 4.6 Unknown entity type (type-exhaustiveness guard)

| #     | What to run                                   | Expected                                                                                                                          | Pass/Fail |
| ----- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.6.1 | Enqueue with `entity_type: 'invalid'` (cast). | Processor throws `Unknown entity type: invalid` from the default branch. Job fails. Retries per policy; eventually dead-lettered. |           |

### 4.7 Wrong job name on queue

| #     | What to run                                                           | Expected                                                                                                                                                                                                           | Pass/Fail |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.7.1 | Enqueue on `search-sync` with job name `'random:name'` and a payload. | `SearchIndexProcessor` returns without processing (guard clause `if (job.name !== SEARCH_INDEX_ENTITY_JOB) return;`). `SearchReindexProcessor` also returns. BullMQ marks the job completed (since neither threw). |           |

---

## 5. `search:index-entity` — tenant-aware payload

### 5.1 Missing `tenant_id`

| #     | What to run                                                                                      | Expected                                                                               | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------- |
| 5.1.1 | Enqueue `{ entity_type: 'student', entity_id: <id>, action: 'upsert' }` WITHOUT `tenant_id`.     | Processor throws: `Job rejected: missing tenant_id in payload.` Job fails immediately. |           |
| 5.1.2 | After max retries (default 3), job is moved to the failed list. `queue.getFailed()` contains it. | Correct.                                                                               |           |

### 5.2 `tenant_id` set correctly → RLS inside processor

| #     | What to run                                                                                                                                                                                                                                                  | Expected | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------- |
| 5.2.1 | Processor delegates to `TenantAwareJob.execute(data)` which sets `app.current_tenant_id` inside an interactive transaction. Confirm by instrumenting the Prisma `$on('query')` — the first statement in the TX is `SET LOCAL app.current_tenant_id = '<A>'`. | Correct. |           |
| 5.2.2 | The subsequent `tx.student.findFirst({ where: { id, tenant_id } })` is double-scoped (RLS + explicit filter). Result is tenant-isolated.                                                                                                                     | Correct. |           |

### 5.3 Cross-tenant entity_id under RLS

| #     | What to run                                                                                           | Expected                                                                                                                                                                                                           | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.3.1 | Enqueue `{ tenant_id: <A>, entity_type: 'student', entity_id: <tenantB_student>, action: 'upsert' }`. | Processor runs with RLS scope A. `findFirst` returns null → warning `Entity not found during upsert: student:<id> (tenant <A>) — skipping`. Stub log NOT emitted. Job completes successfully (non-retryable warn). |           |
| 5.3.2 | No search document for the Tenant B student is ever produced (no leak).                               | Correct.                                                                                                                                                                                                           |           |

### 5.4 Enqueue without tenant_id via a producer bug

| #     | What to run                                                                | Expected                                                                                                                                                             | Pass/Fail |
| ----- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.4.1 | Simulate a People service bug: enqueue an upsert with tenant_id=undefined. | Rejected at enqueue time if the producer uses a `TenantAwareJob` enqueue helper with a payload-validation guard. If not, the processor catches at runtime (see 5.1). |           |

---

## 6. `search:index-entity` — retry + dead-letter

### 6.1 Transient failure → retry succeeds

| #     | What to run                                                                                                                          | Expected                                                                                                         | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1.1 | Mock the DB `findFirst` to throw a transient error once, then succeed.                                                               | Processor attempt 1 fails → BullMQ retries after backoff → attempt 2 succeeds → job completed. `attemptsMade=2`. |           |
| 6.1.2 | Backoff timing: between attempts 1 and 2 ≥ baseline (e.g. 500ms) and ≤ upper bound per exponential schedule. Do not assert exact ms. | Within bounds.                                                                                                   |           |

### 6.2 Permanent failure → dead-letter

| #     | What to run                                                                                                                                                                                                                                                                                         | Expected                                                                      | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| 6.2.1 | Mock the DB to always throw a FK-like error.                                                                                                                                                                                                                                                        | After `attemptsMade` = max (3 default), job lands in `failed` list.           |           |
| 6.2.2 | Dead-letter monitoring: the `dlq-monitor` processor (in `apps/worker/src/processors/monitoring/dlq-monitor.processor.ts`) scans all queues' failed lists and raises an operational alert if count exceeds a threshold. Verify by pushing 100 failed jobs and confirming the monitor emits a metric. | (Cross-module — verify separately).                                           |           |
| 6.2.3 | Failed jobs can be retried manually by ops via BullBoard's **Retry** button.                                                                                                                                                                                                                        | UI available.                                                                 |           |
| 6.2.4 | `removeOnFail: 50` — after 50 failures accumulate, the oldest are pruned.                                                                                                                                                                                                                           | Verify via `queue.getFailed()` length never exceeds 50 after forced failures. |           |

### 6.3 Idempotent retry

| #     | What to run                                                                                                                                                                                                       | Expected    | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| 6.3.1 | A retry of an upsert job (after a partial failure) pushes the same document — because Meilisearch upserts are idempotent on `id`, the second push is a no-op. Stub log fires again, but no duplicate side effect. | Idempotent. |           |
| 6.3.2 | A retry of a delete is idempotent trivially.                                                                                                                                                                      | Idempotent. |           |

---

## 7. `search:index-entity` — idempotency

### 7.1 Same job enqueued twice

| #     | What to run                                                                                                                                                                                                                    | Expected                                                                                                                      | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1.1 | Enqueue the same payload twice in quick succession.                                                                                                                                                                            | Two distinct jobs run. Both succeed. Meilisearch receives two upserts for the same id — no duplicate document (upsert by id). |           |
| 7.1.2 | If the producer uses a deterministic `jobId` (e.g. `search:index-entity:student:<id>`), BullMQ dedups automatically and only one job runs. **Confirm whether producers set `jobId`** — if not, flag **W2** as an optimization. | Optimisation gap.                                                                                                             |           |

### 7.2 Enqueue across a crash

| #     | What to run                                                | Expected                                                                                                             | Pass/Fail |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.2.1 | Enqueue → kill the worker mid-processing → restart worker. | BullMQ detects the stalled job after `stalledInterval` (60s) and retries (up to `maxStalledCount=2`). Job completes. |           |

---

## 8. `search:index-entity` — failure isolation

| #   | What to run                                                                                            | Expected                                                                                           | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Enqueue 10 jobs: 8 valid, 2 with missing tenant_id.                                                    | The 8 complete. The 2 fail and retry independently. The good jobs are NOT blocked by the bad ones. |           |
| 8.2 | Enqueue 10 jobs for 10 different tenants. One tenant (say Tenant B) has a broken DB (simulate).        | Tenant A's 5 jobs succeed. Tenant B's 5 jobs retry + fail. Tenant A's jobs are NOT blocked.        |           |
| 8.3 | Processor concurrency is 1 per worker replica (default). Run two worker replicas — throughput doubles. | Verify by enqueueing 100 jobs and timing.                                                          |           |

---

## 9. `search:full-reindex` — happy path + batch

### 9.1 Tenant with small data

| #     | What to run                                                                                                                                                                                                                                       | Expected                                              | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------- |
| 9.1.1 | Enqueue `{ tenant_id: <A> }`. Tenant A has 209 students, 30 parents, 20 staff, 50 households.                                                                                                                                                     | Job transitions active → completed. `attemptsMade=1`. |           |
| 9.1.2 | Stub logs: `[stub] Would index 200 students... Would index 9 students... Would index 30 parents... Would index 20 staff... Would index 50 households...`. Ordering matches `reindexStudents → reindexParents → reindexStaff → reindexHouseholds`. | Log sequence matches.                                 |           |
| 9.1.3 | Each batch size = 200 (per `BATCH_SIZE` constant). With 209 students, batches are 200 + 9.                                                                                                                                                        | Correct.                                              |           |

### 9.2 Tenant with zero data

| #     | What to run                                              | Expected                                                                                                               | Pass/Fail |
| ----- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.2.1 | Create a fresh tenant with 0 rows. Enqueue full-reindex. | Job completes immediately. All four reindex methods run and exit without iterating (do-while with `batch.length===0`). |           |
| 9.2.2 | Final log: `Full reindex complete for tenant <id>`.      | Present.                                                                                                               |           |

### 9.3 Missing tenant_id

| #     | What to run   | Expected                                              | Pass/Fail |
| ----- | ------------- | ----------------------------------------------------- | --------- |
| 9.3.1 | Enqueue `{}`. | `Job rejected: missing tenant_id in payload.` Failed. |           |

### 9.4 Non-existent tenant_id

| #     | What to run                                                      | Expected                                                                                                                                                         | Pass/Fail |
| ----- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.4.1 | Enqueue `{ tenant_id: '00000000-0000-0000-0000-000000000000' }`. | Processor runs. `findMany` scopes by RLS → returns empty arrays. Job completes with zero batches. No error. Log: `Full reindex complete for tenant 00000000...`. |           |

### 9.5 lockDuration vs. long runs

| #     | What to run                                                                                                                                                       | Expected                                                                                                          | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 9.5.1 | Seed a tenant with 50,000 students. Enqueue full-reindex.                                                                                                         | Job runs past initial `lockDuration: 120_000ms` → BullMQ extends lock every tick. Does NOT go stalled. Completes. |           |
| 9.5.2 | Measure wall-time to completion. Target: < 60s for 50k students (stub path — no actual Meilisearch call). Perf spec captures real numbers with Meilisearch wired. | Under 60s.                                                                                                        |           |

---

## 10. `search:full-reindex` — retry + scale

### 10.1 Mid-batch failure

| #      | What to run                                                                                                                     | Expected                                                                                                                                                                            | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1.1 | Mock `tx.parent.findMany` to throw on the 3rd iteration.                                                                        | Processor attempt 1 fails partway (some students already "indexed" to the stub). Retry attempt 2 starts from scratch (the batches are NOT resumable). All four entity types re-run. |           |
| 10.1.2 | Idempotent at the Meilisearch level because `addDocuments` upserts by id. The stub logs multiple times per entity — acceptable. | Idempotent.                                                                                                                                                                         |           |

### 10.2 One bad tenant doesn't break others

| #      | What to run                                                                                     | Expected                                                                    | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------- |
| 10.2.1 | Enqueue full-reindex for both A and B. Inject a DB error for the parent batch only in tenant A. | Tenant A's job fails after retries. Tenant B's job completes independently. |           |

### 10.3 Queue bloat

| #      | What to run                                                                                                  | Expected                                                                                                            | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.3.1 | Enqueue 20 full-reindex jobs (for 20 tenants) sequentially. BullMQ runs them one-at-a-time at concurrency 1. | Processed sequentially. Total wall-time = sum of individual run-times. `removeOnComplete` keeps only the latest 10. |           |

---

## 11. Async side-effect chains (People → search-sync)

### 11.1 Student create → search upsert

| #      | What to run                                                                            | Expected                                                                                                                                                                                                              | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1.1 | POST `/v1/students` (valid). After the HTTP response, check `search-sync` queue state. | **If W1 is fixed:** 1 new `search:index-entity` job waiting/active with payload `{ tenant_id, entity_type: 'student', entity_id: <new>, action: 'upsert' }`. **Current state:** 0 jobs (no producer wired) — flag W1. |           |
| 11.1.2 | After drain, the stub log fires.                                                       | If wired.                                                                                                                                                                                                             |           |

### 11.2 Student update → upsert

| #      | What to run      | Expected                 | Pass/Fail |
| ------ | ---------------- | ------------------------ | --------- |
| 11.2.1 | PATCH a student. | 1 upsert job — if wired. |           |

### 11.3 Student status change → upsert

| #      | What to run   | Expected                 | Pass/Fail |
| ------ | ------------- | ------------------------ | --------- |
| 11.3.1 | PATCH status. | 1 upsert job — if wired. |           |

### 11.4 Household create / merge / split → upserts

| #      | What to run                                                            | Expected  | Pass/Fail |
| ------ | ---------------------------------------------------------------------- | --------- | --------- |
| 11.4.1 | Create household → 1 upsert.                                           | If wired. |           |
| 11.4.2 | Merge → 2 upserts (source + target) + upserts for every moved student. | If wired. |           |
| 11.4.3 | Split → 2 upserts (source + new) + upserts per moved student.          | If wired. |           |

### 11.5 Staff create / update → upsert

| #      | What to run                         | Expected  | Pass/Fail |
| ------ | ----------------------------------- | --------- | --------- |
| 11.5.1 | POST /v1/staff-profiles → 1 upsert. | If wired. |           |
| 11.5.2 | PATCH → 1 upsert.                   | If wired. |           |

### 11.6 Parent create / update → upsert

| #      | What to run                  | Expected  | Pass/Fail |
| ------ | ---------------------------- | --------- | --------- |
| 11.6.1 | POST /v1/parents → 1 upsert. | If wired. |           |
| 11.6.2 | PATCH → 1 upsert.            | If wired. |           |

### 11.7 Soft-delete / archive → delete

| #      | What to run                                                                                | Expected  | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------ | --------- | --------- |
| 11.7.1 | Archive a student (status=archived) → `action: 'delete'` job enqueued (remove from index). | If wired. |           |
| 11.7.2 | Merge's archive-of-source → delete job for the source household.                           | If wired. |           |

### 11.8 Audit-log side effect

| #      | What to run                                                                                                                                                                                                                                             | Expected         | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------- |
| 11.8.1 | Every People mutation (POST/PATCH/PUT/DELETE) enqueues a job on the `audit-log` queue with the audit payload. Covered in the cross-module audit-log spec; for People, the assertion is: "after any mutation, `audit-log` queue length +1 within 100ms". | +1 per mutation. |           |

---

## 12. Cron schedules (none owned by People)

The People module does NOT register any cron jobs in `CronSchedulerService`. Verify:

| #    | What to run                                                                                                                   | Expected | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 12.1 | `grep -rn "CronSchedulerService\|@Cron" apps/api/src/modules/{students,parents,households,staff-profiles}` returns zero hits. | None.    |           |
| 12.2 | `grep -rn "repeat: { cron" apps/api/src/modules/{students,parents,households,staff-profiles}` zero hits.                      | None.    |           |
| 12.3 | The People module does NOT register any BullMQ cron entries. Confirm in the central scheduler.                                | Absent.  |           |

Cron-dependent flows that TOUCH People data (e.g. attendance auto-lock, behaviour digest, finance invoice generation) are owned by their respective modules and are covered by:

- `5_operations/attendance/` (when produced)
- `4_Wellbeing/behaviour/` (when produced)
- `7_finance/worker/finance-worker-spec.md` (finance chains)

Flag **W3** if any cron outside the People module mutates People tables without going through People services — that would be a cross-module danger zone worth tracking in `docs/architecture/danger-zones.md`.

---

## 13. Observability + logging

| #    | What to run                                                                                                                                                                                                                                           | Expected    | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| 13.1 | On job start: structured log with `Processing <job name> — <action> <entity_type>:<entity_id> for tenant <tenant_id>`.                                                                                                                                | Present.    |           |
| 13.2 | On success: no explicit success log (relies on BullMQ's own event). Acceptable.                                                                                                                                                                       | Acceptable. |           |
| 13.3 | On failure: BullMQ emits a `failed` event. The DLQ monitor processor picks it up and logs at ERROR level with `tenant_id`, `job_id`, `attempt_number`, `error_message`.                                                                               | Present.    |           |
| 13.4 | Sensitive data in logs: inspect all log output for the two processors — must NOT include bank numbers (we're not processing staff bank fields here, but confirm), national_ids, emails, phone numbers. The processors only log entity IDs and counts. | Clean.      |           |
| 13.5 | Metrics: every processed job emits a `worker.job.processed` metric (counter) tagged with queue + job name + outcome. Verify via the metrics endpoint / prometheus scrape.                                                                             | Present.    |           |
| 13.6 | Tenant_id is always in structured log fields, not concatenated into the message only.                                                                                                                                                                 | Correct.    |           |

---

## 14. Sign-off

| Section                           | Reviewer | Date | Rows passed / total | Notes               |
| --------------------------------- | -------- | ---- | ------------------- | ------------------- |
| 1. Prerequisites                  |          |      |                     |                     |
| 2. Queue inventory                |          |      |                     |                     |
| 3. Job inventory                  |          |      |                     |                     |
| 4. search:index-entity happy path |          |      |                     |                     |
| 5. Tenant-aware payload           |          |      |                     |                     |
| 6. Retry + dead-letter            |          |      |                     |                     |
| 7. Idempotency                    |          |      |                     |                     |
| 8. Failure isolation              |          |      |                     |                     |
| 9. search:full-reindex happy path |          |      |                     |                     |
| 10. Full-reindex retry + scale    |          |      |                     |                     |
| 11. Async chains                  |          |      |                     |                     |
| 12. Cron (N/A)                    | n/a      | n/a  | n/a                 | Module owns no cron |
| 13. Observability                 |          |      |                     |                     |

**Release-ready when:**

- Every row in §5 (tenant-aware payload) passes — a queue that silently processes jobs without tenant_id is a security hole, AND
- Every retry row in §6 completes within the documented policy, AND
- Async chains (§11) fire for every mutation — OR W1 is documented and accepted as a known gap.

**Findings flagged during worker walkthrough:**

- **W1:** No producer appears to enqueue `search:index-entity` jobs on People service mutations — the search integration is designed but not wired end-to-end. Consider adding an after-commit hook in a common module-level helper.
- **W2:** Producers (when wired) should set a deterministic `jobId` like `search:index-entity:<entity_type>:<entity_id>` to dedup rapid successive updates.
- **W3:** Audit whether any cron outside People mutates people tables directly; if yes, document in `docs/architecture/danger-zones.md`.

---

**End of Worker Spec.**
