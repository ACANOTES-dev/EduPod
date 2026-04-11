-- ============================================================
-- New Inbox — Schema Foundation (Wave 1 / Impl 01)
-- ============================================================
--
-- Adds every table, enum, index, and foreign key required by the
-- in-app inbox / messaging system:
--
--   conversations, conversation_participants, messages, message_reads,
--   message_edits, message_attachments, broadcast_audience_definitions,
--   broadcast_audience_snapshots, saved_audiences, tenant_messaging_policy,
--   tenant_settings_inbox, safeguarding_keywords, message_flags,
--   oversight_access_log.
--
-- RLS policies are installed by the accompanying `post_migrate.sql`.
-- Default rows (messaging policy matrix, tenant settings, starter
-- safeguarding keywords) are seeded by the sibling migration
-- `20260411100100_seed_inbox_defaults`.
--
-- All statements are wrapped in IF NOT EXISTS / DO-guarded blocks
-- so the migration is safe to re-run against partial state.

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConversationKind') THEN
  CREATE TYPE "ConversationKind" AS ENUM ('direct', 'group', 'broadcast');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessagingRole') THEN
  CREATE TYPE "MessagingRole" AS ENUM ('owner', 'principal', 'vice_principal', 'office', 'finance', 'nurse', 'teacher', 'parent', 'student');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SavedAudienceKind') THEN
  CREATE TYPE "SavedAudienceKind" AS ENUM ('static', 'dynamic');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageFlagSeverity') THEN
  CREATE TYPE "MessageFlagSeverity" AS ENUM ('low', 'medium', 'high');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageFlagReviewState') THEN
  CREATE TYPE "MessageFlagReviewState" AS ENUM ('pending', 'dismissed', 'escalated', 'frozen');
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OversightAction') THEN
  CREATE TYPE "OversightAction" AS ENUM ('read_thread', 'search', 'freeze', 'unfreeze', 'dismiss_flag', 'escalate_flag', 'export_thread');
END IF; END $$;

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "subject" VARCHAR(255),
    "created_by_user_id" UUID NOT NULL,
    "allow_replies" BOOLEAN NOT NULL DEFAULT false,
    "frozen_at" TIMESTAMPTZ,
    "frozen_by_user_id" UUID,
    "freeze_reason" TEXT,
    "archived_at" TIMESTAMPTZ,
    "last_message_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "conversation_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_at_join" "MessagingRole" NOT NULL,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "muted_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "last_read_at" TIMESTAMPTZ,
    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "body_search" tsvector,
    "attachment_count" INTEGER NOT NULL DEFAULT 0,
    "edited_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "fallback_dispatched_at" TIMESTAMPTZ,
    "disable_fallback" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "message_reads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "message_reads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "message_edits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "previous_body" TEXT NOT NULL,
    "edited_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "edited_by_user_id" UUID NOT NULL,
    CONSTRAINT "message_edits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "message_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "filename" VARCHAR(512) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "broadcast_audience_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "definition_json" JSONB NOT NULL,
    "saved_audience_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "broadcast_audience_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "broadcast_audience_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "recipient_user_ids" UUID[],
    "resolved_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "resolved_count" INTEGER NOT NULL,
    CONSTRAINT "broadcast_audience_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "saved_audiences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(1024),
    "kind" "SavedAudienceKind" NOT NULL,
    "definition_json" JSONB NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "saved_audiences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tenant_messaging_policy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sender_role" "MessagingRole" NOT NULL,
    "recipient_role" "MessagingRole" NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    CONSTRAINT "tenant_messaging_policy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tenant_settings_inbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "messaging_enabled" BOOLEAN NOT NULL DEFAULT true,
    "students_can_initiate" BOOLEAN NOT NULL DEFAULT false,
    "parents_can_initiate" BOOLEAN NOT NULL DEFAULT false,
    "parent_to_parent_messaging" BOOLEAN NOT NULL DEFAULT false,
    "student_to_student_messaging" BOOLEAN NOT NULL DEFAULT false,
    "student_to_parent_messaging" BOOLEAN NOT NULL DEFAULT false,
    "require_admin_approval_for_parent_to_teacher" BOOLEAN NOT NULL DEFAULT false,
    "edit_window_minutes" INTEGER NOT NULL DEFAULT 10,
    "retention_days" INTEGER,
    "fallback_admin_enabled" BOOLEAN NOT NULL DEFAULT true,
    "fallback_admin_after_hours" INTEGER NOT NULL DEFAULT 24,
    "fallback_admin_channels" TEXT[] DEFAULT ARRAY['email']::TEXT[],
    "fallback_teacher_enabled" BOOLEAN NOT NULL DEFAULT true,
    "fallback_teacher_after_hours" INTEGER NOT NULL DEFAULT 3,
    "fallback_teacher_channels" TEXT[] DEFAULT ARRAY['email']::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "tenant_settings_inbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "safeguarding_keywords" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "keyword" VARCHAR(255) NOT NULL,
    "severity" "MessageFlagSeverity" NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "safeguarding_keywords_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "message_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "matched_keywords" TEXT[],
    "highest_severity" "MessageFlagSeverity" NOT NULL,
    "review_state" "MessageFlagReviewState" NOT NULL DEFAULT 'pending',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "review_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "message_flags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "oversight_access_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" "OversightAction" NOT NULL,
    "conversation_id" UUID,
    "message_flag_id" UUID,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "oversight_access_log_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_conversations_tenant_kind_recent" ON "conversations"("tenant_id", "kind", "last_message_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_conversations_frozen" ON "conversations"("tenant_id", "frozen_at");

CREATE INDEX IF NOT EXISTS "idx_participants_user_inbox" ON "conversation_participants"("tenant_id", "user_id", "archived_at", "unread_count" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_participants_conversation_id_user_id_key" ON "conversation_participants"("conversation_id", "user_id");

CREATE INDEX IF NOT EXISTS "idx_messages_thread_recent" ON "messages"("tenant_id", "conversation_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_messages_sender" ON "messages"("tenant_id", "sender_user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_messages_fallback_scan" ON "messages"("tenant_id", "fallback_dispatched_at", "created_at");

CREATE INDEX IF NOT EXISTS "idx_message_reads_user" ON "message_reads"("tenant_id", "user_id", "read_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "message_reads_message_id_user_id_key" ON "message_reads"("message_id", "user_id");

CREATE INDEX IF NOT EXISTS "idx_message_edits_history" ON "message_edits"("tenant_id", "message_id", "edited_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_attachments_message" ON "message_attachments"("tenant_id", "message_id");

CREATE UNIQUE INDEX IF NOT EXISTS "broadcast_audience_definitions_conversation_id_key" ON "broadcast_audience_definitions"("conversation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "broadcast_audience_snapshots_conversation_id_key" ON "broadcast_audience_snapshots"("conversation_id");

CREATE INDEX IF NOT EXISTS "idx_saved_audiences_kind" ON "saved_audiences"("tenant_id", "kind");
CREATE UNIQUE INDEX IF NOT EXISTS "saved_audiences_tenant_id_name_key" ON "saved_audiences"("tenant_id", "name");

CREATE INDEX IF NOT EXISTS "idx_messaging_policy_tenant" ON "tenant_messaging_policy"("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_messaging_policy_tenant_id_sender_role_recipient_rol_key" ON "tenant_messaging_policy"("tenant_id", "sender_role", "recipient_role");

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_settings_inbox_tenant_id_key" ON "tenant_settings_inbox"("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_safeguarding_keywords_active" ON "safeguarding_keywords"("tenant_id", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "safeguarding_keywords_tenant_id_keyword_key" ON "safeguarding_keywords"("tenant_id", "keyword");

CREATE INDEX IF NOT EXISTS "idx_message_flags_review_queue" ON "message_flags"("tenant_id", "review_state", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_oversight_log_actor" ON "oversight_access_log"("tenant_id", "actor_user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_oversight_log_action" ON "oversight_access_log"("tenant_id", "action", "created_at" DESC);

-- ─── Foreign Keys ────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_tenant_id_fkey') THEN
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_created_by_user_id_fkey') THEN
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_frozen_by_user_id_fkey') THEN
    ALTER TABLE "conversations" ADD CONSTRAINT "conversations_frozen_by_user_id_fkey"
      FOREIGN KEY ("frozen_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_participants_tenant_id_fkey') THEN
    ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_participants_conversation_id_fkey') THEN
    ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_participants_user_id_fkey') THEN
    ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_tenant_id_fkey') THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_conversation_id_fkey') THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_sender_user_id_fkey') THEN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey"
      FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_reads_tenant_id_fkey') THEN
    ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_reads_message_id_fkey') THEN
    ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_message_id_fkey"
      FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_reads_user_id_fkey') THEN
    ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_edits_tenant_id_fkey') THEN
    ALTER TABLE "message_edits" ADD CONSTRAINT "message_edits_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_edits_message_id_fkey') THEN
    ALTER TABLE "message_edits" ADD CONSTRAINT "message_edits_message_id_fkey"
      FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_edits_edited_by_user_id_fkey') THEN
    ALTER TABLE "message_edits" ADD CONSTRAINT "message_edits_edited_by_user_id_fkey"
      FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_attachments_tenant_id_fkey') THEN
    ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_attachments_message_id_fkey') THEN
    ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fkey"
      FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcast_audience_definitions_tenant_id_fkey') THEN
    ALTER TABLE "broadcast_audience_definitions" ADD CONSTRAINT "broadcast_audience_definitions_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcast_audience_definitions_conversation_id_fkey') THEN
    ALTER TABLE "broadcast_audience_definitions" ADD CONSTRAINT "broadcast_audience_definitions_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcast_audience_definitions_saved_audience_id_fkey') THEN
    ALTER TABLE "broadcast_audience_definitions" ADD CONSTRAINT "broadcast_audience_definitions_saved_audience_id_fkey"
      FOREIGN KEY ("saved_audience_id") REFERENCES "saved_audiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcast_audience_snapshots_tenant_id_fkey') THEN
    ALTER TABLE "broadcast_audience_snapshots" ADD CONSTRAINT "broadcast_audience_snapshots_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcast_audience_snapshots_conversation_id_fkey') THEN
    ALTER TABLE "broadcast_audience_snapshots" ADD CONSTRAINT "broadcast_audience_snapshots_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_audiences_tenant_id_fkey') THEN
    ALTER TABLE "saved_audiences" ADD CONSTRAINT "saved_audiences_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_audiences_created_by_user_id_fkey') THEN
    ALTER TABLE "saved_audiences" ADD CONSTRAINT "saved_audiences_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_messaging_policy_tenant_id_fkey') THEN
    ALTER TABLE "tenant_messaging_policy" ADD CONSTRAINT "tenant_messaging_policy_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_settings_inbox_tenant_id_fkey') THEN
    ALTER TABLE "tenant_settings_inbox" ADD CONSTRAINT "tenant_settings_inbox_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safeguarding_keywords_tenant_id_fkey') THEN
    ALTER TABLE "safeguarding_keywords" ADD CONSTRAINT "safeguarding_keywords_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_flags_tenant_id_fkey') THEN
    ALTER TABLE "message_flags" ADD CONSTRAINT "message_flags_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_flags_message_id_fkey') THEN
    ALTER TABLE "message_flags" ADD CONSTRAINT "message_flags_message_id_fkey"
      FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_flags_reviewed_by_user_id_fkey') THEN
    ALTER TABLE "message_flags" ADD CONSTRAINT "message_flags_reviewed_by_user_id_fkey"
      FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oversight_access_log_tenant_id_fkey') THEN
    ALTER TABLE "oversight_access_log" ADD CONSTRAINT "oversight_access_log_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oversight_access_log_actor_user_id_fkey') THEN
    ALTER TABLE "oversight_access_log" ADD CONSTRAINT "oversight_access_log_actor_user_id_fkey"
      FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── Full-text search: generated tsvector + GIN index ────────────────────────
-- body_search is populated automatically by Postgres (STORED generated column)
-- using the `simple` dictionary so Arabic content tokenises sensibly.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'messages'::regclass
      AND attname = 'body_search'
      AND attgenerated = 's'
  ) THEN
    ALTER TABLE "messages" DROP COLUMN IF EXISTS "body_search";
    ALTER TABLE "messages"
      ADD COLUMN "body_search" tsvector
      GENERATED ALWAYS AS (to_tsvector('simple', coalesce("body", ''))) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_messages_body_search" ON "messages" USING GIN ("body_search");
