-- Add callback columns to approval_requests (existed in Prisma schema but had no migration)
ALTER TABLE "approval_requests" ADD COLUMN "callback_status" VARCHAR(20);
ALTER TABLE "approval_requests" ADD COLUMN "callback_error" TEXT;
ALTER TABLE "approval_requests" ADD COLUMN "callback_attempts" INTEGER NOT NULL DEFAULT 0;
