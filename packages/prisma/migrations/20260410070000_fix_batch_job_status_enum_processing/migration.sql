-- Fix schema drift: the original `report_cards_world_class` migration defined
-- `BatchJobStatus` with a `running` value, but `schema.prisma` has since been
-- updated to use `processing` (matching the "spec concept" label used in the
-- worker). The worker's `ReportCardGenerationJob.processJob` writes
-- `{ status: 'processing' }` on the row at the start of execution, which
-- blows up against the un-renamed prod enum.
--
-- Surfaced when the gradebook queue dispatcher fix (commit b2392e45) let a
-- report-cards generation job actually reach the worker's `processJob` for
-- the first time in a long while. Before the dispatcher fix, the silent-drop
-- race was swallowing the job before this line could fail.
--
-- Safe rename: the prod DB currently has ZERO rows in `running` state
-- (verified via `SELECT status, COUNT(*) FROM report_card_batch_jobs
-- GROUP BY status;`). All existing rows are either `queued`, `completed`, or
-- `failed`. The rename is atomic in Postgres and requires no data migration.

ALTER TYPE "BatchJobStatus" RENAME VALUE 'running' TO 'processing';
