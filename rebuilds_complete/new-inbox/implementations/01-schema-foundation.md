# Implementation 01 — Schema Foundation

> **Wave:** 1 (serial, no parallelism — everything depends on this)
> **Depends on:** nothing
> **Deploys:** migration + API + worker + web restart (touches shared types, every service rebuilds)

---

## Goal

Land every DB and shared-type change the inbox rebuild needs in a single, coordinated migration so that subsequent waves can code against stable types. **Zero business logic** in this implementation — just the foundation.

## What to change

### 1. Prisma schema (`packages/prisma/schema.prisma`)

Add the following enums and models. Names and column types are exact — Wave 2/3/4 reference them verbatim.

#### 1a. Enums

```prisma
enum ConversationKind {
  direct
  group
  broadcast
}

enum MessagingRole {
  owner
  principal
  vice_principal
  office
  finance
  nurse
  teacher
  parent
  student
}

enum SavedAudienceKind {
  static
  dynamic
}

enum MessageFlagSeverity {
  low
  medium
  high
}

enum MessageFlagReviewState {
  pending
  dismissed
  escalated
  frozen
}

enum OversightAction {
  read_thread
  search
  freeze
  unfreeze
  dismiss_flag
  escalate_flag
  export_thread
}
```

#### 1b. `Conversation`

```prisma
model Conversation {
  id                  String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String            @db.Uuid
  kind                ConversationKind
  subject             String?           @db.VarChar(255)
  created_by_user_id  String            @db.Uuid
  allow_replies       Boolean           @default(false)   // broadcasts only — direct/group ignore
  frozen_at           DateTime?         @db.Timestamptz()
  frozen_by_user_id   String?           @db.Uuid
  freeze_reason       String?
  archived_at         DateTime?         @db.Timestamptz()
  last_message_at     DateTime?         @db.Timestamptz()
  created_at          DateTime          @default(now()) @db.Timestamptz()
  updated_at          DateTime          @default(now()) @updatedAt @db.Timestamptz()

  tenant              Tenant            @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  created_by          User              @relation("conversation_creator", fields: [created_by_user_id], references: [id])
  frozen_by           User?             @relation("conversation_freezer", fields: [frozen_by_user_id], references: [id])
  participants        ConversationParticipant[]
  messages            Message[]
  audience_definition BroadcastAudienceDefinition?
  audience_snapshot   BroadcastAudienceSnapshot?

  @@index([tenant_id, kind, last_message_at(sort: Desc)], name: "idx_conversations_tenant_kind_recent")
  @@index([tenant_id, frozen_at], name: "idx_conversations_frozen")
  @@map("conversations")
}
```

#### 1c. `ConversationParticipant`

```prisma
model ConversationParticipant {
  id               String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id        String       @db.Uuid
  conversation_id  String       @db.Uuid
  user_id          String       @db.Uuid
  role_at_join     MessagingRole
  unread_count     Int          @default(0)
  muted_at         DateTime?    @db.Timestamptz()
  archived_at      DateTime?    @db.Timestamptz()
  joined_at        DateTime     @default(now()) @db.Timestamptz()
  last_read_at     DateTime?    @db.Timestamptz()

  conversation     Conversation @relation(fields: [conversation_id], references: [id], onDelete: Cascade)
  user             User         @relation(fields: [user_id], references: [id])

  @@unique([conversation_id, user_id], name: "uniq_conversation_user")
  @@index([tenant_id, user_id, archived_at, unread_count(sort: Desc)], name: "idx_participants_user_inbox")
  @@map("conversation_participants")
}
```

#### 1d. `Message`

```prisma
model Message {
  id                 String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id          String       @db.Uuid
  conversation_id    String       @db.Uuid
  sender_user_id     String       @db.Uuid
  body               String
  body_search        Unsupported("tsvector")?                              // populated by trigger
  attachment_count   Int          @default(0)
  edited_at          DateTime?    @db.Timestamptz()
  deleted_at         DateTime?    @db.Timestamptz()
  fallback_dispatched_at DateTime? @db.Timestamptz()
  disable_fallback   Boolean      @default(false)
  created_at         DateTime     @default(now()) @db.Timestamptz()

  conversation       Conversation @relation(fields: [conversation_id], references: [id], onDelete: Cascade)
  sender             User         @relation(fields: [sender_user_id], references: [id])
  reads              MessageRead[]
  edits              MessageEdit[]
  attachments        MessageAttachment[]
  flags              MessageFlag[]

  @@index([tenant_id, conversation_id, created_at(sort: Desc)], name: "idx_messages_thread_recent")
  @@index([tenant_id, sender_user_id, created_at(sort: Desc)], name: "idx_messages_sender")
  @@index([tenant_id, fallback_dispatched_at, created_at], name: "idx_messages_fallback_scan")
  @@map("messages")
}
```

The `body_search` `tsvector` column is added in the migration via raw SQL after Prisma generates the table — Prisma doesn't natively support `tsvector` columns. The trigger that populates it lives in `post_migrate.sql`.

#### 1e. `MessageRead`

```prisma
model MessageRead {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id   String   @db.Uuid
  message_id  String   @db.Uuid
  user_id     String   @db.Uuid
  read_at     DateTime @default(now()) @db.Timestamptz()

  message     Message  @relation(fields: [message_id], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [user_id], references: [id])

  @@unique([message_id, user_id], name: "uniq_message_user_read")
  @@index([tenant_id, user_id, read_at(sort: Desc)], name: "idx_message_reads_user")
  @@map("message_reads")
}
```

#### 1f. `MessageEdit`

```prisma
model MessageEdit {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id       String   @db.Uuid
  message_id      String   @db.Uuid
  previous_body   String
  edited_at       DateTime @default(now()) @db.Timestamptz()
  edited_by_user_id String @db.Uuid

  message         Message  @relation(fields: [message_id], references: [id], onDelete: Cascade)
  edited_by       User     @relation(fields: [edited_by_user_id], references: [id])

  @@index([tenant_id, message_id, edited_at(sort: Desc)], name: "idx_message_edits_history")
  @@map("message_edits")
}
```

#### 1g. `MessageAttachment`

```prisma
model MessageAttachment {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id    String   @db.Uuid
  message_id   String   @db.Uuid
  storage_key  String                                              // re-uses existing storage subsystem
  filename     String   @db.VarChar(512)
  mime_type    String   @db.VarChar(128)
  size_bytes   Int
  uploaded_by_user_id String @db.Uuid
  created_at   DateTime @default(now()) @db.Timestamptz()

  message      Message  @relation(fields: [message_id], references: [id], onDelete: Cascade)

  @@index([tenant_id, message_id], name: "idx_attachments_message")
  @@map("message_attachments")
}
```

#### 1h. `BroadcastAudienceDefinition` and `BroadcastAudienceSnapshot`

```prisma
model BroadcastAudienceDefinition {
  id              String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id       String       @db.Uuid
  conversation_id String       @unique @db.Uuid
  definition_json Json
  saved_audience_id String?    @db.Uuid                            // populated when sender chose a saved audience
  created_at      DateTime     @default(now()) @db.Timestamptz()

  conversation    Conversation @relation(fields: [conversation_id], references: [id], onDelete: Cascade)
  saved_audience  SavedAudience? @relation(fields: [saved_audience_id], references: [id], onDelete: SetNull)

  @@map("broadcast_audience_definitions")
}

model BroadcastAudienceSnapshot {
  id                  String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String       @db.Uuid
  conversation_id     String       @unique @db.Uuid
  recipient_user_ids  String[]     @db.Uuid
  resolved_at         DateTime     @default(now()) @db.Timestamptz()
  resolved_count      Int

  conversation        Conversation @relation(fields: [conversation_id], references: [id], onDelete: Cascade)

  @@map("broadcast_audience_snapshots")
}
```

#### 1i. `SavedAudience`

```prisma
model SavedAudience {
  id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id       String              @db.Uuid
  name            String              @db.VarChar(255)
  description     String?             @db.VarChar(1024)
  kind            SavedAudienceKind
  definition_json Json                                                // dynamic kind: composer tree; static kind: { user_ids: [...] }
  created_by_user_id String           @db.Uuid
  created_at      DateTime            @default(now()) @db.Timestamptz()
  updated_at      DateTime            @default(now()) @updatedAt @db.Timestamptz()

  created_by      User                @relation(fields: [created_by_user_id], references: [id])
  uses_in_broadcasts BroadcastAudienceDefinition[]

  @@unique([tenant_id, name], name: "uniq_saved_audience_name_per_tenant")
  @@index([tenant_id, kind], name: "idx_saved_audiences_kind")
  @@map("saved_audiences")
}
```

#### 1j. `TenantMessagingPolicy`

```prisma
model TenantMessagingPolicy {
  id             String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id      String         @db.Uuid
  sender_role    MessagingRole
  recipient_role MessagingRole
  allowed        Boolean

  @@unique([tenant_id, sender_role, recipient_role], name: "uniq_messaging_policy_pair")
  @@index([tenant_id], name: "idx_messaging_policy_tenant")
  @@map("tenant_messaging_policy")
}
```

#### 1k. `TenantSettingsInbox`

```prisma
model TenantSettingsInbox {
  id                                       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                                String   @unique @db.Uuid
  messaging_enabled                        Boolean  @default(true)
  students_can_initiate                    Boolean  @default(false)
  parents_can_initiate                     Boolean  @default(false)
  parent_to_parent_messaging               Boolean  @default(false)
  student_to_student_messaging             Boolean  @default(false)
  student_to_parent_messaging              Boolean  @default(false)
  require_admin_approval_for_parent_to_teacher Boolean @default(false)
  edit_window_minutes                      Int      @default(10)
  retention_days                           Int?                                       // null = forever
  fallback_admin_enabled                   Boolean  @default(true)
  fallback_admin_after_hours               Int      @default(24)
  fallback_admin_channels                  String[] @default(["email"])
  fallback_teacher_enabled                 Boolean  @default(true)
  fallback_teacher_after_hours             Int      @default(3)
  fallback_teacher_channels                String[] @default(["email"])
  created_at                               DateTime @default(now()) @db.Timestamptz()
  updated_at                               DateTime @default(now()) @updatedAt @db.Timestamptz()

  @@map("tenant_settings_inbox")
}
```

#### 1l. `SafeguardingKeyword` and `MessageFlag`

```prisma
model SafeguardingKeyword {
  id          String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id   String              @db.Uuid
  keyword     String              @db.VarChar(255)
  severity    MessageFlagSeverity
  category    String              @db.VarChar(64)
  active      Boolean             @default(true)
  created_at  DateTime            @default(now()) @db.Timestamptz()
  updated_at  DateTime            @default(now()) @updatedAt @db.Timestamptz()

  @@unique([tenant_id, keyword], name: "uniq_safeguarding_keyword_per_tenant")
  @@index([tenant_id, active], name: "idx_safeguarding_keywords_active")
  @@map("safeguarding_keywords")
}

model MessageFlag {
  id              String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id       String                  @db.Uuid
  message_id      String                  @db.Uuid
  matched_keywords String[]
  highest_severity MessageFlagSeverity
  review_state    MessageFlagReviewState  @default(pending)
  reviewed_by_user_id String?             @db.Uuid
  reviewed_at     DateTime?               @db.Timestamptz()
  review_notes    String?
  created_at      DateTime                @default(now()) @db.Timestamptz()

  message         Message                 @relation(fields: [message_id], references: [id], onDelete: Cascade)
  reviewed_by     User?                   @relation(fields: [reviewed_by_user_id], references: [id])

  @@index([tenant_id, review_state, created_at(sort: Desc)], name: "idx_message_flags_review_queue")
  @@map("message_flags")
}
```

#### 1m. `OversightAccessLog`

```prisma
model OversightAccessLog {
  id            String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id     String          @db.Uuid
  actor_user_id String          @db.Uuid
  action        OversightAction
  conversation_id String?       @db.Uuid
  message_flag_id String?       @db.Uuid
  metadata_json Json?
  created_at    DateTime        @default(now()) @db.Timestamptz()

  actor         User            @relation("oversight_actor", fields: [actor_user_id], references: [id])

  @@index([tenant_id, actor_user_id, created_at(sort: Desc)], name: "idx_oversight_log_actor")
  @@index([tenant_id, action, created_at(sort: Desc)], name: "idx_oversight_log_action")
  @@map("oversight_access_log")
}
```

### 2. RLS policies

Every new table is tenant-scoped. Add the standard `FORCE ROW LEVEL SECURITY` + tenant isolation policy in `packages/prisma/rls/policies.sql` and re-emit them in the migration's co-located `post_migrate.sql`. The exact pattern (copy from existing tables):

```sql
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_tenant_isolation ON conversations;
CREATE POLICY conversations_tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Repeat for: `conversation_participants`, `messages`, `message_reads`, `message_edits`, `message_attachments`, `broadcast_audience_definitions`, `broadcast_audience_snapshots`, `saved_audiences`, `tenant_messaging_policy`, `tenant_settings_inbox`, `safeguarding_keywords`, `message_flags`, `oversight_access_log`.

### 3. tsvector column and trigger (raw SQL in migration)

After Prisma creates the `messages` table, add the `body_search` column and trigger via raw SQL in the migration file:

```sql
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS body_search tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(body, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_messages_body_search ON messages USING GIN (body_search);
```

Use `simple` (not `english`) so Arabic content tokenises sensibly. v2 can switch to a multilingual config.

### 4. Tenant defaults seeding

In `packages/prisma/seed/`, add `inbox-defaults.ts` that for every tenant (existing and new):

- Inserts a `tenant_settings_inbox` row with the defaults from §1k.
- Inserts the **default messaging policy matrix** from `PLAN.md` §4 — one row per `(sender_role, recipient_role)` pair, 81 rows per tenant.
- Inserts a starter `safeguarding_keywords` set (~30 entries across `bullying`, `self_harm`, `abuse`, `inappropriate_contact`, `weapons` categories — keep neutral, generic, no extremist political terms).

The seed must be **idempotent** — re-running on a tenant that already has these rows must be a no-op (use `upsert` with the unique constraint).

Wire this seed into:

- `packages/prisma/seed/index.ts` (so `pnpm db:seed` runs it for all tenants)
- The `TenantsService.create` flow (so new tenants get the defaults at creation time)

### 5. Shared types and constants

In `packages/shared/src/inbox/`:

```
constants.ts          // CONVERSATION_KINDS, MESSAGING_ROLES, SAVED_AUDIENCE_KINDS, etc.
permission-defaults.ts // DEFAULT_MESSAGING_POLICY_MATRIX export
audience.types.ts     // AudienceProviderKey union, AudienceDefinition shape
schemas/
  send-message.schema.ts
  create-conversation.schema.ts
  saved-audience.schema.ts
  inbox-settings.schema.ts
  safeguarding-keyword.schema.ts
  audience-definition.schema.ts
```

Export everything from `packages/shared/src/index.ts`. Wave 2 imports these.

### 6. Stub spec files

Add `.spec.ts` stubs (with `describe.skip` and a one-line "implemented in Wave N" pointer) for every service Wave 2 will create. This makes the test runner happy and tells the next session where the work lands:

- `apps/api/src/modules/inbox/policy/messaging-policy.service.spec.ts`
- `apps/api/src/modules/inbox/audience/audience-resolution.service.spec.ts`
- `apps/api/src/modules/inbox/conversations/conversations.service.spec.ts`
- `apps/api/src/modules/inbox/oversight/inbox-oversight.service.spec.ts`

## Migration files

Create two migration files under `packages/prisma/migrations/`:

1. `<timestamp>_add_inbox_tables/` — all the Prisma-generated DDL plus the raw SQL for `body_search` and the GIN index. Co-located `post_migrate.sql` carries the RLS policies.
2. `<timestamp>_seed_inbox_defaults/` — calls the seeding logic via SQL inserts (do NOT call the seed script from inside the migration; embed the inserts so a fresh production database is self-sufficient).

Both must be safe to re-run (idempotent inserts via `ON CONFLICT DO NOTHING`).

## Tests

- A migration smoke test: spin up an empty Postgres, run both migrations, assert all tables exist with the right columns.
- A `tenant_messaging_policy` defaults test: after seeding a tenant, query the table and assert exactly 81 rows match the default matrix (with the right `allowed` values).
- A `safeguarding_keywords` seed test: assert ~30 rows seeded with non-empty `category` values.
- RLS leakage test stubs for every new table — these will be filled in by the services that consume the tables in Wave 2, but the stub files exist now.

## Watch out for

- **`gen_random_uuid()`** requires the `pgcrypto` extension. It's already enabled in the existing schema — verify before running the migration.
- **`Unsupported("tsvector")`** in Prisma generates a column the Prisma client cannot read or write. The service layer must access `messages.body_search` only via raw SQL inside the RLS middleware. The full-text search service in Wave 3 (impl 09) is the only consumer.
- **The `messaging` role mapping** is not one-to-one with the platform's role system. The mapping table from platform roles → `MessagingRole` lives in `packages/shared/src/inbox/role-mapping.ts` and Wave 2's policy service consumes it. Stub the mapping file in this implementation with a TODO and the obvious mappings (`SchoolOwner → owner`, `Principal → principal`, `Teacher → teacher`, etc.); Wave 2 fills the long tail.
- **Existing `Notification` and `Announcement` tables are NOT touched.** The existing dispatcher and providers stay live throughout the rebuild — Wave 3 (impl 06) extends them with the inbox channel.
- **Do not enable any frontend route** in this implementation. The new `/inbox` paths are created in Wave 4. If you create empty `page.tsx` files in this implementation they'll show up as broken nav entries.

## Deployment notes

This implementation triggers a full rebuild because shared types change. Sequence:

1. Apply patch → migrate → post-migrate (RLS policies) → seed (`pnpm db:seed`).
2. Build all three: `pnpm turbo run build --filter=@school/api --filter=@school/worker --filter=@school/web`.
3. Restart all three: `pm2 restart api worker web --update-env`.
4. Smoke test: `psql` into prod, `SELECT COUNT(*) FROM tenant_messaging_policy;` should be `81 × <tenant_count>`. `SELECT COUNT(*) FROM tenant_settings_inbox;` should match `<tenant_count>`.
5. The frontend will look identical — this implementation lands schema only. Verify no existing pages 500.
