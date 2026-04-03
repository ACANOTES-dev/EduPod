---
phase: SW-1D
name: Cases & Student Chronology
status: NOT STARTED
dependencies: [SW-1B]
date: 2026-03-27
---

# SW-1D: Cases & Student Chronology

## Summary

This sub-phase delivers the case lifecycle (create, transition, transfer, link concerns), multi-student case support, the student chronology view (the "DLP opens the case file when Tusla calls" surface), and the author masking interceptor that governs how masked-authorship concerns appear to different viewer tiers.

Case creation requires at least one linked concern (invariant 5 from the master spec). Case numbers use `tenant_sequences` with `SELECT ... FOR UPDATE` row locking. The case lifecycle state machine (open -> active -> monitoring -> resolved -> closed, with reopen) is validated by a shared transition map. Every transition generates an immutable `pastoral_events` audit record.

The student chronology service merges concerns (with version history), case events, intervention milestones, referral milestones, and parent contacts into a single reverse-chronological paginated timeline. For DLP users, Tier 3 items merge seamlessly. For non-DLP users, Tier 3 items are invisible -- RLS handles this at the database layer, not the application layer.

The author masking interceptor applies the masking rules from the master spec to all concern and chronology response DTOs, replacing author information based on viewer tier and the `author_masked` flag.

---

## Prerequisites

| Dependency | What it provides                                                                                                                                                                     | Verified by      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| SW-1A      | Infrastructure: `app.current_user_id` in RLS context, immutability triggers, `pastoral_events` table, `pastoral_cases` table, `pastoral_case_students` table, `PastoralEventService` | SW-1A tests pass |
| SW-1B      | `ConcernService.create()`, `ConcernVersionService`, `pastoral_concerns` table populated, concern Zod schemas, concern response DTOs                                                  | SW-1B tests pass |

**Assumed from SW-1A migration:**

- `pastoral_cases` table exists with all columns per master spec
- `pastoral_case_students` table exists with composite PK `(case_id, student_id)`
- `pastoral_events` table exists with immutability trigger
- Standard tenant RLS on `pastoral_cases` and `pastoral_case_students`
- Indexes: `(tenant_id, student_id, status)`, `(tenant_id, owner_user_id, status)`, `(tenant_id, next_review_date)` on `pastoral_cases`

---

## Section 1 -- Database Changes

### 1.1 Register `pastoral_case` sequence type

Add `pastoral_case` to the sequence seed so that `SequenceService.nextNumber()` can generate case numbers.

**File:** `packages/prisma/seed/pastoral-seed.ts` (new, or added to the SW-1A seed file)

```
await prisma.tenantSequence.upsert({
  where: {
    tenant_id_sequence_type: {
      tenant_id: tenantId,
      sequence_type: 'pastoral_case',
    },
  },
  create: {
    tenant_id: tenantId,
    sequence_type: 'pastoral_case',
    current_value: 0,
  },
  update: {},
});
```

**Runtime format:** `PC-YYYYMM-NNNNNN` (e.g., `PC-202604-000001`). The `SequenceService.formatNumber()` default branch handles this -- `sequenceType.toUpperCase()` produces `PASTORAL_CASE`, but the caller passes `prefix: 'PC'` to override:

```typescript
await this.sequenceService.nextNumber(tenantId, 'pastoral_case', tx, 'PC');
```

This follows the established behaviour module pattern (e.g., `'behaviour_sanction'` with prefix `'SN'`).

### 1.2 Add orphan detection support

No schema changes needed. The orphan detection query is:

```sql
SELECT pc.id, pc.case_number, pc.status
FROM pastoral_cases pc
WHERE pc.tenant_id = $1
  AND NOT EXISTS (
    SELECT 1 FROM pastoral_concerns c
    WHERE c.case_id = pc.id AND c.tenant_id = pc.tenant_id
  )
  AND pc.status NOT IN ('closed');
```

This runs as a daily cron job (see Section 5).

---

## Section 2 -- State Machine

### Case Lifecycle

```
open        -> [active]
active      -> [monitoring, resolved]
monitoring  -> [active, resolved]
resolved    -> [closed]
closed      -> [open]              (reopen)
```

**Terminal states:** None (all states have at least one outgoing transition). `closed` can reopen to `open`.

**Side effects by transition:**

| Transition               | Side effects                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `open -> active`         | Audit event `case_status_changed`. Case becomes visible in "active cases" views.                                       |
| `active -> monitoring`   | Audit event `case_status_changed`. Indicates interventions are in place, reduced oversight frequency.                  |
| `active -> resolved`     | Audit event `case_status_changed`. Sets `resolved_at = now()`.                                                         |
| `monitoring -> active`   | Audit event `case_status_changed`. Re-escalation (monitoring inadequate).                                              |
| `monitoring -> resolved` | Audit event `case_status_changed`. Sets `resolved_at = now()`.                                                         |
| `resolved -> closed`     | Audit event `case_status_changed`. Sets `closed_at = now()`. Case archived from active views.                          |
| `closed -> open`         | Audit event `case_status_changed`. Clears `resolved_at` and `closed_at`. Reason required -- recorded in audit payload. |

**Every transition requires:**

1. A `reason: string` (non-empty) explaining why the transition is happening.
2. An immutable `pastoral_events` record with `event_type = 'case_status_changed'` and payload `{case_id, old_status, new_status, reason}`.

### Shared state machine file

**File:** `packages/shared/src/pastoral/state-machine-case.ts`

```typescript
export const CASE_TRANSITIONS: Record<string, string[]> = {
  open: ['active'],
  active: ['monitoring', 'resolved'],
  monitoring: ['active', 'resolved'],
  resolved: ['closed'],
  closed: ['open'],
};

export function isValidCaseTransition(from: string, to: string): boolean {
  return CASE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getValidCaseTransitions(status: string): string[] {
  return CASE_TRANSITIONS[status] ?? [];
}
```

---

## Section 3 -- API Endpoints

All endpoints are namespaced under `/api/pastoral/cases`. Permission: `pastoral.manage_cases` unless otherwise noted.

| Method | Path                              | Permission              | Description                                        |
| ------ | --------------------------------- | ----------------------- | -------------------------------------------------- |
| POST   | `/cases`                          | `pastoral.manage_cases` | Create a case with linked concerns                 |
| GET    | `/cases`                          | `pastoral.manage_cases` | List cases with filters                            |
| GET    | `/cases/:id`                      | `pastoral.manage_cases` | Get case detail                                    |
| PATCH  | `/cases/:id`                      | `pastoral.manage_cases` | Update mutable fields (next_review_date, etc.)     |
| PATCH  | `/cases/:id/status`               | `pastoral.manage_cases` | Transition case status                             |
| POST   | `/cases/:id/transfer`             | `pastoral.manage_cases` | Transfer case ownership                            |
| POST   | `/cases/:id/concerns`             | `pastoral.manage_cases` | Link additional concerns to case                   |
| DELETE | `/cases/:id/concerns/:concernId`  | `pastoral.manage_cases` | Unlink concern from case (blocked if last concern) |
| GET    | `/cases/:id/students`             | `pastoral.manage_cases` | List students on a case                            |
| POST   | `/cases/:id/students`             | `pastoral.manage_cases` | Add student to a case                              |
| DELETE | `/cases/:id/students/:studentId`  | `pastoral.manage_cases` | Remove student from a case                         |
| GET    | `/students/:studentId/chronology` | `pastoral.view_tier1`   | Student chronology (tier-filtered by viewer)       |

**12 endpoints total.**

### Filter parameters for `GET /cases`

| Param           | Type       | Description                                    |
| --------------- | ---------- | ---------------------------------------------- |
| `status`        | `string`   | Comma-separated statuses (e.g., `open,active`) |
| `owner_user_id` | `UUID`     | Filter by case owner                           |
| `student_id`    | `UUID`     | Filter by primary student or linked student    |
| `tier`          | `number`   | Filter by case tier (1, 2, or 3)               |
| `date_from`     | `ISO date` | Cases created on or after this date            |
| `date_to`       | `ISO date` | Cases created on or before this date           |
| `page`          | `number`   | Page number (default 1)                        |
| `pageSize`      | `number`   | Items per page (default 20, max 100)           |

### Chronology filter parameters for `GET /students/:studentId/chronology`

| Param         | Type       | Description                                           |
| ------------- | ---------- | ----------------------------------------------------- |
| `page`        | `number`   | Page number (default 1)                               |
| `pageSize`    | `number`   | Items per page (default 50, max 200)                  |
| `event_types` | `string`   | Comma-separated event types to include (default: all) |
| `date_from`   | `ISO date` | Events on or after this date                          |
| `date_to`     | `ISO date` | Events on or before this date                         |

---

## Section 4 -- Service Layer

### 4.1 CaseService (`services/case.service.ts`)

**Constructor dependencies:** `PrismaService`, `SequenceService`, `PastoralEventService`, `ConcernService`

#### Method signatures

```typescript
create(
  tenantId: string,
  userId: string,
  dto: CreateCaseDto,
  tx?: PrismaTransactionClient,
): Promise<PastoralCase>
```

- Validates `dto.concern_ids` has length >= 1.
- Validates all concern_ids belong to `tenantId` and the same student (or validates multi-student scenario -- see below).
- Generates `case_number` via `SequenceService.nextNumber(tenantId, 'pastoral_case', tx, 'PC')`.
- Sets `status = 'open'`, `tier = max(linked concerns' tiers)`.
- Creates case record.
- Updates each linked concern's `case_id` to point to this case.
- If `dto.student_ids` provided (multi-student), creates `pastoral_case_students` rows for each student.
- Always creates a `pastoral_case_students` row for the primary `student_id`.
- Records `case_created` audit event with payload `{case_id, student_id, case_number, linked_concern_ids, owner_user_id, reason}`.
- All within a single interactive Prisma transaction.

```typescript
list(
  tenantId: string,
  filters: ListCasesDto,
): Promise<{ data: PastoralCase[]; meta: PaginationMeta }>
```

- Supports all filter parameters from Section 3.
- When filtering by `student_id`, checks both `pastoral_cases.student_id` (primary student) and `pastoral_case_students` (linked students).
- Orders by `created_at DESC`.

```typescript
getById(
  tenantId: string,
  caseId: string,
): Promise<PastoralCaseDetail>
```

- Returns case with: linked concerns (with latest narrative version), linked students, case owner info, recent audit events.
- Includes computed field `days_open` (business days since creation).

```typescript
update(
  tenantId: string,
  caseId: string,
  userId: string,
  dto: UpdateCaseDto,
): Promise<PastoralCase>
```

- Mutable fields: `next_review_date`, `opened_reason` (append amendment, not replace).
- Does NOT allow status change (use `transitionStatus`).
- Does NOT allow owner change (use `transferOwnership`).

```typescript
transitionStatus(
  tenantId: string,
  caseId: string,
  userId: string,
  dto: TransitionCaseStatusDto,
): Promise<PastoralCase>
```

- Validates transition via `isValidCaseTransition(currentStatus, dto.new_status)`.
- Throws `BadRequestException` with valid transitions list if invalid.
- Requires `dto.reason` (non-empty string).
- Sets `resolved_at` when transitioning to `resolved`.
- Sets `closed_at` when transitioning to `closed`.
- Clears `resolved_at` and `closed_at` when reopening (`closed -> open`).
- Records `case_status_changed` audit event.
- All within a single interactive Prisma transaction.

```typescript
transferOwnership(
  tenantId: string,
  caseId: string,
  userId: string,
  dto: TransferCaseOwnershipDto,
): Promise<PastoralCase>
```

- Updates `owner_user_id` to `dto.new_owner_user_id`.
- Validates new owner exists and belongs to the tenant.
- Records `case_ownership_transferred` audit event with `{case_id, old_owner_user_id, new_owner_user_id, reason}`.
- All within a single interactive Prisma transaction.

```typescript
linkConcern(
  tenantId: string,
  caseId: string,
  userId: string,
  concernId: string,
): Promise<void>
```

- Validates the concern exists, belongs to the tenant, and is not already linked to another case.
- Updates `pastoral_concerns.case_id = caseId`.
- Recalculates case tier (highest tier among all linked concerns).
- Records audit event (payload includes newly linked concern_id).

```typescript
unlinkConcern(
  tenantId: string,
  caseId: string,
  userId: string,
  concernId: string,
): Promise<void>
```

- Validates the concern is currently linked to this case.
- Checks that unlinking would not leave the case with zero concerns. If it would, throws `BadRequestException('Cannot unlink the last concern from a case. Close the case instead.')`.
- Sets `pastoral_concerns.case_id = NULL`.
- Recalculates case tier.
- Records audit event.

```typescript
recalculateTier(
  tenantId: string,
  caseId: string,
  tx: PrismaTransactionClient,
): Promise<number>
```

- Queries all concerns linked to the case.
- Returns `Math.max(...concerns.map(c => c.tier))`.
- Updates `pastoral_cases.tier` if changed.

```typescript
findOrphanedCases(
  tenantId: string,
): Promise<OrphanedCase[]>
```

- Returns cases with zero linked concerns that are not in `closed` status.
- Used by the orphan detection cron job.

### 4.2 Multi-Student Case Methods (within CaseService)

```typescript
addStudent(
  tenantId: string,
  caseId: string,
  userId: string,
  studentId: string,
): Promise<void>
```

- Creates `pastoral_case_students` row.
- Records audit event.
- Validates student exists and belongs to tenant.
- Idempotent: if already linked, returns without error.

```typescript
removeStudent(
  tenantId: string,
  caseId: string,
  userId: string,
  studentId: string,
): Promise<void>
```

- Prevents removal of the primary student (`pastoral_cases.student_id`). Throws `BadRequestException('Cannot remove the primary student from a case.')`.
- Deletes `pastoral_case_students` row.
- Records audit event.

```typescript
listStudents(
  tenantId: string,
  caseId: string,
): Promise<CaseStudent[]>
```

- Returns all students linked to the case (from `pastoral_case_students`) with basic student info (name, enrolment ID, year group).

### 4.3 Student Chronology Service (`services/student-chronology.service.ts`)

This is the "DLP opens the case file when Tusla calls" view. A single service method returns the complete pastoral timeline for a student.

**Constructor dependencies:** `PrismaService`, `PastoralEventService`

```typescript
getChronology(
  tenantId: string,
  userId: string,
  studentId: string,
  filters: ChronologyFiltersDto,
): Promise<{ data: ChronologyEntry[]; meta: PaginationMeta }>
```

**How it works:**

1. Queries `pastoral_events` table filtered by `student_id` and `tenant_id`.
2. RLS handles tier visibility automatically -- non-DLP users never see Tier 3 events because:
   - Tier 3 concerns are invisible via `pastoral_concerns` RLS policy (checked via `app.current_user_id` against `cp_access_grants`).
   - Tier 3 events in `pastoral_events` are filtered by `tier` column combined with the same RLS check at the application layer (the `pastoral_events` table itself uses standard tenant RLS, but the service filters `tier < 3 OR user has CP access` at query time for the events table).
3. For each event, the service enriches with display-ready data:
   - Concern events: includes category, severity, latest narrative excerpt (truncated), version count.
   - Case events: includes case number, status, owner name.
   - Intervention milestones: includes intervention type, continuum level, status.
   - Referral milestones: includes referral type, referral body, status.
   - Parent contact events: includes contact method, outcome summary.
4. Returns events in reverse chronological order (`created_at DESC`), paginated.

**Chronology entry shape:**

```typescript
interface ChronologyEntry {
  id: string; // pastoral_events.id
  event_type: string; // e.g., 'concern_created', 'case_status_changed'
  entity_type: string; // 'concern' | 'case' | 'intervention' | 'referral' | etc.
  entity_id: string;
  timestamp: string; // ISO 8601
  tier: number;
  actor:
    | {
        // subject to author masking
        user_id: string;
        name: string;
      }
    | { masked: true };
  summary: string; // human-readable one-line summary
  payload: Record<string, unknown>; // event-specific structured data
}
```

**Tier 3 handling in detail:**

- The service queries `pastoral_events` with a WHERE clause: `student_id = $studentId AND (tier < 3 OR $userHasCpAccess)`.
- The `$userHasCpAccess` boolean is resolved by checking `cp_access_grants` for the acting user before the main query.
- This is defence-in-depth layered on top of the RLS policies already filtering `pastoral_concerns` and `cp_records`.

### 4.4 Author Masking Interceptor (`guards/author-mask.interceptor.ts`)

A NestJS response interceptor (not a guard) that post-processes responses to apply author masking rules.

**Masking rules (from master spec):**

| Viewer context      | `author_masked = false` | `author_masked = true` |
| ------------------- | ----------------------- | ---------------------- |
| Tier 1 viewer       | Sees author name        | Sees "Author masked"   |
| Tier 2 viewer (SST) | Sees author name        | Sees "Author masked"   |
| Tier 3 viewer (DLP) | Sees author name        | **Sees author name**   |
| Parent (if shared)  | Never sees author       | Never sees author      |

**Implementation:**

```typescript
@Injectable()
export class AuthorMaskInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        const request = context.switchToHttp().getRequest();
        const viewerIsDlp = request.user?.hasCpAccess === true;
        const viewerIsParent = request.user?.role === 'parent';
        return this.applyMasking(data, viewerIsDlp, viewerIsParent);
      }),
    );
  }

  private applyMasking(data: unknown, viewerIsDlp: boolean, viewerIsParent: boolean): unknown {
    // Recursively traverses response data
    // For any object with `author_masked: true` and `logged_by_user` / `actor`:
    //   - If viewerIsParent: always strip author info
    //   - If viewerIsDlp: leave author info intact
    //   - Otherwise: replace author info with { masked: true, display_name: 'Author masked' }
    // For any object with `author_masked: false`:
    //   - If viewerIsParent: strip author info
    //   - Otherwise: leave author info intact
  }
}
```

**Applied to:** All concern endpoints, all chronology endpoints, case detail endpoint (which includes linked concerns).

**Controller usage:**

```typescript
@UseInterceptors(AuthorMaskInterceptor)
@Get(':id')
async getCaseDetail(...) { ... }
```

---

## Section 5 -- Background Jobs

### `pastoral:orphan-case-detection`

| Property  | Value                          |
| --------- | ------------------------------ |
| Queue     | `pastoral`                     |
| Trigger   | Daily cron at 06:00 UTC        |
| Payload   | `{ tenant_id: string }`        |
| Processor | `OrphanCaseDetectionProcessor` |

**Behaviour:**

1. Runs once per tenant (iterates all active tenants).
2. Calls `CaseService.findOrphanedCases(tenantId)`.
3. For each orphaned case found:
   - Records a `pastoral_events` entry: `event_type = 'case_orphan_detected'`, `entity_type = 'case'`, `entity_id = caseId`, `actor_user_id = SYSTEM_SENTINEL`, payload: `{case_id, case_number, status, detected_at}`.
   - Sends an in-app notification to the case owner: "Case {case_number} has no linked concerns. Review or close this case."
4. Idempotent: if the orphan was already flagged in the last 24 hours (check `pastoral_events` for `case_orphan_detected` with same `entity_id` in the last day), skip.

**File:** `apps/worker/src/processors/pastoral/orphan-case-detection.processor.ts`

---

## Section 6 -- Zod Schemas

**File:** `packages/shared/src/pastoral/schemas/case.schema.ts`

### Request schemas

```typescript
export const createCaseSchema = z.object({
  student_id: z.string().uuid(),
  concern_ids: z.array(z.string().uuid()).min(1, 'At least one concern is required'),
  owner_user_id: z.string().uuid(),
  opened_reason: z.string().min(1).max(5000),
  next_review_date: z.string().date().optional(),
  student_ids: z.array(z.string().uuid()).optional(), // additional students for multi-student cases
});
export type CreateCaseDto = z.infer<typeof createCaseSchema>;

export const updateCaseSchema = z.object({
  next_review_date: z.string().date().optional(),
  opened_reason: z.string().min(1).max(5000).optional(),
});
export type UpdateCaseDto = z.infer<typeof updateCaseSchema>;

export const transitionCaseStatusSchema = z.object({
  new_status: z.enum(['open', 'active', 'monitoring', 'resolved', 'closed']),
  reason: z.string().min(1).max(2000),
});
export type TransitionCaseStatusDto = z.infer<typeof transitionCaseStatusSchema>;

export const transferCaseOwnershipSchema = z.object({
  new_owner_user_id: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});
export type TransferCaseOwnershipDto = z.infer<typeof transferCaseOwnershipSchema>;

export const listCasesSchema = z.object({
  status: z.string().optional(), // comma-separated
  owner_user_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  tier: z.coerce.number().min(1).max(3).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});
export type ListCasesDto = z.infer<typeof listCasesSchema>;

export const chronologyFiltersSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(50),
  event_types: z.string().optional(), // comma-separated
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
});
export type ChronologyFiltersDto = z.infer<typeof chronologyFiltersSchema>;

export const addCaseStudentSchema = z.object({
  student_id: z.string().uuid(),
});
export type AddCaseStudentDto = z.infer<typeof addCaseStudentSchema>;
```

### Response schemas (for contract testing)

```typescript
export const caseResponseSchema = z.object({
  id: z.string().uuid(),
  case_number: z.string(),
  status: z.enum(['open', 'active', 'monitoring', 'resolved', 'closed']),
  student_id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  opened_reason: z.string(),
  tier: z.number().min(1).max(3),
  next_review_date: z.string().date().nullable(),
  resolved_at: z.string().datetime().nullable(),
  closed_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const chronologyEntrySchema = z.object({
  id: z.string().uuid(),
  event_type: z.string(),
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  tier: z.number().min(1).max(3),
  actor: z.union([
    z.object({ user_id: z.string().uuid(), name: z.string() }),
    z.object({ masked: z.literal(true), display_name: z.literal('Author masked') }),
  ]),
  summary: z.string(),
  payload: z.record(z.unknown()),
});
```

---

## Section 7 -- Implementation Order

1. **Shared schemas and state machine**
   - `packages/shared/src/pastoral/state-machine-case.ts`
   - `packages/shared/src/pastoral/schemas/case.schema.ts`
   - Export from `packages/shared/src/pastoral/index.ts`

2. **Sequence registration**
   - Add `pastoral_case` to the pastoral seed file
   - Verify `SequenceService.nextNumber()` works with `prefix: 'PC'`

3. **CaseService**
   - `apps/api/src/modules/pastoral/services/case.service.ts`
   - All methods from Section 4.1 and 4.2

4. **StudentChronologyService**
   - `apps/api/src/modules/pastoral/services/student-chronology.service.ts`
   - Depends on `PastoralEventService` from SW-1A/1B

5. **AuthorMaskInterceptor**
   - `apps/api/src/modules/pastoral/interceptors/author-mask.interceptor.ts`
   - Unit tested independently before controller wiring

6. **CasesController**
   - `apps/api/src/modules/pastoral/controllers/cases.controller.ts`
   - All 12 endpoints from Section 3
   - Apply `AuthorMaskInterceptor` to relevant endpoints

7. **Orphan detection processor**
   - `apps/worker/src/processors/pastoral/orphan-case-detection.processor.ts`
   - Register in `WorkerModule`

8. **Module wiring**
   - Register `CaseService`, `StudentChronologyService`, `AuthorMaskInterceptor` in `PastoralModule`
   - Register `OrphanCaseDetectionProcessor` in `WorkerModule`

---

## Section 8 -- Test Requirements

### 8.1 State machine tests

**File:** `packages/shared/src/pastoral/state-machine-case.spec.ts`

| Test                                              | Description                                        |
| ------------------------------------------------- | -------------------------------------------------- |
| `should allow open -> active`                     | Valid forward transition                           |
| `should allow active -> monitoring`               | Valid forward transition                           |
| `should allow active -> resolved`                 | Valid skip to resolved                             |
| `should allow monitoring -> active`               | Valid re-escalation                                |
| `should allow monitoring -> resolved`             | Valid from monitoring                              |
| `should allow resolved -> closed`                 | Valid terminal transition                          |
| `should allow closed -> open (reopen)`            | Valid reopen transition                            |
| `should reject open -> resolved`                  | Invalid skip                                       |
| `should reject open -> closed`                    | Invalid skip                                       |
| `should reject active -> open`                    | Invalid backward transition                        |
| `should reject monitoring -> closed`              | Invalid skip                                       |
| `should reject resolved -> active`                | Invalid backward transition                        |
| `should return valid transitions for each status` | `getValidCaseTransitions()` returns correct arrays |

### 8.2 CaseService unit tests

**File:** `apps/api/src/modules/pastoral/services/case.service.spec.ts`

| Test                                                               | Description              |
| ------------------------------------------------------------------ | ------------------------ |
| `should create case with valid concerns and generate case number`  | Happy path               |
| `should reject case creation with empty concern_ids`               | Validates invariant 5    |
| `should reject case creation with concerns from different tenants` | RLS safety               |
| `should set initial status to open`                                | Default status           |
| `should calculate tier as max of linked concerns`                  | Tier auto-calculation    |
| `should record case_created audit event`                           | Audit trail              |
| `should transition status with valid transition`                   | State machine            |
| `should reject invalid status transition`                          | State machine validation |
| `should require reason for every transition`                       | Audit completeness       |
| `should set resolved_at on transition to resolved`                 | Timestamp management     |
| `should set closed_at on transition to closed`                     | Timestamp management     |
| `should clear resolved_at and closed_at on reopen`                 | Reopen logic             |
| `should transfer ownership with audit event`                       | Ownership transfer       |
| `should link additional concern and recalculate tier`              | Concern linking          |
| `should reject unlinking last concern`                             | Invariant 5              |
| `should recalculate tier when concern unlinked`                    | Tier consistency         |

### 8.3 Multi-student case tests

| Test                                                      | Description                |
| --------------------------------------------------------- | -------------------------- |
| `should add student to case`                              | Happy path                 |
| `should be idempotent when adding already-linked student` | No error on duplicate      |
| `should reject removing primary student`                  | Primary student protection |
| `should remove non-primary student`                       | Happy path                 |
| `should list all students on a case`                      | Multi-student query        |
| `should include case in each linked student's chronology` | Cross-student visibility   |

### 8.4 Orphan detection tests

| Test                                                    | Description           |
| ------------------------------------------------------- | --------------------- |
| `should detect case with zero linked concerns`          | Basic detection       |
| `should not flag closed cases as orphans`               | Closed cases excluded |
| `should not flag cases that still have linked concerns` | Negative case         |
| `should be idempotent (no duplicate notifications)`     | 24-hour dedup         |
| `should send notification to case owner`                | Notification dispatch |
| `should record audit event for orphan detection`        | Audit trail           |

### 8.5 Student chronology tests

**File:** `apps/api/src/modules/pastoral/services/student-chronology.service.spec.ts`

| Test                                                           | Description                                        |
| -------------------------------------------------------------- | -------------------------------------------------- |
| `should return all event types in reverse chronological order` | Ordering                                           |
| `should include concern events with version history`           | Concern enrichment                                 |
| `should include case status change events`                     | Case enrichment                                    |
| `should include intervention milestones`                       | Intervention enrichment (future-proofed for SW-2B) |
| `should include parent contact events`                         | Parent contact enrichment                          |
| `should paginate correctly`                                    | Pagination                                         |
| `should filter by event_types`                                 | Filter parameter                                   |
| `should filter by date range`                                  | Filter parameter                                   |
| `should exclude Tier 3 events for non-DLP user`                | Tier filtering                                     |
| `should include Tier 3 events for DLP user`                    | DLP visibility                                     |
| `should merge Tier 3 seamlessly into timeline for DLP`         | No visual separation                               |

### 8.6 Author masking tests

**File:** `apps/api/src/modules/pastoral/interceptors/author-mask.interceptor.spec.ts`

| Test                                                        | Description            |
| ----------------------------------------------------------- | ---------------------- |
| `author_masked=false, Tier 1 viewer: sees author name`      | Standard visibility    |
| `author_masked=true, Tier 1 viewer: sees "Author masked"`   | Masking applied        |
| `author_masked=true, Tier 2 viewer: sees "Author masked"`   | Masking applied        |
| `author_masked=true, DLP viewer: sees author name`          | DLP override           |
| `author_masked=false, parent viewer: never sees author`     | Parent rule            |
| `author_masked=true, parent viewer: never sees author`      | Parent rule            |
| `should apply masking recursively to nested concern arrays` | Nested data            |
| `should apply masking to chronology entries`                | Chronology integration |

### 8.7 RLS leakage tests

| Test                                                       | Description          |
| ---------------------------------------------------------- | -------------------- |
| `Tenant B cannot see Tenant A cases`                       | Standard RLS         |
| `Tenant B cannot see Tenant A case students`               | Standard RLS         |
| `Non-DLP user cannot see Tier 3 events in chronology`      | Tier 3 isolation     |
| `Non-DLP user sees no indication that Tier 3 events exist` | Zero discoverability |

### 8.8 Controller integration tests

| Test                                                        | Description               |
| ----------------------------------------------------------- | ------------------------- |
| `POST /cases: 201 with valid payload`                       | Happy path                |
| `POST /cases: 400 with empty concern_ids`                   | Validation                |
| `POST /cases: 403 without pastoral.manage_cases permission` | Permission denied         |
| `PATCH /cases/:id/status: 200 with valid transition`        | State transition          |
| `PATCH /cases/:id/status: 400 with invalid transition`      | State machine enforcement |
| `POST /cases/:id/transfer: 200 with valid new owner`        | Ownership transfer        |
| `GET /students/:id/chronology: 200 with paginated results`  | Chronology                |
| `GET /students/:id/chronology: author masking applied`      | Interceptor integration   |
| `DELETE /cases/:id/concerns/:cid: 400 when last concern`    | Invariant enforcement     |

---

## Section 9 -- Files Created

| File                                                                         | Type   | Description                          |
| ---------------------------------------------------------------------------- | ------ | ------------------------------------ |
| `packages/shared/src/pastoral/state-machine-case.ts`                         | Shared | Case lifecycle state machine         |
| `packages/shared/src/pastoral/state-machine-case.spec.ts`                    | Test   | State machine unit tests             |
| `packages/shared/src/pastoral/schemas/case.schema.ts`                        | Shared | Zod request/response schemas         |
| `apps/api/src/modules/pastoral/services/case.service.ts`                     | API    | Case CRUD and lifecycle service      |
| `apps/api/src/modules/pastoral/services/case.service.spec.ts`                | Test   | CaseService unit tests               |
| `apps/api/src/modules/pastoral/services/student-chronology.service.ts`       | API    | Student chronology aggregation       |
| `apps/api/src/modules/pastoral/services/student-chronology.service.spec.ts`  | Test   | Chronology tests                     |
| `apps/api/src/modules/pastoral/interceptors/author-mask.interceptor.ts`      | API    | Author masking response interceptor  |
| `apps/api/src/modules/pastoral/interceptors/author-mask.interceptor.spec.ts` | Test   | Author masking tests                 |
| `apps/api/src/modules/pastoral/controllers/cases.controller.ts`              | API    | Cases REST controller (12 endpoints) |
| `apps/worker/src/processors/pastoral/orphan-case-detection.processor.ts`     | Worker | Orphan case cron processor           |

## Section 10 -- Files Modified

| File                                               | Change                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/shared/src/pastoral/index.ts`            | Export state machine and case schemas                                                          |
| `packages/prisma/seed/pastoral-seed.ts`            | Add `pastoral_case` sequence type                                                              |
| `apps/api/src/modules/pastoral/pastoral.module.ts` | Register `CaseService`, `StudentChronologyService`, `AuthorMaskInterceptor`, `CasesController` |
| `apps/worker/src/worker.module.ts`                 | Register `OrphanCaseDetectionProcessor`                                                        |
| `architecture/state-machines.md`                   | Add pastoral case lifecycle state machine                                                      |
| `architecture/event-job-catalog.md`                | Add `pastoral:orphan-case-detection` job                                                       |
| `architecture/module-blast-radius.md`              | Update pastoral module exports                                                                 |

---

## Section 11 -- Verification Checklist

Before marking SW-1D complete:

- [ ] `packages/shared/src/pastoral/state-machine-case.spec.ts` -- all state machine tests pass
- [ ] `apps/api/src/modules/pastoral/services/case.service.spec.ts` -- all service tests pass
- [ ] `apps/api/src/modules/pastoral/services/student-chronology.service.spec.ts` -- all chronology tests pass
- [ ] `apps/api/src/modules/pastoral/interceptors/author-mask.interceptor.spec.ts` -- all masking tests pass
- [ ] Case number generation produces `PC-YYYYMM-NNNNNN` format with no duplicates under concurrent creation
- [ ] Every status transition records an immutable `pastoral_events` entry
- [ ] Invalid transitions are rejected with 400 and list of valid transitions
- [ ] Case reopen (`closed -> open`) clears `resolved_at` and `closed_at`
- [ ] Unlinking the last concern from a case is blocked with descriptive error
- [ ] Case tier auto-recalculates on concern link/unlink
- [ ] Multi-student case: primary student cannot be removed
- [ ] Orphan detection cron: flags cases with zero concerns, skips closed cases, is idempotent
- [ ] Chronology: returns events in reverse chronological order, paginated
- [ ] Chronology: Tier 3 events invisible to non-DLP users (no indication they exist)
- [ ] Chronology: Tier 3 events merge seamlessly for DLP users
- [ ] Author masking: `author_masked=true` shows "Author masked" for Tier 1/2 viewers
- [ ] Author masking: DLP always sees real author regardless of `author_masked` flag
- [ ] Author masking: parents never see author info regardless of flag
- [ ] RLS leakage: Tenant B cannot see Tenant A cases
- [ ] RLS leakage: Tenant B cannot see Tenant A case students
- [ ] `turbo test` -- full regression suite passes
- [ ] `turbo lint` -- no lint errors
- [ ] `turbo type-check` -- no type errors
- [ ] Architecture files updated (state-machines.md, event-job-catalog.md, module-blast-radius.md)

---

## Section 12 -- Key Context for Executor

### Patterns from the codebase

- **State machines:** Follow the `state-machine.ts` pattern from behaviour module -- `Record<string, string[]>` transition map, `isValidTransition()`, `getValidTransitions()`.
- **Sequence generation:** `SequenceService.nextNumber(tenantId, type, tx, prefix)`. Pass `prefix: 'PC'` for case numbers. The `formatNumber()` default branch handles the `PREFIX-YYYYMM-NNNNNN` format.
- **Immutable audit events:** Call `PastoralEventService.record()` within the same interactive Prisma transaction. Never outside the transaction.
- **Controller decorators:** `@ModuleEnabled('pastoral')`, `@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)`, `@RequiresPermission('pastoral.manage_cases')`.
- **Pagination:** Offset-based -- `?page=1&pageSize=20`. Response shape: `{ data: T[], meta: { page, pageSize, total } }`.
- **Interactive transactions only:** All tenant-scoped DB access uses `prisma.$transaction(async (tx) => { ... })`. No sequential/batch transactions.

### Gotchas

- **Case tier is denormalised.** It must be recalculated every time a concern is linked or unlinked. If a Tier 3 concern is linked, the case becomes Tier 3 -- but this does NOT affect case-level RLS (pastoral_cases uses standard tenant RLS). The tier on the case is for filtering and display, not for access control. Access control for Tier 3 is enforced at the concern level and cp_records level.
- **Chronology Tier 3 filtering.** The `pastoral_events` table uses standard tenant RLS (not the tiered RLS of `pastoral_concerns`). The chronology service must filter events by tier at the application layer for the events table, while relying on RLS for the concerns and cp_records tables. This is defence-in-depth -- both layers filter.
- **Author masking is a response-level transformation.** It does not affect what is stored in the database. The `logged_by_user_id` is always stored in full. Masking is applied only at the API response boundary.
- **Orphan detection uses SYSTEM_SENTINEL as actor.** The sentinel UUID `00000000-0000-0000-0000-000000000000` is used for the `actor_user_id` in audit events generated by the cron job.
- **Multi-student cases:** The `student_id` on `pastoral_cases` is the primary student. Additional students are in `pastoral_case_students`. When filtering cases by student, check BOTH tables.
