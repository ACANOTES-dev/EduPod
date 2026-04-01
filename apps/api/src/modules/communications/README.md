# Communications

## Purpose

Central notification and announcement dispatch hub for the platform. Manages multi-channel delivery (email via Resend, WhatsApp and SMS via Twilio), announcement publishing, notification templates, rate limiting, audience resolution, webhook processing, and unsubscribe management.

## Public API (Exports)

- `AnnouncementsService` — announcement creation, approval gating, publishing
- `NotificationsService` — notification record management and query
- `NotificationDispatchService` — multi-channel dispatch (email/WhatsApp/SMS/in-app); hard-depends on `ConsentService` for WhatsApp gating
- `AudienceResolutionService` — resolves recipient lists from audience rules (year groups, classes, roles, etc.)
- `TemplateRendererService` — Handlebars-based notification template rendering
- `NotificationRateLimitService` — per-tenant rate limit enforcement via Redis

## Inbound Dependencies (What this module imports)

- `ConfigModule` — environment configuration for provider credentials
- `PrismaModule` — direct DB access (Communications owns the `notifications` table)
- `RedisModule` — rate limiting and notification queuing via Redis
- `ApprovalsModule` — approval workflow for announcements requiring sign-off
- `GdprModule` — via `forwardRef` for consent checks on WhatsApp dispatch and privacy notice fan-out notifications
- BullMQ queue: `notifications`

## Outbound Consumers (Who imports this module)

- `AttendanceModule` — imports `NotificationDispatchService` for parent absence alerts
- `GradebookModule` — imports `CommunicationsModule` for grade publishing and report card delivery notifications
- `PastoralModule` — imports `CommunicationsModule` for concern and escalation notifications
- `StaffWellbeingModule` — reads notification infrastructure for survey open/close notifications

## BullMQ Queues

**Queue: `notifications`** (5 retries, 3s exponential — higher retries for delivery reliability)

- `communications:on-approval` — callback when announcement approval is granted; marks announcement published; enqueues `communications:dispatch-notifications`
- `communications:publish-announcement` — direct publish path (no approval needed)
- `communications:dispatch-notifications` — fan-out per recipient via configured channels
- `notifications:parent-daily-digest` — cron hourly; aggregates attendance, grades, behaviour, homework, invoices for each parent
- `notifications:dispatch-queued` — cron every 30s; processes queued in-app notifications

## Cross-Module Prisma Reads

`notifications:parent-daily-digest` processor reads across 6+ modules directly: `daily_attendance_summaries`, `grades`, `assessments`, `behaviour_incidents`, `behaviour_recognition_awards`, `homework_assignments`, `class_enrolments`, `invoices`, `students`, `student_parents`, `users.preferred_locale`

## Key Danger Zones

- **DZ-29**: WhatsApp dispatch depends on a synchronous `ConsentService` read. Consent withdrawal must take effect immediately — never cache active-consent decisions for WhatsApp delivery.
- `CommunicationsModule` ↔ `GdprModule` circular dependency via `forwardRef()`: privacy notice publish and sub-processor register updates send in-app notifications to tenant users, so GdprModule needs CommunicationsModule but CommunicationsModule needs GdprModule for consent gating.
- Schema changes to any of the 8+ tables read by `notifications:parent-daily-digest` affect digest content without a visible import dependency — always grep for table names.
