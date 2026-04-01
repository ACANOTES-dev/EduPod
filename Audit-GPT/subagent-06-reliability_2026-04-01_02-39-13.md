# Reliability & Error Handling Audit

## A. Facts

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/state-machines.md` documents `ApprovalRequestStatus` as `pending_approval -> approved -> executed`, and documents invoice, payroll run, and announcement transitions from `pending_approval` to callback-driven terminal states.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/event-job-catalog.md` describes the approval callback chain as the most dangerous flow, with `callback_status` tracking and daily callback reconciliation.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts` hardcodes three Mode A callback mappings: `announcement_publish`, `invoice_issue`, and `payroll_finalise`.
- The same approval service sets `callback_status: 'pending'` on approval, enqueues the callback job, and on enqueue failure updates the request to `callback_status: 'failed'` with `callback_error`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.ts` scans approved requests where `callback_status in ('pending', 'failed')`, requires them to be older than 30 minutes, and retries them up to `MAX_CALLBACK_ATTEMPTS = 5`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts` validates `tenant_id` and `user_id`, opens an interactive Prisma transaction, sets `app.current_tenant_id`, sets `app.current_user_id`, and then calls `processJob()`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts` updates the invoice to `issued` and then updates the approval request to `executed` inside the tenant-aware transaction.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts` recalculates entries, creates payslips, finalises the payroll run, and then updates the approval request to `executed` inside the tenant-aware transaction.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts` is also a `TenantAwareJob`; inside `processJob()` it sends email through Resend and WhatsApp/SMS through Twilio before updating notification rows.
- The same notification dispatcher writes `status: 'failed'` and a future `next_retry_at` when attempts remain.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts` only queries rows where `status = 'queued'`; it does not query `status = 'failed'`.
- `DispatchQueuedProcessor` comments that it is marking work as processing, but the actual update only clears `next_retry_at` and leaves the status as `queued`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/retry-failed.processor.ts` exists, resets eligible failed notifications back to `queued`, and re-enqueues them.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/worker.module.ts` imports and provides `RetryFailedNotificationsProcessor`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/cron/cron-scheduler.service.ts` registers `notifications:dispatch-queued` but does not register `communications:retry-failed-notifications`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts` creates approval requests directly through `this.prisma.approvalRequest.create()` and returns the new request id.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/invoices.service.ts`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/payroll/payroll-runs.service.ts`, and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/admissions/application-state-machine.service.ts` call `checkAndCreateIfNeeded()` and then perform a separate write to move the domain entity into a pending-approval state.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma` gives `ApprovalRequest` indexes on `(tenant_id, status)` and `callback_status`, but no uniqueness guard on `(tenant_id, action_type, target_entity_id)` or on open requests.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.module.ts` registers only the `notifications` BullMQ queue.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts` checks BullMQ by calling `notificationsQueue.getActive()` only.
- The same health service reports Meilisearch as `up` after calling `this.meilisearch.search('_health_check', '', {})`, and also reports `up` from its `catch` branch when `available` is true.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/search/meilisearch.client.ts` catches search errors, logs them, and returns `null`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.controller.ts` returns a static `{ status: 'ok', service: 'worker' }` payload and performs no dependency checks.
- Cross-tenant cron processors in `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/early-warning/compute-daily.processor.ts`, and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/parent-daily-digest.processor.ts` catch per-tenant failures, log them, continue, and emit only a success-count summary.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.spec.ts`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.spec.ts`, and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.spec.ts` contain targeted tests for approval transitions, callback reconciliation, and health behavior.

## B. Strong Signals

- Tenant isolation for per-tenant jobs is deliberate and repeated. `TenantAwareJob` is the shared pattern, and the approval callback processors and gradebook inner jobs use it consistently.
- Approval callbacks have real tracking infrastructure, not just fire-and-forget logic. `callback_status`, `callback_error`, `callback_attempts`, reconciliation, and targeted specs all exist.
- The notification subsystem has mismatched state-machine pieces across multiple files: one processor writes `failed + next_retry_at`, a different processor only polls `queued`, and a third retry processor exists but is not scheduled.
- Operational health reporting is much shallower than the worker surface area. The API health module watches one queue, the worker health endpoint is static, and cross-tenant cron failures are log-only in multiple processors.
- Retry and backoff defaults are configured across queues, but the worker queue registrations inspected do not define BullMQ `timeout` settings.

## C. Inferences

- The missing `application_accept` and `payment_refund` entries from `MODE_A_CALLBACKS` appear intentional, not accidental. The approval service spec explicitly treats `application_accept` as an action type without a callback mapping.
- The notification delivery path is the highest current operational risk in the reviewed surface because it combines claim gaps, retry gaps, and external side effects inside a transaction.
- Approval callback execution is better protected than approval-request creation. The callback workers are transactionally scoped; the approval-request creation and attach step is not.
- The cron design prioritizes isolating one tenant's failure from the rest of the run, but the current implementation does not surface those tenant failures anywhere stronger than logs.

## D. Top Findings

### 1. Failed notifications are given backoff timestamps, but no scheduled path picks them up again

- Severity: High
- Confidence: High
- Why it matters: transient delivery failures can become effectively permanent until manual intervention. The code records retry intent with `next_retry_at`, but the live scheduled poller does not consume that state.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts:662-698` writes `status: 'failed'` and `next_retry_at` when attempts remain.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts:53-68` only selects notifications where `status: 'queued'`.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/retry-failed.processor.ts:12-105` contains a dedicated failed-notification retry processor.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/cron/cron-scheduler.service.ts:261-276` registers only `notifications:dispatch-queued`; no retry-failed cron registration was found.
- Fix direction: either teach `notifications:dispatch-queued` to consume retry-eligible `failed` rows, or register and test a repeatable `communications:retry-failed-notifications` cron. Add an end-to-end worker test that proves `failed -> retry -> sent`.

### 2. Queued notifications are not actually claimed before dispatch, so the same rows can be enqueued repeatedly

- Severity: High
- Confidence: High
- Why it matters: the 30-second poller can enqueue duplicate dispatch jobs for the same notification before any worker changes its status. That creates a direct path to duplicate messages, especially under worker lag or provider latency.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts:53-68` selects rows where `status = 'queued'`.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts:87-101` says it is marking rows as processing, but the actual write only clears `next_retry_at` and keeps `status: 'queued'`.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma:390-395` shows `NotificationStatus` has no claim/processing state.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts:266-307` still accepts `queued` notifications when a dispatch job starts, so overlapping jobs can process the same ids.
- Fix direction: introduce an atomic claim step before enqueueing or before sending. A `processing` or leased state is the cleanest option. The dispatcher should only send rows it successfully claimed, and the claim should be compare-and-swap safe.

### 3. External notification sends happen inside the Prisma transaction, with no job timeout guard

- Severity: High
- Confidence: High
- Why it matters: the worker keeps a database transaction open while waiting on Resend/Twilio. If the transaction later aborts, the external provider call cannot be rolled back, so BullMQ retries can resend the same message. Long provider latency also holds database connections and RLS-scoped transactions open.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts:40-71` wraps the full job body in `this.prisma.$transaction(...)`.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts:238-314` executes the full notification loop inside `processJob()`.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts:378-390`, `:463-489`, and `:559-578` perform Resend and Twilio network calls before the corresponding notification row is updated.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/worker.module.ts:113-156` shows queue defaults with attempts/backoff/remove settings but no BullMQ `timeout` setting in the inspected registrations.
- Fix direction: move provider calls out of the long-lived transaction. Claim the notification in one short transaction, perform the external send outside it, and persist the result in a second short transaction with idempotency protection. Add BullMQ timeouts and provider request deadlines.

### 4. Approval-request creation is not atomic with the entity transition to pending approval, and there is no uniqueness guard on open requests

- Severity: High
- Confidence: High
- Why it matters: if the second write fails or two callers race, the system can create orphaned approval requests or multiple active requests for the same entity/action. The worker callback model assumes those domain records and approval requests stay aligned.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts:400-412` creates approval requests directly and returns the request id.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/invoices.service.ts:341-365` calls `checkAndCreateIfNeeded()` and then separately updates the invoice to `pending_approval`.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/payroll/payroll-runs.service.ts:689-711` does the same for payroll runs.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/admissions/application-state-machine.service.ts:314-337` does the same for application acceptance.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma:1380-1418` shows indexes on status and callback state, but no uniqueness constraint on `(tenant_id, action_type, target_entity_id)` or one-open-request semantics.
- Fix direction: make approval request creation and domain status change a single interactive transaction, ideally by passing a caller transaction into the approval helper or moving the helper into a transaction-aware abstraction. Add a partial unique index or equivalent guard for one non-terminal approval request per tenant/action/target.

### 5. Health endpoints can report healthy while major worker or search failures exist

- Severity: Medium
- Confidence: High
- Why it matters: operators can get a green signal while non-notifications queues are stuck, the worker cannot process jobs, or Meilisearch queries are failing. That delays incident detection.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.module.ts:9-14` registers only the `notifications` queue for BullMQ health.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts:168-179` checks BullMQ via `notificationsQueue.getActive()` only.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts:153-165` reports Meilisearch as `up` after `search()` and also reports `up` from the catch branch.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/search/meilisearch.client.ts:40-55` swallows Meilisearch search failures and returns `null`.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.controller.ts:3-8` returns a static worker health payload with no dependency checks.
- Fix direction: add a real worker health service, expand queue health beyond notifications, and make Meilisearch health use an explicit ping/health call whose failures surface as degraded or down instead of `up`.

### 6. Cross-tenant cron failures are only logged, not surfaced to durable state or health

- Severity: Medium
- Confidence: High
- Why it matters: a tenant can fail every day while the overall cron still completes and the failure never reaches health checks, dashboards, or a retry queue. The problem survives until someone reads logs.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts:96-115` catches tenant failures, logs them, and continues.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/early-warning/compute-daily.processor.ts:59-78` uses the same catch-and-continue pattern.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/parent-daily-digest.processor.ts:46-63` uses the same pattern again.
- Fix direction: persist per-tenant cron failures to an ops table or metric stream, include recent failure counts in health/degraded responses, and add alerting for recurring tenant-specific failures.

## E. Files Reviewed

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/state-machines.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/event-job-catalog.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/cron/cron-scheduler.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/worker.module.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.controller.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-workflows.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-workflows.controller.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/announcement-approval-callback.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/retry-failed.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/early-warning/compute-daily.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/parent-daily-digest.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/homework/overdue-detection.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.module.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.controller.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.controller.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/search/meilisearch.client.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/invoices.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/payroll/payroll-runs.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/admissions/application-state-machine.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/types/approval.ts`

## F. Additional Commands Run

```sh
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/state-machines.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/event-job-catalog.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/cron/cron-scheduler.service.ts'
rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals'
rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src' -g '*health*'
rg -n "MODE_A_CALLBACKS|callback_status|approve\(|reconcile|callback_error|callback_attempts|action_type|Queue" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts'
rg -n "APPROVAL|callback|on-approval|callback_status|executed_at|status = 'executed'|status: 'executed'" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors'
rg -n "defaultJobOptions|attempts:|backoff:|timeout:|removeOnComplete|removeOnFail" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src'
sed -n '261,520p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/cron/cron-scheduler.service.ts'
sed -n '521,760p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/cron/cron-scheduler.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts'
sed -n '261,520p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.controller.ts'
sed -n '100,320p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/worker.module.ts'
rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src' -g '*health*'
rg -n "catch|throw new|status !==|callback_status|pending_approval|approved|executed|rejected|cancelled" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.controller.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-workflows.service.ts'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.controller.ts'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-workflows.controller.ts'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.ts'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/announcement-approval-callback.processor.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts'
sed -n '261,380p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts'
rg -n "class |async process|catch \(|throw new|status: 'failed'|attempt_count|max_attempts|retry_at|next_attempt_at|backoff|provider|channel|skip|console\.error|logger\.(warn|error)" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts'
sed -n '261,520p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts'
sed -n '521,760p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts'
rg -n "Approval|approval request|pending_approval|executed" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/state-machines.md'
rg -n "timeout|stuck|health|ready|live|BullMQ|getActive|Queue" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health'
rg -n "@Processor\(|TenantAwareJob|findMany\(|tenant.findMany|active tenants|for \(const tenant|tenant_id" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts'
rg -n "catch \{\}|catch \([^)]*\) \{[[:space:]]*$|catch \{$" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/approvals' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts'
rg -n "callback_status|callback_error|callback_attempts|action_type|target_entity_id|approver_user_id|status: 'approved'|status: 'executed'|status: 'failed'" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma'
rg -n "approvalRequest|callback_status|callback_error|callback_attempts|ApprovalRequestStatus|CallbackStatus" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared'
sed -n '1,140p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/types/approval.ts'
sed -n '620,700p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts'
rg -n "should .*callback|should .*pending_approval|should .*unhealthy|stuck job|re-enqueue|permanently failed|mark callback_status as failed" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.spec.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.spec.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.spec.ts'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.module.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/search/meilisearch.client.ts'
rg -n "available" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/search/meilisearch.client.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts'
rg -n "approval request|callback_status|pending|executed|status !== 'pending_approval'|Skipping" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/announcement-approval-callback.processor.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts'
rg -n "application_accept|payment_refund|announcement_publish|invoice_issue|payroll_finalise|checkAndCreateIfNeeded\(" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared'
rg -n "application_accept|payment_refund|ApprovalActionType" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Roadmap'
rg -n "tenant\.findMany\(|for \(const tenant of tenants\)|catch \(err: unknown\)|cron complete|tenants processed" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors'
sed -n '40,90p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/early-warning/compute-daily.processor.ts'
sed -n '40,75p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/parent-daily-digest.processor.ts'
sed -n '30,60p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/homework/overdue-detection.processor.ts'
sed -n '320,390p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/invoices.service.ts'
sed -n '670,730p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/payroll/payroll-runs.service.ts'
sed -n '300,345p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/admissions/application-state-machine.service.ts'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts'
rg -n "next_retry_at|status: \{ in: \['queued', 'failed'\]|communications:dispatch-notifications|dispatch queued" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/retry-failed.processor.ts'
rg -n "RetryFailedProcessor|retry-failed|RETRY_FAILED|communications:retry|register.*retry|IP_CLEANUP_JOB|DISPATCH_QUEUED_JOB" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/worker.module.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/cron/cron-scheduler.service.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors'
rg -n "status: 'failed'|next_retry_at" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts'
rg -n "RetryFailedNotificationsProcessor" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/worker.module.ts'
rg -n "retry-failed|dispatch-queued|notifications queue|failed notifications|next_retry_at" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/event-job-catalog.md'
sed -n '817,838p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/event-job-catalog.md'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts' | sed -n '30,80p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts' | sed -n '230,380p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts' | sed -n '650,740p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts' | sed -n '40,110p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/retry-failed.processor.ts' | sed -n '1,120p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/worker.module.ts' | sed -n '30,45p;360,375p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/cron/cron-scheduler.service.ts' | sed -n '260,280p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts' | sed -n '374,415p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/invoices.service.ts' | sed -n '338,366p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/payroll/payroll-runs.service.ts' | sed -n '686,712p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/admissions/application-state-machine.service.ts' | sed -n '310,338p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma' | sed -n '1380,1418p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts' | sed -n '150,180p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/search/meilisearch.client.ts' | sed -n '40,56p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.module.ts' | sed -n '1,40p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.controller.ts' | sed -n '1,20p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/worker.module.ts' | sed -n '112,156p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts' | sed -n '88,116p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/early-warning/compute-daily.processor.ts' | sed -n '52,78p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/notifications/parent-daily-digest.processor.ts' | sed -n '42,63p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts' | sed -n '378,390p;462,489p;559,578p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts' | sed -n '50,104p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts' | sed -n '50,90p;289,316p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.ts' | sed -n '49,80p;115,158p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.ts' | sed -n '160,222p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/state-machines.md' | sed -n '478,486p;199,226p;289,308p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/event-job-catalog.md' | sed -n '15,43p;817,838p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md' | sed -n '44,72p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/approvals/approval-requests.service.spec.ts' | sed -n '170,226p'
test -f '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/subagent-06-reliability_2026-04-01_02-39-13.md' && echo exists || echo missing
```

## G. Score

- Score: 5.5 / 10
- Justification: the reviewed surface has solid foundations for tenant isolation and approval callback tracking: documented state machines, reconciliation, queue retry defaults, and targeted tests are all present. The score stays in the 5-6 range because several material reliability gaps remain live in production code: the notification pipeline has both duplicate-dispatch and dead retry paths, external sends happen inside database transactions, approval request creation is not atomic with entity state changes, and health checks under-report real worker degradation.

## H. Confidence in this review

- Confidence: High
- What limited certainty: this was a static code review only. I did not execute BullMQ jobs, inspect live Redis/Postgres state, or verify production telemetry, so impact frequency is inferred from code paths rather than observed runtime incidents.
