-- AlterEnum
ALTER TYPE "SchedulingRunStatus" ADD VALUE 'blocked';

-- AlterTable
ALTER TABLE "scheduling_runs" ADD COLUMN "feasibility_report" JSONB;
ALTER TABLE "scheduling_runs" ADD COLUMN "diagnostics_refined_report" JSONB;
ALTER TABLE "scheduling_runs" ADD COLUMN "diagnostics_computed_at" TIMESTAMPTZ;
