-- ============================================================
-- P4A Post-Migration: RLS, Triggers, Special Indexes
-- ============================================================

-- ─── RLS Policies ────────────────────────────────────────────

-- rooms
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rooms_tenant_isolation ON rooms;
CREATE POLICY rooms_tenant_isolation ON rooms
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- schedules
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedules_tenant_isolation ON schedules;
CREATE POLICY schedules_tenant_isolation ON schedules
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- school_closures
ALTER TABLE school_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_closures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS school_closures_tenant_isolation ON school_closures;
CREATE POLICY school_closures_tenant_isolation ON school_closures
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- attendance_sessions
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_sessions_tenant_isolation ON attendance_sessions;
CREATE POLICY attendance_sessions_tenant_isolation ON attendance_sessions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- attendance_records
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_records_tenant_isolation ON attendance_records;
CREATE POLICY attendance_records_tenant_isolation ON attendance_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- daily_attendance_summaries
ALTER TABLE daily_attendance_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_attendance_summaries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_attendance_summaries_tenant_isolation ON daily_attendance_summaries;
CREATE POLICY daily_attendance_summaries_tenant_isolation ON daily_attendance_summaries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── set_updated_at() Triggers ───────────────────────────────
-- (school_closures excluded — no updated_at column, append-only)

DROP TRIGGER IF EXISTS set_rooms_updated_at ON rooms;
CREATE TRIGGER set_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_schedules_updated_at ON schedules;
CREATE TRIGGER set_schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_attendance_sessions_updated_at ON attendance_sessions;
CREATE TRIGGER set_attendance_sessions_updated_at
  BEFORE UPDATE ON attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_attendance_records_updated_at ON attendance_records;
CREATE TRIGGER set_attendance_records_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_daily_attendance_summaries_updated_at ON daily_attendance_summaries;
CREATE TRIGGER set_daily_attendance_summaries_updated_at
  BEFORE UPDATE ON daily_attendance_summaries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Special Indexes (cannot be expressed in Prisma) ─────────

-- school_closures unique with COALESCE for NULL scope_entity_id
DROP INDEX IF EXISTS idx_school_closures_unique;
CREATE UNIQUE INDEX idx_school_closures_unique
  ON school_closures(tenant_id, closure_date, affects_scope, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'));

-- attendance_sessions unique for schedule-linked sessions
DROP INDEX IF EXISTS idx_attendance_sessions_unique;
CREATE UNIQUE INDEX idx_attendance_sessions_unique
  ON attendance_sessions(tenant_id, class_id, session_date, schedule_id);

-- attendance_sessions unique for ad-hoc sessions (WHERE schedule_id IS NULL)
DROP INDEX IF EXISTS idx_attendance_sessions_adhoc_unique;
CREATE UNIQUE INDEX idx_attendance_sessions_adhoc_unique
  ON attendance_sessions(tenant_id, class_id, session_date) WHERE schedule_id IS NULL;

-- attendance_records unique per session per student
DROP INDEX IF EXISTS idx_attendance_records_session_student;
CREATE UNIQUE INDEX idx_attendance_records_session_student
  ON attendance_records(tenant_id, attendance_session_id, student_id);
