# Phase F: Analytics + AI — Implementation Plan

## Section 1 — Overview

Phase F delivers the behaviour analytics, AI, and alerting layer. It builds on:

- **Phase A** (incidents, participants, categories, tasks, settings, scope service)
- **Phase B** (policy evaluations for policy-effectiveness analytics)
- **Phase E** (points service, awards, house memberships, interventions)

### What this phase delivers

1. **3 materialised views** (upgraded from Phase A stubs): student behaviour summary, ETB benchmarks, exposure rates
2. **5-dimension Behaviour Pulse** with composite scoring and Redis caching
3. **Exposure-adjusted analytics** across 14 data endpoints
4. **AI feature suite**: NL query, anonymisation pipeline, Claude/GPT fallback
5. **Pattern detection** worker with 7 alert types and per-user alert ownership
6. **ETB benchmarking** view architecture (opt-in, cohort suppression)
7. **16 analytics API endpoints** + alert management endpoints
8. **3 frontend pages**: analytics dashboard, AI query, alerts

### Dependencies on prior phases

- `BehaviourService` — `apps/api/src/modules/behaviour/behaviour.service.ts`
- `BehaviourPointsService` — `apps/api/src/modules/behaviour/behaviour-points.service.ts`
- `BehaviourScopeService` — `apps/api/src/modules/behaviour/behaviour-scope.service.ts`
- `BehaviourInterventionsService` — `apps/api/src/modules/behaviour/behaviour-interventions.service.ts`
- Policy evaluation tables — populated by Phase B `evaluate-policy` worker
- Settings schema keys (ai*\*, pulse*_, benchmark\__) — `packages/shared/src/behaviour/schemas/settings.schema.ts`
- Alert tables already exist from Phase A migration

---

## Section 2 — Database Changes

### No new tables needed

`behaviour_alerts` and `behaviour_alert_recipients` already exist from Phase A with correct enums (AlertType, AlertSeverity, AlertStatus, AlertRecipientStatus).

### Materialised View Upgrades

The 3 MVs exist in the Phase A migration as simplified stubs (`WITH NO DATA`). Phase F creates a new migration that DROPs and recreates them with the full spec definitions.

#### `mv_student_behaviour_summary` (upgraded)

Full columns: `tenant_id`, `student_id`, `academic_year_id`, `positive_count`, `negative_count`, `neutral_count`, `total_points`, `positive_ratio`, `last_incident_at`, `computed_at`

- Unique index: `(tenant_id, student_id, academic_year_id)`
- Query index: `(tenant_id, academic_year_id)`
- Filters: excludes `withdrawn` and `converted_to_safeguarding` incidents, `retention_status = 'active'`
- Refresh: every 15 minutes via CONCURRENTLY

#### `mv_behaviour_benchmarks` (upgraded)

Full columns: `tenant_id`, `academic_year_id`, `academic_period_id`, `benchmark_category`, `student_count`, `incident_count`, `rate_per_100`, `computed_at`

- Unique index: `(tenant_id, academic_year_id, academic_period_id, benchmark_category)`
- Query index: `(tenant_id)`
- HAVING clause: `student_count >= benchmark_min_cohort_size` from tenant_settings JSONB
- Only includes categories where `cross_school_benchmarking_enabled = true` (enforced at query time, not in view)

#### `mv_behaviour_exposure_rates` (upgraded)

Adapted from spec to use actual table names: `schedules` + `classes` + `class_enrolments` + `academic_periods`.
Full columns: `tenant_id`, `academic_year_id`, `academic_period_id`, `effective_from`, `effective_until`, `subject_id`, `staff_id`, `year_group_id`, `context_type`, `total_teaching_periods`, `total_students`, `computed_at`

- Unique index: `(tenant_id, academic_period_id, subject_id, staff_id, year_group_id)` — NULLs handled with COALESCE
- Query index: `(tenant_id, academic_period_id)`
- Source: `schedules s` JOIN `classes c` ON `s.class_id = c.id` JOIN `academic_periods ap` + LEFT JOIN `class_enrolments ce`

### Additional indexes on alert tables

- `idx_behaviour_alerts_type_status`: `(tenant_id, alert_type, status)` — for pattern dedup
- `idx_behaviour_alert_recipients_active`: `(tenant_id, recipient_id, status) WHERE status IN ('unseen', 'seen', 'acknowledged', 'snoozed')` — badge count

---

## Section 3 — API Endpoints

### Analytics Controller: `behaviour-analytics.controller.ts` — 16 endpoints

| #   | Method | Route                                         | Permission                              | Description                                  |
| --- | ------ | --------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| 1   | GET    | `v1/behaviour/analytics/pulse`                | `behaviour.view`                        | 5-dimension Pulse with composite             |
| 2   | GET    | `v1/behaviour/analytics/heatmap`              | `behaviour.view`                        | Exposure-adjusted heatmap (weekday x period) |
| 3   | GET    | `v1/behaviour/analytics/overview`             | `behaviour.view`                        | School-wide counts, ratios, trends           |
| 4   | GET    | `v1/behaviour/analytics/trends`               | `behaviour.view`                        | Incident count over time (line chart)        |
| 5   | GET    | `v1/behaviour/analytics/categories`           | `behaviour.view`                        | Breakdown by category                        |
| 6   | GET    | `v1/behaviour/analytics/heatmap/historical`   | `behaviour.view`                        | Full historical heatmap                      |
| 7   | GET    | `v1/behaviour/analytics/subjects`             | `behaviour.view`                        | Per-subject rates (exposure-adjusted)        |
| 8   | GET    | `v1/behaviour/analytics/staff`                | `behaviour.view_staff_analytics`        | Staff logging activity                       |
| 9   | GET    | `v1/behaviour/analytics/sanctions`            | `behaviour.view`                        | Sanction summary                             |
| 10  | GET    | `v1/behaviour/analytics/interventions`        | `behaviour.manage`                      | Intervention outcomes                        |
| 11  | GET    | `v1/behaviour/analytics/ratio`                | `behaviour.view`                        | Positive/negative ratio breakdown            |
| 12  | GET    | `v1/behaviour/analytics/comparisons`          | `behaviour.view`                        | Year group comparisons                       |
| 13  | GET    | `v1/behaviour/analytics/policy-effectiveness` | `behaviour.admin`                       | Policy rule match/fire rates                 |
| 14  | GET    | `v1/behaviour/analytics/task-completion`      | `behaviour.manage`                      | Task completion rates                        |
| 15  | POST   | `v1/behaviour/analytics/ai-query`             | `behaviour.view` + `behaviour.ai_query` | NL analytics query                           |
| 16  | GET    | `v1/behaviour/analytics/ai-query/history`     | `behaviour.view` + `behaviour.ai_query` | NL query history                             |

#### Common query parameters (all analytics endpoints)

```typescript
analyticsQuerySchema = z.object({
  academicYearId: z.string().uuid().optional(),
  academicPeriodId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  yearGroupId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  polarity: z.enum(['positive', 'negative', 'neutral']).optional(),
  categoryId: z.string().uuid().optional(),
  exposureNormalised: z.boolean().optional().default(true),
});
```

#### AI Query endpoint detail

Request: `{ query: string (max 500), context?: { yearGroupId?, studentId?, fromDate?, toDate? } }`
Response: `{ result: string, data_as_of: string, ai_generated: true, scope_applied: string, confidence: number | null, structured_data?: object }`

### Alerts Controller: `behaviour-alerts.controller.ts` — 8 endpoints

| #   | Method | Route                                 | Permission       | Description                     |
| --- | ------ | ------------------------------------- | ---------------- | ------------------------------- |
| 1   | GET    | `v1/behaviour/alerts`                 | `behaviour.view` | List alerts for current user    |
| 2   | GET    | `v1/behaviour/alerts/badge`           | `behaviour.view` | Unseen/active alert count       |
| 3   | GET    | `v1/behaviour/alerts/:id`             | `behaviour.view` | Alert detail                    |
| 4   | PATCH  | `v1/behaviour/alerts/:id/acknowledge` | `behaviour.view` | Acknowledge alert               |
| 5   | PATCH  | `v1/behaviour/alerts/:id/snooze`      | `behaviour.view` | Snooze alert (with date)        |
| 6   | PATCH  | `v1/behaviour/alerts/:id/resolve`     | `behaviour.view` | Resolve alert                   |
| 7   | PATCH  | `v1/behaviour/alerts/:id/dismiss`     | `behaviour.view` | Dismiss alert (optional reason) |
| 8   | PATCH  | `v1/behaviour/alerts/:id/seen`        | `behaviour.view` | Mark alert as seen              |

---

## Section 4 — Service Layer

### `BehaviourPulseService`

**File**: `apps/api/src/modules/behaviour/behaviour-pulse.service.ts`
**Dependencies**: PrismaService, RedisService, BehaviourScopeService

| Method                       | Signature                                                             | Description                                      |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `getPulse`                   | `(tenantId: string) => Promise<PulseResult>`                          | Compute/cache 5-dimension pulse                  |
| `computePositiveRatio`       | `(tenantId: string, from: Date, to: Date) => Promise<number \| null>` | Dimension 1                                      |
| `computeSeverityIndex`       | `(tenantId: string, from: Date, to: Date) => Promise<number>`         | Dimension 2                                      |
| `computeSeriousIncidentRate` | `(tenantId: string, from: Date, to: Date) => Promise<number>`         | Dimension 3                                      |
| `computeResolutionRate`      | `(tenantId: string, from30: Date, to: Date) => Promise<number>`       | Dimension 4 (30-day window)                      |
| `computeReportingConfidence` | `(tenantId: string, from: Date, to: Date) => Promise<number \| null>` | Dimension 5                                      |
| `computeComposite`           | `(dimensions: DimensionScores) => number \| null`                     | Weighted composite (gated on confidence >= 0.50) |
| `invalidateCache`            | `(tenantId: string) => Promise<void>`                                 | Clear Redis pulse key                            |

**Cache**: `behaviour:pulse:{tenantId}` with 5-minute TTL. Invalidated by detect-patterns worker.

### `BehaviourAnalyticsService`

**File**: `apps/api/src/modules/behaviour/behaviour-analytics.service.ts`
**Dependencies**: PrismaService, BehaviourScopeService, BehaviourPulseService, RedisService

| Method                    | Signature                                                  | Description                              |
| ------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| `getOverview`             | `(tenantId, userId, query) => Promise<OverviewResult>`     | Total incidents, ratios, trends          |
| `getHeatmap`              | `(tenantId, userId, query) => Promise<HeatmapResult>`      | Weekday x period grid, exposure-adjusted |
| `getHistoricalHeatmap`    | `(tenantId, userId, query) => Promise<HeatmapResult>`      | Full historical version                  |
| `getTrends`               | `(tenantId, userId, query) => Promise<TrendResult>`        | Time series data                         |
| `getCategories`           | `(tenantId, userId, query) => Promise<CategoryResult>`     | Category breakdown                       |
| `getSubjects`             | `(tenantId, userId, query) => Promise<SubjectResult>`      | Per-subject rates                        |
| `getStaffActivity`        | `(tenantId, userId, query) => Promise<StaffResult>`        | Staff logging                            |
| `getSanctions`            | `(tenantId, userId, query) => Promise<SanctionResult>`     | Sanction summary                         |
| `getInterventionOutcomes` | `(tenantId, userId, query) => Promise<InterventionResult>` | Intervention outcomes                    |
| `getRatio`                | `(tenantId, userId, query) => Promise<RatioResult>`        | Positive/negative by group               |
| `getComparisons`          | `(tenantId, userId, query) => Promise<ComparisonResult>`   | Year group comparison                    |
| `getPolicyEffectiveness`  | `(tenantId, query) => Promise<PolicyResult>`               | Policy rule stats                        |
| `getTaskCompletion`       | `(tenantId, userId, query) => Promise<TaskResult>`         | Task completion rates                    |
| `getExposureRates`        | `(tenantId, query) => Promise<ExposureData \| null>`       | Fetch exposure MV data                   |

**Exposure normalisation**: Every rate method calls `getExposureRates()`. If no data, returns raw counts with `data_quality: { exposure_normalised: false }`.

**Scope enforcement**: All methods call `BehaviourScopeService.resolveScope()` to restrict data to user's permitted scope.

### `BehaviourAIService`

**File**: `apps/api/src/modules/behaviour/behaviour-ai.service.ts`
**Dependencies**: PrismaService, BehaviourScopeService, BehaviourAnalyticsService, RedisService

| Method            | Signature                                                           | Description                |
| ----------------- | ------------------------------------------------------------------- | -------------------------- |
| `processNLQuery`  | `(tenantId, userId, query, context?) => Promise<AIQueryResult>`     | Full NL query pipeline     |
| `callAI`          | `(prompt, timeout) => Promise<string>`                              | Claude first, GPT fallback |
| `getQueryHistory` | `(tenantId, userId, page, pageSize) => Promise<QueryHistoryResult>` | User's NL query history    |

**Pipeline**: validate permissions → resolve scope → fetch relevant data → anonymise → call AI → de-anonymise → log audit → return result.

**Providers**: Claude (`claude-sonnet-4-5`) primary with configurable timeout, OpenAI GPT-4o fallback on timeout/unavailable.

### `BehaviourAlertsService`

**File**: `apps/api/src/modules/behaviour/behaviour-alerts.service.ts`
**Dependencies**: PrismaService, BehaviourScopeService

| Method                | Signature                                                   | Description                                      |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `listAlerts`          | `(tenantId, userId, filters) => Promise<PaginatedAlerts>`   | User's alerts with tabs                          |
| `getAlert`            | `(tenantId, userId, alertId) => Promise<AlertDetail>`       | Alert with recipient state                       |
| `getBadgeCount`       | `(tenantId, userId) => Promise<number>`                     | Unseen + seen count                              |
| `markSeen`            | `(tenantId, userId, alertId) => Promise<void>`              | Set status = seen                                |
| `acknowledge`         | `(tenantId, userId, alertId) => Promise<void>`              | Set status = acknowledged                        |
| `snooze`              | `(tenantId, userId, alertId, until: Date) => Promise<void>` | Set status = snoozed                             |
| `resolve`             | `(tenantId, userId, alertId) => Promise<void>`              | Set status = resolved, check parent auto-resolve |
| `dismiss`             | `(tenantId, userId, alertId, reason?) => Promise<void>`     | Set status = dismissed                           |
| `createAlert`         | `(tenantId, data, recipientIds) => Promise<Alert>`          | Internal: used by detect-patterns worker         |
| `updateAlertSnapshot` | `(tenantId, alertId, snapshot) => Promise<void>`            | Internal: update existing alert data             |
| `checkAndAutoResolve` | `(tenantId, alertId) => Promise<void>`                      | Auto-resolve parent when all recipients done     |

---

## Section 5 — Frontend Pages and Components

### Page 1: `/behaviour/analytics`

**File**: `apps/web/src/app/[locale]/(school)/behaviour/analytics/page.tsx`
**Type**: Client component (`'use client'`)
**Data**: Fetches from analytics endpoints via API client
**Sections**:

1. Sticky filter bar (academic year/period, date range, year group/class, polarity, exposure toggle)
2. Pulse widget (5 gauges + composite) — conditional on `behaviour_pulse_enabled`
3. Overview cards (total incidents, ratio, open follow-ups, active alerts)
4. Trend chart (Recharts line chart, positive vs negative over time)
5. Heatmap (weekday x period grid, color-coded, click-to-drill)
6. Category breakdown (horizontal bar chart)
7. Subject analysis table (exposure-adjusted rates)
8. Year group comparison (bar chart)
9. Staff logging activity (table, conditional on `behaviour.view_staff_analytics`)

**Mobile**: Sections stack vertically. Charts horizontal scroll. Heatmap compact grid < 480px.

### Page 2: `/behaviour/analytics/ai`

**File**: `apps/web/src/app/[locale]/(school)/behaviour/analytics/ai/page.tsx`
**Type**: Client component (`'use client'`)
**Data**: POST to ai-query, GET ai-query/history
**Layout**:

- Query input (textarea 500 char, RTL-aware, suggested query chips)
- Optional context pickers (year group, student, date range)
- Result display (narrative, supporting data, labels, confidence)
- Query history panel (right desktop, bottom mobile)

### Page 3: `/behaviour/alerts`

**File**: `apps/web/src/app/[locale]/(school)/behaviour/alerts/page.tsx`
**Type**: Client component (`'use client'`)
**Data**: Fetches from alerts endpoints
**Layout**:

- Filter tabs: All | Unseen | Acknowledged | Snoozed | Resolved
- Alert cards with severity badge, type, title, description, status, actions
- Actions: Acknowledge, Snooze (date picker), Resolve, Dismiss (reason)

---

## Section 6 — Background Jobs

### Job 1: `behaviour:detect-patterns`

**Queue**: `behaviour`
**Trigger**: Cron, daily at 05:00 UTC
**Payload**: `{ tenant_id: string }`
**File**: `apps/worker/src/processors/behaviour/detect-patterns.processor.ts`
**Logic**:

1. Load tenant config and timezone
2. Run 7 detection algorithms (escalating_student, disengaging_student, hotspot, logging_gap, overdue_review, suspension_return, policy_threshold_breach)
3. Dedup: check for existing active alert of same type + entity
4. If exists: update data_snapshot. If new: create alert + recipients
5. Send in-app notification for warning/critical alerts
6. Force-refresh pulse cache

### Job 2: `behaviour:refresh-mv-student-summary`

**Queue**: `behaviour`
**Trigger**: Cron `*/15 * * * *`
**File**: `apps/worker/src/processors/behaviour/refresh-mv.processor.ts`
**Logic**: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_student_behaviour_summary`

### Job 3: `behaviour:refresh-mv-benchmarks`

**Queue**: `behaviour`
**Trigger**: Cron `0 3 * * *`
**Logic**: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_behaviour_benchmarks`

### Job 4: `behaviour:refresh-mv-exposure-rates`

**Queue**: `behaviour`
**Trigger**: Cron `0 2 * * *`
**Logic**: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_behaviour_exposure_rates`

Note: Jobs 2-4 share a single processor file with job-name routing.

---

## Section 7 — Implementation Order

1. **Database migration** — Drop/recreate 3 MVs with full definitions, add alert indexes
2. **Shared types and Zod schemas** — analytics query/response schemas, alert schemas, AI anonymisation utility
3. **Backend services** (in order):
   a. `BehaviourPulseService` (no dependencies on other new services)
   b. `BehaviourAnalyticsService` (depends on PulseService)
   c. `BehaviourAlertsService` (independent)
   d. `BehaviourAIService` (depends on AnalyticsService)
4. **Backend controllers**:
   a. `BehaviourAnalyticsController`
   b. `BehaviourAlertsController`
5. **Worker processors**:
   a. `detect-patterns.processor.ts`
   b. `refresh-mv.processor.ts` (handles all 3 MV refreshes)
6. **Frontend pages**:
   a. `/behaviour/analytics`
   b. `/behaviour/analytics/ai`
   c. `/behaviour/alerts`
7. **Module registration** — update BehaviourModule, WorkerModule, shared exports
8. **Type-check and lint fixes**
9. **Unit tests**

---

## Section 8 — Files to Create

### Shared (`packages/shared/src/`)

- `ai/anonymise.ts` — `anonymiseForAI`, `deAnonymiseFromAI`, types
- `ai/index.ts` — re-export
- `behaviour/schemas/analytics.schema.ts` — query/response schemas for 16 endpoints
- `behaviour/schemas/alert.schema.ts` — alert list/detail/action schemas

### Backend (`apps/api/src/modules/behaviour/`)

- `behaviour-pulse.service.ts`
- `behaviour-analytics.service.ts`
- `behaviour-analytics.controller.ts`
- `behaviour-alerts.service.ts`
- `behaviour-alerts.controller.ts`
- `behaviour-ai.service.ts`

### Worker (`apps/worker/src/processors/behaviour/`)

- `detect-patterns.processor.ts`
- `refresh-mv.processor.ts`

### Frontend (`apps/web/src/app/[locale]/(school)/behaviour/`)

- `analytics/page.tsx`
- `analytics/ai/page.tsx`
- `alerts/page.tsx`

### Database

- `packages/prisma/migrations/[timestamp]_upgrade_behaviour_materialised_views/migration.sql` (empty Prisma migration)
- `packages/prisma/migrations/[timestamp]_upgrade_behaviour_materialised_views/post_migrate.sql` (MV DDL)

---

## Section 9 — Files to Modify

| File                                                 | Change                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/behaviour/behaviour.module.ts` | Register PulseService, AnalyticsService, AlertsService, AIService, AnalyticsController, AlertsController |
| `apps/worker/src/worker.module.ts`                   | Register DetectPatternsProcessor, RefreshMVProcessor                                                     |
| `packages/shared/src/behaviour/schemas/index.ts`     | Export analytics + alert schemas                                                                         |
| `packages/shared/src/behaviour/index.ts`             | Export AI utilities                                                                                      |
| `packages/shared/src/index.ts`                       | Export AI module                                                                                         |
| `architecture/module-blast-radius.md`                | Add AI service dependencies                                                                              |
| `architecture/event-job-catalog.md`                  | Add 4 new worker jobs                                                                                    |

---

## Section 10 — Key Context for Executor

### Patterns from prior phases

- **RLS**: Use `createRlsClient(this.prisma, { tenant_id })` from `../../common/middleware/rls.middleware`
- **Redis caching**: Inject `RedisService`, use `this.redis.getClient()`, key format `behaviour:{resource}:{tenantId}`
- **Controller decorators**: `@Controller('v1')`, `@ModuleEnabled('behaviour')`, `@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)`, `@RequiresPermission('...')`
- **Validation**: `@Body(new ZodValidationPipe(schema))` or `@Query(new ZodValidationPipe(schema))`
- **Worker**: Extend `WorkerHost`, use `TenantAwareJob` inner class with `processJob(data, tx)`
- **Queue enqueue**: `queue.add('behaviour:job-name', { tenant_id, ...payload })`
- **Scope**: All analytics must call `BehaviourScopeService.resolveScope()` to restrict queries
- **Excluded statuses**: `['withdrawn', 'converted_to_safeguarding']` for all aggregations; `retention_status = 'active'`

### Gotchas

- `AlertStatus` enum in Prisma: `active_alert` maps to DB `active`, `resolved_alert` maps to DB `resolved`
- `AlertRecipientStatus` enum: `resolved_recipient` maps to DB `resolved`
- Schedule table is `schedules` (not `schedule_entries`), class has `subject_id` and `year_group_id`
- Exposure rates MV joins: `schedules` -> `classes` (for subject_id, year_group_id) -> `class_enrolments` (for student count) -> `academic_periods` (for period dates)
- MVs use `WITH DATA` in the new migration (not `WITH NO DATA` like Phase A stubs)
- AI packages (`@anthropic-ai/sdk`, `openai`) may need installation — check package.json first
- `behaviourSettingsSchema` already has all AI/pulse/benchmark keys defined
- Pulse dimension 4 (Resolution Rate) uses a 30-day window, not 7 days like the other dimensions
- Composite score is NULL when `reporting_confidence < 0.50`
