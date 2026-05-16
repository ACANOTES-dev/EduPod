ALTER TABLE "tenants"
  ADD COLUMN "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maintenance_message" TEXT;
