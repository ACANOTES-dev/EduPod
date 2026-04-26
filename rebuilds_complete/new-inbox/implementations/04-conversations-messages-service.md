# Implementation 04 — Conversations + Messages Service

> **Wave:** 2 (parallel with 02, 03, 05)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Build the **core inbox service**: conversation creation (direct / group / broadcast), message send + edit + delete + attachments, participant management, read receipts, and unread counts. This is the largest service in the rebuild and the spine that every UI and integration calls.

The policy engine (impl 02) and audience engine (impl 03) are coded in parallel — this implementation **expects them to exist** and imports them. If you're running this and 02 or 03 isn't done yet, STOP and run those first.

## What to build

### 1. The conversations service

`apps/api/src/modules/inbox/conversations/conversations.service.ts`

Public surface:

```ts
// ─── Conversation creation ────────────────────────────────────────────────────
async createDirect(input: {
  tenantId: string;
  senderUserId: string;
  recipientUserId: string;
  body: string;
  attachments: AttachmentInput[];
  extraChannels: ExtraChannel[];      // ['email', 'sms', 'whatsapp']
  disableFallback: boolean;
}): Promise<{ conversation_id: string; message_id: string }>;

async createGroup(input: {
  tenantId: string;
  senderUserId: string;
  recipientUserIds: string[];
  subject: string;
  body: string;
  attachments: AttachmentInput[];
  extraChannels: ExtraChannel[];
  disableFallback: boolean;
}): Promise<{ conversation_id: string; message_id: string }>;

async createBroadcast(input: {
  tenantId: string;
  senderUserId: string;
  audienceDefinition: AudienceDefinition;
  savedAudienceId?: string;
  subject: string;
  body: string;
  attachments: AttachmentInput[];
  allowReplies: boolean;
  extraChannels: ExtraChannel[];
  disableFallback: boolean;
}): Promise<{
  conversation_id: string;
  message_id: string;
  resolved_recipient_count: number;
}>;

// ─── Replies ──────────────────────────────────────────────────────────────────
async sendReply(input: {
  tenantId: string;
  senderUserId: string;
  conversationId: string;
  body: string;
  attachments: AttachmentInput[];
  extraChannels: ExtraChannel[];
  disableFallback: boolean;
}): Promise<{ message_id: string; spawned_conversation_id?: string }>;

// ─── Reads ────────────────────────────────────────────────────────────────────
async markRead(tenantId: string, userId: string, conversationId: string): Promise<void>;
async markAllRead(tenantId: string, userId: string): Promise<void>;

// ─── Listing ──────────────────────────────────────────────────────────────────
async listInbox(input: {
  tenantId: string;
  userId: string;
  filter: {
    archived?: boolean;
    unreadOnly?: boolean;
    type?: ConversationKind;
  };
  pagination: { page: number; pageSize: number };
}): Promise<Paginated<InboxThreadSummary>>;

async getThread(tenantId: string, userId: string, conversationId: string, pagination: { page: number; pageSize: number }): Promise<ThreadDetail>;

async getInboxState(tenantId: string, userId: string): Promise<{
  unread_total: number;
  latest_message_at: Date | null;
}>;

// ─── Mute / archive ───────────────────────────────────────────────────────────
async setMuted(tenantId: string, userId: string, conversationId: string, muted: boolean): Promise<void>;
async setArchived(tenantId: string, userId: string, conversationId: string, archived: boolean): Promise<void>;
```

### 2. Algorithm — `createDirect`

```
1. Resolve sender + recipient roles via RoleMappingService.
2. Call MessagingPolicyService.canStartConversation({
     tenantId, senderUserId, recipientUserIds: [recipient],
     conversationKind: 'direct'
   }).
   If !allowed → throw ForbiddenException with the reason code.

3. Check for an EXISTING active direct conversation between sender and recipient
   in this tenant — if one exists, append to it instead of creating a duplicate.
   "Active" means archived_at IS NULL on at least one of the two participant rows.
   This prevents N parallel direct threads cluttering both inboxes.

4. Inside an interactive RLS transaction:
   a. INSERT conversation (kind = direct, created_by = sender, allow_replies = true).
   b. INSERT 2 conversation_participants (sender + recipient), unread_count = 0 for sender, 1 for recipient.
   c. INSERT message (sender, body, attachment_count = N).
   d. INSERT N message_attachments rows, linking storage keys (validate via existing storage facade).
   e. UPDATE conversation.last_message_at = now().
   f. ENQUEUE 'inbox:dispatch-channels' BullMQ job with { tenant_id, message_id, extra_channels, disable_fallback }
      — the inbox channel itself is already done (the rows exist); the job handles SMS / Email / WhatsApp fan-out.
      (See impl 06 for the dispatcher integration; for v1 of this impl, enqueue the job even
      if 06 isn't deployed — it'll just sit on the queue.)
   g. ENQUEUE 'safeguarding:scan-message' BullMQ job with { tenant_id, message_id }.

5. Return { conversation_id, message_id }.
```

### 3. Algorithm — `createGroup`

Similar to direct, but:

- Validate `2 ≤ recipientUserIds.length ≤ 49` (sender + 49 recipients = 50 participant cap).
- Subject is required and validated (1-255 chars).
- Policy check is per-recipient — if any recipient is denied, the WHOLE group send fails with the per-recipient denial list. (Don't silently drop denied recipients.)
- Always create a fresh conversation (no dedupe — group conversations aren't deduped on participant set).
- All participants get `unread_count = 1` initially; sender gets `0` because they'll see it on send.
- One BullMQ dispatch + one safeguarding scan, same as direct.

### 4. Algorithm — `createBroadcast`

```
1. Resolve sender role.
2. If sender role is not admin tier (owner / principal / vp / office / finance / nurse / teacher) → DENY at the controller layer with @RequiresPermission('inbox.send').
   (Parents and students can never start broadcasts even if some matrix configuration would otherwise allow it. Enforced at the policy layer.)

3. Resolve the audience via AudienceResolutionService.resolve(tenantId, definition).
   - If user provided savedAudienceId, fetch the definition first and resolve through it.
   - The result is { user_ids: string[], resolved_at, definition }.

4. Run a SET-mode policy check via canStartConversation with conversationKind: 'broadcast' and the resolved user_ids as recipients.
   - For admin tier sender, this is fast-tracked (no relational scope).
   - For teacher sender (e.g. teacher → class_parents broadcast), the policy service uses canReachBatch and FILTERS the audience to the reachable subset (does not throw). Document this divergence from createGroup: broadcasts soft-filter, group sends hard-fail.
   - If the filtered audience is empty, throw BROADCAST_AUDIENCE_EMPTY with the original count vs filtered count for the UI to display.

5. Inside a single interactive RLS transaction:
   a. INSERT conversation (kind = broadcast, created_by = sender, subject, allow_replies).
   b. INSERT broadcast_audience_definitions row (definition_json, saved_audience_id).
   c. INSERT broadcast_audience_snapshots row (recipient_user_ids = filtered list, resolved_count).
   d. INSERT N+1 conversation_participants (sender + N filtered recipients).
      - Sender gets unread_count = 0.
      - Recipients get unread_count = 1.
   e. INSERT message (sender, body).
   f. INSERT N attachments.
   g. UPDATE conversation.last_message_at = now().
   h. ENQUEUE 'inbox:dispatch-channels' (extra_channels) — once per broadcast.
   i. ENQUEUE 'safeguarding:scan-message'.

6. Return { conversation_id, message_id, resolved_recipient_count }.
```

### 5. Algorithm — `sendReply`

```
1. Load conversation (must be in tenant). Throw NOT_FOUND if missing.
2. Call MessagingPolicyService.canReplyToConversation(conversationId, senderUserId).
   If !allowed → throw with reason.

3. SPECIAL CASE — broadcast reply by a non-sender recipient with allow_replies = true:
   - Check if this is the FIRST reply by this user on this broadcast.
   - If first: open an interactive RLS transaction and:
     a. CREATE a new direct conversation between recipient and broadcast.created_by_user_id.
        (Reuses createDirect logic but skips the dedupe check — this direct is explicitly
        a reply spawn even if a direct between the two already exists.)
     b. The first message in the new direct quotes / references the broadcast (store as a
        soft pointer in messages.metadata_json.in_reply_to_broadcast_message_id — add this
        column in impl 01 if missing; if it's missing, store as a normal text quote in body
        and add the column in a follow-up).
     c. Return { message_id, spawned_conversation_id }.
   - If not first: append to the existing spawned direct (look it up by the
     in_reply_to_broadcast_message_id pointer + sender pair).

4. NORMAL REPLY (direct, group, broadcast-by-original-sender):
   a. INSERT message in the existing conversation.
   b. INSERT attachments.
   c. UPDATE participants: increment unread_count for everyone except the sender; reset sender's last_read_at.
   d. UPDATE conversation.last_message_at.
   e. ENQUEUE 'inbox:dispatch-channels' and 'safeguarding:scan-message'.

5. Return { message_id, spawned_conversation_id? }.
```

**Important — schema add for impl 01:** the `messages` table needs an optional `metadata_json Jsonb?` column to carry the broadcast-reply-link pointer. Add it in impl 01 — already covered in the schema spec but called out here so the dependency is clear.

### 6. Read state, mute, archive

`markRead`:

- UPDATE `conversation_participants SET unread_count = 0, last_read_at = now() WHERE conversation_id = ? AND user_id = ?`.
- UPSERT `message_reads` rows for every unread message in the thread (one query, `INSERT ... SELECT ... ON CONFLICT DO NOTHING`).
- Single interactive RLS transaction.

`markAllRead`:

- UPDATE all participants for the user, set `unread_count = 0`, `last_read_at = now()`.
- Don't bulk-upsert message_reads — too expensive. Mark them implicitly via the `last_read_at` cutoff when the read facade returns thread state.

`setMuted` / `setArchived`:

- Simple updates on the participant row.

### 7. Listing — `listInbox`

```sql
SELECT
  c.id, c.kind, c.subject, c.last_message_at, c.frozen_at,
  cp.unread_count, cp.muted_at, cp.archived_at,
  -- latest message preview
  (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS preview,
  (SELECT u.display_name FROM messages m JOIN users u ON u.id = m.sender_user_id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS preview_sender_name
FROM conversation_participants cp
JOIN conversations c ON c.id = cp.conversation_id
WHERE cp.user_id = $1
  AND cp.tenant_id = $2
  AND ($3::bool IS NULL OR (cp.archived_at IS NOT NULL) = $3)
  AND ($4::bool IS NULL OR cp.unread_count > 0 = $4)
  AND ($5::text IS NULL OR c.kind::text = $5)
ORDER BY c.last_message_at DESC NULLS LAST
LIMIT $6 OFFSET $7;
```

This is the only place in the inbox where raw SQL is acceptable (for the LATERAL-style preview lookup performance). It runs inside the RLS-scoped transaction so the no-raw-SQL-outside-RLS rule is satisfied. Add an inline ESLint disable with the documented exception comment.

Pagination shape: `{ data, meta: { page, pageSize, total } }`.

### 8. Thread fetch — `getThread`

```
1. Verify the requesting user is a participant. If not → NOT_PARTICIPANT.
2. Load conversation + participants + paginated messages (newest first).
3. For each message: load attachments, edit history (only visible to admin tier), flags (only visible to admin tier).
4. For SCHOOL STAFF SENDERS only: load read state — for messages they sent, return `{ read_count, total_recipients }` per message.
5. For PARENT / STUDENT viewers: never include read_state on any message they didn't send.
6. Return ThreadDetail.
```

### 9. Messages service (edit + delete)

`apps/api/src/modules/inbox/messages/messages.service.ts`

```ts
async editMessage(input: {
  tenantId: string;
  userId: string;
  messageId: string;
  newBody: string;
}): Promise<void>;

async deleteMessage(input: {
  tenantId: string;
  userId: string;
  messageId: string;
}): Promise<void>;
```

`editMessage`:

1. Load message + sender. If `userId !== sender_user_id` → `NOT_AUTHOR`.
2. Resolve sender role. If parent or student → `EDIT_NOT_ALLOWED_FOR_ROLE`.
3. If `now() - created_at > tenant.edit_window_minutes` → `EDIT_WINDOW_EXPIRED`.
4. If `deleted_at != null` → `MESSAGE_DELETED`.
5. INSERT `message_edits` row with previous body.
6. UPDATE message body, set `edited_at = now()`.
7. ENQUEUE safeguarding rescan (the new body needs scanning).

`deleteMessage`:

1. Same author + role checks.
2. SET `deleted_at = now()`. Don't actually delete — soft delete only. Body and attachments stay in DB for audit.
3. The thread fetch returns deleted messages with body replaced by a tombstone string `[message deleted]` — except for admin tier viewers, who see the original body with a strikethrough flag.

### 10. Attachment input validation

`AttachmentInput`:

```ts
{
  storage_key: string; // pre-uploaded via the existing /v1/storage/upload endpoint
  filename: string;
  mime_type: string;
  size_bytes: number;
}
```

Validate via the existing storage facade — call `StorageFacade.assertOwnedByTenant(tenantId, storage_key)` to make sure the key is real and belongs to this tenant. Reject with `ATTACHMENT_NOT_FOUND` otherwise.

Per-message limits (enforce in Zod schema in `packages/shared/src/inbox/schemas/send-message.schema.ts`):

- Max 10 attachments per message
- Max 25MB per attachment
- Allowed mime types: `image/*`, `application/pdf`, `application/vnd.openxmlformats-officedocument.*`, `application/msword`, `text/plain`

The mime type list is **deliberately conservative** for v1. Add to it later as user demand surfaces.

### 11. Controllers

`apps/api/src/modules/inbox/conversations/conversations.controller.ts`

```
POST   /v1/inbox/conversations/direct
POST   /v1/inbox/conversations/group
POST   /v1/inbox/conversations/broadcast
POST   /v1/inbox/conversations/:id/messages           → reply
GET    /v1/inbox/conversations                         → listInbox
GET    /v1/inbox/conversations/:id                     → getThread
POST   /v1/inbox/conversations/:id/read                → markRead
POST   /v1/inbox/conversations/read-all                → markAllRead
PATCH  /v1/inbox/conversations/:id/mute                → setMuted (body { muted: bool })
PATCH  /v1/inbox/conversations/:id/archive             → setArchived
GET    /v1/inbox/state                                 → getInboxState (light, polled every 30s)
```

`apps/api/src/modules/inbox/messages/messages.controller.ts`

```
PATCH  /v1/inbox/messages/:id                          → edit
DELETE /v1/inbox/messages/:id                          → delete
```

All endpoints behind `@UseGuards(AuthGuard, PermissionGuard)` and `@RequiresPermission('inbox.send')` for the writes / `inbox.read` (new — add to seed) for the reads.

### 12. DTOs

In `packages/shared/src/inbox/schemas/`:

- `send-direct.schema.ts`
- `send-group.schema.ts`
- `send-broadcast.schema.ts`
- `send-reply.schema.ts`
- `edit-message.schema.ts`

Each is a Zod schema with `recipient_user_id`, `recipient_user_ids`, `audience_definition`, `subject`, `body` (1-10000 chars), `attachments` (array, max 10), `allow_replies` (broadcast only), `extra_channels` (subset enum), `disable_fallback` (bool, default false). Wave 4 imports them for the compose form.

## Tests

The Wave 1 stubs are filled in here. Minimum coverage:

`conversations.service.spec.ts`:

- createDirect: success path, dedupe to existing thread, blocked by policy, attachment validation
- createGroup: success path, partial-deny throws, subject required
- createBroadcast: success with admin sender, audience filtering for teacher sender, frozen audience reject, allow_replies stored
- sendReply: direct reply, group reply, broadcast original-sender reply, broadcast recipient reply spawning new direct, broadcast reply-not-allowed
- listInbox: pagination, filter by unread, filter by archived
- getThread: read state visibility branching by role
- markRead: zeros unread count, idempotent re-call
- RLS leakage: 2 tenants, conversation in tenant A invisible to tenant B

`messages.service.spec.ts`:

- editMessage: within window, after window, by non-author, by parent role, by student role
- deleteMessage: soft-delete, admin reads body, parent reads tombstone

## Watch out for

- **Interactive transactions only.** Every multi-row write uses `prisma.$transaction(async (tx) => {...})`. No sequential `prisma.$transaction([...])`. The lint rule enforces this.
- **The dedupe behaviour for direct conversations** is intentional — without it, every "Hi miss" message creates a new thread. Test it explicitly.
- **Broadcast reply spawning** is the trickiest path. Walk through the test fixtures by hand for the first version and confirm the spawned-direct lookup works correctly when the same parent replies twice.
- **Read receipt visibility branching** is a privacy invariant. The read facade method that returns thread detail must take `requestingUserRole` and branch on it. A test that asserts a parent viewer never sees `read_count` on any message is mandatory.
- **Soft-delete tombstones.** Make sure the API response replaces `body` with the tombstone for non-admin viewers, but `body` is always present in the DB row.
- **Concurrency on unread counts.** Two processes incrementing `unread_count` simultaneously should not overwrite each other. Use `UPDATE ... SET unread_count = unread_count + 1` rather than read-modify-write.
- **`createBroadcast` audience snapshot is the ground truth.** Once it's saved, the `conversation_participants` rows derived from it are the source of truth for who can read the thread. The frontend MUST NOT re-resolve the audience to display participants — it must read `conversation_participants`.

## Deployment notes

- API restart only.
- Smoke test:
  - As Principal: `POST /v1/inbox/conversations/direct` to a teacher → returns 201 with conversation_id.
  - As that teacher: `GET /v1/inbox/state` → returns `unread_total: 1`.
  - As that teacher: `GET /v1/inbox/conversations` → the new thread appears.
  - As that teacher: `POST /v1/inbox/conversations/:id/read` → state goes to 0.
  - As Principal: `POST /v1/inbox/conversations/broadcast` with `{ audience_definition: { provider: 'parents_school' }, subject: 'Test', body: 'Hello', allow_replies: false }` → returns 201 with `resolved_recipient_count` matching parent count.
