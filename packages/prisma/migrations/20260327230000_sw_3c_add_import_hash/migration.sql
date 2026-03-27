-- SW-3C: Add import_hash column to pastoral_concerns for CSV import idempotency

ALTER TABLE "pastoral_concerns" ADD COLUMN "import_hash" TEXT;

-- Partial index for idempotency lookups (only non-null hashes)
CREATE INDEX "idx_pastoral_concerns_import_hash" ON "pastoral_concerns"("tenant_id", "import_hash");
