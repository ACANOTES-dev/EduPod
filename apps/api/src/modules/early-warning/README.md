# Early Warning

## Purpose

Aggregates risk signals across attendance, behaviour, grades, engagement, and wellbeing to compute per-student risk profiles and tier assignments. Triggers alerts and interventions when students cross configurable risk thresholds.

## Public API (Exports)

- `EarlyWarningService` — risk profile queries, tier history, cohort views
- `EarlyWarningConfigService` — tenant-level early warning configuration (thresholds, enabled flag)
- `EarlyWarningTriggerService` — enqueues `early-warning:compute-student` jobs; called by worker processors in behaviour, pastoral, and attendance modules

## Inbound Dependencies (What this module imports)

- `PrismaModule` — DB access for signal collectors, routing resolution, and trigger config checks
- BullMQ queue: `early-warning`

## Outbound Consumers (Who imports this module)

- No NestJS module imports EarlyWarningModule directly
- Worker processors in three other modules call `EarlyWarningTriggerService` indirectly by enqueuing jobs onto the `early-warning` queue:
  - `evaluate-policy.processor.ts` (behaviour) — enqueues per student after policy evaluation; can fan-out to many students for large incidents
  - `notify-concern.processor.ts` (pastoral) — enqueues for critical-severity concerns only
  - `attendance-pattern-detection.processor.ts` (attendance) — enqueues for excessive absence alerts

## BullMQ Queues

**Queue: `early-warning`** (3 retries, 5s exponential)

- `early-warning:compute-daily` — cron daily 01:00 UTC; iterates all active tenants; recomputes risk profiles for all students
- `early-warning:compute-student` — on-demand; triggered by behaviour, pastoral, and attendance worker processors; recomputes a single student's risk profile
- `early-warning:weekly-digest` — cron daily 07:00 UTC; generates weekly risk summary for admins

## Cross-Module Prisma Reads

Signal collectors read directly (no service injection):

- `AttendanceSignalCollector`: `daily_attendance_summaries`, `attendance_pattern_alerts`
- `BehaviourSignalCollector`: `behaviour_incidents`, `behaviour_recognition_awards`
- `GradesSignalCollector`: assessment and grade data
- `WellbeingSignalCollector`: `pastoral_cases`, `pastoral_interventions`
- `EngagementSignalCollector`: engagement form submission data

Routing resolution reads: `class_enrolments`, `class_staff`, `staff_profiles`, `membership_roles`, `students`, `notifications`

## Key Danger Zones

- **DZ-32**: If the `early-warning` queue is down, intraday triggers from behaviour/pastoral/attendance processors are silently lost. The daily `early-warning:compute-daily` cron at 01:00 UTC provides a backstop — profiles are at most 24 hours stale.
- **DZ-32**: `evaluate-policy.processor.ts` fans out one `compute-student` job per affected student. A mass behaviour incident with many participants can generate dozens of simultaneous recompute jobs. No dedup window is applied — the same student may be recomputed multiple times safely but wastefully.
- Schema changes to `class_staff`, `staff_profiles`, or `membership_roles` affect routing resolution for tier-change notifications without any visible NestJS import dependency.
- If a tenant has `early_warning_configs.is_enabled = false`, all compute jobs are silent no-ops — no error is raised.
