# Worker Processor Registry

> **Purpose**: Track every BullMQ worker processor, its domain owner, and whether a co-located spec exists.
> **Maintenance**: Update this file whenever a processor is added, removed, renamed, or gains/loses a matching `*.processor.spec.ts`.
> **Last verified**: 2026-04-01

---

## Snapshot

- Total worker processors: `87`
- Processors with matching specs: `28`
- Processors missing specs: `59`
- Coverage baseline at verification time:
  - Statements: `28.24%`
  - Branches: `20.67%`
  - Functions: `31.99%`
  - Lines: `28.72%`
- Baseline command:
  - `pnpm test -- --coverage --runInBand --collectCoverageFrom='src/**/*.ts' --collectCoverageFrom='!src/**/*.spec.ts' --collectCoverageFrom='!src/main.ts' --collectCoverageFrom='!src/worker.module.ts'`

## Coverage By Owner

| Owner          | Processors | Covered | Missing |
| -------------- | ---------: | ------: | ------: |
| admissions     |          1 |       0 |       1 |
| approvals      |          1 |       1 |       0 |
| attendance     |          4 |       1 |       3 |
| behaviour      |         16 |       4 |      12 |
| communications |          7 |       1 |       6 |
| compliance     |          3 |       3 |       0 |
| early-warning  |          3 |       0 |       3 |
| engagement     |          8 |       1 |       7 |
| finance        |          2 |       1 |       1 |
| gradebook      |          4 |       1 |       3 |
| homework       |          4 |       4 |       0 |
| imports        |          3 |       0 |       3 |
| notifications  |          2 |       1 |       1 |
| pastoral       |          8 |       1 |       7 |
| payroll        |          3 |       0 |       3 |
| regulatory     |          5 |       0 |       5 |
| scheduling     |          2 |       0 |       2 |
| search         |          2 |       1 |       1 |
| security       |          3 |       2 |       1 |
| wellbeing      |          6 |       6 |       0 |

## Processor Inventory

| Owner          | Processor                                      | Spec status | Spec file                                                                             |
| -------------- | ---------------------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| admissions     | `admissions-auto-expiry.processor.ts`          | missing     | —                                                                                     |
| approvals      | `callback-reconciliation.processor.ts`         | covered     | `apps/worker/src/processors/approvals/callback-reconciliation.processor.spec.ts`      |
| attendance     | `attendance-auto-lock.processor.ts`            | covered     | `apps/worker/src/processors/attendance-auto-lock.processor.spec.ts`                   |
| attendance     | `attendance-pattern-detection.processor.ts`    | missing     | —                                                                                     |
| attendance     | `attendance-pending-detection.processor.ts`    | missing     | —                                                                                     |
| attendance     | `attendance-session-generation.processor.ts`   | missing     | —                                                                                     |
| behaviour      | `attachment-scan.processor.ts`                 | missing     | —                                                                                     |
| behaviour      | `break-glass-expiry.processor.ts`              | covered     | `apps/worker/src/processors/behaviour/break-glass-expiry.processor.spec.ts`           |
| behaviour      | `check-awards.processor.ts`                    | missing     | —                                                                                     |
| behaviour      | `critical-escalation.processor.ts`             | covered     | `apps/worker/src/processors/behaviour/critical-escalation.processor.spec.ts`          |
| behaviour      | `cron-dispatch.processor.ts`                   | missing     | —                                                                                     |
| behaviour      | `detect-patterns.processor.ts`                 | missing     | —                                                                                     |
| behaviour      | `digest-notifications.processor.ts`            | missing     | —                                                                                     |
| behaviour      | `evaluate-policy.processor.ts`                 | covered     | `apps/worker/src/processors/behaviour/evaluate-policy.processor.spec.ts`              |
| behaviour      | `guardian-restriction-check.processor.ts`      | missing     | —                                                                                     |
| behaviour      | `parent-notification.processor.ts`             | missing     | —                                                                                     |
| behaviour      | `partition-maintenance.processor.ts`           | missing     | —                                                                                     |
| behaviour      | `refresh-mv.processor.ts`                      | missing     | —                                                                                     |
| behaviour      | `retention-check.processor.ts`                 | missing     | —                                                                                     |
| behaviour      | `sla-check.processor.ts`                       | missing     | —                                                                                     |
| behaviour      | `suspension-return.processor.ts`               | covered     | `apps/worker/src/processors/behaviour/suspension-return.processor.spec.ts`            |
| behaviour      | `task-reminders.processor.ts`                  | missing     | —                                                                                     |
| communications | `announcement-approval-callback.processor.ts`  | missing     | —                                                                                     |
| communications | `dispatch-notifications.processor.ts`          | covered     | `apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts`  |
| communications | `inquiry-notification.processor.ts`            | missing     | —                                                                                     |
| communications | `ip-cleanup.processor.ts`                      | missing     | —                                                                                     |
| communications | `publish-announcement.processor.ts`            | missing     | —                                                                                     |
| communications | `retry-failed.processor.ts`                    | missing     | —                                                                                     |
| communications | `stale-inquiry-detection.processor.ts`         | missing     | —                                                                                     |
| compliance     | `compliance-execution.processor.ts`            | covered     | `apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts`        |
| compliance     | `deadline-check.processor.ts`                  | covered     | `apps/worker/src/processors/compliance/deadline-check.processor.spec.ts`              |
| compliance     | `retention-enforcement.processor.ts`           | covered     | `apps/worker/src/processors/compliance/retention-enforcement.processor.spec.ts`       |
| early-warning  | `compute-daily.processor.ts`                   | missing     | —                                                                                     |
| early-warning  | `compute-student.processor.ts`                 | missing     | —                                                                                     |
| early-warning  | `weekly-digest.processor.ts`                   | missing     | —                                                                                     |
| engagement     | `cancel-event.processor.ts`                    | missing     | —                                                                                     |
| engagement     | `chase-outstanding.processor.ts`               | missing     | —                                                                                     |
| engagement     | `engagement-annual-renewal.processor.ts`       | covered     | `apps/worker/src/processors/engagement/engagement-annual-renewal.processor.spec.ts`   |
| engagement     | `engagement-conference-reminders.processor.ts` | missing     | —                                                                                     |
| engagement     | `engagement-distribute-forms.processor.ts`     | missing     | —                                                                                     |
| engagement     | `engagement-generate-trip-pack.processor.ts`   | missing     | —                                                                                     |
| engagement     | `expire-pending.processor.ts`                  | missing     | —                                                                                     |
| engagement     | `generate-invoices.processor.ts`               | missing     | —                                                                                     |
| finance        | `invoice-approval-callback.processor.ts`       | missing     | —                                                                                     |
| finance        | `overdue-detection.processor.ts`               | covered     | `apps/worker/src/processors/finance/overdue-detection.processor.spec.ts`              |
| gradebook      | `bulk-import.processor.ts`                     | covered     | `apps/worker/src/processors/gradebook/bulk-import.processor.spec.ts`                  |
| gradebook      | `gradebook-risk-detection.processor.ts`        | missing     | —                                                                                     |
| gradebook      | `mass-report-card-pdf.processor.ts`            | missing     | —                                                                                     |
| gradebook      | `report-card-auto-generate.processor.ts`       | missing     | —                                                                                     |
| homework       | `completion-reminder.processor.ts`             | covered     | `apps/worker/src/processors/homework/completion-reminder.processor.spec.ts`           |
| homework       | `digest-homework.processor.ts`                 | covered     | `apps/worker/src/processors/homework/digest-homework.processor.spec.ts`               |
| homework       | `generate-recurring.processor.ts`              | covered     | `apps/worker/src/processors/homework/generate-recurring.processor.spec.ts`            |
| homework       | `overdue-detection.processor.ts`               | covered     | `apps/worker/src/processors/homework/overdue-detection.processor.spec.ts`             |
| imports        | `import-file-cleanup.processor.ts`             | missing     | —                                                                                     |
| imports        | `import-processing.processor.ts`               | missing     | —                                                                                     |
| imports        | `import-validation.processor.ts`               | missing     | —                                                                                     |
| notifications  | `dispatch-queued.processor.ts`                 | missing     | —                                                                                     |
| notifications  | `parent-daily-digest.processor.ts`             | covered     | `apps/worker/src/processors/notifications/parent-daily-digest.processor.spec.ts`      |
| pastoral       | `checkin-alert.processor.ts`                   | missing     | —                                                                                     |
| pastoral       | `escalation-timeout.processor.ts`              | covered     | `apps/worker/src/processors/pastoral/escalation-timeout.processor.spec.ts`            |
| pastoral       | `intervention-review-reminder.processor.ts`    | missing     | —                                                                                     |
| pastoral       | `notify-concern.processor.ts`                  | missing     | —                                                                                     |
| pastoral       | `overdue-actions.processor.ts`                 | missing     | —                                                                                     |
| pastoral       | `precompute-agenda.processor.ts`               | missing     | —                                                                                     |
| pastoral       | `sync-behaviour-safeguarding.processor.ts`     | missing     | —                                                                                     |
| pastoral       | `wellbeing-flag-expiry.processor.ts`           | missing     | —                                                                                     |
| payroll        | `approval-callback.processor.ts`               | missing     | —                                                                                     |
| payroll        | `mass-export.processor.ts`                     | missing     | —                                                                                     |
| payroll        | `session-generation.processor.ts`              | missing     | —                                                                                     |
| regulatory     | `deadline-check.processor.ts`                  | missing     | —                                                                                     |
| regulatory     | `des-returns-generate.processor.ts`            | missing     | —                                                                                     |
| regulatory     | `ppod-import.processor.ts`                     | missing     | —                                                                                     |
| regulatory     | `ppod-sync.processor.ts`                       | missing     | —                                                                                     |
| regulatory     | `tusla-threshold-scan.processor.ts`            | missing     | —                                                                                     |
| scheduling     | `scheduling-stale-reaper.processor.ts`         | missing     | —                                                                                     |
| scheduling     | `solver-v2.processor.ts`                       | missing     | —                                                                                     |
| search         | `search-index.processor.ts`                    | covered     | `apps/worker/src/processors/search-index.processor.spec.ts`                           |
| search         | `search-reindex.processor.ts`                  | missing     | —                                                                                     |
| security       | `anomaly-scan.processor.ts`                    | covered     | `apps/worker/src/processors/security/anomaly-scan.processor.spec.ts`                  |
| security       | `breach-deadline.processor.ts`                 | covered     | `apps/worker/src/processors/security/breach-deadline.processor.spec.ts`               |
| security       | `key-rotation.processor.ts`                    | missing     | —                                                                                     |
| wellbeing      | `cleanup-participation-tokens.processor.ts`    | covered     | `apps/worker/src/processors/wellbeing/cleanup-participation-tokens.processor.spec.ts` |
| wellbeing      | `eap-refresh-check.processor.ts`               | covered     | `apps/worker/src/processors/wellbeing/eap-refresh-check.processor.spec.ts`            |
| wellbeing      | `moderation-scan.processor.ts`                 | covered     | `apps/worker/src/processors/wellbeing/moderation-scan.processor.spec.ts`              |
| wellbeing      | `survey-closing-reminder.processor.ts`         | covered     | `apps/worker/src/processors/wellbeing/survey-closing-reminder.processor.spec.ts`      |
| wellbeing      | `survey-open-notify.processor.ts`              | covered     | `apps/worker/src/processors/wellbeing/survey-open-notify.processor.spec.ts`           |
| wellbeing      | `workload-metrics.processor.ts`                | covered     | `apps/worker/src/processors/wellbeing/workload-metrics.processor.spec.ts`             |
