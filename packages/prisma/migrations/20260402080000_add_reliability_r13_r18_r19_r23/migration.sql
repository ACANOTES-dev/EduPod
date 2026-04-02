-- Reliability items R-13, R-18, R-19, R-23

-- R-13: Add automation_failed flag to behaviour_incidents
ALTER TABLE "behaviour_incidents" ADD COLUMN "automation_failed" BOOLEAN NOT NULL DEFAULT false;

-- R-18: Add 'claimed' value to NotificationStatus enum
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'claimed' BEFORE 'sent';

-- R-19: Add idempotency_key to notifications for dedup on retry
ALTER TABLE "notifications" ADD COLUMN "idempotency_key" VARCHAR(64);
CREATE UNIQUE INDEX "idx_notifications_idempotency" ON "notifications"("tenant_id", "idempotency_key");

-- R-23: Create cron_execution_logs table
CREATE TYPE "CronExecutionStatus" AS ENUM ('running', 'success', 'failed', 'timeout');

CREATE TABLE "cron_execution_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "job_name" VARCHAR(100) NOT NULL,
    "status" "CronExecutionStatus" NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "execution_duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cron_execution_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_cron_execution_log_job" ON "cron_execution_logs"("job_name", "created_at" DESC);
CREATE INDEX "idx_cron_execution_log_tenant_job" ON "cron_execution_logs"("tenant_id", "job_name", "created_at" DESC);
CREATE INDEX "idx_cron_execution_log_status" ON "cron_execution_logs"("status", "created_at" DESC);

ALTER TABLE "cron_execution_logs" ADD CONSTRAINT "cron_execution_logs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
