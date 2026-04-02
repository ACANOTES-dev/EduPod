# Reliability & Error Handling Audit

## A. Facts

- The canonical fact pack was used as the starting point, and no repo-wide rediscovery was repeated.
- `TenantAwareJob` validates `tenant_id`/`user_id`, opens an interactive Prisma transaction, and sets `app.current_tenant_id` plus `app.current_user_id` before tenant-scoped work runs (`apps/worker/src/base/tenant-aware-job.ts:40-71`).
- The approvals API uses typed NestJS exceptions consistently for missing records and invalid user actions (`apps/api/src/modules/approvals/approval-requests.service.ts:164-182`, `apps/api/src/modules/approvals/approval-requests.service.ts:255-336`, `apps/api/src/modules/approvals/approval-workflows.service.ts:31-181`).
- Approval callback tracking exists in both API and worker paths: `callback_status`, `callback_error`, and `callback_attempts` are written on approval, manual retry, and reconciliation (`apps/api/src/modules/approvals/approval-requests.service.ts:185-238`, `apps/api/src/modules/approvals/approval-requests.service.ts:408-440`, `apps/worker/src/processors/approvals/callback-reconciliation.processor.ts:63-166`).
- `CronSchedulerService` registers `notifications:dispatch-queued`, `approvals:callback-reconciliation`, DLQ monitoring, and canary jobs, but the notifications cron registration contains only `DISPATCH_QUEUED_JOB` in the notifications section (`apps/worker/src/cron/cron-scheduler.service.ts:287-301`, `apps/worker/src/cron/cron-scheduler.service.ts:686-722`).
- `RetryFailedNotificationsProcessor` exists, scans `notification.status = 'failed'` with `next_retry_at <= now`, resets those rows to `queued`, and re-enqueues dispatch jobs with BullMQ `attempts`/`backoff` (`apps/worker/src/processors/communications/retry-failed.processor.ts:32-105`).
- `DispatchNotificationsProcessor.handleFailure()` writes failed rows with a future `next_retry_at`, but it does not itself re-queue them (`apps/worker/src/processors/communications/dispatch-notifications.processor.ts:654-689`).
- `DispatchQueuedProcessor` only scans `notification.status = 'queued'` rows, even when `next_retry_at` has elapsed (`apps/worker/src/processors/notifications/dispatch-queued.processor.ts:51-68`).
- Announcement, invoice, and payroll approval callback processors all early-return if the target entity is no longer in `pending_approval`, and they only set `approval_requests.callback_status = 'executed'` in the happy path after mutating the target entity (`apps/worker/src/processors/communications/announcement-approval-callback.processor.ts:79-104`, `apps/worker/src/processors/finance/invoice-approval-callback.processor.ts:79-104`, `apps/worker/src/processors/payroll/approval-callback.processor.ts:83-316`).
- The worker health service checks PostgreSQL, Redis, and BullMQ through the notifications queue only; `stuck_jobs` are reported as metadata, but they do not change the overall status unless BullMQ is fully down (`apps/worker/src/health/worker-health.service.ts:57-123`).
- The health controller returns `503` only for `unhealthy`; `degraded` still returns `200` (`apps/worker/src/health/worker-health.controller.ts:12-16`).
- The invoice state machine's shared source of truth allows `issued -> overdue` but not `partially_paid -> overdue` (`packages/shared/src/constants/invoice-status.ts:14-27`, `packages/shared/src/constants/invoice-status.ts:87-88`).
- The finance overdue worker currently selects invoices in `issued` or `partially_paid` and rewrites both to `overdue` (`apps/worker/src/processors/finance/overdue-detection.processor.ts:62-89`).

## B. Strong Signals

- Tenant isolation in worker jobs is thoughtfully implemented. `TenantAwareJob` gives the repo a strong baseline for RLS-safe background work instead of leaving tenant context up to individual processors.
- Approval callbacks have a real backstop now. The callback tracking fields and reconciliation job are meaningful reliability primitives, not just comments.
- Cross-queue liveness monitoring is present. The canary processor actively pings 10 critical queues and reports SLA misses to Sentry (`apps/worker/src/processors/monitoring/canary.processor.ts:51-130`).
- Notification dispatch avoids holding a database transaction open across provider HTTP calls. That is a good failure-isolation choice for PgBouncer and external API latency (`apps/worker/src/processors/communications/dispatch-notifications.processor.ts:221-258`, `apps/worker/src/processors/communications/dispatch-notifications.processor.ts:297-340`).
- Exception handling in the approvals API is mostly disciplined and human-readable, which reduces silent bad states at the request layer.

## C. Inferences

- Reliability foundations are stronger in isolation and observability than in automated recovery. The codebase has several good safety primitives, but some are not fully wired into live execution paths.
- Approval flows are the sharpest reliability edge. The repo has tracking and reconciliation, but decision atomicity and callback repair semantics still leave openings for inconsistent end states.
- The state-machine contract is treated seriously in shared finance code, but some worker processors are still mutating state outside that single source of truth.
- Health reporting is currently better at proving "the worker process is up" than proving "critical queues are actually healthy."

## D. Top Findings

### 1. Approval decisions are not atomic, so concurrent approve/reject/cancel actions can both succeed

- Severity: Critical
- Confidence: High
- Why it matters: `approve()`, `reject()`, and `cancel()` all do a read-time status check and then a separate unconditional `update({ where: { id } })`. Two actors can therefore observe the same `pending_approval` row and both commit different terminal decisions. In the worst case, one user rejects while another approves and enqueues the callback, so the domain side effect can still run even though another caller received a successful rejection response.
- Evidence: `apps/api/src/modules/approvals/approval-requests.service.ts:156-241`, `apps/api/src/modules/approvals/approval-requests.service.ts:247-304`, `apps/api/src/modules/approvals/approval-requests.service.ts:310-366`.
- Fix direction: Make the decision transition atomic. Use an interactive transaction with row locking or a conditional write that includes `status: 'pending_approval'` in the database mutation, and only enqueue the callback after that single guarded transition succeeds.

### 2. Notification retry/backoff is effectively dead because failed rows are never scheduled back into the retry processor

- Severity: High
- Confidence: High
- Why it matters: the dispatch pipeline records backoff metadata on failed notifications, but the live scheduler never invokes the processor that turns eligible failed rows back into queued work. A transient provider failure therefore leaves a notification stuck in `failed` after its first attempt, and the configured `max_attempts` / fallback chain never actually gets exercised.
- Evidence: `apps/worker/src/processors/communications/dispatch-notifications.processor.ts:654-689` writes `status: 'failed'` plus `next_retry_at`; `apps/worker/src/processors/communications/retry-failed.processor.ts:32-105` contains the intended retry scan; `apps/worker/src/cron/cron-scheduler.service.ts:287-301` registers only `notifications:dispatch-queued`; `apps/worker/src/processors/notifications/dispatch-queued.processor.ts:53-68` only queries `status: 'queued'`.
- Fix direction: Register `RETRY_FAILED_NOTIFICATIONS_JOB` on a repeatable schedule, or merge its scan into `DispatchQueuedProcessor`. Add an integration test proving a failed notification with elapsed `next_retry_at` is re-queued and retried.

### 3. Approval callback processors are idempotent on the target entity but do not self-heal callback tracking after partial success

- Severity: High
- Confidence: High
- Why it matters: if a callback mutates the domain entity successfully but fails before updating `approval_requests` to `executed`, reconciliation will re-enqueue it later. On replay, the callback sees the target is no longer `pending_approval` and returns early, leaving `callback_status` stuck. After five reconciliation cycles, the system marks the callback as failed even though the announcement/invoice/payroll run already executed.
- Evidence: `apps/worker/src/processors/communications/announcement-approval-callback.processor.ts:79-104`, `apps/worker/src/processors/finance/invoice-approval-callback.processor.ts:79-104`, `apps/worker/src/processors/payroll/approval-callback.processor.ts:83-316` all return before repairing the approval request; `apps/worker/src/processors/approvals/callback-reconciliation.processor.ts:63-166` keeps retrying pending/failed callbacks and permanently fails them at attempt 5.
- Fix direction: Treat the post-approval target state as an idempotent recovery success. If the target is already `published`, `issued`, or `finalised`, update the corresponding `approval_request` to `executed` instead of returning. Add tests for "domain action already applied, tracking row still pending."

### 4. Worker health can report healthy while critical queues are stalled

- Severity: Medium
- Confidence: High
- Why it matters: `/health` currently reflects PostgreSQL, Redis, and BullMQ reachability through the notifications queue only. A finance, payroll, approvals, or pastoral queue outage can therefore leave the health endpoint green as long as the notifications queue is still responsive. Even detected `stuck_jobs` do not degrade status, and `degraded` still returns HTTP 200.
- Evidence: `apps/worker/src/health/worker-health.service.ts:40-43`, `apps/worker/src/health/worker-health.service.ts:57-123`, `apps/worker/src/health/worker-health.controller.ts:12-16`. The separate canary path does monitor multiple critical queues, but it only emits logs/Sentry and is not folded into health status (`apps/worker/src/processors/monitoring/canary.processor.ts:51-130`).
- Fix direction: Introduce a readiness signal that aggregates critical queue health, ideally from canary results plus queue-specific lag/failure checks. At minimum, degrade readiness when any critical queue misses canary SLA or when `stuck_jobs > 0`.

### 5. The overdue cron violates the canonical invoice state machine by forcing `partially_paid -> overdue`

- Severity: Medium
- Confidence: High
- Why it matters: the shared transition map says the overdue cron is responsible for `issued -> overdue`, while `partially_paid` may only move to `paid` or `written_off`. The worker currently rewrites partially paid invoices to overdue anyway. That creates drift between the documented contract, validation helpers, and actual runtime behavior.
- Evidence: `packages/shared/src/constants/invoice-status.ts:14-27`, `packages/shared/src/constants/invoice-status.ts:87-88`, `apps/worker/src/processors/finance/overdue-detection.processor.ts:62-89`.
- Fix direction: Choose one truth and align the codebase to it. If partially paid invoices should become overdue, update the shared transition map, transition metadata, and tests. If they should not, remove `partially_paid` from the overdue selection and model lateness separately.

## E. Files Reviewed

- `Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md`
- `CLAUDE.md`
- `Plans/context.md`
- `architecture/danger-zones.md`
- `architecture/state-machines.md`
- `architecture/event-job-catalog.md`
- `apps/worker/src/base/tenant-aware-job.ts`
- `apps/worker/src/base/cross-tenant-system-job.ts`
- `apps/worker/src/base/queue.constants.ts`
- `apps/worker/src/cron/cron-scheduler.service.ts`
- `apps/worker/src/health/worker-health.controller.ts`
- `apps/worker/src/health/worker-health.service.ts`
- `apps/worker/src/worker.module.ts`
- `apps/worker/src/processors/approvals/callback-reconciliation.processor.ts`
- `apps/worker/src/processors/communications/announcement-approval-callback.processor.ts`
- `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
- `apps/worker/src/processors/communications/retry-failed.processor.ts`
- `apps/worker/src/processors/monitoring/canary.processor.ts`
- `apps/worker/src/processors/notifications/dispatch-queued.processor.ts`
- `apps/worker/src/processors/finance/invoice-approval-callback.processor.ts`
- `apps/worker/src/processors/finance/overdue-detection.processor.ts`
- `apps/worker/src/processors/payroll/approval-callback.processor.ts`
- `apps/api/src/modules/approvals/approval-requests.controller.ts`
- `apps/api/src/modules/approvals/approval-requests.service.ts`
- `apps/api/src/modules/approvals/approval-workflows.controller.ts`
- `apps/api/src/modules/approvals/approval-workflows.service.ts`
- `packages/shared/src/constants/invoice-status.ts`
- `apps/api/src/modules/finance/helpers/invoice-status.helper.ts`

## F. Additional Commands Run

- `sed -n '1,220p' Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md`
- `sed -n '1,220p' CLAUDE.md`
- `sed -n '1,220p' Plans/context.md`
- `sed -n '1,220p' architecture/danger-zones.md`
- `sed -n '1,220p' architecture/state-machines.md`
- `sed -n '1,220p' architecture/event-job-catalog.md`
- `rg --files apps/api/src/modules/approvals`
- `rg --files apps/worker/src | rg '/health|health/'`
- `rg -n "catch|callback_status|callback_error|callback_attempt|MODE_A_CALLBACKS|throw new" apps/api/src/modules/approvals`
- `rg -n "on-approval|approval_request_id|callback_status|callback_attempts|retry|backoff|attempts|timeout" apps/worker/src/processors`
- `rg -n "RETRY_FAILED_NOTIFICATIONS_JOB|retry-failed-notifications|retry-failed" apps/worker/src apps/api/src`
- `rg -n "VALID_INVOICE_TRANSITIONS|partially_paid|overdue" packages/shared/src/constants apps/api/src/modules/finance`
- `nl -ba <target-file> | sed -n '<line-range>p'` on the worker, approvals, finance, and health files above to capture exact evidence lines

## G. Score

- 5/10
- Anchor: `1` = fragile and largely non-recovering, `10` = strongly self-healing and production-hardened.
- Rationale: tenant isolation, typed API errors, callback tracking, and canary monitoring are real strengths, but the approval race window, broken notification retry loop, and incomplete callback repair logic are material reliability gaps.

## H. Confidence in this review

- High for code-path accuracy.
- Medium-High for operational impact sizing because this was a static targeted audit, not a live queue replay in production-like conditions.
