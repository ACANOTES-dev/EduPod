# Implementation 05 — Admin Oversight Service

> **Wave:** 2 (parallel with 02, 03, 04)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Build the **privileged oversight surface** that lets Owner / Principal / Vice Principal read every conversation in their tenant, freeze threads, dismiss safeguarding flags, and export threads for offline review. Every oversight read is **audit-logged** to `oversight_access_log` so misuse is traceable.

This is a separate service from the regular conversations service because the access pattern is **completely different** — oversight reads bypass the participant filter and have looser RLS scoping (still tenant-scoped, but not user-scoped).

## What to build

### 1. `InboxOversightService`

`apps/api/src/modules/inbox/oversight/inbox-oversight.service.ts`

Public surface:

```ts
async listAllConversations(input: {
  tenantId: string;
  actorUserId: string;
  filter: {
    kind?: ConversationKind;
    fromDate?: Date;
    toDate?: Date;
    participantUserId?: string;
    hasFlags?: boolean;
    frozen?: boolean;
  };
  pagination: { page: number; pageSize: number };
}): Promise<Paginated<OversightThreadSummary>>;

async getThread(input: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
}): Promise<OversightThreadDetail>;

async searchAll(input: {
  tenantId: string;
  actorUserId: string;
  query: string;
  pagination: { page: number; pageSize: number };
}): Promise<Paginated<OversightSearchHit>>;

async freezeConversation(input: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
  reason: string;
}): Promise<void>;

async unfreezeConversation(input: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
}): Promise<void>;

async dismissFlag(input: {
  tenantId: string;
  actorUserId: string;
  flagId: string;
  notes: string;
}): Promise<void>;

async escalateFlag(input: {
  tenantId: string;
  actorUserId: string;
  flagId: string;
  notes: string;
}): Promise<{ export_url: string }>;

async exportThread(input: {
  tenantId: string;
  actorUserId: string;
  conversationId: string;
}): Promise<{ export_url: string }>;

async listAuditLog(input: {
  tenantId: string;
  pagination: { page: number; pageSize: number };
}): Promise<Paginated<OversightAuditEntry>>;
```

### 2. Oversight reads bypass participant filter

The regular `ConversationsService.getThread` enforces "you must be a participant". The oversight equivalent **does not** — it returns any conversation in the tenant regardless of whether the actor is a participant. This is the privileged read.

The RLS layer still scopes to `tenant_id`, so cross-tenant leakage is impossible. The participant filter is the ONLY thing being relaxed.

Every read writes an `oversight_access_log` row with `action = 'read_thread'` and the conversation ID. The audit log is immutable — no UPDATE / DELETE on the table from the app layer.

### 3. The audit log writes

`OversightAuditService` (a small helper) handles every audit insert:

```ts
async log(input: {
  tenantId: string;
  actorUserId: string;
  action: OversightAction;
  conversationId?: string;
  messageFlagId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void>;
```

Called from every oversight method. The insert is part of the same RLS transaction as the read it audits — so a successful read always has a matching log entry. If the audit insert fails, the read fails too. (This is intentional: a read with no audit entry is worse than no read.)

### 4. `freezeConversation`

```
1. Verify actor is admin tier (controller-level @RequiresPermission('inbox.oversight.write')).
2. Inside an interactive RLS transaction:
   a. Load conversation. If frozen_at != null → ALREADY_FROZEN.
   b. UPDATE conversations SET frozen_at = now(), frozen_by_user_id = actor, freeze_reason = reason.
   c. INSERT message into the conversation as a system event:
      sender_user_id = a special SYSTEM_USER_SENTINEL (re-use the existing platform sentinel),
      body = "🔒 This conversation has been disabled by school administration. Please contact the office for further communication.",
      metadata_json = { event: 'frozen', reason, by_user_id }.
      This message is visible to all participants — both sides see "the chat has been disabled" inline.
   d. INSERT oversight_access_log (action = 'freeze').
3. ENQUEUE inbox notifications to all participants ("This conversation has been disabled").
```

`unfreezeConversation` is the mirror — clears `frozen_at` / `frozen_by_user_id` / `freeze_reason`, posts a system message ("Conversation re-enabled"), audit logs.

### 5. Flag actions

`dismissFlag`:

```
1. Load message_flag.
2. UPDATE review_state = 'dismissed', reviewed_by_user_id = actor, reviewed_at = now(), review_notes = notes.
3. INSERT oversight_access_log (action = 'dismiss_flag').
```

`escalateFlag`:

```
1. Load message_flag.
2. UPDATE review_state = 'escalated', reviewed_by, reviewed_at, review_notes.
3. Generate a PDF export of the parent conversation (calls exportThread internally).
4. INSERT oversight_access_log (action = 'escalate_flag').
5. Return the export URL.
```

`exportThread`:

```
1. Verify actor is admin tier.
2. Load conversation + all messages (including soft-deleted) + edit history + attachments.
3. Generate a PDF using the existing PDF generation helper (or a new minimal one if none exists — see "watch out").
   Layout: header with school name, conversation subject, kind, participant list, frozen status, then chronological message list.
   For deleted messages: "[deleted at <timestamp>]" with the original body in italics.
   Edited messages: show edit history inline.
4. Upload to existing storage facade with a private signed URL (1-hour expiry).
5. INSERT oversight_access_log (action = 'export_thread').
6. Return { export_url }.
```

### 6. Search

`searchAll` queries the `messages.body_search` tsvector across the entire tenant (not scoped to participating threads). The actual full-text search engine lives in impl 09; this implementation declares the dependency by importing `InboxSearchService.search(tenantId, query, pagination, { scope: 'tenant' })` once 09 lands.

For now, **stub the search call** with a structured `503 SERVICE_UNAVAILABLE` returning `{ code: 'INBOX_SEARCH_NOT_READY', message: 'Search will be enabled when impl 09 deploys.' }`. The frontend (impl 15) handles this gracefully.

Once impl 09 is on production, swap the stub for the real call (either as part of impl 09's deployment or a follow-up patch).

### 7. Controller

`apps/api/src/modules/inbox/oversight/inbox-oversight.controller.ts`

```
GET    /v1/inbox/oversight/conversations                          → listAllConversations
GET    /v1/inbox/oversight/conversations/:id                       → getThread
GET    /v1/inbox/oversight/search?q=...                            → searchAll (stubbed until 09)
POST   /v1/inbox/oversight/conversations/:id/freeze                → freezeConversation
POST   /v1/inbox/oversight/conversations/:id/unfreeze              → unfreezeConversation
POST   /v1/inbox/oversight/conversations/:id/export                → exportThread
GET    /v1/inbox/oversight/flags                                   → list pending message_flags (paginated)
POST   /v1/inbox/oversight/flags/:id/dismiss                       → dismissFlag
POST   /v1/inbox/oversight/flags/:id/escalate                      → escalateFlag
GET    /v1/inbox/oversight/audit-log                               → listAuditLog
```

All behind `@RequiresPermission('inbox.oversight.read')` for reads and `inbox.oversight.write` for writes.

The controller-level guard checks the platform role too — even if a non-admin somehow had the permission key (e.g. via a custom role), the guard rejects:

```ts
@UseGuards(AuthGuard, PermissionGuard, AdminTierOnlyGuard)
```

Create a small new guard `apps/api/src/modules/inbox/common/admin-tier-only.guard.ts` that checks the requesting user's platform role is in `['SchoolOwner', 'Principal', 'VicePrincipal']`. This is belt-and-braces for the most sensitive surface in the rebuild.

### 8. Pending flags listing

The `GET /v1/inbox/oversight/flags` endpoint is the **review queue** for safeguarding alerts. Order by `created_at DESC`, filter by `review_state = 'pending'` by default. Include: matched keywords, severity, the message body preview (first 200 chars, **not** the full body to keep the queue page light), the conversation participants, the timestamp, and a `review_url` deep link.

Pagination is required — busy schools can have hundreds of flags.

## Tests

`inbox-oversight.service.spec.ts`:

- listAllConversations: returns conversations the actor is NOT a participant in (the privileged-read property)
- listAllConversations: still RLS-scoped to tenant (cross-tenant leakage test)
- getThread: returns deleted messages with original body for admin actor
- getThread: writes an audit_log entry on every call
- freezeConversation: sets frozen_at, posts system message, audit-logged
- freezeConversation: idempotent on already-frozen
- unfreezeConversation: clears frozen_at, posts system message
- dismissFlag: updates review_state, audit-logged
- escalateFlag: returns export URL, audit-logged
- exportThread: generates a PDF, returns signed URL, audit-logged
- searchAll: returns 503 INBOX_SEARCH_NOT_READY (stub state)
- listAuditLog: returns recent log entries, paginated, ordered by created_at desc

`admin-tier-only.guard.spec.ts`:

- Allows SchoolOwner / Principal / VicePrincipal
- Rejects Teacher / Office / Parent / Student with 403
- Rejects unauthenticated with 401

## Watch out for

- **The audit log is the integrity backbone.** If you skip the audit-log insert in any oversight method, you've created an untraceable read. Test for the audit row in every test that exercises an oversight method.
- **The system message on freeze** uses a special sender. The platform already has a `SYSTEM_USER_SENTINEL` constant (used by the audit interceptor) — reuse it. If it doesn't exist on the inbox path, create one and reference it from `packages/shared/src/inbox/constants.ts`.
- **PDF generation.** If the platform doesn't already have a PDF helper, the simplest path is `pdfkit` (lightweight, already a transitive dep in some places). Don't pull in `puppeteer` or `playwright` for this — those are heavy and unnecessary for a text-only export. Wrap the PDF generation in a small helper service so impl 14 (safeguarding) can reuse it.
- **The `AdminTierOnlyGuard` is the only guard with role hardcoding.** Don't be tempted to make it configurable. Oversight is the most sensitive surface in the system; the role list is locked.
- **Don't expose the audit log via a public-facing endpoint.** It's accessible only via `/v1/inbox/oversight/audit-log`, which is itself behind `inbox.oversight.read`.
- **Idempotency on freeze/unfreeze.** Re-freezing an already-frozen conversation should be a no-op (return 200 with the existing freeze metadata), not throw. Same for unfreeze on a non-frozen conversation. Test both.

## Deployment notes

- API restart only.
- Smoke test:
  - As Principal: `GET /v1/inbox/oversight/conversations` → returns the tenant's conversations (initially empty).
  - As Principal: `GET /v1/inbox/oversight/audit-log` → returns the audit log entries (every prior `GET /v1/inbox/oversight/conversations` call is logged).
  - As a teacher: `GET /v1/inbox/oversight/conversations` → 403 from `AdminTierOnlyGuard`.
  - Create a test conversation, then `POST /v1/inbox/oversight/conversations/:id/freeze` as Principal → conversation has `frozen_at` set; participants see the system message.
