# SW-2C: Parent Engagement

---

name: Parent Engagement
description: Parent contact logging (append-only), parent portal for shared concerns and self-referral, share controls with immutable audit, intervention plan visibility for informed parents.
phase: 2
sub_phase: C
dependencies: [SW-1B, SW-1D]
status: NOT STARTED

---

## What this sub-phase delivers

1. **Parent Contact Service** -- append-only logging of parent contacts (phone, in-person, email, portal message, letter) linked to concerns and/or cases, with immutable audit events.
2. **Parent Portal Pastoral Endpoints** -- parents see only explicitly shared concerns (controlled by `parent_shareable` + `parent_share_level`), can submit self-referrals about their own child, and view intervention plan summaries when `parent_informed = true`.
3. **Share Controls** -- staff-facing endpoint to mark a concern as shareable with configurable detail level, with permission enforcement and immutable audit trail.
4. **Parent Notification on Share** -- optional notification to parents when a concern is marked shareable, configurable per tenant.

---

## Prerequisites

| Dependency | What must exist                                                                                                                                                                                                            | Verified by                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| SW-1A      | `app.current_user_id` globally in RLS context, immutability trigger function `prevent_immutable_modification()`                                                                                                            | RLS middleware sets both `app.current_tenant_id` and `app.current_user_id` |
| SW-1B      | `pastoral_concerns` table with `parent_shareable`, `parent_share_level`, `shared_by_user_id`, `shared_at` columns; `pastoral_events` table (append-only); `ConcernService` operational; `PastoralEventService` operational | Concern creation and audit events functional                               |
| SW-1D      | `pastoral_cases` table operational; `CaseService` with concern linkage; student chronology view                                                                                                                            | Cases can be created and concerns linked                                   |
| Existing   | `parents` and `student_parents` tables with user linkage (from behaviour parent portal pattern); `CommunicationsModule` available for notification dispatch                                                                | `BehaviourParentService.resolveParent()` pattern exists                    |

---

## Database tables

### pastoral_parent_contacts (append-only) -- already defined in master spec

The table schema is defined in the master spec (Part 2, Database tables). Recap for implementor reference:

```
pastoral_parent_contacts
+-- id                    UUID PK DEFAULT gen_random_uuid()
+-- tenant_id             UUID NOT NULL FK -> tenants(id)
+-- student_id            UUID NOT NULL FK -> students(id)
+-- concern_id            UUID FK -> pastoral_concerns(id)
+-- case_id               UUID FK -> pastoral_cases(id)
+-- parent_id             UUID NOT NULL FK -> parents(id)
+-- contacted_by_user_id  UUID NOT NULL FK -> users(id)
+-- contact_method        VARCHAR(30) NOT NULL    -- 'phone' | 'in_person' | 'email' | 'portal_message' | 'letter'
+-- contact_date          TIMESTAMPTZ NOT NULL
+-- outcome               TEXT NOT NULL
+-- parent_response       TEXT
+-- created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

**No `updated_at` column.** This table is append-only.

**Constraints:**

- RLS: `tenant_id = current_setting('app.current_tenant_id')::uuid`
- Immutability trigger: `trg_immutable_parent_contacts` (`BEFORE UPDATE OR DELETE`) using reusable `prevent_immutable_modification()` function from SW-1A
- Index: `(tenant_id, student_id, created_at DESC)` -- for student chronology
- Index: `(tenant_id, case_id, created_at DESC)` -- for case view
- Index: `(tenant_id, concern_id)` -- for concern-linked contacts

**Note:** This table is created as part of the SW-1A migration (all pastoral tables are created together). SW-2C only creates the service layer and tests.

---

## API endpoints

### Parent Contact Controller -- `parent-contacts.controller.ts`

| #   | Method | Route                             | Permission            | Request body / query                                        | Response                          |
| --- | ------ | --------------------------------- | --------------------- | ----------------------------------------------------------- | --------------------------------- |
| 1   | POST   | `v1/pastoral/parent-contacts`     | `pastoral.view_tier1` | `logParentContactSchema`                                    | `{ data: { id, created_at } }`    |
| 2   | GET    | `v1/pastoral/parent-contacts`     | `pastoral.view_tier1` | Query: `student_id?, concern_id?, case_id?, page, pageSize` | `{ data: ParentContact[], meta }` |
| 3   | GET    | `v1/pastoral/parent-contacts/:id` | `pastoral.view_tier1` | --                                                          | `{ data: ParentContact }`         |

### Share Controls -- on existing `concerns.controller.ts`

| #   | Method | Route                              | Permission            | Request body                   | Response                                                            |
| --- | ------ | ---------------------------------- | --------------------- | ------------------------------ | ------------------------------------------------------------------- |
| 4   | POST   | `v1/pastoral/concerns/:id/share`   | see share rules below | `shareConcernWithParentSchema` | `{ data: { id, parent_shareable, parent_share_level, shared_at } }` |
| 5   | POST   | `v1/pastoral/concerns/:id/unshare` | `pastoral.view_tier2` | --                             | `{ data: { id, parent_shareable: false } }`                         |

### Parent Portal -- `parent-pastoral.controller.ts`

| #   | Method | Route                              | Permission                      | Request body / query                 | Response                              |
| --- | ------ | ---------------------------------- | ------------------------------- | ------------------------------------ | ------------------------------------- |
| 6   | GET    | `v1/parent/pastoral/concerns`      | `pastoral.parent_self_referral` | Query: `student_id?, page, pageSize` | `{ data: ParentConcernView[], meta }` |
| 7   | POST   | `v1/parent/pastoral/self-referral` | `pastoral.parent_self_referral` | `parentSelfReferralSchema`           | `{ data: { id, created_at } }`        |
| 8   | GET    | `v1/parent/pastoral/interventions` | `pastoral.parent_self_referral` | Query: `student_id?`                 | `{ data: ParentInterventionView[] }`  |

---

## Zod schemas (packages/shared)

File: `packages/shared/src/pastoral/schemas/parent-engagement.schema.ts`

### logParentContactSchema

```typescript
export const logParentContactSchema = z.object({
  student_id: z.string().uuid(),
  concern_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  parent_id: z.string().uuid(),
  contact_method: z.enum(['phone', 'in_person', 'email', 'portal_message', 'letter']),
  contact_date: z.string().datetime(),
  outcome: z.string().min(1).max(5000),
  parent_response: z.string().max(5000).optional(),
});
```

### shareConcernWithParentSchema

```typescript
export const shareConcernWithParentSchema = z.object({
  share_level: z.enum(['category_only', 'category_summary', 'full_detail']).optional(),
  // If omitted, uses tenant_settings.parent_share_default_level
  notify_parent: z.boolean().default(false),
});
```

### parentSelfReferralSchema

```typescript
export const parentSelfReferralSchema = z.object({
  student_id: z.string().uuid(),
  description: z.string().min(10).max(10000),
  category: z.string().optional(), // defaults to 'other' if not provided
});
```

### listParentContactsQuerySchema

```typescript
export const listParentContactsQuerySchema = z.object({
  student_id: z.string().uuid().optional(),
  concern_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
```

### parentPastoralQuerySchema

```typescript
export const parentPastoralQuerySchema = z.object({
  student_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
```

---

## Service method signatures

### ParentContactService (`parent-contact.service.ts`)

```typescript
@Injectable()
export class ParentContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  /**
   * Log a parent contact. Append-only -- no update or delete.
   * Generates immutable `parent_contacted` audit event.
   */
  async logContact(
    tenantId: string,
    userId: string,
    dto: LogParentContactDto,
  ): Promise<{ data: { id: string; created_at: string } }>;

  /**
   * List parent contacts, filtered by student, concern, or case.
   * Returns chronological (newest first).
   */
  async listContacts(
    tenantId: string,
    query: ListParentContactsQuery,
  ): Promise<{ data: ParentContact[]; meta: PaginationMeta }>;

  /**
   * Get a single parent contact by ID.
   */
  async getContact(tenantId: string, contactId: string): Promise<{ data: ParentContact }>;
}
```

### Share controls -- added to existing `ConcernService`

```typescript
// In ConcernService (concern.service.ts)

/**
 * Mark a concern as shareable with parents.
 *
 * Permission rules:
 * - The logging teacher (concern.logged_by_user_id === userId) can share
 * - Any user with pastoral.view_tier2 can share
 * - Year head for the student's year group can share
 *
 * When share_level is omitted, falls back to tenant_settings.parent_share_default_level.
 *
 * Generates immutable `concern_shared_with_parent` audit event.
 * Optionally dispatches parent notification via CommunicationsModule.
 */
async shareConcernWithParent(
  tenantId: string,
  userId: string,
  membershipId: string,
  concernId: string,
  dto: ShareConcernWithParentDto,
): Promise<{ data: { id: string; parent_shareable: boolean; parent_share_level: string; shared_at: string } }>

/**
 * Revoke parent sharing on a concern.
 * Requires pastoral.view_tier2.
 * Generates immutable `concern_unshared_from_parent` audit event.
 */
async unshareConcernFromParent(
  tenantId: string,
  userId: string,
  concernId: string,
): Promise<{ data: { id: string; parent_shareable: boolean } }>
```

### ParentPastoralService (`parent-pastoral.service.ts`)

This is a NEW service for the parent portal. Follows the same pattern as `BehaviourParentService`:

```typescript
@Injectable()
export class ParentPastoralService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the current user to their parent record.
   * Identical pattern to BehaviourParentService.resolveParent().
   */
  private async resolveParent(tenantId: string, userId: string): Promise<Parent>;

  /**
   * List concerns shared with the parent for their children.
   *
   * Rules:
   * - Only returns concerns where parent_shareable = true
   * - Detail controlled by parent_share_level:
   *   - 'category_only': returns category + date only
   *   - 'category_summary': returns category + date + first 200 chars of narrative
   *   - 'full_detail': returns category + date + full narrative
   * - Author info is NEVER returned (regardless of author_masked flag)
   * - Only returns concerns for students linked to this parent via student_parents
   * - Tier 3 concerns are NEVER returned (even if somehow marked shareable -- defence in depth)
   * - Restricted students (guardian restrictions) return empty
   */
  async getSharedConcerns(
    tenantId: string,
    userId: string,
    query: ParentPastoralQuery,
  ): Promise<{ data: ParentConcernView[]; meta: PaginationMeta }>;

  /**
   * Submit a self-referral about the parent's own child.
   *
   * Creates a Tier 1 pastoral_concern with:
   * - category: provided or 'other'
   * - severity: 'routine'
   * - tier: 1
   * - logged_by_user_id: parent's user_id
   * - source (in audit event): 'parent_self_referral'
   *
   * Assignment: auto-assigned to year head or form tutor (from student's class/year group).
   * If neither can be resolved, assigned to first SST member.
   *
   * Generates `concern_created` audit event with source = 'parent_self_referral'.
   */
  async submitSelfReferral(
    tenantId: string,
    userId: string,
    dto: ParentSelfReferralDto,
  ): Promise<{ data: { id: string; created_at: string } }>;

  /**
   * List intervention plan summaries visible to the parent.
   *
   * Rules:
   * - Only interventions where parent_informed = true
   * - Returns: intervention type, target outcomes, parent's role (parent_input field), status
   * - Does NOT return: SST meeting references, other students' info, internal discussion notes
   * - Does NOT return: case details, case owner, created_by_user_id
   * - Only for students linked to this parent
   */
  async getInterventionSummaries(
    tenantId: string,
    userId: string,
    studentId?: string,
  ): Promise<{ data: ParentInterventionView[] }>;
}
```

---

## Response type definitions

### ParentConcernView (returned to parents)

```typescript
export interface ParentConcernView {
  id: string;
  student_id: string;
  student_name: string;
  category: string;
  severity: string; // always included
  occurred_at: string;
  summary?: string; // included at 'category_summary' or 'full_detail' level
  narrative?: string; // included only at 'full_detail' level
  // NO author_name, NO logged_by, NO tier, NO case_id
}
```

### ParentInterventionView (returned to parents)

```typescript
export interface ParentInterventionView {
  id: string;
  student_id: string;
  student_name: string;
  intervention_type: string;
  continuum_level: number;
  target_outcomes: Array<{ description: string; measurable_target: string }>;
  parent_input: string | null;
  student_voice: string | null;
  status: string;
  next_review_date: string | null;
  // NO case_id, NO case_owner, NO created_by, NO SST details
}
```

### ParentContact (returned to staff)

```typescript
export interface ParentContact {
  id: string;
  student_id: string;
  student_name: string;
  concern_id: string | null;
  case_id: string | null;
  parent_id: string;
  parent_name: string;
  contacted_by_user_id: string;
  contacted_by_name: string;
  contact_method: string;
  contact_date: string;
  outcome: string;
  parent_response: string | null;
  created_at: string;
}
```

---

## Share control permission rules (detailed)

When a user calls `POST /v1/pastoral/concerns/:id/share`:

1. Load the concern. Reject if not found or if `tier = 3` (Tier 3 concerns cannot be shared with parents -- hard rule from master spec).
2. Check permission -- the caller must satisfy at least one:
   a. `concern.logged_by_user_id === userId` (the logging teacher)
   b. The user has `pastoral.view_tier2` permission
   c. The user is the year head for the student's year group (resolved via `staff_profiles.role` + `class_students.class_id -> classes.year_group`)
3. If `dto.share_level` is omitted, load `tenant_settings.pastoral_settings.parent_share_default_level` (default: `'category_only'`).
4. Update the concern: `parent_shareable = true`, `parent_share_level = dto.share_level`, `shared_by_user_id = userId`, `shared_at = now()`.
5. Write immutable audit event: `concern_shared_with_parent` with payload `{ concern_id, share_level, shared_by_user_id }`.
6. If `dto.notify_parent = true`, enqueue a notification job via `CommunicationsModule` to notify the student's parents. The notification contains only the category and a generic message ("A concern about [student name] has been shared with you. Please check the parent portal."), never the narrative.

---

## Tenant settings additions

Added to the `pastoral` section of `tenant_settings.settings` JSONB:

```typescript
// In pastoral settings schema
parent_share_default_level: z.enum(['category_only', 'category_summary', 'full_detail']).default('category_only'),
parent_self_referral_enabled: z.boolean().default(true),
notify_parent_on_share: z.boolean().default(false), // tenant-wide default for notify_parent flag
```

---

## Audit events generated

| Event type                     | Entity type      | Trigger                        | Payload                                                                  |
| ------------------------------ | ---------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `parent_contacted`             | `parent_contact` | Parent contact logged          | `{ parent_contact_id, student_id, parent_id, method, outcome_summary }`  |
| `concern_shared_with_parent`   | `concern`        | Concern marked shareable       | `{ concern_id, share_level, shared_by_user_id }`                         |
| `concern_unshared_from_parent` | `concern`        | Concern sharing revoked        | `{ concern_id, unshared_by_user_id }`                                    |
| `concern_created`              | `concern`        | Parent self-referral submitted | Standard `concern_created` payload with `source: 'parent_self_referral'` |

All events are INSERT-only into `pastoral_events` via `PastoralEventService`.

---

## Defence-in-depth rules (parent portal)

These are non-negotiable security invariants for the parent-facing endpoints:

1. **Tier 3 never visible.** All parent portal queries include `WHERE tier < 3` hardcoded. Even if a Tier 3 concern is somehow marked `parent_shareable = true`, it will not be returned. This is a WHERE clause in the service, not just RLS -- belt and suspenders.

2. **Author never visible.** Parent portal response types do not include `logged_by_user_id` or `logged_by_name`. This is enforced by the `ParentConcernView` type -- the field does not exist on the response shape. Regardless of `author_masked` value, parents never see who logged a concern.

3. **Student linkage enforced.** Every parent portal query includes `WHERE student_id IN (SELECT student_id FROM student_parents WHERE parent_id = :parentId)`. Parents can only see data for their own children.

4. **Guardian restrictions respected.** Before returning any data for a student, check `behaviour_guardian_restrictions` for active restrictions on that parent-student pair (same pattern as `BehaviourParentService.isRestricted()`). If restricted, return empty results for that student with no indication of restriction.

5. **Share level enforced at service layer.** The narrative is truncated or omitted based on `parent_share_level`, not on the client. `category_only` returns no narrative at all. `category_summary` returns first 200 characters. `full_detail` returns the full narrative.

6. **Self-referral creates Tier 1 only.** Parent self-referrals always create `tier = 1`, `severity = 'routine'`. Parents cannot create elevated/urgent/critical concerns or Tier 2/3 concerns.

---

## Test requirements

### Unit tests

| Test | File                                  | Description                                                                              |
| ---- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1    | `parent-contact.service.spec.ts`      | Happy path: log a contact, verify record created and event emitted                       |
| 2    | `parent-contact.service.spec.ts`      | Verify contact linked to concern returns in concern's contact list                       |
| 3    | `parent-contact.service.spec.ts`      | Verify contact linked to case returns in case's contact list                             |
| 4    | `parent-contact.service.spec.ts`      | List contacts with pagination                                                            |
| 5    | `concern.service.spec.ts` (additions) | Share concern: happy path with explicit share_level                                      |
| 6    | `concern.service.spec.ts` (additions) | Share concern: share_level defaults to tenant setting when omitted                       |
| 7    | `concern.service.spec.ts` (additions) | Share concern: rejects Tier 3 concern (403)                                              |
| 8    | `concern.service.spec.ts` (additions) | Share concern: logging teacher can share their own concern                               |
| 9    | `concern.service.spec.ts` (additions) | Share concern: user with pastoral.view_tier2 can share                                   |
| 10   | `concern.service.spec.ts` (additions) | Share concern: user without any qualifying permission gets 403                           |
| 11   | `concern.service.spec.ts` (additions) | Unshare concern: sets parent_shareable = false and emits event                           |
| 12   | `parent-pastoral.service.spec.ts`     | getSharedConcerns: returns only parent_shareable = true concerns                         |
| 13   | `parent-pastoral.service.spec.ts`     | getSharedConcerns: category_only level omits narrative                                   |
| 14   | `parent-pastoral.service.spec.ts`     | getSharedConcerns: category_summary level truncates narrative to 200 chars               |
| 15   | `parent-pastoral.service.spec.ts`     | getSharedConcerns: full_detail level returns complete narrative                          |
| 16   | `parent-pastoral.service.spec.ts`     | getSharedConcerns: never returns author info                                             |
| 17   | `parent-pastoral.service.spec.ts`     | getSharedConcerns: never returns Tier 3 concerns (even if marked shareable)              |
| 18   | `parent-pastoral.service.spec.ts`     | getSharedConcerns: respects guardian restrictions (returns empty for restricted student) |
| 19   | `parent-pastoral.service.spec.ts`     | submitSelfReferral: creates Tier 1 routine concern with parent_self_referral source      |
| 20   | `parent-pastoral.service.spec.ts`     | submitSelfReferral: auto-assigns to year head                                            |
| 21   | `parent-pastoral.service.spec.ts`     | submitSelfReferral: rejects if parent_self_referral_enabled = false                      |
| 22   | `parent-pastoral.service.spec.ts`     | submitSelfReferral: rejects if parent is not linked to student                           |
| 23   | `parent-pastoral.service.spec.ts`     | getInterventionSummaries: returns only parent_informed = true interventions              |
| 24   | `parent-pastoral.service.spec.ts`     | getInterventionSummaries: omits case_id, case_owner, created_by                          |
| 25   | `parent-pastoral.service.spec.ts`     | getInterventionSummaries: empty for restricted students                                  |

### RLS leakage tests

| Test | Description                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 26   | Parent A cannot see concerns shared with Parent B's children                                           |
| 27   | Parent of Student X in Tenant A sees no concerns from Tenant B                                         |
| 28   | Parent portal query for student not linked to parent returns empty (not 404, not other student's data) |
| 29   | Tier 3 concern created for Parent A's child: parent sees nothing (zero discoverability)                |

### Permission tests

| Test | Description                                                                |
| ---- | -------------------------------------------------------------------------- |
| 30   | User without `pastoral.view_tier1` cannot log a parent contact             |
| 31   | User without any qualifying share permission cannot share a concern        |
| 32   | Parent without `pastoral.parent_self_referral` cannot submit self-referral |
| 33   | Parent cannot access staff-facing parent-contact endpoints                 |

### Immutability tests

| Test | Description                                                                             |
| ---- | --------------------------------------------------------------------------------------- |
| 34   | Attempt to UPDATE a pastoral_parent_contacts row -- expect PostgreSQL trigger exception |
| 35   | Attempt to DELETE a pastoral_parent_contacts row -- expect PostgreSQL trigger exception |

---

## Verification checklist

- [ ] Parent contact logging creates append-only record and immutable audit event
- [ ] Parent contacts are queryable by student, concern, and case
- [ ] Share control marks concern as shareable and emits `concern_shared_with_parent` event
- [ ] Share control respects permission rules (logging teacher, view_tier2, year head)
- [ ] Share control rejects Tier 3 concerns
- [ ] Unshare reverts `parent_shareable = false` and emits audit event
- [ ] Default share level falls back to tenant setting
- [ ] Parent portal returns only shareable concerns for linked children
- [ ] Parent portal narrative detail respects `parent_share_level`
- [ ] Parent portal never exposes author information
- [ ] Parent portal never exposes Tier 3 concerns
- [ ] Guardian restrictions suppress data for restricted students
- [ ] Parent self-referral creates Tier 1 routine concern
- [ ] Parent self-referral auto-assigns to year head or form tutor
- [ ] Parent self-referral respects `parent_self_referral_enabled` setting
- [ ] Parent self-referral rejected for unlinked students
- [ ] Intervention summaries visible only when `parent_informed = true`
- [ ] Intervention summaries omit internal fields (case_id, owner, SST details)
- [ ] Optional parent notification dispatched when `notify_parent = true`
- [ ] All RLS leakage tests pass
- [ ] All permission tests pass
- [ ] Immutability trigger prevents UPDATE/DELETE on parent contacts
- [ ] `turbo test` passes with no regressions

---

## Files created / modified

| Action | File path                                                                 | Description                                                             |
| ------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| CREATE | `apps/api/src/modules/pastoral/controllers/parent-contacts.controller.ts` | Staff-facing parent contact logging endpoints                           |
| CREATE | `apps/api/src/modules/pastoral/controllers/parent-pastoral.controller.ts` | Parent-facing portal endpoints                                          |
| CREATE | `apps/api/src/modules/pastoral/services/parent-contact.service.ts`        | Append-only parent contact logging + audit events                       |
| CREATE | `apps/api/src/modules/pastoral/services/parent-pastoral.service.ts`       | Parent portal: shared concerns, self-referral, intervention summaries   |
| MODIFY | `apps/api/src/modules/pastoral/services/concern.service.ts`               | Add `shareConcernWithParent()` and `unshareConcernFromParent()` methods |
| MODIFY | `apps/api/src/modules/pastoral/controllers/concerns.controller.ts`        | Add share/unshare endpoints                                             |
| MODIFY | `apps/api/src/modules/pastoral/pastoral.module.ts`                        | Register new controllers and services                                   |
| CREATE | `packages/shared/src/pastoral/schemas/parent-engagement.schema.ts`        | Zod schemas for parent engagement                                       |
| MODIFY | `packages/shared/src/pastoral/schemas/index.ts`                           | Re-export parent engagement schemas                                     |
| CREATE | `apps/api/src/modules/pastoral/services/parent-contact.service.spec.ts`   | Unit tests for parent contact service                                   |
| CREATE | `apps/api/src/modules/pastoral/services/parent-pastoral.service.spec.ts`  | Unit tests for parent portal service                                    |
| MODIFY | `apps/api/src/modules/pastoral/services/concern.service.spec.ts`          | Additional tests for share/unshare                                      |
| MODIFY | `packages/prisma/seed/permissions.ts`                                     | Verify `pastoral.parent_self_referral` exists (should exist from SW-1B) |
