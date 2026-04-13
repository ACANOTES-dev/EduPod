-- ADM-009: add machine-parseable action enum + column to application_notes.
--
-- Today every Timeline tab entry renders the generic label "Admin note"
-- because there is no structured field on `application_notes` describing
-- what kind of state-machine transition the note was attached to. This
-- prevents action-based filtering, structured audit exports, and per-
-- action analytics. Adding a nullable enum column is non-destructive —
-- existing rows stay NULL and the frontend falls back to the inferred
-- label for them; every new note from the state-machine writes a
-- non-null value going forward.

CREATE TYPE "AdmissionNoteAction" AS ENUM (
  'submitted',
  'auto_routed',
  'moved_to_conditional_approval',
  'cash_recorded',
  'bank_recorded',
  'stripe_completed',
  'override_approved',
  'rejected',
  'withdrawn',
  'auto_promoted',
  'manually_promoted',
  'reverted_by_expiry',
  'payment_link_regenerated',
  'admin_note'
);

ALTER TABLE application_notes
  ADD COLUMN IF NOT EXISTS action "AdmissionNoteAction";
