-- Platform incidents and operator-triggered postmortems (Layer 4 Session 4E)
-- Platform-level tables only: no tenant_id isolation, no RLS policies.

CREATE TYPE "platform_incident_severity" AS ENUM ('warning', 'critical');

CREATE TYPE "platform_incident_status" AS ENUM (
  'active',
  'monitoring',
  'resolved',
  'cancelled'
);

CREATE TYPE "platform_incident_timeline_event_type" AS ENUM (
  'alert_fired',
  'alert_acknowledged',
  'alert_resolved',
  'ai_recommendation_generated',
  'ai_action_proposed',
  'ai_action_executed',
  'operator_note',
  'deploy_event',
  'related_alert_attached',
  'status_changed'
);

CREATE TABLE "platform_incidents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" VARCHAR(200) NOT NULL,
  "severity" "platform_incident_severity" NOT NULL,
  "status" "platform_incident_status" NOT NULL DEFAULT 'active',
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "resolved_at" TIMESTAMPTZ,
  "resolved_by_user_id" UUID,
  "auto_resolved" BOOLEAN NOT NULL DEFAULT false,
  "seed_alert_history_id" UUID NOT NULL,
  "affected_tenants" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "affected_components" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "root_cause_summary" TEXT,
  "postmortem_draft" TEXT,
  "postmortem_final" TEXT,
  "postmortem_generated_at" TIMESTAMPTZ,
  "postmortem_generations" INTEGER NOT NULL DEFAULT 0,
  "prevention_recommendation_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_incidents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_incident_timeline_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "incident_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "event_type" "platform_incident_timeline_event_type" NOT NULL,
  "alert_history_id" UUID,
  "audit_log_id" UUID,
  "ai_action_proposal_id" UUID,
  "deploy_event_id" UUID,
  "description" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_incident_timeline_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "platform_alert_history"
  ADD COLUMN "incident_id" UUID;

CREATE INDEX "idx_platform_incidents_status_started"
  ON "platform_incidents"("status", "started_at" DESC);

CREATE INDEX "idx_platform_incidents_severity_started"
  ON "platform_incidents"("severity", "started_at" DESC);

CREATE INDEX "idx_platform_incidents_started"
  ON "platform_incidents"("started_at" DESC);

CREATE INDEX "idx_platform_incident_timeline_incident_occurred"
  ON "platform_incident_timeline_events"("incident_id", "occurred_at");

CREATE INDEX "idx_platform_alert_history_incident"
  ON "platform_alert_history"("incident_id");

ALTER TABLE "platform_incidents"
  ADD CONSTRAINT "platform_incidents_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_incident_timeline_events"
  ADD CONSTRAINT "platform_incident_timeline_events_incident_id_fkey"
  FOREIGN KEY ("incident_id") REFERENCES "platform_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_alert_history"
  ADD CONSTRAINT "platform_alert_history_incident_id_fkey"
  FOREIGN KEY ("incident_id") REFERENCES "platform_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_agent_handoff_prompts"
  ADD CONSTRAINT "platform_agent_handoff_prompts_incident_id_fkey"
  FOREIGN KEY ("incident_id") REFERENCES "platform_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
