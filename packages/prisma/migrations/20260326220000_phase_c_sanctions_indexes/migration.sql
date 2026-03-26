-- Phase C: Add superseded to SanctionStatus + additional indexes

-- Add superseded value to SanctionStatus enum
ALTER TYPE "SanctionStatus" ADD VALUE IF NOT EXISTS 'superseded';

-- Sanctions: additional indexes for Phase C queries
CREATE INDEX IF NOT EXISTS "idx_behaviour_sanctions_date_status"
  ON "behaviour_sanctions" ("tenant_id", "scheduled_date", "status");

CREATE INDEX IF NOT EXISTS "idx_behaviour_sanctions_supervisor"
  ON "behaviour_sanctions" ("tenant_id", "supervised_by_id", "scheduled_date");

CREATE INDEX IF NOT EXISTS "idx_behaviour_sanctions_type_status"
  ON "behaviour_sanctions" ("tenant_id", "type", "status");

-- Partial index for suspension return worker
CREATE INDEX IF NOT EXISTS "idx_behaviour_sanctions_suspension_end"
  ON "behaviour_sanctions" ("tenant_id", "suspension_end_date")
  WHERE "suspension_end_date" IS NOT NULL;

-- Appeals: additional indexes
CREATE INDEX IF NOT EXISTS "idx_behaviour_appeals_incident"
  ON "behaviour_appeals" ("tenant_id", "incident_id");

CREATE INDEX IF NOT EXISTS "idx_behaviour_appeals_submitted"
  ON "behaviour_appeals" ("tenant_id", "submitted_at");

-- Partial index for sanction appeals
CREATE INDEX IF NOT EXISTS "idx_behaviour_appeals_sanction"
  ON "behaviour_appeals" ("tenant_id", "sanction_id")
  WHERE "sanction_id" IS NOT NULL;

-- Exclusion cases: appeal window index
CREATE INDEX IF NOT EXISTS "idx_behaviour_exclusions_appeal_window"
  ON "behaviour_exclusion_cases" ("tenant_id", "status", "appeal_deadline");

-- Partial index for deadline tracking
CREATE INDEX IF NOT EXISTS "idx_behaviour_exclusions_deadline"
  ON "behaviour_exclusion_cases" ("tenant_id", "appeal_deadline")
  WHERE "appeal_deadline" IS NOT NULL;

-- Amendment notices: pending corrections queue
CREATE INDEX IF NOT EXISTS "idx_behaviour_amendments_pending"
  ON "behaviour_amendment_notices" ("tenant_id", "correction_notification_sent")
  WHERE "correction_notification_sent" = false;
