-- Fix behaviour MV refresh in production.
--
-- Problem (observed on prod 2026-04-17):
--   [RefreshStudentSummaryJob] Failed to refresh mv_student_behaviour_summary:
--     ERROR: must be owner of materialized view mv_student_behaviour_summary
--
-- Root cause: the three behaviour MVs are owned by `edupod_admin`
-- (BYPASSRLS), but the worker connects as `edupod_app` (RLS-enforced,
-- not MV owner). Running REFRESH MATERIALIZED VIEW directly hits two
-- independent failures:
--
--   1. "must be owner of materialized view ..." — PG requires ownership
--      for REFRESH; there is no separate REFRESH privilege on PG 16 (the
--      MAINTAIN privilege that would cover this only exists on PG 17+).
--   2. "unrecognized configuration parameter "app.current_tenant_id""
--      — the MVs read from RLS-enforced tables whose policies call
--      `current_setting('app.current_tenant_id')::uuid`; those fail at
--      refresh time when the GUC isn't set (cross-tenant refresh can't
--      meaningfully set it to anything).
--
-- Fix: wrap each refresh in a SECURITY DEFINER function owned by
-- `edupod_admin`. The function body runs as the owner, so ownership
-- passes and BYPASSRLS short-circuits the policy checks. The worker
-- (still edupod_app) calls `SELECT refresh_mv_*()` instead of issuing
-- `REFRESH MATERIALIZED VIEW` directly.
--
-- Secondary fix: the `uq_mv_behaviour_exposure_rates` unique index was
-- defined over COALESCE(...) expressions, which PG 16 rejects for
-- REFRESH CONCURRENTLY ("create a unique index with no WHERE clause on
-- one or more columns"). We rebuild it as a plain-column index with
-- NULLS NOT DISTINCT (PG 15+), which both satisfies CONCURRENTLY and
-- preserves the NULL-collapsing semantics of the old expression.
--
-- Applied on production manually as edupod_admin on 2026-04-17 (the
-- automated migrate runner connects as edupod_app and cannot create
-- admin-owned functions or alter admin-owned MVs). The migration is
-- recorded as applied in `_prisma_migrations` on prod; CI and fresh
-- dev envs run this file via the superuser connection and get the
-- same state automatically.

-- ─── Fix mv_behaviour_exposure_rates unique index ─────────────────────────

DROP INDEX IF EXISTS uq_mv_behaviour_exposure_rates;
CREATE UNIQUE INDEX uq_mv_behaviour_exposure_rates
  ON mv_behaviour_exposure_rates (
    tenant_id,
    academic_period_id,
    subject_id,
    staff_id,
    year_group_id
  ) NULLS NOT DISTINCT;

-- ─── SECURITY DEFINER refresh functions ──────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_mv_student_behaviour_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_student_behaviour_summary;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_mv_behaviour_benchmarks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_behaviour_benchmarks;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_mv_behaviour_exposure_rates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_behaviour_exposure_rates;
END;
$$;

-- SECURITY DEFINER functions run as the function owner. For the refresh
-- to pass the MV ownership check AND bypass RLS, the owner must be the
-- same role that owns the MVs (edupod_admin on prod).
--
-- On CI / fresh dev envs where this migration runs as a superuser
-- equivalent, the ALTER is a no-op (already owned). On prod this
-- migration was applied manually by edupod_admin; the functions were
-- created owned by edupod_admin directly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edupod_admin') THEN
    EXECUTE 'ALTER FUNCTION refresh_mv_student_behaviour_summary()  OWNER TO edupod_admin';
    EXECUTE 'ALTER FUNCTION refresh_mv_behaviour_benchmarks()       OWNER TO edupod_admin';
    EXECUTE 'ALTER FUNCTION refresh_mv_behaviour_exposure_rates()   OWNER TO edupod_admin';
  END IF;
END $$;

REVOKE ALL ON FUNCTION refresh_mv_student_behaviour_summary()  FROM PUBLIC;
REVOKE ALL ON FUNCTION refresh_mv_behaviour_benchmarks()       FROM PUBLIC;
REVOKE ALL ON FUNCTION refresh_mv_behaviour_exposure_rates()   FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edupod_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION refresh_mv_student_behaviour_summary()  TO edupod_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION refresh_mv_behaviour_benchmarks()       TO edupod_app';
    EXECUTE 'GRANT EXECUTE ON FUNCTION refresh_mv_behaviour_exposure_rates()   TO edupod_app';
  END IF;
END $$;
