-- CreateTable ai_ask_ai_history
CREATE TABLE "ai_ask_ai_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "query_text" TEXT NOT NULL,
    "result_json" JSONB NOT NULL,
    "was_saved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_ask_ai_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ai_ask_ai_history_user_recent" ON "ai_ask_ai_history"("tenant_id", "user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "ai_ask_ai_history" ADD CONSTRAINT "ai_ask_ai_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_ask_ai_history" ADD CONSTRAINT "ai_ask_ai_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS and create policy
ALTER TABLE "ai_ask_ai_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_ask_ai_history" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_ask_ai_history_tenant_isolation" ON "ai_ask_ai_history";
CREATE POLICY "ai_ask_ai_history_tenant_isolation" ON "ai_ask_ai_history"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
