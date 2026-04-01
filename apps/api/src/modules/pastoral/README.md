# Pastoral

## Purpose

Manages the student pastoral care system: wellbeing concerns, cases, check-ins, SST meetings, referrals, critical incidents, interventions, child protection liaison, parent contacts, and DSAR export. The primary hub for student wellbeing tracking across the school.

## Public API (Exports)

- `AffectedTrackingService` — tracks students affected across pastoral events
- `CaseService` — pastoral case lifecycle management
- `CheckinService` — student wellbeing check-in sessions
- `ConcernService` — concern creation and state management
- `ConcernVersionService` — versioned concern history
- `CriticalIncidentService` — critical incident management
- `InterventionService` — pastoral intervention tracking
- `NepsVisitService` — NEPS (National Educational Psychological Service) visit records
- `ParentContactService` — parent communication logging
- `PastoralDsarService` — DSAR data export for pastoral records
- `PastoralEventService` — pastoral calendar events
- `PastoralNotificationService` — concern/escalation notification dispatch
- `PastoralReportService` — pastoral reporting
- `ReferralService` — external referral management
- `SstService` — Student Support Team meeting coordination
- `StudentChronologyService` — full student pastoral history timeline

## Inbound Dependencies (What this module imports)

- `AuthModule` — guards and permission cache
- `ChildProtectionModule` — CP record linking (via `forwardRef` — circular dependency)
- `CommunicationsModule` — notification dispatch for concerns and escalations
- `PdfRenderingModule` — PDF generation for pastoral reports and concern documents
- `SequenceModule` — case/referral sequence numbers
- BullMQ queues: `pastoral`, `notifications`

## Outbound Consumers (Who imports this module)

- `ChildProtectionModule` — uses `forwardRef(PastoralModule)` to link CP records to pastoral concerns
- `ComplianceModule` — uses `forwardRef(PastoralModule)` for DSAR traversal
- `EarlyWarningModule` worker processors — read `pastoral_cases` and `pastoral_interventions` via Prisma direct (not via service injection)

## BullMQ Queues

**Queue: `pastoral`** (3 retries, 5s exponential)

- `pastoral:notify-concern` — dispatched on concern creation; notifies assigned staff and triggers escalation chain setup
- `pastoral:escalation-timeout` — re-enqueues itself with delay for multi-step escalation (see DZ-36)
- `pastoral:checkin-alert` — fired when a check-in flags concern
- `pastoral:intervention-review-reminder` — cron reminder for overdue intervention reviews
- `pastoral:overdue-actions` — cron backstop for unacknowledged high-severity concerns
- `pastoral:precompute-agenda` — precomputes SST meeting agenda on scheduling
- `pastoral:sync-behaviour-safeguarding` — syncs behaviour safeguarding data on trigger
- `pastoral:wellbeing-flag-expiry` — cron to expire old wellbeing flags

**Queue: `notifications`** — escalation and concern notifications

## Cross-Module Prisma Reads

`students`, `student_parents`, `parents`, `class_enrolments`, `class_staff`, `staff_profiles`, `academic_years`, `academic_periods`, `school_closures`, `tenant_settings`, `memberships`, `behaviour_incidents`, `behaviour_sanctions`, `safeguarding_concerns`

## Key Danger Zones

- **DZ-35**: `PastoralModule` ↔ `ChildProtectionModule` circular dependency via `forwardRef()`. Never remove `forwardRef` or use constructor injection between these two modules without careful analysis.
- **DZ-36**: Escalation self-chain (`notify-concern` → `escalation-timeout` re-enqueue). If worker crashes between commit and re-enqueue, the escalation chain silently terminates. The daily `pastoral:overdue-actions` cron provides a backstop with up to 24-hour lag.
