-- Step 3 of the attendance hardening plan: bind each attendance_session to the
-- teacher who's expected to fill it in. The column is nullable so (a) the
-- generation processor can populate it only when a schedule or homeroom
-- teacher is actually assigned, and (b) pre-existing rows can be backfilled
-- in a follow-up step rather than blocking the migration.
--
-- ON DELETE SET NULL matches the pattern used by classes.homeroom_teacher_staff_id
-- and schedules.teacher_staff_id elsewhere in the schema.

ALTER TABLE "attendance_sessions"
  ADD COLUMN "teacher_staff_id" UUID;

ALTER TABLE "attendance_sessions"
  ADD CONSTRAINT "attendance_sessions_teacher_staff_id_fkey"
  FOREIGN KEY ("teacher_staff_id")
  REFERENCES "staff_profiles"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "idx_attendance_sessions_tenant_teacher"
  ON "attendance_sessions"("tenant_id", "teacher_staff_id");
