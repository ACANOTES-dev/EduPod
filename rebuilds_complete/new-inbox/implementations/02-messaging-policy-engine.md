# Implementation 02 — Messaging Policy Engine

> **Wave:** 2 (parallel with 03, 04, 05)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Build the **single chokepoint** that decides whether a given user can send a given message to a given recipient. Every send path in the inbox routes through this service. It encodes the three layers from `PLAN.md` §4: the tenant-configurable role-pair grid, the hard-coded relational scopes, and the global kill switches. It also encodes the **reply override** — recipients of a message with `allow_replies = true` may reply on that thread regardless of the matrix.

## What to build

### 1. Module setup

Create `apps/api/src/modules/inbox/inbox.module.ts` (the parent module — Wave 2 impls 02/03/04/05 each contribute providers and exports). For this implementation, register:

- `MessagingPolicyService`
- `RelationalScopeResolver`
- `MessagingPolicyReadFacade`
- `TenantMessagingPolicyRepository`

Imports needed: `PrismaModule`, `AuthModule` (for `UsersReadFacade`), `ClassesModule` (for the relational lookups — confirm via the no-cross-module-prisma rule and use the existing `ClassesReadFacade`), `StudentsModule`, `ParentsModule`, `TenantsModule`.

### 2. `MessagingPolicyService`

`apps/api/src/modules/inbox/policy/messaging-policy.service.ts`

Public surface — exactly two methods:

```ts
async canStartConversation(input: {
  tenantId: string;
  senderUserId: string;
  recipientUserIds: string[];   // 1 for direct, 2-50 for group, N for broadcast
  conversationKind: ConversationKind;
}): Promise<PolicyDecision>;

async canReplyToConversation(input: {
  tenantId: string;
  senderUserId: string;
  conversationId: string;
}): Promise<PolicyDecision>;
```

Where:

```ts
type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: PolicyDenialCode; deniedRecipientIds?: string[] };

type PolicyDenialCode =
  | 'MESSAGING_DISABLED_FOR_TENANT'
  | 'STUDENT_INITIATION_DISABLED'
  | 'PARENT_INITIATION_DISABLED'
  | 'ROLE_PAIR_NOT_ALLOWED'
  | 'RELATIONAL_SCOPE_VIOLATED'
  | 'PARENT_TO_PARENT_DISABLED'
  | 'STUDENT_TO_STUDENT_DISABLED'
  | 'STUDENT_TO_PARENT_DISABLED'
  | 'CONVERSATION_FROZEN'
  | 'NOT_PARTICIPANT'
  | 'REPLIES_NOT_ALLOWED_ON_BROADCAST';
```

### 3. Algorithm — `canStartConversation`

```
1. Load tenant inbox settings.
   - If !messaging_enabled → MESSAGING_DISABLED_FOR_TENANT.

2. Resolve sender's MessagingRole via the role-mapping (see RoleMappingService).

3. Apply global kill switches first (cheapest, narrowest):
   - sender = student && !students_can_initiate → STUDENT_INITIATION_DISABLED
   - sender = parent  && !parents_can_initiate  → PARENT_INITIATION_DISABLED

4. Load the tenant's full messaging policy matrix once (cached for 5 minutes per tenant).

5. For each recipient_user_id:
   a. Resolve recipient's MessagingRole.
   b. Look up the (sender_role, recipient_role) cell. If false → ROLE_PAIR_NOT_ALLOWED, push to deniedRecipientIds.
   c. Apply the symmetric kill switches:
      - parent → parent and !parent_to_parent_messaging → PARENT_TO_PARENT_DISABLED
      - student → student and !student_to_student_messaging → STUDENT_TO_STUDENT_DISABLED
      - student → parent and !student_to_parent_messaging → STUDENT_TO_PARENT_DISABLED
   d. Apply relational scope via RelationalScopeResolver.canReach(senderUserId, recipientUserId, senderRole, recipientRole).
      If false → RELATIONAL_SCOPE_VIOLATED, push to deniedRecipientIds.

6. If deniedRecipientIds is empty → { allowed: true }.
   If non-empty → { allowed: false, reason: <first reason encountered>, deniedRecipientIds }.

For broadcasts (recipientUserIds.length > 50, or kind === 'broadcast'):
- Skip the per-recipient relational scope check (broadcasts are admin-tier-only by default;
  the matrix already gates them). RelationalScopeResolver returns true for admin tier
  unconditionally.
- For non-admin senders attempting a broadcast (e.g. teacher → year_group_parents),
  apply the relational scope to the audience as a SET: e.g. teacher must teach at least
  one student in each recipient. The resolver has a batch method
  canReachBatch(senderUserId, recipientUserIds, senderRole, recipientRole) → Set<string>
  that returns the subset they cannot reach.
```

### 4. Algorithm — `canReplyToConversation`

```
1. Load conversation. If frozen_at != null → CONVERSATION_FROZEN.
2. Load conversation_participants. If sender is not a participant → NOT_PARTICIPANT.
3. If conversation.kind === 'direct' → allowed (both sides can always reply on direct).
4. If conversation.kind === 'group' → allowed (all participants can always reply on group).
5. If conversation.kind === 'broadcast':
   - If sender_user_id === conversation.created_by_user_id → allowed (the sender of a
     broadcast can always reply to it themselves; this is how they fan into the per-recipient
     1↔1 reply threads).
   - If !conversation.allow_replies → REPLIES_NOT_ALLOWED_ON_BROADCAST.
   - Otherwise → allowed. (Note: the conversations service spawns a new direct thread
     when a broadcast recipient replies; this method only governs the policy check.)
```

The reply path is **the only way** parents and students can write into the system by default. Lock it down precisely.

### 5. `RelationalScopeResolver`

`apps/api/src/modules/inbox/policy/relational-scope.resolver.ts`

This is the hard-coded second layer. It MUST be the same logic for every tenant — the only configuration knobs are in the matrix and kill switches, not here.

Public surface:

```ts
async canReach(
  senderUserId: string,
  recipientUserId: string,
  senderRole: MessagingRole,
  recipientRole: MessagingRole,
  tenantId: string,
): Promise<boolean>;

async canReachBatch(
  senderUserId: string,
  recipientUserIds: string[],
  senderRole: MessagingRole,
  recipientRole: MessagingRole,
  tenantId: string,
): Promise<{ reachable: Set<string>; unreachable: Set<string> }>;
```

Implement the rules from `PLAN.md` §4 Layer 2 verbatim:

| sender → recipient            | rule                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| admin tier → \*               | always reachable                                                                       |
| office → \*                   | always reachable                                                                       |
| finance → \*                  | always reachable                                                                       |
| nurse → \*                    | always reachable                                                                       |
| teacher → teacher             | always reachable                                                                       |
| teacher → parent              | recipient must be a parent of a student in a class taught by sender (active enrolment) |
| teacher → student             | recipient must be a student in a class taught by sender (active enrolment)             |
| parent → admin tier           | always reachable                                                                       |
| parent → office/finance/nurse | always reachable                                                                       |
| parent → teacher              | recipient must teach a class containing a child of sender (active enrolment)           |
| student → admin tier          | always reachable                                                                       |
| student → teacher             | recipient must teach the sender's class (active enrolment)                             |
| any → unmapped                | false (default deny)                                                                   |

The resolver delegates the lookups to existing read facades (`ClassesReadFacade`, `StudentReadFacade`, `ParentReadFacade`) — **never** reach into another module's Prisma directly. Use the batch variants where they exist; if a batch variant doesn't exist for a needed query, add it to the upstream module's read facade as part of this implementation.

Cache scope checks per request: build a small request-scoped `Map<string, boolean>` keyed on `<senderId>:<recipientId>:<senderRole>:<recipientRole>` so the same teacher checking 30 students doesn't refetch the class roster 30 times.

### 6. `RoleMappingService`

`apps/api/src/modules/inbox/policy/role-mapping.service.ts`

Maps the platform's role system to the `MessagingRole` enum. Stub `packages/shared/src/inbox/role-mapping.ts` from impl 01 is the source map. Examples:

```ts
PLATFORM_ROLE_TO_MESSAGING_ROLE = {
  SchoolOwner: 'owner',
  Principal: 'principal',
  VicePrincipal: 'vice_principal',
  HeadOfYear: 'teacher', // HoYs are teachers for messaging purposes
  HeadOfDepartment: 'teacher',
  Teacher: 'teacher',
  OfficeStaff: 'office',
  FinanceStaff: 'finance',
  SchoolNurse: 'nurse',
  Parent: 'parent',
  Student: 'student',
  // ...
};
```

If a user has multiple platform roles, the mapping picks the **most permissive** one (admin tier > teacher > office/finance/nurse > parent > student). Document this rule with a comment in the file.

Expose:

```ts
async resolveMessagingRole(tenantId: string, userId: string): Promise<MessagingRole>;
async resolveMessagingRolesBatch(tenantId: string, userIds: string[]): Promise<Map<string, MessagingRole>>;
```

Cache per-request.

### 7. `TenantMessagingPolicyRepository`

Thin wrapper around the `tenant_messaging_policy` table. Methods:

```ts
async getMatrix(tenantId: string): Promise<Map<`${MessagingRole}:${MessagingRole}`, boolean>>;
async setCell(tenantId: string, sender: MessagingRole, recipient: MessagingRole, allowed: boolean): Promise<void>;
async resetToDefaults(tenantId: string): Promise<void>;
```

`getMatrix` is cached for 5 minutes per tenant via in-memory LRU (use the existing platform pattern). `setCell` invalidates the cache for that tenant.

### 8. Settings controller — read-only in this impl

`apps/api/src/modules/inbox/settings/inbox-settings.controller.ts`

Just expose **read** endpoints for now. The mutation endpoints land alongside the settings UI in Wave 4 (impl 13).

```
GET  /v1/inbox/settings/policy           → returns the matrix as a 2D dict
GET  /v1/inbox/settings/inbox            → returns the tenant_settings_inbox row
```

Both behind `@RequiresPermission('inbox.settings.read')`.

### 9. New permissions

Add to the seed (`packages/prisma/seed/system-roles.ts`) the new permission keys:

- `inbox.settings.read`
- `inbox.settings.write`
- `inbox.send` (general send permission — most roles get it)
- `inbox.oversight.read` (admin tier only — used by impl 05)
- `inbox.oversight.write` (admin tier only — used by impl 05)

Wire them onto the existing system roles. Owner / Principal / VP get all five. Office / Finance / Nurse / Teacher get `inbox.send` only. Parent / Student get `inbox.send` only.

## Tests

`messaging-policy.service.spec.ts` — at least these scenarios:

- Tenant with `messaging_enabled = false` → blocks any send → `MESSAGING_DISABLED_FOR_TENANT`
- Default tenant matrix: parent attempting to start a conversation with a teacher → `PARENT_INITIATION_DISABLED`
- Default tenant matrix: student attempting to message anyone → `STUDENT_INITIATION_DISABLED`
- Tenant with `parents_can_initiate = true` and `parent → teacher` cell true: parent → their child's teacher → allowed
- Same as above but parent → another parent's teacher → `RELATIONAL_SCOPE_VIOLATED`
- Teacher → parent of student in their class → allowed
- Teacher → parent of student NOT in their class → `RELATIONAL_SCOPE_VIOLATED`
- Principal → any user → allowed
- Tenant with `parent_to_parent_messaging = false` and `parent → parent` cell true: parent → parent → `PARENT_TO_PARENT_DISABLED`
- Reply on a frozen conversation → `CONVERSATION_FROZEN`
- Reply on a broadcast where `allow_replies = false` from a recipient → `REPLIES_NOT_ALLOWED_ON_BROADCAST`
- Reply on a broadcast where `allow_replies = true` from a recipient → allowed
- Reply on a direct conversation from a non-participant → `NOT_PARTICIPANT`

`relational-scope.resolver.spec.ts`:

- Admin tier always reachable
- Teacher reaches own students' parents but not other teachers' students' parents
- Parent reaches own children's teachers but not unrelated teachers
- Student reaches teachers of their own class only
- Batch variant returns correct `reachable` / `unreachable` partitioning across mixed cases
- Inactive enrolment: not reachable

`role-mapping.service.spec.ts`:

- Multi-role user gets most permissive mapping
- Unknown platform role → throws `UNKNOWN_PLATFORM_ROLE`
- Batch resolves N users in 1 query

## Watch out for

- **Default deny.** The matrix uses `false` as the default for unmapped pairs. The cell lookup must distinguish "row exists, value is false" from "row missing" — both treated as deny.
- **Caching scopes.** Per-tenant matrix cache lives 5 minutes. Per-request relational scope cache lives for the request only. Don't mix the two — a stale per-request cache across requests is a privacy bug.
- **Performance.** A teacher composing a message to "all parents in my classes" might have 60 recipients. The batch path (`canReachBatch`) MUST do one round-trip to the DB, not 60. Validate with a query log assertion in the test.
- **Relational scope on broadcasts.** When a teacher fans out a `class_parents` broadcast, the audience resolver (impl 03) already produced a list of parents who are valid recipients per the relational rule. Skip the per-recipient relational check in that path or you'll double-spend queries. Use a `skipRelationalCheck: true` flag on the policy call from the broadcast send path; document the assumption.
- **Frozen conversations.** Always check `frozen_at` first on the reply path — it's the cheapest disqualification.
- **Module DI verification.** This impl adds new providers to `InboxModule`. Run the DI verification command from `CLAUDE.md` before pushing to confirm `AppModule` boots cleanly with the new imports.

## Deployment notes

- API restart only.
- After deploy: hit `GET /v1/inbox/settings/policy` as Principal to confirm the matrix returns 81 cells with the seeded defaults.
- Hit `GET /v1/inbox/settings/inbox` as Principal to confirm the settings row exists with defaults.
