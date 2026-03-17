-- CreateEnum
CREATE TYPE "FormDefinitionStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ApplicationFieldType" AS ENUM ('short_text', 'long_text', 'number', 'date', 'boolean', 'single_select', 'multi_select', 'phone', 'email', 'country', 'yes_no');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('draft', 'submitted', 'under_review', 'pending_acceptance_approval', 'accepted', 'rejected', 'withdrawn');

-- CreateTable
CREATE TABLE "admission_form_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "base_form_id" UUID,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "status" "FormDefinitionStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "admission_form_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_form_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "form_definition_id" UUID NOT NULL,
    "field_key" VARCHAR(100) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "help_text" TEXT,
    "field_type" "ApplicationFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "visible_to_parent" BOOLEAN NOT NULL DEFAULT true,
    "visible_to_staff" BOOLEAN NOT NULL DEFAULT true,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "reportable" BOOLEAN NOT NULL DEFAULT false,
    "options_json" JSONB,
    "validation_rules_json" JSONB,
    "conditional_visibility_json" JSONB,
    "display_order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "admission_form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "form_definition_id" UUID NOT NULL,
    "application_number" VARCHAR(50) NOT NULL,
    "submitted_by_parent_id" UUID,
    "student_first_name" VARCHAR(100) NOT NULL,
    "student_last_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ,
    "reviewed_at" TIMESTAMPTZ,
    "reviewed_by_user_id" UUID,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "application_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idx_form_definitions_version" ON "admission_form_definitions"("tenant_id", "base_form_id", "version_number");

-- CreateIndex
CREATE INDEX "idx_form_definitions_tenant" ON "admission_form_definitions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_form_definitions_base" ON "admission_form_definitions"("base_form_id");

-- CreateIndex
CREATE INDEX "idx_form_fields_definition" ON "admission_form_fields"("form_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_applications_number" ON "applications"("tenant_id", "application_number");

-- CreateIndex
CREATE INDEX "idx_applications_tenant_status" ON "applications"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_applications_tenant_form" ON "applications"("tenant_id", "form_definition_id");

-- CreateIndex
CREATE INDEX "idx_application_notes_application" ON "application_notes"("application_id");

-- AddForeignKey
ALTER TABLE "admission_form_definitions" ADD CONSTRAINT "admission_form_definitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_form_definitions" ADD CONSTRAINT "admission_form_definitions_base_form_id_fkey" FOREIGN KEY ("base_form_id") REFERENCES "admission_form_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_form_fields" ADD CONSTRAINT "admission_form_fields_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_form_fields" ADD CONSTRAINT "admission_form_fields_form_definition_id_fkey" FOREIGN KEY ("form_definition_id") REFERENCES "admission_form_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_form_definition_id_fkey" FOREIGN KEY ("form_definition_id") REFERENCES "admission_form_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_submitted_by_parent_id_fkey" FOREIGN KEY ("submitted_by_parent_id") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
