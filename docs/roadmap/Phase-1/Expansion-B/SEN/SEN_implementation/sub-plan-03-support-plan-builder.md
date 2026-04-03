# SEN Sub-Plan 03 — IEP / Student Support Plan Builder

## Overview

The core of the SEN module — goal-based support plans (IEPs) with SMART goal tracking, strategies, and progress recording. Includes plan cloning for new terms, status state machine, and goal lifecycle.

**Depends on**: Sub-plan 02 (SEN profile CRUD must exist).

---

## Proposed Changes

### Backend Files

#### [NEW] Additional files in `apps/api/src/modules/sen/`

```
├── dto/
│   ├── create-support-plan.dto.ts
│   ├── update-support-plan.dto.ts
│   ├── create-sen-goal.dto.ts
│   ├── update-sen-goal.dto.ts
│   ├── record-goal-progress.dto.ts
│   ├── create-goal-strategy.dto.ts
│   └── update-goal-strategy.dto.ts
├── sen-support-plan.controller.ts
├── sen-support-plan.controller.spec.ts
├── sen-support-plan.service.ts
├── sen-support-plan.service.spec.ts
├── sen-goal.controller.ts
├── sen-goal.controller.spec.ts
├── sen-goal.service.ts
└── sen-goal.service.spec.ts
```

---

### Support Plan Service

#### [NEW] `sen-support-plan.service.ts`

| Method                                              | Description                                                                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create(tenantId, profileId, dto, userId)`          | Create plan. Generates plan number via SequenceService (`sen_support_plan` type, prefix from tenant settings `sen.plan_number_prefix`). Sets `created_by_user_id`.    |
| `findAllByProfile(tenantId, profileId, query)`      | List plans for a profile, sorted by version/date.                                                                                                                     |
| `findOne(tenantId, id)`                             | Plan detail with all goals, strategies, and progress entries.                                                                                                         |
| `update(tenantId, id, dto)`                         | Update plan metadata (review dates, notes, parent_input, student_voice, staff_notes).                                                                                 |
| `transitionStatus(tenantId, id, newStatus, userId)` | State machine transition with validation via shared `SUPPORT_PLAN_TRANSITIONS`. On `active → under_review`, sets `review_date`.                                       |
| `clone(tenantId, planId, dto, userId)`              | Clone a plan as new draft for a new term/year. Copies goals and strategies. Sets `parent_version_id` to source plan. Increments `version`. Generates new plan number. |

**Plan number generation**: Uses `SequenceService.next(tenantId, 'sen_support_plan')` to produce `{prefix}-{YYYYMM}-{NNNNNN}`. The prefix defaults to `SSP` but is configurable per tenant via `tenantSettings.sen.plan_number_prefix`.

**Clone behavior**:

1. Copies all goals to the new plan (reset status to `not_started`, clear `current_level`)
2. Copies all active strategies for each goal
3. Does NOT copy progress records (they belong to the original plan)
4. Links via `parent_version_id` for version chain tracking

---

### Support Plan State Machine

```
draft        → [active]
active       → [under_review, closed]
under_review → [active, closed]
closed       → [archived]
archived     (terminal)
```

**Side effects**:

- `draft → active`: Sets `next_review_date` based on tenant setting `sen.default_review_cycle_weeks`
- `active → under_review`: Records review initiation, sets `review_date = now()`
- `under_review → active`: Clears review state, sets new `next_review_date`
- `under_review → closed`: Records final review notes
- `closed → archived`: No side effects, cleanup only

---

### Goal Service

#### [NEW] `sen-goal.service.ts`

| Method                                          | Description                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `create(tenantId, planId, dto)`                 | Create goal. Validates plan is `draft` or `active`. Auto-sets `display_order`. |
| `findAllByPlan(tenantId, planId)`               | List goals for a plan, ordered by `display_order`.                             |
| `update(tenantId, id, dto)`                     | Update goal fields.                                                            |
| `transitionStatus(tenantId, id, newStatus)`     | State machine transition via shared `GOAL_STATUS_TRANSITIONS`.                 |
| `recordProgress(tenantId, goalId, dto, userId)` | Append-only progress entry. Optionally updates `current_level` on the goal.    |
| `findProgress(tenantId, goalId, query)`         | List progress entries for a goal, newest first. Paginated.                     |
| `createStrategy(tenantId, goalId, dto)`         | Add strategy to a goal.                                                        |
| `findStrategies(tenantId, goalId)`              | List strategies for a goal.                                                    |
| `updateStrategy(tenantId, id, dto)`             | Update a strategy.                                                             |
| `deleteStrategy(tenantId, id)`                  | Soft delete (set `is_active = false`) a strategy.                              |

**Goal creation guard**: Goals can only be added to plans in `draft` or `active` status. Attempting to add a goal to an `under_review`, `closed`, or `archived` plan returns `400 BAD_REQUEST`.

---

### Goal Status State Machine

```
not_started        → [in_progress]
in_progress        → [partially_achieved, achieved, discontinued]
partially_achieved → [in_progress, achieved, discontinued]
achieved           (terminal)
discontinued       (terminal)
```

**Side effects**:

- `not_started → in_progress`: No side effects
- `in_progress → partially_achieved`: Records partial achievement note
- `* → achieved`: Records achievement with evidence/notes
- `* → discontinued`: Records reason for discontinuation

---

### Support Plan Controller

#### [NEW] `sen-support-plan.controller.ts`

| Method | Route                              | Description                                  | Permission   |
| ------ | ---------------------------------- | -------------------------------------------- | ------------ |
| POST   | `v1/sen/profiles/:profileId/plans` | Create a new support plan                    | `sen.manage` |
| GET    | `v1/sen/profiles/:profileId/plans` | List plans for a student profile             | `sen.view`   |
| GET    | `v1/sen/plans/:id`                 | Plan detail with goals, strategies, progress | `sen.view`   |
| PATCH  | `v1/sen/plans/:id`                 | Update plan metadata                         | `sen.manage` |
| PATCH  | `v1/sen/plans/:id/status`          | Transition plan status (state machine)       | `sen.manage` |
| POST   | `v1/sen/plans/:id/clone`           | Clone a plan as new draft                    | `sen.manage` |

---

### Goal Controller

#### [NEW] `sen-goal.controller.ts`

| Method | Route                         | Description                     | Permission   |
| ------ | ----------------------------- | ------------------------------- | ------------ |
| POST   | `v1/sen/plans/:planId/goals`  | Create a SMART goal             | `sen.manage` |
| GET    | `v1/sen/plans/:planId/goals`  | List goals for a plan           | `sen.view`   |
| PATCH  | `v1/sen/goals/:id`            | Update goal                     | `sen.manage` |
| PATCH  | `v1/sen/goals/:id/status`     | Transition goal status          | `sen.manage` |
| POST   | `v1/sen/goals/:id/progress`   | Record progress against a goal  | `sen.manage` |
| GET    | `v1/sen/goals/:id/progress`   | List progress entries           | `sen.view`   |
| POST   | `v1/sen/goals/:id/strategies` | Add strategy to a goal          | `sen.manage` |
| GET    | `v1/sen/goals/:id/strategies` | List strategies for a goal      | `sen.view`   |
| PATCH  | `v1/sen/strategies/:id`       | Update a strategy               | `sen.manage` |
| DELETE | `v1/sen/strategies/:id`       | Remove a strategy (soft delete) | `sen.manage` |

---

### Module Update

#### [MODIFY] `sen.module.ts`

Add `SenSupportPlanService`, `SenGoalService`, `SenSupportPlanController`, `SenGoalController`.

---

## Tests

#### `sen-support-plan.service.spec.ts`

- Create plan — success, plan number generation, profile not found
- `findAllByProfile` — returns plans for profile, empty list
- `findOne` — success with nested goals/strategies/progress, not found
- Status transitions — all valid transitions, invalid transition rejected, side effects applied
- Clone — copies goals + strategies, resets statuses, generates new number, links parent version

#### `sen-goal.service.spec.ts`

- Create goal — success, plan status guard (reject on closed/archived plan)
- Update goal — success, not found
- Status transitions — all valid, invalid rejected
- Record progress — append-only, optionally updates `current_level`
- Strategy CRUD — create, list, update, soft delete

---

## Verification

```bash
npx jest --config apps/api/jest.config.ts --testPathPattern="modules/sen" --verbose
npx turbo test
npx turbo type-check && npx turbo lint
```
