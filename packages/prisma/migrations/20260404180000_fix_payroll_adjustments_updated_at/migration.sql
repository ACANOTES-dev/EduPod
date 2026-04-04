-- Fix schema drift: add missing updated_at column to payroll_adjustments
-- The Prisma schema has this column with @updatedAt but the original
-- migration (20260324150000) omitted it.

ALTER TABLE "payroll_adjustments"
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Also fix reference_period to be nullable (matches Prisma schema String?)
ALTER TABLE "payroll_adjustments"
  ALTER COLUMN "reference_period" DROP NOT NULL;
