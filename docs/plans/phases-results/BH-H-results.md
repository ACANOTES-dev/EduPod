# Phase H: Hardening + Ops + Scale — Results

## Summary

Phase H hardens the Behaviour Management module for production. No new end-user features. Deliverables: legal holds with propagation cascade, monthly retention worker with archival/anonymisation/legal hold gating, 17 admin operations endpoints with preview/execute guardrail, admin dashboard (5 tabs), partition maintenance worker, 7 release-gate test suites (129 tests), and 20 unit tests.

## Database

No schema changes. All tables used were created in Phase A. New index needed (not yet migrated):

- `behaviour_legal_holds`: secondary index `(tenant_id, status)` for admin overview query

## API Endpoints: 17 routes added

### Admin Operations Controller (`behaviour-admin.controller.ts`)

| Method | Path                                          | Permission        |
| ------ | --------------------------------------------- | ----------------- |
| GET    | `v1/behaviour/admin/health`                   | `behaviour.admin` |
| GET    | `v1/behaviour/admin/dead-letter`              | `behaviour.admin` |
| POST   | `v1/behaviour/admin/dead-letter/:jobId/retry` | `behaviour.admin` |
| POST   | `v1/behaviour/admin/recompute-points/preview` | `behaviour.admin` |
| POST   | `v1/behaviour/admin/recompute-points`         | `behaviour.admin` |
| POST   | `v1/behaviour/admin/rebuild-awards/preview`   | `behaviour.admin` |
| POST   | `v1/behaviour/admin/rebuild-awards`           | `behaviour.admin` |
| POST   | `v1/behaviour/admin/recompute-pulse`          | `behaviour.admin` |
| POST   | `v1/behaviour/admin/backfill-tasks/preview`   | `behaviour.admin` |
| POST   | `v1/behaviour/admin/backfill-tasks`           | `behaviour.admin` |
| POST   | `v1/behaviour/admin/resend-notification`      | `behaviour.admin` |
| POST   | `v1/behaviour/admin/refresh-views`            | `behaviour.admin` |
| POST   | `v1/behaviour/admin/policy-dry-run`           | `behaviour.admin` |
| GET    | `v1/behaviour/admin/scope-audit`              | `behaviour.admin` |
| POST   | `v1/behaviour/admin/reindex-search/preview`   | `behaviour.admin` |
| POST   | `v1/behaviour/admin/reindex-search`           | `behaviour.admin` |
| POST   | `v1/behaviour/admin/retention/preview`        | `behaviour.admin` |
| POST   | `v1/behaviour/admin/retention/execute`        | `behaviour.admin` |
| GET    | `v1/behaviour/admin/legal-holds`              | `behaviour.admin` |
| POST   | `v1/behaviour/admin/legal-holds`              | `behaviour.admin` |
| POST   | `v1/behaviour/admin/legal-holds/:id/release`  | `behaviour.admin` |

## Services: 2

| Service                     | Responsibilities                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BehaviourLegalHoldService` | Create/release/propagate legal holds, entity history logging, active hold check                                                                       |
| `BehaviourAdminService`     | Health monitoring, dead-letter management, points/pulse/awards/tasks operations, scope audit, retention preview/execute, view refresh, search reindex |

## Frontend: 1 page

| Route                       | Description                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `/settings/behaviour-admin` | Admin dashboard with 5 tabs: System Health, Dead-Letter Queue, Operations, Scope Audit, Retention |

## Background Jobs: 2

| Job                               | Queue     | Description                                             |
| --------------------------------- | --------- | ------------------------------------------------------- |
| `behaviour:retention-check`       | behaviour | Monthly archival + anonymisation with legal hold gating |
| `behaviour:partition-maintenance` | behaviour | Monthly partition creation for 6 high-volume tables     |

## Tests: 149

| Category                    | Count |
| --------------------------- | ----- |
| LegalHoldService unit tests | 10    |
| AdminService unit tests     | 10    |
| 15.1 Data Classification    | 10    |
| 15.2 Scope Enforcement      | 9     |
| 15.3 Status Projection      | 5     |
| 15.4 Parent-Safe Rendering  | 12    |
| 15.5 Safeguarding Isolation | 9     |
| 15.6 Idempotency & Dedup    | 11    |
| 15.7 RLS Verification       | 73    |

## Files Created: 17

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

## Files Modified: 6

- `apps/api/src/modules/behaviour/behaviour.module.ts` — Added LegalHoldService, AdminService, AdminController
- `apps/worker/src/worker.module.ts` — Added RetentionCheckProcessor, PartitionMaintenanceProcessor
- `packages/shared/src/behaviour/schemas/index.ts` — Export new schemas
- `architecture/event-job-catalog.md` — Added 2 new job entries
- `architecture/state-machines.md` — Added legal hold + retention status lifecycles
- `architecture/danger-zones.md` — Added DZ-21 (anonymisation irreversibility), DZ-22 (partition DDL)

## Known Limitations

- Table partitioning is configuration only — actual partition DDL not yet applied (requires migration)
- Dual approval for destructive ops returns placeholder (full ApprovalModule integration deferred)
- Cron jobs (`behaviour:retention-check`, `behaviour:partition-maintenance`) not yet registered in CronSchedulerService
- Scale tests not run (require staging environment with 50k+ records)
- Translation files not created
- Sidebar nav not updated to include Behaviour Admin link
