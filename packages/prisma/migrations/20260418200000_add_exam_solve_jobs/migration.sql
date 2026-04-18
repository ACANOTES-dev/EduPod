-- Exam Solve Jobs — durable record of an async exam-solver run. Polled by
-- the frontend progress widget while the solver works in the background via
-- the `scheduling` BullMQ queue.

CREATE TYPE "ExamSolveJobStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE "exam_solve_jobs" (
    "id"                          UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"                   UUID NOT NULL,
    "exam_session_id"             UUID NOT NULL,
    "status"                      "ExamSolveJobStatus" NOT NULL DEFAULT 'queued',
    "max_solver_duration_seconds" INTEGER NOT NULL DEFAULT 90,
    "placed"                      INTEGER NOT NULL DEFAULT 0,
    "total"                       INTEGER NOT NULL DEFAULT 0,
    "slots_written"               INTEGER NOT NULL DEFAULT 0,
    "solve_time_ms"               INTEGER NOT NULL DEFAULT 0,
    "failure_reason"              TEXT,
    "result_meta"                 JSONB,
    "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at"                  TIMESTAMPTZ,
    "finished_at"                 TIMESTAMPTZ,
    "created_by_user_id"          UUID,
    CONSTRAINT "exam_solve_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_exam_solve_jobs_tenant_session_status" ON "exam_solve_jobs"("tenant_id", "exam_session_id", "status");

ALTER TABLE "exam_solve_jobs" ADD CONSTRAINT "exam_solve_jobs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_solve_jobs" ADD CONSTRAINT "exam_solve_jobs_exam_session_id_fkey"
    FOREIGN KEY ("exam_session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS policy — tenant isolation enforced at the DB layer.
ALTER TABLE "exam_solve_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_solve_jobs" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exam_solve_jobs_tenant_isolation" ON "exam_solve_jobs";
CREATE POLICY "exam_solve_jobs_tenant_isolation" ON "exam_solve_jobs"
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Bump updated_at trigger (matches pattern used on other tenant-scoped tables).
CREATE TRIGGER "trg_exam_solve_jobs_updated_at"
    BEFORE UPDATE ON "exam_solve_jobs"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
