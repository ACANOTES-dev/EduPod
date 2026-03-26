# Behaviour Management Module — Implementation Progress

## Phase Status

| Phase | Name | Status | Started | Completed | Notes |
|-------|------|--------|---------|-----------|-------|
| A | Core + Temporal | completed | 2026-03-26 | 2026-03-26 | 35 tables, 48 endpoints, 9 pages |
| B | Policy Engine | completed | 2026-03-26 | 2026-03-26 | 5-stage evaluation pipeline, 12 endpoints, 1 page, 1 worker job |
| C | Sanctions + Exclusions + Appeals | not_started | — | — | |
| D | Safeguarding | completed | 2026-03-26 | 2026-03-26 | 21 endpoints, 6 pages, 4 worker jobs |
| E | Recognition + Interventions | not_started | — | — | |
| F | Analytics + AI | not_started | — | — | |
| G | Documents + Comms | not_started | — | — | |
| H | Hardening + Ops + Scale | not_started | — | — | |

## Dependency Map

```
A -> B, D, E (A unlocks these three)
A + B -> C, F (partial: F also needs E)
A + B + E -> F
A + B + C -> G
A + B + C + D + E + F + G -> H
```

## Parallel Execution Waves

- Wave 1: A (solo)
- Wave 2: B + D + E (parallel)
- Wave 3: C + F (parallel, after B and E complete)
- Wave 4: G (after C)
- Wave 5: H (after all)

## Completed Phase Summaries

### Phase A: Core + Temporal — Completed 2026-03-26
**What was built**: Complete foundation for the Behaviour Management module. 35 database tables with RLS policies (all 32 behaviour + 3 materialised views schema), 60+ PostgreSQL enums, 48 API endpoints across 4 controllers, 7 backend services (incidents with state machine, quick-log with idempotency, participants with domain constraints, tasks, config, history, scope), 9 frontend pages (pulse dashboard, incidents CRUD, student overview/profile, task inbox, settings), 6 UI components (quick-log FAB/sheet, incident card/status badge, student header, category picker), 2 worker jobs (parent notification with send-gate, task reminders), seed data (12 categories, 52 templates, 4 award types), 12 permissions, 6 sequences.
**Key files created**: `apps/api/src/modules/behaviour/` (12 files), `packages/shared/src/behaviour/` (11 files), `apps/web/src/app/[locale]/(school)/behaviour/` (7 pages), `apps/web/src/components/behaviour/` (6 components), `apps/worker/src/processors/behaviour/` (2 processors)
**Key patterns established**: Incident state machine via shared `isValidTransition()`, data classification via `stripFieldsByClassification()`, scope enforcement via permission-based derivation, context/student snapshot freezing on creation, idempotency via `idempotency_key` partial unique index, parent description send-gate before notification dispatch, entity history recording for all mutations
**Known limitations**: Sidebar nav not yet updated to include Behaviour. Translation files not yet created (hardcoded English). `behaviour_scope` column not on TenantMembership (scope derived from permissions). Quick-log doesn't detect current class from schedule. Legal hold partial index has enum value mismatch (Phase H fix).
**Results file**: Plans/phases-results/BH-A-results.md

### Phase B: Policy Engine — Completed 2026-03-26
**What was built**: Full 5-stage policy evaluation engine (consequence → approval → notification → support → alerting). PolicyRulesService with CRUD + versioning (snapshot on every edit). PolicyEvaluationEngine with per-student evaluation, condition matching (12 condition types, AND logic), action execution with idempotent dedup guards (11 action types). PolicyReplayService with historical replay and admin dry-run. BullMQ evaluate-policy worker job triggered on incident creation and participant addition. 12 API endpoints (policy CRUD, version history, priority reorder, replay, dry-run, import/export, evaluation trace). Frontend settings page at /settings/behaviour-policies with stage tabs, rule editor, condition/action builders, replay panel, dry-run dialog, version history. 5 default policy rules seeded per tenant. Architecture docs updated.
**Key files created**: `apps/api/src/modules/behaviour/policy/` (3 services), `packages/shared/src/behaviour/schemas/policy-*.ts` (5 schemas), `apps/worker/src/processors/behaviour/evaluate-policy.processor.ts`, `apps/web/src/app/[locale]/(school)/settings/behaviour-policies/page.tsx`
**Key patterns established**: Stage pipeline order via constant array, Prisma enum mapping (approval_stage→approval, notification_stage→notification), condition evaluation as pure function, action execution with dedup guard pattern, version snapshot on create and update, replay as read-only evaluation (no side effects), category name token resolution for import/export
**Known limitations**: Replay does not recompute repeat counts (uses frozen snapshot repeat_count=0). notify_roles and notify_users actions record success but don't dispatch actual notifications (Phase G). auto_escalate creates incident without sequence number (needs SequenceService integration). Sanctions created by policy don't have sequence numbers. Pre-existing CI failures from Phase D type errors block deployment.
**Results file**: Plans/phases-results/BH-B-results.md

### Phase D: Safeguarding — Completed 2026-03-26
**What was built**: Inspection-grade safeguarding module. Full concern lifecycle (report → acknowledge → investigate → refer → resolve → seal) with state machine validation. SLA tracking with wall-clock hours and configurable per-severity thresholds (critical 4h, high 24h, medium 72h, low 168h). Critical concern escalation chain (DLP → deputy → principal at 30-min intervals). Reporter acknowledgement workflow (status-only view, no case detail). ClamAV-ready attachment pipeline with scan-gated downloads. Break-glass emergency access with 72h max duration, audit logging, and mandatory after-action review. Dual-control seal requiring two distinct `safeguarding.seal` holders. Status projection (`converted_to_safeguarding` → `closed` for non-safeguarding users, already implemented in Phase A). Safeguarding dashboard with SLA compliance metrics. 21 API endpoints, 3 backend services, 6 frontend pages, 6 UI components, 4 worker jobs. 8 database indexes (including 4 partial indexes for SLA, scan backlog, and break-glass expiry).
**Key files created**: `apps/api/src/modules/behaviour/safeguarding*.ts` (5 files), `packages/shared/src/behaviour/safeguarding-state-machine.ts`, `packages/shared/src/behaviour/schemas/safeguarding.schema.ts`, `apps/worker/src/processors/behaviour/{attachment-scan,break-glass-expiry,sla-check,critical-escalation}.processor.ts`, `apps/web/src/app/[locale]/(school)/safeguarding/` (6 pages), `apps/web/src/components/behaviour/safeguarding-*.tsx` (6 components)
**Key patterns established**: Effective permission check combining normal permissions + break-glass grants, Prisma enum mapping for safeguarding types (low_sev→low, sg_monitoring→monitoring, etc.), append-only action log pattern, dual-control seal via two-step initiate+approve, SLA computation using wall-clock hours (not school days), reporter view with zero case detail exposure
**Known limitations**: Case file PDF generation (endpoints 14-15) returns not_implemented — requires Puppeteer integration. ClamAV auto-approves as clean when daemon unavailable (dev fallback). S3 Object Lock not enforced in upload. Translation files not yet created. Sidebar nav not yet updated. Notification template rendering depends on comms module.
**Results file**: Plans/phases-results/BH-D-results.md
