-- Phase D: Safeguarding indexes for SLA tracking, reporter queries, and assignment views

-- Compound indexes on safeguarding_concerns
CREATE INDEX IF NOT EXISTS "idx_safeguarding_concerns_severity_status"
  ON "safeguarding_concerns" ("tenant_id", "severity", "status");

CREATE INDEX IF NOT EXISTS "idx_safeguarding_concerns_reporter"
  ON "safeguarding_concerns" ("tenant_id", "reported_by_id");

CREATE INDEX IF NOT EXISTS "idx_safeguarding_concerns_assignee"
  ON "safeguarding_concerns" ("tenant_id", "assigned_to_id", "status");

-- Chronological indexes on safeguarding_actions (replace old simple index)
DROP INDEX IF EXISTS "idx_safeguarding_actions_concern";

CREATE INDEX IF NOT EXISTS "idx_safeguarding_actions_concern_chrono"
  ON "safeguarding_actions" ("tenant_id", "concern_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_safeguarding_actions_staff"
  ON "safeguarding_actions" ("tenant_id", "action_by_id", "created_at" DESC);

-- Partial indexes for worker jobs (cannot be expressed in Prisma schema)

-- SLA check worker: find concerns past SLA deadline that haven't been acknowledged
CREATE INDEX IF NOT EXISTS "idx_safeguarding_concerns_sla_overdue"
  ON "safeguarding_concerns" ("tenant_id", "sla_first_response_due")
  WHERE "sla_first_response_met_at" IS NULL AND "status" NOT IN ('resolved', 'sealed');

-- Attachment scan backlog
CREATE INDEX IF NOT EXISTS "idx_behaviour_attachments_scan_pending"
  ON "behaviour_attachments" ("tenant_id", "scan_status")
  WHERE "scan_status" = 'pending';

-- Break-glass expiry: active grants approaching expiry
CREATE INDEX IF NOT EXISTS "idx_safeguarding_break_glass_active"
  ON "safeguarding_break_glass_grants" ("tenant_id", "expires_at")
  WHERE "revoked_at" IS NULL;

-- Break-glass after-action review pending
CREATE INDEX IF NOT EXISTS "idx_safeguarding_break_glass_review_pending"
  ON "safeguarding_break_glass_grants" ("tenant_id")
  WHERE "after_action_review_required" = true AND "after_action_review_completed_at" IS NULL;
