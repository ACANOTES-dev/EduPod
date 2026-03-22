CREATE TABLE "year_group_grade_weights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "year_group_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "category_weights_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "year_group_grade_weights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idx_year_group_grade_weights_unique" ON "year_group_grade_weights"("tenant_id", "year_group_id", "academic_period_id");
CREATE INDEX "idx_year_group_grade_weights_tenant" ON "year_group_grade_weights"("tenant_id");

ALTER TABLE "year_group_grade_weights" ADD CONSTRAINT "year_group_grade_weights_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "year_group_grade_weights" ADD CONSTRAINT "year_group_grade_weights_year_group_id_fkey" FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "year_group_grade_weights" ADD CONSTRAINT "year_group_grade_weights_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS policy
ALTER TABLE "year_group_grade_weights" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "year_group_grade_weights" USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
