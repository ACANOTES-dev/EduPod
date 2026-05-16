CREATE TABLE "tenant_maintenance_windows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "message" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "tenant_maintenance_windows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_maintenance_windows_time_check" CHECK ("ends_at" > "starts_at")
);

CREATE INDEX "idx_maintenance_windows_tenant_start"
  ON "tenant_maintenance_windows" ("tenant_id", "starts_at");

CREATE INDEX "idx_maintenance_windows_schedule"
  ON "tenant_maintenance_windows" ("starts_at", "ends_at");

ALTER TABLE "tenant_maintenance_windows"
  ADD CONSTRAINT "tenant_maintenance_windows_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_maintenance_windows"
  ADD CONSTRAINT "tenant_maintenance_windows_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
