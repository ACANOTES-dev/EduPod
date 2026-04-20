-- Wellbeing Rebuild — Implementation 05: Behaviour AI query history
--
-- Adds a dedicated table for persisting natural-language AI query
-- interactions so the Wave 6 UI (impl 19) can render structured history
-- beyond what the audit log captures. Per-user scoped; admins with
-- `behaviour.view_staff_analytics` can see cross-user history via the
-- service layer.

CREATE TABLE "behaviour_ai_query_history" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"    UUID NOT NULL,
    "user_id"      UUID NOT NULL,
    "question"     TEXT NOT NULL,
    "answer"       TEXT NOT NULL,
    "data_payload" JSONB,
    "citations"    JSONB,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "behaviour_ai_query_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_behaviour_ai_query_history_tenant_user_generated"
    ON "behaviour_ai_query_history" ("tenant_id", "user_id", "generated_at" DESC);

CREATE INDEX "idx_behaviour_ai_query_history_tenant_generated"
    ON "behaviour_ai_query_history" ("tenant_id", "generated_at" DESC);

ALTER TABLE "behaviour_ai_query_history"
    ADD CONSTRAINT "behaviour_ai_query_history_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "behaviour_ai_query_history"
    ADD CONSTRAINT "behaviour_ai_query_history_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
