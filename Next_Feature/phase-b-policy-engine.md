# Phase B: Policy Engine — Implementation Spec

> **Phase**: B of H
> **Depends on**: Phase A complete (all 32 tables created, RLS policies applied, incidents CRUD + participants working, categories + templates seeded)
> **Delivers**: Full 5-stage policy rules engine with versioning, evaluation ledger, action execution with dedup guards, historical replay, admin dry-run, and settings UI

---

## Prerequisites

Before beginning Phase B, verify Phase A is complete:

- [ ] All 32 behaviour/safeguarding tables exist in the schema with correct RLS policies
- [ ] `behaviour_incidents` CRUD endpoints are working (`POST`, `GET`, `PATCH`, `DELETE`)
- [ ] `behaviour_incident_participants` CRUD is working, including the constraint enforcing at least one student participant
- [ ] `behaviour_categories` and `behaviour_description_templates` are seeded
- [ ] `SequenceService` is generating `BH-` incident numbers
- [ ] Data classification framework (`DataClassification` enum, `stripFieldsByClassification`) exists in `packages/shared/`
- [ ] Permissions (`behaviour.log`, `behaviour.view`, `behaviour.manage`, `behaviour.admin`) are registered and enforced
- [ ] `behaviour_entity_history` is recording lifecycle events on incidents

---

## Objectives

1. Implement the **5-stage policy evaluation pipeline** (`consequence → approval → notification → support → alerting`) as a BullMQ worker job triggered on incident creation and participant addition
2. Implement **rule versioning** — every rule edit snapshots to `behaviour_policy_rule_versions`; evaluations reference the exact version that fired
3. Build the **evaluation ledger** — `behaviour_policy_evaluations` (one row per stage per student per incident) + `behaviour_policy_action_executions` (one row per action)
4. Implement **action execution with dedup guards** — each action type is idempotent; duplicate execution is detected and skipped
5. Implement **historical replay** — test a candidate rule against past incidents before activating it
6. Implement **admin dry-run** — evaluate a hypothetical incident against current active rules
7. Build the **settings UI** at `/settings/behaviour-policies` with stage tabs, rule builder, replay, and test mode

---

## Tables

All five tables below are created in Phase A (schema + RLS). Phase B adds the service logic, job processors, and endpoints that use them. Full definitions are reproduced here for implementer reference.

### `behaviour_policy_rules`

Five-stage execution pipeline replacing single-pass first-match-wins.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `name` | VARCHAR(200) NOT NULL | |
| `description` | TEXT NULL | |
| `is_active` | BOOLEAN DEFAULT true | |
| `stage` | ENUM(`'consequence'`, `'approval'`, `'notification'`, `'support'`, `'alerting'`) NOT NULL | Execution stage |
| `priority` | INT NOT NULL DEFAULT 100 | Priority within stage. Lower number = evaluated first |
| `match_strategy` | ENUM(`'first_match'`, `'all_matching'`) NOT NULL DEFAULT `'first_match'` | Per-rule override within stage |
| `stop_processing_stage` | BOOLEAN DEFAULT false | If true and this rule matches, no further rules in this stage are evaluated |
| `conditions` | JSONB NOT NULL | Zod-validated condition set — see `PolicyConditionSchema` below |
| `current_version` | INT NOT NULL DEFAULT 1 | Incremented on every edit |
| `last_published_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Indexes**:
- `idx_policy_rules_tenant_stage_priority` on `(tenant_id, stage, priority)` — primary evaluation query
- `idx_policy_rules_tenant_active` on `(tenant_id, is_active)` where `is_active = true`

---

### `behaviour_policy_rule_actions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `rule_id` | UUID FK NOT NULL | -> `behaviour_policy_rules` |
| `action_type` | ENUM (see Action Types below) NOT NULL | |
| `action_config` | JSONB NOT NULL | Type-specific configuration — see Action Config Schemas below |
| `execution_order` | INT NOT NULL DEFAULT 0 | Lower = executed first within a rule |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Action type enum values**: `'auto_escalate'`, `'create_sanction'`, `'require_approval'`, `'require_parent_meeting'`, `'require_parent_notification'`, `'create_task'`, `'create_intervention'`, `'notify_roles'`, `'notify_users'`, `'flag_for_review'`, `'block_without_approval'`

**Index**: `idx_policy_rule_actions_rule_id` on `(rule_id, execution_order)`

---

### `behaviour_policy_rule_versions`

Immutable snapshot of every version of a rule. Append-only. Never updated, never deleted.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `rule_id` | UUID FK NOT NULL | -> `behaviour_policy_rules` |
| `version` | INT NOT NULL | Matches `behaviour_policy_rules.current_version` at time of snapshot |
| `name` | VARCHAR(200) NOT NULL | |
| `conditions` | JSONB NOT NULL | Full conditions snapshot at this version |
| `actions` | JSONB NOT NULL | Full actions snapshot: `[{ action_type, action_config, execution_order }]` |
| `stage` | ENUM — same values as `behaviour_policy_rules.stage` | |
| `match_strategy` | ENUM — same values as `behaviour_policy_rules.match_strategy` | |
| `priority` | INT NOT NULL | |
| `changed_by_id` | UUID FK NOT NULL | -> `users` |
| `change_reason` | TEXT NULL | Optional reason for the change |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Append-only |

**UNIQUE**: `(rule_id, version)`

**Index**: `idx_policy_rule_versions_rule_id` on `(rule_id, version DESC)`

---

### `behaviour_policy_evaluations`

Forensic ledger. One row per stage per student per incident (up to 5 per student per incident — one for each stage). Append-only.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `incident_id` | UUID FK NOT NULL | -> `behaviour_incidents` |
| `student_id` | UUID FK NOT NULL | -> `students` |
| `stage` | ENUM(`'consequence'`, `'approval'`, `'notification'`, `'support'`, `'alerting'`) NOT NULL | Which pipeline stage this evaluation belongs to |
| `rule_version_id` | UUID FK NULL | -> `behaviour_policy_rule_versions`. NULL if no rule matched in this stage |
| `evaluation_result` | ENUM(`'matched'`, `'no_match'`, `'skipped_inactive'`, `'error'`) | |
| `evaluated_input` | JSONB NOT NULL | Complete facts snapshot at evaluation time — see `EvaluatedInputSchema` below |
| `matched_conditions` | JSONB NULL | Which conditions matched |
| `unmatched_conditions` | JSONB NULL | Which conditions did not match |
| `rules_evaluated_count` | INT NOT NULL | How many rules in this stage were evaluated |
| `evaluation_duration_ms` | INT NULL | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Append-only |

**Partitioning**: Monthly range on `created_at`. See Phase A migration for partition setup.

**Indexes**:
- `idx_policy_evaluations_incident_student` on `(tenant_id, incident_id, student_id, stage)`
- `idx_policy_evaluations_tenant_created` on `(tenant_id, created_at DESC)`

---

### `behaviour_policy_action_executions`

One row per action per evaluation. Append-only.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `evaluation_id` | UUID FK NOT NULL | -> `behaviour_policy_evaluations` |
| `action_type` | ENUM — same values as `behaviour_policy_rule_actions.action_type` | |
| `action_config` | JSONB NOT NULL | Config that was executed |
| `execution_status` | ENUM(`'success'`, `'failed'`, `'skipped_duplicate'`, `'skipped_condition'`) | |
| `created_entity_type` | VARCHAR(50) NULL | e.g. `'behaviour_sanctions'`, `'behaviour_tasks'` |
| `created_entity_id` | UUID NULL | ID of the record created by this action |
| `failure_reason` | TEXT NULL | Populated when `execution_status = 'failed'` |
| `executed_at` | TIMESTAMPTZ NOT NULL | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Append-only |

**Partitioning**: Monthly range on `created_at`. Same pattern as `behaviour_policy_evaluations`.

**Index**: `idx_policy_action_executions_evaluation_id` on `(evaluation_id)`

---

## Business Logic

### Condition Schema (`PolicyConditionSchema`)

Defined in `packages/shared/src/behaviour/policy-condition.schema.ts`. All fields are optional. Omitted fields are wildcards. All specified fields must match (AND logic).

```typescript
import { z } from 'zod';

export const PolicyConditionSchema = z.object({
  // Incident category
  category_ids: z.array(z.string().uuid()).optional(),

  // Incident polarity
  polarity: z.enum(['positive', 'negative', 'neutral']).optional(),

  // Severity range (1–10 scale, inclusive)
  severity_min: z.number().int().min(1).max(10).optional(),
  severity_max: z.number().int().min(1).max(10).optional(),

  // Student filters (evaluated against participant.student_snapshot)
  year_group_ids: z.array(z.string().uuid()).optional(),
  student_has_send: z.boolean().optional(),
  student_has_active_intervention: z.boolean().optional(),

  // Incident context
  context_types: z.array(z.enum([
    'class', 'break', 'before_school', 'after_school',
    'lunch', 'transport', 'extra_curricular', 'off_site', 'online', 'other',
  ])).optional(),

  // Participant role filter
  participant_role: z.enum([
    'subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator', 'mediator',
  ]).optional(),

  // Repeat behaviour detection
  // "This student has had at least repeat_count_min incidents matching repeat_category_ids
  //  within the last repeat_window_days calendar days (including this incident)"
  repeat_count_min: z.number().int().min(1).optional(),
  repeat_window_days: z.number().int().min(1).max(365).optional(),
  repeat_category_ids: z.array(z.string().uuid()).optional(),

  // Time-of-week filters
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  period_orders: z.array(z.number().int()).optional(),
});

export type PolicyCondition = z.infer<typeof PolicyConditionSchema>;
```

---

### Action Config Schemas

Defined in `packages/shared/src/behaviour/policy-action-config.schema.ts`.

```typescript
import { z } from 'zod';

export const AutoEscalateConfigSchema = z.object({
  target_category_id: z.string().uuid(),
  reason: z.string().optional(),
});

export const CreateSanctionConfigSchema = z.object({
  sanction_type: z.enum([
    'detention', 'suspension_internal', 'suspension_external',
    'expulsion', 'community_service', 'loss_of_privilege',
    'restorative_meeting', 'other',
  ]),
  days_offset: z.number().int().min(0).optional(), // scheduled_date = today + days_offset school days
  duration_minutes: z.number().int().optional(),
  notes: z.string().optional(),
});

export const RequireApprovalConfigSchema = z.object({
  approver_role: z.string().optional(), // e.g. 'deputy_principal'
  approver_user_id: z.string().uuid().optional(),
  reason: z.string().optional(),
});

export const RequireParentMeetingConfigSchema = z.object({
  due_within_school_days: z.number().int().min(1).default(5),
  assigned_to_role: z.string().optional(),
  notes: z.string().optional(),
});

export const RequireParentNotificationConfigSchema = z.object({
  channels: z.array(z.enum(['email', 'whatsapp', 'in_app'])).optional(),
  priority: z.enum(['immediate', 'digest']).default('immediate'),
});

export const CreateTaskConfigSchema = z.object({
  task_type: z.enum([
    'follow_up', 'intervention_review', 'parent_meeting',
    'parent_acknowledgement', 'approval_action', 'sanction_supervision',
    'return_check_in', 'safeguarding_action', 'document_requested',
    'appeal_review', 'break_glass_review', 'guardian_restriction_review', 'custom',
  ]),
  title: z.string(),
  assigned_to_role: z.string().optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  due_in_school_days: z.number().int().min(1).default(3),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

export const CreateInterventionConfigSchema = z.object({
  type: z.enum([
    'behaviour_plan', 'mentoring', 'counselling_referral', 'restorative',
    'academic_support', 'parent_engagement', 'external_agency', 'other',
  ]),
  title: z.string(),
  assigned_to_role: z.string().optional(),
});

export const NotifyRolesConfigSchema = z.object({
  roles: z.array(z.string()),
  message_template: z.string().optional(),
  priority: z.enum(['normal', 'urgent']).default('normal'),
});

export const NotifyUsersConfigSchema = z.object({
  user_ids: z.array(z.string().uuid()),
  message_template: z.string().optional(),
  priority: z.enum(['normal', 'urgent']).default('normal'),
});

export const FlagForReviewConfigSchema = z.object({
  reason: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

export const BlockWithoutApprovalConfigSchema = z.object({
  approver_role: z.string().optional(),
  block_reason: z.string(),
});
```

---

### Evaluated Input Schema

Frozen at evaluation time. Stored in `behaviour_policy_evaluations.evaluated_input`.

```typescript
export const EvaluatedInputSchema = z.object({
  // From incident
  category_id: z.string().uuid(),
  category_name: z.string(),
  polarity: z.enum(['positive', 'negative', 'neutral']),
  severity: z.number().int(),
  context_type: z.string(),
  occurred_at: z.string(), // ISO-8601
  weekday: z.number().int().nullable(),
  period_order: z.number().int().nullable(),

  // From participant.student_snapshot (frozen at incident creation)
  student_id: z.string().uuid(),
  participant_role: z.string(),
  year_group_id: z.string().uuid().nullable(),
  year_group_name: z.string().nullable(),
  has_send: z.boolean(),
  had_active_intervention: z.boolean(),

  // Computed at evaluation time
  repeat_count: z.number().int(), // incidents matching any repeat_category_ids in the window
  repeat_window_days_used: z.number().int().nullable(),
  repeat_category_ids_used: z.array(z.string().uuid()),
});
```

---

### 5-Stage Evaluation Pipeline

#### Stage Order

Stages always execute in this fixed order, regardless of how they are stored:

| Order | Stage | Default Match Strategy | Typical Purpose |
|-------|-------|----------------------|-----------------|
| 1 | `consequence` | `first_match` | Escalation, sanction creation — one consequence per student per incident |
| 2 | `approval` | `first_match` | Approval gating — one approval requirement per student per incident |
| 3 | `notification` | `all_matching` | Parent notification, role notification — multiple can fire |
| 4 | `support` | `all_matching` | Intervention creation, SENCO tasks, pastoral alerts — multiple can fire |
| 5 | `alerting` | `all_matching` | Flag for review, analytics flagging — multiple can fire |

The `match_strategy` field on an individual rule overrides the default for that rule. The `stop_processing_stage` flag on a matched rule halts evaluation of further rules in that stage, regardless of the stage's default match strategy.

#### Per-Student Evaluation

The pipeline is evaluated **per student participant** in the incident. If an incident has 3 student participants, the engine runs a complete 5-stage evaluation for each student independently (since conditions like `student_has_send`, `year_group_ids`, and `repeat_count_min` are student-specific).

For each student, the engine creates up to 5 `behaviour_policy_evaluations` rows (one per stage), and one `behaviour_policy_action_executions` row per action that fires.

#### Full Evaluation Algorithm

```typescript
// PolicyEvaluationEngine.evaluateForStudent(
//   incident: BehaviourIncident,
//   participant: BehaviourIncidentParticipant,
//   tx: PrismaTransactionClient,
// ): Promise<void>

const STAGE_ORDER = ['consequence', 'approval', 'notification', 'support', 'alerting'] as const;

for (const stage of STAGE_ORDER) {
  // 1. Load active rules for this stage, sorted by priority ascending
  const rules = await tx.behaviour_policy_rules.findMany({
    where: {
      tenant_id: incident.tenant_id,
      stage,
      is_active: true,
    },
    include: { behaviour_policy_rule_actions: { orderBy: { execution_order: 'asc' } } },
    orderBy: { priority: 'asc' },
  });

  const startMs = Date.now();
  const matchedRules: BehaviourPolicyRule[] = [];

  // 2. Evaluate each rule's conditions
  for (const rule of rules) {
    const conditions = PolicyConditionSchema.parse(rule.conditions);
    const input = await buildEvaluatedInput(incident, participant, conditions, tx);
    const matches = evaluateConditions(conditions, input);

    if (matches) {
      matchedRules.push(rule);

      // 3. Stop processing if rule says so, or if stage default is first_match
      //    and this rule's match_strategy is first_match
      if (rule.stop_processing_stage || rule.match_strategy === 'first_match') {
        break;
      }
    }
  }

  // 4. Record evaluation result in the ledger
  const evaluationResult = matchedRules.length > 0 ? 'matched' : 'no_match';
  const evaluation = await tx.behaviour_policy_evaluations.create({
    data: {
      tenant_id: incident.tenant_id,
      incident_id: incident.id,
      student_id: participant.student_id!,
      stage,
      rule_version_id: matchedRules[0]
        ? await getVersionId(matchedRules[0].id, matchedRules[0].current_version, tx)
        : null,
      evaluation_result: evaluationResult,
      evaluated_input: await buildEvaluatedInput(incident, participant, {}, tx),
      matched_conditions: matchedRules[0]?.conditions ?? null,
      unmatched_conditions: null,
      rules_evaluated_count: rules.length,
      evaluation_duration_ms: Date.now() - startMs,
    },
  });

  // 5. Execute actions for all matched rules
  for (const rule of matchedRules) {
    for (const action of rule.behaviour_policy_rule_actions) {
      await executeAction(action, incident, participant, evaluation.id, tx);
    }
  }
}

// 6. After all stages complete, link first consequence evaluation to the incident
await tx.behaviour_incidents.update({
  where: { id: incident.id },
  data: {
    policy_evaluation_id: firstConsequenceEvaluationId,
  },
});
```

#### Condition Matching Algorithm

```typescript
function evaluateConditions(
  conditions: PolicyCondition,
  input: EvaluatedInput,
): boolean {
  // All specified conditions must pass (AND logic).
  // Unspecified conditions are wildcards (always pass).

  if (conditions.category_ids?.length) {
    if (!conditions.category_ids.includes(input.category_id)) return false;
  }

  if (conditions.polarity !== undefined) {
    if (input.polarity !== conditions.polarity) return false;
  }

  if (conditions.severity_min !== undefined) {
    if (input.severity < conditions.severity_min) return false;
  }

  if (conditions.severity_max !== undefined) {
    if (input.severity > conditions.severity_max) return false;
  }

  if (conditions.year_group_ids?.length) {
    if (!input.year_group_id || !conditions.year_group_ids.includes(input.year_group_id)) {
      return false;
    }
  }

  if (conditions.student_has_send !== undefined) {
    if (input.has_send !== conditions.student_has_send) return false;
  }

  if (conditions.student_has_active_intervention !== undefined) {
    if (input.had_active_intervention !== conditions.student_has_active_intervention) return false;
  }

  if (conditions.context_types?.length) {
    if (!conditions.context_types.includes(input.context_type as any)) return false;
  }

  if (conditions.participant_role !== undefined) {
    if (input.participant_role !== conditions.participant_role) return false;
  }

  if (conditions.repeat_count_min !== undefined) {
    if (input.repeat_count < conditions.repeat_count_min) return false;
  }

  if (conditions.weekdays?.length) {
    if (input.weekday === null || !conditions.weekdays.includes(input.weekday)) return false;
  }

  if (conditions.period_orders?.length) {
    if (input.period_order === null || !conditions.period_orders.includes(input.period_order)) {
      return false;
    }
  }

  return true;
}
```

#### Repeat Count Computation

```typescript
async function computeRepeatCount(
  incident: BehaviourIncident,
  participant: BehaviourIncidentParticipant,
  conditions: PolicyCondition,
  tx: PrismaTransactionClient,
): Promise<number> {
  if (!conditions.repeat_count_min || !conditions.repeat_window_days) return 0;

  const windowStart = subDays(new Date(incident.occurred_at), conditions.repeat_window_days);
  const categoryFilter = conditions.repeat_category_ids?.length
    ? conditions.repeat_category_ids
    : undefined;

  const count = await tx.behaviour_incident_participants.count({
    where: {
      tenant_id: incident.tenant_id,
      student_id: participant.student_id,
      behaviour_incidents: {
        occurred_at: { gte: windowStart },
        status: { notIn: ['withdrawn', 'draft'] },
        ...(categoryFilter ? { category_id: { in: categoryFilter } } : {}),
      },
    },
  });

  return count;
}
```

---

### Action Execution with Dedup Guards

Each action executor is responsible for its own idempotency. Before creating any entity, the executor checks whether an equivalent entity already exists from a previous execution (preventing duplicate creation on BullMQ job retries).

```typescript
async function executeAction(
  action: BehaviourPolicyRuleAction,
  incident: BehaviourIncident,
  participant: BehaviourIncidentParticipant,
  evaluationId: string,
  tx: PrismaTransactionClient,
): Promise<void> {
  // Check for duplicate execution of this action on this evaluation
  const existing = await tx.behaviour_policy_action_executions.findFirst({
    where: {
      evaluation_id: evaluationId,
      action_type: action.action_type,
      execution_status: 'success',
    },
  });

  if (existing) {
    await tx.behaviour_policy_action_executions.create({
      data: {
        tenant_id: incident.tenant_id,
        evaluation_id: evaluationId,
        action_type: action.action_type,
        action_config: action.action_config,
        execution_status: 'skipped_duplicate',
        executed_at: new Date(),
      },
    });
    return;
  }

  try {
    const result = await dispatchAction(action, incident, participant, tx);
    await tx.behaviour_policy_action_executions.create({
      data: {
        tenant_id: incident.tenant_id,
        evaluation_id: evaluationId,
        action_type: action.action_type,
        action_config: action.action_config,
        execution_status: 'success',
        created_entity_type: result?.entityType ?? null,
        created_entity_id: result?.entityId ?? null,
        executed_at: new Date(),
      },
    });
  } catch (err) {
    await tx.behaviour_policy_action_executions.create({
      data: {
        tenant_id: incident.tenant_id,
        evaluation_id: evaluationId,
        action_type: action.action_type,
        action_config: action.action_config,
        execution_status: 'failed',
        failure_reason: err instanceof Error ? err.message : String(err),
        executed_at: new Date(),
      },
    });
    // Do not rethrow — a single failed action must not abort the entire pipeline.
    // Log to application logger and continue.
  }
}
```

#### Action Dispatch Table

| `action_type` | What the executor does |
|---------------|----------------------|
| `auto_escalate` | Finds the target category, creates a new incident linked to this one via `escalated_from_id`, transitions the original incident status to `escalated` |
| `create_sanction` | Creates a `behaviour_sanctions` record. Dedup guard: checks for an existing sanction of the same type on the same incident for the same student. |
| `require_approval` | Sets `incident.approval_status = 'pending'`, creates an `approval_requests` record via the existing approvals module. Dedup guard: checks `incident.approval_status != 'not_required'`. |
| `require_parent_meeting` | Creates a `behaviour_tasks` record with `task_type = 'parent_meeting'`. Dedup guard: checks for existing incomplete parent_meeting task for this incident + student. |
| `require_parent_notification` | Sets `incident.parent_notification_status = 'pending'` (if not already pending/sent). The separate `behaviour:parent-notification` job handles actual dispatch. |
| `create_task` | Creates a `behaviour_tasks` record. Dedup guard: checks for an existing task of the same type for this incident + student with `status NOT IN ('cancelled', 'completed')`. |
| `create_intervention` | Creates a `behaviour_interventions` record. Dedup guard: checks for an active intervention of the same type for this student created within the last 30 days. |
| `notify_roles` | Enqueues a `notifications:dispatch` job targeting all users with the specified roles in this tenant. |
| `notify_users` | Enqueues a `notifications:dispatch` job targeting the specified user IDs. |
| `flag_for_review` | Sets `incident.status = 'under_review'` if currently `active`. Records change in `behaviour_entity_history`. |
| `block_without_approval` | Sets `incident.approval_status = 'pending'`. Blocks incident from progressing until approval granted. Creates `approval_requests` record. |

---

### Versioning

Every rule edit triggers a version snapshot. This is enforced in the `PolicyRulesService.updateRule()` method:

```typescript
async function updateRule(
  ruleId: string,
  dto: UpdatePolicyRuleDto,
  userId: string,
  tenantId: string,
  tx: PrismaTransactionClient,
): Promise<BehaviourPolicyRule> {
  // 1. Load current rule
  const current = await tx.behaviour_policy_rules.findUniqueOrThrow({
    where: { id: ruleId, tenant_id: tenantId },
    include: { behaviour_policy_rule_actions: true },
  });

  // 2. Snapshot current version BEFORE applying changes
  await tx.behaviour_policy_rule_versions.create({
    data: {
      tenant_id: tenantId,
      rule_id: ruleId,
      version: current.current_version,
      name: current.name,
      conditions: current.conditions,
      actions: current.behaviour_policy_rule_actions.map(a => ({
        action_type: a.action_type,
        action_config: a.action_config,
        execution_order: a.execution_order,
      })),
      stage: current.stage,
      match_strategy: current.match_strategy,
      priority: current.priority,
      changed_by_id: userId,
      change_reason: dto.change_reason ?? null,
    },
  });

  // 3. Apply updates and increment version
  const updated = await tx.behaviour_policy_rules.update({
    where: { id: ruleId },
    data: {
      ...dto,
      current_version: { increment: 1 },
      updated_at: new Date(),
    },
  });

  // 4. Replace actions if provided
  if (dto.actions) {
    await tx.behaviour_policy_rule_actions.deleteMany({ where: { rule_id: ruleId } });
    await tx.behaviour_policy_rule_actions.createMany({
      data: dto.actions.map(a => ({
        tenant_id: tenantId,
        rule_id: ruleId,
        action_type: a.action_type,
        action_config: a.action_config,
        execution_order: a.execution_order ?? 0,
      })),
    });
  }

  return updated;
}
```

**Creating a new rule also snapshots version 1** immediately so the evaluation ledger always has a version to link to, even for rules that have never been edited.

---

### Historical Replay Engine

The replay engine re-evaluates a candidate rule against historical incidents **without executing any actions and without writing any evaluation ledger entries**. It returns a projected impact summary.

#### Request Shape

```typescript
// POST v1/behaviour/policies/replay
// Body validated with ReplayPolicyRuleSchema

export const ReplayPolicyRuleSchema = z.object({
  rule_id: z.string().uuid(),
  replay_period: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // YYYY-MM-DD
  }),
  dry_run: z.boolean().default(true),
});

export type ReplayPolicyRuleDto = z.infer<typeof ReplayPolicyRuleSchema>;
```

#### Response Shape

```json
{
  "rule_id": "3a9f2e1b-...",
  "rule_name": "3 verbal warnings in 30 days → written warning",
  "stage": "consequence",
  "replay_period": { "from": "2025-09-01", "to": "2025-12-20" },
  "incidents_evaluated": 847,
  "incidents_matched": 23,
  "students_affected": 18,
  "affected_year_groups": ["Year 9", "Year 10"],
  "actions_that_would_fire": {
    "auto_escalate": 8,
    "create_task": 23,
    "notify_roles": 23
  },
  "estimated_sanctions_created": {
    "detention": 0,
    "suspension_internal": 0,
    "suspension_external": 0
  },
  "estimated_approvals_created": 0,
  "sample_matches": [
    {
      "incident_id": "...",
      "incident_number": "BH-000234",
      "occurred_at": "2025-10-15T09:22:00Z",
      "student_id": "...",
      "student_name": "Student A",
      "year_group": "Year 9",
      "category_name": "Verbal Warning",
      "matched_conditions": { "repeat_count_min": 3, "repeat_window_days": 30 },
      "actions_that_would_fire": ["auto_escalate", "create_task"]
    }
  ]
}
```

#### Replay Algorithm

```typescript
async function replayRule(
  dto: ReplayPolicyRuleDto,
  tenantId: string,
  tx: PrismaTransactionClient,
): Promise<ReplayResult> {
  const rule = await tx.behaviour_policy_rules.findUniqueOrThrow({
    where: { id: dto.rule_id, tenant_id: tenantId },
    include: { behaviour_policy_rule_actions: true },
  });

  const conditions = PolicyConditionSchema.parse(rule.conditions);

  // Load all non-withdrawn incidents in the period
  const incidents = await tx.behaviour_incidents.findMany({
    where: {
      tenant_id: tenantId,
      occurred_at: {
        gte: new Date(dto.replay_period.from),
        lte: new Date(dto.replay_period.to + 'T23:59:59Z'),
      },
      status: { notIn: ['withdrawn', 'draft'] },
    },
    include: {
      behaviour_incident_participants: {
        where: { participant_type: 'student' },
      },
    },
  });

  const matchedIncidentIds = new Set<string>();
  const affectedStudentIds = new Set<string>();
  const affectedYearGroupNames = new Set<string>();
  const actionCounts: Record<string, number> = {};
  const sampleMatches: ReplaySampleMatch[] = [];

  for (const incident of incidents) {
    for (const participant of incident.behaviour_incident_participants) {
      if (!participant.student_id) continue;

      // Build evaluated input using HISTORICAL snapshots
      // (student_snapshot is frozen at incident creation — safe to use for historical replay)
      const input = buildEvaluatedInputFromSnapshot(incident, participant, conditions);
      const matches = evaluateConditions(conditions, input);

      if (matches) {
        matchedIncidentIds.add(incident.id);
        affectedStudentIds.add(participant.student_id);

        const snapshot = StudentSnapshotSchema.safeParse(participant.student_snapshot);
        if (snapshot.success) {
          if (snapshot.data.year_group_name) {
            affectedYearGroupNames.add(snapshot.data.year_group_name);
          }
        }

        for (const action of rule.behaviour_policy_rule_actions) {
          actionCounts[action.action_type] = (actionCounts[action.action_type] ?? 0) + 1;
        }

        if (sampleMatches.length < 10) {
          sampleMatches.push(buildSampleMatch(incident, participant, conditions, rule));
        }
      }
    }
  }

  return {
    rule_id: rule.id,
    rule_name: rule.name,
    stage: rule.stage,
    replay_period: dto.replay_period,
    incidents_evaluated: incidents.length,
    incidents_matched: matchedIncidentIds.size,
    students_affected: affectedStudentIds.size,
    affected_year_groups: Array.from(affectedYearGroupNames).sort(),
    actions_that_would_fire: actionCounts,
    estimated_sanctions_created: computeSanctionEstimates(actionCounts, rule),
    estimated_approvals_created: actionCounts['require_approval'] ?? 0,
    sample_matches: sampleMatches,
  };
}
```

**Key constraint**: The replay engine reads `participant.student_snapshot` (frozen at incident creation) for student facts, and `incident.context_snapshot` for incident facts. It never queries live student data. This ensures the replay reflects the historical state of students at the time incidents occurred.

---

### Admin Dry-Run (Hypothetical Test)

`POST v1/behaviour/admin/policy-dry-run` evaluates a hypothetical incident against all currently active rules. No data is written.

```typescript
// Dry-run request body
export const PolicyDryRunSchema = z.object({
  category_id: z.string().uuid(),
  polarity: z.enum(['positive', 'negative', 'neutral']),
  severity: z.number().int().min(1).max(10),
  context_type: z.enum(['class', 'break', 'before_school', 'after_school',
    'lunch', 'transport', 'extra_curricular', 'off_site', 'online', 'other']),
  student_year_group_id: z.string().uuid().optional(),
  student_has_send: z.boolean().default(false),
  student_has_active_intervention: z.boolean().default(false),
  participant_role: z.enum(['subject', 'witness', 'bystander', 'reporter',
    'victim', 'instigator', 'mediator']).default('subject'),
  repeat_count: z.number().int().min(0).default(0),
  weekday: z.number().int().min(0).max(6).optional(),
  period_order: z.number().int().optional(),
});
```

Response: same structure as per-stage evaluation — which rules matched, which stages fired, which actions would execute.

---

## API Endpoints

All policy-related endpoints live in `behaviour-config.controller.ts` (Phase A established this controller for categories and award types). The replay and dry-run endpoints are separate controllers.

### Policy Rules CRUD (within `behaviour-config.controller.ts`)

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| `GET` | `v1/behaviour/policies` | List all rules (filterable by `stage`, `is_active`) | `behaviour.admin` |
| `POST` | `v1/behaviour/policies` | Create rule (also snapshots version 1) | `behaviour.admin` |
| `GET` | `v1/behaviour/policies/:id` | Full rule detail with current actions | `behaviour.admin` |
| `PATCH` | `v1/behaviour/policies/:id` | Update rule (snapshots previous version first) | `behaviour.admin` |
| `DELETE` | `v1/behaviour/policies/:id` | Soft-delete (sets `is_active = false`; rules with evaluations cannot be hard-deleted) | `behaviour.admin` |
| `GET` | `v1/behaviour/policies/:id/versions` | Version history | `behaviour.admin` |
| `GET` | `v1/behaviour/policies/:id/versions/:version` | Full snapshot of a specific version | `behaviour.admin` |
| `PATCH` | `v1/behaviour/policies/:id/priority` | Reorder priority within stage | `behaviour.admin` |

### Policy Replay

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| `POST` | `v1/behaviour/policies/replay` | Historical replay against real past incidents | `behaviour.admin` |

Request body: `ReplayPolicyRuleSchema` (see Business Logic section).

Response: `ReplayResult` shape (see Business Logic section).

**Validation**: `replay_period.from` must be before `replay_period.to`. Maximum replay window: 365 days. Replay against more than 10,000 incidents is rejected with 400 — use a narrower date range.

### Admin Dry-Run

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| `POST` | `v1/behaviour/admin/policy-dry-run` | Evaluate hypothetical incident against all active rules | `behaviour.admin` |

Request body: `PolicyDryRunSchema` (see Business Logic section).

Response:
```json
{
  "hypothetical_input": { ... },
  "stage_results": [
    {
      "stage": "consequence",
      "rules_evaluated": 3,
      "matched_rules": [
        {
          "rule_id": "...",
          "rule_name": "...",
          "matched_conditions": { ... },
          "actions_that_would_fire": [
            { "action_type": "auto_escalate", "action_config": { ... } }
          ]
        }
      ]
    }
  ]
}
```

### Policy Evaluation Log

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| `GET` | `v1/behaviour/incidents/:id/policy-evaluation` | Full policy decision trace for an incident | `behaviour.manage` |

Response: all `behaviour_policy_evaluations` rows for this incident, each with their linked `behaviour_policy_action_executions` rows, plus the `behaviour_policy_rule_versions` snapshot that fired.

---

## Frontend Pages

### `/settings/behaviour-policies`

The sole Phase B frontend page. It is a full-featured policy management UI.

#### Layout

Full-width settings page with stage tabs across the top:

```
[Consequence] [Approval] [Notification] [Support] [Alerting]
```

#### Per-Stage View

Each stage tab shows:

1. **Stage description** — one-line explanation of what this stage does and its default match strategy
2. **Rule list** — ordered by `priority` ascending, drag-to-reorder. Each rule card shows:
   - Rule name + enabled/disabled toggle
   - Match strategy badge (`FIRST MATCH` / `ALL MATCHING`)
   - Stop-processing flag indicator
   - Condition summary (e.g., "Verbal Warning × 3 in 30 days")
   - Action summary (e.g., "Escalate → Written Warning, Create task")
   - Priority number
   - Edit / Delete / Version history buttons
3. **"Add rule" button** — opens the rule editor (see below)

#### Rule Editor (Drawer/Dialog)

Opens as a side drawer or modal. Fields:

- **Name** (text input, required)
- **Description** (textarea, optional)
- **Stage** (select — pre-populated from which tab opened the editor)
- **Priority** (number input, default 100)
- **Match strategy** (radio: First match / All matching)
- **Stop processing stage** (checkbox)
- **Enabled** (toggle)
- **Change reason** (textarea, shown only when editing an existing rule)

**Condition builder** (visual UI — no raw JSON):
- Each condition is a labelled field with the appropriate input type
- `category_ids`: multi-select from the tenant's active categories
- `polarity`: radio (positive / negative / neutral)
- `severity_min` / `severity_max`: number inputs with range slider
- `year_group_ids`: multi-select from the tenant's year groups
- `student_has_send`: checkbox
- `student_has_active_intervention`: checkbox
- `context_types`: multi-select checkboxes
- `participant_role`: select dropdown
- `repeat_count_min` + `repeat_window_days` + `repeat_category_ids`: grouped section — "Repeat behaviour: [N] or more times in [N] days, for categories: [multi-select]"
- `weekdays`: day-of-week picker (M/T/W/T/F/S/S)
- `period_orders`: multi-select

**Action builder** (visual UI):
- "+ Add action" button, renders typed form per action type
- Each action shows its type as a badge and its key config fields inline
- Actions can be reordered (drag) and removed

#### Priority Reordering

Drag-to-reorder within a stage's rule list. On drop, `PATCH v1/behaviour/policies/:id/priority` is called for all affected rules. Optimistic UI — revert on error.

#### Match Strategy Toggle

Per-rule inline toggle visible in the rule list. No need to open the editor. Calls `PATCH v1/behaviour/policies/:id` with just `{ match_strategy }`.

#### Stop-Processing Flag

Per-rule inline checkbox in the rule list.

#### Replay Panel

At the bottom of each stage tab (below the rule list):

```
[Test this stage against past data]
From: [date picker]   To: [date picker]
Select rule to test:  [dropdown — rules in this stage]

[Run Replay]
```

On run, calls `POST v1/behaviour/policies/replay`. While loading, show skeleton. On result, show:

```
Replay Result (consequence stage — "3 verbal warnings → written warning")
  Period: Sep 1 – Dec 20, 2025
  Incidents evaluated: 847
  Would have matched: 23  (2.7%)
  Students affected: 18
  Year groups: Year 9, Year 10

  Actions that would fire:
    auto_escalate: 8 times
    create_task: 23 times
    notify_roles: 23 times

  Sample matches:
  [Collapsible table — incident number, date, student (redacted to "Student A"), category, year group]
```

**Sample matches must not reveal student names** in the replay results — show year group and incident number only. The actual student IDs are returned but the frontend displays them as "Student A", "Student B" etc. in order.

#### Test Mode (Dry-Run)

Separate panel accessible via "Test a hypothetical incident" button in the top-right of the page:

```
[Test Mode]
Category: [select]
Polarity: [radio]
Severity: [slider 1-10]
Context: [select]
Student year group: [select]
Student has SEND: [checkbox]
Has active intervention: [checkbox]
Participant role: [select]
Past similar incidents: [number] in last [number] days

[Run Test]
```

On run, calls `POST v1/behaviour/admin/policy-dry-run`. Show which stages would fire, which rules would match, which actions would execute.

#### Import / Export JSON

Toolbar at top-right of the page:

- **Export** button: Downloads all active policy rules as a structured JSON array (sanitised — no tenant_id, no rule IDs)
- **Import** button: Opens a file picker + preview modal. On confirm, calls a bulk-create endpoint that validates each rule via Zod before inserting. Import is additive (does not replace existing rules).

```json
[
  {
    "name": "3 verbal warnings in 30 days → written warning",
    "stage": "consequence",
    "priority": 100,
    "match_strategy": "first_match",
    "stop_processing_stage": false,
    "conditions": {
      "repeat_count_min": 3,
      "repeat_window_days": 30,
      "repeat_category_ids": ["__VERBAL_WARNING__"]
    },
    "actions": [
      {
        "action_type": "auto_escalate",
        "action_config": { "target_category_id": "__WRITTEN_WARNING__" },
        "execution_order": 0
      }
    ]
  }
]
```

**Category name tokens** in exported JSON (e.g. `__VERBAL_WARNING__`) are resolved to real UUIDs on import by matching against the importing tenant's category names. This allows policy sharing between tenants (e.g. ETB sharing a standard policy set).

---

## Worker Jobs

### `behaviour:evaluate-policy`

| Property | Value |
|----------|-------|
| **Queue** | `behaviour` |
| **Job name** | `behaviour:evaluate-policy` |
| **Trigger** | On incident creation (`POST v1/behaviour/incidents`, `POST v1/behaviour/incidents/quick`, `POST v1/behaviour/incidents/bulk-positive`) AND on participant addition (`POST v1/behaviour/incidents/:id/participants`) |
| **Payload** | `{ tenant_id: string; incident_id: string; trigger: 'incident_created' \| 'participant_added'; triggered_at: string }` |
| **Retries** | 3 with exponential backoff (1s, 4s, 16s) |
| **Idempotency** | Before beginning evaluation, the processor checks whether all 5 stages have already been evaluated for each student in this incident. Stages already present in `behaviour_policy_evaluations` are skipped. |
| **Timeout** | 30s |

```typescript
// apps/worker/src/jobs/behaviour/evaluate-policy.job.ts

export class EvaluatePolicyJob extends TenantAwareJob {
  readonly name = 'behaviour:evaluate-policy';

  async process(job: Job<EvaluatePolicyPayload>): Promise<void> {
    const { tenant_id, incident_id } = job.data;

    await this.prisma.$transaction(async (tx) => {
      const incident = await tx.behaviour_incidents.findUniqueOrThrow({
        where: { id: incident_id, tenant_id },
        include: {
          behaviour_incident_participants: {
            where: { participant_type: 'student' },
          },
        },
      });

      // Skip withdrawn or draft incidents
      if (['withdrawn', 'draft'].includes(incident.status)) return;

      for (const participant of incident.behaviour_incident_participants) {
        if (!participant.student_id) continue;

        // Idempotency: skip stages already evaluated for this student
        const existingEvaluations = await tx.behaviour_policy_evaluations.findMany({
          where: { incident_id, student_id: participant.student_id, tenant_id },
          select: { stage: true },
        });
        const evaluatedStages = new Set(existingEvaluations.map(e => e.stage));

        await policyEvaluationEngine.evaluateForStudent(
          incident,
          participant,
          evaluatedStages,
          tx,
        );
      }
    });
  }
}
```

**Important**: The job processor wraps the entire evaluation in a single `$transaction`. The RLS middleware sets `SET LOCAL app.current_tenant_id` at the start of this transaction. Never call `evaluateForStudent` outside a transaction.

**Enqueueing**:

```typescript
// In BehaviourService.createIncident() — after successful creation:
await this.bullMQ.add('behaviour:evaluate-policy', {
  tenant_id: incident.tenant_id,
  incident_id: incident.id,
  trigger: 'incident_created',
  triggered_at: new Date().toISOString(),
});

// In BehaviourService.addParticipant() — after successful participant creation:
await this.bullMQ.add('behaviour:evaluate-policy', {
  tenant_id: incident.tenant_id,
  incident_id: incident.id,
  trigger: 'participant_added',
  triggered_at: new Date().toISOString(),
});
```

---

## Seed Data (5 Default Policy Rules)

These 5 rules are seeded for every new tenant as part of the tenant provisioning flow. They reference the seeded category names from Phase A (Verbal Warning, Written Warning, Detention, Suspension Internal, Expulsion).

At seed time, the provisioning service resolves category names to UUIDs within the transaction.

---

### Rule 1: "3 verbal warnings in 30 days → written warning"

```typescript
{
  name: '3 verbal warnings in 30 days → written warning',
  description: 'Automatically escalates to a written warning when a student receives 3 or more verbal warnings within a 30-day rolling window.',
  stage: 'consequence',
  priority: 100,
  match_strategy: 'first_match',
  stop_processing_stage: false,
  is_active: true,
  conditions: {
    polarity: 'negative',
    repeat_count_min: 3,
    repeat_window_days: 30,
    repeat_category_ids: ['<verbal_warning_category_id>'],
  },
  actions: [
    {
      action_type: 'auto_escalate',
      action_config: {
        target_category_id: '<written_warning_category_id>',
        reason: 'Auto-escalated: 3 verbal warnings in 30 days',
      },
      execution_order: 0,
    },
    {
      action_type: 'notify_roles',
      action_config: {
        roles: ['year_head'],
        message_template: 'Student has received a third verbal warning in 30 days and has been escalated to a written warning.',
        priority: 'normal',
      },
      execution_order: 1,
    },
  ],
}
```

---

### Rule 2: "Suspension for SEND students requires deputy approval"

```typescript
{
  name: 'Suspension for SEND students requires deputy approval',
  description: 'Any suspension-level incident involving a student with SEND requires deputy principal approval before proceeding.',
  stage: 'approval',
  priority: 100,
  match_strategy: 'first_match',
  stop_processing_stage: false,
  is_active: true,
  conditions: {
    severity_min: 7,
    student_has_send: true,
    polarity: 'negative',
  },
  actions: [
    {
      action_type: 'require_approval',
      action_config: {
        approver_role: 'deputy_principal',
        reason: 'SEND student suspension requires deputy approval',
      },
      execution_order: 0,
    },
    {
      action_type: 'create_task',
      action_config: {
        task_type: 'follow_up',
        title: 'SENCO review required — SEND student suspension pending approval',
        assigned_to_role: 'senco',
        due_in_school_days: 2,
        priority: 'high',
      },
      execution_order: 1,
    },
  ],
}
```

---

### Rule 3: "Expulsion requires principal approval"

```typescript
{
  name: 'Expulsion requires principal approval',
  description: 'All expulsion-level incidents must be approved by the principal before any consequence is applied.',
  stage: 'approval',
  priority: 50,
  match_strategy: 'first_match',
  stop_processing_stage: true,
  is_active: true,
  conditions: {
    category_ids: ['<expulsion_category_id>'],
  },
  actions: [
    {
      action_type: 'require_approval',
      action_config: {
        approver_role: 'principal',
        reason: 'Expulsion requires principal approval',
      },
      execution_order: 0,
    },
  ],
}
```

---

### Rule 4: "Negative incident above severity threshold → notify parent"

```typescript
{
  name: 'Negative incident above severity threshold → notify parent',
  description: 'Sends a parent notification for all negative incidents with severity 3 or above.',
  stage: 'notification',
  priority: 100,
  match_strategy: 'all_matching',
  stop_processing_stage: false,
  is_active: true,
  conditions: {
    polarity: 'negative',
    severity_min: 3,
  },
  actions: [
    {
      action_type: 'require_parent_notification',
      action_config: {
        priority: 'immediate',
      },
      execution_order: 0,
    },
  ],
}
```

---

### Rule 5: "High-severity negative incident → flag for management review"

```typescript
{
  name: 'High-severity negative incident → flag for management review',
  description: 'Flags any high-severity negative incident for management review and notifies the year head.',
  stage: 'alerting',
  priority: 100,
  match_strategy: 'all_matching',
  stop_processing_stage: false,
  is_active: true,
  conditions: {
    polarity: 'negative',
    severity_min: 7,
  },
  actions: [
    {
      action_type: 'flag_for_review',
      action_config: {
        reason: 'High-severity incident flagged for management review',
        priority: 'high',
      },
      execution_order: 0,
    },
    {
      action_type: 'notify_roles',
      action_config: {
        roles: ['year_head', 'deputy_principal'],
        message_template: 'A high-severity incident has been logged and requires review.',
        priority: 'urgent',
      },
      execution_order: 1,
    },
  ],
}
```

---

## Approvals Module Integration

Phase B introduces the first use of the existing approvals module from behaviour policies. The `require_approval` and `block_without_approval` action executors call `ApprovalsService.createRequest()`.

**Pre-requisite**: Import `ApprovalsModule` into `BehaviourModule`.

```typescript
// When require_approval or block_without_approval fires:
const approvalRequest = await approvalsService.createRequest({
  tenant_id: incident.tenant_id,
  entity_type: 'behaviour_incident',
  entity_id: incident.id,
  approver_role: config.approver_role,
  approver_user_id: config.approver_user_id ?? null,
  reason: config.reason ?? 'Approval required by policy',
  requested_by_id: incident.reported_by_id,
});

// Update the incident's approval fields
await tx.behaviour_incidents.update({
  where: { id: incident.id },
  data: {
    approval_status: 'pending',
    approval_request_id: approvalRequest.id,
  },
});
```

When the approval is granted or rejected (via the approvals module's own flow), the approvals module emits an event. The behaviour module listens and updates `incident.approval_status` accordingly:
- Approved: `approval_status = 'approved'`
- Rejected: `approval_status = 'rejected'`, status reverts to `'active'`

---

## Acceptance Criteria

### Policy Rules CRUD

- [ ] Create a rule with conditions and actions — rule saved, version 1 snapshot created in `behaviour_policy_rule_versions`
- [ ] Edit a rule — previous state snapshotted as version N, rule updated to version N+1
- [ ] Delete (deactivate) a rule — `is_active = false`, rule no longer evaluated
- [ ] List rules filtered by stage — returns only rules for that stage, ordered by priority ascending
- [ ] Fetch version history — all versions returned in descending version order

### Policy Evaluation (Worker Job)

- [ ] Create incident → `behaviour:evaluate-policy` job enqueued within 100ms
- [ ] Job completes → 5 `behaviour_policy_evaluations` rows created (one per stage per student participant)
- [ ] For each matched rule → `behaviour_policy_action_executions` row(s) created
- [ ] For each unmatched stage → evaluation row created with `evaluation_result = 'no_match'`
- [ ] `behaviour_incidents.policy_evaluation_id` set to the consequence stage evaluation ID
- [ ] Job retry → stages already evaluated are skipped (idempotency)
- [ ] Withdrawn incident → job completes immediately with no evaluations created

### Condition Matching

- [ ] `category_ids` condition: matches only specified categories, rejects others
- [ ] `severity_min` / `severity_max`: inclusive boundary checks
- [ ] `student_has_send`: correctly reads from `participant.student_snapshot.has_send`
- [ ] `repeat_count_min` + `repeat_window_days`: counts only non-withdrawn incidents in the rolling window
- [ ] `context_types`: wildcard when omitted; filters correctly when set
- [ ] All conditions specified simultaneously: all must match (AND)
- [ ] No conditions specified: matches every incident

### Stage Execution

- [ ] `first_match` strategy: only the highest-priority matching rule fires; subsequent rules skipped
- [ ] `all_matching` strategy: all matching rules fire regardless of order
- [ ] `stop_processing_stage = true`: no further rules in that stage are evaluated after a match, even if strategy is `all_matching`
- [ ] Stage order is always `consequence → approval → notification → support → alerting`

### Action Execution

- [ ] `auto_escalate`: new incident created, original transitions to `escalated`, escalated_from_id linked
- [ ] `require_approval`: `approval_requests` record created, `incident.approval_status = 'pending'`
- [ ] `create_task`: `behaviour_tasks` record created with correct type, assignee, due date
- [ ] `require_parent_notification`: `incident.parent_notification_status = 'pending'`
- [ ] `flag_for_review`: `incident.status = 'under_review'`
- [ ] Dedup guard: second job execution for same incident produces `skipped_duplicate` execution records, no duplicate entities

### Historical Replay

- [ ] Replay returns correct `incidents_evaluated` count for the date range
- [ ] Replay returns correct `incidents_matched` count (manually verified with known test data)
- [ ] Replay uses `student_snapshot` for student facts (not live student data)
- [ ] Replay with `dry_run = true` writes zero rows to any table
- [ ] Replay window > 10,000 incidents returns 400 error

### Admin Dry-Run

- [ ] Dry-run returns all 5 stage results
- [ ] Dry-run correctly identifies which rules match the hypothetical input
- [ ] Dry-run writes zero rows to any table

### Versioning Traceability

- [ ] `behaviour_policy_evaluations.rule_version_id` links to the exact version snapshot that was active when the evaluation ran
- [ ] After editing a rule, new evaluations reference the new version; old evaluations still reference the old version
- [ ] Version history endpoint returns all previous snapshots with `changed_by_id` and `change_reason`

### Frontend

- [ ] Stage tabs render correct rules for each stage
- [ ] Drag-to-reorder updates `priority` values and persists on drop
- [ ] Condition builder renders all condition types with appropriate input controls
- [ ] Action builder renders type-specific config form per action type
- [ ] Replay panel executes and renders results inline
- [ ] Test mode (dry-run) panel executes and renders per-stage results
- [ ] Import JSON with category name tokens resolves to correct UUIDs for the importing tenant
- [ ] Export JSON sanitises tenant_id and replaces UUIDs with category name tokens

---

## Test Requirements

### Unit Tests (`policy-evaluation-engine.spec.ts`)

```typescript
describe('PolicyEvaluationEngine', () => {
  describe('evaluateConditions', () => {
    it('should match when all conditions pass', () => {});
    it('should not match when any condition fails', () => {});
    it('should match when no conditions are specified (wildcard)', () => {});
    it('should correctly evaluate severity_min and severity_max boundaries', () => {});
    it('should correctly evaluate repeat_count_min with a window', () => {});
    it('should read student_has_send from student_snapshot, not live student data', () => {});
    it('should return false for year_group_ids when student has no year group', () => {});
    it('edge: severity_min = 1 should match all severities >= 1', () => {});
    it('edge: repeat_window_days = 365 should include the full year', () => {});
  });

  describe('stage execution order', () => {
    it('should always evaluate consequence before approval', () => {});
    it('should always evaluate approval before notification', () => {});
    it('should stop_processing_stage when flag is true and rule matched', () => {});
    it('first_match strategy should skip subsequent rules after first match', () => {});
    it('all_matching strategy should evaluate all rules in stage', () => {});
  });

  describe('action execution', () => {
    it('should create evaluation row with matched conditions when rule fires', () => {});
    it('should create evaluation row with evaluation_result=no_match when no rule fires', () => {});
    it('should record skipped_duplicate when same action already succeeded in this evaluation', () => {});
    it('should not abort pipeline when a single action fails', () => {});
    it('should link incident.policy_evaluation_id to consequence stage evaluation', () => {});
  });

  describe('versioning', () => {
    it('should snapshot previous version before applying update', () => {});
    it('should increment current_version on every update', () => {});
    it('should link evaluation to rule_version_id, not rule_id', () => {});
    it('evaluation for old incident should still reference old version after rule edit', () => {});
  });

  describe('per-student isolation', () => {
    it('should create separate evaluations for each student participant', () => {});
    it('should use each student snapshot independently', () => {});
    it('repeat_count should be calculated per student, not per incident', () => {});
  });
});
```

### Integration Tests (`evaluate-policy.job.spec.ts`)

```typescript
describe('EvaluatePolicyJob', () => {
  it('should enqueue job on incident creation', () => {});
  it('should enqueue job on participant addition', () => {});
  it('should skip withdrawn incidents', () => {});
  it('should skip draft incidents', () => {});
  it('should be idempotent — retrying does not duplicate evaluations', () => {});
  it('should complete all 5 stages for each student participant', () => {});
  it('should set incident.policy_evaluation_id after evaluation', () => {});
});
```

### Integration Tests (`policy-replay.spec.ts`)

```typescript
describe('PolicyReplayEngine', () => {
  it('should return correct incident count for the replay period', () => {});
  it('should return correct match count using historical snapshots', () => {});
  it('should not modify any database rows when dry_run = true', () => {});
  it('should reject replay windows exceeding 10,000 incidents', () => {});
  it('should use student_snapshot for student facts, not live student record', () => {});
});
```

### RLS Tests

```typescript
describe('Policy Rules RLS', () => {
  it('tenant A cannot read tenant B policy rules', () => {});
  it('tenant A cannot read tenant B policy evaluations', () => {});
  it('tenant A cannot read tenant B policy action executions', () => {});
  it('tenant A cannot read tenant B policy rule versions', () => {});
});
```

### Permission Tests

```typescript
describe('Policy Endpoint Permissions', () => {
  it('should return 403 for GET /policies without behaviour.admin', () => {});
  it('should return 403 for POST /policies without behaviour.admin', () => {});
  it('should return 403 for POST /policies/replay without behaviour.admin', () => {});
  it('should return 403 for POST /admin/policy-dry-run without behaviour.admin', () => {});
  it('behaviour.manage user can GET /incidents/:id/policy-evaluation', () => {});
  it('behaviour.view user cannot GET /incidents/:id/policy-evaluation', () => {});
});
```

---

## Files to Create or Modify

### New Files

```
apps/api/src/modules/behaviour/
├── policy/
│   ├── policy-rules.service.ts          # CRUD + versioning
│   ├── policy-evaluation-engine.ts      # Condition matching, stage pipeline
│   ├── policy-replay.service.ts         # Historical replay + dry-run
│   ├── policy-rules.service.spec.ts
│   ├── policy-evaluation-engine.spec.ts
│   └── policy-replay.service.spec.ts

apps/worker/src/jobs/behaviour/
└── evaluate-policy.job.ts               # BullMQ processor

packages/shared/src/behaviour/
├── policy-condition.schema.ts           # PolicyConditionSchema
├── policy-action-config.schema.ts       # All action config schemas
├── policy-replay.schema.ts              # ReplayPolicyRuleSchema
└── policy-dry-run.schema.ts             # PolicyDryRunSchema

apps/web/src/app/(school)/settings/behaviour-policies/
├── page.tsx                             # Server component shell
├── BehaviourPoliciesPageClient.tsx      # Stage tabs, rule list
├── RuleEditorDrawer.tsx                 # Rule creation/editing
├── ConditionBuilder.tsx                 # Visual condition editor
├── ActionBuilder.tsx                    # Visual action editor
├── ReplayPanel.tsx                      # Replay execution + results
├── DryRunPanel.tsx                      # Hypothetical test mode
└── PolicyImportExportButtons.tsx        # Import/export JSON
```

### Modified Files

```
apps/api/src/modules/behaviour/behaviour-config.controller.ts
  → Add policy rules CRUD endpoints

apps/api/src/modules/behaviour/behaviour-admin.controller.ts
  → Add POST /admin/policy-dry-run endpoint

apps/api/src/modules/behaviour/behaviour.service.ts
  → Enqueue behaviour:evaluate-policy job on createIncident() and addParticipant()

apps/api/src/modules/behaviour/behaviour.module.ts
  → Register PolicyRulesService, PolicyEvaluationEngine, PolicyReplayService
  → Import ApprovalsModule

packages/prisma/src/seed/behaviour-seed.ts
  → Add 5 default policy rules with version 1 snapshots
```

---

## Architecture Notes

- **Do not add a cross-module dependency** from Policy to Attendance or Gradebook. The policy engine reads only from the incident + participant snapshots (frozen at creation), not live cross-module data. This is intentional — it keeps the evaluation engine fast and deterministic.

- **The evaluation job must complete within 30 seconds** for a typical incident (2–3 student participants, 5 stages, ~10 rules per stage). If a tenant has more than 50 rules per stage, add a warn log; this is unusual and may indicate rule hygiene issues.

- **Replay must never trigger side effects**. Double-check that the replay code path uses a separate code branch from the live evaluation path, and has no possibility of enqueueing downstream jobs (parent notifications, approvals, etc.).

- **Update `architecture/module-blast-radius.md`** after implementing: BehaviourModule now imports ApprovalsModule. The blast radius for ApprovalsModule changes increases.

- **Update `architecture/event-job-catalog.md`** after implementing: Add `behaviour:evaluate-policy` job entry with its trigger conditions, payload shape, and downstream effects.
