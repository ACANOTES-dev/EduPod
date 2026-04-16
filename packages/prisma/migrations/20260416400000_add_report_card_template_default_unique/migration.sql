-- Bug RC-C025: only one default report card template per (tenant, locale).
-- Before this index, admins could mark several templates `is_default = true`
-- for the same (tenant, locale), leaving the auto-generation pipeline to
-- pick whichever row Postgres returned first — non-deterministic and a
-- support-ticket farm. The partial unique index enforces the invariant at
-- the DB layer so application-level drift cannot reintroduce duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_card_templates_default_per_tenant_locale
  ON report_card_templates (tenant_id, locale)
  WHERE is_default = true;
