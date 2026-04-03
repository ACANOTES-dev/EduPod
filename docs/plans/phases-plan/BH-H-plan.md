# Phase H: Hardening + Ops + Scale — Implementation Plan

## Section 1 — Overview

Phase H hardens the existing Behaviour Management module. No new end-user features. Deliverables:

1. **LegalHoldService** — full lifecycle with propagation cascade
2. **Retention worker** — monthly archival + anonymisation with legal hold gating
3. **14 admin operations endpoints** — preview/execute guardrail, dual-approval
4. **Admin dashboard** — `/settings/behaviour-admin` with 5 tabs
5. **Table partitioning** — 6 high-volume tables, partition management cron
6. **7 release-gate test suites** — data classification, scope, status projection, parent-safe, safeguarding isolation, idempotency, RLS
7. **Unit + integration tests** — legal holds, retention, admin ops

Dependencies on prior phases:

- History service pattern: `apps/api/src/modules/behaviour/behaviour-history.service.ts`
- RLS client pattern: `createRlsClient()` from `apps/api/src/common/middleware/rls.middleware.ts`
- Worker pattern: `TenantAwareJob` base class in `apps/worker/src/base/tenant-aware-job.ts`
- Settings schema: `packages/shared/src/behaviour/schemas/settings.schema.ts`
- Approvals module: `apps/api/src/modules/approvals/`

## Section 2 — Database Changes

### `behaviour_legal_holds` — Already exists (Phase A)

Table, RLS, entity index already created. Need to add:

- Second index: `(tenant_id, status)` — for admin overview query
- Fix enum mapping: `LegalHoldStatus.active_hold` maps to `active` in DB

### Partitioning (raw SQL migration)

6 tables get range partitioning by `created_at`:

- `behaviour_entity_history` — monthly
- `behaviour_policy_evaluations` — monthly
- `behaviour_policy_action_executions` — monthly
- `behaviour_parent_acknowledgements` — monthly
- `behaviour_alerts` — yearly
- `behaviour_alert_recipients` — yearly

**Note**: Partitioning existing populated tables requires special handling. Since these tables exist but may not have data in production yet (module not yet deployed), we create the partition structure.

## Section 3 — API Endpoints

All under `v1/behaviour/admin`, require `behaviour.admin`.

| #   | Method | Route                             | Preview/Execute           | Dual Approval               |
| --- | ------ | --------------------------------- | ------------------------- | --------------------------- |
| 1   | POST   | `/admin/recompute-points`         | Yes (query ?preview=true) | Always for tenant-wide      |
| 2   | POST   | `/admin/rebuild-awards`           | Yes                       | Per setting for tenant-wide |
| 3   | POST   | `/admin/recompute-pulse`          | No                        | No                          |
| 4   | POST   | `/admin/backfill-tasks`           | Yes                       | Per setting                 |
| 5   | POST   | `/admin/resend-notification`      | No                        | No                          |
| 6   | POST   | `/admin/refresh-views`            | No                        | No                          |
| 7   | POST   | `/admin/policy-dry-run`           | N/A (read-only)           | No                          |
| 8   | GET    | `/admin/dead-letter`              | No                        | No                          |
| 9   | POST   | `/admin/dead-letter/:jobId/retry` | No                        | No                          |
| 10  | GET    | `/admin/scope-audit`              | No                        | No                          |
| 11  | GET    | `/admin/health`                   | No                        | No                          |
| 12  | POST   | `/admin/reindex-search`           | Yes                       | Always                      |
| 13  | POST   | `/admin/retention/preview`        | No                        | No                          |
| 14  | POST   | `/admin/retention/execute`        | No                        | Always                      |

Legal hold endpoints (in same controller):
| 15 | GET | `/admin/legal-holds` | No | No |
| 16 | POST | `/admin/legal-holds` | No | No |
| 17 | POST | `/admin/legal-holds/:id/release` | No | No |

## Section 4 — Service Layer

### `LegalHoldService` (`behaviour-legal-hold.service.ts`)

- `createHold()` — create + propagate + log history
- `releaseHold()` — update status + log + optional releaseLinked
- `propagateHold()` — one-level propagation per anchor type
- `listHolds()` — paginated list for admin dashboard
- `getActiveHoldForEntity()` — check by entity_type + entity_id
- `hasActiveHold()` — boolean check for retention worker

### `BehaviourAdminService` (`behaviour-admin.service.ts`)

- `recomputePoints()` — invalidate Redis + recompute from source
- `rebuildAwards()` — scan for missing threshold awards
- `recomputePulse()` — force pulse recalculation
- `backfillTasks()` — scan entities for missing tasks
- `resendNotification()` — re-queue parent notification
- `refreshViews()` — REFRESH MATERIALIZED VIEW CONCURRENTLY
- `policyDryRun()` — delegates to PolicyReplayService
- `listDeadLetterJobs()` — query BullMQ failed jobs
- `retryDeadLetterJob()` — move job back to waiting
- `scopeAudit()` — resolve user scope and list accessible students
- `healthCheck()` — aggregate queue depths, cache rates, view freshness
- `reindexSearch()` — rebuild Meilisearch index
- `retentionPreview()` — dry-run retention worker
- `retentionExecute()` — enqueue retention worker

## Section 5 — Frontend Pages

### `/settings/behaviour-admin` — 5 tabs

- Tab 1: System Health (queue gauges, cache rate, view freshness, scan backlog, legal holds count)
- Tab 2: Dead-Letter Queue (table, retry buttons)
- Tab 3: Operations (cards with preview/execute for each operation)
- Tab 4: Scope Audit (staff search, audit results)
- Tab 5: Retention (config display, preview, legal holds list, execute)

## Section 6 — Background Jobs

### `behaviour:retention-check`

- Queue: `behaviour`
- Trigger: Monthly cron (1st of month, 01:00 UTC) or manual via admin
- Class: `RetentionCheckProcessor` extends `WorkerHost`
- Payload: `{ tenant_id, dry_run? }`
- Processing: archival pass → anonymisation pass → guardian restriction expiry

### `behaviour:partition-maintenance`

- Queue: `behaviour`
- Trigger: Monthly cron (1st of month, 00:00 UTC)
- Not tenant-aware (schema management)
- Creates next 3 months of partitions for all 6 partitioned tables

## Section 7 — Implementation Order

1. Shared types and Zod schemas (legal-hold schema, admin-ops schema)
2. LegalHoldService (service + entity history integration)
3. Retention worker processor
4. Admin service + controller
5. Partition management migration + worker
6. Frontend admin dashboard page
7. Unit tests for legal holds, retention, admin ops
8. Release-gate test suites (7 suites)

## Section 8 — Files to Create

- `packages/shared/src/behaviour/schemas/legal-hold.schema.ts`
- `packages/shared/src/behaviour/schemas/admin-ops.schema.ts`
- `apps/api/src/modules/behaviour/behaviour-legal-hold.service.ts`
- `apps/api/src/modules/behaviour/behaviour-legal-hold.service.spec.ts`
- `apps/api/src/modules/behaviour/behaviour-admin.service.ts`
- `apps/api/src/modules/behaviour/behaviour-admin.service.spec.ts`
- `apps/api/src/modules/behaviour/behaviour-admin.controller.ts`
- `apps/worker/src/processors/behaviour/retention-check.processor.ts`
- `apps/worker/src/processors/behaviour/partition-maintenance.processor.ts`
- `apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx`
- `apps/api/src/modules/behaviour/tests/release-gate/15-1-data-classification.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-2-scope-enforcement.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-3-status-projection.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-4-parent-safe-rendering.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-5-safeguarding-isolation.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-6-idempotency-dedup.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-7-rls-verification.spec.ts`

## Section 9 — Files to Modify

- `apps/api/src/modules/behaviour/behaviour.module.ts` — add LegalHoldService, AdminService, AdminController
- `apps/worker/src/worker.module.ts` — add RetentionCheckProcessor, PartitionMaintenanceProcessor
- `packages/shared/src/behaviour/schemas/index.ts` — export new schemas
- `packages/shared/src/behaviour/index.ts` — export new schemas

## Section 10 — Key Context for Executor

- `LegalHoldStatus.active_hold` maps to `'active'` in DB via `@map("active")`
- `createRlsClient(prisma, { tenant_id }).$transaction(async (tx) => { ... })` is the standard pattern
- Worker processors extend `WorkerHost` and use `TenantAwareJob` for tenant-scoped work
- History service uses `recordHistory(tx, tenantId, entityType, entityId, userId, changeType, prev, new, reason)`
- Partition management is NOT tenant-aware — it manages DB schema directly
- BullMQ queue introspection uses `Queue.getJobs()` API
