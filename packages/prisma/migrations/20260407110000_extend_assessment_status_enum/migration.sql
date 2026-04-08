-- ============================================================
-- Extend AssessmentStatus Enum (separate migration for PG safety)
-- PostgreSQL requires new enum values to be committed before use.
-- ============================================================

ALTER TYPE "AssessmentStatus" ADD VALUE IF NOT EXISTS 'submitted_locked';
ALTER TYPE "AssessmentStatus" ADD VALUE IF NOT EXISTS 'unlock_requested';
ALTER TYPE "AssessmentStatus" ADD VALUE IF NOT EXISTS 'reopened';
ALTER TYPE "AssessmentStatus" ADD VALUE IF NOT EXISTS 'final_locked';
