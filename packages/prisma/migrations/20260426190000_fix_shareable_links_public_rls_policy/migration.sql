-- Fix-forward migration for the shareable_links public RLS policy.
--
-- Schema-level: no-op (no column or table changes).
-- Policy-level: see post_migrate.sql in this directory — it drops the
-- old tenant_isolation policy (which crashed with 22P02 when the public
-- open route had no `app.current_tenant_id` setting) and replaces it
-- with a `(..., true)`-flagged version plus a `public_token_bootstrap`
-- policy that matches the row by token when
-- `app.public_share_token` is set by the resolver.

-- Force prisma migrate to register a row for this migration.
SELECT 1;
