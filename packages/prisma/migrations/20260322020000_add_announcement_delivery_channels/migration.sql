-- RenameEnum: resolve duplicate PaymentStatus by renaming admissions variant
ALTER TYPE "PaymentStatus" RENAME TO "AdmissionPaymentStatus";

-- Recreate PaymentStatus for finance (was the second definition)
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'posted', 'failed', 'voided', 'refunded_partial', 'refunded_full');

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'sms';

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN "delivery_channels" "NotificationChannel"[] NOT NULL DEFAULT ARRAY['in_app']::"NotificationChannel"[];
