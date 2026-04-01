-- ============================================================================
-- setup-db-role.sql — Create a restricted application database role
-- ============================================================================
--
-- Run this as a PostgreSQL superuser (e.g. `postgres`) ONCE per environment.
-- The application should connect as this role, NOT as postgres/superuser.
--
-- A non-superuser, non-BYPASSRLS role ensures that Row-Level Security
-- policies are enforced on every query. Without this, RLS is decorative —
-- any superuser or BYPASSRLS role silently bypasses all policies.
--
-- The API server asserts this at startup (RlsRoleCheckService). In
-- production, the app will refuse to start if the connection role has
-- SUPERUSER or BYPASSRLS privileges.
-- ============================================================================

-- 1. Create the restricted application role
CREATE ROLE edupod_app LOGIN PASSWORD 'CHANGE_ME'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS;

-- 2. Grant connection to the application database
GRANT CONNECT ON DATABASE edupod TO edupod_app;

-- 3. Grant schema usage and DML permissions
GRANT USAGE ON SCHEMA public TO edupod_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO edupod_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO edupod_app;

-- 4. Ensure future tables/sequences inherit the same permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO edupod_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO edupod_app;

-- 5. Allow Prisma migrations (optional — only if the app role runs migrations)
--    If migrations are run by a separate superuser role, skip this.
-- GRANT CREATE ON SCHEMA public TO edupod_app;

-- Note: set_config() with is_local=true (used by the RLS middleware) works
-- for any role — no additional grants are needed for RLS context variables.
