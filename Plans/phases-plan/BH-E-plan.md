# Phase E: Recognition + Interventions — Implementation Plan

## Section 1 — Overview

Phase E delivers the **positive recognition system** (points, awards, house teams, recognition wall) and the **intervention/restriction system** (intervention plans with reviews, guardian visibility restrictions). This is one of the three phases unlocked by Phase A.

**What this phase delivers:**
1. Points system as a computed-not-stored aggregate with Redis caching
2. Configurable award types with full repeatability semantics and auto-award worker
3. House teams and house point competitions
4. Recognition wall with consent + approval publication gates
5. Intervention plans with SEND awareness, goal/strategy tracking, reviews with auto-populated stats
6. Guardian visibility restrictions with effective dates, legal basis, review reminders, auto-expiry

**Dependencies on Phase A:**
- Prisma schema with all 32+ behaviour tables (all Phase E tables already exist)
- `BehaviourHistoryService` for audit trail (`apps/api/src/modules/behaviour/behaviour-history.service.ts`)
- `BehaviourScopeService` for scope enforcement (`apps/api/src/modules/behaviour/behaviour-scope.service.ts`)
- `BehaviourTasksService` for task creation on intervention events
- `BehaviourService` for incident creation integration (enqueue check-awards)
- `SequenceService` for intervention numbers (`apps/api/src/modules/tenants/sequence.service.ts`)
- Shared enums in `packages/shared/src/behaviour/enums.ts`
- Settings schema in `packages/shared/src/behaviour/schemas/settings.schema.ts`
- `RedisService` at `apps/api/src/modules/redis/redis.service.ts`
- `TenantAwareJob` base class at `apps/worker/src/base/tenant-aware-job.ts`
- `QUEUE_NAMES.BEHAVIOUR` at `apps/worker/src/base/queue.constants.ts`

**Key Prisma enum mappings (must use Prisma names, not DB names):**
- `InterventionStatus.active_intervention` -> DB `"active"`
- `InterventionStatus.completed_intervention` -> DB `"completed"`
- `InterventionType.other_intervention` -> DB `"other"`
- `RestrictionStatus.active_restriction` -> DB `"active"`
- `RestrictionStatus.superseded_restriction` -> DB `"superseded"`
- `ParentConsentStatus.pending_consent` -> DB `"pending"`
- `BehaviourAwardType.repeat_mode` is `String @db.VarChar(30)` (not an enum)

---

## Section 2 — Database Changes

**No new tables or migrations.** All tables were created in Phase A's migration. Phase E only implements the business logic operating on them.

**Tables operated on by Phase E (already exist):**

| Table | Key columns for Phase E |
|-------|------------------------|
| `behaviour_recognition_awards` | student_id, award_type_id, points_at_award, triggered_by_incident_id, superseded_by_id |
| `behaviour_award_types` | points_threshold, repeat_mode (VARCHAR), repeat_max_per_year, tier_group, tier_level, supersedes_lower_tiers |
| `behaviour_house_teams` | name, name_ar, color, icon, display_order, is_active |
| `behaviour_house_memberships` | student_id, house_id, academic_year_id (UNIQUE per student/year) |
| `behaviour_interventions` | intervention_number, student_id, type, status, goals (JSONB), strategies (JSONB), next_review_date, send_aware, send_notes |
| `behaviour_intervention_incidents` | intervention_id, incident_id (UNIQUE pair) |
| `behaviour_intervention_reviews` | intervention_id, progress, goal_updates (JSONB), behaviour_points_since_last, attendance_rate_since_last |
| `behaviour_publication_approvals` | publication_type, entity_type, entity_id, parent_consent_status, admin_approved, published_at, unpublished_at |
| `behaviour_guardian_restrictions` | student_id, parent_id, restriction_type, effective_from, effective_until, review_date, status, legal_basis |
| `behaviour_incident_participants` | points_awarded (read for points computation) |
| `behaviour_entity_history` | entity_type, entity_id (for audit of restrictions, publications, interventions) |
| `behaviour_tasks` | task_type, entity_type, entity_id (auto-created tasks) |

---

## Section 3 — API Endpoints

### Recognition & Houses Controller (12 endpoints)

#### GET `v1/behaviour/recognition/wall`
- **Permission**: `behaviour.view`
- **Query**: `{ page, pageSize, academic_year_id?, year_group_id?, award_type_id? }`
- **Response**: `{ data: PublicationItem[], meta }`
- **Logic**: Fetch `behaviour_publication_approvals` WHERE `published_at IS NOT NULL AND unpublished_at IS NULL`, join student + entity (incident or award)

#### GET `v1/behaviour/recognition/leaderboard`
- **Permission**: `behaviour.view`
- **Query**: `{ page, pageSize, scope?: 'year'|'period'|'all_time', year_group_id? }`
- **Response**: `{ data: LeaderboardEntry[], meta }` where each entry has rank, student, year_group, points, house
- **Logic**: Aggregate points per student from participants, scope-filtered, ordered DESC

#### GET `v1/behaviour/recognition/houses`
- **Permission**: `behaviour.view`
- **Response**: `{ data: HouseStanding[] }` sorted by total points DESC
- **Logic**: Aggregate house member points for current academic year via Redis cache

#### GET `v1/behaviour/recognition/houses/:id`
- **Permission**: `behaviour.view`
- **Response**: House detail with members list and their individual points

#### POST `v1/behaviour/recognition/awards`
- **Permission**: `behaviour.manage`
- **Body**: `{ student_id, award_type_id, notes? }`
- **Logic**: Manual award. Validate repeat_mode/repeat_max_per_year. Create award record. If supersedes_lower_tiers: update lower-tier. Enqueue parent notification. If recognition_wall_auto_populate: create publication approval.

#### GET `v1/behaviour/recognition/awards`
- **Permission**: `behaviour.view`
- **Query**: `{ page, pageSize, student_id?, award_type_id?, academic_year_id? }`
- **Response**: `{ data: Award[], meta }`

#### POST `v1/behaviour/recognition/publications`
- **Permission**: `behaviour.manage`
- **Body**: `{ publication_type, entity_type, entity_id, student_id }`
- **Logic**: Create publication approval record with consent/admin gates based on settings

#### GET `v1/behaviour/recognition/publications/:id`
- **Permission**: `behaviour.manage`
- **Response**: Full publication approval status

#### PATCH `v1/behaviour/recognition/publications/:id/approve`
- **Permission**: `behaviour.admin`
- **Body**: `{ note? }`
- **Logic**: Set admin_approved = true, admin_approved_by_id. Check if both gates pass -> set published_at

#### PATCH `v1/behaviour/recognition/publications/:id/reject`
- **Permission**: `behaviour.admin`
- **Body**: `{ note? }`
- **Logic**: Set unpublished_at. Record history.

#### GET `v1/behaviour/recognition/public/feed`
- **Permission**: Public (no auth required, guarded by `recognition_wall_public` tenant setting)
- **Response**: Published items for public display

#### POST `v1/behaviour/recognition/houses/bulk-assign`
- **Permission**: `behaviour.admin`
- **Body**: `{ academic_year_id, assignments: [{ student_id, house_id }] }`
- **Logic**: Atomic transaction: delete existing memberships for listed students in that year, insert new. Invalidate house points cache.

### Interventions Controller (12 endpoints)

#### POST `v1/behaviour/interventions`
- **Permission**: `behaviour.manage`
- **Body**: `CreateInterventionDto` (student_id, title, type, trigger_description, goals, strategies, assigned_to_id, start_date, target_end_date?, review_frequency_days, send_aware, send_notes?, incident_ids?)
- **Logic**: Generate intervention_number via SequenceService (IV-prefix). Create intervention. Link incidents. Auto-create follow-up task. Record history.

#### GET `v1/behaviour/interventions`
- **Permission**: `behaviour.manage`
- **Query**: `{ page, pageSize, status?, student_id?, assigned_to_id?, type? }`
- **Response**: `{ data: Intervention[], meta }`

#### GET `v1/behaviour/interventions/:id`
- **Permission**: `behaviour.manage`
- **Response**: Full intervention with goals, strategies, reviews, tasks, linked incidents. Strip `send_notes` if user lacks `behaviour.view_sensitive`.

#### PATCH `v1/behaviour/interventions/:id`
- **Permission**: `behaviour.manage`
- **Body**: `UpdateInterventionDto` (title?, goals?, strategies?, target_end_date?, review_frequency_days?, send_notes?)
- **Logic**: Update, recalculate next_review_date if frequency changed. Record history.

#### PATCH `v1/behaviour/interventions/:id/status`
- **Permission**: `behaviour.manage`
- **Body**: `{ status, outcome?, outcome_notes? }`
- **Logic**: Validate state machine transition. If -> active: auto-create intervention_review task. If -> completed/abandoned: set actual_end_date, outcome. Record history.

#### POST `v1/behaviour/interventions/:id/reviews`
- **Permission**: `behaviour.manage`
- **Body**: `CreateReviewDto` (review_date, progress, goal_updates, notes, next_review_date?)
- **Logic**: Auto-populate behaviour_points_since_last and attendance_rate_since_last. Create review. Update intervention.next_review_date. Auto-create next review task if next_review_date set.

#### GET `v1/behaviour/interventions/:id/reviews`
- **Permission**: `behaviour.manage`
- **Response**: `{ data: Review[], meta }` ordered by created_at DESC

#### GET `v1/behaviour/interventions/:id/auto-populate`
- **Permission**: `behaviour.manage`
- **Response**: `{ behaviour_points_since_last, attendance_rate_since_last }`

#### POST `v1/behaviour/interventions/:id/complete`
- **Permission**: `behaviour.manage`
- **Body**: `{ outcome, outcome_notes? }`
- **Logic**: Set status = completed_intervention, actual_end_date, outcome. Record history.

#### GET `v1/behaviour/interventions/overdue`
- **Permission**: `behaviour.manage`
- **Query**: `{ page, pageSize }`
- **Response**: Interventions where next_review_date < today AND status IN (active_intervention, monitoring)

#### GET `v1/behaviour/interventions/my`
- **Permission**: `behaviour.manage`
- **Query**: `{ page, pageSize }`
- **Response**: Interventions where assigned_to_id = current user

#### GET `v1/behaviour/interventions/outcomes`
- **Permission**: `behaviour.manage`
- **Query**: `{ academic_year_id?, year_group_id? }`
- **Response**: Outcome analytics grouped by type, SEND status

### Guardian Restrictions Controller (6 endpoints)

#### POST `v1/behaviour/guardian-restrictions`
- **Permission**: `behaviour.admin`
- **Body**: `CreateGuardianRestrictionDto` (student_id, parent_id, restriction_type, legal_basis?, reason, effective_from, effective_until?, review_date?, approved_by_id?)
- **Logic**: Create restriction. Record history. If review_date set and within 14 days: create review task.

#### GET `v1/behaviour/guardian-restrictions`
- **Permission**: `behaviour.admin`
- **Query**: `{ page, pageSize, student_id?, parent_id?, status? }`
- **Response**: `{ data: Restriction[], meta }`

#### GET `v1/behaviour/guardian-restrictions/:id`
- **Permission**: `behaviour.admin`
- **Response**: Restriction with full entity history

#### PATCH `v1/behaviour/guardian-restrictions/:id`
- **Permission**: `behaviour.admin`
- **Body**: `UpdateGuardianRestrictionDto` (effective_until?, review_date?, legal_basis?)
- **Logic**: Update. Record history with previous_values.

#### POST `v1/behaviour/guardian-restrictions/:id/revoke`
- **Permission**: `behaviour.admin`
- **Body**: `{ reason }` (mandatory)
- **Logic**: Set status = revoked, revoked_at, revoked_by_id, revoke_reason. Record history.

#### GET `v1/behaviour/guardian-restrictions/active`
- **Permission**: `behaviour.admin`
- **Response**: All currently active restrictions (status = active_restriction, effective_from <= today, effective_until IS NULL OR >= today)

---

## Section 4 — Service Layer

### `BehaviourPointsService`
- **File**: `apps/api/src/modules/behaviour/behaviour-points.service.ts`
- **Dependencies**: PrismaService, RedisService, BehaviourConfigService
- **Methods**:
  - `getStudentPoints(tx, tenantId, studentId)` -> `{ total: number, fromCache: boolean }` — Computed from SUM of participant points_awarded, filtered by reset frequency. Redis cached 5min.
  - `invalidateStudentPointsCache(tenantId, studentId)` — Evict cache key
  - `getHousePoints(tenantId, houseId, academicYearId)` -> `{ total: number }` — Aggregate house member points. Redis cached 5min.
  - `invalidateHousePointsCache(tenantId, houseId, academicYearId)` — Evict cache key
  - `getLeaderboard(tenantId, query)` -> Ranked student list by points
  - `getHouseStandings(tenantId, academicYearId)` -> House rankings

### `BehaviourAwardService`
- **File**: `apps/api/src/modules/behaviour/behaviour-award.service.ts`
- **Dependencies**: PrismaService, BehaviourPointsService, BehaviourHistoryService, SequenceService, Queue (notifications)
- **Methods**:
  - `createManualAward(tenantId, userId, dto)` — Validate repeat_mode, create award, handle supersession, enqueue notification, create publication approval
  - `checkAndCreateAutoAwards(tenantId, incidentId, studentIds, academicYearId, academicPeriodId)` — Worker-called. Fresh points computation (no cache), dedup guard, repeat checks
  - `listAwards(tenantId, query)` — Paginated filtered list
  - `getAwardEligibility(tx, tenantId, studentId, awardType, academicYearId, academicPeriodId)` -> boolean — Repeat mode + max per year check

### `BehaviourRecognitionService`
- **File**: `apps/api/src/modules/behaviour/behaviour-recognition.service.ts`
- **Dependencies**: PrismaService, BehaviourPointsService, BehaviourHistoryService
- **Methods**:
  - `getWall(tenantId, query)` — Published items with student + entity join
  - `createPublicationApproval(tx, tenantId, dto)` — Create with consent/admin gate defaults from settings
  - `approvePublication(tenantId, publicationId, userId)` — Admin approve, check if both gates pass -> publish
  - `rejectPublication(tenantId, publicationId, userId)` — Set unpublished_at
  - `getPublicFeed(tenantId)` — Public items (guarded by setting)
  - `getPublicationDetail(tenantId, id)` — Full status

### `BehaviourInterventionsService`
- **File**: `apps/api/src/modules/behaviour/behaviour-interventions.service.ts`
- **Dependencies**: PrismaService, SequenceService, BehaviourHistoryService, BehaviourTasksService, BehaviourPointsService
- **Methods**:
  - `create(tenantId, userId, dto)` — Generate IV-number, create intervention, link incidents, auto-create task
  - `list(tenantId, query)` — Paginated filtered list, strip send_notes if no permission
  - `getDetail(tenantId, id, hasSensitivePermission)` — Full detail with reviews, tasks, incidents
  - `update(tenantId, id, userId, dto)` — Update fields, recalculate next_review_date
  - `transitionStatus(tenantId, id, userId, dto)` — Validate state machine, handle side effects
  - `createReview(tenantId, interventionId, userId, dto)` — Auto-populate stats, create review, update next_review_date, create next task
  - `getAutoPopulateData(tenantId, interventionId)` — Points since last review + attendance rate
  - `listReviews(tenantId, interventionId, page, pageSize)` — Append-only review history
  - `complete(tenantId, id, userId, dto)` — Set completed status with outcome
  - `listOverdue(tenantId, page, pageSize)` — Overdue next_review_date
  - `listMy(tenantId, userId, page, pageSize)` — Assigned to current user
  - `getOutcomeAnalytics(tenantId, query)` — Group by type, SEND status

### `BehaviourGuardianRestrictionsService`
- **File**: `apps/api/src/modules/behaviour/behaviour-guardian-restrictions.service.ts`
- **Dependencies**: PrismaService, BehaviourHistoryService, BehaviourTasksService
- **Methods**:
  - `create(tenantId, userId, dto)` — Create restriction, record history, auto-create review task if needed
  - `list(tenantId, query)` — Paginated filtered list
  - `getDetail(tenantId, id)` — With full history
  - `update(tenantId, id, userId, dto)` — Update dates/legal basis, record history
  - `revoke(tenantId, id, userId, reason)` — Set revoked status, record history
  - `listActive(tenantId)` — All currently effective restrictions
  - `hasActiveRestriction(tx, tenantId, studentId, parentId, restrictionTypes)` -> boolean — Used by notification/portal rendering
  - `expireEndedRestrictions(tenantId, today)` — Called by daily worker
  - `createReviewReminders(tenantId, today)` — Called by daily worker

### `BehaviourHouseService`
- **File**: `apps/api/src/modules/behaviour/behaviour-house.service.ts`
- **Dependencies**: PrismaService, BehaviourPointsService
- **Methods**:
  - `listHouses(tenantId)` — Active houses with member counts
  - `getHouseDetail(tenantId, houseId, academicYearId)` — Members with points
  - `bulkAssign(tenantId, academicYearId, assignments)` — Atomic replace memberships

---

## Section 5 — Frontend Pages and Components

### `/behaviour/recognition` (Client component)
- **File**: `apps/web/src/app/[locale]/(school)/behaviour/recognition/page.tsx`
- **Route**: `/behaviour/recognition`
- **Data fetching**: `apiClient` calls to recognition endpoints
- **Tabs**: Wall | Leaderboard | Houses | Pending Approvals (admin-only)
- **Key UI**: Award cards grid, ranked leaderboard table, house standing cards, approval queue

### `/behaviour/interventions` (Client component)
- **File**: `apps/web/src/app/[locale]/(school)/behaviour/interventions/page.tsx`
- **Route**: `/behaviour/interventions`
- **Tabs**: Active | Overdue | Monitoring | Completed | All
- **Key UI**: Intervention list with status badges, next review date (red if overdue)

### `/behaviour/interventions/new` (Client component)
- **File**: `apps/web/src/app/[locale]/(school)/behaviour/interventions/new/page.tsx`
- **Route**: `/behaviour/interventions/new`
- **Key UI**: Multi-section form with goals builder, strategies builder, incident linker, SEND toggle

### `/behaviour/interventions/[id]` (Client component)
- **File**: `apps/web/src/app/[locale]/(school)/behaviour/interventions/[id]/page.tsx`
- **Route**: `/behaviour/interventions/[id]`
- **Tabs**: Overview | Reviews | Tasks | Incidents | History
- **Key UI**: Goal/strategy cards, review timeline, add review form with auto-populated stats

### `/settings/behaviour-awards` (Client component)
- **File**: `apps/web/src/app/[locale]/(school)/settings/behaviour-awards/page.tsx`
- **Route**: `/settings/behaviour-awards`
- **Key UI**: Award type CRUD list with repeat mode, tier config, icon/colour pickers

### `/settings/behaviour-houses` (Client component)
- **File**: `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx`
- **Route**: `/settings/behaviour-houses`
- **Key UI**: House CRUD with colour swatches, membership management tab

---

## Section 6 — Background Jobs

### `behaviour:check-awards`
- **Queue**: `behaviour`
- **Trigger**: Enqueued by `BehaviourService.createIncident` after incident + participants persisted
- **Payload**: `{ tenant_id, incident_id, student_ids, academic_year_id, academic_period_id }`
- **Logic**: For each student: fresh points computation (NO cache), check each auto-award type, dedup by triggered_by_incident_id, check repeat_mode/max_per_year, create award, handle supersession, enqueue parent notification, create publication approval
- **Idempotency**: Dedup guard on triggered_by_incident_id

### `behaviour:guardian-restriction-check`
- **Queue**: `behaviour`
- **Trigger**: Daily cron at 06:00 tenant timezone
- **Payload**: `{ tenant_id }`
- **Logic**: Step 1: Expire restrictions where effective_until < today. Step 2: Create review tasks for restrictions with review_date within 14 days.

---

## Section 7 — Implementation Order

1. **Shared Zod schemas** — recognition, intervention, guardian-restriction, house schemas in `packages/shared`
2. **BehaviourPointsService** — Core dependency, Redis caching, points computation
3. **BehaviourHouseService** — House CRUD and membership management
4. **BehaviourAwardService** — Award creation, repeat mode validation, supersession logic
5. **BehaviourRecognitionService** — Recognition wall, publication approvals
6. **BehaviourInterventionsService** — Intervention CRUD, reviews, auto-populate, state machine
7. **BehaviourGuardianRestrictionsService** — Restrictions CRUD, active check, revocation
8. **BehaviourRecognitionController** — 12 recognition endpoints
9. **BehaviourInterventionsController** — 12 intervention endpoints
10. **BehaviourGuardianRestrictionsController** — 6 restriction endpoints
11. **Worker: behaviour:check-awards** — Auto-award processor
12. **Worker: behaviour:guardian-restriction-check** — Daily restriction processor
13. **Module wiring** — Update BehaviourModule with new services/controllers, add RedisModule import, add behaviour queue
14. **Frontend pages** — recognition, interventions, interventions/new, interventions/[id], settings/awards, settings/houses
15. **Integration with existing Phase A code** — Add check-awards enqueue to incident creation

---

## Section 8 — Files to Create

### Shared (6 files)
- `packages/shared/src/behaviour/schemas/recognition.schema.ts`
- `packages/shared/src/behaviour/schemas/intervention.schema.ts`
- `packages/shared/src/behaviour/schemas/guardian-restriction.schema.ts`
- `packages/shared/src/behaviour/schemas/house.schema.ts`
- `packages/shared/src/behaviour/state-machine-intervention.ts`

### Backend Services (6 files)
- `apps/api/src/modules/behaviour/behaviour-points.service.ts`
- `apps/api/src/modules/behaviour/behaviour-award.service.ts`
- `apps/api/src/modules/behaviour/behaviour-recognition.service.ts`
- `apps/api/src/modules/behaviour/behaviour-interventions.service.ts`
- `apps/api/src/modules/behaviour/behaviour-guardian-restrictions.service.ts`
- `apps/api/src/modules/behaviour/behaviour-house.service.ts`

### Backend Controllers (3 files)
- `apps/api/src/modules/behaviour/behaviour-recognition.controller.ts`
- `apps/api/src/modules/behaviour/behaviour-interventions.controller.ts`
- `apps/api/src/modules/behaviour/behaviour-guardian-restrictions.controller.ts`

### Worker (2 files)
- `apps/worker/src/processors/behaviour/check-awards.processor.ts`
- `apps/worker/src/processors/behaviour/guardian-restriction-check.processor.ts`

### Frontend (6 files)
- `apps/web/src/app/[locale]/(school)/behaviour/recognition/page.tsx`
- `apps/web/src/app/[locale]/(school)/behaviour/interventions/page.tsx`
- `apps/web/src/app/[locale]/(school)/behaviour/interventions/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/behaviour/interventions/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/behaviour-awards/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx`

---

## Section 9 — Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/modules/behaviour/behaviour.module.ts` | Add new services, controllers, RedisModule import, behaviour queue |
| `apps/api/src/modules/behaviour/behaviour.service.ts` | Enqueue `behaviour:check-awards` job after incident creation |
| `apps/api/src/modules/behaviour/behaviour-students.service.ts` | Update stub endpoints (awards, interventions) to call real services |
| `packages/shared/src/behaviour/schemas/index.ts` | Export new schemas |
| `packages/shared/src/behaviour/index.ts` | Export new state machine |
| `packages/shared/src/behaviour/enums.ts` | Add Phase E enum arrays (intervention status, restriction type, etc.) |
| `apps/worker/src/worker.module.ts` | Register new processors |

---

## Section 10 — Key Context for Executor

### Prisma enum gotchas
Several enums use `@map()` which means the Prisma TypeScript name differs from the DB value:
- Use `'active_intervention'` in TS, not `'active'` for InterventionStatus
- Use `'completed_intervention'` in TS, not `'completed'` for InterventionStatus
- Use `'active_restriction'` in TS, not `'active'` for RestrictionStatus
- Use `'pending_consent'` in TS, not `'pending'` for ParentConsentStatus
- `repeat_mode` on BehaviourAwardType is a VARCHAR, not an enum — validate with Zod

### Redis caching pattern
Use `RedisService.getClient()` to get ioredis instance. Cache keys:
- `behaviour:points:{tenantId}:{studentId}:{scope}` (TTL 300s)
- `behaviour:house-points:{tenantId}:{houseId}:{academicYearId}` (TTL 300s)

### SEND notes visibility
`send_notes` must be stripped from API responses unless the user has `behaviour.view_sensitive` permission.

### Phase A patterns to follow
- RLS: `createRlsClient(this.prisma, { tenant_id: tenantId })` for all mutations
- History: `this.historyService.recordHistory(tx, tenantId, entityType, entityId, userId, changeType, prev, new)`
- Scope: via `BehaviourScopeService.getUserScope()` for filtered queries
- Tasks: Create via `BehaviourTasksService` methods or direct Prisma insert within transaction
- Controller: Thin, `@UseGuards(AuthGuard, PermissionGuard)`, `@RequiresPermission()`, `ZodValidationPipe`

### Intervention state machine
```
planned -> active_intervention | abandoned
active_intervention -> monitoring | completed_intervention | abandoned
monitoring -> completed_intervention | active_intervention
```
Implement as a shared utility similar to `isValidTransition()` for incidents.
