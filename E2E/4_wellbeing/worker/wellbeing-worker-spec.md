# Wellbeing — Worker / Background-Job Test Specification

> **Generated:** 2026-04-21
> **Module slug:** `wellbeing`
> **Scope:** BullMQ queues, processors, cron registrations, retry + dead-letter, async side-effect chains, idempotency, failure isolation, tenant-aware payload enforcement.
> **Companion specs:** `../admin_view/` (UI), `../integration/` (RLS + contracts), `../perf/`, `../security/`.

The wellbeing umbrella is the single largest async-workload owner in the platform:

- **5 queues touched:** `pastoral`, `wellbeing`, `early-warning`, `behaviour` (shared with safeguarding co-located), plus `notifications` and `pdf-rendering` consumed downstream.
- **18 distinct processors** implementing per-tenant or cross-tenant patterns.
- **10 cron registrations** in `CronSchedulerService.onModuleInit()`.
- **Chain flows** spanning behaviour → pastoral → safeguarding → early-warning → notifications → email/SMS stubs.

Every processor extends `WorkerHost` (BullMQ base). Tenant-scoped jobs enforce the `tenant_id` contract via `TenantAwareJob` base or inline checks. The shared BullMQ queue configuration uniformly sets `attempts: 3, backoff: 5000ms, removeOnComplete: 100, removeOnFail: 500`.

This spec asserts: every processor is registered, every job type is dispatched correctly, every chain links, every idempotency guard holds, every retry path converges, and every cron fires on schedule.

---

## Table of contents

1. [Prerequisites & fixture seeding](#1-prerequisites--fixture-seeding)
2. [Queue inventory](#2-queue-inventory)
3. [Processor inventory](#3-processor-inventory)
4. [`pastoral:notify-concern`](#4-pastoralnotify-concern)
5. [`pastoral:escalation-timeout` (delayed-chain)](#5-pastoralescalation-timeout-delayed-chain)
6. [`pastoral:checkin-alert`](#6-pastoralcheckin-alert)
7. [`pastoral:wellbeing-flag-expiry` (cron)](#7-pastoralwellbeing-flag-expiry-cron)
8. [`pastoral:overdue-actions` (cron)](#8-pastoraloverdue-actions-cron)
9. [`pastoral:intervention-review-reminder`](#9-pastoralintervention-review-reminder)
10. [`pastoral:sync-behaviour-safeguarding` (chain)](#10-pastoralsync-behaviour-safeguarding-chain)
11. [`pastoral:precompute-agenda`](#11-pastoralprecompute-agenda)
12. [`pastoral:cron-dispatch-overdue` (dispatcher)](#12-pastoralcron-dispatch-overdue-dispatcher)
13. [`safeguarding:critical-escalation` (chain)](#13-safeguardingcritical-escalation-chain)
14. [`safeguarding:sla-check`](#14-safeguardingsla-check)
15. [`behaviour:break-glass-expiry` (cron)](#15-behaviourbreak-glass-expiry-cron)
16. [`safeguarding:attachment-scan`](#16-safeguardingattachment-scan)
17. [`safeguarding:message-scan`](#17-safeguardingmessage-scan)
18. [`safeguarding:notify-reviewers`](#18-safeguardingnotify-reviewers)
19. [`wellbeing:survey-open-notify`](#19-wellbeingsurvey-open-notify)
20. [`wellbeing:eap-refresh-check` (cron)](#20-wellbeingeap-refresh-check-cron)
21. [`wellbeing:moderation-scan`](#21-wellbeingmoderation-scan)
22. [`wellbeing:survey-closing-reminder` (cron)](#22-wellbeingsurvey-closing-reminder-cron)
23. [`wellbeing:cleanup-participation-tokens` (cron)](#23-wellbeingcleanup-participation-tokens-cron)
24. [`wellbeing:workload-metrics` (cron)](#24-wellbeingworkload-metrics-cron)
25. [`early-warning:compute-daily` (cron)](#25-early-warningcompute-daily-cron)
26. [`early-warning:compute-student`](#26-early-warningcompute-student)
27. [`early-warning:weekly-digest` (cron)](#27-early-warningweekly-digest-cron)
28. [`behaviour:parent-notification`](#28-behaviourparent-notification)
29. [`behaviour:cron-dispatch-daily/sla/monthly` (dispatchers)](#29-behaviourcron-dispatch-dispatchers)
30. [Cross-module chain flows (end-to-end)](#30-cross-module-chain-flows-end-to-end)
31. [Retry + dead-letter policy](#31-retry--dead-letter-policy)
32. [Idempotency patterns per processor](#32-idempotency-patterns-per-processor)
33. [Tenant-aware payload enforcement](#33-tenant-aware-payload-enforcement)
34. [Failure isolation (crash / stall / cross-tenant)](#34-failure-isolation-crash--stall--cross-tenant)
35. [Observability + logging + DLQ monitor](#35-observability--logging--dlq-monitor)
36. [WorkerModule registration + env](#36-workermodule-registration--env)
37. [Sign-off](#37-sign-off)

---

## 1. Prerequisites & fixture seeding

| #   | What to run                                                                                                                                                                           | Expected        | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| 1.1 | Dedicated test Redis (`REDIS_URL=redis://localhost:6380/1`). All 5 wellbeing queues bind here.                                                                                        | Set per env.    |           |
| 1.2 | Test Postgres with both Tenants A + B seeded per integration §1. `tenant_modules` has all 5 wellbeing modules active for both tenants.                                                | Ready.          |           |
| 1.3 | Worker process (`apps/worker`) booted with test env, `NODE_ENV=test`.                                                                                                                 | Worker running. |           |
| 1.4 | Harness helpers: `drainQueue(name, timeout=10_000)`, `queueState(name)`, `enqueue(name, jobName, payload, opts)`, `advanceTime(ms)` (if fake timers are available), `getJobById(id)`. | Helpers ready.  |           |
| 1.5 | Each test starts with `FLUSHDB` to ensure a clean queue state.                                                                                                                        | Empty on start. |           |
| 1.6 | Outbound provider stubs (`wellbeing-notifications` email / SMS / WhatsApp) throw `PROVIDER_NOT_WIRED` per PLAN §8. Tests assert log lines, not delivery.                              | Stubs active.   |           |
| 1.7 | ClamAV stub — `safeguarding:attachment-scan` calls are mocked to return clean/flagged as configured.                                                                                  | Stub active.    |           |
| 1.8 | Anthropic stub — `behaviour:ai-parse` / `ai-summary` / `ai-query` mocked. `ai_flag` gating tested at API layer (integration §34).                                                     | Stub active.    |           |

---

## 2. Queue inventory

| Queue name      | Constant                    | Attempts |  Backoff   | removeOnComplete | removeOnFail | Notes                                                    |
| --------------- | --------------------------- | :------: | :--------: | :--------------: | :----------: | -------------------------------------------------------- |
| `pastoral`      | `QUEUE_NAMES.PASTORAL`      |    3     | 5000ms exp |       100        |     500      | 9 processors                                             |
| `wellbeing`     | `QUEUE_NAMES.WELLBEING`     |    3     | 5000ms exp |       100        |     500      | 6 processors                                             |
| `early-warning` | `QUEUE_NAMES.EARLY_WARNING` |    3     | 5000ms exp |       100        |     500      | 3 processors                                             |
| `behaviour`     | `QUEUE_NAMES.BEHAVIOUR`     |    3     | 5000ms exp |       100        |     500      | 9 processors (6 safeguarding co-located + 3 dispatchers) |
| `notifications` | `QUEUE_NAMES.NOTIFICATIONS` |    3     | 5000ms exp |       100        |     500      | consumed by wellbeing dispatch                           |
| `pdf-rendering` | `QUEUE_NAMES.PDF_RENDERING` |    3     | 5000ms exp |       100        |     500      | consumed by document/case-file generation                |

| #   | What to Check                                                                                                                                  | Expected                      | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------- |
| 2.1 | `grep -n "QUEUE_NAMES\." apps/worker/src/base/queue.constants.ts` lists all 6 above.                                                           | All present.                  |           |
| 2.2 | BullMQ admin: `queueState('pastoral').waiting+active+delayed+completed+failed` changes as jobs flow.                                           | State transitions observable. |           |
| 2.3 | Per-queue concurrency default 1 (raise per processor as needed). Document where concurrency differs.                                           | Default 1.                    |           |
| 2.4 | `stalledInterval: 60_000, maxStalledCount: 2` applied globally.                                                                                | Applied.                      |           |
| 2.5 | `redis-cli KEYS "bull:pastoral:*"` length bounded — `removeOnComplete=100` caps retained jobs.                                                 | Bounded.                      |           |
| 2.6 | No processor claims a queue it doesn't belong to. Grep `@Processor('<QUEUE>')` and confirm the 18 wellbeing processors match the matrix above. | Match.                        |           |

---

## 3. Processor inventory

| #    | Processor class                        | Queue         | Job name                                 |         Tenant-aware?         |            Cron?            |
| ---- | -------------------------------------- | ------------- | ---------------------------------------- | :---------------------------: | :-------------------------: | ------------ | --- |
| 3.1  | `NotifyConcernProcessor`               | pastoral      | `pastoral:notify-concern`                |              yes              |             no              |
| 3.2  | `EscalationTimeoutProcessor`           | pastoral      | `pastoral:escalation-timeout`            |              yes              |        no (delayed)         |
| 3.3  | `CheckinAlertProcessor`                | pastoral      | `pastoral:checkin-alert`                 |              yes              |             no              |
| 3.4  | `WellbeingFlagExpiryProcessor`         | pastoral      | `pastoral:wellbeing-flag-expiry`         |              yes              |         yes (daily)         |
| 3.5  | `OverdueActionsProcessor`              | pastoral      | `pastoral:overdue-actions`               |              yes              | yes (hourly via dispatcher) |
| 3.6  | `InterventionReviewReminderProcessor`  | pastoral      | `pastoral:intervention-review-reminder`  |              yes              |             no              |
| 3.7  | `SyncBehaviourSafeguardingProcessor`   | pastoral      | `pastoral:sync-behaviour-safeguarding`   |              yes              |         no (chain)          |
| 3.8  | `PrecomputeAgendaProcessor`            | pastoral      | `pastoral:precompute-agenda`             |              yes              |             no              |
| 3.9  | `PastoralCronDispatchProcessor`        | pastoral      | `pastoral:cron-dispatch-overdue`         |         cross-tenant          |        yes (hourly)         |
| 3.10 | `CriticalEscalationProcessor`          | behaviour     | `safeguarding:critical-escalation`       |              yes              |     no (delayed chain)      |
| 3.11 | `SlaCheckProcessor`                    | behaviour     | `safeguarding:sla-check`                 |              yes              | yes (5 min via dispatcher)  |
| 3.12 | `BreakGlassExpiryProcessor`            | behaviour     | `behaviour:break-glass-expiry`           |              yes              | yes (daily via dispatcher)  |
| 3.13 | `AttachmentScanProcessor`              | behaviour     | `safeguarding:attachment-scan`           |              yes              |             no              |
| 3.14 | `SafeguardingScanMessageProcessor`     | behaviour     | `safeguarding:message-scan`              |              yes              |             no              |
| 3.15 | `SafeguardingNotifyReviewersProcessor` | behaviour     | `safeguarding:notify-reviewers`          |              yes              |             no              |
| 3.16 | `SurveyOpenNotifyProcessor`            | wellbeing     | `wellbeing:survey-open-notify`           |              yes              |             no              |
| 3.17 | `EapRefreshCheckProcessor`             | wellbeing     | `wellbeing:eap-refresh-check`            |         cross-tenant          |         yes (daily)         |
| 3.18 | `ModerationScanProcessor`              | wellbeing     | `wellbeing:moderation-scan`              | no (anonymous; survey-scoped) |             no              |
| 3.19 | `SurveyClosingReminderProcessor`       | wellbeing     | `wellbeing:survey-closing-reminder`      |         cross-tenant          |         yes (daily)         |
| 3.20 | `CleanupParticipationTokensProcessor`  | wellbeing     | `wellbeing:cleanup-participation-tokens` |         cross-tenant          |         yes (daily)         |
| 3.21 | `WorkloadMetricsProcessor`             | wellbeing     | `wellbeing:workload-metrics`             |         cross-tenant          |         yes (daily)         |
| 3.22 | `ComputeDailyProcessor`                | early-warning | `early-warning:compute-daily`            |  cross-tenant or per-tenant   |         yes (daily)         |
| 3.23 | `ComputeStudentProcessor`              | early-warning | `early-warning:compute-student`          |              yes              |         no (chain)          |
| 3.24 | `WeeklyDigestProcessor`                | early-warning | `early-warning:weekly-digest`            |         cross-tenant          |    yes (daily, filtered)    |
| 3.25 | `BehaviourParentNotificationProcessor` | behaviour     | `behaviour:parent-notification`          |              yes              |             no              |
| 3.26 | `BehaviourCronDispatchProcessor`       | behaviour     | `behaviour:cron-dispatch-daily           |              sla              |          monthly`           | cross-tenant | yes |

| #   | What to Check                                                                                                                                  | Expected                 | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------- |
| 3.A | All 26 processor classes present in the matrix above match `grep -rn "class .*Processor extends WorkerHost" apps/worker/src`.                  | Match exactly.           |           |
| 3.B | Every tenant-aware processor either extends `TenantAwareJob` OR explicitly sets `SET LOCAL app.current_tenant_id` at the start of its DB work. | Confirmed per processor. |           |

---

## 4. `pastoral:notify-concern`

**Payload:** `{concern_id, severity, student_id, student_name, category, logged_by_user_id}` + `tenant_id`.

### 4.1 Happy path — routine severity

| #     | What to run                                                                                                                             | Expected                                                    | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| 4.1.1 | Seed a pastoral_concern `severity=low`. `enqueue('pastoral', 'pastoral:notify-concern', {tenant_id, concern_id, severity: 'low', ...})` | Job transitions waiting→active→completed ≤ 5s.              |           |
| 4.1.2 | DB side-effects: 1 `notifications` row with kind=`pastoral_concern_logged`, channel=`in_app`.                                           | 1 row.                                                      |           |
| 4.1.3 | `pastoral_events` has one row with `event_type='concern_logged'`.                                                                       | 1 row.                                                      |           |
| 4.1.4 | NO downstream `escalation-timeout` or `compute-student` jobs enqueued.                                                                  | waiting+active+delayed on `pastoral` queue = 0 after drain. |           |

### 4.2 Elevated severity (urgent)

| #     | What to run                                                                                                                                  | Expected                                                                                  | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| 4.2.1 | Severity=urgent. Same payload structure.                                                                                                     | Job completes. Notifications row fan-out: in_app + email queued to `notifications` queue. |           |
| 4.2.2 | A `pastoral:escalation-timeout` job enqueued with `delay=120 * 60 * 1000` ms, payload `{concern_id, escalation_type: 'urgent_to_critical'}`. | Delayed job visible in `queueState('pastoral').delayed` with ts = now + 120 min ± 5s.     |           |
| 4.2.3 | DB `pastoral_concerns.acknowledged_at` initially null.                                                                                       | null.                                                                                     |           |

### 4.3 Critical severity

| #     | What to run                                                                                                                                  | Expected                                                                                      | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------- |
| 4.3.1 | Severity=critical. Notifications fan-out: in_app + email + whatsapp.                                                                         | 3 entries queued.                                                                             |           |
| 4.3.2 | `pastoral:escalation-timeout` enqueued with `delay=30 * 60 * 1000` (30 min), `escalation_type='critical_second_round'`.                      | Delayed visible.                                                                              |           |
| 4.3.3 | `early-warning:compute-student` enqueued on `early-warning` queue with payload `{tenant_id, student_id, trigger_event: 'critical_concern'}`. | Job enqueued. After drain, `student_risk_profiles.current_tier` for this student re-computed. |           |

### 4.4 Idempotency guard

| #     | What to run                                                                                                                                                                                | Expected                                              | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | --------- |
| 4.4.1 | Enqueue twice with the same `concern_id`. Processor reads the concern's current severity before dispatching — if the severity changed (e.g. resolved), the second run skips notifications. | No duplicate notification; one `pastoral_events` row. |           |
| 4.4.2 | Concern deleted mid-flight — processor handles `CONCERN_NOT_FOUND` gracefully, logs warning, does not retry forever.                                                                       | Job ends `completed` (not `failed`); no retry storm.  |           |

### 4.5 Negative — missing tenant_id

| #     | What to run                                                                            | Expected                                                                                                      | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| 4.5.1 | `enqueue('pastoral', 'pastoral:notify-concern', {concern_id: X})` with no `tenant_id`. | Job rejected at enqueue OR first attempt throws `MISSING_TENANT_ID`; fails all 3 attempts; ends on fail list. |           |
| 4.5.2 | Payload `tenant_id` not a valid UUID — same.                                           | Fails; no DB writes.                                                                                          |           |

---

## 5. `pastoral:escalation-timeout` (delayed-chain)

### 5.1 Urgent → Critical timeout

| #     | What to run                                                                                                                                         | Expected         | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------- |
| 5.1.1 | After §4.2.2 enqueue and advancing time by 120 min (fake timer) or waiting the real 120 min, the delayed job becomes active.                        | Job executes.    |           |
| 5.1.2 | Processor checks `acknowledged_at`. If still null, **escalates severity** from urgent to critical. Updates `pastoral_concerns.severity='critical'`. | DB update.       |           |
| 5.1.3 | `pastoral_events` row `concern_auto_escalated`.                                                                                                     | 1 row.           |           |
| 5.1.4 | Follow-up `pastoral:escalation-timeout` enqueued with `delay=30min`, `escalation_type=critical_second_round`.                                       | Delayed visible. |           |
| 5.1.5 | If `acknowledged_at` is NOT null (admin acknowledged in time), processor terminates the chain. No severity update.                                  | No update.       |           |

### 5.2 Critical second-round

| #     | What to run                                                                                                                                                 | Expected                 | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------- |
| 5.2.1 | After 30 min delay, second-round job fires. If still unacknowledged, creates `critical_concern_unacknowledged` pastoral_events row + re-notifies principal. | Audit + notification.    |           |
| 5.2.2 | Chain terminates here (no further re-enqueue).                                                                                                              | No further delayed jobs. |           |

### 5.3 Chain termination on acknowledgement

| #     | What to run                                                                                                                                                    | Expected                                                      | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------- |
| 5.3.1 | Admin acknowledges the concern between first and second timeout. The second-round processor, on activation, sees `acknowledged_at != null` and short-circuits. | No re-escalation. Audit row `concern_acknowledged_in_window`. |           |

---

## 6. `pastoral:checkin-alert`

**Payload:** `{student_id, checkin_id, flag_reason, monitoring_owner_user_ids[]}` + `tenant_id`.

| #   | What to run                                                                                                      | Expected                                  | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------- |
| 6.1 | Student submits a flagged check-in. Enqueue fires automatically (see chain §30.6).                               | Alert log per `monitoring_owner_user_id`. |           |
| 6.2 | Student's checkin deleted before the processor runs. Processor handles gracefully, logs warning, ends completed. | No failure.                               |           |
| 6.3 | Empty `monitoring_owner_user_ids` — processor ends with log "No monitoring owners configured"; no notifications. | Clean end.                                |           |
| 6.4 | Cross-tenant payload (student from tenant B, monitoring owners from tenant A) — fails validation; no writes.     | Fail gracefully.                          |           |

---

## 7. `pastoral:wellbeing-flag-expiry` (cron)

**Schedule:** daily 04:00 UTC (or per cron registration). Cross-tenant iteration.

| #   | What to run                                                                                                                                           | Expected       | Pass/Fail |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------- |
| 7.1 | Seed: 3 `critical_incident_affected` rows with `wellbeing_flag_active=true`, 2 past `wellbeing_flag_expires_at`, 1 future.                            | Seed ready.    |           |
| 7.2 | Fire cron manually via `enqueue('pastoral', 'pastoral:wellbeing-flag-expiry', {tenant_id: <A>})`.                                                     | Job completes. |           |
| 7.3 | DB: 2 past-expiry rows flipped `wellbeing_flag_active=false`. 1 future row unchanged.                                                                 | Correct.       |           |
| 7.4 | `pastoral_events` has 2 new rows `wellbeing_flag_expired`.                                                                                            | 2 rows.        |           |
| 7.5 | Idempotency — re-run same tenant. 0 additional expiries (already flipped).                                                                            | No-op.         |           |
| 7.6 | Cron registration — `CronSchedulerService` has an entry with `jobId='cron:pastoral:wellbeing-flag-expiry'` and removeOnComplete/removeOnFail bounded. | Registered.    |           |

---

## 8. `pastoral:overdue-actions` (cron)

**Payload (per-tenant):** `{tenant_id}`. Triggered hourly via dispatcher.

| #   | What to run                                                                                                                                                            | Expected                         | Pass/Fail |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------- |
| 8.1 | Seed: 3 `sst_meeting_actions` + 2 `pastoral_intervention_actions` with due_date < now and status ∈ {pc_pending, in_progress}.                                          | Seed ready.                      |           |
| 8.2 | Enqueue. Processor flips both sets to `pc_overdue`; creates `pastoral_events` rows with `event_type='action_overdue'`.                                                 | 5 status updates + 5 audit rows. |           |
| 8.3 | Re-run hourly — idempotent. No duplicate events for the same action already overdue.                                                                                   | No duplicates.                   |           |
| 8.4 | Actions already completed are skipped.                                                                                                                                 | Skipped.                         |           |
| 8.5 | Cross-tenant: payload `{tenant_id: <A>}` does NOT affect tenant B actions. Assert via `sql("SELECT COUNT(*) FROM sst_meeting_actions WHERE tenant_id=<B>")` unchanged. | Tenant isolation.                |           |

---

## 9. `pastoral:intervention-review-reminder`

**Payload:** `{intervention_id, case_id, student_id, next_review_date}` + `tenant_id`.

| #   | What to run                                                                                             | Expected                       | Pass/Fail |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------ | --------- |
| 9.1 | Seed intervention with `next_review_date = today + 3 days`. Enqueue manually.                           | Reminder notification created. |           |
| 9.2 | Processor re-reads `intervention.next_review_date` from DB and skips if date has changed since enqueue. | Skipped correctly.             |           |
| 9.3 | Intervention status now `pc_completed` or `pc_ceased` — skipped with log.                               | Skipped.                       |           |
| 9.4 | Missing intervention — processor ends completed with warning, no retry.                                 | Clean.                         |           |

---

## 10. `pastoral:sync-behaviour-safeguarding` (chain)

**Payload:** `{safeguarding_concern_id}` + `tenant_id`.

| #    | What to run                                                                                                                                                     | Expected                       | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------- |
| 10.1 | Create a safeguarding_concern (via API or direct enqueue test). `converts_to_safeguarding=true` on the originating behaviour_category so this job was enqueued. | Job completes.                 |           |
| 10.2 | Creates `pastoral_concern` row + `pastoral_concern_version` row + `cp_record` row. All linked to the safeguarding concern.                                      | All 3 rows created.            |           |
| 10.3 | Updates `safeguarding_concerns.pastoral_concern_id` with the new pastoral concern id.                                                                           | FK set.                        |           |
| 10.4 | `pastoral_events` rows for `concern_created` and `sync_completed`.                                                                                              | 2 audit rows.                  |           |
| 10.5 | Re-enqueue with same `safeguarding_concern_id` — idempotent (checks `pastoral_concern_id` on the safeguarding concern; already set → skip).                     | No duplicate pastoral concern. |           |
| 10.6 | Cross-tenant: safeguarding_concern_id from tenant B enqueued with tenant A payload — validation fails; no writes.                                               | Isolation.                     |           |
| 10.7 | Transaction atomicity — the 3 inserts + 1 update run in a single `createRlsClient().$transaction()`. Mid-tx failure rolls back.                                 | Atomic.                        |           |

---

## 11. `pastoral:precompute-agenda`

**Payload:** `{meeting_id}` + `tenant_id`.

| #    | What to run                                                                                                                                                     | Expected                                                          | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 11.1 | Seed SST meeting without agenda. Enqueue. Processor queries 6 sources: new concerns, case reviews, overdue actions, early warnings, NEPS, intervention reviews. | `sst_meeting_agenda_items` rows created for each relevant source. |           |
| 11.2 | `sst_meetings.agenda_precomputed_at` updated.                                                                                                                   | Timestamp set.                                                    |           |
| 11.3 | Re-enqueue within 5-min idempotency window — short-circuits (checks `agenda_precomputed_at`).                                                                   | No additional items.                                              |           |
| 11.4 | Re-enqueue after 5 min — fresh run; replaces items (soft-delete old, create new with current display_order).                                                    | Fresh items.                                                      |           |
| 11.5 | Meeting status=cancelled — processor skips; no agenda items.                                                                                                    | Skipped.                                                          |           |
| 11.6 | AI-flag gate for refresh: `POST /v1/pastoral/sst/meetings/:id/agenda/refresh` with pastoral AI flag OFF → 403 at API; worker not invoked.                       | 403.                                                              |           |

---

## 12. `pastoral:cron-dispatch-overdue` (dispatcher)

**Schedule:** `0 * * * *` (hourly, cross-tenant).

| #    | What to run                                                                                                                                              | Expected                                           | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------- |
| 12.1 | Cron fires. Processor enumerates active tenants (`SELECT id FROM tenants WHERE status='active'`) and enqueues one `pastoral:overdue-actions` per tenant. | N active tenants → N new jobs on `pastoral` queue. |           |
| 12.2 | Inactive tenant skipped.                                                                                                                                 | Skipped.                                           |           |
| 12.3 | Dispatcher failure — a single tenant's enqueue throws. Processor continues with others; the failure is logged.                                           | Resilient fan-out.                                 |           |
| 12.4 | removeOnComplete/removeOnFail bounded.                                                                                                                   | Bounded.                                           |           |

---

## 13. `safeguarding:critical-escalation` (chain)

**Payload:** `{concern_id, escalation_step}` + `tenant_id`.

| #    | What to run                                                                                                                                              | Expected            | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| 13.1 | Enqueue step=0. Processor creates `safeguarding_actions` row (note_added) + in-app + email notifications for the current escalation tier's contact list. | Rows created.       |           |
| 13.2 | Enqueue follow-up with `escalation_step=1` and `delay=30*60*1000` ms.                                                                                    | Delayed job.        |           |
| 13.3 | Chain continues step=2, 3, ... until exhausted per the tenant's escalation settings chain length.                                                        | Chain exhausts.     |           |
| 13.4 | If `concern.status` transitions out of `reported` (i.e. assigned / under_review / referred), chain terminates — subsequent steps short-circuit.          | Chain ends cleanly. |           |
| 13.5 | Idempotent — re-enqueue same step + same concern — no duplicate actions or notifications.                                                                | Idempotent.         |           |

---

## 14. `safeguarding:sla-check`

**Payload:** `{tenant_id}`. Dispatched every 5 min by `behaviour:cron-dispatch-sla`.

| #    | What to run                                                                                                                       | Expected              | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------- |
| 14.1 | Seed: 1 concern with `sla_first_response_due=now()-1h` and no `sla_first_response_met_at`.                                        | Seed ready.           |           |
| 14.2 | Enqueue. Processor creates `behaviour_tasks` row `type=sla_breach_followup`, `priority=high`, assigned_to=concern.assigned_to_id. | Task created.         |           |
| 14.3 | Creates in-app + email notifications to assignee.                                                                                 | Notifications.        |           |
| 14.4 | Idempotency — if a breach task already exists for this concern, processor skips (no duplicate).                                   | No duplicate.         |           |
| 14.5 | Concern transitioned to `resolved` before SLA check runs — processor short-circuits.                                              | No task for resolved. |           |
| 14.6 | Cross-tenant SLA — tenant A's task not created for tenant B concerns even if the dispatch were miswired (guard in processor).     | Isolation.            |           |

---

## 15. `behaviour:break-glass-expiry` (cron)

Dispatched daily via `behaviour:cron-dispatch-daily`.

| #    | What to run                                                                                                                            | Expected       | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------- |
| 15.1 | Seed: 2 `safeguarding_break_glass_grants` with `expires_at < now()` and `revoked_at IS NULL`, 1 still valid.                           | Seed ready.    |           |
| 15.2 | Enqueue. Processor sets `revoked_at=now()` on 2 expired grants via atomic `updateMany({where: {expires_at < now, revoked_at: null}})`. | 2 updates.     |           |
| 15.3 | Creates `behaviour_tasks` rows `type=break_glass_review` for each revoked grant.                                                       | 2 tasks.       |           |
| 15.4 | Creates notifications for reviewers.                                                                                                   | Notifications. |           |
| 15.5 | Re-run immediately — atomic check (`revoked_at IS NULL`) ensures no duplicate tasks.                                                   | Idempotent.    |           |

---

## 16. `safeguarding:attachment-scan`

**Payload:** `{concern_id}` + `tenant_id`. Enqueued on attachment upload.

| #    | What to run                                                                                                    | Expected               | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---------------------- | --------- |
| 16.1 | Attachment uploaded. Status=pending_scan. Enqueue fires. Processor calls ClamAV stub (HTTP POST `/scan`).      | ClamAV stub called.    |           |
| 16.2 | Clean result — processor flips scan_status=clean on the attachment. Creates `safeguarding_actions` audit row.  | Status updated.        |           |
| 16.3 | Infected result — scan_status=flagged. Concern updated: `virus_detected=true`, `encrypted` flag if applicable. | Flagged correctly.     |           |
| 16.4 | ClamAV unreachable — job fails with transient error; retry backoff 5s → 10s → 20s → dead-letter on 3rd fail.   | Retry + DLQ behaviour. |           |
| 16.5 | Idempotency — attachment already scanned (`scan_status != pending_scan`), processor skips.                     | Skipped.               |           |
| 16.6 | Large file (50MB) — scan timeout 120s; if exceeded, fails + retries. Document timeout behaviour.               | Timeout handled.       |           |

---

## 17. `safeguarding:message-scan`

**Payload:** `{message_id, sender_id, content}` + `tenant_id`. Enqueued when an inbox message is sent.

| #    | What to run                                                                                                             | Expected                                   | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------- | --- |
| 17.1 | Message with keyword hit (`safeguarding_keywords.active=true`). Processor creates safeguarding_concern + flags message. | Concern created. `breach_detected_at` set. |           |
| 17.2 | Message without matching keyword — no concern created; message `moderation_status=clean`.                               | Clean.                                     |           |
| 17.3 | Processor invokes optional Slack webhook if configured (test stub).                                                     | Webhook called / skipped per config.       |           |
| 17.4 | Idempotency — `message.moderation_status=clean                                                                          | flagged` already set → skip.               | Skipped.  |     |
| 17.5 | Inactive keyword hit — no concern.                                                                                      | No concern.                                |           |

---

## 18. `safeguarding:notify-reviewers`

**Payload:** `{concern_id}` + `tenant_id`.

| #    | What to run                                                                                | Expected                                                      | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | --------- |
| 18.1 | Seed safeguarding_concern needing review. Enqueue.                                         | Notifications created for each reviewer from tenant settings. |           |
| 18.2 | No reviewers configured — log warning, no notifications.                                   | Clean end.                                                    |           |
| 18.3 | Downstream `dispatch-notifications` jobs enqueued on `notifications` queue for email side. | Queue populated.                                              |           |

---

## 19. `wellbeing:survey-open-notify`

**Payload:** `{survey_id}` + `tenant_id`.

| #    | What to run                                                                                                 | Expected                                                 | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------- |
| 19.1 | Activate survey → enqueues this job. Processor creates in-app notifications for every active tenant member. | Count of `notifications` rows = count of active members. |           |
| 19.2 | No active members (fresh tenant) — no notifications; log warning.                                           | Clean.                                                   |           |
| 19.3 | Re-enqueue — idempotency via `survey.id + user_id` dedup (or `notifications.dedup_key`).                    | No duplicates.                                           |           |
| 19.4 | Cross-tenant isolation — tenant A activate doesn't notify tenant B members.                                 | Isolation.                                               |           |

---

## 20. `wellbeing:eap-refresh-check` (cron, daily 06:00 UTC)

Cross-tenant iteration.

| #    | What to run                                                                                                                 | Expected                          | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------- |
| 20.1 | Seed: tenant A has EAP config > 90 days old; tenant B has fresh config.                                                     | Seed ready.                       |           |
| 20.2 | Cron fires. Processor notifies managers (users with `wellbeing.manage_resources`) in tenant A.                              | Notifications created for A only. |           |
| 20.3 | Tenant B unaffected.                                                                                                        | No notifications in B.            |           |
| 20.4 | Observation flagged in admin spec §O-2 — tenants with no EAP configured still emit warning logs. Confirm current behaviour. | Documented.                       |           |

---

## 21. `wellbeing:moderation-scan`

**Payload:** `{survey_id, response_id}` (no tenant_id — survey_responses are anonymous).

| #    | What to run                                                                                                          | Expected                                                            | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| 21.1 | Submit response with identifying content (staff name, room code, subject code). Enqueue fires (from service or API). | `survey_responses.moderation_status='flagged'` after job completes. |           |
| 21.2 | Clean response — moderation_status=approved.                                                                         | Approved.                                                           |           |
| 21.3 | Idempotency — re-scan a response already scanned → skip.                                                             | Skipped.                                                            |           |
| 21.4 | Regex patterns configurable in env / DB. Adjust and verify false-positive reduction.                                 | Patterns honoured.                                                  |           |
| 21.5 | Anonymity preserved — no response content logged in worker output (just the response id + verdict).                  | Log sanitised.                                                      |           |

---

## 22. `wellbeing:survey-closing-reminder` (cron, daily 08:00 UTC)

| #    | What to run                                                                                                  | Expected       | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------ | -------------- | --------- |
| 22.1 | Seed active survey closing in 22h. Cron fires. Notifications created for members who have not yet responded. | Notifications. |           |
| 22.2 | Survey closing > 24h — skipped.                                                                              | Skipped.       |           |
| 22.3 | Already-responded members — skipped.                                                                         | Skipped.       |           |

---

## 23. `wellbeing:cleanup-participation-tokens` (cron, daily 05:00 UTC)

| #    | What to run                                                                | Expected    | Pass/Fail |
| ---- | -------------------------------------------------------------------------- | ----------- | --------- |
| 23.1 | Seed tokens for 2 surveys (A closed 10 days ago, B closed 5 days ago).     | Seed ready. |           |
| 23.2 | Cron fires. Tokens for survey A are deleted. Tokens for survey B retained. | Correct.    |           |
| 23.3 | No error on empty result set.                                              | Clean.      |           |

---

## 24. `wellbeing:workload-metrics` (cron, daily 03:30 UTC)

| #    | What to run                                                                                            | Expected                                     | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------- | --------- |
| 24.1 | Cron fires. Processor computes aggregate workload metrics per tenant and caches in Redis with 24h TTL. | Redis `wellbeing:workload:<tenant>` key set. |           |
| 24.2 | First API call `GET /v1/staff-wellbeing/aggregate-workload` hits cache (< 50ms).                       | Cache hit.                                   |           |
| 24.3 | Cache expires after 24h — next call recomputes.                                                        | Fresh compute.                               |           |
| 24.4 | Tenant without scheduling data — compute yields zero; cached.                                          | Handled.                                     |           |

---

## 25. `early-warning:compute-daily` (cron, daily 01:00 UTC)

Cross-tenant OR per-tenant triggered.

| #    | What to run                                                                                                                                    | Expected            | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| 25.1 | Cron fires cross-tenant. Processor iterates active tenants and computes `student_risk_profiles` for every student in the active academic year. | Profiles upserted.  |           |
| 25.2 | Large tenant (1000+ students) — runtime logged; batched if > 200 per chunk.                                                                    | Batched.            |           |
| 25.3 | `risk_signal_audit` / `student_risk_signals` rows created for any new signal.                                                                  | Audit rows present. |           |
| 25.4 | Academic year inactive — skipped.                                                                                                              | Skipped.            |           |
| 25.5 | Idempotent on same day for same tenant — upsert semantics.                                                                                     | No duplicate rows.  |           |

---

## 26. `early-warning:compute-student`

**Payload:** `{student_id, trigger_event}` + `tenant_id`. Triggered by `pastoral:notify-concern` on critical events.

| #    | What to run                                                                                               | Expected                              | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------- |
| 26.1 | Enqueue for a student. Processor recomputes `student_risk_profiles` for that student only; may flip tier. | Tier may change. Audit row if change. |           |
| 26.2 | Same trigger re-enqueued — idempotent via `trigger_event` dedup within a small window.                    | No duplicate audit entries.           |           |
| 26.3 | Tier unchanged — no DB write (skip upsert if no delta).                                                   | No-op.                                |           |

---

## 27. `early-warning:weekly-digest` (cron, daily 07:00 UTC, filter by digest_day)

| #    | What to run                                                                                                           | Expected              | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------- | --------------------- | --------- |
| 27.1 | Seed tenant with `digest_day=Monday`. Cron fires on Monday 07:00 UTC. Processor generates digest per at-risk student. | Digest notifications. |           |
| 27.2 | Same tenant on Tuesday — skipped.                                                                                     | Skipped.              |           |
| 27.3 | Tenant with no at-risk students — no notifications.                                                                   | No-op.                |           |

---

## 28. `behaviour:parent-notification`

**Payload:** `{incident_id, student_id, severity, incident_category}` + `tenant_id`.

| #    | What to run                                                                                                                                   | Expected                    | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------- |
| 28.1 | Incident with `requires_parent_notification=true` logged. Processor creates notification records per channel (email/SMS/in-app) per severity. | Notifications.              |           |
| 28.2 | Updates `behaviour_incidents.parent_notification_status` from `pending` → `sent` after enqueue.                                               | Status update.              |           |
| 28.3 | Creates `behaviour_entity_history` audit with `change_type=parent_notified`.                                                                  | Audit present.              |           |
| 28.4 | Enqueues downstream `communications:dispatch-notifications` for email/SMS delivery.                                                           | Downstream queue populated. |           |
| 28.5 | If parent_notification_status already `sent`, skip.                                                                                           | Idempotent.                 |           |
| 28.6 | Guardian restriction for this parent+student → skip notification to that parent, mark audit.                                                  | Correctly skipped.          |           |

---

## 29. `behaviour:cron-dispatch-{daily, sla, monthly}` (dispatchers)

| #    | What to run                                                                                                                                                                                                                             | Expected                  | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------- |
| 29.1 | `cron-dispatch-daily` (hourly) — dispatches per-tenant jobs: break-glass-expiry, detect-patterns, guardian-restriction-check at UTC times; suspension-return, task-reminders, ack-reminders, digest-notifications at tenant-local hour. | Per-tenant enqueues fire. |           |
| 29.2 | `cron-dispatch-sla` (every 5 min) — dispatches `safeguarding:sla-check` per tenant.                                                                                                                                                     | SLA per tenant.           |           |
| 29.3 | `cron-dispatch-monthly` (0 1 1 \* \*) — dispatches `behaviour:retention-check` per tenant.                                                                                                                                              | Monthly dispatches.       |           |
| 29.4 | Timezone-aware: a tenant configured with `Asia/Dubai` gets daily jobs at 20:00 UTC (= 00:00 local).                                                                                                                                     | Timezone respected.       |           |
| 29.5 | Dispatcher failure in one tenant — continues with others.                                                                                                                                                                               | Resilient.                |           |

---

## 30. Cross-module chain flows (end-to-end)

Each chain: seed entry point → trigger → assert final state after drain.

### 30.1 Behaviour incident → pastoral auto-concern → safeguarding sync

| #      | What to run                                                                                                           | Expected                                                                                       | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 30.1.1 | Create incident with category `auto_create_pastoral_concern=true`, `converts_to_safeguarding=true`. Full chain fires. | DB state: 1 behaviour_incident + 1 pastoral_concern + 1 safeguarding_concern + N audit events. |           |
| 30.1.2 | Drain all queues. `queueState` empties.                                                                               | All completed.                                                                                 |           |
| 30.1.3 | No cross-tenant leakage — all created rows tenant_id matches.                                                         | Correct.                                                                                       |           |

### 30.2 Critical concern → early warning compute → staff notify

| #      | What to run                                                                                                                                                   | Expected                   | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------- |
| 30.2.1 | Create pastoral_concern severity=critical. Chain: `pastoral:notify-concern` → `early-warning:compute-student` + `dispatch-notifications` (multiple channels). | Chain executes end-to-end. |           |
| 30.2.2 | Final: student_risk_profile tier may have flipped. Notifications (in_app + email) created. Optional whatsapp job enqueued.                                    | Final state correct.       |           |

### 30.3 Exclusion decision → document render → parent notification → acknowledgement

| #      | What to run                                                                                                                                                                     | Expected                                                          | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 30.3.1 | `POST /v1/behaviour/exclusion-cases/:id/finalise` triggers `pdf-rendering` job for decision letter → `behaviour:parent-notification` → `communications:dispatch-notifications`. | Document generated, parent notified, acknowledgement row created. |           |

### 30.4 Survey activate → member notifications → anonymous responses → moderation scan

| #      | What to run                                                                                                                          | Expected                                                                  | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------- |
| 30.4.1 | Activate survey → `wellbeing:survey-open-notify`. 3 members respond with flagged content → `wellbeing:moderation-scan` per response. | After drain: notifications sent, 3 responses `moderation_status=flagged`. |           |

### 30.5 Break-glass grant → access → expiry → review task

| #      | What to run                                                                                                                                                       | Expected         | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------- |
| 30.5.1 | Grant break-glass with 1h TTL. Granted user accesses the sealed concern → audit log. After 1h, `behaviour:break-glass-expiry` cron revokes + creates review task. | Full chain runs. |           |

### 30.6 Student check-in flag → alert → escalate → concern creation

| #      | What to run                                                                                                                                      | Expected         | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | --------- |
| 30.6.1 | Student submits flagged check-in → `pastoral:checkin-alert` → counsellor escalates → pastoral_concern created → `pastoral:notify-concern` chain. | Full chain runs. |           |

### 30.7 SLA breach → behaviour task → notification

| #      | What to run                                                                                                 | Expected    | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| 30.7.1 | Concern past SLA → `safeguarding:sla-check` (dispatched by 5-min cron) → `behaviour_tasks` + notifications. | Chain runs. |           |

### 30.8 Critical incident declared → affected flagged → wellbeing flag expiry → deactivation

| #      | What to run                                                                                                                                  | Expected    | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| 30.8.1 | Declare critical incident, add affected student with wellbeing_flag_active=true + expiry=+7d. After 7d cron runs → flag deactivated + audit. | Full chain. |           |

---

## 31. Retry + dead-letter policy

| #    | What to run                                                                                                                                                                   | Expected                   | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------- |
| 31.1 | All wellbeing queues use `attempts: 3, backoff: 5000ms exponential`.                                                                                                          | Confirmed in queue config. |           |
| 31.2 | Induce DB failure on `pastoral:notify-concern` first attempt (drop connection). Retry 1: 5s delay. Retry 2: 10s delay. Retry 3: 20s delay. If all fail, moves to failed list. | Correct retry cadence.     |           |
| 31.3 | Failed jobs retained per `removeOnFail`:                                                                                                                                      |

- pastoral: 500
- wellbeing: 500
- behaviour: 500
- early-warning: 500. | Retention bounded. | |
  | 31.4 | No explicit DLQ. Failed jobs monitored by `monitoring:dlq-monitor` (every 15 min) which alerts Sentry. | Monitor running. | |
  | 31.5 | `communications:retry-failed-notifications` (every 30s) polls failed notification rows and re-enqueues with backoff. | Retry backstop running. | |
  | 31.6 | Non-retryable errors — e.g. `MISSING_TENANT_ID`, `INVALID_UUID` — should fail all 3 attempts without waiting between them (mark as permanent failure). | Document current behaviour. | |
  | 31.7 | Dead-letter reprocessing — there is no manual replay UI yet; ops uses BullBoard to retry failed jobs manually. | Documented. | |

---

## 32. Idempotency patterns per processor

| Processor                              | Guard                                                                | Asserted in |
| -------------------------------------- | -------------------------------------------------------------------- | ----------- |
| `pastoral:notify-concern`              | Re-read severity from DB; skip if unchanged-since-enqueue            | §4.4        |
| `pastoral:escalation-timeout`          | Check `acknowledged_at`; skip if not null                            | §5.3        |
| `pastoral:sync-behaviour-safeguarding` | Check `safeguarding_concerns.pastoral_concern_id`; skip if set       | §10.5       |
| `pastoral:precompute-agenda`           | 5-min window on `agenda_precomputed_at`                              | §11.3       |
| `pastoral:overdue-actions`             | Status check before flipping                                         | §8.3        |
| `safeguarding:critical-escalation`     | Chain terminates when step ≥ chain-length                            | §13.4       |
| `safeguarding:sla-check`               | Skip if breach task already exists                                   | §14.4       |
| `behaviour:break-glass-expiry`         | Atomic `updateMany({where: {revoked_at: null, expires_at < now()}})` | §15.5       |
| `safeguarding:attachment-scan`         | Skip if `scan_status != pending_scan`                                | §16.5       |
| `safeguarding:message-scan`            | Skip if `moderation_status != pending`                               | §17.4       |
| `wellbeing:moderation-scan`            | Skip if `moderation_status != pending`                               | §21.3       |
| `wellbeing:survey-open-notify`         | `notifications.dedup_key=(survey_id, user_id)`                       | §19.3       |
| `early-warning:compute-student`        | No DB write if tier unchanged                                        | §26.3       |
| `behaviour:parent-notification`        | Skip if `parent_notification_status=sent`                            | §28.5       |

Each row is tested within the named section. Zero regression on idempotency is the blocker.

---

## 33. Tenant-aware payload enforcement

| #    | What to run                                                                                                                                                                                                                                                                                                                                                                                                      | Expected                           | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------- |
| 33.1 | Every tenant-aware processor rejects payloads without `tenant_id`. Test with each: `pastoral:notify-concern`, `escalation-timeout`, `checkin-alert`, `wellbeing-flag-expiry`, `overdue-actions`, `intervention-review-reminder`, `sync-behaviour-safeguarding`, `precompute-agenda`, `safeguarding:*`, `behaviour:break-glass-expiry`, `behaviour:parent-notification`, `survey-open-notify`, `compute-student`. | All reject (throw or mark failed). |           |
| 33.2 | Cross-tenant — processor payload `tenant_id=A`, referenced entity belongs to B. Processor validates and fails.                                                                                                                                                                                                                                                                                                   | Cross-tenant rejected.             |           |
| 33.3 | RLS session variable `app.current_tenant_id` is set inside every DB interaction. Processor's DB work executed inside `TenantAwareJob.execute()` which sets the session.                                                                                                                                                                                                                                          | Session isolation holds.           |           |
| 33.4 | Cross-tenant cron processors (`cron-dispatch-*`, `eap-refresh-check`, `survey-closing-reminder`, `cleanup-participation-tokens`, `workload-metrics`, `compute-daily`, `weekly-digest`, `cron-dispatch-overdue`) have empty payload and iterate tenants explicitly, setting RLS per iteration.                                                                                                                    | Explicit iteration per tenant.     |           |

---

## 34. Failure isolation (crash / stall / cross-tenant)

| #    | What to run                                                                                                                                                 | Expected          | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------- |
| 34.1 | Kill the worker process mid-job execution. The job becomes `stalled` after `stalledInterval`; BullMQ re-queues it (subject to `maxStalledCount=2`).         | Stalled recovery. |           |
| 34.2 | Worker OOM — job fails fast; restart recovers via BullMQ recovery.                                                                                          | Recovery.         |           |
| 34.3 | Tenant A job throws; does NOT affect Tenant B jobs in the same queue. Different job-level isolation.                                                        | Isolation.        |           |
| 34.4 | Circular chain guard — processor A enqueues B which enqueues A. Chain depth limit OR idempotency catches this. Test: synthetic loop → confirms termination. | No infinite loop. |           |
| 34.5 | Redis outage (5 min) — jobs queue at Redis; worker reconnects; jobs resume.                                                                                 | Resilient.        |           |

---

## 35. Observability + logging + DLQ monitor

| #    | What to run                                                                                                                   | Expected              | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------- |
| 35.1 | Every processor logs on start + finish at INFO level with `{jobId, name, tenant_id}`. Errors at ERROR level with stack trace. | Log shape consistent. |           |
| 35.2 | No secrets in logs (no PII from incident/concern descriptions; no student full names beyond what's necessary).                | Log hygiene.          |           |
| 35.3 | `monitoring:dlq-monitor` queries each queue's `failed` count every 15 min; alerts Sentry if > threshold (e.g. 10).            | Alert fires.          |           |
| 35.4 | BullBoard (dev) or CLI tooling accessible to ops.                                                                             | Accessible.           |           |
| 35.5 | Metrics: per-job duration histogram, per-queue waiting/active gauges via Prometheus or StatsD (if wired).                     | Metrics present.      |           |
| 35.6 | Processor CPU + memory baseline: no processor exceeds 500ms CPU time on p95 for small payloads.                               | Baseline documented.  |           |

---

## 36. WorkerModule registration + env

| #    | What to run                                                                                                                    | Expected                  | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | --------- |
| 36.1 | `apps/worker/src/worker.module.ts` providers array includes all 26 wellbeing processors (per inventory §3).                    | All present.              |           |
| 36.2 | `BullModule.registerQueue({name, defaultJobOptions})` entries for all 5 wellbeing queues.                                      | All registered.           |           |
| 36.3 | Worker env vars: `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `PLATFORM_DOMAIN`, `APP_URL`, + any AI key if wired.           | All required env present. |           |
| 36.4 | Cron registrations (§7, §12, §15, §20, §22, §23, §24, §25, §27, §29) are all present in `CronSchedulerService.onModuleInit()`. | All 10 crons registered.  |           |
| 36.5 | On worker boot, `pm2 logs worker` (prod) should confirm all 26 processors registered + 10 cron jobs scheduled.                 | Boot output correct.      |           |

---

## 37. Sign-off

| Reviewer | Date | Pass / Fail | Notes |
| -------- | ---- | ----------- | ----- |
|          |      |             |       |
|          |      |             |       |
|          |      |             |       |

**Total rows in this spec: ~180 across 37 sections. Coverage: 18 processors × retry + idempotency + tenant-aware + chain tests.**

**Known gaps / out of scope (documented):**

- Manual replay UI for failed jobs is not implemented; ops uses BullBoard.
- Dedicated `safeguarding_break_glass_access_log` table is projected from `safeguarding_actions` (PLAN §8).
- `admin_repair_runs` dedicated table — DZ-Wellbeing-8 — uses BullMQ job IDs as an ersatz tracking mechanism.
- Email/SMS/WhatsApp provider adapters are stubbed (`PROVIDER_NOT_WIRED`) per PLAN §8.
