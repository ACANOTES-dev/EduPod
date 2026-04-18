# Attendance Module — Worker / Background Job Test Specification

**Module:** Attendance (BullMQ queue + processors + cron schedulers + side-effect chains).
**Surface:** `attendance` queue, 5 per-tenant processors, 1 dispatcher, 4 cron-dispatch fan-outs, retry policies, dead-letter, cross-tenant payloads, tenant isolation in processors, early-warning fan-out, parent-notification enqueueing.
**Execution target:** Jest + `@nestjs/testing` with a real Redis + Postgres instance. Workers started via `apps/worker` test harness.
**Last Updated:** 2026-04-18

---

## Table of Contents

1. [Prerequisites & Harness](#1-prerequisites--harness)
2. [Queue Inventory](#2-queue-inventory)
3. [Processor Inventory](#3-processor-inventory)
4. [Cron Inventory](#4-cron-inventory)
5. [Dispatcher Pattern — `AttendanceQueueDispatcher`](#5-dispatcher-pattern--attendancequeuedispatcher)
6. [Session Generation (`attendance:generate-sessions`)](#6-session-generation-attendancegenerate-sessions)
7. [Auto-Lock (`attendance:auto-lock`)](#7-auto-lock-attendanceauto-lock)
8. [Pattern Detection (`attendance:detect-patterns`)](#8-pattern-detection-attendancedetect-patterns)
9. [Pending Detection (`attendance:detect-pending`)](#9-pending-detection-attendancedetect-pending)
10. [Cron Dispatch — Generate / Lock / Patterns / Pending](#10-cron-dispatch--generate--lock--patterns--pending)
11. [Parent Notification Side-Effect Chain](#11-parent-notification-side-effect-chain)
12. [Early-Warning Fan-Out](#12-early-warning-fan-out)
13. [Tenant-Aware Payload Enforcement](#13-tenant-aware-payload-enforcement)
14. [Retry Policy & Exponential Backoff](#14-retry-policy--exponential-backoff)
15. [Dead-Letter Queue](#15-dead-letter-queue)
16. [Lock Duration & Long-Running Jobs](#16-lock-duration--long-running-jobs)
17. [Idempotency & Replay Safety](#17-idempotency--replay-safety)
18. [Concurrency Across Workers](#18-concurrency-across-workers)
19. [Cron Deduplication](#19-cron-deduplication)
20. [Queue Observability](#20-queue-observability)
21. [Negative Scenarios](#21-negative-scenarios)
22. [Data Invariants After Job Completion](#22-data-invariants-after-job-completion)
23. [Regression Guards (Processor-Race Fix 5efed767)](#23-regression-guards-processor-race-fix-5efed767)
24. [Observations](#24-observations)
25. [Sign-Off](#25-sign-off)

---

## 1. Prerequisites & Harness

| Item           | Spec                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Redis          | 7+, empty. Connection URL in `REDIS_URL`.                                                                                             |
| Postgres       | 15+, migrated + seeded (two tenants — Tenant A active, Tenant B active).                                                              |
| BullMQ         | v5.x. `lockDuration`, `stalledInterval`, `maxStalledCount` settings as per dispatcher.                                                |
| Clock          | `jest.useFakeTimers('modern')` for cron schedule assertions. Real clock for queue timings.                                            |
| Test framework | Jest + `@nestjs/testing`. Spin `WorkerModule` in isolated test module. Enqueue via `Queue.add`; await via `Worker.waitUntilFinished`. |
| Two tenants    | A + B seeded with distinct students, classes, schedules, enrolments, tenant settings.                                                 |
| Auditing       | `jest.spyOn(ProcessorLogger, 'log')` to assert log messages. Spy on downstream queue `.add()` for chain assertions.                   |

---

## 2. Queue Inventory

Only TWO queues are directly relevant to the attendance module:

- **`attendance`** — `QUEUE_NAMES.ATTENDANCE`. All 5 per-tenant processors + the dispatcher subscribe here. All 4 cron-dispatch job names also fire on this queue.
- **`notifications`** — Parent absence notifications are enqueued here by `AttendanceParentNotificationService` during record saves. The processor lives in the communications module (out of scope for this spec except as a side-effect assertion).

One dependent queue:

- **`early-warning`** — `QUEUE_NAMES.EARLY_WARNING`. Pattern detection enqueues `early-warning:compute-student` jobs here when excessive-absence thresholds trip.

---

## 3. Processor Inventory

| #   | Class                                  | Job name constant                  | File                                                        | Purpose                                                                                                                                                    |
| --- | -------------------------------------- | ---------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | `AttendanceQueueDispatcher`            | n/a — routes by `job.name`         | `apps/worker/src/processors/attendance-queue-dispatcher.ts` | Sole `@Processor(QUEUE_NAMES.ATTENDANCE)` on the queue. Dispatches to the 5 processors below by switch-on-name. Throws on unknown job names.               |
| 3.2 | `AttendanceSessionGenerationProcessor` | `ATTENDANCE_GENERATE_SESSIONS_JOB` | `attendance-session-generation.processor.ts`                | Generates sessions for a tenant on a given date. Per-period OR daily capture mode. Applies school closure + AY gating. Honours `default_present`.          |
| 3.3 | `AttendanceAutoLockProcessor`          | `ATTENDANCE_AUTO_LOCK_JOB`         | `attendance-auto-lock.processor.ts`                         | Auto-locks submitted sessions past the tenant's `autoLockAfterDays` cutoff.                                                                                |
| 3.4 | `AttendancePatternDetectionProcessor`  | `ATTENDANCE_DETECT_PATTERNS_JOB`   | `attendance-pattern-detection.processor.ts`                 | Detects excessive absences, recurring-day patterns, chronic tardiness. Creates pattern alerts. Fans out early-warning jobs for excessive-absence students. |
| 3.5 | `AttendancePendingDetectionProcessor`  | `ATTENDANCE_DETECT_PENDING_JOB`    | `attendance-pending-detection.processor.ts`                 | Counts pending (open) sessions for a date. Logs count. Future: cache to Redis.                                                                             |
| 3.6 | `AttendanceCronDispatchProcessor`      | 4 names (see §10)                  | `attendance-cron-dispatch.processor.ts`                     | Cross-tenant fan-out. Cron runs with empty payload; dispatcher iterates active tenants and enqueues per-tenant jobs.                                       |

All 5 processors (3.2 – 3.6) are **plain `@Injectable()` services**, not `WorkerHost` subclasses. The single `@Processor` decorator lives on the dispatcher (3.1).

---

## 4. Cron Inventory

Registered in `CronSchedulerService.onModuleInit`. `jobId`: `cron:${JOB_CONSTANT}`. Retention: `removeOnComplete: 10`, `removeOnFail: 50`. All 4 crons run cross-tenant with empty payloads.

| #   | Cron job constant                       | Cron expression (UTC) | Purpose                                                       |
| --- | --------------------------------------- | --------------------- | ------------------------------------------------------------- |
| 4.1 | `ATTENDANCE_CRON_DISPATCH_GENERATE_JOB` | `30 4 * * *` (04:30)  | Fan out `attendance:generate-sessions` to all active tenants. |
| 4.2 | `ATTENDANCE_CRON_DISPATCH_PATTERNS_JOB` | `30 2 * * *` (02:30)  | Fan out `attendance:detect-patterns` to all active tenants.   |
| 4.3 | `ATTENDANCE_CRON_DISPATCH_PENDING_JOB`  | `0 18 * * *` (18:00)  | Fan out `attendance:detect-pending` to all active tenants.    |
| 4.4 | `ATTENDANCE_CRON_DISPATCH_LOCK_JOB`     | `0 23 * * *` (23:00)  | Fan out `attendance:auto-lock` to all active tenants.         |

Timing rationale:

- Generate at 04:30 UTC so sessions are ready before school hours start (≥ 1h buffer before 06:00 UTC school open for the earliest timezone).
- Patterns at 02:30 UTC — off-hours, before generate, so today's patterns are ready when dashboards load.
- Pending at 18:00 UTC — end-of-school-day reminder (roughly).
- Auto-lock at 23:00 UTC — after all school days conclude.

---

## 5. Dispatcher Pattern — `AttendanceQueueDispatcher`

**Why this exists:** before commit `5efed767`, five processors each declared `@Processor(QUEUE_NAMES.ATTENDANCE)` and used a `if (job.name !== X) return;` guard. BullMQ workers competitively consume jobs; the guard silently dropped mismatched jobs. Result: only ~1 in 5 enqueues ran the correct processor.

The dispatcher is now the single `@Processor(QUEUE_NAMES.ATTENDANCE)` owner. It routes by `switch (job.name)`.

| #    | Test                                                                                            | Expected                                                                                                          | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1  | Enqueue `ATTENDANCE_GENERATE_SESSIONS_JOB` with valid payload                                   | Dispatcher calls `sessionGeneration.process(job)`. Other processors not called.                                   |           |
| 5.2  | Enqueue `ATTENDANCE_AUTO_LOCK_JOB`                                                              | Dispatcher calls `autoLock.process(job)`.                                                                         |           |
| 5.3  | Enqueue `ATTENDANCE_DETECT_PATTERNS_JOB`                                                        | Dispatcher calls `patternDetection.process(job)`.                                                                 |           |
| 5.4  | Enqueue `ATTENDANCE_DETECT_PENDING_JOB`                                                         | Dispatcher calls `pendingDetection.process(job)`.                                                                 |           |
| 5.5  | Enqueue each of the 4 `ATTENDANCE_CRON_DISPATCH_*_JOB` names                                    | Dispatcher calls `cronDispatch.process(job)`.                                                                     |           |
| 5.6  | Enqueue a job with an unknown name like `attendance:foo`                                        | Dispatcher throws: `No handler registered for attendance job "attendance:foo"`. Job fails; retries as configured. |           |
| 5.7  | 20 enqueues of `ATTENDANCE_GENERATE_SESSIONS_JOB`                                               | **ALL 20** hit `sessionGeneration.process`. No silent drops. (Regression guard for the race fix.)                 |           |
| 5.8  | Only ONE `@Processor(QUEUE_NAMES.ATTENDANCE)` decorator in the codebase                         | Grep: `grep -r '@Processor(QUEUE_NAMES.ATTENDANCE)'` returns exactly 1 match (the dispatcher file).               |           |
| 5.9  | Dispatcher options: `lockDuration: 3 * 60_000`, `stalledInterval: 60_000`, `maxStalledCount: 2` | Match constructor options in the decorator.                                                                       |           |
| 5.10 | Dispatcher is the only class on the queue that extends `WorkerHost`                             | Other 5 processor classes are plain `@Injectable()` services (no `extends WorkerHost`).                           |           |

---

## 6. Session Generation (`attendance:generate-sessions`)

Payload: `{ tenant_id: UUID, date: 'YYYY-MM-DD' }`.

| #    | Scenario                                                                   | Expected                                                                                                                                                                             | Pass/Fail |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 6.1  | Per-period mode, day has 8 schedules for active classes, no closure        | 8 `AttendanceSession` rows created with status=open. `teacher_staff_id` taken from schedule. `schedule_id` persisted.                                                                |           |
| 6.2  | Per-period mode, closure with `affects_scope=all` on that date             | 0 sessions created. Log "Generated 0 sessions for tenant X on Y".                                                                                                                    |           |
| 6.3  | Per-period mode, closure on year_group match for 2 classes                 | Sessions for the other classes generated; 2 skipped.                                                                                                                                 |           |
| 6.4  | Per-period mode, closure on a single class                                 | That class's sessions skipped. Others generated.                                                                                                                                     |           |
| 6.5  | Daily mode (`captureMode=daily`)                                           | One session per active class for that date, with `schedule_id=null`, `teacher_staff_id = class.homeroom_teacher_staff_id`. Non-timetabled classes included.                          |           |
| 6.6  | Default-present ON                                                         | Session created; `default_present=true`; for every active enrolment, one AttendanceRecord `status=present` inserted with `marked_by_user_id='00000000-0000-0000-0000-000000000000'`. |           |
| 6.7  | Default-present OFF                                                        | Session created with `default_present=null` (or false). No pre-populated records.                                                                                                    |           |
| 6.8  | Target date outside academic year                                          | Skip that class. Log via "Skip: outside academic year" OR just skipped silently.                                                                                                     |           |
| 6.9  | Class with `status != 'active'`                                            | Skipped.                                                                                                                                                                             |           |
| 6.10 | Duplicate session (already created for class+date)                         | P2002 unique violation silently caught. Loop continues with next schedule.                                                                                                           |           |
| 6.11 | Schedule with `effective_end_date` before target date                      | Not matched in query. Skipped.                                                                                                                                                       |           |
| 6.12 | Weekday convention                                                         | Uses `targetDate.getDay()` (0=Sunday...6=Saturday). Matches seed data and `substitution.service.ts`. Regression-guarded by commit `b3f1c416`.                                        |           |
| 6.13 | Missing `tenant_id` in payload                                             | Processor throws `Job rejected: missing tenant_id in payload.`. Job fails.                                                                                                           |           |
| 6.14 | Tenant_id references non-existent tenant                                   | `TenantAwareJob` sets RLS context; subsequent queries return empty sets. Log "Generated 0 sessions".                                                                                 |           |
| 6.15 | 100 classes × 8 schedules = 800 potential sessions                         | All generated in < 30s. Memory stable.                                                                                                                                               |           |
| 6.16 | Tenant_id for Tenant A + date with Tenant B schedules (impossible via RLS) | Zero sessions; cross-tenant isolation preserved.                                                                                                                                     |           |
| 6.17 | Re-run idempotency (same tenant + date)                                    | Second run creates 0 new sessions (all hit P2002). Clean log.                                                                                                                        |           |

---

## 7. Auto-Lock (`attendance:auto-lock`)

Payload: `{ tenant_id: UUID }`.

| #   | Scenario                                                              | Expected                                                            | Pass/Fail |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| 7.1 | Tenant with `autoLockAfterDays=3`, session submitted 5 days ago       | Session flips `submitted → locked`.                                 |           |
| 7.2 | Session submitted 2 days ago (within window)                          | Stays submitted.                                                    |           |
| 7.3 | Session submitted exactly 3 days ago (cutoff)                         | Flips `submitted → locked` (cutoff uses `<=`).                      |           |
| 7.4 | Tenant without `autoLockAfterDays` setting                            | Job log: "Auto-lock disabled". No updates.                          |           |
| 7.5 | Tenant with `autoLockAfterDays=null`                                  | Same as 7.4.                                                        |           |
| 7.6 | Tenant with `autoLockAfterDays=0`                                     | All submitted sessions up to today flip to locked (cutoff = today). |           |
| 7.7 | Session already locked                                                | updateMany `where status=submitted` skips it. No-op.                |           |
| 7.8 | Session open, past cutoff                                             | Stays open (auto-lock only acts on submitted).                      |           |
| 7.9 | Cross-tenant pollution — run on Tenant A; Tenant B sessions unchanged | Verify via direct query.                                            |           |

---

## 8. Pattern Detection (`attendance:detect-patterns`)

Payload: `{ tenant_id: UUID }`.

| #    | Scenario                                                                  | Expected                                                                                                                                   | Pass/Fail |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 8.1  | Tenant config disabled (`enabled=false`)                                  | Log: "Pattern detection disabled for tenant ...". No alerts created.                                                                       |           |
| 8.2  | Tenant config enabled with default thresholds                             | Runs. Log: "Tenant X: checking patterns for N active students".                                                                            |           |
| 8.3  | Student with 6 absences in past 14 days, threshold=5                      | Creates alert `alert_type=excessive_absences` with `count=6`, `window_days=14`.                                                            |           |
| 8.4  | Student with 4 absences in past 14 days (below threshold)                 | No alert.                                                                                                                                  |           |
| 8.5  | Student absent every Tuesday for 3 weeks (threshold=3)                    | Creates alert `alert_type=recurring_day` with `day_of_week=2`, `day_name='Tuesday'`, `count=3`.                                            |           |
| 8.6  | Student late 4 times in past 14 days (threshold=4)                        | Creates alert `alert_type=chronic_tardiness`, `count=4`.                                                                                   |           |
| 8.7  | Student triggers all 3 patterns simultaneously                            | 3 alerts created (one per type). Unique index prevents duplicates per (tenant, student, type, date).                                       |           |
| 8.8  | Running job twice on same day                                             | P2002 silently skipped. No duplicate alerts.                                                                                               |           |
| 8.9  | Excessive absences trigger → early-warning enqueue                        | `early-warning:compute-student` job enqueued with `trigger_event='third_consecutive_absence'`. `attempts: 3`, `backoff: exponential 5000`. |           |
| 8.10 | Absences include status=absent_excused                                    | Counted in excessive + recurring-day (both match `{absent_unexcused, absent_excused}`).                                                    |           |
| 8.11 | Student with zero attendance records                                      | No alerts. No crash.                                                                                                                       |           |
| 8.12 | 500 students in tenant                                                    | Completes in < 60s. Memory OK.                                                                                                             |           |
| 8.13 | Pattern config parse robustness: non-numeric threshold in tenant settings | Falls back to DEFAULT_CONFIG. No crash.                                                                                                    |           |
| 8.14 | `parentNotificationMode=auto`                                             | Alert creation + enqueue of communication notification job (outside this processor — see §11).                                             |           |
| 8.15 | `parentNotificationMode=manual`                                           | Alert created; no auto-notify enqueue. Admin's manual POST triggers the dispatch.                                                          |           |
| 8.16 | RLS context set before DB reads                                           | `TenantAwareJob.processJob(data, tx)` — `tx` has `app.current_tenant_id` set. Cross-tenant data invisible.                                 |           |

---

## 9. Pending Detection (`attendance:detect-pending`)

Payload: `{ tenant_id: UUID, date: 'YYYY-MM-DD' }`.

| #   | Scenario                                  | Expected                                                                              | Pass/Fail |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| 9.1 | Tenant with 15 open sessions for the date | Log: "Tenant X: 15 pending attendance sessions for Y".                                |           |
| 9.2 | Zero open sessions                        | Log: "Tenant X: 0 pending ...".                                                       |           |
| 9.3 | Missing tenant_id                         | Rejected.                                                                             |           |
| 9.4 | Missing date                              | TypeError or processJob crashes — verify handling. Consider adding Zod validation.    |           |
| 9.5 | Current implementation has no DB writes   | Verify — processJob only reads + logs.                                                |           |
| 9.6 | Future enhancement: Redis cache           | Not yet implemented. If added, test cache key = `attendance:pending:{tenant}:{date}`. |           |

---

## 10. Cron Dispatch — Generate / Lock / Patterns / Pending

Cron dispatcher runs cross-tenant. Payload: `{}`. Dispatcher queries `SELECT id FROM tenants WHERE status='active'` and enqueues one per-tenant job per tenant.

| #    | Cron job                                       | Downstream job enqueued            | Per-tenant payload               | Expected                                                              | Pass/Fail |
| ---- | ---------------------------------------------- | ---------------------------------- | -------------------------------- | --------------------------------------------------------------------- | --------- |
| 10.1 | `ATTENDANCE_CRON_DISPATCH_GENERATE_JOB`        | `ATTENDANCE_GENERATE_SESSIONS_JOB` | `{ tenant_id, date: today_iso }` | One enqueue per active tenant. Log total.                             |           |
| 10.2 | `ATTENDANCE_CRON_DISPATCH_LOCK_JOB`            | `ATTENDANCE_AUTO_LOCK_JOB`         | `{ tenant_id }`                  | One enqueue per active tenant.                                        |           |
| 10.3 | `ATTENDANCE_CRON_DISPATCH_PATTERNS_JOB`        | `ATTENDANCE_DETECT_PATTERNS_JOB`   | `{ tenant_id }`                  | One enqueue per active tenant.                                        |           |
| 10.4 | `ATTENDANCE_CRON_DISPATCH_PENDING_JOB`         | `ATTENDANCE_DETECT_PENDING_JOB`    | `{ tenant_id, date: today_iso }` | One enqueue per active tenant.                                        |           |
| 10.5 | Dispatcher with 0 active tenants               | —                                  | —                                | No enqueues. Log "Dispatched X for 0 tenants".                        |           |
| 10.6 | Dispatcher with 8 active tenants + 2 inactive  | —                                  | —                                | 8 enqueues. Inactive tenants skipped.                                 |           |
| 10.7 | Each enqueue has retry policy                  | —                                  | —                                | `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`.       |           |
| 10.8 | Unknown cron job name passed to cron processor | —                                  | —                                | Throws: `Unknown attendance cron-dispatch job name "..."`. Job fails. |           |

---

## 11. Parent Notification Side-Effect Chain

`AttendanceParentNotificationService.triggerAbsenceNotification` is called from `AttendanceService.saveRecords` for each non-present record. The service enqueues jobs on the `notifications` queue (specifically `communications:dispatch-notifications`).

| #     | Trigger scenario                               | Expected downstream                                                                                                      | Pass/Fail |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 11.1  | Save 1 absent_unexcused record                 | 1 notification job enqueued on `notifications`. Payload includes tenant_id, student_id, session_date, record_id, status. |           |
| 11.2  | Save 3 absent records for 3 different students | 3 notification jobs enqueued.                                                                                            |           |
| 11.3  | Save 1 present record                          | 0 notification jobs. Service short-circuits on present.                                                                  |           |
| 11.4  | Save 1 late record                             | Late is non-present → 1 notification job. Verify wording differentiates late from absent.                                |           |
| 11.5  | Parent has opted out of email                  | Communications dispatcher sends in-app only. Attendance processor does not gate; opt-out happens downstream.             |           |
| 11.6  | Student has no linked parent                   | Communications dispatcher no-ops. Attendance processor enqueues regardless.                                              |           |
| 11.7  | Notification dispatch fails (Resend API down)  | Retry × 3 in communications processor. Dead-letter after. Attendance save not affected (fire-and-forget).                |           |
| 11.8  | Notification enqueue errors                    | Wrapped in try/catch in `saveRecords`. Save succeeds even if enqueue throws. Error swallowed (see service code).         |           |
| 11.9  | Dedup: save twice with same statuses           | Re-enqueues on each save. Consider dedup key at communications processor to avoid spam (see observation O-W2).           |           |
| 11.10 | Quiet hours respected                          | Tenant's quiet-hours setting gates the notification dispatch. Job waits until window opens.                              |           |

---

## 12. Early-Warning Fan-Out

`AttendancePatternDetectionProcessor` reads `excessiveAbsenceStudentIds` after the TenantAwareJob executes, and enqueues one `early-warning:compute-student` job per id.

| #    | Scenario                                      | Expected                                                                                                                                                                | Pass/Fail |
| ---- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | 3 students trigger excessive-absence          | 3 enqueues on `early-warning` queue. Each job name = `early-warning:compute-student`. Payload: `{ tenant_id, student_id, trigger_event: 'third_consecutive_absence' }`. |           |
| 12.2 | 0 students trigger                            | No enqueues.                                                                                                                                                            |           |
| 12.3 | Recurring-day pattern trigger (NOT excessive) | No early-warning enqueue. Only excessive-absences fan out.                                                                                                              |           |
| 12.4 | Chronic-tardiness trigger                     | No early-warning enqueue.                                                                                                                                               |           |
| 12.5 | Early-warning queue not registered            | `InjectQueue` fails at bootstrap. Cron-dispatch job crashes. Verify error at worker startup.                                                                            |           |
| 12.6 | Job attempts on fan-out                       | `attempts: 3`, `backoff: exponential 5000`.                                                                                                                             |           |
| 12.7 | Tenant ID passed through                      | Same tenant_id on inner and outer job. Not swapped.                                                                                                                     |           |

---

## 13. Tenant-Aware Payload Enforcement

Every non-cross-tenant job payload MUST include `tenant_id`. `TenantAwareJob` sets `SET LOCAL app.current_tenant_id` before DB ops.

| #    | Scenario                                                                                 | Expected                                                                                                                | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Enqueue `ATTENDANCE_GENERATE_SESSIONS_JOB` without `tenant_id`                           | Processor throws "Job rejected: missing tenant_id in payload.". Job fails.                                              |           |
| 13.2 | Enqueue `ATTENDANCE_AUTO_LOCK_JOB` without `tenant_id`                                   | Same.                                                                                                                   |           |
| 13.3 | Enqueue `ATTENDANCE_DETECT_PATTERNS_JOB` without `tenant_id`                             | Same.                                                                                                                   |           |
| 13.4 | Enqueue `ATTENDANCE_DETECT_PENDING_JOB` without `tenant_id`                              | Same.                                                                                                                   |           |
| 13.5 | Cron dispatch jobs have empty `{}` payloads                                              | Accepted. Dispatcher iterates tenants.                                                                                  |           |
| 13.6 | Malicious payload: `tenant_id` for Tenant A but processing against DB reads for Tenant B | Impossible — RLS enforced by TenantAwareJob's SET LOCAL. Processor sees only Tenant A rows.                             |           |
| 13.7 | Payload `tenant_id` is invalid UUID                                                      | TenantAwareJob sets the RLS context; subsequent SELECT returns 0 rows (no match). Job completes with "0 generated" log. |           |
| 13.8 | Payload `tenant_id` references a soft-deleted tenant                                     | Same — 0 rows. No crash.                                                                                                |           |

---

## 14. Retry Policy & Exponential Backoff

| #    | Scenario                                            | Expected                                                                            | Pass/Fail |
| ---- | --------------------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| 14.1 | Session generation throws mid-run                   | Retry up to 3 times with exponential backoff starting 5000ms.                       |           |
| 14.2 | Auto-lock throws                                    | Same.                                                                               |           |
| 14.3 | Pattern detection throws during a student iteration | Job fails; retry. Alerts already created persist (idempotent via unique index).     |           |
| 14.4 | Retries exhausted                                   | Job moves to dead-letter / failed state. `removeOnFail: 50` keeps last 50 failures. |           |
| 14.5 | After retries, next cron fires normally             | Cron runs are independent. Previous failure does not block next run.                |           |

---

## 15. Dead-Letter Queue

| #    | Scenario                                  | Expected                                                              | Pass/Fail |
| ---- | ----------------------------------------- | --------------------------------------------------------------------- | --------- |
| 15.1 | Session generation fails 3× → dead-letter | Failed job visible in BullMQ Board. Status = failed. Reason captured. |           |
| 15.2 | Replay a dead-letter job                  | Session generation idempotent via P2002 — no duplicate rows.          |           |
| 15.3 | Pattern detection dead-letter             | Replay idempotent via P2002 on alert unique index.                    |           |
| 15.4 | Auto-lock dead-letter                     | Replay idempotent — updateMany with same where clause is a no-op.     |           |
| 15.5 | Dead-letter retention                     | `removeOnFail: 50` — oldest failures evicted once over 50.            |           |

---

## 16. Lock Duration & Long-Running Jobs

`AttendanceQueueDispatcher` options: `lockDuration: 3 * 60_000` (3 min), `stalledInterval: 60_000`, `maxStalledCount: 2`.

| #    | Scenario                                          | Expected                                                                                                                                      | Pass/Fail |
| ---- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Pattern detection for 2000 students takes 2.5 min | Lock held throughout. Job completes before lockDuration expires.                                                                              |           |
| 16.2 | Worker crash mid-pattern-detection                | Job goes stalled; `stalledInterval=60s` + `maxStalledCount=2` → after 2 stalled cycles, job is re-pushed to waiting queue for another worker. |           |
| 16.3 | Job exceeds 3 min lock                            | Lock expires. Another worker picks it up. Possible double-execution — covered by idempotency via unique indexes.                              |           |
| 16.4 | Two workers on the same queue                     | BullMQ competitive-consumer: each job processed by exactly one worker. Dispatcher's switch ensures correct routing.                           |           |

---

## 17. Idempotency & Replay Safety

| #    | Processor                                        | Idempotency mechanism                                                                                          | Verified? |
| ---- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | `generate-sessions`                              | Unique index on AttendanceSession(class, schedule, date). P2002 silently caught.                               |           |
| 17.2 | `auto-lock`                                      | updateMany where status=submitted — no-op if already locked.                                                   |           |
| 17.3 | `detect-patterns`                                | Unique index on AttendancePatternAlert(tenant, student, type, detected_date). P2002 silently caught.           |           |
| 17.4 | `detect-pending`                                 | Read-only job. Idempotent by design.                                                                           |           |
| 17.5 | Cron dispatch                                    | Enqueues per-tenant jobs. Replay dispatches again, but downstream processors are idempotent.                   |           |
| 17.6 | Daily-summary recalc (in service, not processor) | Upsert on unique(tenant, student, summary_date). Idempotent.                                                   |           |
| 17.7 | Parent notification (downstream)                 | Communications dispatcher should dedup on `(tenant_id, record_id, notification_type)`. Verify downstream spec. |           |

---

## 18. Concurrency Across Workers

| #    | Scenario                                                        | Expected                                                                                                     | Pass/Fail |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| 18.1 | Two workers subscribed to the `attendance` queue                | Each job consumed by exactly one worker. Dispatcher switch ensures correct processor.                        |           |
| 18.2 | Cron-dispatch-generate runs simultaneously on both workers      | BullMQ cron dedup via `jobId: cron:${JOB_CONSTANT}` ensures only ONE cron instance runs on the shared queue. |           |
| 18.3 | Session-generation for Tenant A + Tenant B in parallel          | Both complete. No cross-tenant data mixing (RLS + separate DB connections).                                  |           |
| 18.4 | Pattern-detection on the same tenant from 2 workers (misconfig) | Second completes after first; all alert creations idempotent. No duplicate alerts.                           |           |

---

## 19. Cron Deduplication

| #    | Scenario                                                               | Expected                                                                                                            | Pass/Fail |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Cron-dispatch-generate registered twice (duplicate onModuleInit calls) | `jobId: cron:ATTENDANCE_CRON_DISPATCH_GENERATE_JOB` deduplicates. BullMQ has only one repeat slot.                  |           |
| 19.2 | Redis restart after cron already fired                                 | BullMQ re-registers the repeatable job from CronSchedulerService. No duplicate fires expected.                      |           |
| 19.3 | Two worker replicas registering the same cron                          | Same jobId → one repeat slot. Second registration is a no-op OR overwrites (depending on BullMQ behaviour). Verify. |           |
| 19.4 | Cron registered with `removeOnComplete: 10`, `removeOnFail: 50`        | Match constants in CronSchedulerService.                                                                            |           |

---

## 20. Queue Observability

| #    | Check                                     | Expected                                                                | Pass/Fail |
| ---- | ----------------------------------------- | ----------------------------------------------------------------------- | --------- |
| 20.1 | BullMQ Board shows the attendance queue   | Visible with correct name, processor-like connection, job counts.       |           |
| 20.2 | Each processor emits one log line per job | E.g. `Processing attendance:generate-sessions — tenant {id} on {date}`. |           |
| 20.3 | Failed jobs log with error + stack trace  | Via `@nestjs/common Logger`.                                            |           |
| 20.4 | Metrics: job duration per processor       | Verify if Prometheus / Datadog export is wired.                         |           |
| 20.5 | Sentry breadcrumb on job start + end      | Optional but preferred. Verify actual.                                  |           |

---

## 21. Negative Scenarios

| #    | Scenario                                                      | Expected                                                                                                              | Pass/Fail |
| ---- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1 | Postgres connection lost mid-job                              | Job fails; retry. TenantAwareJob's transaction rolls back. No partial state.                                          |           |
| 21.2 | Redis connection lost mid-enqueue                             | Worker re-establishes; outstanding in-flight job timeout. Cron re-registers.                                          |           |
| 21.3 | Tenant deleted mid-job                                        | Cascade delete → FK constraints block tenant delete if sessions exist. Or cascade; processor runs against empty data. |           |
| 21.4 | Tenant-id typo in manual enqueue                              | TenantAwareJob sets invalid UUID; queries return 0 rows. Job logs "Generated 0". No crash.                            |           |
| 21.5 | Enqueue with invalid date format                              | Processor's `new Date(date)` returns `Invalid Date`. Query throws. Job fails.                                         |           |
| 21.6 | Enqueue with date = epoch 0                                   | Runs; likely 0 results (outside any academic year).                                                                   |           |
| 21.7 | Enqueue at peak load (1000 concurrent jobs across 10 workers) | Queue throughput holds. Per-job duration within perf budget.                                                          |           |

---

## 22. Data Invariants After Job Completion

| #    | Invariant                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 22.1 | After `generate-sessions`: every AttendanceSession row has `tenant_id`, `class_id`, `session_date`, `status='open'`.                       |
| 22.2 | After `generate-sessions` with default-present: every session has matching AttendanceRecord rows for every active enrolment at run time.   |
| 22.3 | After `auto-lock`: no submitted sessions with `session_date < cutoff` remain.                                                              |
| 22.4 | After `detect-patterns`: every alert has all required columns populated (detected_date, window_start, window_end, details_json).           |
| 22.5 | After `detect-patterns` excessive-absences: each triggering student has a corresponding `early-warning:compute-student` job enqueued.      |
| 22.6 | After `detect-pending`: no DB writes. Log count matches `SELECT COUNT(*) FROM attendance_sessions WHERE status='open' AND session_date=?`. |
| 22.7 | Cross-tenant isolation preserved across every job: Tenant A data never touches Tenant B's tables.                                          |

---

## 23. Regression Guards (Processor-Race Fix `5efed767`)

Before the dispatcher consolidation, five processors competed on the `attendance` queue. The following tests are explicit guards.

| #    | Test                                                                   | Expected                                                                                                                       | Pass/Fail |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 23.1 | Enqueue 100 `ATTENDANCE_GENERATE_SESSIONS_JOB` payloads                | 100 successful processor invocations. No drops. 100 log entries.                                                               |           |
| 23.2 | Grep `@Processor(QUEUE_NAMES.ATTENDANCE)` in worker source             | Exactly 1 result (the dispatcher file).                                                                                        |           |
| 23.3 | Grep `extends WorkerHost` in `apps/worker/src/processors/attendance-*` | 1 result (the dispatcher).                                                                                                     |           |
| 23.4 | Confirm all 5 non-dispatcher processor classes use `@Injectable()`     | Verified by grep on `@Injectable()` in each of the 5 files.                                                                    |           |
| 23.5 | Dispatcher test suite exists                                           | `attendance-queue-dispatcher.spec.ts` has 8 routing tests + 1 throws-on-unknown test = 9 tests. Documented in commit 5efed767. |           |
| 23.6 | Running `turbo test` (worker package) passes                           | 29+ worker attendance-module tests pass, including the 9 new dispatcher tests.                                                 |           |

---

## 24. Observations

Seed watchpoints:

- **O-W1 (P2)**: `detect-pending` currently only logs, no DB or Redis cache write. Dashboards have to query live on each load. Add a Redis counter keyed `attendance:pending:{tenant}:{date}` for O(1) badge reads.
- **O-W2 (P2)**: Parent notification dedup is not explicit at enqueue side. If a teacher saves the same absence twice, two jobs enqueue. Communications dispatcher should dedup on `(tenant_id, record_id)`.
- **O-W3 (P2)**: Session generation during school-closure race could leave orphan sessions. Consider back-compensation cron that cancels sessions for newly-added closures.
- **O-W4 (P3)**: Pattern detection iterates all students per-tenant; for 5000+ students this becomes slow. Consider sharding or incremental detection (only students with new absences since last run).
- **O-W5 (P3)**: Auto-lock has no grace period differentiation (e.g. weekends vs weekdays). A session submitted Fri might lock by Mon if cutoff=3 days. Consider skipping non-school-days.
- **O-W6 (P2)**: Early-warning enqueue happens for every excessive-absence student every day the pattern persists. Consider a "last notified" field on the pattern alert to avoid daily re-firing.
- **O-W7 (P3)**: Cron-dispatch processor reads `SELECT id FROM tenants WHERE status='active'` on every run. For 100+ tenants this is fine; for 10000+ consider caching.

---

## 25. Sign-Off

| Field         | Value |
| ------------- | ----- |
| Reviewer      |       |
| Date          |       |
| Total Pass    |       |
| Total Fail    |       |
| Blocker count |       |
| Notes         |       |

Worker spec is signed off only when every row above is Pass with zero P0 / P1 findings. The tenant-aware payload enforcement (§13), cron deduplication (§19), and regression guards (§23) are release blockers — any single Fail there is P0.
