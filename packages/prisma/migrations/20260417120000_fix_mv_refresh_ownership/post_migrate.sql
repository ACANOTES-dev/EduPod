-- Post-migrate companion to 20260417120000_fix_mv_refresh_ownership/migration.sql.
--
-- The materialised view `mv_behaviour_exposure_rates` is created in
-- `20260326200000_add_behaviour_management_tables/post_migrate.sql`, which
-- runs AFTER all migrations. On fresh CI / dev databases the MV is absent
-- during migration.sql, so the unique-index fix there is wrapped in a
-- pg_matviews guard and becomes a no-op.
--
-- This post_migrate.sql re-applies the same idempotent index fix once the
-- post_migrate runner is executing — by which point the MV has been
-- created by 20260326200000's post_migrate.sql. The script is safe to
-- re-run: DROP INDEX IF EXISTS + CREATE UNIQUE INDEX yields the same
-- final state each time.
--
-- On production the MV + index already exist; this script simply replays
-- the drop/recreate pair in milliseconds.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_behaviour_exposure_rates') THEN
    EXECUTE 'DROP INDEX IF EXISTS uq_mv_behaviour_exposure_rates';
    EXECUTE $idx$
      CREATE UNIQUE INDEX uq_mv_behaviour_exposure_rates
        ON mv_behaviour_exposure_rates (
          tenant_id,
          academic_period_id,
          subject_id,
          staff_id,
          year_group_id
        ) NULLS NOT DISTINCT
    $idx$;
  END IF;
END $$;
