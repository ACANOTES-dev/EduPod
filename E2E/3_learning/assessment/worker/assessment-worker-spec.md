# Assessment Module — Worker / Background Job Test Specification

**Module:** Assessment (Gradebook + Report Card processors)
**Surface:** BullMQ queues, processors, cron schedulers, retry policies, dead-letter handling, cross-tenant payloads.
**Execution target:** Jest + `@nestjs/testing` with a real Redis + Postgres instance. Workers started via `apps/worker` test harness.
**Last Updated:** 2026-04-12

---

## Table of Contents

1. [Prerequisites & Harness](#1-prerequisites--harness)
2. [Queue Inventory](#2-queue-inventory)
3. [Processor Inventory](#3-processor-inventory)
4. [Cron Inventory](#4-cron-inventory)
5. [Tenant-Aware Payload Enforcement](#5-tenant-aware-payload-enforcement)
6. [REPORT_CARD_GENERATION_JOB](#6-report_card_generation_job)
7. [REPORT_CARD_AUTO_GENERATE_JOB](#7-report_card_auto_generate_job)
8. [MASS_REPORT_CARD_PDF_JOB](#8-mass_report_card_pdf_job)
9. [BULK_IMPORT_PROCESS_JOB](#9-bulk_import_process_job)
10. [GRADEBOOK_DETECT_RISKS_JOB](#10-gradebook_detect_risks_job)
11. [Cron — `gradebook:detect-risks`](#11-cron--gradebookdetect-risks)
12. [Cron — `report-cards:auto-generate`](#12-cron--report-cardsauto-generate)
13. [Retry Policy & Exponential Backoff](#13-retry-policy--exponential-backoff)
14. [Dead-Letter Queue](#14-dead-letter-queue)
15. [Lock Duration & Long-Running Jobs](#15-lock-duration--long-running-jobs)
16. [Async Side-Effect Chains](#16-async-side-effect-chains)
17. [Idempotency & Replay Safety](#17-idempotency--replay-safety)
18. [Concurrency Across Workers](#18-concurrency-across-workers)
19. [Queue Observability](#19-queue-observability)
20. [Negative Scenarios](#20-negative-scenarios)
21. [Data Invariants After Job Completion](#21-data-invariants-after-job-completion)
22. [Observations](#22-observations)
23. [Sign-Off](#23-sign-off)

---

## 1. Prerequisites & Harness

| Item           | Spec                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Redis          | 7+. Empty. Connection URL in `REDIS_URL`.                                                                                                              |
| Postgres       | 15+. Schema migrated + seeded (two tenants).                                                                                                           |
| S3 / MinIO     | Bucket `edupod-test-assets` pre-provisioned. `S3_ENDPOINT` configured.                                                                                 |
| BullMQ         | v5.x (or version used in repo). Confirm `lockDuration` = 5 min on gradebook queue.                                                                     |
| Clock          | Tests use `jest.useFakeTimers('modern')` for cron schedule assertions. Real clock for queue timings.                                                   |
| Test framework | Jest + `@nestjs/testing`. Spin up `WorkerModule` in isolated test module. Use `Queue.add` to enqueue; `Worker.waitUntilFinished` to assert completion. |
| Two tenants    | Tenant A, Tenant B seeded with distinct students/classes/periods.                                                                                      |

---

## 2. Queue Inventory

Only ONE queue is relevant to the assessment module:

- **`gradebook`** — `QUEUE_NAMES.GRADEBOOK`. LockDuration: 5 minutes. Defined in `apps/worker/src/base/queue.constants.ts`.

All gradebook processors share this queue and route by job name via guard clauses.

---

## 3. Processor Inventory

| #   | Processor class                         | Job name constant               | File                                                                          | Purpose                                                                                                        |
| --- | --------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 3.1 | `GradebookQueueDispatcher` (or similar) | n/a — dispatches via job.name   | `apps/worker/src/processors/gradebook/gradebook-queue-dispatcher.ts`          | Central dispatcher. Routes incoming jobs to concrete processor by `job.name`.                                  |
| 3.2 | `ReportCardGenerationProcessor`         | `REPORT_CARD_GENERATION_JOB`    | `apps/worker/src/processors/gradebook/report-card-generation.processor.ts`    | Generates individual report card PDF for a student+period, writes to S3.                                       |
| 3.3 | `ReportCardAutoGenerateProcessor`       | `REPORT_CARD_AUTO_GENERATE_JOB` | `apps/worker/src/processors/gradebook/report-card-auto-generate.processor.ts` | Cron-fed. For ended periods per tenant, creates draft `ReportCard` rows.                                       |
| 3.4 | `MassReportCardPdfProcessor`            | `MASS_REPORT_CARD_PDF_JOB`      | `apps/worker/src/processors/gradebook/mass-report-card-pdf.processor.ts`      | Bulk PDF generation. Iterates a list of ReportCard ids, renders each, uploads to S3 under a deterministic key. |
| 3.5 | `BulkImportProcessor`                   | `BULK_IMPORT_PROCESS_JOB`       | `apps/worker/src/processors/gradebook/bulk-import.processor.ts`               | Processes uploaded XLSX/CSV; creates Grade rows in transaction. Idempotent.                                    |
| 3.6 | `GradebookRiskDetectionProcessor`       | `GRADEBOOK_DETECT_RISKS_JOB`    | `apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts`  | Cron-fed. Analyses grade trends; flags at-risk students.                                                       |

---

## 4. Cron Inventory

| #   | Name                         | Cron expression               | Payload                                      | Processor                         | What it does                                                                                                        |
| --- | ---------------------------- | ----------------------------- | -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 4.1 | `gradebook:detect-risks`     | `0 2 * * *` (daily 02:00 UTC) | `{}` (cross-tenant; worker iterates tenants) | `GradebookRiskDetectionProcessor` | For each tenant's active students, checks grading thresholds + trend triggers; creates risk markers + fires events. |
| 4.2 | `report-cards:auto-generate` | `0 3 * * *` (daily 03:00 UTC) | `{}` (cross-tenant)                          | `ReportCardAutoGenerateProcessor` | For each tenant, finds academic periods ended within last 3 days without report cards; creates drafts.              |

Cron registration: `CronSchedulerService.onModuleInit`. `jobId`: `cron:${JOB_CONSTANT}`. Retention: `removeOnComplete: 10`, `removeOnFail: 50`.

---

## 5. Tenant-Aware Payload Enforcement

Every non-cross-tenant job payload MUST include `tenant_id`. Base class `TenantAwareJob` sets `SET LOCAL app.current_tenant_id` before DB ops.

| #   | Scenario                                                           | Expected                                                                                                                                 | Pass/Fail |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Enqueue `REPORT_CARD_GENERATION_JOB` without `tenant_id`           | Enqueue-time validation throws `TENANT_ID_REQUIRED`. Job NOT added to queue.                                                             |           |
| 5.2 | Enqueue `REPORT_CARD_GENERATION_JOB` with `tenant_id`              | Accepted. Worker pulls it, sets RLS context before any DB call.                                                                          |           |
| 5.3 | Enqueue `BULK_IMPORT_PROCESS_JOB` without `tenant_id`              | Rejected at enqueue time.                                                                                                                |           |
| 5.4 | Enqueue `MASS_REPORT_CARD_PDF_JOB` without `tenant_id`             | Rejected.                                                                                                                                |           |
| 5.5 | Cron-fired `GRADEBOOK_DETECT_RISKS_JOB`                            | Payload `{}` — cross-tenant by design. Processor iterates `SELECT id FROM tenants WHERE status='active'` and sets RLS per tenant.        |           |
| 5.6 | Cron-fired `REPORT_CARD_AUTO_GENERATE_JOB`                         | Same cross-tenant pattern.                                                                                                               |           |
| 5.7 | Malicious payload: `tenant_id` for Tenant A but caller is Tenant B | Enqueue side should accept (ids are opaque). Processor sets RLS to `tenant_id`; DB operations constrained to that tenant. No cross-leak. |           |
| 5.8 | Payload `tenant_id` is invalid UUID                                | Processor throws before setting RLS; job fails; retry schedule kicks in.                                                                 |           |

---

## 6. REPORT_CARD_GENERATION_JOB

| #   | Scenario                                         | Expected                                                                                                                                           | Pass/Fail |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Happy path: enqueue for 1 student + period       | Job completes < 30s. `ReportCard` row `status=draft` created. PDF uploaded to S3 key `report-cards/{tenant_id}/{student_id}/{report_card_id}.pdf`. |           |
| 6.2 | Report card already exists for (student, period) | Processor updates existing row (idempotent) OR skips with log. Document actual.                                                                    |           |
| 6.3 | Tenant has no report card template               | Processor uses default template. No crash.                                                                                                         |           |
| 6.4 | Tenant has custom template (uploaded)            | PDF uses the custom template.                                                                                                                      |           |
| 6.5 | PDF rendering throws                             | Job fails. Retry kicks in (attempts 3 by default). On final fail → dead-letter.                                                                    |           |
| 6.6 | S3 upload fails                                  | Retry. If persistent, dead-letter. ReportCard row remains in limbo — flagged by daily cleanup.                                                     |           |
| 6.7 | PDF size check                                   | Generated PDF > 20 MB rejected (likely corrupted). Log + fail.                                                                                     |           |
| 6.8 | Metadata                                         | PDF metadata: Title = "Report Card — {student} — {period}"; Author = school name.                                                                  |           |

---

## 7. REPORT_CARD_AUTO_GENERATE_JOB

| #   | Scenario                                         | Expected                                                                                                                                                                                   | Pass/Fail |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 7.1 | Cron fires at 03:00 UTC                          | Processor iterates all active tenants; for each tenant, finds academic periods that ended in the last 3 days; for each period, enqueues `REPORT_CARD_GENERATION_JOB` per eligible student. |           |
| 7.2 | Tenant has no ended periods                      | No enqueue; log "no action".                                                                                                                                                               |           |
| 7.3 | Tenant has auto-generate disabled (setting)      | Skip. Log.                                                                                                                                                                                 |           |
| 7.4 | Student already has a report card for the period | Skip that student. No duplicate rows.                                                                                                                                                      |           |
| 7.5 | 1000 students in a tenant                        | 1000 enqueues; each completes independently. Queue utilisation is bounded by worker concurrency setting.                                                                                   |           |
| 7.6 | Runs twice in same day (manual re-trigger)       | No duplicate report cards.                                                                                                                                                                 |           |
| 7.7 | Error in one tenant                              | Other tenants still processed. Per-tenant try/catch.                                                                                                                                       |           |

---

## 8. MASS_REPORT_CARD_PDF_JOB

| #   | Scenario                                  | Expected                                                                                                               | Pass/Fail |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Enqueue with 500 report_card_ids          | Processor iterates, renders each, uploads to S3. Completion time budget: ≤ 5 min per 100 PDFs on a 4-core machine.     |           |
| 8.2 | One id is invalid                         | Skip that id; continue. Log error. Final result: `{ rendered: 499, failed: 1 }`.                                       |           |
| 8.3 | Job interrupted mid-stream (worker crash) | On restart, job retries from start OR uses checkpointing (document). At minimum: re-rendering same PDFs is idempotent. |           |
| 8.4 | S3 key collision                          | Overwrite; new PDF replaces old. Version stored in metadata.                                                           |           |
| 8.5 | Batch size 10k                            | Long job ≥ 30 min — ensure `lockDuration` extended or job chunked.                                                     |           |
| 8.6 | Post-completion event                     | `report-cards:bulk-generated` event to admin inbox with summary counts.                                                |           |

---

## 9. BULK_IMPORT_PROCESS_JOB

| #   | Scenario                               | Expected                                                                                               | Pass/Fail |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| 9.1 | Happy path: 100-row XLSX               | Job completes < 30s. `Grade` rows created/updated. `edited_by_user_id` = submitter.                    |           |
| 9.2 | Invalid row mid-file                   | Transaction rollback OR per-row rejection. Document actual. Preferred: per-row with error list.        |           |
| 9.3 | File larger than memory limit (10 MB+) | Streaming parser. No OOM.                                                                              |           |
| 9.4 | Duplicate run (same file)              | Idempotent via `(assessment_id, student_id)` upsert. No duplicates.                                    |           |
| 9.5 | Unknown student id                     | Skip; error listed.                                                                                    |           |
| 9.6 | Score > max_score                      | Reject row; error listed.                                                                              |           |
| 9.7 | Job cancelled by admin                 | Partial progress persisted; no corruption.                                                             |           |
| 9.8 | Post-completion                        | Event fired to admin inbox: `{ imported: N, skipped: M, errors: [...] }`. Admin receives notification. |           |

---

## 10. GRADEBOOK_DETECT_RISKS_JOB

| #    | Scenario                                | Expected                                                                                                                                                                          | Pass/Fail |
| ---- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Happy path                              | Processor iterates active tenants; for each: loads grade snapshots, applies risk-detection rules (e.g. 3 consecutive failing grades, GPA drop > 0.5), writes `at_risk_flag` rows. |           |
| 10.2 | No grades                               | No flags. Log "skipped".                                                                                                                                                          |           |
| 10.3 | Tenant-level setting disables detection | Skip.                                                                                                                                                                             |           |
| 10.4 | Duplicate run                           | Same-day idempotent (upsert flag by `(student_id, rule_key, period_id)`).                                                                                                         |           |
| 10.5 | Flag retirement                         | If condition no longer holds, mark `resolved_at = now()`.                                                                                                                         |           |
| 10.6 | Event                                   | New flags → `wellbeing:at-risk-student` event to pastoral module.                                                                                                                 |           |
| 10.7 | Frequency setting                       | Per-tenant "frequency" setting (daily / weekly). Processor respects via `last_run_at` check.                                                                                      |           |
| 10.8 | RLS set per tenant                      | No cross-tenant leak.                                                                                                                                                             |           |

---

## 11. Cron — `gradebook:detect-risks`

| #    | Scenario                    | Expected                                                                                                                    | Pass/Fail |
| ---- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Registration                | On `OnModuleInit`, `CronSchedulerService` calls `queue.add(... { jobId: 'cron:GRADEBOOK_DETECT_RISKS_JOB', repeat: ... })`. |           |
| 11.2 | Dedup on restart            | Same jobId → no duplicate repeatable.                                                                                       |           |
| 11.3 | Cron expression             | `0 2 * * *`.                                                                                                                |           |
| 11.4 | Retention                   | `removeOnComplete: 10`, `removeOnFail: 50`.                                                                                 |           |
| 11.5 | Crash recovery              | If scheduler crashes between registrations, BullMQ's repeatable pattern re-schedules.                                       |           |
| 11.6 | Manual trigger (admin tool) | `RemoteTrigger` or equivalent — enqueues ad-hoc `GRADEBOOK_DETECT_RISKS_JOB` with `{}` payload.                             |           |

---

## 12. Cron — `report-cards:auto-generate`

| #    | Scenario           | Expected                                                    | Pass/Fail |
| ---- | ------------------ | ----------------------------------------------------------- | --------- |
| 12.1 | Registration       | `cron:REPORT_CARD_AUTO_GENERATE_JOB` jobId. `0 3 * * *`.    |           |
| 12.2 | Dedup on restart   | No duplicates.                                              |           |
| 12.3 | Retention          | `removeOnComplete: 10`, `removeOnFail: 50`.                 |           |
| 12.4 | Downstream enqueue | Spawns N `REPORT_CARD_GENERATION_JOB` instances per tenant. |           |

---

## 13. Retry Policy & Exponential Backoff

| #    | Scenario                                        | Expected                                                                               | Pass/Fail |
| ---- | ----------------------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| 13.1 | Transient DB failure mid-job                    | Retry with exponential backoff: 1min, 2min, 4min (or repo-configured). Max 5 attempts. |           |
| 13.2 | Permanent failure (validation error)            | No retry. Fail fast. Dead-letter.                                                      |           |
| 13.3 | S3 5xx                                          | Retry with backoff.                                                                    |           |
| 13.4 | OpenAI API rate limit (AI jobs, if any enqueue) | Retry with longer backoff.                                                             |           |
| 13.5 | Job timeout (exceeds lock duration)             | Lock released. Another worker picks up. Processor MUST be idempotent.                  |           |

---

## 14. Dead-Letter Queue

| #    | Scenario                   | Expected                                                                                       | Pass/Fail |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 14.1 | Job exceeds max attempts   | Moved to dead-letter (or BullMQ's "failed" state). `removeOnFail: 50` retains recent failures. |           |
| 14.2 | Admin inspects dead-letter | Bull Board or equivalent admin UI displays the job + last error.                               |           |
| 14.3 | Manual requeue             | Admin can re-enqueue a failed job. Idempotent processing prevents double-effect.               |           |
| 14.4 | Metrics                    | Prometheus/Grafana counter: `gradebook_job_failed_total{job=...}`.                             |           |

---

## 15. Lock Duration & Long-Running Jobs

| #    | Scenario                                | Expected                                                                                       | Pass/Fail |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 15.1 | `gradebook` queue `lockDuration: 5 min` | Verified in `queue.constants.ts`.                                                              |           |
| 15.2 | Job approaches 4 min                    | Processor calls `job.extendLock(30_000)` periodically — confirm implementation.                |           |
| 15.3 | Worker crash mid-job                    | Lock expires after 5 min; another worker picks up. Processor resumes or restarts idempotently. |           |
| 15.4 | 10 min `MASS_REPORT_CARD_PDF_JOB`       | Processor chunks work into sub-jobs OR extends lock. No stuck lock.                            |           |

---

## 16. Async Side-Effect Chains

Document the chain of side effects for each triggering action.

| #     | Trigger                       | Chain                                                                                                                                                                                                                                        | Pass/Fail |
| ----- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1  | Admin publishes period grades | `GradePublishingService.publishPeriod` → updates `grades_published_at` on assessments → emits `parent:grades-published` → Communications enqueues inbox message per parent → optionally triggers `REPORT_CARD_AUTO_GENERATE_JOB` if setting. |           |
| 16.2  | Admin approves config         | `AssessmentCategoriesService.review` → UPDATE status → emits `gradebook:config-approved` → inbox message to submitter.                                                                                                                       |           |
| 16.3  | Admin approves unlock         | `UnlockRequestService.review` → UPDATE status + assessment status → emits `gradebook:unlock-approved` → inbox message.                                                                                                                       |           |
| 16.4  | Bulk import                   | Admin uploads → `validate` → `process` enqueues `BULK_IMPORT_PROCESS_JOB` → processor creates grades → emits `gradebook:import-complete` → inbox.                                                                                            |           |
| 16.5  | Report card auto-generation   | Cron → for each tenant, each student with eligible period → enqueue `REPORT_CARD_GENERATION_JOB` → processor creates draft `ReportCard` + renders PDF + uploads S3.                                                                          |           |
| 16.6  | Admin publishes report card   | `ReportCardsService.publish` → UPDATE `status='published'` + `published_at` → enqueue `REPORT_CARD_VERIFICATION_TOKEN_JOB` (per parent, if such job exists) → Communications sends email to each parent with verification link.              |           |
| 16.7  | Risk detection                | Daily cron → flags update → emits `wellbeing:at-risk-student` → pastoral module creates case file.                                                                                                                                           |           |
| 16.8  | Config rejection              | Emits `gradebook:config-rejected` with reason → inbox.                                                                                                                                                                                       |           |
| 16.9  | Grade override                | Direct UPDATE; no worker chain. Emits `gradebook:grade-overridden` (optional) for audit log.                                                                                                                                                 |           |
| 16.10 | GDPR DSAR export              | DSAR triggers traversal → gradebook data added → bundled in export package → sent.                                                                                                                                                           |           |

---

## 17. Idempotency & Replay Safety

Dead-letter jobs MUST be replay-safe. Each processor documented:

| #    | Processor                         | Idempotency strategy                                               | Pass/Fail |
| ---- | --------------------------------- | ------------------------------------------------------------------ | --------- |
| 17.1 | `ReportCardGenerationProcessor`   | Upsert by (student, period); re-render overwrites S3 key.          |           |
| 17.2 | `ReportCardAutoGenerateProcessor` | Pre-checks existence of ReportCard row before enqueuing child job. |           |
| 17.3 | `MassReportCardPdfProcessor`      | Each PDF key deterministic by id; overwrites safely.               |           |
| 17.4 | `BulkImportProcessor`             | Upsert grades by (assessment_id, student_id); no double-creation.  |           |
| 17.5 | `GradebookRiskDetectionProcessor` | Flag upsert by (student, rule_key, period). Resolves stale flags.  |           |

---

## 18. Concurrency Across Workers

| #    | Scenario                                       | Expected                                                                          | Pass/Fail |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| 18.1 | 2 workers pull 2 different jobs simultaneously | Both succeed. Transactions isolate.                                               |           |
| 18.2 | 2 workers try to pull SAME job                 | BullMQ's lock prevents. One wins.                                                 |           |
| 18.3 | Bulk import + publish running simultaneously   | Grades created by import appear when publish finishes. Transaction-level safety.  |           |
| 18.4 | Two cron workers in HA setup                   | `CronSchedulerService` designed for single-registration; confirm dedup via jobId. |           |

---

## 19. Queue Observability

| #    | Metric                    | Expected                           | Pass/Fail |
| ---- | ------------------------- | ---------------------------------- | --------- |
| 19.1 | Queue depth gauge         | Exposed to Prometheus.             |           |
| 19.2 | Failed count              | Exposed.                           |           |
| 19.3 | Completion time histogram | Per-job.                           |           |
| 19.4 | Stuck-job detector        | Alert if job in "active" > 10 min. |           |
| 19.5 | Dead-letter alarm         | Alerts on failure count > 0.       |           |

---

## 20. Negative Scenarios

| #    | Scenario                               | Expected                                                          | Pass/Fail |
| ---- | -------------------------------------- | ----------------------------------------------------------------- | --------- |
| 20.1 | Enqueue with malformed JSON payload    | Processor fails; moved to dead-letter.                            |           |
| 20.2 | Redis down                             | API returns 503 on endpoint trying to enqueue; no silent failure. |           |
| 20.3 | Postgres down during job               | Processor throws; retries; eventually dead-letter.                |           |
| 20.4 | S3 down                                | Same.                                                             |           |
| 20.5 | Job with tenant_id that does not exist | Processor fails with `TENANT_NOT_FOUND`; dead-letter.             |           |
| 20.6 | Job references deleted assessment      | Processor skips with log; job succeeds (no-op).                   |           |
| 20.7 | Student deleted mid-job                | Partial completion tolerated.                                     |           |

---

## 21. Data Invariants After Job Completion

| #    | Flow                                 | Invariant                                                                                                                | Pass/Fail |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 21.1 | REPORT_CARD_GENERATION_JOB completes | `SELECT COUNT(*) FROM report_cards WHERE tenant_id = ? AND student_id = ? AND academic_period_id = ?` = 1                |           |
| 21.2 | REPORT_CARD_GENERATION_JOB completes | S3 object exists at expected key.                                                                                        |           |
| 21.3 | BULK_IMPORT_PROCESS_JOB completes    | `SELECT COUNT(*) FROM grades WHERE assessment_id = ? AND tenant_id = ?` = rows in file (minus invalid).                  |           |
| 21.4 | BULK_IMPORT_PROCESS_JOB completes    | Every grade has non-null `edited_by_user_id`.                                                                            |           |
| 21.5 | MASS_REPORT_CARD_PDF_JOB completes   | `SELECT COUNT(*) FROM report_cards WHERE pdf_s3_key IS NOT NULL AND tenant_id = ?` matches enqueued count.               |           |
| 21.6 | GRADEBOOK_DETECT_RISKS_JOB completes | `SELECT COUNT(*) FROM at_risk_flags WHERE tenant_id = ? AND resolved_at IS NULL` = number of currently at-risk students. |           |
| 21.7 | Published events emitted             | `SELECT COUNT(*) FROM events_audit WHERE kind = 'parent:grades-published' AND tenant_id = ?` = 1 per publish call.       |           |

---

## 22. Observations

1. **Queue sharing** — all gradebook workers share one queue. Verify each processor's `job.name` guard is tight. A mis-routed job could silently skip logic.
2. **lockDuration=5min** is standard; ensure long-running `MASS_REPORT_CARD_PDF_JOB` either chunks or extends locks.
3. **Cross-tenant cron handling** — `GRADEBOOK_DETECT_RISKS_JOB` with empty `{}` payload is a security-sensitive pattern. Confirm processor sets RLS per-tenant and never mixes rows.
4. **Idempotency of BulkImportProcessor** — file re-upload behaviour depends on implementation; document. Preferred: deterministic `external_id` in each row.
5. **Mass PDF job** — no checkpointing; a long job that crashes at 90% starts over. Consider checkpoint table.
6. **No separate AI worker** — AI calls happen synchronously in API controllers. Long-running AI generation blocks the HTTP request; consider moving to queue for bulk operations.
7. **Cron drift** — if deployment delays registration, first run could be skipped. Monitor `last_run_at` per cron.
8. **Dead-letter replay UI** — unsure if exposed. If not, add admin tool or Bull Board.
9. **Lock extension** — some processors may not extend lock; a long PDF render could lose lock. Verify.
10. **Partial cron failure** — if 1 tenant in 100 fails risk detection, other 99 still complete. Per-tenant try/catch necessary.

---

## 23. Sign-Off

| Reviewer | Date | Pass | Fail | Notes |
| -------- | ---- | ---- | ---- | ----- |
|          |      |      |      |       |

Worker leg passes when §§5–20 rows verify behaviour, §21 invariants hold post-completion, §§13–14 retry/dead-letter flows work, and §22 observations are triaged.

---
