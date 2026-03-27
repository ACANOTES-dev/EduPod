# SW-2D: Behaviour Facade & Escalation

---
name: Behaviour Facade & Escalation
description: Refactor behaviour safeguarding service to delegate CP record creation to pastoral CpRecordService (facade pattern, controller unchanged), wire behaviour-pastoral cross-references, complete escalation timeout system from SW-1E, resolve module dependency wiring.
phase: 2
sub_phase: D
dependencies: [SW-1C, SW-1E]
status: NOT STARTED
---

## What this sub-phase delivers

1. **Behaviour Safeguarding Facade** -- the existing `safeguarding.service.ts` in the behaviour module is refactored so that methods creating or updating safeguarding records delegate to the pastoral `CpRecordService`. The existing `safeguarding.controller.ts` is untouched -- same endpoints, same request/response shape, same permissions. Staff who log safeguarding concerns from a behaviour incident keep their existing workflow.

2. **Behaviour-Pastoral Cross-Reference** -- when a behaviour incident is flagged as safeguarding, the facade creates both a `pastoral_concern` (tier=3, category='child_protection', `behaviour_incident_id` set) and a `cp_record` linked to that concern. Immutable audit events record both. Student chronology shows the connection.

3. **Escalation Timeout Wiring** -- the Phase 2 completion of the escalation system started in SW-1E. Tenant-level escalation timeout configuration, admin endpoint for escalation settings, dashboard indicator for unacknowledged urgent/critical concerns.

4. **Module Dependency Wiring** -- `BehaviourModule` imports `ChildProtectionModule` (for `CpRecordService`) with a clean one-directional dependency. No circular imports.

---

## Prerequisites

| Dependency | What must exist | Verified by |
|---|---|---|
| SW-1A | `app.current_user_id` globally in RLS context; immutability triggers; `pastoral_events` table | RLS middleware sets both IDs |
| SW-1B | `pastoral_concerns` table operational; `ConcernService.create()` functional | Concerns can be created with all fields |
| SW-1C | `cp_records` table with dual RLS; `CpRecordService` in `ChildProtectionModule` operational and exported; `cp_access_grants` table; `CpAccessService` functional | CP records can be created and are isolated by `app.current_user_id` RLS |
| SW-1E | `PastoralNotificationService` operational; `pastoral:notify-concern` job processor; `pastoral:escalation-timeout` delayed job enqueue at concern creation | Notification tiering and basic escalation job exist |
| Existing | Behaviour module fully operational (Phases A-H); `SafeguardingService`, `SafeguardingController`, `SafeguardingBreakGlassService` in `apps/api/src/modules/behaviour/` | All behaviour safeguarding endpoints functional |

---

## Part 1: Behaviour Safeguarding Facade

### Current state (before SW-2D)

The behaviour module's `SafeguardingService` (`apps/api/src/modules/behaviour/safeguarding.service.ts`) directly writes to:
- `safeguardingConcern` table (Prisma model) -- creates safeguarding concern records
- `safeguardingAction` table -- creates action log entries
- `safeguardingConcernIncident` table -- links concerns to behaviour incidents
- `behaviourIncident` table -- updates incident status to `converted_to_safeguarding`

Key methods that create safeguarding data:
- `reportConcern()` -- creates a new safeguarding concern with SLA tracking, concern number, retention date, DLP notification
- `updateConcern()` -- updates concern fields (description, type, severity, actions taken)
- `transitionStatus()` -- moves concern through status lifecycle (reported -> acknowledged -> under_investigation -> referred -> monitoring -> resolved -> sealed)
- `assignConcern()` -- assigns concern to a staff member
- `recordAction()` -- logs an action against a concern
- `recordTuslaReferral()` -- creates a Tusla referral action
- `recordGardaReferral()` -- creates a Garda referral action
- `initiateSeal()` / `approveSeal()` -- seals a concern with dual approval

The `SafeguardingBreakGlassService` (`safeguarding-break-glass.service.ts`) grants/manages emergency access by querying:
- `safeguardingBreakGlassGrant` table
- `safeguardingConcern` table (to log against concerns)
- `safeguardingAction` table

### Target state (after SW-2D)

**Controller: NO CHANGES.** `SafeguardingController` keeps all 16 endpoints. Same routes, same permissions, same Zod schemas, same response shapes. Zero UX disruption.

**Service: FACADE REFACTOR.** `SafeguardingService.reportConcern()` is modified to additionally delegate to `CpRecordService` and `ConcernService` for new safeguarding data, while continuing to write to the existing behaviour tables for backward compatibility.

**Break-Glass Service: DUAL SOURCE.** `SafeguardingBreakGlassService.checkEffectivePermission()` is extended to check both the old `safeguardingBreakGlassGrant` table AND the new pastoral `cp_access_grants` table.

### Facade method changes (before -> after)

#### `reportConcern()` -- the primary change

**Before:**
```
1. Load behaviour settings
2. Generate concern number (sequence: 'safeguarding_concern', prefix 'CP')
3. Compute SLA deadline
4. Compute retention_until from student DOB
5. Create safeguardingConcern record
6. Create safeguardingAction (status_changed -> 'reported')
7. Link to behaviour incident if provided
8. Notify DLP
9. Enqueue critical escalation if severity = critical
10. Write audit log
11. Return { id, concern_number, status }
```

**After:**
```
1-6: UNCHANGED -- existing behaviour safeguarding record still created for backward compatibility

7. Link to behaviour incident if provided -- UNCHANGED

-- NEW STEPS (facade delegation) --
8. Create pastoral_concern via ConcernService.create():
   - tier: 3
   - category: 'child_protection'
   - severity: map from dto.severity (low->routine, medium->elevated, high->urgent, critical->critical)
   - behaviour_incident_id: dto.incident_id (if provided)
   - logged_by_user_id: userId
   - occurred_at: now()
   - narrative: dto.description
   - actions_taken: dto.immediate_actions_taken
   This generates:
   - pastoral_concern row with tier=3 (auto-triggers Tier 3 RLS policy)
   - pastoral_concern_version row (version 1)
   - pastoral_event: concern_created with source='behaviour_safeguarding'
   - Auto-triggers cp_category escalation trigger (sets tier=3)

9. Create cp_record via CpRecordService.create():
   - concern_id: the pastoral_concern.id from step 8
   - student_id: dto.student_id
   - record_type: 'concern'
   - narrative: dto.description
   - logged_by_user_id: userId
   This generates:
   - cp_record row (protected by dual RLS)
   - pastoral_event: cp_record_created

10. Store cross-reference: save the pastoral_concern.id on the safeguardingConcern
    record (new column: pastoral_concern_id UUID FK -> pastoral_concerns(id), nullable).
    This enables the student chronology to show the link.

11. Notify DLP -- UNCHANGED
12. Enqueue critical escalation -- UNCHANGED (now also covered by pastoral escalation from SW-1E)
13. Write audit log -- UNCHANGED (behaviour audit log)
14. Return { id, concern_number, status } -- UNCHANGED response shape
```

**Error handling:** If the pastoral/CP delegation fails:
- Log the error (do not swallow)
- The behaviour safeguarding record IS still created (the existing data path is primary)
- Enqueue a retry job `pastoral:sync-behaviour-safeguarding` with the behaviour concern ID for later retry
- This ensures the behaviour UX is never blocked by pastoral module issues during the transition

#### `updateConcern()`, `transitionStatus()`, `assignConcern()` -- read-through

These methods continue to operate on `safeguardingConcern` rows. If the concern has a `pastoral_concern_id`, updates are propagated to the pastoral concern:
- `updateConcern()`: if description changes, create a new `pastoral_concern_version` via `ConcernVersionService`
- `transitionStatus()`: propagate status change to the pastoral concern (mapped: reported->routine, acknowledged->routine, under_investigation->elevated, referred->elevated, monitoring->monitoring, resolved->resolved, sealed->resolved)
- `assignConcern()`: no pastoral propagation needed (assignment is a behaviour-specific concept)

Propagation failures are logged and retried via `pastoral:sync-behaviour-safeguarding` job, never blocking the behaviour operation.

#### `recordTuslaReferral()`, `recordGardaReferral()` -- propagate to CP

If the safeguarding concern has a `pastoral_concern_id` and linked `cp_record`:
- `recordTuslaReferral()`: update the `cp_record.mandated_report_status` to `'submitted'` and set `mandated_report_ref`
- `recordGardaReferral()`: create a `pastoral_event` with event_type `'agency_referred'`

#### `checkEffectivePermission()` -- dual source

**Before:**
```
1. Check RBAC for safeguarding.view permission
2. Check safeguardingBreakGlassGrant table for active grant
3. Return { allowed, context }
```

**After:**
```
1. Check RBAC for safeguarding.view permission -- UNCHANGED
2. Check safeguardingBreakGlassGrant table -- UNCHANGED
3. NEW: If steps 1-2 deny, also check cp_access_grants table for an active grant
4. Return { allowed, context: 'normal' | 'break_glass' | 'cp_access_grant' }
```

---

## Part 2: Database changes

### Schema change -- add cross-reference column

Add to `safeguarding_concerns` table:

```
pastoral_concern_id  UUID FK -> pastoral_concerns(id) -- NULL for pre-facade concerns
```

This is a nullable FK. All existing rows have `NULL`. New concerns created via the facade get the pastoral concern ID.

**Migration name:** `add_pastoral_concern_id_to_safeguarding_concerns`

**Index:** `(pastoral_concern_id)` WHERE `pastoral_concern_id IS NOT NULL` -- partial index for cross-reference lookups.

### No data migration

Per master spec decision #12: existing behaviour safeguarding data stays in behaviour tables. No migration of old rows to pastoral tables. Old data remains read-only via existing behaviour endpoints.

---

## Part 3: Behaviour-Pastoral Cross-Reference

When a behaviour incident is flagged as safeguarding (via `SafeguardingService.reportConcern()` with `dto.incident_id`), the facade creates:

1. A `pastoral_concern` with:
   - `tier = 3`
   - `category = 'child_protection'`
   - `behaviour_incident_id = dto.incident_id`
   - Severity mapped from behaviour severity
   - Full narrative from `dto.description`

2. A `cp_record` linked to that concern:
   - `concern_id = pastoral_concern.id`
   - `record_type = 'concern'`
   - Full narrative

3. Immutable audit events:
   - `concern_created` with `payload.source = 'behaviour_safeguarding'` and `payload.behaviour_incident_id`
   - `cp_record_created`

4. The `safeguardingConcern.pastoral_concern_id` stores the cross-reference.

**Student chronology impact:** When the student chronology (from SW-1D) is rendered:
- Pastoral events include the `concern_created` event with `behaviour_incident_id` in payload
- The UI can display: "Behaviour incident #X triggered a safeguarding concern"
- No new query is needed -- the payload already contains the link

---

## Part 4: Escalation Timeout Wiring

### Context

SW-1E delivers the basic escalation system:
- `PastoralNotificationService` dispatches tiered notifications at concern creation
- A `pastoral:escalation-timeout` delayed BullMQ job is enqueued when a concern is created
- The job checks `acknowledged_at` and auto-escalates severity if the timeout has elapsed

SW-2D completes the escalation system with:

### Tenant-level escalation settings

Added to the `pastoral` section of `tenant_settings.settings` JSONB:

```typescript
// In pastoral settings schema
escalation_urgent_timeout_minutes: z.number().int().min(15).max(1440).default(120),
  // Default: 2 hours. If urgent concern not acknowledged, escalate to critical.

escalation_critical_timeout_minutes: z.number().int().min(5).max(480).default(30),
  // Default: 30 minutes. If critical concern not acknowledged, send second notification round.

escalation_enabled: z.boolean().default(true),
  // Master switch. When false, no auto-escalation occurs.

escalation_urgent_recipients: z.array(z.string().uuid()).default([]),
  // Override recipient list for urgent escalations. Empty = use defaults (DLP + deputy principal).

escalation_critical_recipients: z.array(z.string().uuid()).default([]),
  // Override recipient list for critical escalations. Empty = use defaults (DLP + principal).
```

### Admin endpoints for escalation settings

These are added to the existing pastoral settings controller (or a new admin section if one does not exist yet):

| # | Method | Route | Permission | Request | Response |
|---|--------|-------|-----------|---------|----------|
| 1 | GET | `v1/pastoral/admin/escalation-settings` | `pastoral.manage_sst` | -- | Current escalation settings |
| 2 | PATCH | `v1/pastoral/admin/escalation-settings` | `pastoral.manage_sst` | `updateEscalationSettingsSchema` | Updated settings |
| 3 | GET | `v1/pastoral/admin/escalation-dashboard` | `pastoral.view_tier2` | -- | Unacknowledged concern counts |

### Escalation dashboard response

```typescript
export interface EscalationDashboard {
  unacknowledged_urgent: number;
  unacknowledged_critical: number;
  oldest_unacknowledged_urgent: {
    concern_id: string;
    created_at: string;
    minutes_elapsed: number;
  } | null;
  oldest_unacknowledged_critical: {
    concern_id: string;
    created_at: string;
    minutes_elapsed: number;
  } | null;
  escalations_last_7d: number;
  escalations_last_30d: number;
}
```

### Escalation timeout job enhancement

The `pastoral:escalation-timeout` job processor (created in SW-1E) is enhanced:

**Before (SW-1E):** Basic check -- if `acknowledged_at` is NULL and timeout elapsed, escalate.

**After (SW-2D):**
1. Load tenant escalation settings (timeout durations, enabled flag, recipient overrides)
2. If `escalation_enabled = false`, no-op and return
3. For urgent concerns past `escalation_urgent_timeout_minutes`:
   - Update severity from `'urgent'` to `'critical'`
   - Write `concern_auto_escalated` audit event with `{ reason: 'unacknowledged_timeout', timeout_minutes }`
   - Dispatch critical-tier notifications (to `escalation_critical_recipients` or defaults)
4. For critical concerns past `escalation_critical_timeout_minutes`:
   - Write `critical_concern_unacknowledged` audit event with `{ minutes_elapsed, notification_round: 2 }`
   - Send second notification round to principal (if not already the DLP)
   - Do NOT re-escalate severity (already at maximum)

### Zod schema for escalation settings

```typescript
export const updateEscalationSettingsSchema = z.object({
  escalation_enabled: z.boolean().optional(),
  escalation_urgent_timeout_minutes: z.number().int().min(15).max(1440).optional(),
  escalation_critical_timeout_minutes: z.number().int().min(5).max(480).optional(),
  escalation_urgent_recipients: z.array(z.string().uuid()).optional(),
  escalation_critical_recipients: z.array(z.string().uuid()).optional(),
});
```

---

## Part 5: Module Dependency Wiring

### Dependency direction

```
BehaviourModule --imports--> ChildProtectionModule (for CpRecordService)
BehaviourModule --imports--> PastoralModule (for ConcernService, ConcernVersionService)

ChildProtectionModule --imports--> PastoralModule (for linking concerns)
ChildProtectionModule does NOT import BehaviourModule (no circular dependency)

PastoralModule does NOT import BehaviourModule (reads behaviour data via shared student_id, not module import)
```

### How to wire it

In `behaviour.module.ts`:

```typescript
@Module({
  imports: [
    // ... existing imports ...
    ChildProtectionModule, // for CpRecordService
    PastoralModule,        // for ConcernService, ConcernVersionService
  ],
  // ...
})
export class BehaviourModule {}
```

In `SafeguardingService`:

```typescript
@Injectable()
export class SafeguardingService {
  constructor(
    // ... existing dependencies ...
    private readonly cpRecordService: CpRecordService,       // from ChildProtectionModule
    private readonly concernService: ConcernService,         // from PastoralModule
    private readonly concernVersionService: ConcernVersionService, // from PastoralModule
    private readonly pastoralEventService: PastoralEventService,   // from PastoralModule
  ) {}
  // ...
}
```

### Circular dependency prevention

If `PastoralModule` needs to read behaviour data for cross-referencing (e.g., the student chronology showing behaviour incidents), it does so via:
- Direct Prisma queries against `behaviourIncident` table (which is a shared table within the same database)
- NOT via importing `BehaviourModule` or `BehaviourService`

This keeps the dependency tree acyclic:
```
BehaviourModule -> ChildProtectionModule -> PastoralModule -> [no behaviour import]
```

If a future need arises for PastoralModule to call BehaviourService methods, use `forwardRef()`:
```typescript
// Only if genuinely needed -- prefer direct Prisma queries
@Inject(forwardRef(() => BehaviourService))
private readonly behaviourService: BehaviourService;
```

But the current design avoids this entirely.

### ChildProtectionModule exports

`ChildProtectionModule` must export `CpRecordService` for the behaviour facade:

```typescript
@Module({
  // ...
  exports: [CpRecordService, CpAccessService],
})
export class ChildProtectionModule {}
```

### PastoralModule exports

`PastoralModule` must export the services needed by the behaviour facade:

```typescript
@Module({
  // ...
  exports: [
    ConcernService,
    ConcernVersionService,
    PastoralEventService,
    // ... other exports as needed by Phase 2+ sub-phases ...
  ],
})
export class PastoralModule {}
```

---

## BullMQ jobs

| Job name | Queue | Trigger | Description |
|---|---|---|---|
| `pastoral:sync-behaviour-safeguarding` | `pastoral` | Facade delegation failure | Retry pastoral/CP record creation for a behaviour safeguarding concern whose delegation failed |
| `pastoral:escalation-timeout` | `pastoral` | Enhanced in this phase | Now reads tenant escalation settings; respects enabled flag and custom timeouts/recipients |

---

## Audit events generated

| Event type | Entity type | Trigger | Payload |
|---|---|---|---|
| `concern_created` | `concern` | Facade creates pastoral concern | Standard payload with `source: 'behaviour_safeguarding'`, `behaviour_incident_id` |
| `cp_record_created` | `cp_record` | Facade creates CP record | `{ cp_record_id, concern_id, student_id, record_type: 'concern' }` |
| `concern_auto_escalated` | `concern` | Escalation timeout fires | `{ concern_id, old_severity, new_severity, reason: 'unacknowledged_timeout', timeout_minutes }` |
| `critical_concern_unacknowledged` | `concern` | Critical timeout fires | `{ concern_id, severity, minutes_elapsed, notification_round: 2 }` |

---

## Test requirements

### Facade integration tests

| # | Test | File | Description |
|---|------|------|-------------|
| 1 | `safeguarding.service.spec.ts` (additions) | Facade happy path | `reportConcern()` creates BOTH safeguardingConcern AND pastoral_concern AND cp_record |
| 2 | `safeguarding.service.spec.ts` (additions) | Cross-reference stored | `safeguardingConcern.pastoral_concern_id` is set to the pastoral concern ID |
| 3 | `safeguarding.service.spec.ts` (additions) | Pastoral concern has correct tier | Created pastoral_concern has `tier = 3` |
| 4 | `safeguarding.service.spec.ts` (additions) | Pastoral concern has behaviour_incident_id | When `dto.incident_id` is provided, pastoral_concern.behaviour_incident_id is set |
| 5 | `safeguarding.service.spec.ts` (additions) | CP record linked to pastoral concern | `cp_record.concern_id` matches the pastoral concern ID |
| 6 | `safeguarding.service.spec.ts` (additions) | Audit events emitted | `concern_created` event has `source: 'behaviour_safeguarding'`; `cp_record_created` event exists |
| 7 | `safeguarding.service.spec.ts` (additions) | Severity mapping | Behaviour `low` -> pastoral `routine`; `medium` -> `elevated`; `high` -> `urgent`; `critical` -> `critical` |
| 8 | `safeguarding.service.spec.ts` (additions) | Delegation failure graceful | If CpRecordService.create() throws, safeguardingConcern is still created, retry job is enqueued |
| 9 | `safeguarding.service.spec.ts` (additions) | Response shape unchanged | `reportConcern()` returns same `{ data: { id, concern_number, status } }` shape |
| 10 | `safeguarding.service.spec.ts` (additions) | Controller unchanged | All 16 safeguarding controller endpoints still resolve to the same service methods |

### Break-glass dual source tests

| # | Test | Description |
|---|------|-------------|
| 11 | `safeguarding-break-glass.service.spec.ts` (additions) | User with `cp_access_grants` active grant can access safeguarding concerns via `checkEffectivePermission()` |
| 12 | `safeguarding-break-glass.service.spec.ts` (additions) | User with behaviour break-glass grant still has access (backward compatibility) |
| 13 | `safeguarding-break-glass.service.spec.ts` (additions) | User with neither grant type is denied |

### Update propagation tests

| # | Test | Description |
|---|------|-------------|
| 14 | `safeguarding.service.spec.ts` (additions) | `updateConcern()` with description change creates new pastoral_concern_version |
| 15 | `safeguarding.service.spec.ts` (additions) | `transitionStatus()` to 'resolved' propagates to pastoral concern |
| 16 | `safeguarding.service.spec.ts` (additions) | Propagation failure does not block behaviour update |

### Escalation tests

| # | Test | Description |
|---|------|-------------|
| 17 | `escalation-timeout.processor.spec.ts` (additions) | Urgent concern unacknowledged after configured timeout -> severity escalated to critical |
| 18 | `escalation-timeout.processor.spec.ts` (additions) | Critical concern unacknowledged -> second notification sent, audit event recorded |
| 19 | `escalation-timeout.processor.spec.ts` (additions) | Acknowledged concern -> no escalation |
| 20 | `escalation-timeout.processor.spec.ts` (additions) | `escalation_enabled = false` -> no escalation regardless of timeout |
| 21 | `escalation-timeout.processor.spec.ts` (additions) | Custom timeout values respected |
| 22 | `escalation-timeout.processor.spec.ts` (additions) | Custom recipient lists used when configured |

### Admin endpoint tests

| # | Test | Description |
|---|------|-------------|
| 23 | Escalation settings GET returns current settings |
| 24 | Escalation settings PATCH updates settings |
| 25 | Escalation dashboard returns correct unacknowledged counts |
| 26 | User without `pastoral.manage_sst` cannot access escalation settings |

### Module wiring tests

| # | Test | Description |
|---|------|-------------|
| 27 | BehaviourModule resolves with ChildProtectionModule and PastoralModule imported |
| 28 | ChildProtectionModule does NOT import BehaviourModule (verify in module metadata) |
| 29 | PastoralModule does NOT import BehaviourModule |
| 30 | SafeguardingService injects CpRecordService successfully |

### RLS leakage tests

| # | Test | Description |
|---|------|-------------|
| 31 | Facade-created cp_record is invisible to user without cp_access_grants |
| 32 | Facade-created pastoral_concern with tier=3 is invisible to user without cp_access_grants |
| 33 | Tenant B cannot see facade-created records from Tenant A |

---

## Verification checklist

- [ ] `SafeguardingController` has ZERO changes (same endpoints, decorators, and response shapes)
- [ ] `SafeguardingService.reportConcern()` creates pastoral_concern AND cp_record via delegation
- [ ] `safeguardingConcern.pastoral_concern_id` stores the cross-reference
- [ ] Pastoral concern has `tier = 3`, `category = 'child_protection'`, `behaviour_incident_id` set
- [ ] CP record is linked to the pastoral concern
- [ ] Immutable audit events recorded for both pastoral concern and CP record creation
- [ ] Severity mapping is correct (behaviour -> pastoral)
- [ ] Delegation failure does not block behaviour safeguarding creation
- [ ] Retry job enqueued on delegation failure
- [ ] `checkEffectivePermission()` checks both `safeguardingBreakGlassGrant` and `cp_access_grants`
- [ ] `updateConcern()` propagates description changes to pastoral concern versions
- [ ] `transitionStatus()` propagates status changes to pastoral concern
- [ ] Propagation failures logged but do not block behaviour operations
- [ ] Existing behaviour safeguarding data unchanged (no migration)
- [ ] Escalation timeout job reads tenant settings
- [ ] Escalation respects `escalation_enabled` flag
- [ ] Urgent timeout escalates to critical with audit event
- [ ] Critical timeout sends second notification with audit event
- [ ] Custom timeout durations and recipient lists respected
- [ ] Admin endpoints for escalation settings functional
- [ ] Escalation dashboard returns correct counts
- [ ] Module imports are one-directional (no circular dependencies)
- [ ] `BehaviourModule` imports `ChildProtectionModule` and `PastoralModule`
- [ ] `ChildProtectionModule` does NOT import `BehaviourModule`
- [ ] All RLS leakage tests pass
- [ ] All existing behaviour safeguarding tests still pass (regression)
- [ ] `turbo test` passes with no regressions

---

## Files created / modified

| Action | File path | Description |
|---|---|---|
| MODIFY | `apps/api/src/modules/behaviour/safeguarding.service.ts` | Facade refactor: delegate to CpRecordService and ConcernService on reportConcern(); propagate updates; add severity mapping |
| MODIFY | `apps/api/src/modules/behaviour/safeguarding-break-glass.service.ts` | Extend checkEffectivePermission() to check cp_access_grants |
| MODIFY | `apps/api/src/modules/behaviour/behaviour.module.ts` | Add imports for ChildProtectionModule and PastoralModule |
| MODIFY | `apps/api/src/modules/behaviour/safeguarding.service.spec.ts` | Add facade integration tests |
| MODIFY | `apps/api/src/modules/behaviour/safeguarding-break-glass.service.spec.ts` | Add dual source tests |
| CREATE | `packages/prisma/migrations/YYYYMMDD_add_pastoral_concern_id_to_safeguarding/migration.sql` | Add `pastoral_concern_id` column and partial index to `safeguarding_concerns` |
| MODIFY | `packages/prisma/schema.prisma` | Add `pastoral_concern_id` field to `SafeguardingConcern` model |
| MODIFY | `apps/api/src/modules/pastoral/pastoral.module.ts` | Ensure ConcernService, ConcernVersionService, PastoralEventService are exported |
| MODIFY | `apps/api/src/modules/child-protection/child-protection.module.ts` | Ensure CpRecordService, CpAccessService are exported |
| CREATE | `apps/api/src/modules/pastoral/controllers/pastoral-admin.controller.ts` | Escalation settings and dashboard endpoints (or add to existing admin controller) |
| CREATE | `packages/shared/src/pastoral/schemas/escalation-settings.schema.ts` | Zod schemas for escalation settings |
| MODIFY | `packages/shared/src/pastoral/schemas/index.ts` | Re-export escalation schemas |
| MODIFY | `apps/worker/src/processors/pastoral/escalation-timeout.processor.ts` | Enhance with tenant settings, custom timeouts, recipient overrides |
| CREATE | `apps/worker/src/processors/pastoral/sync-behaviour-safeguarding.processor.ts` | Retry processor for failed facade delegation |
| MODIFY | `apps/worker/src/worker.module.ts` | Register sync-behaviour-safeguarding processor |

---

## Risk mitigation

### Risk: Behaviour safeguarding tests break

**Mitigation:** The controller surface is unchanged. Existing tests that hit controller endpoints will pass because the response shape is identical. Service-level tests that mock Prisma calls may need updating because `reportConcern()` now calls additional services. Mock `CpRecordService` and `ConcernService` in existing tests to return successfully. Add new tests for the delegation path.

### Risk: Circular dependency at runtime

**Mitigation:** Module dependency is strictly one-directional. BehaviourModule imports ChildProtectionModule and PastoralModule. Neither of those imports BehaviourModule. If PastoralModule needs behaviour data in the future, it queries Prisma directly (not via BehaviourService). NestJS will throw a clear error at startup if a circular dependency is introduced, so this is fail-fast.

### Risk: Facade delegation failure blocks safeguarding creation

**Mitigation:** The delegation to pastoral/CP is wrapped in a try-catch. On failure, the behaviour safeguarding record is still created (this is the primary path). A retry job is enqueued for the pastoral/CP delegation. The user sees a successful response. The retry job picks up the work asynchronously.

### Risk: Existing break-glass grants stop working

**Mitigation:** `checkEffectivePermission()` checks behaviour break-glass grants FIRST, then falls through to cp_access_grants as a secondary check. The existing grant mechanism is unchanged; the new one is additive.
