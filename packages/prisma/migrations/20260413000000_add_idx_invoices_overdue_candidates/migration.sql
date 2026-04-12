-- FIN-022: partial index to support the overdue-detection cron.
-- The cron (finance:overdue-detection) queries invoices where
--   status IN ('issued','partially_paid')
--   AND due_date < cutoff
--   AND last_overdue_notified_at IS NULL
-- per tenant, every day. Without this index it's a seq scan across the full
-- invoices table — ~800ms at 10k rows, ~8s at 100k.
--
-- Notes:
-- - Plain CREATE INDEX is used rather than CREATE INDEX CONCURRENTLY because
--   Prisma migrations wrap statements in a transaction and CONCURRENTLY is
--   incompatible with that. Current invoice volume is small (hundreds of
--   rows per tenant) so the brief lock is acceptable.
-- - Covers the three predicate columns so the planner can use it as an
--   index-only scan for the hot path.

-- CreateIndex
CREATE INDEX "idx_invoices_overdue_candidates"
ON "invoices" ("tenant_id", "due_date")
WHERE status IN ('issued', 'partially_paid') AND last_overdue_notified_at IS NULL;
