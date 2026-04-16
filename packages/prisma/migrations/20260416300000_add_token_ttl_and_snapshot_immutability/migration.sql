-- RC-C002: Add expires_at to verification tokens (default: now + 1 year)
ALTER TABLE "report_card_verification_tokens"
  ADD COLUMN "expires_at" TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 year');

-- Backfill existing tokens: set expires_at = created_at + 1 year
UPDATE "report_card_verification_tokens"
  SET "expires_at" = "created_at" + interval '1 year'
  WHERE "expires_at" = (now() + interval '1 year');

-- RC-C011: Prevent snapshot_payload_json mutations on published report cards.
-- Deleting the entire row is still allowed; only UPDATEs to the payload are blocked.
CREATE OR REPLACE FUNCTION prevent_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'published'
     AND NEW.snapshot_payload_json IS DISTINCT FROM OLD.snapshot_payload_json THEN
    RAISE EXCEPTION 'Cannot modify snapshot_payload_json on a published report card (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_report_cards_snapshot_immutable ON report_cards;
CREATE TRIGGER trg_report_cards_snapshot_immutable
  BEFORE UPDATE ON report_cards
  FOR EACH ROW
  EXECUTE FUNCTION prevent_snapshot_mutation();
