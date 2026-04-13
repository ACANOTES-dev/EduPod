-- COMMS-022: thread fallback-chain tracking through the notifications table.
--
-- Notifications created as fallbacks (whatsapp → sms → email → in_app)
-- currently get a fresh idempotency_key and no link back to the original
-- failed notification. Analytics can't correlate a failed primary with
-- its eventual successful fallback.
--
-- Add a nullable `chain_id UUID` column. The dispatcher (worker:
-- apps/worker/src/processors/communications/dispatch-notifications.processor.ts)
-- mints a chain_id the first time it creates a fallback, back-fills the
-- original, then propagates to every subsequent fallback. Existing rows
-- stay NULL — they are not retroactively linked.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS chain_id UUID;

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_chain
  ON notifications (tenant_id, chain_id);
