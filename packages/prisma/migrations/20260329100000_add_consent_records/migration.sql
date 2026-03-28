-- GDPR Consent Records

CREATE TABLE "consent_records" (
    "id"                        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"                 UUID         NOT NULL,
    "subject_type"              VARCHAR(20)  NOT NULL,
    "subject_id"                UUID         NOT NULL,
    "consent_type"              VARCHAR(50)  NOT NULL,
    "status"                    VARCHAR(20)  NOT NULL DEFAULT 'granted',
    "granted_at"                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "withdrawn_at"              TIMESTAMPTZ,
    "granted_by_user_id"        UUID         NOT NULL,
    "evidence_type"             VARCHAR(30)  NOT NULL,
    "privacy_notice_version_id" UUID,
    "notes"                     TEXT,
    "created_at"                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"                TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "consent_records"
ADD CONSTRAINT "consent_records_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "consent_records"
ADD CONSTRAINT "consent_records_granted_by_user_id_fkey"
FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "uq_active_consent"
ON "consent_records"("tenant_id", "subject_type", "subject_id", "consent_type")
WHERE "status" = 'granted';

CREATE INDEX "idx_consent_tenant_subject"
ON "consent_records"("tenant_id", "subject_type", "subject_id");

CREATE INDEX "idx_consent_tenant_type"
ON "consent_records"("tenant_id", "consent_type");
