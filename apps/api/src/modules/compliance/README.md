# Compliance

## Purpose

Handles GDPR compliance operations: DSAR (Data Subject Access Request) data traversal and export, anonymisation execution, data retention policy management, legal hold enforcement, and S3/search cleanup after erasure. Operates as a controlled orchestration layer over data spread across all other modules.

## Public API (Exports)

- `ComplianceService` — DSAR request lifecycle (create, approve, execute erasure/anonymisation/export)
- `RetentionPoliciesService` — data retention policy management and compliance enforcement

## Inbound Dependencies (What this module imports)

- `S3Module` — S3 cleanup after erasure (deletes associated files)
- `SearchModule` — Meilisearch cleanup after anonymisation (removes indexed PII)
- `PastoralModule` — via `forwardRef` for DSAR traversal of pastoral records
- `GdprModule` — `GdprTokenService` (token cleanup on erasure), `DpaService` (DPA policy checks)

## Outbound Consumers (Who imports this module)

- No NestJS module imports ComplianceModule directly (listed in Tier 4 — isolated module)

## BullMQ Queues

**Queue: `compliance`** (2 retries, 10s exponential)

- `compliance:execute` — on-demand; executes erasure/anonymisation per approved DSAR request (NOTE: currently routes through `imports` queue — legacy routing)
- `data-retention:enforce` — cron weekly Sunday 03:00 UTC; enforces retention policies against eligible records
- `compliance:deadline-check` — cron daily 06:00 UTC; flags DSAR requests approaching their legal response deadline

## Cross-Module Prisma Reads

`DsarTraversalService` reads ~20 Prisma models across all modules for DSAR data collection including: `students`, `student_parents`, `attendance_records`, `grades`, `period_grade_snapshots`, `student_competency_snapshots`, `student_academic_risk_alerts`, `behaviour_incidents`, `behaviour_recognition_awards`, `invoices`, `consent_records`, `gdpr_anonymisation_tokens`, and pastoral records (via forwardRef). Also reads `staff_profiles` for staff DSAR requests.

## Key Danger Zones

- **DZ-21**: Anonymisation is irreversible. Legal hold is the only gate. The retention worker replaces PII and sets `retention_status → 'anonymised'` — there is no undo. Always use `dry_run=true` before executing. Exclusion cases and safeguarding concerns are never auto-anonymised — flagged for manual review.
- **DZ-28**: `gdpr_anonymisation_tokens` table must never be exposed via any API endpoint. The only permitted interaction is through `GdprTokenService.processOutbound` / `processInbound`. Erasure pipeline deletes tokens via `deleteTokensForEntity()`.
- S3 and search cleanup after erasure are post-commit: failures leave stale artifacts but do not roll back the DB anonymisation. These failures are logged rather than blocking completion.
- `DsarTraversalService` has no module-level imports for the data it traverses — it uses Prisma direct reads across the entire schema. Any table rename or column drop across any module can silently break DSAR export.
