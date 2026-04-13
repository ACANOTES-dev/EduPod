# Report Cards — Worker (BullMQ + Cron) Test Specification

**Module:** Report Cards (Learning domain)
**Scope:** Background job processors, cron schedules, queue behaviour, tenant isolation in worker context
**Queue under test:** `gradebook`
**Spec date:** 2026-04-12
**Owner:** Platform / Learning squad
**Last verified against:** `apps/worker/src/modules/gradebook/*`, `apps/worker/src/base/queue.constants.ts`, `apps/worker/src/cron/cron-scheduler.service.ts`

---

## 1. Purpose & How to Execute

This spec defines worker-level acceptance tests for the Report Cards module. Every row in every table below maps to a Jest/BullMQ integration test in `apps/worker/test/` (or a `*.processor.spec.ts` file co-located with the processor). The test harness is the standard EduPod worker test harness:

- **Framework:** Jest + `@nestjs/testing` + a real Redis (ioredis-mock is NOT sufficient for BullMQ semantics; use a Dockerised Redis on port 6379 or the CI-provided Redis on 5554).
- **Prisma:** Real Postgres — the `school_platform` test DB on port 5553 (integration CI) or `edupod_test` on 5432 (unit CI). Migrations applied before suite.
- **Queue:** `gradebook` queue, created via `BullModule.registerQueueAsync({ name: QUEUE_NAMES.GRADEBOOK })`.
- **Test style:** enqueue a job with `queue.add(jobName, payload, opts)`, then either:
  - (a) wait for the job to complete via `await queue.getJob(id).then(j => j.waitUntilFinished(queueEvents))`, OR
  - (b) invoke the processor's `process(job)` method directly (preferred for unit-style assertions).
- **Tenant context:** tests that require RLS set `tenant_id` via the `TenantAwareJob` base class pipeline. Direct Prisma calls inside tests must use `createRlsClient()` to mirror production.
- **Dispatcher:** the `gradebook` queue is multiplexed — the `GradebookQueueDispatcher` routes a single incoming job to the correct processor by `job.name`. Tests assert dispatcher routing, not just processor behaviour.

Each row produces one test case. Pass/Fail column is filled in during execution.

---

## 2. Prerequisites

Before running any worker test in this spec:

| #   | Prereq                                                                                                                                          | How to verify                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Redis reachable on the configured `REDIS_URL`                                                                                                   | `redis-cli -u $REDIS_URL ping` returns `PONG`                                                    |
| 2   | Postgres reachable with migrations applied                                                                                                      | `npx prisma migrate status` clean                                                                |
| 3   | `gradebook` queue registered with BullMQ (QueueEvents subscribed)                                                                               | `await new Queue('gradebook').isPaused()` returns `false`                                        |
| 4   | Two test tenants seeded: tenant A (has Report Cards module enabled) and tenant B (does NOT)                                                     | Query `module_enablements` by `tenant_id`                                                        |
| 5   | At least one academic_period row ending within the last 24h for tenant A                                                                        | `SELECT * FROM academic_periods WHERE tenant_id = $1 AND end_date > now() - interval '24 hours'` |
| 6   | Seeded students, class, gradebook entries, report_card_template for tenant A                                                                    | Fixture script `seed:report-cards-worker`                                                        |
| 7   | `REPORT_CARD_STORAGE_WRITER_TOKEN` is either `S3ReportCardStorageWriter` (with mock S3) or `NullReportCardStorageWriter` — tests branch on this | Log which writer is bound on worker startup                                                      |
| 8   | Sentry + Prometheus hooks mocked (spy-only; no real network)                                                                                    | Confirmed in `test-utils/monitoring.ts`                                                          |

---

## 3. Queue Registration & Dispatcher Routing

Verifies that the `gradebook` queue exists, that all four job types subscribe to it, and that the dispatcher routes by `job.name` correctly. Multiple processors sharing one queue is an EduPod pattern — the dispatcher is the enforcement point.

| #   | Test Name                                                  | Setup                                                                           | Expected                                                                                                                          | Pass/Fail |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | `gradebook` queue is registered at worker startup          | Boot worker with AppModule; inspect `BullModule` registrations                  | `gradebook` present in `QUEUE_NAMES`; Queue instance resolvable via DI                                                            |           |
| 3.2 | Dispatcher has guard clauses for all four job names        | Introspect `GradebookQueueDispatcher.process()`                                 | Branches exist for `report-cards:generate`, `report-cards:auto-generate`, `gradebook:mass-report-card-pdf`, `gradebook:batch-pdf` |           |
| 3.3 | Unknown job name is rejected with clear log                | Enqueue `gradebook` job with name `report-cards:bogus`                          | Dispatcher logs `[GradebookQueueDispatcher] Unknown job name: report-cards:bogus`; job completes as no-op without mutating DB     |           |
| 3.4 | All four processors are instantiated under one WorkerHost  | Worker DI graph snapshot                                                        | Four processor classes present; all extend `WorkerHost`; all share the `gradebook` queue token                                    |           |
| 3.5 | Queue events channel is subscribed for lifecycle telemetry | Listener registered on `completed`, `failed`, `active`, `stalled`               | Counters fire via `PrometheusService` on each event                                                                               |           |
| 3.6 | Dispatcher preserves BullMQ Job metadata across routing    | Enqueue with `jobId`, `attempt`, `data`; assert processor receives same Job ref | Dispatcher passes `job` by reference; no shallow copy that would drop `attemptsMade`                                              |           |

---

## 4. Job Payload Validation — Missing `tenant_id`

Worker-level contract: every tenant-scoped job MUST carry `tenant_id`. The queue itself should reject payloads missing tenant context at enqueue time. Silent skips are forbidden.

| #   | Test Name                                                                                               | Setup                                    | Expected                                                                                         | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 4.1 | Enqueueing `report-cards:generate` with `{}` fails fast                                                 | `queue.add('report-cards:generate', {})` | `TenantAwareJob` enqueue guard throws `MissingTenantContextError`; job is NOT persisted in Redis |           |
| 4.2 | Enqueueing `gradebook:mass-report-card-pdf` with `{ report_card_ids: [...] }` (no tenant_id) fails fast | Same pattern                             | Rejected at enqueue; error is structured `{ code: 'MISSING_TENANT_ID', message: ... }`           |           |
| 4.3 | Enqueueing `gradebook:batch-pdf` with `tenant_id: null` fails fast                                      | `queue.add(...)` with explicit null      | Rejected; null is treated identically to missing                                                 |           |
| 4.4 | If a malformed job somehow enters Redis, processor still refuses to touch DB                            | Inject raw Redis payload bypassing guard | Processor logs error + fails job without running any Prisma query                                |           |
| 4.5 | Sentry breadcrumb captured on rejection                                                                 | Spy on Sentry                            | `Sentry.captureException` called with job name + tenant assertion failure                        |           |

---

## 5. Job Payload Validation — Invalid `tenant_id`

Beyond presence, tenant_id must be a valid UUID that resolves to an existing tenant row.

| #   | Test Name                                                                  | Setup                                                      | Expected                                                                                  | Pass/Fail |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| 5.1 | Malformed UUID rejected at enqueue                                         | `tenant_id: 'not-a-uuid'`                                  | Zod/schema guard throws; job not persisted                                                |           |
| 5.2 | Well-formed UUID that doesn't match any tenant rejected at processor start | `tenant_id: <random valid UUID>`                           | Processor fails job with `TENANT_NOT_FOUND`; writes `error_message`; no card rows created |           |
| 5.3 | Archived/suspended tenant is rejected with distinct error                  | Tenant row exists but `status = 'suspended'`               | Processor fails with `TENANT_SUSPENDED`; no DB writes                                     |           |
| 5.4 | Tenant with Report Cards module DISABLED is rejected                       | Tenant A exists, `module_enablements.report_cards = false` | Processor fails with `MODULE_DISABLED`; no DB writes                                      |           |

---

## 6. Job Payload Validation — Non-existent `batch_job_id`

For `report-cards:generate`, a valid batch_job_id must exist for the tenant. A stale or wrong ID causes the batch to fail loudly.

| #   | Test Name                                                                | Setup                                                               | Expected                                                                                                          | Pass/Fail |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Unknown batch_job_id fails the job immediately                           | Enqueue `{ tenant_id, batch_job_id: <random UUID> }`                | Processor fails; `report_card_batch_jobs` is NOT updated (nothing to update); Sentry captures the stale reference |           |
| 6.2 | batch_job_id belonging to another tenant is rejected via RLS             | Create batch_job under tenant B, enqueue under tenant A with B's id | RLS-scoped lookup returns null; processor fails with `BATCH_JOB_NOT_FOUND`; no cross-tenant read leaks            |           |
| 6.3 | batch_job_id already in terminal state (`completed`/`failed`) is refused | Batch_job exists but status is `completed`                          | Processor logs `BATCH_JOB_ALREADY_TERMINAL`; refuses to reprocess                                                 |           |
| 6.4 | batch_job transitions to `failed` and `error_message` is populated       | Trigger failure via 6.1 setup                                       | `status = 'failed'`, `error_message` is human-readable, `completed_at` set                                        |           |

---

## 7. `report-cards:generate` — Happy Path

End-to-end: batch_job created (by API), job enqueued, processor snapshots all students in the target class, renders PDFs, uploads to S3 (if writer is S3), and marks batch_job complete.

| #   | Test Name                                                                          | Setup                                                                       | Expected                                                                                                                 | Pass/Fail |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 7.1 | N=20 students → 20 `report_cards` rows created with status `draft`                 | Seed 20 students, enqueue `report-cards:generate` with valid `batch_job_id` | 20 rows; all `status = 'draft'`; all have `tenant_id` of tenant A                                                        |           |
| 7.2 | `snapshot_payload_json` populated with immutable grades snapshot                   | Inspect first row                                                           | JSONB contains `subjects[]`, `grades[]`, `teacher_comments[]`, `period_metadata` keyed by subject_id; frozen in time     |           |
| 7.3 | `pdf_storage_key` set when S3 writer bound                                         | Use mock `S3ReportCardStorageWriter`                                        | Key pattern `tenants/<tenant_id>/report-cards/<period_id>/<card_id>.pdf`; S3 PutObject called once per card              |           |
| 7.4 | `pdf_storage_key` is null when NullWriter bound                                    | Use `NullReportCardStorageWriter` (default)                                 | `pdf_storage_key = null`; no S3 calls; job completes successfully (this is the current prod-default behaviour — see §34) |           |
| 7.5 | `report_card_batch_jobs` updated to `status = 'completed'`, `completed_count = 20` | Re-read batch_job after processor returns                                   | `status = 'completed'`, `completed_count = total_count = 20`, `failed_count = 0`, `completed_at` set                     |           |
| 7.6 | Processor emits Prometheus `report_cards_generated_total` counter                  | Spy on metrics registry                                                     | Counter incremented by 20; labels include `tenant_id` (hashed)                                                           |           |
| 7.7 | Processor completes within SLO (<60s for N=20 with NullWriter)                     | Benchmark run                                                               | `duration_ms < 60000` recorded on completion event                                                                       |           |

---

## 8. `report-cards:generate` — Partial Failure

One student has no grades at all (brand-new enrolment). That card should fail individually without torpedoing the entire batch.

| #   | Test Name                                                                 | Setup                                               | Expected                                                                                                     | Pass/Fail |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| 8.1 | Per-card failure is isolated                                              | 20 students, student #17 has zero gradebook entries | 19 cards with `status = 'draft'`; card #17 with `status = 'failed'` and `failure_reason = 'NO_GRADES_FOUND'` |           |
| 8.2 | Batch job `completed_count` counts only successes                         | After 8.1                                           | `completed_count = 19`, `failed_count = 1`, `total_count = 20`                                               |           |
| 8.3 | Batch job overall status is `completed_with_errors` (not `failed`)        | Inspect status field                                | Status enum value is `completed_with_errors`; implies partial success path taken                             |           |
| 8.4 | Failed card has `pdf_storage_key = null` and no S3 upload                 | Verify                                              | No PutObject for card #17                                                                                    |           |
| 8.5 | Error surface: `error_message` on batch_job enumerates failed student IDs | Inspect field                                       | Field populated with structured list: `"1 card failed: student_id=<uuid> reason=NO_GRADES_FOUND"`            |           |
| 8.6 | Retry does NOT re-attempt successful cards                                | Re-run job (idempotent retry)                       | Only the 1 failed card is retried; the 19 successful cards are left as-is                                    |           |

---

## 9. `report-cards:generate` — Total Failure

Snapshot service throws a non-retryable error (schema mismatch, corrupt template). Batch should fail atomically.

| #   | Test Name                                                  | Setup                                                                         | Expected                                                                   | Pass/Fail |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| 9.1 | Snapshot service throw → batch marked failed               | Mock `ReportCardSnapshotService.build()` to throw `Error('corrupt template')` | batch_job `status = 'failed'`, `error_message` contains the thrown message |           |
| 9.2 | No `report_cards` rows created on total failure            | Query `report_cards WHERE batch_job_id = ?` after                             | Count = 0 (the transaction did not commit any cards)                       |           |
| 9.3 | Sentry captures the exception with tenant context scrubbed | Spy on Sentry                                                                 | Exception captured; `tenant_id` present as a tag, not raw scope            |           |
| 9.4 | Prometheus `report_cards_failed_total` incremented         | Metrics check                                                                 | Counter +1, labelled with failure class `SNAPSHOT_ERROR`                   |           |
| 9.5 | Batch job has `completed_at` set to failure time           | Inspect                                                                       | Timestamp set so downstream "pending batches" query excludes it            |           |
| 9.6 | Worker does not crash — next job processes normally        | Enqueue a known-good job right after                                          | Second job completes cleanly; no zombie state                              |           |

---

## 10. `report-cards:generate` — Retry Policy

Transient failures should be retried 3 times with exponential backoff; a final failure lands in the DLQ.

| #    | Test Name                                                     | Setup                                                        | Expected                                                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Retry attempts = 3 (BullMQ `attempts: 3`)                     | Inspect queue `defaultJobOptions` or processor-level options | `attempts === 3`                                                                                           |           |
| 10.2 | Backoff is exponential                                        | Inspect `backoff: { type: 'exponential', delay: ? }`         | Type `exponential`; base delay documented (expect 5000ms)                                                  |           |
| 10.3 | Transient DB error retries and eventually succeeds            | Fail attempts 1 & 2 via mock; succeed on attempt 3           | Job final state `completed`; cards created exactly once (no duplication across attempts)                   |           |
| 10.4 | After 3 failures, job lands in DLQ (or BullMQ `failed` state) | Fail every attempt                                           | Job in `failed` state after attempt 3; DLQ strategy triggered if configured; `batch_job.status = 'failed'` |           |
| 10.5 | `attemptsMade` propagates correctly into processor logs       | Inspect structured logs                                      | Each retry log includes `attempt: 1/3`, `2/3`, `3/3`                                                       |           |

---

## 11. `report-cards:generate` — Idempotency

Running the same batch_job twice must not create duplicate cards. The processor must detect prior success and short-circuit.

| #    | Test Name                                                                                   | Setup                                                                 | Expected                                                                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Re-enqueue after successful completion is a no-op                                           | Complete batch; enqueue same job again                                | Processor checks `batch_job.status` — if `completed`, logs `BATCH_JOB_ALREADY_TERMINAL` and returns without creating cards |           |
| 11.2 | Unique constraint `(batch_job_id, student_id)` on `report_cards` enforces dedup at DB layer | Force processor to re-enter without status check                      | Postgres `unique_violation`; processor catches and logs; no duplicate rows                                                 |           |
| 11.3 | Partial-success retry only creates missing cards                                            | After §8, retry; only card #17 (failed) is re-attempted               | Re-run produces 1 new card for student #17 (or updates existing failed row to draft); rest untouched                       |           |
| 11.4 | Re-run does NOT re-upload already-uploaded PDFs                                             | Successful prior upload, retry                                        | S3 PutObject called only for new/retried cards; existing keys not overwritten unnecessarily                                |           |
| 11.5 | Concurrent duplicate enqueues (double-click in UI) dedup at `jobId`                         | Enqueue twice with same `jobId: report-cards:generate:<batch_job_id>` | BullMQ dedups; only one job runs                                                                                           |           |

---

## 12. `report-cards:auto-generate` — Cross-Tenant Cron

Daily cron sweeps every active tenant, drafting report cards for any period that ended within the last 24 hours.

| #    | Test Name                                                                              | Setup                                                                     | Expected                                                                  | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| 12.1 | Cron iterates active tenants and finds eligible periods                                | Tenant A has period ending 18h ago; tenant B has no recently-ended period | Tenant A draft batch created + dispatched; tenant B untouched             |           |
| 12.2 | Iteration uses `listActiveTenants()` from TenantsService                               | Spy                                                                       | Service called once per job invocation                                    |           |
| 12.3 | Per-tenant batch job creates `report_card_batch_jobs` row with `trigger = 'auto_cron'` | Inspect batch_job                                                         | Row exists with distinct trigger value vs. manual batches                 |           |
| 12.4 | Sub-jobs enqueued as `report-cards:generate` with each tenant's `tenant_id`            | Inspect queue contents                                                    | N sub-jobs enqueued where N = number of eligible tenants                  |           |
| 12.5 | Empty sweep (no tenant has ended periods) is a clean no-op                             | All periods end outside the 24h window                                    | Job completes; zero batch_jobs created; log message "no eligible periods" |           |
| 12.6 | Tenant errors do not abort the sweep for other tenants                                 | Tenant A throws mid-iteration; tenant C is pending                        | Error logged + Sentry captured for A; C still processed                   |           |

---

## 13. `report-cards:auto-generate` — Skips Already-Drafted Periods

Idempotency for the cron: if a period already has drafted cards, skip.

| #    | Test Name                                                                                   | Setup                                                       | Expected                                                                      | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| 13.1 | Period with existing drafts is skipped                                                      | Tenant A, period P1, cards already drafted for all students | Cron logs `SKIP_ALREADY_DRAFTED` for P1; no new batch_job created             |           |
| 13.2 | Precondition check uses `EXISTS (SELECT 1 FROM report_cards WHERE academic_period_id = P1)` | Inspect query                                               | Lightweight existence check, not full COUNT                                   |           |
| 13.3 | Partial drafts (some students missing cards) are NOT skipped — processor fills gaps         | 18/20 students have cards for P1                            | New batch_job targets only the 2 missing students                             |           |
| 13.4 | Skip decision is audit-logged                                                               | Check audit_log table                                       | Row with `action: 'CRON_SKIP_ALREADY_DRAFTED'`, `subject_id: P1`, `tenant_id` |           |

---

## 14. `report-cards:auto-generate` — Skips Tenants Without Module Enabled

Report Cards is a toggleable module; cron must respect the gate.

| #    | Test Name                                                                    | Setup                                                       | Expected                                                               | Pass/Fail |
| ---- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| 14.1 | Tenant with `module_enablements.report_cards = false` is skipped             | Tenant B has the flag disabled                              | Cron does not enqueue any job for B; log: `MODULE_DISABLED tenant=<B>` |           |
| 14.2 | Tenant with flag removed entirely (row missing) is skipped with default-deny | No row in `module_enablements` for tenant D                 | Treated as disabled; no job enqueued                                   |           |
| 14.3 | Enabling the flag later allows next cron run to pick up the tenant           | Toggle B's flag to true                                     | On next cron tick, B's eligible periods draft cards                    |           |
| 14.4 | Module-disabled skip is counted in Prometheus                                | `report_cards_cron_skipped_total{reason="module_disabled"}` | Counter +1 per skipped tenant                                          |           |

---

## 15. `report-cards:auto-generate` — RLS Isolation Per Iteration

Each per-tenant iteration must set `SET LOCAL app.current_tenant_id` before any DB write.

| #    | Test Name                                                              | Setup                                                                             | Expected                                                                      | Pass/Fail |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| 15.1 | Each iteration opens a fresh RLS transaction                           | Spy on `createRlsClient().$transaction`                                           | Called once per tenant in the sweep, each with correct `tenant_id`            |           |
| 15.2 | Attempting to write a batch_job with mismatched tenant_id fails        | Inject a mutation attempting `tenant_id = <tenant B>` inside tenant A's iteration | RLS policy rejects with `permission denied` or `row violates policy`; no leak |           |
| 15.3 | `SET LOCAL` is scoped to the transaction — next iteration starts clean | Verify via `current_setting('app.current_tenant_id')` after commit                | Setting is reset/unset post-commit; no stale context bleed                    |           |
| 15.4 | Query reads within iteration only return rows for that tenant          | Select academic_periods inside iteration                                          | Result set excludes other tenants' rows (RLS-enforced, not app-filtered)      |           |

---

## 16. `report-cards:auto-generate` — Cron Deduplication

Two scheduler instances (HA worker deploy) must not produce two concurrent runs.

| #    | Test Name                                                                                                    | Setup                                                     | Expected                                                                  | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| 16.1 | BullMQ `jobId: 'cron:REPORT_CARD_AUTO_GENERATE_JOB'` enforces dedup                                          | Two `CronSchedulerService` instances start simultaneously | Only one job persists in Redis; second enqueue is a no-op                 |           |
| 16.2 | Cron registration uses `OnModuleInit` and registers once per process                                         | Inspect service                                           | Registration idempotent at the cron level too                             |           |
| 16.3 | Retention: `removeOnComplete: 10` honoured                                                                   | Run cron 15 times                                         | Redis keeps only last 10 completed records for this cron job              |           |
| 16.4 | Retention: `removeOnFail: 50` honoured                                                                       | Fail cron 55 times                                        | Redis keeps only last 50 failed records                                   |           |
| 16.5 | If previous cron run is still in flight when next tick hits, second run is held (or skipped based on policy) | Long-running cron                                         | Document actual behaviour: expected to skip with warning (BullMQ default) |           |

---

## 17. `report-cards:auto-generate` — Retention Policy

Confirms BullMQ retention flags stay stable across deploys.

| #    | Test Name                                                                   | Setup                                                | Expected                                                         | Pass/Fail |
| ---- | --------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | --------- |
| 17.1 | `removeOnComplete: 10` is explicitly set in cron registration code          | Grep `CronSchedulerService`                          | Literal value `10` present in registration call                  |           |
| 17.2 | `removeOnFail: 50` is explicitly set                                        | Same                                                 | Literal value `50` present                                       |           |
| 17.3 | Retention applies to both cron jobs and manually-enqueued jobs of same name | Enqueue 15 manual `report-cards:auto-generate` calls | Oldest 5 removed from Redis history                              |           |
| 17.4 | Unchanged retention config survives worker restart                          | Stop + restart worker                                | Values re-applied idempotently (no duplicate cron registrations) |           |

---

## 18. `gradebook:mass-report-card-pdf` — Happy Path

Batch PDF concatenation: given N existing report card IDs, produce a single bundled PDF, upload to S3, and return the URL.

| #    | Test Name                                              | Setup                                       | Expected                                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 18.1 | N=5 cards concatenated into 1 PDF                      | 5 cards each with valid `pdf_storage_key`   | Output PDF contains 5 concatenated documents, preserving order by `report_card_ids` array  |           |
| 18.2 | Output PDF uploaded to S3 with tenant-scoped key       | Inspect uploaded key                        | Pattern: `tenants/<tenant_id>/report-cards/bundles/<period_id>-<timestamp>.pdf`            |           |
| 18.3 | Processor returns `file_url` pointing to signed S3 URL | Inspect return value                        | URL valid, expires in configured window (default 15 min)                                   |           |
| 18.4 | `requested_by_user_id` recorded in audit trail         | Audit log query                             | Row exists with `actor_id = requested_by_user_id`, `action = 'REPORT_CARD_BUNDLE_CREATED'` |           |
| 18.5 | Individual card PDFs are NOT modified                  | Checksum each input card PDF before + after | All checksums identical; concat is read-only on inputs                                     |           |
| 18.6 | Bundle metadata recorded (cards count, total size)     | Inspect bundle record in DB                 | Row in `report_card_bundles` with counts + byte size                                       |           |

---

## 19. `gradebook:mass-report-card-pdf` — Memory Bounds

Large batches must stream, not buffer.

| #    | Test Name                                                            | Setup                                                                    | Expected                                                                                        | Pass/Fail |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------- |
| 19.1 | N=500 cards: heap stays under 512MB peak                             | Seed 500 cards; enqueue job; profile with `--expose-gc` + heap snapshots | Peak heap < 512MB; no OOM                                                                       |           |
| 19.2 | Processor uses streaming PDF concat (pdf-lib with streams, or pdftk) | Inspect implementation                                                   | Streaming API used; no `Buffer.concat` of all PDFs at once                                      |           |
| 19.3 | Maximum N cap documented and enforced                                | Payload with N=2001                                                      | Rejected at enqueue if hard cap present; or throttled if soft cap. Hard cap = **1000** expected |           |
| 19.4 | Throughput: N=100 cards concatenated in under 60s                    | Benchmark                                                                | `duration_ms < 60000`                                                                           |           |
| 19.5 | S3 upload is multipart for bundles >5MB                              | Inspect S3 call                                                          | `CreateMultipartUpload` + `UploadPart` sequence                                                 |           |

---

## 20. `gradebook:mass-report-card-pdf` — Missing Card PDFs

Some cards may not yet have a rendered PDF (e.g., NullWriter was active when drafted). Processor must skip + log.

| #    | Test Name                                                   | Setup                           | Expected                                                                                   | Pass/Fail |
| ---- | ----------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 20.1 | Cards with `pdf_storage_key = null` are skipped             | 5 cards, 2 with null key        | Bundle contains 3 PDFs; log enumerates skipped card_ids                                    |           |
| 20.2 | `error_message` on bundle record enumerates skipped cards   | Inspect bundle row              | Field populated with structured list: `"skipped: [card_id_A, card_id_B] (reason: no_pdf)"` |           |
| 20.3 | If ALL cards are missing PDFs, job fails cleanly            | 5/5 cards with null keys        | `status = 'failed'`, error `NO_PDFS_AVAILABLE`; no empty bundle uploaded                   |           |
| 20.4 | S3 key that 404s (e.g., deleted) is treated same as missing | Mock S3 `NoSuchKey` on one card | Card skipped; bundle excludes it; Sentry notified                                          |           |
| 20.5 | Caller (controller) receives partial-success response       | Inspect return                  | `{ bundle_url, included_count: 3, skipped_count: 2, skipped_card_ids: [...] }`             |           |

---

## 21. `gradebook:batch-pdf` — Happy Path

Controller-enqueued batch render. Similar to `report-cards:generate` but driven by explicit class + template.

| #    | Test Name                                                                       | Setup                                           | Expected                                                    | Pass/Fail |
| ---- | ------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- | --------- |
| 21.1 | Payload routes to `BatchPdfProcessor` via dispatcher                            | Enqueue `gradebook:batch-pdf` with full payload | Dispatcher invokes correct processor                        |           |
| 21.2 | All students in `class_id` for `academic_period_id` rendered with `template_id` | Seed class of 25 students                       | 25 PDFs rendered + uploaded                                 |           |
| 21.3 | `requested_by_user_id` recorded                                                 | Audit trail                                     | Present                                                     |           |
| 21.4 | Processor idempotent on re-enqueue                                              | Same payload twice                              | Second run detects existing render; no duplicate S3 objects |           |
| 21.5 | Render latency within SLO (<3s/card)                                            | Benchmark                                       | Avg per-card < 3000ms                                       |           |

---

## 22. `gradebook:batch-pdf` — Template Missing

Template ID must resolve; missing template is a hard failure.

| #    | Test Name                                                                | Setup                                                | Expected                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| 22.1 | Unknown template_id fails the job                                        | Payload with random UUID                             | `TEMPLATE_NOT_FOUND` error; no renders attempted                           |           |
| 22.2 | Template belonging to another tenant is rejected via RLS                 | Template exists in tenant B, enqueued under tenant A | RLS lookup returns null; same `TEMPLATE_NOT_FOUND` (do not leak existence) |           |
| 22.3 | Archived template is refused with distinct error                         | Template exists, `status = 'archived'`               | `TEMPLATE_ARCHIVED` error; job fails                                       |           |
| 22.4 | Template with invalid Handlebars syntax fails at render with clear error | Corrupt template body                                | Render throws; error message includes template name + line number          |           |

---

## 23. Queue Competitive Consumer — Multiple Jobs in Flight

Workers can process multiple jobs concurrently up to the queue concurrency setting. Tenant context must not leak across concurrent jobs.

| #    | Test Name                                                         | Setup                                | Expected                                                                  | Pass/Fail |
| ---- | ----------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------- | --------- |
| 23.1 | Concurrency cap N is enforced (expect N=5 for gradebook)          | Inspect Worker options               | `concurrency: 5` in BullMQ Worker init                                    |           |
| 23.2 | Jobs for different tenants run concurrently without context leak  | Enqueue 5 jobs across 5 tenants      | Each job sees its own `tenant_id`; queries return only that tenant's rows |           |
| 23.3 | Jobs for same tenant do not conflict on DB locks                  | 5 jobs for tenant A                  | All complete; no deadlocks; `report_card_batch_jobs` rows distinct        |           |
| 23.4 | Slow job does not block faster jobs up to concurrency cap         | One job stalls 30s; 4 others proceed | 4 fast jobs complete; slow job continues independently                    |           |
| 23.5 | Per-job Prisma client is isolated (each gets its own transaction) | Spy on `$transaction` calls          | 5 distinct transactions; no shared client                                 |           |

---

## 24. Queue Priority / FIFO Behaviour

Jobs should process in insertion order within a tenant; no starvation across tenants.

| #    | Test Name                                                         | Setup                                                    | Expected                                                                                                   | Pass/Fail |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| 24.1 | FIFO order preserved per tenant                                   | Enqueue 3 jobs for tenant A in order J1→J2→J3            | Processed in insertion order (assuming concurrency 1 per tenant; or monotonic `addedAt` if concurrency >1) |           |
| 24.2 | No tenant starves another (round-robin friendly)                  | Tenant A floods queue with 100 jobs; tenant B enqueues 1 | Tenant B's job processed within SLO; not buried after all 100 of A's jobs if priority mechanism exists     |           |
| 24.3 | Default priority is uniform (0) — no hidden priority bias         | Inspect enqueue opts                                     | `priority` not set; all jobs equal                                                                         |           |
| 24.4 | Cron-triggered jobs do NOT get elevated priority over manual ones | Enqueue cron-driven + manual interleaved                 | Order by `addedAt`, no cron preference                                                                     |           |
| 24.5 | Document any priority override cases (e.g., admin "rush" bundle)  | Inspect code                                             | Expect: no such override today — flag in §34 if added without testing                                      |           |

---

## 25. Dead Letter Queue — DLQ Rot & Replay

Jobs exceeding max attempts go to a failed state; DLQ replay must be idempotent.

| #    | Test Name                                                                      | Setup                                            | Expected                                                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------- |
| 25.1 | Job failing all 3 attempts ends in BullMQ `failed` state                       | Force repeated failure                           | Visible via `queue.getFailed()`; `finishedOn` set; `failedReason` populated                                |           |
| 25.2 | DLQ replay via admin tool re-enqueues same payload                             | Call replay API on failed job                    | Job resurrected in `waiting`; `attemptsMade` reset                                                         |           |
| 25.3 | Replay does not create duplicate `report_cards` rows                           | Original failure was after partial card creation | Unique constraint + processor idempotency check prevent dupes                                              |           |
| 25.4 | Replay preserves original `batch_job_id` — it is a retry of same logical batch | Inspect                                          | `batch_job_id` matches original                                                                            |           |
| 25.5 | Permanent failures (e.g., `TEMPLATE_NOT_FOUND`) should NOT auto-retry          | Fail with non-retryable error class              | After 1 attempt, job marked failed + flagged `non_retryable: true` (if implemented; flag in §34 otherwise) |           |
| 25.6 | Old failed jobs cleaned after retention                                        | 51st failure                                     | Oldest failure evicted per `removeOnFail: 50`                                                              |           |

---

## 26. Worker Restart Mid-Job

If the worker process is killed during processing, BullMQ's stalled-job detection re-queues the job. Processor must handle partial state.

| #    | Test Name                                                                        | Setup                                                  | Expected                                                                                                                                    | Pass/Fail |
| ---- | -------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 26.1 | SIGKILL mid-processing triggers stalled-job recovery                             | Start job; kill worker at 50% progress; restart worker | Job transitions to `waiting` after stalled check interval; re-processed                                                                     |           |
| 26.2 | Re-processed job uses idempotency check to avoid duplicate card rows             | 10 cards created before crash; restart                 | On retry, processor either (a) detects batch_job status and resumes from last student_id, OR (b) relies on unique constraint to avoid dupes |           |
| 26.3 | `report_card_batch_jobs.completed_count` remains accurate after crash + recovery | Count before crash + after recovery                    | Final `completed_count = total_count`; not double-counted                                                                                   |           |
| 26.4 | S3 uploads are idempotent — re-uploading same key is safe                        | Re-process card whose PDF was already uploaded         | PutObject with same key overwrites cleanly; no ghost files                                                                                  |           |
| 26.5 | Worker restart with no in-flight jobs is a clean no-op                           | Restart idle worker                                    | No replay; queue state unchanged                                                                                                            |           |

---

## 27. Tenant Context Leakage — Critical

The single most important worker test. Two back-to-back jobs for different tenants must NEVER see each other's data.

| #    | Test Name                                                                                              | Setup                                                 | Expected                                                                                                 | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| 27.1 | Tenant A job → Tenant B job (sequential): B does not see A's data                                      | Enqueue job for A, wait for completion, enqueue for B | B's queries return only B's rows; A's batch_job invisible to B's RLS                                     |           |
| 27.2 | `SET LOCAL app.current_tenant_id` reset or superseded between transactions                             | Inspect Prisma session for connection reuse           | Each job opens new transaction; `SET LOCAL` scope expires at commit; no bleed                            |           |
| 27.3 | If Pgbouncer is in transaction mode, connection affinity does NOT leak tenant context                  | Run against Pgbouncer                                 | No leak; `SET LOCAL` tied to transaction, not connection                                                 |           |
| 27.4 | Concurrent jobs for tenants A, B, C each see only their own data                                       | Spin up 3 parallel jobs                               | Each processor's queries return tenant-scoped rows only                                                  |           |
| 27.5 | If a processor forgets to open `createRlsClient` transaction, it should FAIL (not silently bypass RLS) | Intentionally break processor                         | Expect: `current_setting('app.current_tenant_id') IS NULL` → RLS denies → query returns 0 rows or throws |           |
| 27.6 | Auto-generate cron: iteration N+1 cannot see iteration N's tenant rows                                 | Spy on queries across iterations                      | Each `createRlsClient(tenantId)` transaction is scoped; no cross-contamination                           |           |

---

## 28. PDF Render Timeout — Puppeteer Hangs

Headless chromium can hang on malformed HTML, network-bound assets, or infinite animations. Must fail gracefully.

| #    | Test Name                                            | Setup                                       | Expected                                                          | Pass/Fail |
| ---- | ---------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 28.1 | Render timeout set at 30s                            | Inspect renderer config                     | `timeout: 30000` in Puppeteer page config                         |           |
| 28.2 | Hanging render fails the card with `RENDER_TIMEOUT`  | Template with `<script>while(1){}</script>` | After 30s, card fails; batch_job continues with other cards       |           |
| 28.3 | Puppeteer process is cleaned up — no zombie chromium | Inspect process list after timeout          | No orphaned chromium PIDs                                         |           |
| 28.4 | Timeout does NOT crash the worker                    | Worker still processes next job             | Next job dequeued successfully                                    |           |
| 28.5 | Render timeout count surfaced to Prometheus          | Metric `report_card_render_timeout_total`   | Incremented on each timeout                                       |           |
| 28.6 | Concurrent renders do not exhaust Chromium pool      | 5 renders simultaneous                      | All complete or timeout cleanly; no "browser disconnected" errors |           |

---

## 29. S3 Upload Failure — Network Error

Transient S3 errors should retry; permanent ones should fail loudly.

| #    | Test Name                                                                                   | Setup                           | Expected                                                                  | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------- | --------- |
| 29.1 | Transient 500/503 from S3 retries 3x with exponential backoff                               | Mock S3 to fail 2x then succeed | Upload succeeds on attempt 3; card status reaches `draft`                 |           |
| 29.2 | Permanent 403 (bad creds) fails immediately — no retry                                      | Mock 403                        | Job fails; `error_message = 'S3_ACCESS_DENIED'`                           |           |
| 29.3 | Final S3 failure after retries sets card `status = 'failed'` with reason `S3_UPLOAD_FAILED` | Force all retries to fail       | Card in failed state; `pdf_storage_key = null`; `error_message` populated |           |
| 29.4 | Card remains recoverable — can be retried via manual trigger                                | After 29.3, retry               | Next attempt succeeds if S3 healthy                                       |           |
| 29.5 | Network timeout (no HTTP response) treated as transient                                     | Simulate network blackhole      | Retried per backoff; eventually fails with `S3_TIMEOUT`                   |           |
| 29.6 | S3 failure telemetry: Prometheus counter + Sentry event                                     | Spy                             | Both fired                                                                |           |

---

## 30. S3 Upload Idempotency

Retrying a previously-uploaded key must be safe.

| #    | Test Name                                                             | Setup                        | Expected                                                             | Pass/Fail |
| ---- | --------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- | --------- |
| 30.1 | Same `pdf_storage_key` overwritten cleanly on retry                   | Upload twice                 | Second PutObject succeeds; object body replaced; no duplicate object |           |
| 30.2 | Versioning-enabled bucket retains prior version but uses latest       | If bucket versioning on      | Previous version retrievable but `GetObject` returns latest          |           |
| 30.3 | ETag changes on overwrite — downstream consumers detect change        | Inspect ETag before+after    | Different ETag                                                       |           |
| 30.4 | No S3 delete is issued on retry (delete-then-put antipattern avoided) | Spy on DeleteObject          | Never called                                                         |           |
| 30.5 | Signed URL previously issued still works post-overwrite (until TTL)   | Pre-sign URL, then overwrite | URL serves new content until expiry                                  |           |

---

## 31. AI Draft Job

Current inventory does not include a dedicated AI draft background job for Report Cards. Teacher AI-comment drafting is handled synchronously in the `/v1/report-cards/ai-draft` controller endpoint (OpenAI call inline, no queue). Documented here for completeness.

| #    | Test Name                                                                                             | Setup                                  | Expected                                                                          | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| 31.1 | Confirm no `report-cards:ai-draft` job registered                                                     | Inspect `QUEUE_NAMES` + processor list | No such job name — spec gap flagged in §34 (synchronous AI is blocking and risky) |           |
| 31.2 | If/when an async AI draft job is added, payload must carry `tenant_id` + `report_card_id` + `user_id` | N/A currently                          | Deferred until the job exists                                                     |           |
| 31.3 | Synchronous AI call failures do NOT crash request pipeline today                                      | Invoke endpoint with OpenAI down       | Controller returns 503 gracefully; covered in integration spec, not worker spec   |           |

---

## 32. Delivery Job (email/SMS/WhatsApp)

Report card publication triggers parent notification via the shared `notifications` queue (separate module). Documented here as a cross-module reference.

| #    | Test Name                                                                                                                               | Setup                             | Expected                                                                    | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- | --------- |
| 32.1 | Publishing a report card enqueues `notifications:dispatch` to `notifications` queue                                                     | Publish card via service          | One enqueue per recipient (parent guardians + student) with `channel` set   |           |
| 32.2 | Notification payload includes `tenant_id`, `recipient_user_id`, `template_key = 'report_card_published'`, `subject_id = report_card_id` | Inspect payload                   | All fields present                                                          |           |
| 32.3 | Notification processor lives in `apps/worker/src/modules/notifications/` — not in gradebook module                                      | Confirm                           | Separation of concerns held                                                 |           |
| 32.4 | Delivery failure does NOT revert card publication (loose coupling)                                                                      | Mock SMTP failure                 | Card remains `published`; notification moves to failed; retry independently |           |
| 32.5 | Opt-out preferences are honoured — disabled channels skipped                                                                            | Parent has `email_opt_out = true` | Email not enqueued; WhatsApp still enqueued if enabled                      |           |
| 32.6 | Full delivery test set lives in notifications module spec — not duplicated here                                                         | Cross-reference                   | This spec only asserts enqueue happens                                      |           |

---

## 33. Monitoring Hooks — Prometheus, Sentry, Structured Logs

Every processor must emit telemetry on start / complete / fail.

| #    | Test Name                                                                                           | Setup                       | Expected                                                                     | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------- | --------- |
| 33.1 | Job start emits `report_card_job_started_total` counter + log line                                  | Enqueue any report-card job | Counter +1 with labels `{job_name, tenant_hash}`; log with structured fields |           |
| 33.2 | Job complete emits `report_card_job_completed_total` + `report_card_job_duration_seconds` histogram | Job finishes                | Both metrics recorded                                                        |           |
| 33.3 | Job fail emits `report_card_job_failed_total{reason}` + Sentry capture                              | Force failure               | Counter + Sentry fired; Sentry scope includes `job_name`, `attempt`          |           |
| 33.4 | Structured log includes `job_name`, `job_id`, `tenant_id`, `duration_ms`, `attempt`                 | Inspect logs                | All fields present in every lifecycle log entry                              |           |
| 33.5 | Logs use the shared `@nestjs/common` Logger with class-name scope                                   | Grep                        | `new Logger(ClassName.name)` pattern                                         |           |
| 33.6 | No PII in logs (student names, grades) — only IDs                                                   | Audit log output            | Only UUIDs and counters; no free-text content                                |           |
| 33.7 | Worker exposes `/metrics` endpoint for Prometheus scrape                                            | Inspect                     | Endpoint on configured port (expect 9464) returns metrics                    |           |

---

## 34. Observations & Gaps Flagged

Behaviour that is ambiguous, risky, or missing based on current code review. Each item needs a product/engineering decision before shipping at scale.

| #     | Observation                                                                                                                                                                                                                                           | Severity | Recommended action                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 34.1  | **Default storage writer is `NullReportCardStorageWriter`.** Without explicit S3 wiring, PDFs are NOT saved — cards end up with `pdf_storage_key = null` but batch_job status = `completed`. This is silent data loss from an operator's perspective. | HIGH     | Require explicit `REPORT_CARD_STORAGE_WRITER_TOKEN` binding to S3 in production startup; fail loud if NullWriter active in non-test env.  |
| 34.2  | **`report-cards:auto-generate` cron has no per-tenant circuit breaker.** A misconfigured tenant (bad template, corrupt grades) can fail loudly on every cron run indefinitely; there is no backoff or auto-disable.                                   | MEDIUM   | Add a `consecutive_cron_failures` counter per tenant; disable auto-draft for that tenant after N=5 consecutive failures and alert admins. |
| 34.3  | **No dedicated AI draft worker job.** AI comment drafting is currently synchronous in the controller, which blocks the request thread and offers no retry/backoff on OpenAI transient errors.                                                         | MEDIUM   | Introduce `report-cards:ai-draft` async job with its own queue/processor; return a task handle to the UI.                                 |
| 34.4  | **Hard cap on `gradebook:mass-report-card-pdf` N is unconfirmed.** Spec assumes 1000; if no hard cap is enforced, a 10k-card bundle could OOM the worker.                                                                                             | MEDIUM   | Enforce `z.array().max(1000)` in the Zod schema for the enqueue payload.                                                                  |
| 34.5  | **Idempotency key for `report-cards:generate` relies on batch_job status check + DB unique constraint.** If either drifts (e.g., someone adds `ON CONFLICT DO NOTHING` loosely), duplicates could slip in.                                            | MEDIUM   | Add explicit `(batch_job_id, student_id)` unique index assertion in migration spec; add a test that explicitly forces duplicate attempt.  |
| 34.6  | **Cross-tenant cron iteration order is undocumented.** If iteration is sequential and tenant A has 10k students, tenant Z's cards are drafted hours late.                                                                                             | LOW      | Document iteration order; consider fan-out (enqueue per-tenant child jobs instead of inline iteration).                                   |
| 34.7  | **DLQ replay tooling is not confirmed in code.** §25.2 assumes an admin replay endpoint exists; if not, operators have no clean path to recover permanent failures.                                                                                   | MEDIUM   | Confirm + document DLQ replay endpoint, or add one.                                                                                       |
| 34.8  | **Puppeteer/Chromium resource limits are not enforced.** §28 tests require `timeout: 30000` to be set; verify in code. Concurrent renders may exhaust chromium pool under load.                                                                       | MEDIUM   | Verify render timeout is set; add a chromium pool with explicit max size.                                                                 |
| 34.9  | **No test explicitly verifies RLS reset across sequential jobs on the same Prisma connection (Pgbouncer transaction mode).** This is the #1 data-leak risk in multi-tenant worker design.                                                             | HIGH     | Add §27.1–27.3 as MANDATORY green-before-release tests.                                                                                   |
| 34.10 | **Notifications fan-out from report card publish may double-fire on batch publish.** If 50 cards are published in a batch, that's 50 × ~4 recipients = 200 notifications — consider rate limits and digest mode.                                      | LOW      | Add batch-aware digest option in notifications module; outside this spec's scope.                                                         |
| 34.11 | **`report-cards:auto-generate` empty-payload `{}` means any attacker who can enqueue to `gradebook` queue could trigger cross-tenant iteration.** Ensure the queue is only reachable internally (Redis ACL or network isolation).                     | HIGH     | Verify Redis ACL; document threat model.                                                                                                  |
| 34.12 | **No explicit test for `module_enablements` being nullable vs default-false.** §14.2 assumes default-deny; confirm in schema.                                                                                                                         | LOW      | Add DB-level default `false` on `module_enablements.report_cards` column.                                                                 |

---

## 35. Sign-Off

This specification is considered complete when:

- [ ] All sections §3–§33 have every row executed with Pass/Fail recorded
- [ ] Every HIGH-severity item in §34 has a resolution (either fixed in code or accepted with written tradeoff in `docs/governance/governance-policy.md`)
- [ ] Every MEDIUM-severity item has an entry in `docs/governance/recovery-backlog.md` with owner + due date
- [ ] Worker spec integrated into `E2E/3_learning/ReportCards/integration/*` suite orchestration
- [ ] CI wires up the worker test job against both Redis + Postgres in the integration lane
- [ ] Post-execution coverage ratchet applied to `apps/worker/jest.config.js` per CLAUDE.md

| Role                             | Name | Date | Signature |
| -------------------------------- | ---- | ---- | --------- |
| Author (QA Lead)                 |      |      |           |
| Engineering Reviewer             |      |      |           |
| Platform Reviewer (RLS + worker) |      |      |           |
| Product Reviewer (Learning)      |      |      |           |

---

**End of Report Cards Worker Test Specification.**
