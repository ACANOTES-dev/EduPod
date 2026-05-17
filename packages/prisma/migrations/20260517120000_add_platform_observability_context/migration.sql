-- Platform observability context foundation (Layer 4 Session 4A)
-- Platform-level tables only: no tenant_id isolation, no RLS policies.

CREATE TYPE "platform_deploy_status" AS ENUM ('in_progress', 'succeeded', 'failed', 'rolled_back');

CREATE TABLE "platform_correlation_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "correlation_id" VARCHAR(64) NOT NULL,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "source" VARCHAR(40) NOT NULL,
  "event_type" VARCHAR(60) NOT NULL,
  "payload" JSONB NOT NULL,
  "user_id" UUID,
  "tenant_id" UUID,
  CONSTRAINT "platform_correlation_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_deploy_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sha" VARCHAR(40) NOT NULL,
  "short_sha" VARCHAR(12) NOT NULL,
  "deployed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deploy_run_url" VARCHAR(500) NOT NULL,
  "deploy_run_id" VARCHAR(40) NOT NULL,
  "migration_version" VARCHAR(80),
  "status" "platform_deploy_status" NOT NULL,
  "duration_seconds" INTEGER,
  "rollback_of_id" UUID,
  "commit_message" TEXT,
  "commit_author_email" VARCHAR(200),
  "failure_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_deploy_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_runbook_index" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "path" VARCHAR(500) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "alert_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "audit_actions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "error_fingerprints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "components" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "severity" VARCHAR(20),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "raw_front_matter" JSONB NOT NULL,
  "content_sha" VARCHAR(64) NOT NULL,
  "indexed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_runbook_index_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_service_topology" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" VARCHAR(120) NOT NULL,
  "kind" VARCHAR(40) NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "depends_on_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "affects_product_areas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "suspected_repo_areas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "related_queue_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "related_module_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "related_components" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "owner_notes" TEXT,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_service_topology_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_severity_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" VARCHAR(120) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "component" VARCHAR(60),
  "product_area" VARCHAR(120),
  "tenant_scope" VARCHAR(40) NOT NULL DEFAULT 'any',
  "condition_config" JSONB NOT NULL,
  "severity" VARCHAR(20) NOT NULL,
  "operator_guidance" TEXT,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_severity_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_runbook_index_path_key" ON "platform_runbook_index"("path");
CREATE UNIQUE INDEX "platform_service_topology_key_key" ON "platform_service_topology"("key");
CREATE UNIQUE INDEX "platform_severity_policies_key_key" ON "platform_severity_policies"("key");

CREATE INDEX "idx_platform_correlation_events_correlation" ON "platform_correlation_events"("correlation_id", "occurred_at");
CREATE INDEX "idx_platform_correlation_events_occurred" ON "platform_correlation_events"("occurred_at" DESC);
CREATE INDEX "idx_platform_deploy_events_deployed" ON "platform_deploy_events"("deployed_at" DESC);
CREATE INDEX "idx_platform_deploy_events_sha" ON "platform_deploy_events"("sha");
CREATE INDEX "idx_platform_deploy_events_status" ON "platform_deploy_events"("status");
CREATE INDEX "idx_platform_runbooks_alert_keys" ON "platform_runbook_index" USING GIN ("alert_keys");
CREATE INDEX "idx_platform_runbooks_audit_actions" ON "platform_runbook_index" USING GIN ("audit_actions");
CREATE INDEX "idx_platform_runbooks_error_fingerprints" ON "platform_runbook_index" USING GIN ("error_fingerprints");
CREATE INDEX "idx_platform_runbooks_components" ON "platform_runbook_index" USING GIN ("components");
CREATE INDEX "idx_platform_service_topology_kind" ON "platform_service_topology"("kind");
CREATE INDEX "idx_platform_service_topology_depends" ON "platform_service_topology" USING GIN ("depends_on_keys");
CREATE INDEX "idx_platform_service_topology_areas" ON "platform_service_topology" USING GIN ("affects_product_areas");
CREATE INDEX "idx_platform_severity_policies_component" ON "platform_severity_policies"("component");
CREATE INDEX "idx_platform_severity_policies_severity" ON "platform_severity_policies"("severity");

ALTER TABLE "platform_deploy_events"
  ADD CONSTRAINT "platform_deploy_events_rollback_of_id_fkey"
  FOREIGN KEY ("rollback_of_id") REFERENCES "platform_deploy_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
