-- ════════════════════════════════════════════════════════════════════════════
-- SCHED-022: additional year-group links for cross-year-group classes
-- (electives, Advanced Music, Higher-Level Maths, etc.). A class keeps
-- its primary `classes.year_group_id` — that decides the class's home
-- period grid and the default scheduling context. The junction table
-- below lets admins mark the class as "also belongs to" other year
-- groups so the class lists under those year groups' admin views and so
-- reports that filter by year group include the class.
--
-- Scheduling behaviour is unchanged: the solver already routes cross-year
-- student conflicts via `student_overlaps`, which is generated from
-- `class_enrolments` directly (students enrolled in classes across year
-- groups produce overlap pairs independent of this junction). The
-- junction serves admin/UI visibility only.
--
-- Depends on: 20260415000000_add_class_subject_requirements
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE "class_year_group_links" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID NOT NULL,
    "class_id"      UUID NOT NULL,
    "year_group_id" UUID NOT NULL,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "class_year_group_links_pkey" PRIMARY KEY ("id")
);

-- One link row per (class, year_group) pair.
CREATE UNIQUE INDEX "idx_class_year_group_links_unique"
    ON "class_year_group_links"("tenant_id", "class_id", "year_group_id");

CREATE INDEX "idx_class_year_group_links_class"
    ON "class_year_group_links"("tenant_id", "class_id");

CREATE INDEX "idx_class_year_group_links_year_group"
    ON "class_year_group_links"("tenant_id", "year_group_id");

ALTER TABLE "class_year_group_links"
    ADD CONSTRAINT "class_year_group_links_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_year_group_links"
    ADD CONSTRAINT "class_year_group_links_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_year_group_links"
    ADD CONSTRAINT "class_year_group_links_year_group_id_fkey"
    FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
