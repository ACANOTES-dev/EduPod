-- GDPR Tokenisation Tables

CREATE TABLE "gdpr_anonymisation_tokens" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"    UUID        NOT NULL,
    "entity_type"  VARCHAR(50) NOT NULL,
    "entity_id"    UUID        NOT NULL,
    "field_type"   VARCHAR(50) NOT NULL,
    "token"        VARCHAR(20) NOT NULL,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "gdpr_anonymisation_tokens_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "gdpr_anonymisation_tokens"
ADD CONSTRAINT "gdpr_anonymisation_tokens_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "gdpr_anonymisation_tokens_token_key"
ON "gdpr_anonymisation_tokens"("token");

CREATE UNIQUE INDEX "uq_gdpr_entity_field"
ON "gdpr_anonymisation_tokens"("tenant_id", "entity_type", "entity_id", "field_type");

CREATE INDEX "idx_gdpr_tokens_tenant"
ON "gdpr_anonymisation_tokens"("tenant_id");

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "gdpr_export_policies" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "export_type"  VARCHAR(100) NOT NULL,
    "tokenisation" VARCHAR(20)  NOT NULL DEFAULT 'always',
    "lawful_basis" VARCHAR(100) NOT NULL,
    "description"  TEXT         NOT NULL,
    "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "gdpr_export_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gdpr_export_policies_export_type_key"
ON "gdpr_export_policies"("export_type");

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "gdpr_token_usage_log" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID         NOT NULL,
    "export_type"     VARCHAR(100) NOT NULL,
    "tokenised"       BOOLEAN      NOT NULL,
    "policy_applied"  VARCHAR(100) NOT NULL,
    "lawful_basis"    VARCHAR(100),
    "tokens_used"     UUID[]       NOT NULL,
    "entity_count"    INTEGER      NOT NULL DEFAULT 0,
    "triggered_by"    UUID         NOT NULL,
    "override_by"     UUID,
    "override_reason" TEXT,
    "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "gdpr_token_usage_log_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "gdpr_token_usage_log"
ADD CONSTRAINT "gdpr_token_usage_log_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gdpr_token_usage_log"
ADD CONSTRAINT "gdpr_token_usage_log_triggered_by_fkey"
FOREIGN KEY ("triggered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gdpr_token_usage_log"
ADD CONSTRAINT "gdpr_token_usage_log_override_by_fkey"
FOREIGN KEY ("override_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_gdpr_usage_tenant"
ON "gdpr_token_usage_log"("tenant_id", "created_at");
