-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM (
  'attendance',
  'gradebook',
  'admissions',
  'finance',
  'communications',
  'payroll',
  'general',
  'scheduling',
  'approvals',
  'compliance',
  'ai',
  'homework',
  'parent_digest'
);

-- CreateTable
CREATE TABLE "tenant_module_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "module_key" "ModuleKey" NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "tenant_module_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint on (tenant_id, module_key)
CREATE UNIQUE INDEX "tenant_module_settings_tenant_id_module_key_key"
  ON "tenant_module_settings"("tenant_id", "module_key");

-- CreateIndex: lookup by tenant
CREATE INDEX "idx_tenant_module_settings_tenant"
  ON "tenant_module_settings"("tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_module_settings"
  ADD CONSTRAINT "tenant_module_settings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
