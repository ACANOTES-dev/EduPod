-- Add year_group_id to unique constraints on schedule_period_templates
-- This allows different year groups to have their own period grids
-- (previously the constraints prevented per-year-group timetables)

-- Drop old unique indexes (without year_group_id)
DROP INDEX IF EXISTS "idx_schedule_period_templates_order";
DROP INDEX IF EXISTS "idx_schedule_period_templates_time";

-- Recreate with year_group_id included
CREATE UNIQUE INDEX "idx_schedule_period_templates_order" ON "schedule_period_templates"("tenant_id", "academic_year_id", "year_group_id", "weekday", "period_order");
CREATE UNIQUE INDEX "idx_schedule_period_templates_time" ON "schedule_period_templates"("tenant_id", "academic_year_id", "year_group_id", "weekday", "start_time");
