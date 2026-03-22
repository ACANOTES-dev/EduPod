-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid_online', 'paid_cash', 'payment_plan', 'waived');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "applications" ADD COLUMN "payment_amount" DECIMAL(12,2);
ALTER TABLE "applications" ADD COLUMN "discount_applied" DECIMAL(12,2);
ALTER TABLE "applications" ADD COLUMN "payment_deadline" TIMESTAMPTZ;
ALTER TABLE "applications" ADD COLUMN "stripe_payment_intent_id" VARCHAR(255);
ALTER TABLE "applications" ADD COLUMN "rejection_reason" TEXT;

-- CreateIndex
CREATE INDEX "idx_applications_payment_deadline" ON "applications"("tenant_id", "payment_status", "payment_deadline");
