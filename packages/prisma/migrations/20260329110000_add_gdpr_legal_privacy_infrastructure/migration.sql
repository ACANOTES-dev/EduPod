-- GDPR Legal & Privacy Infrastructure

CREATE TABLE "data_processing_agreements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "dpa_version" VARCHAR(20) NOT NULL,
    "accepted_by_user_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "dpa_content_hash" VARCHAR(128) NOT NULL,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "data_processing_agreements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dpa_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" VARCHAR(20) NOT NULL,
    "content_html" TEXT NOT NULL,
    "content_hash" VARCHAR(128) NOT NULL,
    "effective_date" DATE NOT NULL,
    "superseded_at" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "dpa_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "privacy_notice_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "content_html" TEXT NOT NULL,
    "content_html_ar" TEXT,
    "effective_date" DATE NOT NULL,
    "published_at" TIMESTAMPTZ,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "privacy_notice_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "privacy_notice_acknowledgements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "privacy_notice_version_id" UUID NOT NULL,
    "acknowledged_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "ip_address" VARCHAR(45),

    CONSTRAINT "privacy_notice_acknowledgements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sub_processor_register_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" VARCHAR(20) NOT NULL,
    "change_summary" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ NOT NULL,
    "objection_deadline" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sub_processor_register_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sub_processor_register_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "register_version_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "purpose" TEXT NOT NULL,
    "data_categories" TEXT NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "transfer_mechanism" VARCHAR(200) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_planned" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sub_processor_register_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dpa_versions_version_key" ON "dpa_versions"("version");
CREATE INDEX "idx_dpa_tenant" ON "data_processing_agreements"("tenant_id");
CREATE UNIQUE INDEX "privacy_notice_versions_tenant_id_version_number_key" ON "privacy_notice_versions"("tenant_id", "version_number");
CREATE INDEX "idx_privacy_notice_versions_tenant_published" ON "privacy_notice_versions"("tenant_id", "published_at");
CREATE UNIQUE INDEX "uq_privacy_notice_ack" ON "privacy_notice_acknowledgements"("tenant_id", "user_id", "privacy_notice_version_id");
CREATE INDEX "idx_privacy_notice_ack_tenant_user" ON "privacy_notice_acknowledgements"("tenant_id", "user_id");
CREATE UNIQUE INDEX "sub_processor_register_versions_version_key" ON "sub_processor_register_versions"("version");
CREATE INDEX "idx_sub_processor_entries_version_order" ON "sub_processor_register_entries"("register_version_id", "display_order");

ALTER TABLE "data_processing_agreements"
ADD CONSTRAINT "data_processing_agreements_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "data_processing_agreements"
ADD CONSTRAINT "data_processing_agreements_accepted_by_user_id_fkey"
FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "privacy_notice_versions"
ADD CONSTRAINT "privacy_notice_versions_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "privacy_notice_versions"
ADD CONSTRAINT "privacy_notice_versions_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "privacy_notice_acknowledgements"
ADD CONSTRAINT "privacy_notice_acknowledgements_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "privacy_notice_acknowledgements"
ADD CONSTRAINT "privacy_notice_acknowledgements_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "privacy_notice_acknowledgements"
ADD CONSTRAINT "privacy_notice_acknowledgements_privacy_notice_version_id_fkey"
FOREIGN KEY ("privacy_notice_version_id") REFERENCES "privacy_notice_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sub_processor_register_entries"
ADD CONSTRAINT "sub_processor_register_entries_register_version_id_fkey"
FOREIGN KEY ("register_version_id") REFERENCES "sub_processor_register_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consent_records"
ADD CONSTRAINT "fk_consent_privacy_notice"
FOREIGN KEY ("privacy_notice_version_id") REFERENCES "privacy_notice_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
