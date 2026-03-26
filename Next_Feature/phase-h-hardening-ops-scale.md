# Phase H: Hardening + Ops + Scale — Implementation Spec

> **Module**: `modules/behaviour/`
> **Phase**: H of H — Final phase
> **Spec source**: behaviour-management-spec-v5-master.md sections 2.1, 6, 7, 8.12, 9, 10, 15, 17

---

## Prerequisites

**All previous phases must be fully deployed, regression-tested, and passing their respective acceptance criteria** before Phase H begins:

| Phase | What must be complete |
|-------|----------------------|
| **A** | Schema (all 32 tables), RLS, incidents, participants, categories, parent_description workflow, data classification, entity_history |
| **B** | Policy engine, staged rules, versioning, evaluation ledger, historical replay |
| **C** | Sanctions, exclusion cases, appeals, amendment workflow |
| **D** | Safeguarding, attachments, ClamAV, break-glass |
| **E** | Recognition, interventions, guardian restrictions |
| **F** | Analytics, pulse, AI anonymisation pipeline, ETB benchmarking |
| **G** | Document generation, parent portal, notification digest, amendment correction chain |

Phase H does not add end-user features. It hardens what exists, makes the system operationally self-sustaining, and verifies that every safety constraint holds under adversarial conditions.

---

## Objectives

1. Implement `behaviour_legal_holds` table with full service, propagation cascade, and retention worker integration.
2. Implement the `behaviour:retention-check` worker — monthly archival and anonymisation with legal hold gating.
3. Implement all 14 admin operations endpoints with the preview/execute guardrail protocol and dual-approval integration.
4. Set up table partitioning for high-volume append-only tables with a partition management cron.
5. Configure index maintenance schedule.
6. Build the `/settings/behaviour-admin` operational dashboard page.
7. Run all 7 release-gate test suites and achieve full pass.
8. Conduct scope audit, RLS cross-tenant verification, and data classification audit.

---

## Tables

### `behaviour_legal_holds`

Dedicated legal hold tracking with full lifecycle. Prevents premature anonymisation of records linked to disputes, safeguarding investigations, or exclusion cases.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `entity_type` | ENUM('incident', 'sanction', 'intervention', 'appeal', 'exclusion_case', 'task', 'attachment') NOT NULL | The type of entity being held |
| `entity_id` | UUID NOT NULL | The specific record being held. No FK constraint — the entity may be in any of seven tables |
| `hold_reason` | TEXT NOT NULL | Human-readable reason. Required. |
| `legal_basis` | VARCHAR(300) NULL | Structured reference, e.g. "Appeal AP-000042", "Safeguarding CP-000015", "Exclusion EX-000003", "Court order ref. 2025/FC/1234" |
| `set_by_id` | UUID FK NOT NULL | -> `users`. Must have `behaviour.admin` |
| `set_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| `status` | ENUM('active', 'released') DEFAULT 'active' | |
| `released_by_id` | UUID FK NULL | -> `users`. Set when hold released |
| `released_at` | TIMESTAMPTZ NULL | |
| `release_reason` | TEXT NULL | Required when releasing |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Indexes**:
- `(tenant_id, entity_type, entity_id, status) WHERE status = 'active'` — partial index used by the retention worker check before any anonymisation. Partial index on `status = 'active'` keeps the index small since most holds will eventually be released.
- `(tenant_id, status)` — admin overview query (list all active holds for the tenant)

**Design rationale — a dedicated table, not booleans**:

A boolean `legal_hold` column on each entity table was considered and rejected for these reasons:

1. **Multiple concurrent holds**: One entity can be under hold simultaneously for an appeal AND a safeguarding concern AND an exclusion case. A boolean cannot represent three independent holds. Releasing one would incorrectly release all.
2. **Independent lifecycle per hold**: Each hold has its own setter, reason, legal basis, and release record. This is not representable in a single boolean.
3. **Compliance auditability**: Compliance auditors must be able to answer "why was this record retained beyond its retention period?" from a single query. The table provides that answer without join-chain archaeology.
4. **Releasing one hold must not release others**: When an appeal is resolved and its hold released, the entity may still be held for a safeguarding concern. The multi-row model handles this correctly — the retention worker checks for ANY active hold, not a specific one.
5. **Full audit trail**: Every hold set and release is logged in `behaviour_entity_history` (`change_type = 'legal_hold_set'` and `change_type = 'legal_hold_released'`). A boolean column updated in place destroys the history.

**Propagation rules**: When a legal hold is set on an anchor entity, `LegalHoldService.propagateHold()` automatically creates additional hold records for all linked entities. Propagation is not recursive — it propagates one level from the anchor:

| Anchor Entity | Propagates holds to |
|---------------|---------------------|
| `incident` | All linked `behaviour_incident_participants` rows, `behaviour_sanctions` for this incident, `behaviour_tasks` with `entity_id = incident.id`, `behaviour_attachments` for this incident, `behaviour_policy_evaluations` for this incident, `behaviour_entity_history` for this incident (entity_type = 'incident'), `behaviour_amendment_notices` for this incident, `behaviour_documents` for this incident |
| `appeal` filed against incident | The incident (above) + all entities linked to that incident via incident propagation |
| `safeguarding_concern` linked to incident | The incident (above) + all entities linked to that incident via incident propagation |
| `exclusion_case` | The linked `behaviour_sanctions` record, the linked `behaviour_incidents` record + all entities linked to that incident via incident propagation, all `behaviour_documents` linked to the exclusion case |

Each propagated hold is created as a separate `behaviour_legal_holds` row with the same `hold_reason` and `legal_basis` as the anchor, plus a note "Propagated from [entity_type] [entity_id]" appended to the reason.

**Retention worker integration**: Before anonymising any entity, the retention worker executes:

```typescript
const activeHold = await tx.behaviour_legal_holds.findFirst({
  where: {
    tenant_id: tenantId,
    entity_type: entityType,
    entity_id: entityId,
    status: 'active',
  },
});
if (activeHold) {
  // Skip anonymisation. Log to retention job output:
  // { entity_type, entity_id, hold_reason: activeHold.hold_reason, legal_basis: activeHold.legal_basis, held_since: activeHold.set_at }
  return { skipped: true, reason: 'legal_hold', hold_id: activeHold.id };
}
```

This check runs inside the `prisma.$transaction()` for each entity being processed, so the check and the anonymisation (if proceeding) are atomic.

**Permission gate**: Setting and releasing holds requires `behaviour.admin`. Every set and release is logged in `behaviour_entity_history` with `change_type = 'legal_hold_set'` or `change_type = 'legal_hold_released'`.

---

## Business Logic

### Legal Holds Service

`LegalHoldService` — `apps/api/src/modules/behaviour/services/legal-hold.service.ts`

#### Create Hold

```typescript
async createHold(input: {
  tenantId: string;
  entityType: LegalHoldEntityType;
  entityId: string;
  holdReason: string;
  legalBasis?: string;
  setById: string;
}, propagate: boolean = true): Promise<BehaviourLegalHold>
```

1. Verify that `setById` has `behaviour.admin` permission.
2. Check for an existing active hold on the same entity — if one already exists with the same `legal_basis`, return it (idempotent).
3. Create the hold record.
4. Log `change_type = 'legal_hold_set'` in `behaviour_entity_history` for the anchor entity.
5. If `propagate = true`: call `propagateHold()` — creates hold records for all linked entities as per propagation rules above. Each propagated hold is a separate DB row with `propagate = false` to prevent recursive propagation.

#### Release Hold

```typescript
async releaseHold(input: {
  tenantId: string;
  holdId: string;
  releaseReason: string;
  releasedById: string;
}, releaseLinked: boolean = false): Promise<void>
```

1. Verify that `releasedById` has `behaviour.admin` permission.
2. Update hold: `status = 'released'`, `released_by_id`, `released_at`, `release_reason`.
3. Log `change_type = 'legal_hold_released'` in `behaviour_entity_history`.
4. If `releaseLinked = true`: release all holds with the same source `legal_basis` reference (e.g. releasing all holds created for "Appeal AP-000042").
5. **Critically**: releasing a hold does NOT trigger immediate anonymisation. The entity may still be within its retention period, and other holds may exist. The retention worker handles anonymisation on its own schedule.

---

### Record Lifecycle (Section 6)

#### Lifecycle States

| State | Meaning | Access |
|-------|---------|--------|
| `active` | Current, live record | Full access per permissions |
| `archived` | Past academic year, no longer operationally relevant | Read-only. Excluded from default list views, search results, and analytics. Accessible via "Include archived" toggle and search. No PII removed. |
| `anonymised` | Retention period expired, PII removed | Aggregate analytics only. Free text fields replaced. Student names hashed. Search index entries removed. |

#### Retention Rules

| Entity | Default Retention | Basis | Legal Hold Check |
|--------|------------------|-------|-----------------|
| Behaviour incidents | 7 years after student withdrawal/graduation | Irish education records guidance | Yes |
| Sanctions | 7 years after student withdrawal/graduation | Same | Yes |
| Interventions | 7 years after student withdrawal/graduation | Same | Yes |
| Appeals | 10 years after decided_at | Dispute resolution records | Yes |
| Exclusion cases | 25 years from student DOB | Matches safeguarding lifetime | Always held — never auto-anonymised, requires manual review |
| Tasks | 3 years from completion date | Operational records | No (skipped) |
| Policy evaluations | 7 years after created_at | Decision audit trail | Yes |
| Policy action executions | 7 years after executed_at | Decision audit trail | Yes |
| Alerts | 3 years after created_at | Operational records | No (skipped) |
| Parent acknowledgements | 7 years after sent_at | Communication records | Yes |
| Entity history | Matches parent entity retention | Audit trail | Yes |
| Amendment notices | Matches parent entity retention | Communication records | Yes |
| Generated documents | Matches parent entity retention | Record of communication | Yes |
| Safeguarding concerns | 25 years from student DOB | Children First Act 2015 | Always held |
| Safeguarding actions | 25 years from student DOB | Same | Always held |
| Attachments | Matches parent entity retention | Evidence | Yes |

Retention periods are configured per tenant in `tenant_settings.behaviour` (e.g. `incident_retention_years`, `appeal_retention_years`). The defaults above match the values in `tenant_settings.behaviour` Zod defaults.

#### Lifecycle Operations

**Archival** (triggered annually by `behaviour:retention-check`):

1. Identify students who have left the school (status `withdrawn` or `graduated`) with `students.left_date + retention_config.years` < today.
2. For each such student, query all their behaviour entities that have `retention_status = 'active'`.
3. For each entity:
   a. Check: is the entity's last activity date (incident `occurred_at`, sanction `scheduled_date`, appeal `decided_at`, etc.) older than the relevant retention period?
   b. If yes: set `retention_status = 'archived'`, `archived_at = now()`.
   c. Entity remains fully readable; only excluded from default views.
4. Archived records are excluded from: default list queries (all list endpoints filter `retention_status = 'active'` unless `include_archived = true` query param is passed), Meilisearch search index, and analytics queries unless the analytics query spans "all time."

**Anonymisation** (triggered monthly by `behaviour:retention-check`, runs after archival pass):

1. Identify archived entities where the retention deadline has been reached (i.e. `archived_at` + a further grace buffer, or `archived_at` > `retention_years` from the reference date, depending on entity type).
2. For each candidate entity:
   a. Check `behaviour_legal_holds` for any active hold (see retention worker integration above). If active hold: skip and log.
   b. If no active hold: anonymise PII fields within a transaction:
      - Student names → `"Student-" + hex(sha256(student_id)).substring(0, 8)`
      - Staff names → role title (e.g. "Year Head", "Class Teacher")
      - Parent names → `"Guardian"`
      - Free text description fields → `"[Archived content]"`
      - `context_notes` → `NULL`
      - `hearing_notes`, `parent_meeting_notes`, `send_notes` → `NULL`
   c. Set `retention_status = 'anonymised'`.
   d. Queue `behaviour:attachment-cleanup` for any linked attachments: mark S3 objects for deletion (actual S3 deletion deferred 30 days to allow recovery if the anonymisation was in error).
   e. Delete Meilisearch index entries for this entity.
3. Log the anonymisation event in `behaviour_entity_history` with `change_type = 'anonymised'`, actor = system worker.

**Parent portal visibility**: Ends when `students.status` transitions to `withdrawn` or `graduated`. Configurable grace period in tenant settings (default 30 days). After the grace period, the parent portal returns empty results for that child even if the records are still `active` for staff.

---

### Admin Operations with Guardrails (Section 8.12 + Section 15 "Admin Operations")

All admin operations follow a mandatory preview/execute pattern. This prevents accidental mass data changes without a confirmation step.

#### Guardrail Protocol

```
Step 1 — Preview (required before any execute):
  POST /admin/{operation}/preview
  Returns: {
    affected_records: number,
    affected_students: number,
    sample_records: string[],   // up to 10 example record IDs/names
    estimated_duration: string, // e.g. "~45s", "~3min"
    warnings: string[],         // e.g. "47 records have legal holds and will be skipped"
    reversible: boolean,
    rollback_method: string | null,
  }

Step 2 — Staff reviews the impact summary.

Step 3 — Execute:
  POST /admin/{operation}/execute
  - If tenant_settings.admin_destructive_ops_dual_approval = true:
      Creates an approval request (existing ApprovalModule).
      Job does not start until a second admin user approves the request.
      Response: { job_id, approval_request_id, status: 'awaiting_approval' }
  - If dual_approval = false (or tenant-wide dangerous op overrides):
      Executes immediately as async BullMQ job.
      Response: { job_id, status: 'queued' }

Step 4 — Progress tracking:
  GET /admin/jobs/:jobId
  Returns: { status, progress_percent, records_processed, records_failed, error_log }

Step 5 — Audit:
  Full audit log written by the worker at completion: total affected, per-record changes.
```

**Tenant-wide dangerous operations** (recompute-points for entire tenant scope, retention-execute, reindex-search for entire tenant) **always require dual approval** regardless of the `admin_destructive_ops_dual_approval` setting.

#### Rollback Matrix

| Operation | Reversible? | Rollback Method |
|-----------|-------------|-----------------|
| `recompute-points` | Yes (cache only) | Re-run recompute, or `FLUSHDB` cache key for that tenant. Points are computed from source records, not stored — idempotent. |
| `rebuild-awards` | Partially | New awards created by the rebuild can each be individually revoked via `DELETE /awards/:id` (soft revocation). Awards that existed before and were not touched are unaffected. |
| `recompute-pulse` | Yes | Idempotent — re-run the same job. Pulse is computed, not stored. |
| `backfill-tasks` | Partially | New tasks created by the backfill can each be individually cancelled. |
| `resend-notification` | No | Already sent to parent. Cannot unsend. A correction notice can be dispatched via the amendment workflow if the resent notification was incorrect. |
| `refresh-views` | Yes | Idempotent — re-run. Materialised views are refreshed `CONCURRENTLY` with no data loss. |
| `policy-dry-run` | N/A | Read-only operation; no changes made. |
| `reindex-search` | Yes | Idempotent — rebuild index from source DB. |
| `retention-execute` | No | Anonymisation is irreversible. Archival (without anonymisation) is technically reversible by setting `retention_status = 'active'` but requires a DB migration and is not exposed in-app. |

---

## API Endpoints

### Admin Operations (8.12) — `behaviour-admin.controller.ts`

**Base path**: `v1/behaviour/admin`
**Permission**: All endpoints require `behaviour.admin`.

| Method | Route | Description | Dual Approval? | Notes |
|--------|-------|-------------|----------------|-------|
| `POST` | `/recompute-points` | Recompute cumulative points for a student, year group, or entire tenant | Always for tenant-wide | Body: `{ scope: 'student' \| 'year_group' \| 'tenant', student_id?: string, year_group_id?: string }`. Invalidates Redis cache keys and recomputes from source incident participants. |
| `POST` | `/rebuild-awards` | Scan all students for missing threshold awards and create them | Per setting for tenant-wide | Body: `{ scope: 'student' \| 'year_group' \| 'tenant', student_id?: string, year_group_id?: string }`. Uses `triggered_by_incident_id` dedup guard. |
| `POST` | `/recompute-pulse` | Force recalculate the 5-dimension pulse | No | Idempotent. No body. |
| `POST` | `/backfill-tasks` | Scan all entities for missing tasks and create them | Per setting | Body: `{ scope: 'tenant' \| 'entity_type', entity_type?: string }`. Creates tasks that the policy engine or sanction lifecycle should have created but didn't (e.g. after a bug fix). |
| `POST` | `/resend-notification` | Re-queue a parent notification for a specific incident or sanction | No | Body: `{ incident_id?: string, sanction_id?: string, parent_id: string, channel: string }`. Creates new `behaviour_parent_acknowledgements` row. |
| `POST` | `/refresh-views` | Force refresh all behaviour materialised views | No | Triggers `REFRESH MATERIALIZED VIEW CONCURRENTLY` for all three views. |
| `POST` | `/policy-dry-run` | Evaluate all policy stages against a hypothetical incident | No | Body: `{ category_id, student_id, context_type, severity? }`. Returns which rules would match and which actions would fire. No DB changes. |
| `GET` | `/dead-letter` | List failed/stuck BullMQ jobs in behaviour queues | No | Returns `{ queue, job_id, job_name, failed_at, failure_reason, retry_count }[]` sorted by failed_at DESC. |
| `POST` | `/dead-letter/:jobId/retry` | Retry a dead-letter job | No | Moves the job from failed queue back to waiting. Logs retry action. |
| `GET` | `/scope-audit` | Show exactly which students a specific user can currently see | No | Query: `user_id`. Returns the user's scope level and the list of student IDs accessible to them. Used to debug "why can't they see this student?" issues. |
| `GET` | `/health` | System health dashboard — queue depths, cache hit rates, view freshness, attachment scan backlog | No | Returns `{ queue_depths: Record<string, number>, dead_letter_depth: number, cache_hit_rate: number, view_freshness: { view_name, last_refreshed_at }[], scan_backlog: number, legal_holds_active: number }` |
| `POST` | `/reindex-search` | Rebuild the Meilisearch behaviour search index from DB | Always | Drops and rebuilds the behaviour incidents index. STAFF-class fields only. Status projection applied. Scope filtering applied. |
| `POST` | `/*/preview` | Preview mode for any destructive operation | No | Virtual endpoint — each of the destructive operations above (`recompute-points`, `rebuild-awards`, `backfill-tasks`, `reindex-search`) accepts a `preview=true` query parameter OR has a matching `/preview` sub-route that returns the impact summary without executing. |
| `POST` | `/retention/preview` | Preview which records would be archived or anonymised in the next retention run | No | Returns `{ to_archive: number, to_anonymise: number, held_by_legal_hold: number, sample_to_archive: [], sample_to_anonymise: [] }` |
| `POST` | `/retention/execute` | Execute the retention worker immediately (outside its monthly schedule) | Always | Creates BullMQ job. Requires dual approval regardless of setting. Returns `{ job_id, approval_request_id }`. |

---

## Frontend Pages

### `/settings/behaviour-admin`

**Purpose**: Operational dashboard for school administrators — system health monitoring, dead-letter management, manual operational triggers, scope auditing, and retention previewing.

**Layout** (tabbed):

#### Tab 1: System Health

- Queue depth gauges: one per BullMQ queue (`behaviour`, `notifications`) — green/amber/red based on depth thresholds
- Dead-letter count badge (red if > 0)
- Cache hit rate gauge (Redis)
- Materialised view freshness: table showing each view and time since last refresh — amber if > 30 min for `mv_student_behaviour_summary`, red if > 24h for nightly views
- Attachment scan backlog: count of attachments with `scan_status = 'pending'` for more than 5 minutes
- Active legal holds count with link to legal holds list

#### Tab 2: Dead-Letter Queue

- Table: Job name, queue, failed at, failure reason (truncated), retry count, "Retry" action button
- Bulk retry button (retries all dead-letter jobs)
- Empty state: "No failed jobs — all queues healthy"

#### Tab 3: Operations

Each operation card has:
1. Description of what it does
2. Scope selector (where applicable: student/year_group/tenant)
3. "Preview Impact" button — calls the preview endpoint, shows the impact summary modal
4. "Execute" button — only enabled after preview has been run and reviewed. Creates the job (with dual approval prompt if required).
5. Status of the last execution for this operation type

Operations listed:
- Recompute Points
- Rebuild Awards
- Recompute Pulse
- Backfill Tasks
- Resend Notification (requires incident/sanction ID + parent selection)
- Refresh Materialised Views
- Reindex Search

#### Tab 4: Scope Audit

- Staff member search/select
- "Run Scope Audit" button
- Results: shows the staff member's scope level and the count + list of student IDs they can access
- Used to answer: "Why can this teacher see Year 10 students when they should only see Year 9?"

#### Tab 5: Retention

- Current retention configuration (read-only display from tenant settings)
- "Preview Next Retention Run" button — calls `/retention/preview`, shows counts
- Legal holds list: all active holds for the tenant, with entity type, entity ID, reason, legal basis, set by, set at
- "Release Hold" action on each hold item (requires reason)
- "Execute Retention Now" button (requires dual approval, always)

**Mobile**: Tab labels collapse to icons on mobile. Each tab is full-width scrollable. Operation cards stack vertically. Preview/execute buttons are full-width on mobile.

**Permissions**: Entire page requires `behaviour.admin`. Non-admin users receive 403 on the API and are redirected from the frontend route.

---

## Worker Jobs

### `behaviour:retention-check`

| Property | Value |
|----------|-------|
| **Queue** | `behaviour` |
| **Trigger** | Cron monthly, first day of each month at 01:00 UTC |
| **Class** | Extends `TenantAwareJob` — tenant_id in payload, RLS set before DB access |
| **Payload** | `{ tenant_id: string, dry_run?: boolean }` |

**Processing sequence**:

1. **Pass 1 — Archival**: Identify students with `status IN ('withdrawn', 'graduated')` and `left_date` set. For each such student, load all their active behaviour entities (incidents, sanctions, interventions, appeals, tasks, policy evaluations, alerts, parent acknowledgements). For each entity, evaluate whether its reference date + the configured retention years < today. If yes: set `retention_status = 'archived'`, `archived_at = now()`. Log count of archived records.

2. **Pass 2 — Anonymisation**: Identify all `archived` entities where the full retention period has elapsed (i.e. the entity is old enough that even the extended retention clock has run). For each:
   a. Check `behaviour_legal_holds` for any active hold. If exists: skip, log `{ entity_type, entity_id, hold_id }` to the job's output.
   b. If no hold: execute anonymisation (PII replacement as described in Lifecycle Operations above).
   c. Mark `retention_status = 'anonymised'`.
   d. Queue attachment cleanup.
   e. Remove from Meilisearch.

3. **Exclusion cases and safeguarding concerns** are never auto-anonymised. They are flagged in the job output as "requiring manual review" when their reference date + retention years has passed.

4. **Guardian restriction expiry**: At the end of each monthly run, expire `behaviour_guardian_restrictions` where `effective_until < today` by setting `status = 'expired'`.

5. **Job output**: Structured JSON written to the job result:
   ```json
   {
     "archived_count": 47,
     "anonymised_count": 12,
     "held_skipped_count": 3,
     "held_entities": [{ "entity_type": "incident", "entity_id": "...", "hold_reason": "..." }],
     "exclusion_cases_for_review": 2,
     "safeguarding_cases_for_review": 0
   }
   ```

6. If `dry_run = true`: runs all logic but makes no DB changes. Returns the above summary. Used by `/retention/preview` endpoint.

**Error handling**: Transactional per entity — if one entity fails to anonymise, the transaction rolls back for that entity only. The job continues with the next entity. Failures logged to job error output.

**Duration**: Expected ~2-5 minutes for a school with 5 years of data. BullMQ timeout set to 600 seconds. Memory limit: 512MB.

---

## Release-Gate Test Suites

All 7 suites are mandatory before any behaviour module release. The full test suite must pass with 0 failures.

---

### 15.1 Data Classification Contract Tests

**Purpose**: Verify that the data classification model is correctly enforced on every data surface — API responses, exports, previews, and notifications.

**Required coverage**: Every API endpoint that returns behaviour data. Every export type. Every preview payload.

```typescript
describe('Data Classification', () => {

  it('STAFF-scope user never receives SENSITIVE fields', async () => {
    // Arrange: create incident with context_notes, parent_meeting_notes, send_notes set
    // Act: call GET /behaviour/incidents/:id as teacher with behaviour.view, without behaviour.view_sensitive
    // Assert: response.context_notes is undefined or absent
    // Assert: response.parent_meeting_notes is undefined or absent
    // Assert: response.send_notes is undefined or absent
  });

  it('PARENT-scope user never receives STAFF fields', async () => {
    // Arrange: create incident with description and parent_description both set
    // Act: call GET /parent/behaviour/incidents as authenticated parent
    // Assert: response items never contain a field named 'description' that matches the internal description
    // Assert: incident_description (the rendered field) matches parent_description content, not the internal description
  });

  it('Non-safeguarding user never sees converted_to_safeguarding status', async () => {
    // Arrange: create incident, set status to 'converted_to_safeguarding'
    // Act: call GET /behaviour/incidents/:id as teacher without safeguarding.view
    // Assert: response.status === 'closed'
    // Assert: response.status !== 'converted_to_safeguarding'
  });

  it('Safeguarding user can see converted_to_safeguarding status', async () => {
    // Arrange: same incident
    // Act: call as user with safeguarding.view
    // Assert: response.status === 'converted_to_safeguarding'
  });

  it('Search index never contains SENSITIVE fields', async () => {
    // Arrange: create incident with context_notes
    // Act: trigger Meilisearch index of the incident
    // Act: query Meilisearch for the context_notes content
    // Assert: Meilisearch returns 0 results (field not indexed)
  });

  it('Safeguarding entities never appear in search index', async () => {
    // Arrange: create safeguarding_concern
    // Act: search Meilisearch for the concern description
    // Assert: 0 results
  });

  it('AI prompt never contains SENSITIVE fields', async () => {
    // Arrange: mock the AI provider; capture prompt payload
    // Act: trigger AI summary or NL query
    // Assert: prompt does not contain context_notes content
    // Assert: prompt does not contain SEND diagnostic terms
    // Assert: student names in prompt are replaced with opaque tokens
  });

  it('PDF export class matches declared classification', async () => {
    // Arrange: generate a student pack PDF (STAFF class)
    // Assert: export service was called with classification = 'STAFF'
    // Assert: PDF does not contain context_notes content (checked via text extraction)
  });

  it('Parent notification never contains internal description', async () => {
    // Arrange: create incident with description = 'internal staff note' and parent_description = 'parent safe text'
    // Act: trigger parent notification dispatch
    // Assert: notification body contains 'parent safe text', not 'internal staff note'
  });

  it('Hover card preview contains only STAFF-class fields', async () => {
    // Arrange: create incident with all fields populated including context_notes
    // Act: call hover card preview endpoint as teacher
    // Assert: context_notes absent from preview payload
  });

});
```

---

### 15.2 Scope Enforcement Tests

**Purpose**: Verify that staff can only see incidents for students within their configured scope. Scope must be enforced consistently across all data surfaces.

```typescript
describe('Scope Enforcement', () => {

  it('class-scope teacher only sees incidents for students in their classes', async () => {
    // Arrange: teacher A has scope='class', teaches Class 9A
    // Arrange: incident A for student in 9A, incident B for student in 9B
    // Act: call GET /behaviour/incidents as teacher A
    // Assert: response contains incident A
    // Assert: response does NOT contain incident B
  });

  it('year_group-scope year head only sees incidents for their year groups', async () => {
    // Arrange: year head has scope='year_group', assigned Year 9
    // Arrange: incident A for Year 9 student, incident B for Year 10 student
    // Act: call GET /behaviour/incidents
    // Assert: incident A present, incident B absent
  });

  it('own-scope teacher only sees incidents they personally logged', async () => {
    // Arrange: teacher A has scope='own'
    // Arrange: incident A logged by teacher A, incident B logged by teacher B (same student)
    // Act: call GET /behaviour/incidents as teacher A
    // Assert: incident A present, incident B absent
  });

  it('scope applies to search results', async () => {
    // Arrange: class-scope teacher, two incidents for students in different classes
    // Act: call search endpoint with broad query
    // Assert: only in-scope incidents in results
  });

  it('scope applies to hover card previews', async () => {
    // Arrange: class-scope teacher
    // Act: call hover card endpoint for out-of-scope student
    // Assert: 403 or empty result, not the student's data
  });

  it('scope applies to PDF exports', async () => {
    // Arrange: class-scope teacher
    // Act: call export endpoint with student from different class
    // Assert: 403
  });

  it('scope applies to AI query results', async () => {
    // Arrange: class-scope teacher
    // Act: NL query with broad question "show all incidents this term"
    // Assert: AI query result only includes in-scope students
    // Assert: AI service receives only in-scope incident data in its context
  });

  it('scope applies to student profile endpoint', async () => {
    // Arrange: class-scope teacher, out-of-scope student
    // Act: GET /behaviour/students/:out_of_scope_student_id
    // Assert: 403
  });

  it('admin-scope user can see all students', async () => {
    // Arrange: user with scope='all' (deputy/principal)
    // Act: GET /behaviour/incidents
    // Assert: both in-scope and out-of-scope incidents present
  });

});
```

---

### 15.3 Status Projection Tests

**Purpose**: Verify that the `converted_to_safeguarding` status is correctly masked as `closed` for users without `safeguarding.view`, across all data surfaces.

```typescript
describe('Status Projection', () => {

  it('converted_to_safeguarding projected as closed for behaviour users', async () => {
    // Arrange: incident with status = 'converted_to_safeguarding'
    // Act: GET /behaviour/incidents/:id as teacher
    // Assert: response.status === 'closed'
    // Assert: response.status !== 'converted_to_safeguarding'
    // Assert: response does not contain any field referencing safeguarding
  });

  it('projected status in search index', async () => {
    // Arrange: incident with status = 'converted_to_safeguarding'
    // Act: check Meilisearch index document for this incident
    // Assert: indexed status === 'closed'
  });

  it('projected status in entity history for non-safeguarding users', async () => {
    // Arrange: incident transitioned to 'converted_to_safeguarding'
    // Act: GET /behaviour/incidents/:id/history as teacher
    // Assert: no history entry with status_value = 'converted_to_safeguarding'
    // Assert: history shows status change to 'closed'
  });

  it('projected status in parent notifications', async () => {
    // Arrange: incident converted to safeguarding
    // Act: check any queued parent notification for this incident
    // Assert: notification body references 'closed', not 'safeguarding'
    // Assert: notification is not sent at all for this incident (the conversion suppresses parent notification)
  });

  it('materialised view shows closed, not converted', async () => {
    // Act: query mv_student_behaviour_summary after an incident is converted
    // Assert: the view reflects the public status, not the internal status
  });

});
```

---

### 15.4 Parent-Safe Rendering Tests

**Purpose**: Verify the complete parent-safe rendering pipeline — content priority chain, locale fallback, field exclusions, guardian restrictions, and send-gate.

```typescript
describe('Parent-Safe Rendering', () => {

  it('parent portal never shows raw description field', async () => {
    // Arrange: incident with description = 'staff internal: student was disruptive'
    // Arrange: parent_description = null
    // Act: GET /parent/behaviour/incidents as parent
    // Assert: no response field contains 'staff internal: student was disruptive'
  });

  it('parent portal uses parent_description when available', async () => {
    // Arrange: incident with description = 'internal', parent_description = 'Your child received a verbal warning'
    // Act: GET /parent/behaviour/incidents
    // Assert: rendered content = 'Your child received a verbal warning'
  });

  it('parent portal falls back to template text when parent_description is null', async () => {
    // Arrange: incident created using description_template with text 'Student did not complete homework'
    // Arrange: parent_description = null
    // Act: GET /parent/behaviour/incidents
    // Assert: rendered content = 'Student did not complete homework' (template text from context_snapshot)
  });

  it('parent portal falls back to category name when both parent_description and template text are null', async () => {
    // Arrange: incident with parent_description = null, no template used
    // Arrange: category name = 'Verbal Warning'
    // Act: GET /parent/behaviour/incidents
    // Assert: rendered content = 'Verbal Warning' (category name only)
  });

  it('parent portal never shows attachments or their existence', async () => {
    // Arrange: incident with 3 attachments
    // Act: GET /parent/behaviour/incidents
    // Assert: no field in response references attachments, file counts, or file names
  });

  it('parent portal never shows other participant names', async () => {
    // Arrange: incident with 3 student participants
    // Act: GET /parent/behaviour/incidents as parent of participant 1
    // Assert: response contains only participant 1's child
    // Assert: names of participants 2 and 3 are absent from the entire response
  });

  it('parent notification respects send-gate severity', async () => {
    // Arrange: parent_notification_send_gate_severity = 3
    // Arrange: incident with severity = 5, parent_description = null, no template
    // Act: attempt to dispatch parent notification
    // Assert: notification NOT sent — blocked by send-gate
    // Assert: parent_notification_status = 'pending' (blocked, not failed)
  });

  it('parent notification allowed when send-gate cleared', async () => {
    // Arrange: incident with severity = 5, parent_description = 'Your child received a written warning'
    // Act: dispatch parent notification
    // Assert: notification sent successfully
    // Assert: notification body contains parent_description text, not internal description
  });

  it('guardian restriction blocks portal visibility', async () => {
    // Arrange: active guardian restriction with type = 'no_behaviour_visibility' for parent P + student S
    // Act: GET /parent/behaviour/incidents?student_id=S as parent P
    // Assert: response.data = [] (empty array, no error)
  });

  it('guardian restriction blocks notifications', async () => {
    // Arrange: active restriction with type = 'no_behaviour_notifications' for parent P + student S
    // Act: trigger parent notification for an incident involving student S, parent P
    // Assert: notification NOT dispatched to parent P
    // Assert: no behaviour_parent_acknowledgements row created for parent P + student S combination
  });

  it('guardian restriction respects effective_from date', async () => {
    // Arrange: restriction with effective_from = tomorrow
    // Act: check restriction today
    // Assert: restriction is NOT active today (effective_from not yet reached)
    // Assert: portal shows data normally
  });

  it('guardian restriction respects effective_until date', async () => {
    // Arrange: restriction with effective_until = yesterday
    // Act: check restriction today
    // Assert: restriction is expired (effective_until passed)
    // Assert: portal shows data normally
  });

  it('locale fallback: Arabic parent with null parent_description_ar falls back to English parent_description', async () => {
    // Arrange: parent with locale_preference = 'ar'
    // Arrange: incident with parent_description = 'English text', parent_description_ar = null
    // Act: GET /parent/behaviour/incidents
    // Assert: rendered content = 'English text'
  });

});
```

---

### 15.5 Safeguarding Isolation Tests

**Purpose**: Verify that safeguarding data is completely isolated from all behaviour-side surfaces and that break-glass access works correctly.

```typescript
describe('Safeguarding Isolation', () => {

  it('safeguarding_concern_incidents join is invisible from behaviour side', async () => {
    // Arrange: create safeguarding concern, link it to a behaviour incident
    // Act: GET /behaviour/incidents/:id as teacher without safeguarding.view
    // Assert: response does not contain any reference to the safeguarding concern
    // Assert: no field suggests the incident is linked to safeguarding
  });

  it('safeguarding entities are not in the Meilisearch search index', async () => {
    // Arrange: create safeguarding_concern with distinctive description text
    // Act: full-text search in Meilisearch for the concern description
    // Assert: 0 results
  });

  it('safeguarding fields never appear in AI prompts', async () => {
    // Arrange: incident linked to safeguarding concern; capture AI provider payloads
    // Act: trigger AI analysis of the incident
    // Assert: AI prompt payload does not contain the safeguarding concern ID, type, or description
    // Assert: prompt does not contain the words 'safeguarding', 'tusla', 'garda', 'referral'
  });

  it('safeguarding data never appears in materialised views', async () => {
    // Act: inspect mv_student_behaviour_summary for a student with a safeguarding concern
    // Assert: view contains only behaviour-domain aggregates
    // Assert: safeguarding concern count, status, or any safeguarding-specific field is absent
  });

  it('break-glass grants expire correctly', async () => {
    // Arrange: create break-glass grant with expires_at = now() + 1 second
    // Act: wait for expiry; trigger expiry cron
    // Assert: grant status = 'revoked'
    // Assert: notification sent to DLP and principal
    // Assert: after-action review task created
  });

  it('every safeguarding read creates an audit log entry', async () => {
    // Arrange: authenticate as DLP (safeguarding.view)
    // Act: GET /safeguarding/concerns/:id
    // Assert: audit_logs contains entry with resource_type = 'safeguarding_concern', resource_id = concern_id, action = 'read'
  });

  it('break-glass access log entries are tagged with break_glass context', async () => {
    // Arrange: create break-glass grant, access a concern during the grant window
    // Assert: audit_logs entries for that access have context = 'break_glass' and the grant ID
  });

  it('teacher without safeguarding.report cannot access /safeguarding/ routes', async () => {
    // Arrange: teacher without any safeguarding permission
    // Act: GET /safeguarding/concerns
    // Assert: 403
  });

  it('reporter cannot see concern detail — only acknowledgement status', async () => {
    // Arrange: teacher with safeguarding.report submits concern
    // Act: GET /safeguarding/my-reports
    // Assert: response contains acknowledgement status only
    // Assert: response does NOT contain concern description, investigation notes, or assigned DLP
  });

});
```

---

### 15.6 Idempotency & Dedup Tests

**Purpose**: Verify that all idempotency mechanisms work correctly — network retry safety, BullMQ retry safety, and compensating withdrawal cascades.

```typescript
describe('Idempotency and Dedup', () => {

  it('duplicate idempotency_key returns existing incident, no side effects re-executed', async () => {
    // Arrange: POST /behaviour/incidents/quick with idempotency_key = 'abc-123'
    // Arrange: incident created, policy evaluated, notification queued
    // Act: POST /behaviour/incidents/quick again with the same idempotency_key = 'abc-123'
    // Assert: HTTP 200 (not 201)
    // Assert: response body === original incident (same ID, same timestamps)
    // Assert: no new policy evaluation created (behaviour_policy_evaluations count unchanged)
    // Assert: no duplicate parent notification queued
    // Assert: points total unchanged (no duplicate points awarded)
  });

  it('policy evaluation not re-executed when incident creation is retried', async () => {
    // Arrange: incident created, policy evaluated (5 evaluation rows created)
    // Act: attempt to re-create with same idempotency_key
    // Assert: behaviour_policy_evaluations count for this incident remains at 5 (one per stage)
  });

  it('award not re-created on BullMQ worker retry', async () => {
    // Arrange: student at 49 points, incident gives 1 point (crosses 50-point threshold)
    // Arrange: behaviour:check-awards job runs
    // Act: simulate job retry (re-run the processor with same payload)
    // Assert: only one award created (triggered_by_incident_id dedup guard prevents duplicate)
  });

  it('parent notification not re-sent on BullMQ retry', async () => {
    // Arrange: parent notification sent (behaviour_parent_acknowledgements row exists, status = 'sent')
    // Act: behaviour:parent-notification job retried for same incident/parent
    // Assert: no second notification dispatched
    // Assert: behaviour_parent_acknowledgements count for this incident/parent = 1 (unchanged)
  });

  it('compensating withdrawal cascades correctly', async () => {
    // Arrange: quick-log creates incident, which triggers:
    //   - sanction (status = 'scheduled')
    //   - task (status = 'pending')
    //   - parent notification (status = 'pending', not yet sent)
    //   - award (if crossing threshold)
    // Act: POST /behaviour/incidents/:id/withdraw within the 30-second undo window
    // Assert: incident.status = 'withdrawn'
    // Assert: linked sanction.status = 'cancelled'
    // Assert: linked task.status = 'cancelled'
    // Assert: pending parent notification cancelled (not sent)
    // Assert: award.superseded_by_id set (if one was created within the undo window)
    // Assert: points total reflects the withdrawal (no net points change from the withdrawn incident)
  });

  it('withdrawal after notification sent triggers correction notice', async () => {
    // Arrange: incident created, parent notification already sent
    // Act: withdraw incident
    // Assert: incident.status = 'withdrawn'
    // Assert: behaviour_amendment_notices created with amendment_type = 'retraction'
    // Assert: correction notification queued (behaviour_correction_parent template)
  });

});
```

---

### 15.7 RLS Verification

**Purpose**: Verify that Row-Level Security provides tenant isolation for all 32 behaviour and safeguarding tables. Cross-tenant data access must be impossible at the database layer.

**Pattern** (applied to every table):

```typescript
describe('RLS: [table_name]', () => {

  it('tenant A cannot access tenant B data via direct query', async () => {
    // Step 1: Create record as Tenant A (tenant_id = tenantA.id)
    // Step 2: Set RLS context to Tenant B via SET LOCAL app.current_tenant_id = tenantB.id
    // Step 3: Query the table with no tenant_id filter
    // Assert: result set is empty — Tenant A's record is invisible to Tenant B
    // Assert: result is NOT an error — RLS returns empty, not forbidden
  });

  it('tenant B cannot count tenant A records', async () => {
    // Step 1: Create 5 records as Tenant A
    // Step 2: Set RLS context to Tenant B
    // Step 3: SELECT COUNT(*) FROM [table]
    // Assert: COUNT = 0
  });

});
```

**Tables requiring this pattern** (all 32):

Behaviour domain (25 tables):
- `behaviour_categories`
- `behaviour_incidents`
- `behaviour_incident_participants`
- `behaviour_sanctions`
- `behaviour_tasks`
- `behaviour_interventions`
- `behaviour_intervention_incidents`
- `behaviour_intervention_reviews`
- `behaviour_recognition_awards`
- `behaviour_award_types`
- `behaviour_house_teams`
- `behaviour_house_memberships`
- `behaviour_description_templates`
- `behaviour_alerts`
- `behaviour_alert_recipients`
- `behaviour_parent_acknowledgements`
- `behaviour_entity_history`
- `behaviour_publication_approvals`
- `behaviour_appeals`
- `behaviour_amendment_notices`
- `behaviour_exclusion_cases`
- `behaviour_documents`
- `behaviour_document_templates`
- `behaviour_guardian_restrictions`
- `behaviour_attachments`

Policy engine (4 tables):
- `behaviour_policy_rules`
- `behaviour_policy_rule_actions`
- `behaviour_policy_rule_versions`
- `behaviour_policy_evaluations`
- `behaviour_policy_action_executions`

Safeguarding (3 tables):
- `safeguarding_concerns`
- `safeguarding_actions`
- `safeguarding_concern_incidents`
- `safeguarding_break_glass_grants`

Hardening (1 table, Phase H):
- `behaviour_legal_holds`

**Total**: At minimum one cross-tenant isolation test per table. Test runner should report per-table results separately.

---

## Scale Strategy (Section 7)

### 7.1 Growth Estimates

Per school (30 teachers, 500 students, active usage):
- ~50 incidents/week → ~2,000/year
- ~2,000 incident participants/year
- ~2,000 entity history records/year
- ~10,000 policy evaluations/year (5 stages × 2,000 incidents)
- ~5,000 policy action executions/year
- ~1,000 tasks/year
- ~500 alerts/year
- ~1,000 parent acknowledgements/year

Per ETB (15 schools, 5 years): ~150,000 incidents, ~750,000 policy evaluations, ~75,000 entity history records.

These are the primary drivers of table growth. Index and partition decisions are sized against these estimates.

### 7.2 Partitioning Strategy

The following high-volume append-only tables are range-partitioned by `created_at`. Core operational tables (`behaviour_incidents`, `behaviour_sanctions`, `behaviour_tasks`, etc.) are **NOT partitioned** — they require cross-date indexes and their volume is manageable with correct indexing.

| Table | Partition Strategy | Partition Key | Partition Size |
|-------|-------------------|---------------|----------------|
| `behaviour_entity_history` | Monthly range on `created_at` | `created_at` | Same pattern as existing `audit_logs` table |
| `behaviour_policy_evaluations` | Monthly range on `created_at` | `created_at` | High volume (10,000+/year per school) |
| `behaviour_policy_action_executions` | Monthly range on `created_at` | `created_at` | |
| `behaviour_parent_acknowledgements` | Monthly range on `created_at` | `created_at` | Append-only communication log |
| `behaviour_alerts` | Yearly range on `created_at` | `created_at` | Lower volume (~500/year) |
| `behaviour_alert_recipients` | Yearly range on `created_at` | `created_at` | |

**Implementation notes**:

Prisma has limited native partition support. Partitioned tables are created via raw SQL in dedicated migration files:

```sql
-- Example: behaviour_entity_history partitioned table
CREATE TABLE behaviour_entity_history (
  -- all columns --
) PARTITION BY RANGE (created_at);

CREATE TABLE behaviour_entity_history_2025_01
  PARTITION OF behaviour_entity_history
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- etc for each month
```

**Partition management cron** (`behaviour:partition-maintenance`): A dedicated worker job runs monthly (first of month, 00:00 UTC) and creates the next 3 months of partitions for each partitioned table. This prevents insert failures when a new month arrives with no pre-created partition. The job uses raw SQL `CREATE TABLE IF NOT EXISTS ... PARTITION OF ...`. This job is not tenant-aware (it manages schema, not tenant data) and runs as the DB superuser.

**Existing indexes on partitioned tables** continue to work — PostgreSQL automatically creates the index on each partition. Foreign keys into partitioned tables require the partitioned column to be part of the FK, which is satisfied since all partitioned tables include `tenant_id` in every relevant FK.

### 7.3 Archival & Compaction

- Annual archival worker (Section 6.3 above) marks stale records as `archived` — no data deleted, no PII removed. Records simply excluded from default queries.
- Materialised views refresh with `CONCURRENTLY` to avoid read locks. Refresh times staggered (see 7.5 below).
- Meilisearch index pruned of `archived` and `anonymised` records during the archival pass. Reduces memory footprint.
- Redis cache entries for archived/anonymised students have their TTL set to 0 (immediate expiry) during the archival pass.

### 7.4 Index Maintenance

- **`REINDEX CONCURRENTLY`**: Scheduled monthly on the first Sunday of each month at 03:00 UTC for high-write tables: `behaviour_incidents`, `behaviour_incident_participants`, `behaviour_entity_history`, `behaviour_policy_evaluations`. Concurrent reindex does not lock reads or writes.
- **Partial indexes**: All tables with `retention_status` columns use partial indexes on `retention_status = 'active'` since the vast majority of operational queries filter on active records. This keeps index size proportional to live data, not total historical data.
- **Unused index monitoring**: `pg_stat_user_indexes` queried monthly by the partition maintenance job. Indexes with `idx_scan = 0` over 30 days are flagged in an admin notification for review and potential removal in the next quarterly maintenance window.

### 7.5 Export & View Refresh

- **Materialised view refresh**: All three views refreshed with `REFRESH MATERIALIZED VIEW CONCURRENTLY` — no read locks during refresh.
- **Staggered refresh schedule to avoid contention**:
  - `mv_student_behaviour_summary`: every 15 minutes (operational view, used in dashboards)
  - `mv_behaviour_exposure_rates`: nightly at 02:00 UTC (joins to scheduling data, heavier query)
  - `mv_behaviour_benchmarks`: nightly at 03:00 UTC (ETB panel view, cross-tenant aggregates)
- **Large PDF exports** (board packs, safeguarding case files): generated async via BullMQ, not in request cycle. The export endpoint returns `{ job_id }` immediately; the client polls `GET /admin/jobs/:jobId` for completion.
- **Export job limits**: 120 second timeout, 512MB memory limit (configurable per job type in BullMQ worker config).

### 7.6 Dead-Letter & Queue Health

- **Dead-letter threshold**: 3 retries with exponential backoff (1s, 4s, 16s) before a job is moved to failed/dead-letter.
- **Dead-letter monitoring**: `GET v1/behaviour/admin/health` returns dead-letter queue depth. An alert (`behaviour_alerts` record with `alert_type = 'policy_threshold_breach'`, severity = 'warning') is auto-created when dead-letter depth > 10.
- **Stale job reaper**: Jobs that remain in the `active` state for more than 24 hours (indicating a crashed worker) are forcibly moved to `failed`. The reaper runs as part of the `behaviour:partition-maintenance` monthly job.
- **Queue health endpoint** (`GET /admin/health`) returns per-queue depths for all behaviour and notification queues, along with the dead-letter depth, cache hit rates, materialised view freshness timestamps, and the attachment scan backlog (files pending ClamAV scan for > 5 minutes).

---

## Acceptance Criteria

1. `behaviour_legal_holds` table exists with all columns, RLS policy, and both indexes.
2. `LegalHoldService.createHold()` creates the hold record, propagates to all linked entities, and logs `legal_hold_set` in entity history.
3. `LegalHoldService.releaseHold()` sets `status = 'released'`, logs `legal_hold_released`, and does NOT cascade-release propagated holds unless `releaseLinked = true`.
4. The retention worker, when run against an entity with an active legal hold, skips that entity and logs the hold reason in its output.
5. All 14 admin operations endpoints return 404/400 for invalid inputs; require `behaviour.admin`; return a 403 for non-admin users.
6. All destructive admin operations support the preview/execute pattern — calling `/preview` returns an impact summary without making changes.
7. Operations requiring dual approval when `admin_destructive_ops_dual_approval = true` do not execute until the second approval is granted.
8. The `/settings/behaviour-admin` page renders all 5 tabs; health tab shows live queue depths; retention tab lists active legal holds.
9. `behaviour:retention-check` with `dry_run = true` returns a structured JSON summary and makes 0 DB changes.
10. `behaviour:retention-check` marks eligible records as `archived`, then marks archived-and-past-deadline records as `anonymised`, and skips any entity with an active legal hold.
11. Anonymised records have PII fields replaced (student name → `"Student-[hash]"`, free text → `"[Archived content]"`) and their Meilisearch index entry is deleted.
12. All 7 release-gate test suites pass with 0 failures.
13. The partition management cron creates next-month partitions for all 6 partitioned tables.
14. RLS verification tests confirm 0 cross-tenant data leakage across all 32 tables.

---

## Test Requirements

### Unit Tests

- `LegalHoldService.createHold()` — verify hold creation, propagation cascade to all linked entity types
- `LegalHoldService.releaseHold()` — verify status update, verify propagated holds are NOT released without `releaseLinked`
- `LegalHoldService.propagateHold()` — test each anchor entity type's propagation rules independently
- `BehaviourRetentionWorker.processEntity()` — test archival logic, anonymisation logic, legal hold skip logic, dry-run mode

### Integration Tests

- `GET /admin/health` — returns correct shape with all required fields
- `POST /admin/retention/preview` — returns non-zero counts when eligible records exist; returns 0 when no records eligible
- `POST /admin/recompute-points?preview=true` — returns impact without DB changes
- `POST /admin/reindex-search` — blocked by dual approval (returns 202 with approval_request_id)

### Release-Gate Tests (the 7 suites above)

Run as part of CI pipeline. All 7 suites must pass before any behaviour module tag is deployed to production:

```bash
# In package.json test script
turbo test --filter=api -- --testPathPattern="behaviour.*release-gate"
```

Test files:
- `apps/api/src/modules/behaviour/tests/release-gate/15-1-data-classification.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-2-scope-enforcement.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-3-status-projection.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-4-parent-safe-rendering.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-5-safeguarding-isolation.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-6-idempotency-dedup.spec.ts`
- `apps/api/src/modules/behaviour/tests/release-gate/15-7-rls-verification.spec.ts`

### Scale Tests (run against staging, not CI)

- Insert 50,000 incidents for a single tenant; verify list endpoint responds in < 500ms with index on `(tenant_id, occurred_at DESC)`
- Insert 250,000 policy evaluations (partitioned); verify COUNT query across partitions completes in < 2s
- Trigger materialised view refresh under concurrent read load; verify no query errors (CONCURRENTLY verified)
- Confirm partition management cron creates correct partitions and they accept inserts
