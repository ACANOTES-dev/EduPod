-- Phase F: Upgrade behaviour materialised views to full spec definitions
-- and add additional indexes for alert queries.

-- Add partial index for active alert recipients badge count
CREATE INDEX IF NOT EXISTS idx_behaviour_alert_recipients_active
  ON behaviour_alert_recipients (tenant_id, recipient_id, status)
  WHERE status IN ('unseen', 'seen', 'acknowledged', 'snoozed');

-- Add index for alert type + status dedup queries
CREATE INDEX IF NOT EXISTS idx_behaviour_alerts_type_status
  ON behaviour_alerts (tenant_id, alert_type, status);
