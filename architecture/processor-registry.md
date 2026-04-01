# Worker Processor Registry

> **Purpose**: Track every BullMQ worker processor, its domain owner, and whether a co-located spec exists.
> **Maintenance**: Update this file whenever a processor is added, removed, renamed, or gains/loses a matching `*.processor.spec.ts`.
> **Last verified**: 2026-04-01

---

## Snapshot

- Total worker processors: `87`
- Processors with matching specs: `87`
- Processors missing specs: `0`
- Worker coverage snapshot at verification time:
  - Statements: `80.22%`
  - Branches: `57.70%`
  - Functions: `84.32%`
  - Lines: `81.22%`
- Coverage guardrails enforced in `apps/worker/jest.config.js`:
  - Statements: `28%`
  - Branches: `20%`
  - Functions: `31%`
  - Lines: `28%`
- Verification commands:
  - `pnpm --filter @school/worker test -- --runInBand --coverageReporters=text-summary`
  - `pnpm check:worker-processor-specs`
  - `pnpm --filter @school/worker test:integration`
- Critical queue integration coverage: `notifications`, `behaviour`, and `compliance` now run against real Redis and Postgres via `apps/worker/test/worker-queues.integration-spec.ts`.
- Checklist coverage added during Worker Test Health Phase C:
  - tenant-isolation assertions for cross-tenant processors
  - retry exhaustion and failure-path coverage for dispatch flows
  - idempotency rerun coverage for processors with external side effects

## Coverage By Owner

| Owner          | Processors | Covered | Missing |
| -------------- | ---------: | ------: | ------: |
| admissions     |          1 |       1 |       0 |
| approvals      |          1 |       1 |       0 |
| attendance     |          4 |       4 |       0 |
| behaviour      |         16 |      16 |       0 |
| communications |          7 |       7 |       0 |
| compliance     |          3 |       3 |       0 |
| early-warning  |          3 |       3 |       0 |
| engagement     |          8 |       8 |       0 |
| finance        |          2 |       2 |       0 |
| gradebook      |          4 |       4 |       0 |
| homework       |          4 |       4 |       0 |
| imports        |          3 |       3 |       0 |
| notifications  |          2 |       2 |       0 |
| pastoral       |          8 |       8 |       0 |
| payroll        |          3 |       3 |       0 |
| regulatory     |          5 |       5 |       0 |
| scheduling     |          2 |       2 |       0 |
| search         |          2 |       2 |       0 |
| security       |          3 |       3 |       0 |
| wellbeing      |          6 |       6 |       0 |

## Processor Inventory

| Owner          | Processor                                      | Spec status | Spec file                                                                                    |
| -------------- | ---------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| admissions     | `admissions-auto-expiry.processor.ts`          | covered     | `apps/worker/src/processors/admissions-auto-expiry.processor.spec.ts`                        |
| approvals      | `callback-reconciliation.processor.ts`         | covered     | `apps/worker/src/processors/approvals/callback-reconciliation.processor.spec.ts`             |
| attendance     | `attendance-auto-lock.processor.ts`            | covered     | `apps/worker/src/processors/attendance-auto-lock.processor.spec.ts`                          |
| attendance     | `attendance-pattern-detection.processor.ts`    | covered     | `apps/worker/src/processors/attendance-pattern-detection.processor.spec.ts`                  |
| attendance     | `attendance-pending-detection.processor.ts`    | covered     | `apps/worker/src/processors/attendance-pending-detection.processor.spec.ts`                  |
| attendance     | `attendance-session-generation.processor.ts`   | covered     | `apps/worker/src/processors/attendance-session-generation.processor.spec.ts`                 |
| behaviour      | `attachment-scan.processor.ts`                 | covered     | `apps/worker/src/processors/behaviour/attachment-scan.processor.spec.ts`                     |
| behaviour      | `break-glass-expiry.processor.ts`              | covered     | `apps/worker/src/processors/behaviour/break-glass-expiry.processor.spec.ts`                  |
| behaviour      | `check-awards.processor.ts`                    | covered     | `apps/worker/src/processors/behaviour/check-awards.processor.spec.ts`                        |
| behaviour      | `critical-escalation.processor.ts`             | covered     | `apps/worker/src/processors/behaviour/critical-escalation.processor.spec.ts`                 |
| behaviour      | `cron-dispatch.processor.ts`                   | covered     | `apps/worker/src/processors/behaviour/cron-dispatch.processor.spec.ts`                       |
| behaviour      | `detect-patterns.processor.ts`                 | covered     | `apps/worker/src/processors/behaviour/detect-patterns.processor.spec.ts`                     |
| behaviour      | `digest-notifications.processor.ts`            | covered     | `apps/worker/src/processors/behaviour/digest-notifications.processor.spec.ts`                |
| behaviour      | `evaluate-policy.processor.ts`                 | covered     | `apps/worker/src/processors/behaviour/evaluate-policy.processor.spec.ts`                     |
| behaviour      | `guardian-restriction-check.processor.ts`      | covered     | `apps/worker/src/processors/behaviour/guardian-restriction-check.processor.spec.ts`          |
| behaviour      | `parent-notification.processor.ts`             | covered     | `apps/worker/src/processors/behaviour/parent-notification.processor.spec.ts`                 |
| behaviour      | `partition-maintenance.processor.ts`           | covered     | `apps/worker/src/processors/behaviour/partition-maintenance.processor.spec.ts`               |
| behaviour      | `refresh-mv.processor.ts`                      | covered     | `apps/worker/src/processors/behaviour/refresh-mv.processor.spec.ts`                          |
| behaviour      | `retention-check.processor.ts`                 | covered     | `apps/worker/src/processors/behaviour/retention-check.processor.spec.ts`                     |
| behaviour      | `sla-check.processor.ts`                       | covered     | `apps/worker/src/processors/behaviour/sla-check.processor.spec.ts`                           |
| behaviour      | `suspension-return.processor.ts`               | covered     | `apps/worker/src/processors/behaviour/suspension-return.processor.spec.ts`                   |
| behaviour      | `task-reminders.processor.ts`                  | covered     | `apps/worker/src/processors/behaviour/task-reminders.processor.spec.ts`                      |
| communications | `announcement-approval-callback.processor.ts`  | covered     | `apps/worker/src/processors/communications/announcement-approval-callback.processor.spec.ts` |
| communications | `dispatch-notifications.processor.ts`          | covered     | `apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts`         |
| communications | `inquiry-notification.processor.ts`            | covered     | `apps/worker/src/processors/communications/inquiry-notification.processor.spec.ts`           |
| communications | `ip-cleanup.processor.ts`                      | covered     | `apps/worker/src/processors/communications/ip-cleanup.processor.spec.ts`                     |
| communications | `publish-announcement.processor.ts`            | covered     | `apps/worker/src/processors/communications/publish-announcement.processor.spec.ts`           |
| communications | `retry-failed.processor.ts`                    | covered     | `apps/worker/src/processors/communications/retry-failed.processor.spec.ts`                   |
| communications | `stale-inquiry-detection.processor.ts`         | covered     | `apps/worker/src/processors/communications/stale-inquiry-detection.processor.spec.ts`        |
| compliance     | `compliance-execution.processor.ts`            | covered     | `apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts`               |
| compliance     | `deadline-check.processor.ts`                  | covered     | `apps/worker/src/processors/compliance/deadline-check.processor.spec.ts`                     |
| compliance     | `retention-enforcement.processor.ts`           | covered     | `apps/worker/src/processors/compliance/retention-enforcement.processor.spec.ts`              |
| early-warning  | `compute-daily.processor.ts`                   | covered     | `apps/worker/src/processors/early-warning/compute-daily.processor.spec.ts`                   |
| early-warning  | `compute-student.processor.ts`                 | covered     | `apps/worker/src/processors/early-warning/compute-student.processor.spec.ts`                 |
| early-warning  | `weekly-digest.processor.ts`                   | covered     | `apps/worker/src/processors/early-warning/weekly-digest.processor.spec.ts`                   |
| engagement     | `cancel-event.processor.ts`                    | covered     | `apps/worker/src/processors/engagement/cancel-event.processor.spec.ts`                       |
| engagement     | `chase-outstanding.processor.ts`               | covered     | `apps/worker/src/processors/engagement/chase-outstanding.processor.spec.ts`                  |
| engagement     | `engagement-annual-renewal.processor.ts`       | covered     | `apps/worker/src/processors/engagement/engagement-annual-renewal.processor.spec.ts`          |
| engagement     | `engagement-conference-reminders.processor.ts` | covered     | `apps/worker/src/processors/engagement/engagement-conference-reminders.processor.spec.ts`    |
| engagement     | `engagement-distribute-forms.processor.ts`     | covered     | `apps/worker/src/processors/engagement/engagement-distribute-forms.processor.spec.ts`        |
| engagement     | `engagement-generate-trip-pack.processor.ts`   | covered     | `apps/worker/src/processors/engagement/engagement-generate-trip-pack.processor.spec.ts`      |
| engagement     | `expire-pending.processor.ts`                  | covered     | `apps/worker/src/processors/engagement/expire-pending.processor.spec.ts`                     |
| engagement     | `generate-invoices.processor.ts`               | covered     | `apps/worker/src/processors/engagement/generate-invoices.processor.spec.ts`                  |
| finance        | `invoice-approval-callback.processor.ts`       | covered     | `apps/worker/src/processors/finance/invoice-approval-callback.processor.spec.ts`             |
| finance        | `overdue-detection.processor.ts`               | covered     | `apps/worker/src/processors/finance/overdue-detection.processor.spec.ts`                     |
| gradebook      | `bulk-import.processor.ts`                     | covered     | `apps/worker/src/processors/gradebook/bulk-import.processor.spec.ts`                         |
| gradebook      | `gradebook-risk-detection.processor.ts`        | covered     | `apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.spec.ts`            |
| gradebook      | `mass-report-card-pdf.processor.ts`            | covered     | `apps/worker/src/processors/gradebook/mass-report-card-pdf.processor.spec.ts`                |
| gradebook      | `report-card-auto-generate.processor.ts`       | covered     | `apps/worker/src/processors/gradebook/report-card-auto-generate.processor.spec.ts`           |
| homework       | `completion-reminder.processor.ts`             | covered     | `apps/worker/src/processors/homework/completion-reminder.processor.spec.ts`                  |
| homework       | `digest-homework.processor.ts`                 | covered     | `apps/worker/src/processors/homework/digest-homework.processor.spec.ts`                      |
| homework       | `generate-recurring.processor.ts`              | covered     | `apps/worker/src/processors/homework/generate-recurring.processor.spec.ts`                   |
| homework       | `overdue-detection.processor.ts`               | covered     | `apps/worker/src/processors/homework/overdue-detection.processor.spec.ts`                    |
| imports        | `import-file-cleanup.processor.ts`             | covered     | `apps/worker/src/processors/imports/import-file-cleanup.processor.spec.ts`                   |
| imports        | `import-processing.processor.ts`               | covered     | `apps/worker/src/processors/imports/import-processing.processor.spec.ts`                     |
| imports        | `import-validation.processor.ts`               | covered     | `apps/worker/src/processors/imports/import-validation.processor.spec.ts`                     |
| notifications  | `dispatch-queued.processor.ts`                 | covered     | `apps/worker/src/processors/notifications/dispatch-queued.processor.spec.ts`                 |
| notifications  | `parent-daily-digest.processor.ts`             | covered     | `apps/worker/src/processors/notifications/parent-daily-digest.processor.spec.ts`             |
| pastoral       | `checkin-alert.processor.ts`                   | covered     | `apps/worker/src/processors/pastoral/checkin-alert.processor.spec.ts`                        |
| pastoral       | `escalation-timeout.processor.ts`              | covered     | `apps/worker/src/processors/pastoral/escalation-timeout.processor.spec.ts`                   |
| pastoral       | `intervention-review-reminder.processor.ts`    | covered     | `apps/worker/src/processors/pastoral/intervention-review-reminder.processor.spec.ts`         |
| pastoral       | `notify-concern.processor.ts`                  | covered     | `apps/worker/src/processors/pastoral/notify-concern.processor.spec.ts`                       |
| pastoral       | `overdue-actions.processor.ts`                 | covered     | `apps/worker/src/processors/pastoral/overdue-actions.processor.spec.ts`                      |
| pastoral       | `precompute-agenda.processor.ts`               | covered     | `apps/worker/src/processors/pastoral/precompute-agenda.processor.spec.ts`                    |
| pastoral       | `sync-behaviour-safeguarding.processor.ts`     | covered     | `apps/worker/src/processors/pastoral/sync-behaviour-safeguarding.processor.spec.ts`          |
| pastoral       | `wellbeing-flag-expiry.processor.ts`           | covered     | `apps/worker/src/processors/pastoral/wellbeing-flag-expiry.processor.spec.ts`                |
| payroll        | `approval-callback.processor.ts`               | covered     | `apps/worker/src/processors/payroll/approval-callback.processor.spec.ts`                     |
| payroll        | `mass-export.processor.ts`                     | covered     | `apps/worker/src/processors/payroll/mass-export.processor.spec.ts`                           |
| payroll        | `session-generation.processor.ts`              | covered     | `apps/worker/src/processors/payroll/session-generation.processor.spec.ts`                    |
| regulatory     | `deadline-check.processor.ts`                  | covered     | `apps/worker/src/processors/regulatory/deadline-check.processor.spec.ts`                     |
| regulatory     | `des-returns-generate.processor.ts`            | covered     | `apps/worker/src/processors/regulatory/des-returns-generate.processor.spec.ts`               |
| regulatory     | `ppod-import.processor.ts`                     | covered     | `apps/worker/src/processors/regulatory/ppod-import.processor.spec.ts`                        |
| regulatory     | `ppod-sync.processor.ts`                       | covered     | `apps/worker/src/processors/regulatory/ppod-sync.processor.spec.ts`                          |
| regulatory     | `tusla-threshold-scan.processor.ts`            | covered     | `apps/worker/src/processors/regulatory/tusla-threshold-scan.processor.spec.ts`               |
| scheduling     | `scheduling-stale-reaper.processor.ts`         | covered     | `apps/worker/src/processors/scheduling-stale-reaper.processor.spec.ts`                       |
| scheduling     | `solver-v2.processor.ts`                       | covered     | `apps/worker/src/processors/scheduling/solver-v2.processor.spec.ts`                          |
| search         | `search-index.processor.ts`                    | covered     | `apps/worker/src/processors/search-index.processor.spec.ts`                                  |
| search         | `search-reindex.processor.ts`                  | covered     | `apps/worker/src/processors/search-reindex.processor.spec.ts`                                |
| security       | `anomaly-scan.processor.ts`                    | covered     | `apps/worker/src/processors/security/anomaly-scan.processor.spec.ts`                         |
| security       | `breach-deadline.processor.ts`                 | covered     | `apps/worker/src/processors/security/breach-deadline.processor.spec.ts`                      |
| security       | `key-rotation.processor.ts`                    | covered     | `apps/worker/src/processors/security/key-rotation.processor.spec.ts`                         |
| wellbeing      | `cleanup-participation-tokens.processor.ts`    | covered     | `apps/worker/src/processors/wellbeing/cleanup-participation-tokens.processor.spec.ts`        |
| wellbeing      | `eap-refresh-check.processor.ts`               | covered     | `apps/worker/src/processors/wellbeing/eap-refresh-check.processor.spec.ts`                   |
| wellbeing      | `moderation-scan.processor.ts`                 | covered     | `apps/worker/src/processors/wellbeing/moderation-scan.processor.spec.ts`                     |
| wellbeing      | `survey-closing-reminder.processor.ts`         | covered     | `apps/worker/src/processors/wellbeing/survey-closing-reminder.processor.spec.ts`             |
| wellbeing      | `survey-open-notify.processor.ts`              | covered     | `apps/worker/src/processors/wellbeing/survey-open-notify.processor.spec.ts`                  |
| wellbeing      | `workload-metrics.processor.ts`                | covered     | `apps/worker/src/processors/wellbeing/workload-metrics.processor.spec.ts`                    |
