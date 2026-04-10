-- ============================================================
-- Rename + dedupe report card templates
-- ============================================================
--
-- Round-2 QA B8. The settings page template dropdown was rendering stale
-- names ("Grades only (EN)") and duplicates because the previous seed
-- migration sometimes left orphan rows behind:
--
--   * Tenants that already had the new Editorial Academic / Modern Editorial
--     rows could end up with stale "Grades Only" rows whose name never got
--     updated to the catalogue name.
--   * Tenants that re-ran the seed under unusual conditions could have
--     more than one row per (design_key, locale) pair, which the dropdown
--     then rendered as duplicates.
--   * Some rows in `grades_only` had no `branding_overrides_json.design_key`
--     at all, so the wizard's design grouping ignored them but the settings
--     page's flat `scope.locales` iteration still surfaced them.
--
-- This migration is idempotent and safe to re-run on any tenant DB:
--
--   1. Renames every row whose `branding_overrides_json.design_key` matches
--      a known catalogue entry to that entry's canonical name. Tenants that
--      already have the right names get a no-op UPDATE.
--   2. For each `(tenant_id, design_key, locale)` triple with more than one
--      row, picks a single keeper (default first, then oldest) and re-points
--      every `report_cards.template_id` and `report_card_batch_jobs.template_id`
--      reference from the duplicates to the keeper before deleting them.
--   3. Re-points anything still pointing at an orphan `grades_only` row that
--      has no design_key at the canonical Editorial Academic EN row, then
--      deletes the orphans.
--
-- The dropdown also gets a frontend fix in apps/web that reads the design
-- catalogue grouping rather than the flat scope.locales array, so even if
-- this migration somehow misses a row the UI is no longer affected.

BEGIN;

-- ─── Step 1: rename rows to their catalogue name ──────────────────────────

UPDATE report_card_templates
SET name = 'Editorial Academic'
WHERE branding_overrides_json ->> 'design_key' = 'editorial-academic'
  AND name <> 'Editorial Academic';

UPDATE report_card_templates
SET name = 'Modern Editorial'
WHERE branding_overrides_json ->> 'design_key' = 'modern-editorial'
  AND name <> 'Modern Editorial';

-- ─── Step 2: dedupe by (tenant, design_key, locale) ──────────────────────
-- Pick a keeper for each triple. ROW_NUMBER prefers default rows, then the
-- oldest. The CTE materialises both keepers and dups so the FK repoint can
-- look up the keeper for each duplicate without a self-join.

WITH ranked AS (
  SELECT
    id,
    tenant_id,
    locale,
    branding_overrides_json ->> 'design_key' AS design_key,
    is_default,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY
        tenant_id,
        locale,
        branding_overrides_json ->> 'design_key'
      ORDER BY is_default DESC, created_at ASC, id ASC
    ) AS rn
  FROM report_card_templates
  WHERE branding_overrides_json ->> 'design_key' IN ('editorial-academic', 'modern-editorial')
),
keepers AS (
  SELECT id, tenant_id, locale, design_key
  FROM ranked
  WHERE rn = 1
),
dups AS (
  SELECT id, tenant_id, locale, design_key
  FROM ranked
  WHERE rn > 1
)
UPDATE report_cards rc
SET template_id = k.id
FROM dups d
JOIN keepers k
  ON k.tenant_id = d.tenant_id
 AND k.locale = d.locale
 AND k.design_key = d.design_key
WHERE rc.template_id = d.id;

WITH ranked AS (
  SELECT
    id,
    tenant_id,
    locale,
    branding_overrides_json ->> 'design_key' AS design_key,
    ROW_NUMBER() OVER (
      PARTITION BY
        tenant_id,
        locale,
        branding_overrides_json ->> 'design_key'
      ORDER BY is_default DESC, created_at ASC, id ASC
    ) AS rn
  FROM report_card_templates
  WHERE branding_overrides_json ->> 'design_key' IN ('editorial-academic', 'modern-editorial')
),
keepers AS (
  SELECT id, tenant_id, locale, design_key
  FROM ranked
  WHERE rn = 1
),
dups AS (
  SELECT id, tenant_id, locale, design_key
  FROM ranked
  WHERE rn > 1
)
UPDATE report_card_batch_jobs rcbj
SET template_id = k.id
FROM dups d
JOIN keepers k
  ON k.tenant_id = d.tenant_id
 AND k.locale = d.locale
 AND k.design_key = d.design_key
WHERE rcbj.template_id = d.id;

WITH ranked AS (
  SELECT
    id,
    branding_overrides_json ->> 'design_key' AS design_key,
    ROW_NUMBER() OVER (
      PARTITION BY
        tenant_id,
        locale,
        branding_overrides_json ->> 'design_key'
      ORDER BY is_default DESC, created_at ASC, id ASC
    ) AS rn
  FROM report_card_templates
  WHERE branding_overrides_json ->> 'design_key' IN ('editorial-academic', 'modern-editorial')
)
DELETE FROM report_card_templates rct
USING ranked r
WHERE rct.id = r.id
  AND r.rn > 1;

-- ─── Step 3: clean up orphan grades_only rows with no design_key ─────────
-- These rows came from the original seed before the design grouping
-- existed. They have no design_key and would otherwise pollute the
-- settings dropdown. Re-point any references at the canonical
-- Editorial Academic EN row before deleting.

UPDATE report_cards rc
SET template_id = (
  SELECT id FROM report_card_templates rct
  WHERE rct.tenant_id = rc.tenant_id
    AND rct.content_scope = 'grades_only'
    AND rct.branding_overrides_json ->> 'design_key' = 'editorial-academic'
    AND rct.locale = 'en'
  LIMIT 1
)
WHERE rc.template_id IN (
  SELECT id FROM report_card_templates
  WHERE content_scope = 'grades_only'
    AND (branding_overrides_json ->> 'design_key') IS NULL
)
AND EXISTS (
  SELECT 1 FROM report_card_templates rct
  WHERE rct.tenant_id = rc.tenant_id
    AND rct.content_scope = 'grades_only'
    AND rct.branding_overrides_json ->> 'design_key' = 'editorial-academic'
    AND rct.locale = 'en'
);

UPDATE report_card_batch_jobs rcbj
SET template_id = (
  SELECT id FROM report_card_templates rct
  WHERE rct.tenant_id = rcbj.tenant_id
    AND rct.content_scope = 'grades_only'
    AND rct.branding_overrides_json ->> 'design_key' = 'editorial-academic'
    AND rct.locale = 'en'
  LIMIT 1
)
WHERE rcbj.template_id IN (
  SELECT id FROM report_card_templates
  WHERE content_scope = 'grades_only'
    AND (branding_overrides_json ->> 'design_key') IS NULL
)
AND EXISTS (
  SELECT 1 FROM report_card_templates rct
  WHERE rct.tenant_id = rcbj.tenant_id
    AND rct.content_scope = 'grades_only'
    AND rct.branding_overrides_json ->> 'design_key' = 'editorial-academic'
    AND rct.locale = 'en'
);

DELETE FROM report_card_templates
WHERE content_scope = 'grades_only'
  AND (branding_overrides_json ->> 'design_key') IS NULL;

COMMIT;
