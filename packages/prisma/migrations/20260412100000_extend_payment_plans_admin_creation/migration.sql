-- Extend PaymentPlanStatus enum with admin-plan statuses
ALTER TYPE "PaymentPlanStatus" ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE "PaymentPlanStatus" ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE "PaymentPlanStatus" ADD VALUE IF NOT EXISTS 'cancelled';

-- Make invoice_id nullable (admin-created plans have no invoice)
ALTER TABLE "payment_plan_requests" ALTER COLUMN "invoice_id" DROP NOT NULL;

-- Make requested_by_parent_id nullable (admin-created plans have no parent requester)
ALTER TABLE "payment_plan_requests" ALTER COLUMN "requested_by_parent_id" DROP NOT NULL;

-- Make reason nullable (admin-created plans use admin_notes instead)
ALTER TABLE "payment_plan_requests" ALTER COLUMN "reason" DROP NOT NULL;

-- Add admin-created plan fields
ALTER TABLE "payment_plan_requests" ADD COLUMN "original_balance" DECIMAL(12,2);
ALTER TABLE "payment_plan_requests" ADD COLUMN "discount_amount" DECIMAL(12,2);
ALTER TABLE "payment_plan_requests" ADD COLUMN "discount_reason" TEXT;
ALTER TABLE "payment_plan_requests" ADD COLUMN "created_by_user_id" UUID;

-- FK for created_by_user_id
ALTER TABLE "payment_plan_requests"
  ADD CONSTRAINT "payment_plan_requests_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
