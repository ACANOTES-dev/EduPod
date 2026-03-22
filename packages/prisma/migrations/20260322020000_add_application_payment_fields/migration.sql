-- Fix enum naming from previous migration:
-- Current state: "AdmissionPaymentStatus" has finance values (renamed from PaymentStatus),
--                "PaymentStatus" was recreated with finance values but nothing references it.
-- Target state:  "PaymentStatus" referenced by finance columns, "AdmissionPaymentStatus" for admissions.
DROP TYPE "PaymentStatus";
ALTER TYPE "AdmissionPaymentStatus" RENAME TO "PaymentStatus";

-- Create AdmissionPaymentStatus with correct admission values
CREATE TYPE "AdmissionPaymentStatus" AS ENUM ('pending', 'paid_online', 'paid_cash', 'payment_plan', 'waived');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN "payment_status" "AdmissionPaymentStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "applications" ADD COLUMN "payment_amount" DECIMAL(12,2);
ALTER TABLE "applications" ADD COLUMN "discount_applied" DECIMAL(12,2);
ALTER TABLE "applications" ADD COLUMN "payment_deadline" TIMESTAMPTZ;
ALTER TABLE "applications" ADD COLUMN "stripe_payment_intent_id" VARCHAR(255);
ALTER TABLE "applications" ADD COLUMN "rejection_reason" TEXT;

-- CreateIndex
CREATE INDEX "idx_applications_payment_deadline" ON "applications"("tenant_id", "payment_status", "payment_deadline");
