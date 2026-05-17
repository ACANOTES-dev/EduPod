-- Platform manual AI recommendations (Layer 4 Session 4C)
-- Platform-level table only: no tenant_id isolation, no RLS policies.

CREATE TYPE "platform_ai_recommendation_trigger" AS ENUM (
  'copilot_question',
  'explain_page',
  'recommendation_button',
  'daily_brief'
);

CREATE TYPE "platform_ai_recommendation_category" AS ENUM (
  'noise_reduction',
  'known_fix',
  'config_drift',
  'deploy_regression',
  'capacity',
  'cost',
  'security',
  'hygiene'
);

CREATE TYPE "platform_ai_recommendation_confidence" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "platform_ai_recommendation_risk" AS ENUM ('safe', 'caution', 'destructive');

CREATE TYPE "platform_ai_recommendation_status" AS ENUM (
  'active',
  'resolved',
  'dismissed',
  'expired',
  'superseded'
);

CREATE TYPE "platform_ai_recommendation_resolution" AS ENUM (
  'accepted_for_action',
  'dismissed_not_applicable',
  'dismissed_acknowledged_no_action',
  'expired'
);

CREATE TABLE "platform_ai_recommendations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "category" "platform_ai_recommendation_category" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "summary" TEXT NOT NULL,
  "detailed_reasoning" TEXT NOT NULL,
  "raw_reasoning" TEXT NOT NULL,
  "confidence" "platform_ai_recommendation_confidence" NOT NULL,
  "risk_level" "platform_ai_recommendation_risk" NOT NULL,
  "requires_owner_confirmation" BOOLEAN NOT NULL DEFAULT false,
  "requires_repo_agent_handoff" BOOLEAN NOT NULL DEFAULT false,
  "proposed_action" JSONB,
  "target_resource_type" VARCHAR(60),
  "target_resource_id" VARCHAR(255),
  "target_tenant_id" UUID,
  "evidence" JSONB NOT NULL,
  "evidence_fingerprint" VARCHAR(64) NOT NULL,
  "related_runbook_id" UUID,
  "generated_by_user_id" UUID NOT NULL,
  "trigger_source" "platform_ai_recommendation_trigger" NOT NULL,
  "status" "platform_ai_recommendation_status" NOT NULL DEFAULT 'active',
  "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_refreshed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ NOT NULL,
  "resolved_at" TIMESTAMPTZ,
  "resolved_by_user_id" UUID,
  "resolution_type" "platform_ai_recommendation_resolution",
  "resolution_reason" TEXT,
  CONSTRAINT "platform_ai_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_platform_ai_recommendations_status_expiry"
  ON "platform_ai_recommendations"("status", "expires_at");

CREATE INDEX "idx_platform_ai_recommendations_fingerprint_status"
  ON "platform_ai_recommendations"("evidence_fingerprint", "status");

CREATE INDEX "idx_platform_ai_recommendations_generator_generated"
  ON "platform_ai_recommendations"("generated_by_user_id", "generated_at" DESC);

CREATE INDEX "idx_platform_ai_recommendations_tenant_generated"
  ON "platform_ai_recommendations"("target_tenant_id", "generated_at" DESC);

ALTER TABLE "platform_ai_recommendations"
  ADD CONSTRAINT "platform_ai_recommendations_generated_by_user_id_fkey"
  FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_ai_recommendations"
  ADD CONSTRAINT "platform_ai_recommendations_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
