# Gradebook

## Purpose

Manages the full academic assessment and reporting cycle: grade entry, grading scales, rubrics, standards-based grading, GPA computation, AI-assisted comments and grading, risk detection, report card generation and delivery, and transcripts.

## Public API (Exports)

- `ReportCardsService` — report card lifecycle (draft, approve, publish, deliver)
- `TranscriptsService` — student transcript generation

## Inbound Dependencies (What this module imports)

- `AcademicsModule` — academic periods, year groups, subject structures
- `AuthModule` — guards and permission cache
- `CommunicationsModule` — notification dispatch (grade publishing, report card delivery)
- `ConfigurationModule` — settings for grade thresholds, AI feature flags
- `GdprModule` — `GdprTokenService` (AI tokenisation for all 5 AI services), `AiAuditService` (Article 22 audit logs), `ConsentService` (consent gate for AI features)
- `PdfRenderingModule` — report card PDF generation
- `RedisModule` — caching for grade computations and analytics
- BullMQ queue: `gradebook`

## Outbound Consumers (Who imports this module)

- No NestJS module imports GradebookModule directly
- `notifications:parent-daily-digest` worker reads `grades` and `assessments` via Prisma direct
- `compliance` DSAR traversal reads `grades`, `period_grade_snapshots`, `student_competency_snapshots`, `student_academic_risk_alerts` via Prisma direct
- `reports` module reads assessment data via `ReportsDataAccessService`

## BullMQ Queues

**Queue: `gradebook`** (3 retries, 5s exponential)

- `gradebook:detect-risks` — cron daily 02:00 UTC; iterates all active tenants; filters to students with `ai_risk_detection` consent; checks grade thresholds; creates/updates `AcademicAlert` records
- `report-cards:auto-generate` — cron daily 03:00 UTC; checks for recently closed academic periods; auto-generates draft report cards (see DZ-06)

## Cross-Module Prisma Reads

`students`, `class_enrolments`, `class_staff`, `classes`, `subjects`, `academic_years`, `academic_periods`, `daily_attendance_summaries` (for AI comment context and report card embedding), `consent_records` (risk detection processor reads directly)

## Key Danger Zones

- **DZ-06**: Closing an academic period at any time triggers `report-cards:auto-generate` cron at 03:00 UTC next day — accidental period closure creates hundreds of draft report cards.
- **DZ-10**: Report card templates store layout in `sections_json` with 14 discriminated section types. Section types are append-only — never rename or remove a type key from existing templates.
- **DZ-28**: `GdprTokenService` token mapping table must never be exposed. AI services pass student data through `processOutbound` before sending to Claude API.
- **DZ-29**: Consent withdrawal must take effect immediately — `ai_risk_detection` and `ai_comments` consent checks are synchronous reads in the processor, not cached.
- AI services: `AiCommentsService`, `AiGradingService`, `AiGradingInstructionService`, `AiProgressSummaryService`, `NlQueryService` — all use `@anthropic-ai/sdk` (Claude API) and route through `GdprTokenService` + `AiAuditService`.
