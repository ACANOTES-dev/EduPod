# Admissions Module — Worker / Background Job Test Specification

**Scope:** BullMQ queues, jobs, crons, retries, dead-letter, async side-effect chains
**Spec version:** 1.0 (2026-04-12)
**Audience:** a worker-harness (Jest + bullmq-test-helpers + fake-timers, or similar) that can enqueue programmatically, drain queues, inspect state, and assert DB side effects.
**Pack companion:** part of `/e2e-full admissions` — admin + parent + integration + perf + security specs alongside

---

## Table of Contents

1. [Prerequisites & Fixture Seeding](#1-prerequisites)
2. [Queue Inventory](#2-queue-inventory)
3. [Job Inventory & Matrix](#3-job-matrix)
4. [Cron Schedule Matrix](#4-cron-matrix)
5. [Async Side-Effect Chains](#5-chains)
6. [Idempotency Suite](#6-idempotency)
7. [Failure Isolation](#7-failure-isolation)
8. [Observability Assertions](#8-observability)
9. [Observations](#9-observations)
10. [Sign-off](#10-signoff)

---

## 1. Prerequisites & Fixture Seeding <a id="1-prerequisites"></a>

- Same two tenants as integration spec (`tenant-a`, `tenant-b`).
- A test Redis instance dedicated to this suite (distinct from prod, distinct from the other /e2e legs to avoid job cross-contamination).
- `sinon.useFakeTimers()` configured per-test to control cron firing deterministically.
- A test-only manual-trigger endpoint `/__test/worker/trigger-cron?name=admissions:payment-expiry` that the harness invokes instead of waiting for the scheduler.
- An email/notification capture fake (`NotificationsDispatcher` mocked at the boundary) that records dispatch attempts without actually calling SES/SendGrid.
- Stripe SDK mocked: `stripe.checkout.sessions.create` returns a deterministic `id` per call.

---

## 2. Queue Inventory <a id="2-queue-inventory"></a>

Opened `apps/worker/src/base/queue.constants.ts` and every `@Processor` decorator. Queues the admissions module reads or writes:

### 2.1 `notifications` queue (shared)

- Queue name: `notifications`
- Constant: `QUEUE_NAMES.NOTIFICATIONS`
- Jobs registered under admissions:
  - `notifications:admissions-payment-link` (`NotificationsAdmissionsPaymentLinkProcessor`)
  - `notifications:admissions-auto-promoted` (if separate processor; otherwise handled by generic notifications processor)
- Retry policy: default `{ attempts: 5, backoff: { type: 'exponential', delay: 2000 } }` (inherited from notifications base unless overridden)
- Removal policy: `removeOnComplete: 10, removeOnFail: 50`
- Concurrency: per worker instance, `concurrency: 3`
- Rate limiter: none at queue level (throttling happens at provider)

### 2.2 `admissions` queue (module-owned)

- Queue name: `admissions`
- Constant: `QUEUE_NAMES.ADMISSIONS`
- Jobs:
  - `admissions:payment-expiry` (cron-driven; `AdmissionsPaymentExpiryProcessor`)
- Retry policy: `{ attempts: 2, backoff: { type: 'fixed', delay: 10000 } }`
- Removal policy: `removeOnComplete: 10, removeOnFail: 50`
- Concurrency: `1` (cron job — no benefit from parallelism)
- Cron scheduled via `CronSchedulerService` with `jobId: 'cron:admissions:payment-expiry'`, `cron: '*/15 * * * *'`.

### 2.3 Test matrix

| #     | What to Check                                                                                             | Expected                                                                                                       | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 2.3.1 | Introspect `queue.constants.ts`                                                                           | `NOTIFICATIONS` and `ADMISSIONS` constants present.                                                            |           |
| 2.3.2 | Each processor class uses `@Processor(QUEUE_NAMES.NOTIFICATIONS)` or `@Processor(QUEUE_NAMES.ADMISSIONS)` | No literal strings; constants enforced.                                                                        |           |
| 2.3.3 | Retention config per queue                                                                                | Verify via `(await queue.getJobCounts())` after 20 completed jobs → only 10 retained. `removeOnFail` keeps 50. |           |
| 2.3.4 | Concurrency setting                                                                                       | `BullWorker.opts.concurrency` matches the queue's documented concurrency.                                      |           |

---

## 3. Job Inventory & Matrix <a id="3-job-matrix"></a>

### 3.1 `notifications:admissions-payment-link`

- **File:** `apps/worker/src/processors/admissions/admissions-payment-link.processor.ts` (317 lines)
- **Job name constant:** `ADMISSIONS_PAYMENT_LINK_JOB = 'notifications:admissions-payment-link'`
- **Payload schema:**
  ```typescript
  {
    tenant_id: string;
    application_id: string;
  }
  ```
- **Trigger:** `ApplicationStateMachineService.moveToConditionalApproval()` enqueues it after a successful transition.
- **Side effects:**
  1. Load application (must be `status='conditional_approval'`).
  2. Decrypt tenant Stripe key; call `StripeService.createAdmissionsCheckoutSession(...)`.
  3. Write `application.stripe_checkout_session_id`.
  4. Resolve parent user.
  5. Insert `Notification` row (`template_key='admissions_payment_link'`, `channel='email'`, `payload_json={checkout_url, deadline, amount, currency}`, `idempotency_key='admissions:payment-link:{session_id}'`).
- **Error modes:**
  - Application not found / not in expected status → fail, retry (transient in race scenarios).
  - Stripe API error → retry up to max attempts.
  - Notification insert fails → retry.
- **Lock & stall:** `lockDuration: 60s, stalledInterval: 60s, maxStalledCount: 2`.

| #      | Test                                                                                       | Expected                                                                                                                                                                                                   | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1.1  | Enqueue with valid payload, wait for completion                                            | Job `status='completed'`. `application.stripe_checkout_session_id` updated. Notification row inserted.                                                                                                     |           |
| 3.1.2  | Enqueue WITHOUT `tenant_id`                                                                | Processor throws / fails immediately. No side effects. Job ends `status='failed'` after exhausting retries. Log emits `TENANT_ID_MISSING`.                                                                 |           |
| 3.1.3  | Enqueue with `tenant_id` pointing at a nonexistent tenant                                  | Processor throws loudly (`TENANT_NOT_FOUND` or equivalent). Retries exhausted. Dead-letter row.                                                                                                            |           |
| 3.1.4  | Enqueue with application that is no longer in `conditional_approval`                       | Processor idempotency guard: completes without side effect; logs `SKIPPED_INVALID_STATUS`.                                                                                                                 |           |
| 3.1.5  | Stripe API throws once, succeeds on retry                                                  | First attempt fails, 2nd attempt succeeds. Job ends completed. `attemptsMade=2`. Only one notification row created (idempotency key dedup).                                                                |           |
| 3.1.6  | Stripe API permanently fails                                                               | Exhausts retries. Dead-letter row. `application.stripe_checkout_session_id` remains null. Operator can replay (idempotent).                                                                                |           |
| 3.1.7  | Duplicate job (same `application_id`, different Stripe session)                            | Second run produces a new session_id, updates `stripe_checkout_session_id`, and inserts a NEW notification (different idempotency key per session_id — intentional, since it's a legitimate regeneration). |           |
| 3.1.8  | Exact duplicate (same session_id) — e.g., retry after crash post-Stripe-API, pre-DB-commit | Notification idempotency_key prevents duplicate notification insertion. Only one row remains.                                                                                                              |           |
| 3.1.9  | RLS context                                                                                | Processor extends `TenantAwareJob` (or sets `SET LOCAL app.current_tenant_id` on start). Verify any DB query inside the processor returns tenant-scoped data only.                                         |           |
| 3.1.10 | Structured log lines                                                                       | On start: `{ job: 'admissions:payment-link', tenant_id, application_id, attempt }`. On success: adds `duration_ms, session_id`. On failure: adds `error_code, stack`.                                      |           |

### 3.2 `notifications:admissions-auto-promoted`

If a dedicated processor exists, section applies. Otherwise the notification is handled by the same-shaped template via the generic notifications processor — verify idempotency on template_key.

| #     | Test                                                            | Expected                                                                                                                           | Pass/Fail |
| ----- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.2.1 | Triggered by auto-promotion in `AdmissionsAutoPromotionService` | Notification row inserted with `template_key='admissions_auto_promoted'`. Recipient = parent of the promoted application.          |           |
| 3.2.2 | RLS context                                                     | Tenant set per-application during iteration.                                                                                       |           |
| 3.2.3 | Idempotency key format                                          | `admissions:auto-promoted:{application_id}` — second promote for the same application (edge case) does not duplicate notification. |           |

### 3.3 `admissions:payment-expiry` (cron job processor)

- **File:** `apps/worker/src/processors/admissions/admissions-payment-expiry.processor.ts` (405 lines)
- **Job name:** `ADMISSIONS_PAYMENT_EXPIRY_JOB = 'admissions:payment-expiry'`
- **Payload:** `{}` (cross-tenant)
- **Cron:** `*/15 * * * *`
- **Phases:**
  1. Discovery (no RLS) — find all applications with `status='conditional_approval'` AND `payment_deadline < now()`.
  2. Per-tenant batch — revert each to `waiting_list` (clear amount+deadline), write system note, track affected (year, year_group) pairs.
  3. Auto-promote — for each affected pair, run FIFO promotion.
- **Error handling:** per-application failures logged but do not stop the overall run.
- **Lock:** `lockDuration: 5 min, stalledInterval: 60s, maxStalledCount: 2`.

| #      | Test                                                                                                          | Expected                                                                                                                                                                                                    | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.3.1  | Seed 3 expired conditional_approval apps (Tenant A: 2, Tenant B: 1); trigger cron                             | All 3 reverted to `waiting_list`. 3 system notes created. Affected year_group pairs detected.                                                                                                               |           |
| 3.3.2  | Reverted apps have `payment_amount_cents=NULL, payment_deadline=NULL`                                         | Verify via DB.                                                                                                                                                                                              |           |
| 3.3.3  | Seats released                                                                                                | Capacity count decreases accordingly; corresponding waiting_list app (FIFO oldest) gets promoted to `ready_to_admit` (phase 3).                                                                             |           |
| 3.3.4  | If a revert fails mid-run (mock DB throw for one application)                                                 | That one logged, counted in `failed`. Others still processed. Cron exits 'completed' (partial success).                                                                                                     |           |
| 3.3.5  | Running cron twice in quick succession                                                                        | BullMQ `jobId='cron:admissions:payment-expiry'` dedup: second trigger within the 5-min `lockDuration` is dropped. No double-revert.                                                                         |           |
| 3.3.6  | No expired applications                                                                                       | Cron runs quickly, logs `{ expired:0, promoted:0, failed:0, tenants:<n> }`. Exits completed.                                                                                                                |           |
| 3.3.7  | Fake timer fast-forward 15 min                                                                                | Cron re-fires exactly once.                                                                                                                                                                                 |           |
| 3.3.8  | Cross-tenant: Tenant A expired + Tenant B expired in same run                                                 | Each revert happens inside its own tenant-scoped transaction (`SET LOCAL app.current_tenant_id=<tenant>`).                                                                                                  |           |
| 3.3.9  | `waiting_list_substatus='awaiting_year_setup'` for a year_group with no classes → auto-promotion must NOT run | Auto-promotion phase skips year groups where the discovery step finds substatus rows. Verify that the promoted count for that year_group stays 0.                                                           |           |
| 3.3.10 | Audit attribution                                                                                             | Reverted application's new note `reviewed_by_user_id` = original approver. System note author = System sentinel. Promoted application's note attributes to the admin whose expired approval freed the seat. |           |
| 3.3.11 | Idempotent replay (simulate a second cron run while the previous was interrupted)                             | Applications already reverted are not touched. Promotions do not duplicate.                                                                                                                                 |           |
| 3.3.12 | Race with in-flight Stripe webhook                                                                            | See integration spec §8.5. Worker tests verify the cron does not clobber an application that has just transitioned to `approved` (status check inside the transaction).                                     |           |

---

## 4. Cron Schedule Matrix <a id="4-cron-matrix"></a>

Only one cron belongs to admissions:

| #   | Cron                               | Schedule       | Scope        | Test                                                                                                                                                                                               | Pass/Fail |
| --- | ---------------------------------- | -------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | `admissions:payment-expiry`        | `*/15 * * * *` | Cross-tenant | Registered via `CronSchedulerService.addRepeatableJob` with `jobId: 'cron:admissions:payment-expiry'`. Fires exactly 4 times per hour. Fast-forward 1 hour in test → 4 triggers. Dedup via jobId.  |           |
| 4.2 | Missing registration               | N/A            | —            | If the cron is ever removed from `OnModuleInit`, integration tests catch stale `payment_deadline` data (no expiry). Ensure the spec's "Prerequisites" includes verifying the registration on boot. |           |
| 4.3 | `removeOnComplete`, `removeOnFail` | —              | —            | After 20 runs, only 10 completed jobs retained in Redis. After 50 failures (induced), older failures are truncated.                                                                                |           |

---

## 5. Async Side-Effect Chains <a id="5-chains"></a>

### 5.1 Chain: Admin approval → payment link email

1. Admin `POST /v1/applications/:id/review { status: 'conditional_approval' }`.
2. API controller invokes state-machine, which enqueues `notifications:admissions-payment-link`.
3. Worker processes the job — creates Stripe session, writes DB, enqueues Notification.
4. Notifications processor (sibling module) dispatches the email.

| #     | Test                                                                 | Expected                                                                                                                                                                                           | Pass/Fail |
| ----- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1.1 | Execute flow top-to-bottom with harness; wait for both jobs to drain | Final state: application.status=conditional_approval, application.stripe_checkout_session_id set, Notification row with `dispatched_at` set, email capture fake has exactly one recorded dispatch. |           |
| 5.1.2 | Job B (email dispatch) only runs after job A tx commits              | Slow down job A by 3s; start job B by manually enqueuing with the same payload — job B waits for the application's notifications row to be queryable. Verify via DB snapshot at job B start.       |           |
| 5.1.3 | Total chain latency                                                  | p95 < 10s under realistic load.                                                                                                                                                                    |           |
| 5.1.4 | Timeout if hung                                                      | If job A or B doesn't complete within 60s, test fails with a useful error (not a generic Jest timeout).                                                                                            |           |

### 5.2 Chain: Stripe webhook → approve → finance records → receipt notification

1. Webhook delivered → finance module extracts metadata, dispatches to admissions handler.
2. Admissions handler: creates AdmissionsPaymentEvent, calls `ApplicationConversionService.convertToStudent`, calls `markApproved`, calls `AdmissionsFinanceBridgeService.createFinancialRecords`.
3. Follow-up notification enqueued (parent receipt).

| #     | Test                                                           | Expected                                                                                                    | Pass/Fail |
| ----- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| 5.2.1 | Deliver a valid `checkout.session.completed`; drain all queues | Application `approved`, Student, Invoice, Payment, Allocation all created. Receipt Notification row exists. |           |
| 5.2.2 | Webhook races with `payment-expiry` cron                       | See §3.3.12 and integration §8.5. One winner. Final state consistent (never partial).                       |           |
| 5.2.3 | Webhook idempotency                                            | Replay same event.id → no double side effects (one AdmissionsPaymentEvent, one Student, one Invoice).       |           |

### 5.3 Chain: Revert to waiting_list → auto-promote → notification

1. `payment-expiry` cron reverts an application.
2. Auto-promotion phase: next FIFO waiting_list app → ready_to_admit.
3. `notifications:admissions-auto-promoted` enqueued.
4. Notifications processor dispatches the email.

| #     | Test                              | Expected                                                                                                                   | Pass/Fail |
| ----- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.3.1 | Seed scenario; trigger cron       | Reverted app → waiting_list; promoted app → ready_to_admit; promoted app's parent receives the auto-promoted notification. |           |
| 5.3.2 | Multiple candidates for promotion | Only one promoted per free seat (FIFO first). Others stay waiting_list.                                                    |           |
| 5.3.3 | Zero waiting_list candidates      | Seat stays unallocated. No email. No notification row.                                                                     |           |

---

## 6. Idempotency Suite <a id="6-idempotency"></a>

| #   | Test                                                                             | Expected                                                                                                                                                                                                        | Pass/Fail |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Run `admissions:payment-link` twice with same payload (no status change between) | Second run: Notification idempotency_key prevents duplicate row insert. Stripe session_id may be regenerated (explicit regenerate) OR preserved (skip-if-set guard) — spec must state WHICH; implement to spec. |           |
| 6.2 | Run `admissions:payment-expiry` twice back-to-back (before next cron tick)       | Apps already reverted are not touched. Promotions not duplicated. Logged `expired=0` on second run.                                                                                                             |           |
| 6.3 | Stripe webhook replay (see 5.2.3)                                                | Covered in integration spec §6.4; worker-level replay = same outcome.                                                                                                                                           |           |
| 6.4 | Crash-after-commit simulation (kill worker after tx but before queue ACK)        | On restart, BullMQ re-delivers the job. Re-running: AdmissionsPaymentEvent unique index + Notification idempotency_key prevent duplicate writes. Application state unchanged.                                   |           |
| 6.5 | Auto-promote across two cron ticks                                               | Seat freed by revert in tick 1; promotion happens in tick 1. Tick 2 finds no new work.                                                                                                                          |           |

---

## 7. Failure Isolation <a id="7-failure-isolation"></a>

| #   | Test                                                                     | Expected                                                                                                                                                            | Pass/Fail |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Enqueue 10 `admissions:payment-link` jobs; mock every 3rd to fail        | 7 complete, 3 go to DLQ after retries. No interference between successes.                                                                                           |           |
| 7.2 | Enqueue 10 jobs, mock every tenant-A job to throw, tenant-B jobs succeed | Tenant B jobs all complete. Tenant A jobs all DLQ. Cron (if relevant) continues for subsequent tenants despite one tenant failing.                                  |           |
| 7.3 | `payment-expiry` cron: Tenant A's revert phase throws mid-iteration      | Tenant A's partially-processed state rolled back at the tx boundary. Tenant B's iteration still runs to completion.                                                 |           |
| 7.4 | Redis down / transient                                                   | Jobs queue locally (BullMQ-level retry). No data loss. When Redis recovers, jobs resume.                                                                            |           |
| 7.5 | Postgres down / transient                                                | Processor throws, job retries, eventually succeeds on DB recovery.                                                                                                  |           |
| 7.6 | Dead-letter queue replay                                                 | Operator uses `bullmq-admin` or `/worker/admin/dlq/replay` endpoint (if exposed) to re-enqueue a dead-letter job. Replay is idempotent; does not create duplicates. |           |

---

## 8. Observability Assertions <a id="8-observability"></a>

| #   | Test                                                                      | Expected                                                                                                                                                                                | Pass/Fail |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Every processor logs on start, success, failure                           | 3 log lines per job. Level: info on start/success, error on failure.                                                                                                                    |           |
| 8.2 | Log includes `tenant_id, job_id, attempt, application_id` (if applicable) | JSON-parseable log payload. Verify via regex or structured-log asserter.                                                                                                                |           |
| 8.3 | Metrics emitted                                                           | A `admissions.jobs.completed` counter + `admissions.jobs.failed` + `admissions.jobs.duration_ms` histogram. Emitted to the stats client (StatsD / OpenTelemetry / pick per deployment). |           |
| 8.4 | `payment-expiry` cron emits aggregate counters                            | `admissions.expiry.reverted`, `admissions.expiry.promoted`, `admissions.expiry.failed`, `admissions.expiry.tenants_processed`.                                                          |           |
| 8.5 | Alerting hook                                                             | DLQ length > 10 triggers an alert (verify alert rule file). Dead-letter jobs in `admissions` queue page an oncall engineer within 5 minutes.                                            |           |
| 8.6 | Worker liveness                                                           | `/worker/health` endpoint returns 200 while processing; 503 if the process has stalled (e.g., Redis disconnected for > 60s).                                                            |           |

---

## 9. Observations <a id="9-observations"></a>

| #     | Severity | Location                                                 | Observation                                                                                                                                                                                                                                                                                     |
| ----- | -------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WK-01 | P1       | `admissions-payment-expiry.processor.ts`                 | Cron lockDuration is 5 min; if a tenant has so many expired rows that revert+promote takes longer, the lock expires and a second concurrent tick could run. Measure worst-case runtime under 10k expired rows; bump lock if needed.                                                             |
| WK-02 | P2       | `admissions-payment-link.processor.ts`                   | Stripe session creation is non-idempotent from Stripe's side (two calls yield two sessions with two distinct URLs). If a retry fires after a successful Stripe call but before DB commit, a zombie session is created.                                                                          |
| WK-03 | P2       | Shared `notifications` queue                             | A pile-up in a sibling module's notification processing delays admissions payment-link dispatch. Consider separate queue or priority flag.                                                                                                                                                      |
| WK-04 | P3       | Worker-side retry of `payment-expiry`                    | A transient DB error mid-revert could retry the entire cron — but partial reverts are not rolled back if the transaction is per-application. Verify each tenant's iteration wraps in an RLS transaction and uses SAVEPOINT. Or — if not per-app tx — one tenant's failure taints the whole run. |
| WK-05 | P2       | Observability                                            | No documented metric exists for "notification delivery success rate" for admissions-specific templates. Ops cannot distinguish between admissions email failures vs other notification types without log diving.                                                                                |
| WK-06 | P2       | Idempotency in `admissions-payment-link` on regenerate   | `regenerate` always creates a new Stripe session — the Notification idempotency_key uses the NEW session_id, so a second "regenerate" sends TWO emails to the parent. This may be intentional but worth product confirm.                                                                        |
| WK-07 | P3       | Queue constant typing                                    | Check `apps/worker/src/base/queue.constants.ts` — ensure ADMISSIONS is a TS `as const` literal, not a string-loose var. Prevents typo bugs.                                                                                                                                                     |
| WK-08 | P2       | Race with webhook: `markApproved` path and cron reversal | Integration spec §8.5 + worker spec §3.3.12 define the race. Worker must re-SELECT the row inside the RLS tx and check `status='conditional_approval'` before reverting. Otherwise data corruption possible.                                                                                    |

---

## 10. Sign-off <a id="10-signoff"></a>

| Section               | Reviewer | Date | Pass | Fail | Notes |
| --------------------- | -------- | ---- | ---- | ---- | ----- |
| 2 — Queue inventory   |          |      |      |      |       |
| 3 — Job matrix        |          |      |      |      |       |
| 4 — Cron matrix       |          |      |      |      |       |
| 5 — Chains            |          |      |      |      |       |
| 6 — Idempotency       |          |      |      |      |       |
| 7 — Failure isolation |          |      |      |      |       |
| 8 — Observability     |          |      |      |      |       |
| **Overall**           |          |      |      |      |       |

**Worker release-ready when every row passes AND WK-01 (lockDuration upper bound) is either validated or mitigated.**
