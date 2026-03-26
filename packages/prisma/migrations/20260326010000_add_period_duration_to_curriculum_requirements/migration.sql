-- Add period_duration to curriculum_requirements
-- Allows per-subject override of the lesson duration (in minutes) for scheduling

ALTER TABLE "curriculum_requirements" ADD COLUMN "period_duration" SMALLINT;
