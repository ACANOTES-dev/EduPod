-- Fix exclusion constraint to include year_group_id
-- Different year groups legitimately have periods at the same times
-- Without year_group_id, the constraint blocks per-year-group timetables

ALTER TABLE schedule_period_templates DROP CONSTRAINT IF EXISTS schedule_period_templates_no_time_overlap;

ALTER TABLE schedule_period_templates
  ADD CONSTRAINT schedule_period_templates_no_time_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    academic_year_id WITH =,
    COALESCE(year_group_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    weekday WITH =,
    timerange(start_time, end_time) WITH &&
  );
