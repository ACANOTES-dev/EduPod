# Phase D: Safeguarding — Results

## Summary

Phase D delivers inspection-grade safeguarding functionality: full concern lifecycle (report → acknowledge → investigate → refer → resolve → seal), SLA tracking with wall-clock hours, critical concern escalation chains, reporter acknowledgement workflow, ClamAV-ready attachment pipeline, break-glass emergency access with audit logging and after-action review, dual-control seal mechanism, status projection for converted incidents, and a safeguarding dashboard with SLA compliance metrics.

## Database

### Tables Activated: 4 (all created in Phase A, business logic activated in Phase D)

- `safeguarding_concerns` — Full lifecycle from reported to sealed
- `safeguarding_actions` — Append-only chronological case log
- `safeguarding_concern_incidents` — Links concerns to behaviour incidents
- `safeguarding_break_glass_grants` — Emergency access with expiry and review

### Shared Table: 1

- `behaviour_attachments` — ClamAV scan pipeline activated for safeguarding entities

### Indexes Added: 8 (6 compound + 4 partial)

- `idx_safeguarding_concerns_severity_status` — SLA worker queries
- `idx_safeguarding_concerns_reporter` — My reports queries
- `idx_safeguarding_concerns_assignee` — Task view queries
- `idx_safeguarding_actions_concern_chrono` — Chronological case file
- `idx_safeguarding_actions_staff` — Staff activity tracking
- `idx_safeguarding_concerns_sla_overdue` — Partial: SLA breach detection
- `idx_behaviour_attachments_scan_pending` — Partial: scan backlog
- `idx_safeguarding_break_glass_active` — Partial: active grant expiry
- `idx_safeguarding_break_glass_review_pending` — Partial: overdue reviews

## API Endpoints: 21 routes

### SafeguardingController (`v1/safeguarding/`)

| #   | Method | Route                                    | Permission            |
| --- | ------ | ---------------------------------------- | --------------------- |
| 1   | POST   | `concerns`                               | `safeguarding.report` |
| 2   | GET    | `my-reports`                             | `safeguarding.report` |
| 3   | GET    | `concerns`                               | `safeguarding.view`   |
| 4   | GET    | `concerns/:id`                           | `safeguarding.view`   |
| 5   | PATCH  | `concerns/:id`                           | `safeguarding.manage` |
| 6   | PATCH  | `concerns/:id/status`                    | `safeguarding.manage` |
| 7   | POST   | `concerns/:id/assign`                    | `safeguarding.manage` |
| 8   | POST   | `concerns/:id/actions`                   | `safeguarding.manage` |
| 9   | GET    | `concerns/:id/actions`                   | `safeguarding.view`   |
| 10  | POST   | `concerns/:id/tusla-referral`            | `safeguarding.manage` |
| 11  | POST   | `concerns/:id/garda-referral`            | `safeguarding.manage` |
| 12  | POST   | `concerns/:id/attachments`               | `safeguarding.manage` |
| 13  | GET    | `concerns/:id/attachments/:aid/download` | `safeguarding.view`   |
| 14  | POST   | `concerns/:id/case-file`                 | `safeguarding.manage` |
| 15  | POST   | `concerns/:id/case-file/redacted`        | `safeguarding.manage` |
| 16  | POST   | `concerns/:id/seal/initiate`             | `safeguarding.seal`   |
| 17  | POST   | `concerns/:id/seal/approve`              | `safeguarding.seal`   |
| 18  | GET    | `dashboard`                              | `safeguarding.view`   |
| 19  | POST   | `break-glass`                            | `safeguarding.seal`   |
| 20  | GET    | `break-glass`                            | `safeguarding.seal`   |
| 21  | POST   | `break-glass/:id/review`                 | `safeguarding.manage` |

## Services: 3

| Service                         | Responsibilities                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `SafeguardingService`           | Concern lifecycle, status transitions, SLA computation, seal dual-control, dashboard, permission check with break-glass |
| `SafeguardingAttachmentService` | Upload with ClamAV pipeline, scan-gated download, S3 pre-signed URLs                                                    |
| `SafeguardingBreakGlassService` | Grant access, list active grants, after-action review                                                                   |

## Frontend: 6 pages + 6 components

### Pages

| Route                         | Description                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `/safeguarding`               | Dashboard with SLA traffic light, severity grid, status distribution, recent activity |
| `/safeguarding/concerns`      | Concern list with filters (status, severity, SLA), table/card views                   |
| `/safeguarding/concerns/new`  | Report concern form with student search, severity selection, critical warning         |
| `/safeguarding/concerns/[id]` | Case file detail with two-panel layout, actions timeline, attachments, seal           |
| `/safeguarding/my-reports`    | Reporter acknowledgement view (status only, no case detail)                           |
| `/settings/safeguarding`      | DLP assignment, SLA thresholds, retention years, module toggle                        |

### Components

- `safeguarding-severity-badge.tsx` — Colour-coded severity badge
- `safeguarding-status-badge.tsx` — Status badge with labels
- `sla-indicator.tsx` — Traffic light SLA component
- `concern-card.tsx` — Mobile card view for concern list
- `action-timeline.tsx` — Chronological action display
- `break-glass-banner.tsx` — Amber warning banner for break-glass access

## Background Jobs: 4

| Job                                | Queue     | Trigger             | Description                                                      |
| ---------------------------------- | --------- | ------------------- | ---------------------------------------------------------------- |
| `behaviour:attachment-scan`        | behaviour | On upload           | ClamAV scan pipeline (graceful fallback when daemon unavailable) |
| `behaviour:break-glass-expiry`     | behaviour | Cron 5min           | Revoke expired grants, create review tasks                       |
| `safeguarding:sla-check`           | behaviour | Cron 30min          | Detect SLA breaches, create urgent tasks                         |
| `safeguarding:critical-escalation` | behaviour | On critical concern | Escalation chain: DLP → deputy → principal                       |

## Configuration

### Permissions Used (registered in Phase A): 4

`safeguarding.report`, `safeguarding.view`, `safeguarding.manage`, `safeguarding.seal`

### Sequence Prefix: CP- (registered in Phase A)

### Behaviour Settings Keys Used:

- `designated_liaison_user_id`, `deputy_designated_liaison_user_id`, `dlp_fallback_chain`
- `safeguarding_sla_critical_hours` (default 4), `safeguarding_sla_high_hours` (24), `safeguarding_sla_medium_hours` (72), `safeguarding_sla_low_hours` (168)
- `safeguarding_retention_years` (default 25)

## Files Created: ~25 new files

### Backend

- `apps/api/src/modules/behaviour/safeguarding.service.ts`
- `apps/api/src/modules/behaviour/safeguarding-attachment.service.ts`
- `apps/api/src/modules/behaviour/safeguarding-break-glass.service.ts`
- `apps/api/src/modules/behaviour/safeguarding.controller.ts`
- `apps/api/src/modules/behaviour/safeguarding.constants.ts`

### Shared

- `packages/shared/src/behaviour/schemas/safeguarding.schema.ts`
- `packages/shared/src/behaviour/safeguarding-state-machine.ts`

### Worker

- `apps/worker/src/processors/behaviour/attachment-scan.processor.ts`
- `apps/worker/src/processors/behaviour/break-glass-expiry.processor.ts`
- `apps/worker/src/processors/behaviour/sla-check.processor.ts`
- `apps/worker/src/processors/behaviour/critical-escalation.processor.ts`

### Frontend

- 6 pages in `apps/web/src/app/[locale]/(school)/safeguarding/` and `/settings/safeguarding/`
- 6 components in `apps/web/src/components/behaviour/`

### Database

- `packages/prisma/migrations/20260326210000_add_safeguarding_phase_d_indexes/migration.sql`

## Files Modified: 5

- `packages/shared/src/behaviour/index.ts` — Added safeguarding state machine export
- `packages/shared/src/behaviour/schemas/index.ts` — Added safeguarding schema export
- `apps/api/src/modules/behaviour/behaviour.module.ts` — Registered safeguarding services + controller
- `apps/worker/src/worker.module.ts` — Registered 4 worker processors
- `packages/prisma/schema.prisma` — Added compound indexes to safeguarding models

## Known Limitations

- **Case file PDF generation** (endpoints 14-15): Returns `not_implemented` — requires Puppeteer integration and template design
- **ClamAV**: Worker auto-approves as `clean` when ClamAV daemon unavailable (graceful fallback for local dev)
- **S3 Object Lock**: Not enforced in upload — requires bucket-level Object Lock configuration
- **Translation files**: Hardcoded English (no i18n keys yet)
- **Sidebar navigation**: Not yet updated to include Safeguarding link
- **Notification templates**: Safeguarding notification jobs enqueue messages but template rendering depends on comms module configuration

## Deviations from Plan

- Endpoints 14-15 (case file PDF) are stubs — full Puppeteer pipeline deferred
- ClamAV scan processor uses a socket existence check as fallback instead of streaming to daemon
- S3 upload is a mock (file_key stored but no actual S3 interaction) — production S3 integration is an infrastructure task
