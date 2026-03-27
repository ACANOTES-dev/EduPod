# Phase F: Analytics + AI — Results

## Summary

Phase F delivers the behaviour analytics engine, AI query pipeline, pattern detection system, and alert management. It includes 3 upgraded materialised views, a 5-dimension Behaviour Pulse with Redis caching, 16 analytics endpoints with exposure-adjusted normalisation, an AI query pipeline with Claude integration and mandatory anonymisation, 7 pattern detection algorithms with dedup and per-user alert ownership, 4 worker jobs, and 3 frontend pages.

## Database

### Materialised Views Upgraded: 3
All 3 views were created as stubs (`WITH NO DATA`) in Phase A and upgraded in Phase F with full business logic:

- `mv_student_behaviour_summary` — Per-student aggregates by academic year. Columns: tenant_id, student_id, academic_year_id, positive_count, negative_count, neutral_count, total_points, positive_ratio, last_incident_at, computed_at. Unique index for CONCURRENTLY refresh. Refresh: every 15 minutes.
- `mv_behaviour_benchmarks` — ETB cross-school benchmarks. Columns: tenant_id, academic_year_id, academic_period_id, benchmark_category, student_count, incident_count, rate_per_100, computed_at. HAVING clause excludes sub-cohort-minimum data. Refresh: nightly at 03:00.
- `mv_behaviour_exposure_rates` — Teaching exposure per subject/teacher/year group from scheduling data. Joins schedules → classes → academic_periods → class_enrolments. Refresh: nightly at 02:00.

### New Indexes: 2
- `idx_behaviour_alert_recipients_active` — Partial index for badge count query
- `idx_behaviour_alerts_type_status` — Pattern dedup queries

### No New Tables
Alert tables (`behaviour_alerts`, `behaviour_alert_recipients`) were created in Phase A.

## API Endpoints: 24 routes

### Analytics Controller (16 routes)
| Method | Path | Permission |
|--------|------|-----------|
| GET | `v1/behaviour/analytics/pulse` | `behaviour.view` |
| GET | `v1/behaviour/analytics/overview` | `behaviour.view` |
| GET | `v1/behaviour/analytics/heatmap` | `behaviour.view` |
| GET | `v1/behaviour/analytics/heatmap/historical` | `behaviour.view` |
| GET | `v1/behaviour/analytics/trends` | `behaviour.view` |
| GET | `v1/behaviour/analytics/categories` | `behaviour.view` |
| GET | `v1/behaviour/analytics/subjects` | `behaviour.view` |
| GET | `v1/behaviour/analytics/staff` | `behaviour.view_staff_analytics` |
| GET | `v1/behaviour/analytics/sanctions` | `behaviour.view` |
| GET | `v1/behaviour/analytics/interventions` | `behaviour.manage` |
| GET | `v1/behaviour/analytics/ratio` | `behaviour.view` |
| GET | `v1/behaviour/analytics/comparisons` | `behaviour.view` |
| GET | `v1/behaviour/analytics/policy-effectiveness` | `behaviour.admin` |
| GET | `v1/behaviour/analytics/task-completion` | `behaviour.manage` |
| POST | `v1/behaviour/analytics/ai-query` | `behaviour.ai_query` |
| GET | `v1/behaviour/analytics/ai-query/history` | `behaviour.ai_query` |

### Alerts Controller (8 routes)
| Method | Path | Permission |
|--------|------|-----------|
| GET | `v1/behaviour/alerts` | `behaviour.view` |
| GET | `v1/behaviour/alerts/badge` | `behaviour.view` |
| GET | `v1/behaviour/alerts/:id` | `behaviour.view` |
| PATCH | `v1/behaviour/alerts/:id/seen` | `behaviour.view` |
| PATCH | `v1/behaviour/alerts/:id/acknowledge` | `behaviour.view` |
| PATCH | `v1/behaviour/alerts/:id/snooze` | `behaviour.view` |
| PATCH | `v1/behaviour/alerts/:id/resolve` | `behaviour.view` |
| PATCH | `v1/behaviour/alerts/:id/dismiss` | `behaviour.view` |

## Services: 4

| Service | Responsibilities |
|---------|-----------------|
| `BehaviourPulseService` | 5-dimension pulse computation, Redis caching (5min TTL), composite scoring with confidence gate |
| `BehaviourAnalyticsService` | 14 analytics query methods, scope enforcement, exposure normalisation, data quality flags |
| `BehaviourAlertsService` | Alert CRUD, per-user status management, auto-resolve when all recipients done |
| `BehaviourAIService` | NL query pipeline with Claude integration, anonymisation, audit logging |

## Frontend: 3 pages

| Route | Description |
|-------|-------------|
| `/behaviour/analytics` | Full analytics dashboard: pulse widget, overview cards, trend chart, heatmap, category breakdown, subject analysis, year group comparison |
| `/behaviour/analytics/ai` | Natural language query interface with suggested queries, RTL-aware input, confidence indicators, query history |
| `/behaviour/alerts` | Alert list with 5 tabs, severity badges, action buttons (acknowledge/snooze/resolve/dismiss), expandable data snapshots |

## Background Jobs: 4

| Job | Queue | Trigger | Description |
|-----|-------|---------|-------------|
| `behaviour:detect-patterns` | behaviour | Daily cron | 7 pattern detection algorithms with dedup |
| `behaviour:refresh-mv-student-summary` | behaviour | Every 15 min | CONCURRENTLY refresh |
| `behaviour:refresh-mv-benchmarks` | behaviour | Daily 03:00 | CONCURRENTLY refresh |
| `behaviour:refresh-mv-exposure-rates` | behaviour | Daily 02:00 | CONCURRENTLY refresh |

## Configuration

### AI Anonymisation Pipeline
- `anonymiseForAI` utility in `packages/shared/src/ai/anonymise.ts`
- Replaces student names with `Student-A`, `Student-B` tokens
- Replaces staff names with role titles or `Staff-A` tokens
- Strips UUIDs, context_notes, SEND details, safeguarding flags
- Token map is ephemeral — never logged, persisted, or returned in API responses
- `deAnonymiseFromAI` restores tokens to display names in AI responses
- System prompt blocks clinical terminology and diagnostic language

### Shared Zod Schemas Added: 2
- `analytics.schema.ts` — `behaviourAnalyticsQuerySchema`, `aiQuerySchema`, 16 response type interfaces
- `alert.schema.ts` — `alertListQuerySchema`, `snoozeAlertSchema`, `dismissAlertSchema`, response types

## Files Created: ~20

### Shared (5 files)
- `packages/shared/src/ai/anonymise.ts`
- `packages/shared/src/ai/anonymise.spec.ts`
- `packages/shared/src/ai/index.ts`
- `packages/shared/src/behaviour/schemas/analytics.schema.ts`
- `packages/shared/src/behaviour/schemas/alert.schema.ts`

### Backend (6 files)
- `apps/api/src/modules/behaviour/behaviour-pulse.service.ts`
- `apps/api/src/modules/behaviour/behaviour-pulse.service.spec.ts`
- `apps/api/src/modules/behaviour/behaviour-analytics.service.ts`
- `apps/api/src/modules/behaviour/behaviour-analytics.controller.ts`
- `apps/api/src/modules/behaviour/behaviour-alerts.service.ts`
- `apps/api/src/modules/behaviour/behaviour-alerts.controller.ts`
- `apps/api/src/modules/behaviour/behaviour-ai.service.ts`

### Frontend (3 files)
- `apps/web/src/app/[locale]/(school)/behaviour/analytics/page.tsx`
- `apps/web/src/app/[locale]/(school)/behaviour/analytics/ai/page.tsx`
- `apps/web/src/app/[locale]/(school)/behaviour/alerts/page.tsx`

### Worker (2 files)
- `apps/worker/src/processors/behaviour/detect-patterns.processor.ts`
- `apps/worker/src/processors/behaviour/refresh-mv.processor.ts`

### Database (2 files)
- `packages/prisma/migrations/20260326220000_upgrade_behaviour_materialised_views/migration.sql`
- `packages/prisma/migrations/20260326220000_upgrade_behaviour_materialised_views/post_migrate.sql`

## Files Modified: 5
- `apps/api/src/modules/behaviour/behaviour.module.ts` — Added 4 services, 2 controllers
- `apps/worker/src/worker.module.ts` — Registered 2 new processors
- `packages/shared/src/behaviour/schemas/index.ts` — Added analytics + alert schema exports
- `packages/shared/src/index.ts` — Added AI module export
- `packages/shared/src/behaviour/state-machine-exclusion.ts` — Fixed pre-existing type error

## Tests: 27 new tests
- 13 unit tests for `anonymiseForAI` / `deAnonymiseFromAI`
- 14 unit tests for `BehaviourPulseService.computeComposite` and graduated decay scoring

## Known Limitations
- ETB panel database role (`etb_panel_role`) not created — requires platform admin implementation
- Pattern detection currently routes all alerts to `behaviour.admin` users (spec calls for year-head/pastoral-lead routing)
- `behaviour:detect-patterns` cron not yet registered in CronSchedulerService
- MV refresh cron jobs not yet registered in CronSchedulerService
- OpenAI GPT fallback not implemented (SDK not installed) — Claude-only for now
- Staff logging activity table relies on TenantMembership permission queries which may be slow at scale
- Sidebar nav and translation files not yet updated for new pages
- Trend calculation does not yet compute `trend_percent` for categories/subjects

## Deviations from Plan
- ETB benchmarking MV uses `academic_period_id` from incident (not a separate cohort count query against tenant_settings, which would require a subquery or function)
- `exposure_normalised` defaults to querying the MV via raw SQL since Prisma doesn't model materialised views natively
- AI service uses Claude `claude-sonnet-4-5-20250514` model directly (not a configurable model setting)
