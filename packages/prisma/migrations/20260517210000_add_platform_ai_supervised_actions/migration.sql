-- Platform AI supervised actions (Layer 4 Session 4D)
-- Platform-level tables only: no tenant_id isolation, no RLS policies.

CREATE TYPE "platform_ai_action_proposal_source" AS ENUM (
  'recommendation_engine',
  'copilot_conversation'
);

CREATE TYPE "platform_ai_action_proposal_status" AS ENUM (
  'awaiting_approval',
  'approved',
  'rejected',
  'executing',
  'executed',
  'failed',
  'expired'
);

CREATE TABLE "platform_ai_action_proposals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recommendation_id" UUID,
  "proposed_by" "platform_ai_action_proposal_source" NOT NULL,
  "proposed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "action_kind" VARCHAR(40) NOT NULL,
  "action_payload" JSONB NOT NULL,
  "target_resource_type" VARCHAR(60),
  "target_resource_id" VARCHAR(255),
  "target_tenant_id" UUID,
  "reasoning" TEXT NOT NULL,
  "required_permission" VARCHAR(120) NOT NULL,
  "requires_owner_confirmation" BOOLEAN NOT NULL DEFAULT false,
  "evidence" JSONB NOT NULL,
  "status" "platform_ai_action_proposal_status" NOT NULL DEFAULT 'awaiting_approval',
  "approved_by_user_id" UUID,
  "approved_at" TIMESTAMPTZ,
  "rejected_by_user_id" UUID,
  "rejected_at" TIMESTAMPTZ,
  "rejection_reason" TEXT,
  "owner_confirmation_id" UUID,
  "executed_at" TIMESTAMPTZ,
  "execution_result" JSONB,
  "execution_failed_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "platform_ai_action_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_agent_handoff_prompts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "created_by_user_id" UUID NOT NULL,
  "recommendation_id" UUID,
  "incident_id" UUID,
  "title" VARCHAR(200) NOT NULL,
  "summary" TEXT NOT NULL,
  "hypothesis" TEXT NOT NULL,
  "prompt_markdown" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "suspected_repo_areas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_agent_handoff_prompts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_platform_ai_action_proposals_status_expiry"
  ON "platform_ai_action_proposals"("status", "expires_at");

CREATE INDEX "idx_platform_ai_action_proposals_recommendation"
  ON "platform_ai_action_proposals"("recommendation_id");

CREATE INDEX "idx_platform_ai_action_proposals_tenant"
  ON "platform_ai_action_proposals"("target_tenant_id");

CREATE INDEX "idx_platform_agent_handoff_prompts_creator_created"
  ON "platform_agent_handoff_prompts"("created_by_user_id", "created_at" DESC);

CREATE INDEX "idx_platform_agent_handoff_prompts_recommendation"
  ON "platform_agent_handoff_prompts"("recommendation_id");

CREATE INDEX "idx_platform_agent_handoff_prompts_incident"
  ON "platform_agent_handoff_prompts"("incident_id");

ALTER TABLE "platform_ai_action_proposals"
  ADD CONSTRAINT "platform_ai_action_proposals_recommendation_id_fkey"
  FOREIGN KEY ("recommendation_id") REFERENCES "platform_ai_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_ai_action_proposals"
  ADD CONSTRAINT "platform_ai_action_proposals_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_ai_action_proposals"
  ADD CONSTRAINT "platform_ai_action_proposals_rejected_by_user_id_fkey"
  FOREIGN KEY ("rejected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_agent_handoff_prompts"
  ADD CONSTRAINT "platform_agent_handoff_prompts_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_agent_handoff_prompts"
  ADD CONSTRAINT "platform_agent_handoff_prompts_recommendation_id_fkey"
  FOREIGN KEY ("recommendation_id") REFERENCES "platform_ai_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
