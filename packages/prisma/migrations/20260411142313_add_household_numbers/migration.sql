-- Household numbers — random 6-char (3 letters + 3 digits) per-tenant identifier.
-- NOTE: The column already exists at VARCHAR(50) with 692 legacy values in
-- formats like 'WBU446-2' and 'HH-000001'. We keep VARCHAR(50) to accommodate
-- existing data. New values from the generator always match /^[A-Z]{3}[0-9]{3}$/
-- and the CHECK constraint validates only new insertions (NOT VALID) so existing
-- rows are not blocked.

-- Add student counter for deriving student numbers (XYZ476-01, XYZ476-02, etc.)
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS student_counter INTEGER NOT NULL DEFAULT 0;

-- Unique within tenant; null allowed (existing households are grandfathered).
CREATE UNIQUE INDEX IF NOT EXISTS households_tenant_id_household_number_key
  ON households (tenant_id, household_number)
  WHERE household_number IS NOT NULL;

-- Applications — link to a household (nullable for new-household batches until
-- approval materialises the household) + submission batch + cached sibling priority.
ALTER TABLE applications
  ADD COLUMN household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  ADD COLUMN submission_batch_id UUID,
  ADD COLUMN is_sibling_application BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_applications_tenant_id_household_id
  ON applications (tenant_id, household_id)
  WHERE household_id IS NOT NULL;

CREATE INDEX idx_applications_tenant_id_submission_batch_id
  ON applications (tenant_id, submission_batch_id)
  WHERE submission_batch_id IS NOT NULL;

-- Gate index for tiered FIFO auto-promotion.
CREATE INDEX idx_applications_auto_promotion_tiered
  ON applications (tenant_id, target_academic_year_id, target_year_group_id, is_sibling_application DESC, apply_date ASC)
  WHERE status = 'waiting_list';
