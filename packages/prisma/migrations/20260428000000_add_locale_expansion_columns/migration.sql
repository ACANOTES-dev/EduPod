-- =============================================================
-- Multi-Language Expansion (Impl 01) — schema foundation
-- =============================================================
-- Adds three new columns + a CHECK constraint + a GIN index.
-- Backfills every existing tenant to {en, ar} so the CHECK
-- constraint passes immediately. New tenants default to {en}
-- only — platform admin opts them into more later via the
-- admin UI shipped in implementation 03.

-- 1. Add new columns. supported_locales must default to {en} so
-- new tenants are valid against the CHECK constraint at insert
-- time without explicit population.
ALTER TABLE "tenants"
  ADD COLUMN "supported_locales" VARCHAR(10)[] NOT NULL DEFAULT ARRAY['en']::VARCHAR(10)[];

ALTER TABLE "households"
  ADD COLUMN "secondary_locale" VARCHAR(10),
  ADD COLUMN "dual_language_opt_in" BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill: every existing tenant supports en + ar (preserves
-- status quo — both languages have always been served). Only touch
-- rows that still hold the column default; if a future migration
-- pre-populates them, we leave that custom value alone.
UPDATE "tenants"
SET "supported_locales" = ARRAY['en','ar']::VARCHAR(10)[]
WHERE "supported_locales" = ARRAY['en']::VARCHAR(10)[];

-- 3. Enforce: default_locale must be one of the supported locales.
-- We add the constraint AFTER the backfill so it doesn't reject any
-- existing row whose default_locale is 'ar' (or anything other than 'en').
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_default_locale_in_supported"
  CHECK ("default_locale" = ANY ("supported_locales"));

-- 4. GIN index for membership queries
-- (e.g., "all tenants supporting fr" in admin tooling).
CREATE INDEX "idx_tenants_supported_locales"
  ON "tenants" USING GIN ("supported_locales");
