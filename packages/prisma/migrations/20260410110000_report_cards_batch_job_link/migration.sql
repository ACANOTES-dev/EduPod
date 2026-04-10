-- Phase B — link every report card row back to the generation run that
-- created it so the library can group documents by run (date/class/run id).
--
-- Nullable for backwards compatibility: report cards created before this
-- migration had no batch_job concept. The 80 orphaned rows carrying
-- `pdf_storage_key` values that don't exist in S3 are being wiped in the
-- same deploy, so in practice every row in the table post-deploy will
-- carry a batch_job_id. New report cards get it at creation time in the
-- worker processor.

ALTER TABLE "report_cards"
  ADD COLUMN "batch_job_id" uuid NULL
    REFERENCES "report_card_batch_jobs"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_report_cards_batch_job"
  ON "report_cards" ("tenant_id", "batch_job_id")
  WHERE "batch_job_id" IS NOT NULL;
