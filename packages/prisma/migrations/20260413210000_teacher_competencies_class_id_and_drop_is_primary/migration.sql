-- Stage 1 of scheduler rebuild: evolve teacher_competencies from year-group-grained
-- to hybrid pool/pin grain.
--
--   class_id IS NULL     → pool entry: "Sarah is qualified for Year 2 English; the
--                          solver picks which section she teaches."
--   class_id = <uuid>    → pin: "Sarah teaches 2A English; the solver must honour this."
--
-- The legacy is_primary boolean expressed a weak preference and produced ambiguous
-- behaviour when multiple teachers were "primary" for the same subject/year. Every
-- row is now a real assignment — the tiered primary-vs-secondary logic is deleted.

-- 1. Add nullable class_id column + FK to classes (cascade on update and delete).
ALTER TABLE "teacher_competencies"
  ADD COLUMN "class_id" UUID;

ALTER TABLE "teacher_competencies"
  ADD CONSTRAINT "teacher_competencies_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Drop the old 5-column unique index; we replace it with the 6-column variant
--    that includes class_id. Postgres treats NULL as distinct for uniqueness, so
--    a pool row (class_id = NULL) and a pin row (class_id = <uuid>) for the same
--    (tenant, year, staff, subject, year_group) coexist — which is the intended shape.
DROP INDEX "idx_teacher_competency_unique";

-- 3. Drop the is_primary boolean.
ALTER TABLE "teacher_competencies"
  DROP COLUMN "is_primary";

-- 4. Recreate the unique index with class_id appended.
CREATE UNIQUE INDEX "idx_teacher_competency_unique"
  ON "teacher_competencies"("tenant_id", "academic_year_id", "staff_profile_id", "subject_id", "year_group_id", "class_id");

-- 5. Add an index to accelerate pin lookups (who is pinned to this class?).
CREATE INDEX "idx_teacher_competencies_tenant_class"
  ON "teacher_competencies"("tenant_id", "class_id");
