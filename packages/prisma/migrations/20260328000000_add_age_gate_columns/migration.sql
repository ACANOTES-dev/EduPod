-- Phase H: Add age-gated review columns to compliance_requests
ALTER TABLE "compliance_requests" ADD COLUMN "age_gated_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "compliance_requests" ADD COLUMN "age_gated_confirmed_by" UUID;
ALTER TABLE "compliance_requests" ADD COLUMN "age_gated_confirmed_at" TIMESTAMPTZ(6);
ALTER TABLE "compliance_requests" ADD CONSTRAINT "compliance_requests_age_gated_confirmed_by_fkey"
  FOREIGN KEY ("age_gated_confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
