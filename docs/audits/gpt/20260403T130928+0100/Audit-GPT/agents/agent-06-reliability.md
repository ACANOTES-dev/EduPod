A. Facts

- Read the canonical fact pack first: `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`.
- Read the requested architecture docs: `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md`, `/Users/ram/Desktop/SDB/docs/architecture/event-job-catalog.md`, `/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md`.
- Read the requested worker and health surfaces: `/Users/ram/Desktop/SDB/apps/worker/src/base/tenant-aware-job.ts`, `/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts`, `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.service.ts`, `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.controller.ts`, `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.service.ts`, `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.controller.ts`, `/Users/ram/Desktop/SDB/apps/api/src/modules/health/admin-health.controller.ts`.
- Read the approvals module key files: `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-requests.service.ts`, `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-requests.controller.ts`, `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-workflows.service.ts`, `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-workflows.controller.ts`.
- Read one simple approval worker and several callback processors to verify the callback path end-to-end: `/Users/ram/Desktop/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.ts`, `/Users/ram/Desktop/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts`, `/Users/ram/Desktop/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts`, `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/announcement-approval-callback.processor.ts`.
- Read one complex critical worker plus its retry cron: `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts`, `/Users/ram/Desktop/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts`, `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/retry-failed.processor.ts`.
- Read the monitoring jobs used as reliability backstops: `/Users/ram/Desktop/SDB/apps/worker/src/processors/monitoring/dlq-monitor.processor.ts`, `/Users/ram/Desktop/SDB/apps/worker/src/processors/monitoring/canary.processor.ts`, `/Users/ram/Desktop/SDB/apps/worker/src/base/queue.constants.ts`.
- Read the approval shared contract and schema because callback-state correctness depends on them: `/Users/ram/Desktop/SDB/packages/shared/src/types/approval.ts`, `/Users/ram/Desktop/SDB/packages/shared/src/schemas/approval.schema.ts`, `/Users/ram/Desktop/SDB/packages/prisma/schema.prisma`.
- Approval request state-machine documentation says `pending_approval -> [approved, rejected, cancelled]` and `approved -> [executed]` and explicitly claims approval decision methods use conditional updates to prevent double decisions. See `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md:478` and `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md:489`.
- Invoice, payroll-run, and announcement state-machine docs all route their approval-driven transition through worker callbacks, not the API. See `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md:198`, `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md:287`, and `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md:304`.
- `TenantAwareJob.execute()` validates `tenant_id`, validates optional `user_id`, opens an interactive Prisma transaction, sets `app.current_tenant_id`, sets `app.current_user_id`, and then executes the job logic. See `/Users/ram/Desktop/SDB/apps/worker/src/base/tenant-aware-job.ts:40`.
- `CronSchedulerService` registers repeatable jobs only during module init via `queue.add(... repeat ..., jobId: cron:...)`. See `/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts:77`.
- API health inspects only 5 queues (`notifications`, `behaviour`, `finance`, `payroll`, `pastoral`). See `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.service.ts:18` and `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.service.ts:382`.
- Worker health inspects 10 queues, while queue constants define 21 product queues. See `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.service.ts:44` and `/Users/ram/Desktop/SDB/apps/worker/src/base/queue.constants.ts:1`.
- Danger-zone documentation already calls out a missing cron-registration health check for homework jobs. See `/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md:547`.

B. Strong Signals

- Approval decisions are concurrency-hardened. `ApprovalRequestsService.transitionPendingRequest()` uses conditional `updateMany(... status: 'pending_approval' ...)` inside an RLS transaction, then re-reads state to return a typed conflict if another actor already decided the request. See `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-requests.service.ts:69`.
- The approval callback processors are intentionally idempotent on the happy path. Each one re-reads the target entity, requires the expected pre-callback state, and self-heals already-completed cases instead of blindly re-applying the transition. See `/Users/ram/Desktop/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts:83`, `/Users/ram/Desktop/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts:84`, and `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/announcement-approval-callback.processor.ts:83`.
- Notification delivery has layered recovery. `dispatch-notifications` records per-row failures and computes `next_retry_at`, `retry-failed-notifications` requeues eligible failed rows, and the channel fallback chain degrades `whatsapp -> sms -> email -> in_app`. See `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts:656` and `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/retry-failed.processor.ts:41`.
- Platform-level monitoring exists beyond basic health endpoints. There is a DLQ scan across all queues and a canary ping/echo/check loop across critical queues with Sentry alerts. See `/Users/ram/Desktop/SDB/apps/worker/src/processors/monitoring/dlq-monitor.processor.ts:21` and `/Users/ram/Desktop/SDB/apps/worker/src/processors/monitoring/canary.processor.ts:23`.
- The approval reconciliation cron has explicit stale-age and retry ceilings instead of retrying immediately and indefinitely. See `/Users/ram/Desktop/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.ts:21` and `/Users/ram/Desktop/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.ts:64`.

C. Inferences

- The codebase has stronger execution safety than observability safety in the sampled paths. Worker jobs often validate state, tenant scope, and retry bounds correctly, but the health and callback-reporting surfaces lag behind those protections.
- Approval callback recovery was clearly designed as an operationally visible system, but the persisted callback-state contract has drifted enough that operators cannot rely on the callback-health numbers or filters as written.
- Cron safety depends heavily on startup registration plus log/Sentry monitoring. The repo has backstops, but the primary `/health` surfaces do not prove that repeatable schedulers are still present or that omitted queues are healthy.

D. Top Findings

1. Title: The unexpected-state approval self-heal path writes a 24-character status into a `VARCHAR(20)` column
   Severity: High
   Confidence: High
   Why it matters: The worker callback processors try to stop endless retries by marking unexpected target states as `callback_status = 'skipped_unexpected_state'`. That value is 24 characters long, but `approval_requests.callback_status` is declared as `VARCHAR(20)`. In the exact branch that is supposed to self-heal an unexpected state, the update will fail at the database layer, the transaction will abort, and reconciliation will keep seeing the request as unresolved.
   Evidence: `/Users/ram/Desktop/SDB/packages/prisma/schema.prisma:1398` limits the column to `String? @db.VarChar(20)`. The invoice, payroll, and announcement callback processors all write `callback_status: 'skipped_unexpected_state'` in their unexpected-state branch at `/Users/ram/Desktop/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts:91`, `/Users/ram/Desktop/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts:92`, and `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/announcement-approval-callback.processor.ts:91`. A direct shell length check returned `24` for `skipped_unexpected_state`.
   Fix direction: Replace ad-hoc callback status strings with a bounded shared enum that fits the column, keep detailed reason text in `callback_error`, and add a regression test that exercises the unexpected-state self-heal branch against the real schema limit.

2. Title: Approval callback health/reporting is internally inconsistent and undercounts successful callbacks
   Severity: Medium
   Confidence: High
   Why it matters: The callback model currently splits truth across `status` and `callback_status` in a way the reporting code does not actually follow. Successful workers move requests from `approved` to `executed`, but `getCallbackHealth()` only counts rows where `status = 'approved'`. That means successful callbacks disappear from the health summary. On top of that, workers persist `already_completed` and `skipped_unexpected_state`, while shared types, filter schemas, and the approval detail UI only understand `pending | executed | failed`.
   Evidence: The state-machine contract says `approved -> [executed]` at `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md:481`. Successful callback workers write `status: 'executed', callback_status: 'executed'` at `/Users/ram/Desktop/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts:113`, `/Users/ram/Desktop/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts:328`, and `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/announcement-approval-callback.processor.ts:113`. But `getCallbackHealth()` counts only `status: 'approved'` rows at `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-requests.service.ts:591`. Shared types and filter schema only allow `pending | executed | failed` at `/Users/ram/Desktop/SDB/packages/shared/src/types/approval.ts:26` and `/Users/ram/Desktop/SDB/packages/shared/src/schemas/approval.schema.ts:37`, while the approval detail page hard-codes the same three-value assumption at `/Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/approvals/[id]/page.tsx:48` and `/Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/approvals/[id]/page.tsx:286`.
   Fix direction: Make one shared callback outcome enum authoritative, include every persisted value in shared types/UI/filtering, and compute callback health across the real lifecycle states instead of only `status = 'approved'`.

3. Title: Admin health collapses worker degradation into a generic “up” signal
   Severity: Medium
   Confidence: High
   Why it matters: The worker service can detect BullMQ degradation, but the admin health path does not preserve that information. The worker health service marks itself `degraded` when BullMQ is down, yet the worker controller still returns HTTP 200 for degraded, and the API-side `checkWorker()` only looks at HTTP status. That means the admin dashboard reports the worker as `up` unless the worker is fully unhealthy. The same worker health code also ignores stuck-job counts when deriving its own overall status, so a queue can be visibly stuck while worker health still reads `healthy`.
   Evidence: Worker health sets `status = 'degraded'` when BullMQ is down at `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.service.ts:111`, and `checkBullMQ()` only sets its own `status` based on queue-call failures, not `stuck_jobs`, at `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.service.ts:155`. The worker `/health` controller returns 503 only for `unhealthy`, not `degraded`, at `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.controller.ts:12`. API `checkWorker()` only checks `response.ok` and never reads the response body at `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.service.ts:498`, and admin aggregation only downgrades on `worker.status === 'down'` at `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.service.ts:276`.
   Fix direction: Parse the worker health JSON body in API admin health, propagate `degraded` instead of flattening it to `up`, and let worker health degrade on stuck critical jobs and other queue alerts, not just queue-call exceptions.

4. Title: Cron health coverage is incomplete and does not verify scheduler registration
   Severity: Medium
   Confidence: High
   Why it matters: The repo relies on many repeatable BullMQ schedulers, but the health surfaces never verify that those repeatable jobs are still registered. This is already documented as a homework danger zone. In addition, API health watches only 5 queues and worker health 10 out of 21, leaving large parts of the background system outside the green/red signal entirely. A deleted repeatable job, a missed registration after deploy, or a dead omitted queue can leave health green while automation is silently stopped.
   Evidence: The danger-zone note for homework explicitly says there is “no health check to detect missing cron registrations” at `/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md:550`. `CronSchedulerService` only registers repeatable jobs during `onModuleInit()` at `/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts:77`, `/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts:526`, `/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts:610`, and `/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts:711`. Queue inventory defines 21 queues at `/Users/ram/Desktop/SDB/apps/worker/src/base/queue.constants.ts:1`, but API health tracks only 5 at `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.service.ts:18`, and worker health tracks 10 at `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.service.ts:44`. A targeted repo search found no `getRepeatableJobs`, `getJobSchedulers`, or similar scheduler introspection in the health or monitoring paths.
   Fix direction: Add an explicit scheduler-registry check for named repeatable jobs, surface missing schedulers in `/health`, and either expand monitored queues or formally document which queues are intentionally excluded and why.

5. Title: The API Meilisearch health probe reports “up” even when the search path has fallen back
   Severity: Low
   Confidence: Medium
   Why it matters: Search may be degraded while the health endpoint stays green. The Meilisearch client returns `null` on search failure without clearing `available`, and the health check interprets that path as healthy as long as `available` is true. That gives a false-positive dependency signal and hides fallback-mode operation.
   Evidence: `MeilisearchClient.search()` returns `null` on failure at `/Users/ram/Desktop/SDB/apps/api/src/modules/search/meilisearch.client.ts:81`. `HealthService.checkMeilisearch()` returns `up` after calling `search()` whenever `available` is true, and only returns `down` when `available` is false or the call itself throws, at `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.service.ts:367`.
   Fix direction: Use a direct Meilisearch health endpoint for health checks, or treat a `null` search result as degraded/down and log the probe failure.

E. Files Reviewed

- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md`
- `/Users/ram/Desktop/SDB/docs/architecture/event-job-catalog.md`
- `/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md`
- `/Users/ram/Desktop/SDB/apps/worker/src/base/tenant-aware-job.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/base/queue.constants.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-requests.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-requests.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-workflows.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-workflows.controller.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/announcement-approval-callback.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/notifications/dispatch-queued.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/retry-failed.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/monitoring/dlq-monitor.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/monitoring/canary.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.service.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/health/worker-health.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/health/health.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/health/admin-health.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/meilisearch.client.ts`
- `/Users/ram/Desktop/SDB/packages/shared/src/types/approval.ts`
- `/Users/ram/Desktop/SDB/packages/shared/src/schemas/approval.schema.ts`
- `/Users/ram/Desktop/SDB/packages/prisma/schema.prisma`
- `/Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/approvals/[id]/page.tsx`

F. Additional Commands Run

- `sed -n '1,240p' /Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `rg --files /Users/ram/Desktop/SDB/docs/architecture /Users/ram/Desktop/SDB/apps/worker/src /Users/ram/Desktop/SDB/apps/api/src/modules | rg 'state-machines\\.md|event-job-catalog\\.md|danger-zones\\.md|tenant-aware-job\\.ts|cron-scheduler\\.service\\.ts|/approvals/|health'`
- `rg -n "approval|callback|cron|retry|health|state machine|transition|notification|job" /Users/ram/Desktop/SDB/docs/architecture/state-machines.md /Users/ram/Desktop/SDB/docs/architecture/event-job-catalog.md /Users/ram/Desktop/SDB/docs/architecture/danger-zones.md`
- `rg -n "catch" /Users/ram/Desktop/SDB/apps/api/src/modules/approvals /Users/ram/Desktop/SDB/apps/api/src/modules/health /Users/ram/Desktop/SDB/apps/worker/src/health /Users/ram/Desktop/SDB/apps/worker/src/cron /Users/ram/Desktop/SDB/apps/worker/src/processors/approvals /Users/ram/Desktop/SDB/apps/worker/src/processors/communications /Users/ram/Desktop/SDB/apps/worker/src/processors/finance /Users/ram/Desktop/SDB/apps/worker/src/processors/payroll`
- `rg -n "attempts:|backoff:|maxStalledCount|lockDuration|stalledInterval|repeat:|jobId:" /Users/ram/Desktop/SDB/apps/worker/src/processors/approvals /Users/ram/Desktop/SDB/apps/worker/src/processors/communications /Users/ram/Desktop/SDB/apps/worker/src/processors/finance /Users/ram/Desktop/SDB/apps/worker/src/processors/payroll /Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts`
- `rg -n "already_completed|skipped_unexpected_state|callback_status" /Users/ram/Desktop/SDB/packages/shared /Users/ram/Desktop/SDB/packages/prisma /Users/ram/Desktop/SDB/apps/api/src/modules/approvals /Users/ram/Desktop/SDB/apps/worker/src/processors/finance /Users/ram/Desktop/SDB/apps/worker/src/processors/payroll /Users/ram/Desktop/SDB/apps/worker/src/processors/communications`
- `printf 'skipped_unexpected_state' | wc -c`
- `printf 'already_completed' | wc -c`
- `node -e "...compare queue inventory vs API/worker health queue coverage..."`
- `rg -n "getJobSchedulers|getRepeatableJobs|upsertJobScheduler|scheduler|repeatable" /Users/ram/Desktop/SDB/apps/api/src/modules/health /Users/ram/Desktop/SDB/apps/worker/src/health /Users/ram/Desktop/SDB/apps/worker/src/cron /Users/ram/Desktop/SDB/apps/worker/src/processors/monitoring`

G. Score

6/10

H. Confidence in this review

High for the sampled approval, worker, retry, cron, and health paths named in the brief. Medium for repo-wide reliability beyond those surfaces. This is a targeted review, not full-coverage proof of all failure paths.
