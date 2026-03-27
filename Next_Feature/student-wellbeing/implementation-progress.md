# Student Wellbeing Module — Implementation Progress

## Master Spec
`Next_Feature/student-wellbeing/master-spec.md` (v4, 2026-03-27)

## Sub-Phase Status

### Phase 1 — Credible Core

| Sub-Phase | Name | Status | Started | Completed | Notes |
|-----------|------|--------|---------|-----------|-------|
| SW-1A | Infrastructure & Foundation | completed | 2026-03-27 | 2026-03-27 | 20 tables, 14 enums, 18 permissions, 17 schemas, 5 modules, 6 processors, 6 tests |
| SW-1B | Concern Logging & Audit Events | completed | 2026-03-27 | 2026-03-27 | 11 endpoints, 3 services, 36 tests (26 unit + 10 E2E) |
| SW-1C | Child Protection Fortress | NOT STARTED | — | — | — |
| SW-1D | Cases & Student Chronology | NOT STARTED | — | — | — |
| SW-1E | Tiered Notifications | NOT STARTED | — | — | — |

### Phase 2 — Operational Workflow

| Sub-Phase | Name | Status | Started | Completed | Notes |
|-----------|------|--------|---------|-----------|-------|
| SW-2A | SST & Meeting Management | NOT STARTED | — | — | — |
| SW-2B | Intervention Plans | NOT STARTED | — | — | — |
| SW-2C | Parent Engagement | NOT STARTED | — | — | — |
| SW-2D | Behaviour Facade & Escalation | NOT STARTED | — | — | — |

### Phase 3 — Evidence Packs

| Sub-Phase | Name | Status | Started | Completed | Notes |
|-----------|------|--------|---------|-----------|-------|
| SW-3A | NEPS Referrals | NOT STARTED | — | — | — |
| SW-3B | Reports & Exports | NOT STARTED | — | — | — |
| SW-3C | DSAR & Historical Import | NOT STARTED | — | — | — |

### Phase 4 — Predictive Signals

| Sub-Phase | Name | Status | Started | Completed | Notes |
|-----------|------|--------|---------|-----------|-------|
| SW-4A | Self-Check-Ins | NOT STARTED | — | — | — |

### Phase 5 — Critical Incident Management

| Sub-Phase | Name | Status | Started | Completed | Notes |
|-----------|------|--------|---------|-----------|-------|
| SW-5A | Critical Incidents | NOT STARTED | — | — | — |

## Dependency Map

```
SW-1A -> SW-1B (foundation unlocks concerns)
SW-1B -> SW-1C, SW-1D, SW-1E (concerns unlock CP, cases, notifications)
SW-1D -> SW-2A, SW-2C (cases unlock SST, parent engagement)
SW-1C + SW-1E -> SW-2D (CP + notifications unlock behaviour facade)
SW-1D + SW-2A -> SW-2B (cases + SST unlock interventions)
SW-2B -> SW-3A (interventions unlock NEPS referrals)
SW-2A + SW-2B + SW-1C -> SW-3B (SST + interventions + CP unlock reports)
SW-1C + SW-3B -> SW-3C (CP + reports unlock DSAR + import)
SW-1B + SW-1E -> SW-4A (concerns + notifications unlock check-ins)
SW-1B + SW-1D -> SW-5A (concerns + cases unlock critical incidents)
```

## Parallel Execution Waves

- **Wave 1**: SW-1A (solo — foundation, schema, RLS, triggers, permissions, scaffolding)
- **Wave 2**: SW-1B (solo — gateway for all feature sub-phases)
- **Wave 3**: SW-1C + SW-1D + SW-1E (parallel — CP fortress, cases, notifications)
- **Wave 4**: SW-2A + SW-2C + SW-2D (parallel — SST, parent engagement, behaviour facade)
- **Wave 5**: SW-2B + SW-4A + SW-5A (parallel — interventions, check-ins, critical incidents)
- **Wave 6**: SW-3A + SW-3B (parallel — NEPS referrals, reports & exports)
- **Wave 7**: SW-3C (solo — DSAR + import, final sub-phase)

## Orchestration Rules

Every sub-phase execution follows `/SW` command protocol:
- **Orchestrator pattern**: Main agent dispatches 4-10 Opus 4.6 sub-agents (Sonnet REJECTED)
- **SSH access**: All agents have free SSH approval (must follow server rules in CLAUDE.md)
- **100% deliverable requirement**: Every item in the sub-phase spec must be implemented and tested
- **CI/CD iteration**: Keep fixing and pushing until all GitHub Actions pass — no retry limit
- **Concurrent session handling**: Git pull --rebase on conflicts, wait 2 min and retry if blocked

## Completion Log

| Date | Sub-Phase | Summary |
|------|-----------|---------|
| 2026-03-27 | SW-1A | Infrastructure foundation: 20 tables, 14 enums, RLS (standard + tiered + CP), immutability triggers, 18 permissions, 17 Zod schemas, 5 NestJS modules, 6 worker stubs |
| 2026-03-27 | SW-1B | Concern logging: ConcernService (8 methods), ConcernVersionService (3), PastoralEventService (3), ConcernsController (11 endpoints), 36 tests |

## Completed Sub-Phase Summaries

### SW-1A: Infrastructure & Foundation — Completed 2026-03-27
**What was built**: Complete foundation for the Student Wellbeing module. 20 database tables with RLS policies (standard tenant isolation for 18 tables, tiered access for pastoral_concerns hiding tier-3 from non-DLP users, CP-specific RLS for cp_records requiring cp_access_grants), 14 PostgreSQL enums, immutability triggers on 4 append-only tables, tier downgrade prevention trigger, auto-escalation trigger for CP categories, 5 CHECK constraints, partial unique index for cp_access_grants. Global `app.current_user_id` added to RLS middleware (optional, sentinel default) and TenantAwareJob base class. 18 pastoral permissions seeded. 17 Zod schema files with all DTOs, 26 event payload schemas, and pastoral tenant settings. 5 NestJS module shells registered in app.module.ts. 6 worker processor stubs. `pastoral_case` tenant sequence registered.
**Key files created**: `packages/prisma/migrations/20260327200000_add_pastoral_care_tables/` (migration.sql + post_migrate.sql), `packages/shared/src/pastoral/` (17 schema files + enums + barrel exports), `apps/api/src/modules/{pastoral,child-protection,pastoral-dsar,pastoral-checkins,critical-incidents}/`, `apps/worker/src/processors/pastoral/` (6 stubs), `packages/shared/src/constants/system.ts`
**Key patterns established**: `user_id` is optional in `createRlsClient` with sentinel default (`00000000-0000-0000-0000-000000000000`) — existing callers work without modification, new pastoral services pass real user_id. Tiered RLS policy on pastoral_concerns uses `app.current_user_id` to check cp_access_grants. Immutability enforced by `prevent_immutable_modification()` trigger function (reusable). Pastoral Zod schemas follow the `packages/shared/src/pastoral/` directory structure with barrel exports.
**Known limitations**: Pre-existing type errors in uncommitted behaviour test files (15-6, 15-7 release-gate specs) — not caused by pastoral changes. Some pre-existing worker lint errors in behaviour processors.
**Results file**: Plans/phases-results/SW-1A-results.md

### SW-1B: Concern Logging & Audit Events — Completed 2026-03-27
**What was built**: Full concern CRUD with 11 REST endpoints, tiered access enforcement, append-only narrative versioning with SELECT FOR UPDATE concurrency control, immutable pastoral event audit writer (fire-and-forget, Zod-validated payloads), author masking for non-DLP viewers, tenant-configurable concern categories with auto-tier escalation, and concern acknowledgement tracking. 36 tests across 4 test files covering all service methods, RLS leakage, and permission enforcement.
**Key files created**: `apps/api/src/modules/pastoral/services/{concern,concern-version,pastoral-event}.service.ts`, `apps/api/src/modules/pastoral/controllers/concerns.controller.ts`, `apps/api/src/modules/pastoral/pastoral.constants.ts`, `packages/shared/src/pastoral/schemas/concern-response.schema.ts`
**Key patterns established**: RLS client with `user_id` for CP-aware queries. Fire-and-forget event writes via `void this.eventService.write(...)`. Author masking as DTO transformation (not interceptor). Category validation against tenant_settings JSONB. Tier-based list filtering at application layer (tier 1 only for view_tier1 users, RLS handles tier 3). ConcernVersionService.createInitialVersion accepts caller's tx client, amendNarrative creates its own.
**Known limitations**: None — all spec deliverables implemented.
**Results file**: Plans/phases-results/SW-1B-results.md
