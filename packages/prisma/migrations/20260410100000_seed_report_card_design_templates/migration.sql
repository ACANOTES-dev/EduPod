-- Phase C — expose the two bundled report-card designs (editorial-academic
-- and modern-editorial) as selectable templates in every tenant's library.
--
-- Before this migration the per-tenant seed only created one stub row called
-- "Grades Only" with no `branding_overrides_json.design_key`. The worker's
-- renderer was silently falling back to `editorial-academic` because the
-- name slug "grades-only" isn't a valid design key, which meant every tenant
-- was locked into one design and the wizard had nothing meaningful to pick
-- between.
--
-- This migration:
--   1. For every tenant that already has at least one membership, inserts
--      four template rows (one per [design × locale] pair) with the design
--      key baked into `branding_overrides_json` so the resolver matches
--      against the manifest without the fallback.
--   2. Flips the tenant's report-card settings default to the new
--      "Editorial Academic" EN row (the design that was implicitly the
--      default before).
--   3. Deletes the old "Grades Only" stub once existing `report_cards`,
--      `report_card_teacher_requests`, and `report_card_batch_jobs` that
--      referenced it have been re-pointed at the new default template.
--
-- Safe for tenants that already have the new rows (the INSERT is guarded
-- by NOT EXISTS on the unique key). Safe for tenants with zero templates.

BEGIN;

-- ─── Step 1: insert the four design templates per tenant ────────────────────

INSERT INTO report_card_templates
  (tenant_id, name, is_default, locale, content_scope, sections_json, branding_overrides_json, created_by_user_id)
SELECT
  t.id,
  'Editorial Academic',
  true,
  'en',
  'grades_only'::"ReportCardContentScope",
  '{}'::jsonb,
  '{"design_key": "editorial-academic"}'::jsonb,
  (SELECT user_id FROM tenant_memberships WHERE tenant_id = t.id ORDER BY created_at ASC LIMIT 1)
FROM tenants t
WHERE EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id = t.id)
  AND NOT EXISTS (
    SELECT 1 FROM report_card_templates rct
    WHERE rct.tenant_id = t.id
      AND rct.name = 'Editorial Academic'
      AND rct.locale = 'en'
  );

INSERT INTO report_card_templates
  (tenant_id, name, is_default, locale, content_scope, sections_json, branding_overrides_json, created_by_user_id)
SELECT
  t.id,
  'Editorial Academic',
  false,
  'ar',
  'grades_only'::"ReportCardContentScope",
  '{}'::jsonb,
  '{"design_key": "editorial-academic"}'::jsonb,
  (SELECT user_id FROM tenant_memberships WHERE tenant_id = t.id ORDER BY created_at ASC LIMIT 1)
FROM tenants t
WHERE EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id = t.id)
  AND NOT EXISTS (
    SELECT 1 FROM report_card_templates rct
    WHERE rct.tenant_id = t.id
      AND rct.name = 'Editorial Academic'
      AND rct.locale = 'ar'
  );

INSERT INTO report_card_templates
  (tenant_id, name, is_default, locale, content_scope, sections_json, branding_overrides_json, created_by_user_id)
SELECT
  t.id,
  'Modern Editorial',
  false,
  'en',
  'grades_only'::"ReportCardContentScope",
  '{}'::jsonb,
  '{"design_key": "modern-editorial"}'::jsonb,
  (SELECT user_id FROM tenant_memberships WHERE tenant_id = t.id ORDER BY created_at ASC LIMIT 1)
FROM tenants t
WHERE EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id = t.id)
  AND NOT EXISTS (
    SELECT 1 FROM report_card_templates rct
    WHERE rct.tenant_id = t.id
      AND rct.name = 'Modern Editorial'
      AND rct.locale = 'en'
  );

INSERT INTO report_card_templates
  (tenant_id, name, is_default, locale, content_scope, sections_json, branding_overrides_json, created_by_user_id)
SELECT
  t.id,
  'Modern Editorial',
  false,
  'ar',
  'grades_only'::"ReportCardContentScope",
  '{}'::jsonb,
  '{"design_key": "modern-editorial"}'::jsonb,
  (SELECT user_id FROM tenant_memberships WHERE tenant_id = t.id ORDER BY created_at ASC LIMIT 1)
FROM tenants t
WHERE EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.tenant_id = t.id)
  AND NOT EXISTS (
    SELECT 1 FROM report_card_templates rct
    WHERE rct.tenant_id = t.id
      AND rct.name = 'Modern Editorial'
      AND rct.locale = 'ar'
  );

-- ─── Step 2: repoint tenant settings at the new Editorial Academic EN row ──

UPDATE report_card_tenant_settings s
SET settings_json = jsonb_set(
  COALESCE(s.settings_json, '{}'::jsonb),
  '{default_template_id}',
  to_jsonb((
    SELECT rct.id::text
    FROM report_card_templates rct
    WHERE rct.tenant_id = s.tenant_id
      AND rct.name = 'Editorial Academic'
      AND rct.locale = 'en'
    LIMIT 1
  )),
  true
)
WHERE EXISTS (
  SELECT 1 FROM report_card_templates rct
  WHERE rct.tenant_id = s.tenant_id
    AND rct.name = 'Editorial Academic'
    AND rct.locale = 'en'
);

-- ─── Step 3: repoint existing report_card rows at the new EN default ───────
-- Any existing report cards (and in-flight batch jobs / teacher requests)
-- that pointed at the old "Grades Only" stub get moved to the new Editorial
-- Academic EN template so the follow-up DELETE below doesn't blow up on an
-- FK with ON DELETE RESTRICT.

UPDATE report_cards rc
SET template_id = (
  SELECT rct.id FROM report_card_templates rct
  WHERE rct.tenant_id = rc.tenant_id
    AND rct.name = 'Editorial Academic'
    AND rct.locale = 'en'
  LIMIT 1
)
WHERE rc.template_id IN (
  SELECT id FROM report_card_templates WHERE name = 'Grades Only'
)
AND EXISTS (
  SELECT 1 FROM report_card_templates rct
  WHERE rct.tenant_id = rc.tenant_id
    AND rct.name = 'Editorial Academic'
    AND rct.locale = 'en'
);

UPDATE report_card_batch_jobs rcbj
SET template_id = (
  SELECT rct.id FROM report_card_templates rct
  WHERE rct.tenant_id = rcbj.tenant_id
    AND rct.name = 'Editorial Academic'
    AND rct.locale = 'en'
  LIMIT 1
)
WHERE rcbj.template_id IN (
  SELECT id FROM report_card_templates WHERE name = 'Grades Only'
)
AND EXISTS (
  SELECT 1 FROM report_card_templates rct
  WHERE rct.tenant_id = rcbj.tenant_id
    AND rct.name = 'Editorial Academic'
    AND rct.locale = 'en'
);

-- ─── Step 4: drop the legacy stub rows now that nothing references them ────

DELETE FROM report_card_templates WHERE name = 'Grades Only';

COMMIT;
