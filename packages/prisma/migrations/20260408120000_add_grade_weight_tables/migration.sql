-- CreateTable: subject_period_weights
-- Determines how much each subject contributes to the overall period grade.
-- Scoped to either a year group (all subclasses inherit) or a specific class.
CREATE TABLE "subject_period_weights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "year_group_id" UUID,
    "class_id" UUID,
    "subject_id" UUID NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "subject_period_weights_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subject_period_weights_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "subject_period_weights_year_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id"),
    CONSTRAINT "subject_period_weights_period_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id"),
    CONSTRAINT "subject_period_weights_yg_fkey" FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id"),
    CONSTRAINT "subject_period_weights_class_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id"),
    CONSTRAINT "subject_period_weights_subject_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id"),
    CONSTRAINT "subject_period_weights_scope_check" CHECK (
        (year_group_id IS NOT NULL AND class_id IS NULL) OR
        (year_group_id IS NULL AND class_id IS NOT NULL)
    )
);

-- Indexes for subject_period_weights
CREATE INDEX "idx_spw_tenant" ON "subject_period_weights"("tenant_id");
CREATE INDEX "idx_spw_tenant_period" ON "subject_period_weights"("tenant_id", "academic_period_id");

-- Partial unique indexes (null-safe) for subject_period_weights
CREATE UNIQUE INDEX "idx_spw_yg_unique"
    ON "subject_period_weights"("tenant_id", "academic_period_id", "year_group_id", "subject_id")
    WHERE "year_group_id" IS NOT NULL;

CREATE UNIQUE INDEX "idx_spw_class_unique"
    ON "subject_period_weights"("tenant_id", "academic_period_id", "class_id", "subject_id")
    WHERE "class_id" IS NOT NULL;

-- RLS for subject_period_weights
ALTER TABLE "subject_period_weights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subject_period_weights" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_period_weights_tenant_isolation ON "subject_period_weights";
CREATE POLICY subject_period_weights_tenant_isolation ON "subject_period_weights"
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);


-- CreateTable: period_year_weights
-- Determines how much each academic period contributes to the final year grade.
-- Scoped to either a year group (all subclasses inherit) or a specific class.
CREATE TABLE "period_year_weights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "year_group_id" UUID,
    "class_id" UUID,
    "weight" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "period_year_weights_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "period_year_weights_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "period_year_weights_year_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id"),
    CONSTRAINT "period_year_weights_period_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id"),
    CONSTRAINT "period_year_weights_yg_fkey" FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id"),
    CONSTRAINT "period_year_weights_class_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id"),
    CONSTRAINT "period_year_weights_scope_check" CHECK (
        (year_group_id IS NOT NULL AND class_id IS NULL) OR
        (year_group_id IS NULL AND class_id IS NOT NULL)
    )
);

-- Indexes for period_year_weights
CREATE INDEX "idx_pyw_tenant" ON "period_year_weights"("tenant_id");
CREATE INDEX "idx_pyw_tenant_year" ON "period_year_weights"("tenant_id", "academic_year_id");

-- Partial unique indexes (null-safe) for period_year_weights
CREATE UNIQUE INDEX "idx_pyw_yg_unique"
    ON "period_year_weights"("tenant_id", "academic_year_id", "academic_period_id", "year_group_id")
    WHERE "year_group_id" IS NOT NULL;

CREATE UNIQUE INDEX "idx_pyw_cls_unique"
    ON "period_year_weights"("tenant_id", "academic_year_id", "academic_period_id", "class_id")
    WHERE "class_id" IS NOT NULL;

-- RLS for period_year_weights
ALTER TABLE "period_year_weights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "period_year_weights" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS period_year_weights_tenant_isolation ON "period_year_weights";
CREATE POLICY period_year_weights_tenant_isolation ON "period_year_weights"
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
