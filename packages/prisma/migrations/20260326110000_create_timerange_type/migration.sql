-- Create custom time range type used by schedule_period_templates exclusion constraint.
-- This must exist before the migration that adds the constraint
-- (20260326120000_fix_period_overlap_constraint_year_group).
-- Previously created only in post_migrate.sql, which runs after all migrations.

DO $$ BEGIN
  CREATE TYPE timerange AS RANGE (subtype = time);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
