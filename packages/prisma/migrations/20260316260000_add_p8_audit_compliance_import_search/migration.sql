-- P8: Audit Logs, Compliance Requests, Import Jobs, Search Index Status
-- CreateEnum (idempotent)
DO $$ BEGIN CREATE TYPE "ComplianceRequestType" AS ENUM ('access_export', 'erasure', 'rectification'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ComplianceSubjectType" AS ENUM ('parent', 'student', 'household', 'user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ComplianceRequestStatus" AS ENUM ('submitted', 'classified', 'approved', 'rejected', 'completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ComplianceClassification" AS ENUM ('erase', 'anonymise', 'retain_legal_basis'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ImportType" AS ENUM ('students', 'parents', 'staff', 'fees', 'exam_results', 'staff_compensation'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ImportStatus" AS ENUM ('uploaded', 'validated', 'processing', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SearchIndexStatusEnum" AS ENUM ('pending', 'indexed', 'search_failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "actor_user_id" UUID,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "request_type" "ComplianceRequestType" NOT NULL,
    "subject_type" "ComplianceSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "status" "ComplianceRequestStatus" NOT NULL DEFAULT 'submitted',
    "classification" "ComplianceClassification",
    "decision_notes" TEXT,
    "export_file_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "import_type" "ImportType" NOT NULL,
    "file_key" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'uploaded',
    "summary_json" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_index_status" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "index_status" "SearchIndexStatusEnum" NOT NULL DEFAULT 'pending',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_index_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_audit_logs_tenant_entity" ON "audit_logs"("tenant_id", "entity_type", "entity_id");
CREATE INDEX "idx_audit_logs_tenant_actor" ON "audit_logs"("tenant_id", "actor_user_id");
CREATE INDEX "idx_audit_logs_created" ON "audit_logs"("tenant_id", "created_at");
CREATE INDEX "idx_compliance_requests_tenant" ON "compliance_requests"("tenant_id", "status");
CREATE INDEX "idx_import_jobs_tenant" ON "import_jobs"("tenant_id", "status");
CREATE UNIQUE INDEX "idx_search_index_status_unique" ON "search_index_status"("tenant_id", "entity_type", "entity_id");
CREATE INDEX "idx_search_index_status_pending" ON "search_index_status"("tenant_id", "index_status");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_requests" ADD CONSTRAINT "compliance_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_requests" ADD CONSTRAINT "compliance_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "search_index_status" ADD CONSTRAINT "search_index_status_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
