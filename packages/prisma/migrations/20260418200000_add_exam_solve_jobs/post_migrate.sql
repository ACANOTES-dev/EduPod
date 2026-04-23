-- Post-migrate companion to 20260418200000_add_exam_solve_jobs/migration.sql.
--
-- The `set_updated_at()` helper is created in
-- `20260316072748_add_p1_tenancy_users_rbac/post_migrate.sql`, which runs
-- AFTER all Prisma migrations. On fresh CI / dev databases the function
-- is absent when migration.sql runs, so the trigger there is wrapped in
-- a pg_proc guard and becomes a no-op.
--
-- This post_migrate.sql idempotently re-attaches the trigger once the
-- post_migrate runner is executing — by which point
-- 20260316072748's post_migrate.sql has already registered
-- set_updated_at(). Safe to re-run: DROP TRIGGER IF EXISTS + CREATE
-- yields the same final state each time.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pg_function_is_visible(oid)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'exam_solve_jobs'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS "trg_exam_solve_jobs_updated_at" ON "exam_solve_jobs"';
    EXECUTE $trg$
      CREATE TRIGGER "trg_exam_solve_jobs_updated_at"
        BEFORE UPDATE ON "exam_solve_jobs"
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    $trg$;
  END IF;
END $$;
