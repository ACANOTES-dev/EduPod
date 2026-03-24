-- CreateTable
CREATE TABLE "nl_query_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "structured_query_json" JSONB NOT NULL,
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "nl_query_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_nl_query_history_tenant_user" ON "nl_query_history"("tenant_id", "user_id");

-- AddForeignKey
ALTER TABLE "nl_query_history" ADD CONSTRAINT "nl_query_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nl_query_history" ADD CONSTRAINT "nl_query_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS Policy
ALTER TABLE "nl_query_history" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_nl_query_history" ON "nl_query_history"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
