# Phase B: Policy Engine — Results

## Summary

Phase B delivers the full 5-stage policy evaluation engine for behaviour management. When an incident is created or a student participant is added, a BullMQ job evaluates all active policy rules across 5 stages (consequence → approval → notification → support → alerting) per student participant. Rules are versioned, evaluations are recorded in an append-only forensic ledger, and actions are executed with idempotent dedup guards.

## Database

No schema changes — all 5 policy tables were created in Phase A:

- `behaviour_policy_rules` (14 columns)
- `behaviour_policy_rule_actions` (6 columns)
- `behaviour_policy_rule_versions` (12 columns, append-only)
- `behaviour_policy_evaluations` (12 columns, append-only)
- `behaviour_policy_action_executions` (10 columns, append-only)

## API Endpoints: 12 routes added

### Policy Rules CRUD (in behaviour-config.controller.ts)

| Method | Path                                          | Permission        |
| ------ | --------------------------------------------- | ----------------- |
| GET    | `v1/behaviour/policies`                       | `behaviour.admin` |
| POST   | `v1/behaviour/policies`                       | `behaviour.admin` |
| GET    | `v1/behaviour/policies/export`                | `behaviour.admin` |
| POST   | `v1/behaviour/policies/import`                | `behaviour.admin` |
| POST   | `v1/behaviour/policies/replay`                | `behaviour.admin` |
| GET    | `v1/behaviour/policies/:id`                   | `behaviour.admin` |
| PATCH  | `v1/behaviour/policies/:id`                   | `behaviour.admin` |
| DELETE | `v1/behaviour/policies/:id`                   | `behaviour.admin` |
| GET    | `v1/behaviour/policies/:id/versions`          | `behaviour.admin` |
| GET    | `v1/behaviour/policies/:id/versions/:version` | `behaviour.admin` |
| PATCH  | `v1/behaviour/policies/:id/priority`          | `behaviour.admin` |
| POST   | `v1/behaviour/admin/policy-dry-run`           | `behaviour.admin` |

### Updated endpoint

| Method | Path                                           | Permission         |
| ------ | ---------------------------------------------- | ------------------ |
| GET    | `v1/behaviour/incidents/:id/policy-evaluation` | `behaviour.manage` |

## Services: 3

| Service                  | Responsibilities                                                        |
| ------------------------ | ----------------------------------------------------------------------- |
| `PolicyRulesService`     | CRUD with versioning, import/export with category name token resolution |
| `PolicyEvaluationEngine` | 5-stage pipeline, condition matching, action execution with dedup       |
| `PolicyReplayService`    | Historical replay, admin dry-run, incident evaluation trace             |

## Frontend: 1 page

| Route                          | Description                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/settings/behaviour-policies` | Stage tabs, rule list with reorder, rule editor drawer, condition/action builders, replay panel, dry-run dialog, version history, JSON import/export |

## Background Jobs: 1

| Job                         | Queue     | Trigger                                 |
| --------------------------- | --------- | --------------------------------------- |
| `behaviour:evaluate-policy` | behaviour | Incident creation, participant addition |

## Configuration

### Seed Data: 5 default policy rules

1. "3 verbal warnings in 30 days → written warning" (consequence stage)
2. "Suspension for SEND students requires deputy approval" (approval stage)
3. "Expulsion requires principal approval" (approval stage)
4. "Negative incident above severity threshold → notify parent" (notification stage)
5. "High-severity negative incident → flag for management review" (alerting stage)

## Files Created: 11

### Backend (3 files)

- `apps/api/src/modules/behaviour/policy/policy-rules.service.ts`
- `apps/api/src/modules/behaviour/policy/policy-evaluation-engine.ts`
- `apps/api/src/modules/behaviour/policy/policy-replay.service.ts`

### Shared (5 files)

- `packages/shared/src/behaviour/schemas/policy-condition.schema.ts`
- `packages/shared/src/behaviour/schemas/policy-action-config.schema.ts`
- `packages/shared/src/behaviour/schemas/policy-rules.schema.ts`
- `packages/shared/src/behaviour/schemas/policy-replay.schema.ts`
- `packages/shared/src/behaviour/schemas/policy-dry-run.schema.ts`

### Worker (1 file)

- `apps/worker/src/processors/behaviour/evaluate-policy.processor.ts`

### Frontend (1 file)

- `apps/web/src/app/[locale]/(school)/settings/behaviour-policies/page.tsx`

### Plan (1 file)

- `Plans/phases-plan/BH-B-plan.md`

## Files Modified: 8

- `apps/api/src/modules/behaviour/behaviour-config.controller.ts` — Added 12 policy endpoints
- `apps/api/src/modules/behaviour/behaviour.controller.ts` — Replaced policy-evaluation stub with real implementation
- `apps/api/src/modules/behaviour/behaviour.module.ts` — Registered policy services, imported ApprovalsModule, registered behaviour queue
- `apps/api/src/modules/behaviour/behaviour.service.ts` — Added behaviour queue injection, enqueue evaluate-policy on createIncident and addParticipant
- `apps/worker/src/worker.module.ts` — Registered EvaluatePolicyProcessor
- `packages/prisma/seed/behaviour-seed.ts` — Added 5 default policy rules with version snapshots
- `packages/shared/src/behaviour/schemas/index.ts` — Added policy schema exports
- `architecture/module-blast-radius.md` — Updated BehaviourModule imports/exports
- `architecture/event-job-catalog.md` — Added behaviour:evaluate-policy job entry

## Known Limitations

- Replay does not recompute repeat counts from DB (uses frozen snapshot with repeat_count=0)
- `notify_roles` and `notify_users` actions record success but don't dispatch actual notifications (deferred to Phase G communications)
- `auto_escalate` creates incident without calling SequenceService for incident number
- Sanctions created by policy engine don't have sequence numbers assigned
- Pre-existing CI failures from Phase D type errors in safeguarding services block deployment

## Deviations from Plan

- Frontend uses a single page.tsx file instead of separate component files (simpler for initial implementation)
- No Card/Tabs/Slider UI components from @school/ui (not available) — used custom styled divs and button tabs
- Worker processor duplicates evaluation logic from PolicyEvaluationEngine (to avoid NestJS DI in worker context) — should be consolidated when worker supports DI
