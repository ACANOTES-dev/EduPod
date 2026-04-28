-- =============================================================
-- Multi-Language Expansion (Impl 01) — schema foundation
-- =============================================================
-- Adds three new columns and backfills existing tenants to {en, ar}
-- so the CHECK constraint added in post_migrate.sql passes for every
-- pre-existing row.
--
-- Why split CHECK + index into post_migrate.sql instead of keeping
-- everything here? The pre-push hook bootstraps the paralleltest DB
-- with `prisma db push`, which syncs schema.prisma but does NOT execute
-- migration files. Anything that lives only in migration.sql will be
-- absent on the integration test DB. Schema-level CHECK constraints
-- and GIN indexes can't be expressed in schema.prisma, so they MUST
-- live in post_migrate.sql (which IS run by the pre-push hook + by
-- production deploys after `prisma migrate deploy`).
--
-- This file therefore handles:
--   * Column adds (also reflected in schema.prisma)
--   * One-time backfill of existing tenants

-- 1. Add new columns. supported_locales defaults to {en} so new
-- tenants are immediately valid against the CHECK constraint that
-- post_migrate.sql adds.
ALTER TABLE "tenants"
  ADD COLUMN "supported_locales" VARCHAR(10)[] NOT NULL DEFAULT ARRAY['en']::VARCHAR(10)[];

ALTER TABLE "households"
  ADD COLUMN "secondary_locale" VARCHAR(10),
  ADD COLUMN "dual_language_opt_in" BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill: every existing tenant supports en + ar (preserves
-- status quo — both languages have always been served). Only touch
-- rows that still hold the column default; if a future migration
-- pre-populates them, we leave that custom value alone. This MUST
-- run before the CHECK constraint in post_migrate.sql attaches —
-- otherwise rows whose default_locale='ar' would fail validation
-- ('ar' not in {'en'}).
UPDATE "tenants"
SET "supported_locales" = ARRAY['en','ar']::VARCHAR(10)[]
WHERE "supported_locales" = ARRAY['en']::VARCHAR(10)[];
