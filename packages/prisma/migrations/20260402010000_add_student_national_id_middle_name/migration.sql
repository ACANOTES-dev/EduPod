-- Add missing student columns (existed in Prisma schema but had no migration)
ALTER TABLE "students" ADD COLUMN "national_id" VARCHAR(50);
ALTER TABLE "students" ADD COLUMN "middle_name" VARCHAR(100);
