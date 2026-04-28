-- =============================================================
-- Multi-Language Expansion (Impl 01) — schema-level guarantees
-- =============================================================
-- These statements are idempotent (DROP IF EXISTS + CREATE) so the
-- post-migrate runner can apply them to a fresh DB or re-apply them
-- if needed. They MUST live here (not in migration.sql) because the
-- pre-push hook bootstraps the paralleltest DB via `prisma db push`,
-- which does not execute migration.sql files but DOES run this script
-- through the `db:post-migrate` step.

-- ─── tenants_default_locale_in_supported (CHECK constraint) ───────────────
-- Guarantees default_locale is always one of the locales the tenant can
-- serve. The platform-admin UI shipped in implementation 03 relies on
-- this to refuse "remove the default locale from supported_locales"
-- requests at the schema level (defence in depth — the API also blocks
-- it at the controller layer).

ALTER TABLE "tenants"
  DROP CONSTRAINT IF EXISTS "tenants_default_locale_in_supported";

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_default_locale_in_supported"
  CHECK ("default_locale" = ANY ("supported_locales"));

-- ─── idx_tenants_supported_locales (GIN index) ────────────────────────────
-- Speeds up membership queries against supported_locales — primarily
-- the platform-admin tooling that asks "which tenants support locale X"
-- when planning a rollout.

DROP INDEX IF EXISTS "idx_tenants_supported_locales";

CREATE INDEX "idx_tenants_supported_locales"
  ON "tenants" USING GIN ("supported_locales");
