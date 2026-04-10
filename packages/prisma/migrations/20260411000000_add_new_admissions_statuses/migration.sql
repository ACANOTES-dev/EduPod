-- ============================================================
-- New Admissions — Schema Foundation (Part 1 of 2)
-- ============================================================
--
-- Wave 1, Implementation 01. Expand-then-contract refactor of the
-- ApplicationStatus enum to support the financially-gated admissions
-- pipeline. This first migration only ADDS the new enum values so
-- the data remap in the follow-up migration has valid targets.
--
-- `ALTER TYPE ... ADD VALUE` cannot run inside a transaction, so each
-- statement is wrapped in its own implicit transaction. `IF NOT EXISTS`
-- keeps the migration idempotent on re-run.

ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'waiting_list';
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'ready_to_admit';
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'conditional_approval';
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'approved';
