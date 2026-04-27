-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('hard_bounce', 'soft_bounce_threshold', 'complaint', 'manual', 'unsubscribe');

-- CreateEnum
CREATE TYPE "EmailDomainStatus" AS ENUM ('pending', 'verified', 'failed');

-- CreateEnum
CREATE TYPE "DnsRecordStatus" AS ENUM ('pending', 'verified', 'failed');

-- CreateEnum
CREATE TYPE "WhatsAppTemplateCategory" AS ENUM ('utility', 'marketing', 'authentication');

-- CreateEnum
CREATE TYPE "WhatsAppTemplateStatus" AS ENUM ('pending', 'submitted', 'approved', 'rejected', 'paused');

-- CreateTable
CREATE TABLE "tenant_email_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "resend_api_key_encrypted" TEXT NOT NULL,
    "from_email" VARCHAR(255) NOT NULL,
    "from_name" VARCHAR(255),
    "reply_to_email" VARCHAR(255),
    "webhook_secret_encrypted" TEXT,
    "encryption_key_ref" VARCHAR(255) NOT NULL,
    "key_last_rotated_at" TIMESTAMPTZ,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_verified_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_email_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_sms_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "twilio_account_sid_encrypted" TEXT NOT NULL,
    "twilio_auth_token_encrypted" TEXT NOT NULL,
    "twilio_from_number" VARCHAR(50) NOT NULL,
    "webhook_secret_encrypted" TEXT,
    "encryption_key_ref" VARCHAR(255) NOT NULL,
    "key_last_rotated_at" TIMESTAMPTZ,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_verified_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_sms_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_whatsapp_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "twilio_account_sid_encrypted" TEXT NOT NULL,
    "twilio_auth_token_encrypted" TEXT NOT NULL,
    "twilio_whatsapp_from_number" VARCHAR(50) NOT NULL,
    "business_profile_id" VARCHAR(255),
    "webhook_secret_encrypted" TEXT,
    "encryption_key_ref" VARCHAR(255) NOT NULL,
    "key_last_rotated_at" TIMESTAMPTZ,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_verified_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_whatsapp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_suppression_list" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient_address" VARCHAR(320) NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" VARCHAR(64),
    "notification_id" UUID,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_suppression_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_email_domains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "resend_domain_id" VARCHAR(255),
    "status" "EmailDomainStatus" NOT NULL,
    "spf_status" "DnsRecordStatus" NOT NULL,
    "dkim_status" "DnsRecordStatus" NOT NULL,
    "dmarc_status" "DnsRecordStatus" NOT NULL,
    "dns_records_json" JSONB NOT NULL,
    "last_checked_at" TIMESTAMPTZ,
    "verified_at" TIMESTAMPTZ,
    "failure_reason" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_email_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "template_key" VARCHAR(128) NOT NULL,
    "twilio_template_sid" VARCHAR(64),
    "template_name" VARCHAR(128) NOT NULL,
    "language_code" VARCHAR(16) NOT NULL,
    "category" "WhatsAppTemplateCategory" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "WhatsAppTemplateStatus" NOT NULL,
    "approval_message" TEXT,
    "submitted_at" TIMESTAMPTZ,
    "approved_at" TIMESTAMPTZ,
    "last_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_service_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "recipient_phone" VARCHAR(50) NOT NULL,
    "last_inbound_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_service_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "notification_id" UUID,
    "payload_json" JSONB NOT NULL,
    "signature_verified" BOOLEAN NOT NULL,
    "processed_at" TIMESTAMPTZ,
    "processing_error" TEXT,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_email_configs_tenant_id_key" ON "tenant_email_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_sms_configs_tenant_id_key" ON "tenant_sms_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_whatsapp_configs_tenant_id_key" ON "tenant_whatsapp_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_suppression_tenant_channel_expiry" ON "notification_suppression_list"("tenant_id", "channel", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_suppression_tenant_channel_recipient" ON "notification_suppression_list"("tenant_id", "channel", "recipient_address");

-- CreateIndex
CREATE INDEX "idx_email_domain_status_check" ON "tenant_email_domains"("status", "last_checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_domain_tenant_domain" ON "tenant_email_domains"("tenant_id", "domain");

-- CreateIndex
CREATE INDEX "idx_whatsapp_template_status_sync" ON "whatsapp_templates"("status", "last_synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_whatsapp_template_tenant_key_lang" ON "whatsapp_templates"("tenant_id", "template_key", "language_code");

-- CreateIndex
CREATE INDEX "idx_whatsapp_window_expiry" ON "whatsapp_service_windows"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_whatsapp_window_tenant_recipient" ON "whatsapp_service_windows"("tenant_id", "recipient_phone");

-- CreateIndex
CREATE INDEX "idx_webhook_tenant_channel_received" ON "notification_webhook_events"("tenant_id", "channel", "received_at" DESC);

-- CreateIndex
CREATE INDEX "idx_webhook_processed_at" ON "notification_webhook_events"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_webhook_tenant_provider_event" ON "notification_webhook_events"("tenant_id", "provider_event_id");

-- AddForeignKey
ALTER TABLE "tenant_email_configs" ADD CONSTRAINT "tenant_email_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_email_configs" ADD CONSTRAINT "tenant_email_configs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_sms_configs" ADD CONSTRAINT "tenant_sms_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_sms_configs" ADD CONSTRAINT "tenant_sms_configs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_whatsapp_configs" ADD CONSTRAINT "tenant_whatsapp_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_whatsapp_configs" ADD CONSTRAINT "tenant_whatsapp_configs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_suppression_list" ADD CONSTRAINT "notification_suppression_list_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_email_domains" ADD CONSTRAINT "tenant_email_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_service_windows" ADD CONSTRAINT "whatsapp_service_windows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_webhook_events" ADD CONSTRAINT "notification_webhook_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

