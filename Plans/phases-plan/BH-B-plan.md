# Phase B: Policy Engine — Implementation Plan

## Section 1 — Overview

Phase B delivers the **5-stage policy evaluation engine** for behaviour management. When an incident is created or a participant is added, a BullMQ job evaluates all active policy rules across 5 stages (consequence → approval → notification → support → alerting) per student participant. Rules are versioned, evaluations are recorded in an append-only forensic ledger, and actions are executed with idempotent dedup guards.

**Dependencies on Phase A:**
- All 5 policy tables exist in Prisma schema with RLS (created in Phase A migration)
- Prisma enums: `PolicyStage`, `PolicyMatchStrategy`, `PolicyEvaluationResult`, `PolicyActionType`, `PolicyActionExecutionStatus`
- `BehaviourIncident` model has `policy_evaluation_id`, `escalated_from_id`, `approval_status`, `approval_request_id` columns
- Incident CRUD, participants, categories, tasks, history, scope services all working
- `BEHAVIOUR` queue registered in `queue.constants.ts`
- `TenantAwareJob` base class pattern established

**Key Prisma enum mappings (critical for correctness):**
- `PolicyStage.approval_stage` → DB value `approval`
- `PolicyStage.notification_stage` → DB value `notification`
- `PolicyEvaluationResult.evaluation_error` → maps to `error` concept in spec

## Section 2 — Database Changes

No schema migrations needed — all 5 tables created in Phase A. This phase adds only service logic.

## Section 3 — API Endpoints

### Policy Rules CRUD (in behaviour-config.controller.ts)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `v1/behaviour/policies` | `behaviour.admin` | List rules (filter by stage, is_active) |
| POST | `v1/behaviour/policies` | `behaviour.admin` | Create rule + snapshot v1 |
| GET | `v1/behaviour/policies/:id` | `behaviour.admin` | Rule detail with actions |
| PATCH | `v1/behaviour/policies/:id` | `behaviour.admin` | Update rule (snapshots prev version) |
| DELETE | `v1/behaviour/policies/:id` | `behaviour.admin` | Soft-delete (is_active=false) |
| GET | `v1/behaviour/policies/:id/versions` | `behaviour.admin` | Version history |
| GET | `v1/behaviour/policies/:id/versions/:version` | `behaviour.admin` | Specific version |
| PATCH | `v1/behaviour/policies/:id/priority` | `behaviour.admin` | Reorder priority |
| POST | `v1/behaviour/policies/replay` | `behaviour.admin` | Historical replay |
| POST | `v1/behaviour/policies/import` | `behaviour.admin` | Import rules from JSON |
| GET | `v1/behaviour/policies/export` | `behaviour.admin` | Export rules as JSON |

### Admin Dry-Run

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `v1/behaviour/admin/policy-dry-run` | `behaviour.admin` | Evaluate hypothetical incident |

### Policy Evaluation Log (existing controller)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `v1/behaviour/incidents/:id/policy-evaluation` | `behaviour.manage` | Full decision trace |

## Section 4 — Service Layer

### PolicyRulesService
- `listRules(tenantId, filters)` — paginated list with stage/active filters
- `createRule(tenantId, userId, dto)` — create + snapshot v1
- `getRule(tenantId, ruleId)` — detail with actions
- `updateRule(tenantId, ruleId, userId, dto)` — snapshot prev, update, replace actions
- `deleteRule(tenantId, ruleId)` — soft delete
- `getVersionHistory(tenantId, ruleId)` — all versions desc
- `getVersion(tenantId, ruleId, version)` — specific snapshot
- `updatePriority(tenantId, ruleId, newPriority)` — reorder
- `importRules(tenantId, userId, rules)` — bulk create with category name resolution
- `exportRules(tenantId)` — export with category name tokens

### PolicyEvaluationEngine
- `evaluateForStudent(incident, participant, evaluatedStages, tx)` — 5-stage pipeline
- `evaluateConditions(conditions, input)` — pure function, AND logic
- `buildEvaluatedInput(incident, participant, conditions, tx)` — fact assembly
- `computeRepeatCount(incident, participant, conditions, tx)` — rolling window count
- `executeAction(action, incident, participant, evaluationId, tx)` — dispatch with dedup
- `getVersionId(ruleId, version, tx)` — lookup version snapshot ID

### PolicyReplayService
- `replayRule(tenantId, dto, tx)` — historical replay, read-only
- `dryRun(tenantId, dto, tx)` — hypothetical evaluation, read-only
- `getIncidentEvaluationTrace(tenantId, incidentId)` — full decision trace

## Section 5 — Frontend Pages

### `/settings/behaviour-policies/page.tsx`
- Server component shell with data fetching
- Client component with stage tabs, rule list, editors, replay, dry-run

### Components (all in same directory):
- `BehaviourPoliciesPageClient.tsx` — Stage tabs, rule list with drag-to-reorder
- `RuleEditorDrawer.tsx` — Create/edit rule with conditions + actions
- `ConditionBuilder.tsx` — Visual condition editor
- `ActionBuilder.tsx` — Visual action editor with type-specific forms
- `ReplayPanel.tsx` — Historical replay execution + results
- `DryRunPanel.tsx` — Hypothetical test mode
- `PolicyImportExportButtons.tsx` — Import/export JSON

## Section 6 — Background Jobs

### `behaviour:evaluate-policy`
- Queue: `behaviour`
- Trigger: incident creation + participant addition
- Payload: `{ tenant_id, incident_id, trigger, triggered_at }`
- Processor: `EvaluatePolicyProcessor` extending `WorkerHost`
- Delegates to `PolicyEvaluationEngine.evaluateForStudent` per participant
- Idempotent: skips already-evaluated stages

## Section 7 — Implementation Order

1. Shared Zod schemas
2. PolicyRulesService (CRUD + versioning)
3. PolicyEvaluationEngine (condition matching + stage pipeline + action execution)
4. PolicyReplayService (replay + dry-run)
5. Controllers (policy CRUD, replay, dry-run, evaluation trace)
6. Worker job processor
7. Wire job enqueue in BehaviourService
8. Seed data (5 default rules)
9. Frontend page
10. Update module registrations
11. Architecture docs update

## Section 8 — Files to Create

```
packages/shared/src/behaviour/schemas/policy-condition.schema.ts
packages/shared/src/behaviour/schemas/policy-action-config.schema.ts
packages/shared/src/behaviour/schemas/policy-rules.schema.ts
packages/shared/src/behaviour/schemas/policy-replay.schema.ts
packages/shared/src/behaviour/schemas/policy-dry-run.schema.ts
apps/api/src/modules/behaviour/policy/policy-rules.service.ts
apps/api/src/modules/behaviour/policy/policy-evaluation-engine.ts
apps/api/src/modules/behaviour/policy/policy-replay.service.ts
apps/worker/src/processors/behaviour/evaluate-policy.processor.ts
apps/web/src/app/[locale]/(school)/settings/behaviour-policies/page.tsx
apps/web/src/app/[locale]/(school)/settings/behaviour-policies/BehaviourPoliciesPageClient.tsx
apps/web/src/app/[locale]/(school)/settings/behaviour-policies/RuleEditorDrawer.tsx
apps/web/src/app/[locale]/(school)/settings/behaviour-policies/ConditionBuilder.tsx
apps/web/src/app/[locale]/(school)/settings/behaviour-policies/ActionBuilder.tsx
apps/web/src/app/[locale]/(school)/settings/behaviour-policies/ReplayPanel.tsx
apps/web/src/app/[locale]/(school)/settings/behaviour-policies/DryRunPanel.tsx
apps/web/src/app/[locale]/(school)/settings/behaviour-policies/PolicyImportExportButtons.tsx
```

## Section 9 — Files to Modify

```
packages/shared/src/behaviour/schemas/index.ts — Add policy schema exports
packages/shared/src/behaviour/index.ts — No change needed (re-exports schemas/)
apps/api/src/modules/behaviour/behaviour-config.controller.ts — Add policy CRUD + replay + import/export endpoints
apps/api/src/modules/behaviour/behaviour.controller.ts — Add GET policy-evaluation endpoint on incidents
apps/api/src/modules/behaviour/behaviour.service.ts — Enqueue evaluate-policy job on createIncident + addParticipant
apps/api/src/modules/behaviour/behaviour.module.ts — Register policy services, import ApprovalsModule, register behaviour queue
apps/worker/src/worker.module.ts — Register EvaluatePolicyProcessor
packages/prisma/seed/behaviour-seed.ts — Add 5 default policy rules + v1 snapshots
architecture/module-blast-radius.md — BehaviourModule now imports ApprovalsModule
architecture/event-job-catalog.md — Add behaviour:evaluate-policy job entry
```

## Section 10 — Key Context

- `PolicyStage` enum in Prisma uses `approval_stage` and `notification_stage` (mapped to DB values `approval` and `notification`)
- Stage order constant: `['consequence', 'approval_stage', 'notification_stage', 'support', 'alerting']`
- The evaluation engine is a pure pipeline — no cross-module queries (only incident + participant snapshots)
- Replay must NEVER trigger side effects — separate code path from live evaluation
- ApprovalRequestsService.checkAndCreateIfNeeded() is the integration point for require_approval actions
- BehaviourService uses `createRlsClient(this.prisma, { tenant_id })` pattern
- Worker jobs use `TenantAwareJob` base class with `processJob(data, tx)` abstract method
- Existing `notificationsQueue` is injected via `@InjectQueue('notifications')`; Phase B also needs `@InjectQueue('behaviour')` for the evaluate-policy job
