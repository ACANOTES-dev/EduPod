-- AlterEnum: add new status values to ImportStatus
ALTER TYPE "ImportStatus" ADD VALUE 'rolled_back';
ALTER TYPE "ImportStatus" ADD VALUE 'partially_rolled_back';

-- AlterTable: add preview_json to import_jobs
ALTER TABLE "import_jobs" ADD COLUMN "preview_json" JSONB;

-- CreateTable: import_job_records
CREATE TABLE "import_job_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "import_job_id" UUID NOT NULL,
    "record_type" VARCHAR(50) NOT NULL,
    "record_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_job_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_import_job_records_job" ON "import_job_records"("import_job_id");
CREATE INDEX "idx_import_job_records_lookup" ON "import_job_records"("tenant_id", "record_type", "record_id");

-- AddForeignKey
ALTER TABLE "import_job_records" ADD CONSTRAINT "import_job_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_job_records" ADD CONSTRAINT "import_job_records_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS Policy
ALTER TABLE "import_job_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "import_job_records"
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY "tenant_isolation_insert" ON "import_job_records"
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
