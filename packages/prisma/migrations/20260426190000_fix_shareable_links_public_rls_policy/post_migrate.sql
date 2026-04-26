-- Fix-forward for the shareable_links RLS policy.
--
-- The original policy (impl 01) used
--   USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
-- which crashes with PostgreSQL 22P02 ("invalid input syntax for type
-- uuid: \"\"") when the public open route at /api/v1/budgeting/share/:token
-- runs WITHOUT any tenant context — the empty string can't be cast to
-- uuid before the policy USING clause is evaluated.
--
-- Two changes:
--
-- 1. Use `current_setting('app.current_tenant_id', true)::uuid` so a
--    missing setting returns NULL (and `tenant_id = NULL` evaluates to
--    NULL → no rows match), matching the pattern already used by
--    tenant_domains_tenant_isolation.
--
-- 2. Add `shareable_links_public_token_bootstrap` — a SELECT-only
--    policy that activates when `app.public_share_token` is set
--    (typically by ShareableLinksService.resolveByToken via
--    runWithRlsContext). It exposes ONLY the row whose token matches
--    the bootstrap setting, so the public open route cannot enumerate
--    other tenants' links. The service still runs application-level
--    checks (expiry, revoked_at, password match,
--    tenant_id-vs-snapshot.tenant_id) before returning the payload.

DROP POLICY IF EXISTS shareable_links_tenant_isolation ON shareable_links;
DROP POLICY IF EXISTS shareable_links_public_token_bootstrap ON shareable_links;

CREATE POLICY shareable_links_tenant_isolation ON shareable_links
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY shareable_links_public_token_bootstrap ON shareable_links
  FOR SELECT
  USING (
    current_setting('app.public_share_token', true) IS NOT NULL
    AND token::text = current_setting('app.public_share_token', true)
  );
