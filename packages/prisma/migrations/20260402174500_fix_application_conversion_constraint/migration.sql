-- Ensure only one successful conversion note can exist per application.
-- Concurrent conversion attempts will cause one transaction to roll back.
CREATE UNIQUE INDEX "idx_application_notes_conversion_once"
  ON "application_notes" ("application_id")
  WHERE "is_internal" = true
    AND "note" LIKE 'Converted to student:%';
