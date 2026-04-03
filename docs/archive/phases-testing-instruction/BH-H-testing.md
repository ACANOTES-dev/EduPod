# Phase H: Hardening + Ops + Scale — Testing Instructions

## Unit Tests (20 tests)

### LegalHoldService (10 tests)

- `createHold` — creates hold and logs entity history
- `createHold` — returns existing hold on duplicate legal_basis (idempotent)
- `createHold` — propagates hold to linked sanctions and tasks for incident
- `createHold` — does NOT propagate when propagate=false
- `releaseHold` — releases hold and logs entity history
- `releaseHold` — idempotent for already-released holds
- `releaseHold` — throws NotFoundException for non-existent hold
- `releaseHold` — releases linked holds when releaseLinked=true
- `hasActiveHold` — returns held=true when active hold exists
- `hasActiveHold` — returns held=false when no active hold
- `listHolds` — returns paginated holds

### AdminService (10 tests)

- `getHealth` — returns health data with correct shape
- `listDeadLetterJobs` — returns failed jobs sorted by date
- `listDeadLetterJobs` — returns empty array when no failed jobs
- `recomputePointsPreview` — returns preview for student scope
- `recomputePointsPreview` — returns preview for tenant scope with warning
- `recomputePoints` — deletes Redis cache for single student
- `recomputePulse` — invalidates pulse cache key
- `retentionPreview` — returns retention counts
- `retentionExecute` — enqueues retention job

## Release-Gate Tests (129 tests across 7 suites)

### 15.1 Data Classification (10 tests)

- STAFF-scope user never receives SENSITIVE fields
- PARENT-scope user never receives STAFF fields
- Non-safeguarding user never sees converted_to_safeguarding status
- Safeguarding user can see converted_to_safeguarding status
- AI prompt never contains SENSITIVE fields
- Parent notification never contains internal description
- Hover card preview contains only STAFF-class fields

### 15.2 Scope Enforcement (9 tests)

- class-scope teacher only sees incidents for students in their classes
- year_group-scope year head only sees their year groups
- own-scope teacher only sees incidents they logged
- scope applies to student profile endpoint
- admin-scope user can see all students

### 15.3 Status Projection (5 tests)

- converted_to_safeguarding projected as closed for behaviour users
- safeguarding user sees real status
- projected status in entity history for non-safeguarding users

### 15.4 Parent-Safe Rendering (12 tests)

- parent portal never shows raw description field
- parent portal uses parent_description when available
- parent portal falls back to template text when parent_description is null
- parent portal falls back to category name when both are null
- parent portal never shows other participant names
- parent notification respects send-gate severity
- parent notification allowed when parent_description is provided
- guardian restriction blocks portal visibility
- guardian restriction respects effective_from date
- guardian restriction respects effective_until date
- Arabic parent with null parent_description_ar falls back to English

### 15.5 Safeguarding Isolation (9 tests)

- safeguarding_concern_incidents join is invisible from behaviour side
- safeguarding entities are not in Meilisearch search index
- safeguarding fields never appear in AI prompts
- break-glass grants expire correctly
- every safeguarding read creates audit log entry
- teacher without safeguarding.report cannot access /safeguarding/ routes

### 15.6 Idempotency & Dedup (11 tests)

- duplicate idempotency_key returns existing incident, no side effects re-executed
- policy evaluation not re-executed when incident creation is retried
- award not re-created on BullMQ worker retry
- parent notification not re-sent on BullMQ retry
- compensating withdrawal cascades correctly
- withdrawal after notification sent triggers correction notice

### 15.7 RLS Verification (73 tests — 2 per table + extras)

- One cross-tenant isolation test per table (33 tables)
- One count verification test per table

## Manual QA Checklist

### Admin Dashboard

- [ ] Navigate to `/settings/behaviour-admin` — page loads with 5 tabs
- [ ] System Health tab shows queue depths, dead-letter count, cache rate, view freshness
- [ ] Dead-Letter tab shows "No failed jobs — all queues healthy" when empty
- [ ] Operations tab: click "Preview Impact" on Recompute Points — modal shows counts
- [ ] Operations tab: execute Recompute Pulse — success message
- [ ] Scope Audit tab: enter a user ID — shows scope level and student count
- [ ] Retention tab: click "Preview Next Run" — shows archive/anonymise counts
- [ ] Retention tab: legal holds list shows any active holds

### Legal Holds

- [ ] Create a legal hold on an incident — verify propagation creates holds on linked sanctions/tasks
- [ ] Release the legal hold — verify status changes to released
- [ ] Release with releaseLinked=true — verify all linked holds released

### Retention Worker (dry-run only)

- [ ] Trigger retention preview — verify counts are reasonable
- [ ] Verify dry-run mode makes no DB changes

## Run Commands

```bash
# Unit tests only
npx turbo test --filter=@school/api -- --testPathPattern="behaviour-legal-hold|behaviour-admin"

# Release-gate tests only
npx turbo test --filter=@school/api -- --testPathPattern="release-gate"

# All behaviour tests
npx turbo test --filter=@school/api -- --testPathPattern="behaviour"
```
