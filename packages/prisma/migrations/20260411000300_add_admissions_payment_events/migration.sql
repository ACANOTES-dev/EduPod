-- ============================================================
-- New Admissions — Stripe Checkout + Webhook (Wave 3 / Impl 06)
-- ============================================================
--
-- Adds the append-only idempotency ledger for Stripe admissions events.
-- Each row records one `checkout.session.completed` webhook delivery so that
-- duplicate Stripe retries cannot re-materialise students or double-approve
-- applications. Scoped to admissions so it does not collide with the existing
-- `Payment.external_event_id` idempotency for invoice flows.
--
-- RLS policy is installed by the accompanying `post_migrate.sql`.
-- Additive and idempotent; safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'AdmissionsPaymentEventStatus'
  ) THEN
    CREATE TYPE "AdmissionsPaymentEventStatus" AS ENUM (
      'succeeded',
      'failed',
      'received_out_of_band'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "admissions_payment_events" (
  "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"         UUID         NOT NULL,
  "application_id"    UUID         NOT NULL,
  "stripe_event_id"   VARCHAR(255) NOT NULL,
  "stripe_session_id" VARCHAR(255),
  "amount_cents"      INTEGER      NOT NULL,
  "status"            "AdmissionsPaymentEventStatus" NOT NULL,
  "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "admissions_payment_events_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admissions_payment_events_tenant_id_fkey'
  ) THEN
    ALTER TABLE "admissions_payment_events"
      ADD CONSTRAINT "admissions_payment_events_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admissions_payment_events_application_id_fkey'
  ) THEN
    ALTER TABLE "admissions_payment_events"
      ADD CONSTRAINT "admissions_payment_events_application_id_fkey"
      FOREIGN KEY ("application_id") REFERENCES "applications"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "admissions_payment_events_stripe_event_id_key"
  ON "admissions_payment_events" ("stripe_event_id");

CREATE INDEX IF NOT EXISTS "idx_admissions_payment_events_app"
  ON "admissions_payment_events" ("tenant_id", "application_id");
