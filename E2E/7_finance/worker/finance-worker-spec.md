# Finance Module — Worker / Background-Job Test Specification

**Scope:** BullMQ queue `finance` + processors + cron schedules + async side-effect chains.
**Surface summary (from code survey):** Only **2 processors exist** for the `finance` queue: `invoice-approval-callback` and `overdue-detection`. **No cron schedules** are currently registered for finance. Reminders / late fees / recurring invoices are **synchronous** in the services layer — they require an external trigger, no worker participation.
**Target harness:** Jest + ioredis-mock + @nestjs/bullmq test-utilities. Each row is a machine-executable test case.
**Last updated:** 2026-04-12
**Baseline commit:** `384ba761`

---

## Table of Contents

1. [Prerequisites & Fixture Seeding](#1-prerequisites--fixture-seeding)
2. [Queue Inventory](#2-queue-inventory)
3. [Job: `finance:on-approval` (invoice-approval-callback)](#3-job-financeon-approval-invoice-approval-callback)
4. [Job: `finance:overdue-detection`](#4-job-financeoverdue-detection)
5. [Cron Schedule Matrix](#5-cron-schedule-matrix)
6. [Async Side-Effect Chains](#6-async-side-effect-chains)
7. [Idempotency Suite](#7-idempotency-suite)
8. [Failure Isolation](#8-failure-isolation)
9. [Observability Assertions](#9-observability-assertions)
10. [Observations & Gaps](#10-observations--gaps)
11. [Sign-Off](#11-sign-off)

---

## 1. Prerequisites & Fixture Seeding

### Redis

- Test Redis instance on port 6379 (CI) or 5554 (integration CI). No data persistence needed.
- `ioredis-mock` for unit-level processor tests; real Redis + BullMQ for end-to-end chain tests.
- Clear all keys before each suite: `FLUSHDB` on the test DB.

### Tenants

Same two-tenant fixture as `/e2e-integration`:

- Tenant A with 20 invoices across all statuses. Specifically: 5 invoices `issued` past due with `last_overdue_notified_at = NULL` (overdue-detection candidates). 3 invoices `draft` with pending `approval_request` rows of action_type=`invoice_issue`.
- Tenant B with 50 invoices; 10 overdue-eligible.

### Fake timers

Use `@sinonjs/fake-timers` (or Jest fake timers) for time-sensitive cron tests. Real cron is not registered, so tests mainly exercise manual enqueue → process.

### Worker process

- Spawn the worker via `Test.createTestingModule({ imports: [WorkerModule] }).compile()` in integration mode.
- Worker reads `@Inject('PRISMA_CLIENT')` — a raw PrismaClient, NOT the NestJS PrismaService.

---

## 2. Queue Inventory

### `QUEUE_NAMES.FINANCE` (queue name: `finance`)

| #   | What to Check                                                             | Expected                                                                                                                                                                                              | Pass/Fail |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Queue declared in constants file                                          | `apps/worker/src/base/queue.constants.ts` exports `QUEUE_NAMES.FINANCE = 'finance'`.                                                                                                                  |           |
| 2.2 | Canary SLA                                                                | `CANARY_CRITICAL_QUEUES[QUEUE_NAMES.FINANCE] = 5 * 60_000` (5-minute SLA).                                                                                                                            |           |
| 2.3 | Registered processors                                                     | `InvoiceApprovalCallbackProcessor` and `OverdueDetectionProcessor` both use `@Processor(QUEUE_NAMES.FINANCE, ...)`.                                                                                   |           |
| 2.4 | Processor config — `invoice-approval-callback`                            | `lockDuration: 30_000`, `stalledInterval: 60_000`, `maxStalledCount: 2`.                                                                                                                              |           |
| 2.5 | Processor config — `overdue-detection`                                    | `lockDuration: 60_000`, `stalledInterval: 60_000`, `maxStalledCount: 2`.                                                                                                                              |           |
| 2.6 | No finance jobs in other queues                                           | `grep -r "QUEUE_NAMES.FINANCE" apps/api/src/modules/finance` — returns no `@InjectQueue` usage. Confirms finance services don't enqueue other-queue jobs.                                             |           |
| 2.7 | Finance queue is the ONLY queue writing to finance tables from background | No other queue's processor (admissions, engagement, communications, etc.) mutates invoices/payments/refunds directly. (Engagement's `generate-invoices.processor.ts` calls InvoicesService — verify.) |           |

---

## 3. Job: `finance:on-approval` (invoice-approval-callback)

**File:** `apps/worker/src/processors/finance/invoice-approval-callback.processor.ts`
**Constant:** `INVOICE_APPROVAL_CALLBACK_JOB = 'finance:on-approval'`
**Payload shape:** `{ tenant_id, approval_request_id, target_entity_id, approver_user_id }` — extends `TenantJobPayload` + uses `TenantAwareJob`.

### Tenant-aware payload check

| #   | What to run                                 | Expected                                                                                                                                 | Pass/Fail |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Enqueue with valid `tenant_id`              | Processor sets `app.current_tenant_id = tenant_id` via `SELECT set_config('app.current_tenant_id', ..., true)` in the transaction start. |           |
| 3.2 | Enqueue without `tenant_id`                 | `TenantAwareJob.execute` throws `MISSING_TENANT_ID`. Job ends `failed`.                                                                  |           |
| 3.3 | Enqueue with malformed tenant_id (non-UUID) | Throws validation error; job ends `failed`.                                                                                              |           |
| 3.4 | Enqueue with non-existent tenant_id         | Processor runs, sets RLS context, but `invoice.findFirst` returns null → self-heal warn, no mutation. Job ends `completed`.              |           |
| 3.5 | DB writes have correct tenant_id            | After processing: `SELECT tenant_id FROM invoices WHERE id=target_entity_id` = enqueued tenant_id. Same for `approval_requests`.         |           |

### Happy path

| #    | What to run                                   | Expected                                                                                                                                                                                      | Pass/Fail |
| ---- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.6  | Enqueue with draft invoice + pending approval | Processor completes. `SELECT status, issue_date FROM invoices WHERE id=?` returns `status='issued'`, `issue_date=<now>`. `approval_requests.status='executed'`, `callback_status='executed'`. |           |
| 3.7  | Job completion state                          | `job.status='completed'`, `attemptsMade=1`.                                                                                                                                                   |           |
| 3.8  | Return value                                  | Processor returns void / nothing of significance.                                                                                                                                             |           |
| 3.9  | Log line on success                           | `Invoice <invoice_number> (<id>) issued via approval, tenant <tenant_id>` emitted via `Logger.log`.                                                                                           |           |
| 3.10 | Audit trail                                   | `audit_logs` has a row with `entity_type='invoice'`, `action='issue'`, `actor_id=approver_user_id`.                                                                                           |           |

### Self-heal scenarios

| #    | What to run                                                 | Expected                                                                                                                                     | Pass/Fail |
| ---- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.11 | Invoice already `issued` (another path beat the worker)     | Processor sees status != `pending_approval`, logs warn, ends `completed` without mutating. Idempotent.                                       |           |
| 3.12 | Invoice not found (hard-deleted)                            | Logs warn; completes without throwing. (The approval_request may still be marked executed via a separate branch — verify product behaviour.) |           |
| 3.13 | Approval request already `executed`                         | Processor no-ops the approval_request update. Completes.                                                                                     |           |
| 3.14 | Invoice status `cancelled` (shouldn't happen but test edge) | Logs warn; does NOT transition. Completes.                                                                                                   |           |

### Retry + dead-letter

| #    | What to run                                              | Expected                                                                                                                                                                                   | Pass/Fail |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.15 | Mock `invoice.update` to throw DB error on first attempt | Job retries per BullMQ defaults (no explicit attempts config on the add() — so uses default = 0 or 1). Verify it retries or fails. **Observation:** no explicit retry policy, flag in §10. |           |
| 3.16 | Mock `invoice.update` to always throw                    | Job ends `failed` after attempts exhausted. Error surfaces in BullMQ dashboard.                                                                                                            |           |
| 3.17 | Retry idempotency                                        | On retry after partial failure, second attempt sees `approval_request.callback_status='failed'` from first attempt → safely re-runs without duplicating work.                              |           |
| 3.18 | Stalled job recovery                                     | Kill the worker mid-process; wait > `stalledInterval`. Another worker picks it up. `maxStalledCount=2` — fails after 2 stalls.                                                             |           |

### Triggered from

| #    | What to run                                                                                  | Expected                                                                                                                 | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.19 | `ApprovalRequestsService.approve()` for action_type='invoice_issue' enqueues exactly one job | Verify via the `financeQueue.add` mock in `/e2e-integration` or integration-test harness.                                |           |
| 3.20 | Enqueue failure is recorded                                                                  | If `financeQueue.add` throws, `approval_requests.callback_status='failed'`, callback_error stored.                       |           |
| 3.21 | Payload matches enqueue site                                                                 | Payload from enqueue site: `{ tenant_id, approval_request_id, target_entity_id, approver_user_id }` — all four required. |           |

---

## 4. Job: `finance:overdue-detection`

**File:** `apps/worker/src/processors/finance/overdue-detection.processor.ts`
**Payload shape:** `{ tenant_id, as_of_date? }` — extends `TenantJobPayload` + uses `TenantAwareJob`.

### Tenant-aware payload check

| #   | What to run                                             | Expected                                                                                                | Pass/Fail |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | Enqueue with valid `tenant_id`                          | Processor sets RLS context. All `findMany`/`updateMany` operations carry tenant_id in the WHERE clause. |           |
| 4.2 | Enqueue without `tenant_id`                             | Throws `MISSING_TENANT_ID`. Job fails.                                                                  |           |
| 4.3 | Enqueue with `tenant_id` that has zero overdue invoices | `SELECT ... COUNT(*)` returns 0 → logs "Found 0 overdue invoices"; job completes.                       |           |

### Happy path

| #   | What to run                                       | Expected                                                                                                                                                                  | Pass/Fail |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.4 | Enqueue for Tenant A (5 overdue invoices fixture) | `invoice.updateMany` sets `status='overdue'`, `last_overdue_notified_at=<now>` for all 5. `installment.updateMany` transitions pending→overdue for past-due installments. |           |
| 4.5 | `as_of_date` omitted                              | Defaults to `now` (or `new Date()`).                                                                                                                                      |           |
| 4.6 | `as_of_date` specified (e.g., `'2026-05-01'`)     | Uses that cutoff. Invoices with `due_date < '2026-05-01'` transition.                                                                                                     |           |
| 4.7 | Logs                                              | `Found <n> overdue invoices for tenant <tenant_id>`; `Marked invoice <invoice_number> as overdue (was <status>)`; `Marked <n> installments as overdue for tenant ...`.    |           |
| 4.8 | Audit entries                                     | Each transitioned invoice has an `audit_logs` entry with action `status_change` or similar — confirm.                                                                     |           |

### Invoice exclusions

| #    | What to run                                           | Expected                                                            | Pass/Fail |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| 4.9  | Invoice with `status='draft'` past due                | NOT transitioned — only `issued` / `partially_paid` are candidates. |           |
| 4.10 | Invoice with `last_overdue_notified_at` already set   | NOT re-processed — the WHERE clause excludes already-notified.      |           |
| 4.11 | Invoice `status='paid'`                               | NOT transitioned.                                                   |           |
| 4.12 | Invoice `status='cancelled'` / `void` / `written_off` | NOT transitioned.                                                   |           |

### Idempotency

| #    | What to run                             | Expected                                                                                        | Pass/Fail |
| ---- | --------------------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| 4.13 | Run twice consecutively for same tenant | Second run processes 0 invoices (all already have `last_overdue_notified_at` set by first run). |           |
| 4.14 | Run with same `as_of_date` twice        | Same invoice set (empty on second run).                                                         |           |

### Retry + dead-letter

| #    | What to run                                | Expected                                                                            | Pass/Fail |
| ---- | ------------------------------------------ | ----------------------------------------------------------------------------------- | --------- |
| 4.15 | Mock `invoice.findMany` to throw once      | Per BullMQ default retry policy. (Observation: no explicit attempts config — flag.) |           |
| 4.16 | Mock `invoice.updateMany` to throw partway | Transaction rolls back; no partial state. Retried.                                  |           |
| 4.17 | Persistent failure                         | Job ends `failed`; operator can inspect via BullMQ dashboard.                       |           |
| 4.18 | Stalled recovery                           | Same as §3.18 with `lockDuration=60_000`.                                           |           |

### Failure isolation across tenants

| #    | What to run                                                                         | Expected                                                                                  | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| 4.19 | Enqueue jobs for Tenant A (succeeds) + Tenant B (with malformed data causing throw) | Tenant A job completes. Tenant B job fails independently. Queue continues processing.     |           |
| 4.20 | Enqueue 10 tenants, 3 fail                                                          | 7 succeed, 3 fail. Failed ones go to dead-letter / `status='failed'`. No impact on the 7. |           |

---

## 5. Cron Schedule Matrix

**Status:** **NO CRON SCHEDULES CURRENTLY REGISTERED FOR FINANCE.** (Per worker survey.) This section documents the EXPECTED crons if/when product wires them up, and tests to verify the existing behaviour (manual trigger only).

### Missing crons (coverage gaps)

| #   | Job that SHOULD be scheduled     | Expected schedule                                                                 | Current state                                                                                         | Pass/Fail       |
| --- | -------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------- |
| 5.1 | `finance:overdue-detection`      | Daily at 00:05 UTC; per-tenant (iterate all tenants, enqueue per-tenant payload). | Not scheduled. Must be triggered manually via admin API or external cron.                             | Fail (document) |
| 5.2 | Payment reminders — due-soon     | Daily at 08:00 tenant timezone (or 08:00 UTC).                                    | Not scheduled. `PaymentRemindersService.sendDueSoonReminders` is synchronous; needs external trigger. | Fail (document) |
| 5.3 | Payment reminders — overdue      | Daily.                                                                            | Not scheduled.                                                                                        | Fail (document) |
| 5.4 | Payment reminders — final-notice | Daily.                                                                            | Not scheduled.                                                                                        | Fail (document) |
| 5.5 | Late-fee auto-application        | Daily (apply configured late fees after grace period).                            | Not scheduled. `LateFeesService.applyLateFee` is synchronous per-invoice.                             | Fail (document) |
| 5.6 | Recurring invoice generation     | Daily.                                                                            | Not scheduled. `RecurringInvoicesService.generateDueInvoices` synchronous.                            | Fail (document) |
| 5.7 | Scholarship auto-expiration      | Daily (transition `active → expired` where `renewal_date < today`).               | Not scheduled. No service method exists yet either — feature gap.                                     | Fail (document) |

### Existing behaviour

| #    | What to run                                                                  | Expected                                                                                                                                             | Pass/Fail |
| ---- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.8  | `grep "CronSchedulerService" apps/worker/src`                                | File exists. `grep "finance:" <cron-scheduler>.ts` returns 0 matches.                                                                                |           |
| 5.9  | Trigger overdue-detection manually via admin endpoint (if exists) or job-add | Fixture confirms the processor runs correctly. Schedule gap remains.                                                                                 |           |
| 5.10 | Document expected schedule JSON                                              | When crons ARE added, each should follow: `jobId: 'cron:finance:overdue-detection'`, `removeOnComplete: 10`, `removeOnFail: 50`, per-tenant payload. |           |

### Cron registration template (for when crons are added)

For each future cron, tests will verify:

| Property             | Expected Value / Pattern                                           |
| -------------------- | ------------------------------------------------------------------ |
| jobId                | `cron:<JOB_CONSTANT>` for BullMQ deduplication                     |
| removeOnComplete     | 10                                                                 |
| removeOnFail         | 50                                                                 |
| Cross-tenant mode    | Empty payload; processor iterates `SELECT id FROM tenants`         |
| Per-tenant mode      | Payload includes `tenant_id`; one job per tenant per tick          |
| Dedup under stampede | Enqueuing same jobId twice results in one job (BullMQ idempotency) |
| Failure isolation    | One tenant's failure doesn't block other tenants                   |

---

## 6. Async Side-Effect Chains

Finance has minimal chains. Only the approval flow is multi-step.

### Chain 1: Admin issues invoice with approval → approved → invoice becomes `issued`

| #   | What to run                                                                                               | Expected                                                                                                                                                                               | Pass/Fail |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | POST `/v1/finance/invoices/:id/issue` on draft invoice (tenant has `requireApprovalForInvoiceIssue=true`) | 200. Invoice status → `pending_approval`. approval_request created. No job enqueued yet.                                                                                               |           |
| 6.2 | Approver POST `/v1/approvals/requests/:id/approve`                                                        | 200. approval_request transitions to `approved`. Callback enqueued onto `finance` queue with `{ tenant_id, approval_request_id, target_entity_id, approver_user_id }`.                 |           |
| 6.3 | Wait for worker drain                                                                                     | `finance:on-approval` job completes. Invoice status transitions `pending_approval → issued`, `issue_date=now`. approval_request.callback_status=`executed`.                            |           |
| 6.4 | Full chain wall-clock                                                                                     | End-to-end latency < 30s under normal load. Document via perf spec.                                                                                                                    |           |
| 6.5 | Ordering                                                                                                  | Callback job does NOT run until the approve endpoint's transaction commits (otherwise the job would see `pending` status). Verify by making approve slow and asserting callback waits. |           |

### Chain 2: Stripe webhook `checkout.session.completed` → payment posted → receipt created

This chain is **synchronous within the webhook handler** per code survey — no job enqueued. Tested in `/e2e-integration` §5.

| #   | What to run                   | Expected                                                                                                     | Pass/Fail |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| 6.6 | Receive webhook               | Webhook handler performs: create payment + allocate to invoice + create receipt — all in one DB transaction. |           |
| 6.7 | No finance queue job enqueued | Inspect `finance` queue — no job added.                                                                      |           |
| 6.8 | Audit logs for each entity    | Verify DB transaction wrote audit entries for payment, allocation, receipt creation.                         |           |

### Chain 3: Engagement generate-invoices → finance

Engagement module's `generate-invoices.processor.ts` calls `InvoicesService.create` directly (not via the `finance` queue).

| #    | What to run                                    | Expected                                                                                                                              | Pass/Fail |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.9  | Trigger engagement event with payment required | Engagement processor creates invoices via `InvoicesService`. No `finance` queue job enqueued. Invoice created with correct tenant_id. |           |
| 6.10 | Engagement failure                             | Does NOT pollute `finance` queue. Finance remains functional.                                                                         |           |

### Chain 4 (MISSING): Late fee accrual chain

**Not implemented as a chain.** Flag in observations.

| #    | What should happen                                                                          | Current state                                                                              | Pass/Fail  |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------- |
| 6.11 | Overdue-detection → enqueue apply-late-fee job per eligible invoice → notification dispatch | Overdue-detection updates status only. No late-fee job enqueued. No notification dispatch. | Fail (gap) |

---

## 7. Idempotency Suite

| #   | What to run                                                                      | Expected                                                                                                       | Pass/Fail |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Enqueue `finance:on-approval` twice with identical payload                       | Second run sees invoice `issued` already; logs warn and completes. No duplicate approval_request update.       |           |
| 7.2 | Enqueue `finance:overdue-detection` twice for same tenant within the same second | Both run. Second sees zero eligible invoices. Idempotent.                                                      |           |
| 7.3 | Kill worker mid-tx for `on-approval`                                             | Process restarts after stalled-job recovery. Final state: invoice issued once, approval_request executed once. |           |
| 7.4 | Kill worker mid-tx for `overdue-detection`                                       | Post-recovery, the `invoice.updateMany` completes or is retried. Final invoice count = expected.               |           |

---

## 8. Failure Isolation

| #   | What to run                                                                         | Expected                                                                                                               | Pass/Fail |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Submit 10 `on-approval` jobs; 3 with invalid `approval_request_id`                  | 7 succeed; 3 fail gracefully (approval_request not found → warn + complete OR fail and dead-letter — product decides). |           |
| 8.2 | Submit 10 `overdue-detection` jobs for 10 tenants; 3 tenants have schema mismatches | 7 process correctly; 3 fail. Failures don't block the 7.                                                               |           |
| 8.3 | Worker OOM mid-process                                                              | BullMQ stall-detection picks up and re-delivers. Max 2 stalls before fail (per config).                                |           |
| 8.4 | Redis connection loss                                                               | Worker disconnects; jobs paused. When Redis comes back, jobs resume. No duplicate processing.                          |           |
| 8.5 | Prisma connection pool exhaustion                                                   | Job waits on connection; lockDuration may be exceeded → stall. After pool recovery, jobs resume.                       |           |
| 8.6 | Worker upgrade mid-execution                                                        | Graceful shutdown processes in-flight jobs. New worker takes over. No duplicate sides effects.                         |           |

---

## 9. Observability Assertions

| #    | What to check                                            | Expected                                                                                                                                     | Pass/Fail |
| ---- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1  | Structured log on job start                              | `Processing <JOB_NAME> — tenant <tenant_id>, invoice <target_entity_id>` (or equivalent).                                                    |           |
| 9.2  | Structured log on success                                | `Invoice <invoice_number> (<id>) issued via approval, tenant <tenant_id>` for on-approval. `Marked <n> invoices as overdue ...` for overdue. |           |
| 9.3  | Structured log on warn / self-heal                       | `Logger.warn(...)` with reason.                                                                                                              |           |
| 9.4  | Structured log on failure                                | Exception thrown → BullMQ emits `failed` event. Error is captured and logged with stack.                                                     |           |
| 9.5  | Log payload includes tenant_id + job_id + attempt_number | All three fields present in every log line for correlation.                                                                                  |           |
| 9.6  | Metrics — job completion counter                         | Metrics registry has a counter incremented on each completed job, labelled by queue + job name.                                              |           |
| 9.7  | Metrics — job failure counter                            | Counter on failure, labelled the same.                                                                                                       |           |
| 9.8  | Metrics — queue depth gauge                              | Gauge exports waiting/active/completed/failed counts.                                                                                        |           |
| 9.9  | Canary alert                                             | If `finance` queue has a job waiting > 5 minutes (SLA), canary alert fires. Tested by enqueuing a job while the worker is paused.            |           |
| 9.10 | Correlation ID                                           | Every job log line includes a request-id or job-id that traces back to the enqueue caller.                                                   |           |

---

## 10. Observations & Gaps

1. **P1 — No cron registration for finance jobs.** Overdue detection, reminders, late fees, recurring invoice generation, scholarship expiration — none are scheduled automatically. Either CronSchedulerService needs entries OR an external cron system triggers the API endpoints. Production data quality suffers without this.
2. **P1 — Payment reminders never dispatched.** `PaymentRemindersService.dispatchReminder` writes a dedupe row but doesn't call the notifications module. Reminders are effectively a no-op. Wire up to `communications:send-email` queue or inline notification service.
3. **P2 — No explicit retry policy on `finance:on-approval` and `overdue-detection`.** Uses BullMQ defaults. Per the `approval-requests.service.ts:303-307` enqueue, no `attempts` / `backoff` passed in. If the DB is transiently down during the callback, the job will fail on first attempt and end there. Add `attempts: 5, backoff: { type: 'exponential', delay: 1000 }`.
4. **P2 — No chain from overdue-detection → notification.** Overdue invoices are flagged but no reminder is dispatched. Cart parent will never know.
5. **P2 — No late-fee accrual job.** Even though `LateFeesService.applyLateFee` exists, there's no automation. Admins must POST manually per invoice. Add a per-tenant cron that calls `applyLateFee` for all configured `late_fee_configs`.
6. **P3 — Engagement invoice-generation uses direct service call, not a queue.** This means engagement failures are not retried. If InvoicesService throws, the engagement processor propagates the failure. Consider a finance-scoped queue for engagement-driven invoicing.
7. **P3 — No idempotency key on the enqueue side.** Two parallel `approve()` calls on the same approval_request could enqueue two `on-approval` jobs. The second would self-heal (§3.11), but cleaner to use BullMQ `jobId: \`approval:${requestId}\`` for automatic dedup.
8. **P3 — Refund Stripe execution is NOT via a queue.** `RefundsService.execute()` calls Stripe synchronously. A Stripe API outage blocks the admin request. Consider moving to `finance:refund-execute` queue.

---

## 11. Sign-Off

| Reviewer Name | Date | Pass | Fail | Overall Result |
| ------------- | ---- | ---- | ---- | -------------- |
|               |      |      |      |                |

**Minimum to pass:** §3 (invoice-approval-callback) and §4 (overdue-detection) fully pass. §5 is acknowledged to be a documented coverage gap; product decides when to wire crons. §7 idempotency MUST pass for both jobs. §8 failure isolation MUST pass.

**Operator criterion:** "If a job fails in production at 3am, it retries correctly OR lands in dead-letter with enough signal to replay — and one bad tenant never blocks the daily run for everyone else." If §8 fails, this criterion is not met.
