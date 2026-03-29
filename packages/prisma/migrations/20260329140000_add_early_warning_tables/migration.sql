-- Phase 01: Early Warning System Foundation

-- ─── 1. Create Enums ────────────────────────────────────────────────────────

CREATE TYPE "early_warning_risk_tier" AS ENUM ('green', 'yellow', 'amber', 'red');

CREATE TYPE "early_warning_domain" AS ENUM ('attendance', 'grades', 'behaviour', 'wellbeing', 'engagement');

CREATE TYPE "early_warning_signal_severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- ─── 2. Create Tables ───────────────────────────────────────────────────────

-- student_risk_profiles: one row per student per academic year
CREATE TABLE "student_risk_profiles" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"           UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id"          UUID NOT NULL REFERENCES "students"("id") ON DELETE RESTRICT,
  "academic_year_id"    UUID NOT NULL REFERENCES "academic_years"("id") ON DELETE RESTRICT,
  "composite_score"     DECIMAL(5,2) NOT NULL DEFAULT 0,
  "risk_tier"           "early_warning_risk_tier" NOT NULL DEFAULT 'green',
  "tier_entered_at"     TIMESTAMPTZ,
  "attendance_score"    DECIMAL(5,2) NOT NULL DEFAULT 0,
  "grades_score"        DECIMAL(5,2) NOT NULL DEFAULT 0,
  "behaviour_score"     DECIMAL(5,2) NOT NULL DEFAULT 0,
  "wellbeing_score"     DECIMAL(5,2) NOT NULL DEFAULT 0,
  "engagement_score"    DECIMAL(5,2) NOT NULL DEFAULT 0,
  "signal_summary_json" JSONB,
  "trend_json"          JSONB,
  "assigned_to_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "assigned_at"         TIMESTAMPTZ,
  "last_computed_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- student_risk_signals: append-only signal audit trail (no updated_at)
CREATE TABLE "student_risk_signals" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"          UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id"         UUID NOT NULL REFERENCES "students"("id") ON DELETE RESTRICT,
  "academic_year_id"   UUID NOT NULL REFERENCES "academic_years"("id") ON DELETE RESTRICT,
  "domain"             "early_warning_domain" NOT NULL,
  "signal_type"        VARCHAR(100) NOT NULL,
  "severity"           "early_warning_signal_severity" NOT NULL,
  "score_contribution" DECIMAL(5,2) NOT NULL,
  "details_json"       JSONB,
  "source_entity_type" VARCHAR(100) NOT NULL,
  "source_entity_id"   UUID NOT NULL,
  "detected_at"        TIMESTAMPTZ NOT NULL,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- early_warning_tier_transitions: append-only tier transition log (no updated_at)
CREATE TABLE "early_warning_tier_transitions" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"            UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id"           UUID NOT NULL REFERENCES "students"("id") ON DELETE RESTRICT,
  "profile_id"           UUID NOT NULL REFERENCES "student_risk_profiles"("id") ON DELETE CASCADE,
  "from_tier"            "early_warning_risk_tier",
  "to_tier"              "early_warning_risk_tier" NOT NULL,
  "composite_score"      DECIMAL(5,2) NOT NULL,
  "trigger_signals_json" JSONB,
  "routed_to_user_id"    UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "notification_id"      UUID REFERENCES "notifications"("id") ON DELETE SET NULL,
  "transitioned_at"      TIMESTAMPTZ NOT NULL,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- early_warning_configs: one row per tenant
CREATE TABLE "early_warning_configs" (
  "id"                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"                 UUID NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "is_enabled"                BOOLEAN NOT NULL DEFAULT false,
  "weights_json"              JSONB NOT NULL DEFAULT '{"attendance":25,"grades":25,"behaviour":20,"wellbeing":20,"engagement":10}',
  "thresholds_json"           JSONB NOT NULL DEFAULT '{"green":0,"yellow":30,"amber":50,"red":75}',
  "hysteresis_buffer"         INT NOT NULL DEFAULT 10,
  "routing_rules_json"        JSONB NOT NULL DEFAULT '{"yellow":{"role":"homeroom_teacher"},"amber":{"role":"year_head"},"red":{"roles":["principal","pastoral_lead"]}}',
  "digest_day"                INT NOT NULL DEFAULT 1,
  "digest_recipients_json"    JSONB NOT NULL DEFAULT '[]',
  "high_severity_events_json" JSONB NOT NULL DEFAULT '["suspension","critical_incident","third_consecutive_absence"]',
  "created_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. Unique Constraints ──────────────────────────────────────────────────

ALTER TABLE "student_risk_profiles"
  ADD CONSTRAINT "uq_risk_profile_tenant_student_year"
  UNIQUE ("tenant_id", "student_id", "academic_year_id");

-- ─── 4. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX "idx_risk_profiles_tenant_tier" ON "student_risk_profiles"("tenant_id", "risk_tier");
CREATE INDEX "idx_risk_profiles_tenant_score" ON "student_risk_profiles"("tenant_id", "composite_score" DESC);

CREATE INDEX "idx_risk_signals_tenant_student_detected" ON "student_risk_signals"("tenant_id", "student_id", "detected_at" DESC);
CREATE INDEX "idx_risk_signals_tenant_domain_detected" ON "student_risk_signals"("tenant_id", "domain", "detected_at" DESC);

CREATE INDEX "idx_tier_transitions_tenant_student_at" ON "early_warning_tier_transitions"("tenant_id", "student_id", "transitioned_at" DESC);
CREATE INDEX "idx_tier_transitions_tenant_tier_at" ON "early_warning_tier_transitions"("tenant_id", "to_tier", "transitioned_at" DESC);
