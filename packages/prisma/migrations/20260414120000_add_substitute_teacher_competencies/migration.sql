-- Stage 7 of scheduler rebuild: parallel table to teacher_competencies that
-- holds SUBSTITUTE competencies. Same pin/pool grain — class_id IS NULL means
-- the teacher can cover any section in the year group; class_id = <uuid> means
-- they are the preferred cover for that specific section. Date-specific cover
-- (who's available on 2026-05-04) remains in teacher_absences /
-- substitution_records; this table is "who CAN cover, in general".

CREATE TABLE "substitute_teacher_competencies" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "subject_id"       UUID NOT NULL,
    "year_group_id"    UUID NOT NULL,
    "class_id"         UUID,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "substitute_teacher_competencies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "substitute_teacher_competencies"
    ADD CONSTRAINT "substitute_teacher_competencies_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "substitute_teacher_competencies"
    ADD CONSTRAINT "substitute_teacher_competencies_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "substitute_teacher_competencies"
    ADD CONSTRAINT "substitute_teacher_competencies_staff_profile_id_fkey"
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "substitute_teacher_competencies"
    ADD CONSTRAINT "substitute_teacher_competencies_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "substitute_teacher_competencies"
    ADD CONSTRAINT "substitute_teacher_competencies_year_group_id_fkey"
    FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "substitute_teacher_competencies"
    ADD CONSTRAINT "substitute_teacher_competencies_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 6-column unique — Postgres treats NULL as distinct, so the app layer enforces
-- pool-row uniqueness before insert (same invariant as teacher_competencies).
CREATE UNIQUE INDEX "idx_substitute_teacher_competency_unique"
    ON "substitute_teacher_competencies"("tenant_id", "academic_year_id", "staff_profile_id", "subject_id", "year_group_id", "class_id");

CREATE INDEX "idx_substitute_teacher_competency_staff"
    ON "substitute_teacher_competencies"("tenant_id", "academic_year_id", "staff_profile_id");

CREATE INDEX "idx_substitute_teacher_competency_subject_year"
    ON "substitute_teacher_competencies"("tenant_id", "academic_year_id", "subject_id", "year_group_id");

CREATE INDEX "idx_substitute_teacher_competencies_tenant_class"
    ON "substitute_teacher_competencies"("tenant_id", "class_id");
