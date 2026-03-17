-- ============================================================
-- P2 Post-Migrate: Triggers, RLS Policies, Generated Columns,
--                  Exclusion Constraints, Partial Indexes
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS → CREATE).

-- ─── Updated-at Triggers ─────────────────────────────────────────────────────
-- Applied to every P2 table that has an updated_at column.
-- The set_updated_at() function was created in P1's post_migrate.sql.

DO $$ BEGIN
  -- households
  DROP TRIGGER IF EXISTS trg_households_updated_at ON households;
  CREATE TRIGGER trg_households_updated_at
    BEFORE UPDATE ON households
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- household_emergency_contacts
  DROP TRIGGER IF EXISTS trg_household_emergency_contacts_updated_at ON household_emergency_contacts;
  CREATE TRIGGER trg_household_emergency_contacts_updated_at
    BEFORE UPDATE ON household_emergency_contacts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- parents
  DROP TRIGGER IF EXISTS trg_parents_updated_at ON parents;
  CREATE TRIGGER trg_parents_updated_at
    BEFORE UPDATE ON parents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- household_parents
  DROP TRIGGER IF EXISTS trg_household_parents_updated_at ON household_parents;
  CREATE TRIGGER trg_household_parents_updated_at
    BEFORE UPDATE ON household_parents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- students
  DROP TRIGGER IF EXISTS trg_students_updated_at ON students;
  CREATE TRIGGER trg_students_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- student_parents
  DROP TRIGGER IF EXISTS trg_student_parents_updated_at ON student_parents;
  CREATE TRIGGER trg_student_parents_updated_at
    BEFORE UPDATE ON student_parents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- staff_profiles
  DROP TRIGGER IF EXISTS trg_staff_profiles_updated_at ON staff_profiles;
  CREATE TRIGGER trg_staff_profiles_updated_at
    BEFORE UPDATE ON staff_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- academic_years
  DROP TRIGGER IF EXISTS trg_academic_years_updated_at ON academic_years;
  CREATE TRIGGER trg_academic_years_updated_at
    BEFORE UPDATE ON academic_years
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- academic_periods
  DROP TRIGGER IF EXISTS trg_academic_periods_updated_at ON academic_periods;
  CREATE TRIGGER trg_academic_periods_updated_at
    BEFORE UPDATE ON academic_periods
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- year_groups
  DROP TRIGGER IF EXISTS trg_year_groups_updated_at ON year_groups;
  CREATE TRIGGER trg_year_groups_updated_at
    BEFORE UPDATE ON year_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- subjects
  DROP TRIGGER IF EXISTS trg_subjects_updated_at ON subjects;
  CREATE TRIGGER trg_subjects_updated_at
    BEFORE UPDATE ON subjects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- classes
  DROP TRIGGER IF EXISTS trg_classes_updated_at ON classes;
  CREATE TRIGGER trg_classes_updated_at
    BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- class_enrolments
  DROP TRIGGER IF EXISTS trg_class_enrolments_updated_at ON class_enrolments;
  CREATE TRIGGER trg_class_enrolments_updated_at
    BEFORE UPDATE ON class_enrolments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- NOTE: class_staff does NOT get this trigger (no updated_at column)
END $$;

-- ─── RLS Policies ────────────────────────────────────────────────────────────
-- Standard pattern: tenant_id = current_setting('app.current_tenant_id')::uuid

-- households
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE households FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS households_tenant_isolation ON households;
CREATE POLICY households_tenant_isolation ON households
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- household_emergency_contacts
ALTER TABLE household_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_emergency_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS household_emergency_contacts_tenant_isolation ON household_emergency_contacts;
CREATE POLICY household_emergency_contacts_tenant_isolation ON household_emergency_contacts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- parents
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parents_tenant_isolation ON parents;
CREATE POLICY parents_tenant_isolation ON parents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- household_parents
ALTER TABLE household_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_parents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS household_parents_tenant_isolation ON household_parents;
CREATE POLICY household_parents_tenant_isolation ON household_parents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- students
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS students_tenant_isolation ON students;
CREATE POLICY students_tenant_isolation ON students
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- student_parents
ALTER TABLE student_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_parents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_parents_tenant_isolation ON student_parents;
CREATE POLICY student_parents_tenant_isolation ON student_parents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- staff_profiles
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_profiles_tenant_isolation ON staff_profiles;
CREATE POLICY staff_profiles_tenant_isolation ON staff_profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- academic_years
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS academic_years_tenant_isolation ON academic_years;
CREATE POLICY academic_years_tenant_isolation ON academic_years
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- academic_periods
ALTER TABLE academic_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS academic_periods_tenant_isolation ON academic_periods;
CREATE POLICY academic_periods_tenant_isolation ON academic_periods
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- year_groups
ALTER TABLE year_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS year_groups_tenant_isolation ON year_groups;
CREATE POLICY year_groups_tenant_isolation ON year_groups
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- subjects
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subjects_tenant_isolation ON subjects;
CREATE POLICY subjects_tenant_isolation ON subjects
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- classes
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS classes_tenant_isolation ON classes;
CREATE POLICY classes_tenant_isolation ON classes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- class_staff
ALTER TABLE class_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_staff FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_staff_tenant_isolation ON class_staff;
CREATE POLICY class_staff_tenant_isolation ON class_staff
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- class_enrolments
ALTER TABLE class_enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrolments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_enrolments_tenant_isolation ON class_enrolments;
CREATE POLICY class_enrolments_tenant_isolation ON class_enrolments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Generated Columns ──────────────────────────────────────────────────────
-- Prisma doesn't support GENERATED ALWAYS AS ... STORED.
-- Drop placeholder columns created by Prisma, replace with generated columns.

ALTER TABLE students DROP COLUMN IF EXISTS full_name;
ALTER TABLE students DROP COLUMN IF EXISTS full_name_ar;

ALTER TABLE students ADD COLUMN full_name VARCHAR(255) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;
ALTER TABLE students ADD COLUMN full_name_ar VARCHAR(255) GENERATED ALWAYS AS (
  CASE WHEN first_name_ar IS NOT NULL AND last_name_ar IS NOT NULL
    THEN first_name_ar || ' ' || last_name_ar
    ELSE NULL
  END
) STORED;

-- ─── Exclusion Constraints ───────────────────────────────────────────────────
-- btree_gist extension was enabled in P1's post_migrate.sql.

-- Prevent overlapping academic years within a tenant
ALTER TABLE academic_years DROP CONSTRAINT IF EXISTS excl_academic_years_overlap;
ALTER TABLE academic_years ADD CONSTRAINT excl_academic_years_overlap
  EXCLUDE USING gist (tenant_id WITH =, daterange(start_date, end_date, '[]') WITH &&);

-- Prevent overlapping academic periods within the same academic year
ALTER TABLE academic_periods DROP CONSTRAINT IF EXISTS excl_academic_periods_overlap;
ALTER TABLE academic_periods ADD CONSTRAINT excl_academic_periods_overlap
  EXCLUDE USING gist (tenant_id WITH =, academic_year_id WITH =, daterange(start_date, end_date, '[]') WITH &&);

-- ─── Partial Indexes ─────────────────────────────────────────────────────────

-- Allergy report partial index
DROP INDEX IF EXISTS idx_students_allergy;
CREATE INDEX idx_students_allergy ON students(tenant_id) WHERE has_allergy = true;
