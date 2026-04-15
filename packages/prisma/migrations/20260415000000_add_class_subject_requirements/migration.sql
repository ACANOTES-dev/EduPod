-- ════════════════════════════════════════════════════════════════════════════
-- SCHED-023: per-(class, subject) requirement overrides on top of year-group
-- curriculum. Lets admins express "Y11-A Physics = 4 periods/week in LAB02"
-- without editing the year-group curriculum that every Y11 class inherits.
--
-- Depends on: 20260414140000_add_leave_and_cover
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE "class_subject_requirements" (
    "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"              UUID NOT NULL,
    "academic_year_id"       UUID NOT NULL,
    "class_id"               UUID NOT NULL,
    "subject_id"             UUID NOT NULL,
    "periods_per_week"       SMALLINT NOT NULL,
    "max_periods_per_day"    SMALLINT,
    "preferred_room_id"      UUID,
    "required_room_type"     "RoomType",
    "requires_double_period" BOOLEAN NOT NULL DEFAULT FALSE,
    "double_period_count"    SMALLINT,
    "notes"                  TEXT,
    "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "class_subject_requirements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idx_class_subject_req_unique"
    ON "class_subject_requirements"("tenant_id", "academic_year_id", "class_id", "subject_id");

CREATE INDEX "idx_class_subject_req_tenant_year"
    ON "class_subject_requirements"("tenant_id", "academic_year_id");

CREATE INDEX "idx_class_subject_req_class"
    ON "class_subject_requirements"("tenant_id", "academic_year_id", "class_id");

ALTER TABLE "class_subject_requirements"
    ADD CONSTRAINT "class_subject_requirements_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_subject_requirements"
    ADD CONSTRAINT "class_subject_requirements_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_subject_requirements"
    ADD CONSTRAINT "class_subject_requirements_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_subject_requirements"
    ADD CONSTRAINT "class_subject_requirements_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_subject_requirements"
    ADD CONSTRAINT "class_subject_requirements_preferred_room_id_fkey"
    FOREIGN KEY ("preferred_room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Periods-per-week must be non-negative.
ALTER TABLE "class_subject_requirements"
    ADD CONSTRAINT "class_subject_requirements_periods_per_week_nonnegative"
    CHECK ("periods_per_week" >= 0);

ALTER TABLE "class_subject_requirements"
    ADD CONSTRAINT "class_subject_requirements_max_periods_per_day_positive"
    CHECK ("max_periods_per_day" IS NULL OR "max_periods_per_day" > 0);

ALTER TABLE "class_subject_requirements"
    ADD CONSTRAINT "class_subject_requirements_double_period_count_positive"
    CHECK ("double_period_count" IS NULL OR "double_period_count" > 0);
