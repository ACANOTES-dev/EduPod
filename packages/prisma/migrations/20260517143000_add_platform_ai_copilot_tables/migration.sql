-- Platform read-only AI Copilot conversations (Layer 4 Session 4B)
-- Platform-level tables only: no tenant_id isolation, no RLS policies.

ALTER TYPE "platform_audit_action" ADD VALUE IF NOT EXISTS 'ai_conversation_viewed';

CREATE TYPE "platform_ai_conversation_type" AS ENUM ('diagnostic', 'recommendation', 'postmortem');
CREATE TYPE "platform_ai_message_role" AS ENUM ('operator', 'assistant', 'system');

CREATE TABLE "platform_ai_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "created_by_user_id" UUID NOT NULL,
  "conversation_type" "platform_ai_conversation_type" NOT NULL DEFAULT 'diagnostic',
  "title" VARCHAR(200),
  "total_tokens_input" INTEGER NOT NULL DEFAULT 0,
  "total_tokens_output" INTEGER NOT NULL DEFAULT 0,
  "total_tokens_cached" INTEGER NOT NULL DEFAULT 0,
  "total_cost_usd" NUMERIC(10,6) NOT NULL DEFAULT 0,
  "is_locked" BOOLEAN NOT NULL DEFAULT false,
  "locked_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_message_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_ai_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_ai_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "role" "platform_ai_message_role" NOT NULL,
  "content" TEXT NOT NULL,
  "raw_content" TEXT,
  "evidence" JSONB NOT NULL,
  "citations" JSONB NOT NULL,
  "tokens_input" INTEGER NOT NULL DEFAULT 0,
  "tokens_output" INTEGER NOT NULL DEFAULT 0,
  "tokens_cached" INTEGER NOT NULL DEFAULT 0,
  "cost_usd" NUMERIC(10,6) NOT NULL DEFAULT 0,
  "stripped_claims_count" INTEGER NOT NULL DEFAULT 0,
  "prompt_injection_attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_ai_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_platform_ai_conversations_creator_last"
  ON "platform_ai_conversations"("created_by_user_id", "last_message_at" DESC);

CREATE INDEX "idx_platform_ai_messages_conversation_created"
  ON "platform_ai_messages"("conversation_id", "created_at");

ALTER TABLE "platform_ai_conversations"
  ADD CONSTRAINT "platform_ai_conversations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_ai_messages"
  ADD CONSTRAINT "platform_ai_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "platform_ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
