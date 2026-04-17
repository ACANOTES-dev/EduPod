-- Exam Scheduling v2: RLS policies + updated_at triggers.
-- See /packages/prisma/rls/policies.sql for the authoritative catalogue.

-- ─── exam_session_configs ────────────────────────────────────────────────────
ALTER TABLE exam_session_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_session_configs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_session_configs_tenant_isolation ON exam_session_configs;
CREATE POLICY exam_session_configs_tenant_isolation ON exam_session_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

DROP TRIGGER IF EXISTS set_exam_session_configs_updated_at ON exam_session_configs;
CREATE TRIGGER set_exam_session_configs_updated_at BEFORE UPDATE ON exam_session_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── exam_subject_configs ────────────────────────────────────────────────────
ALTER TABLE exam_subject_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_subject_configs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_subject_configs_tenant_isolation ON exam_subject_configs;
CREATE POLICY exam_subject_configs_tenant_isolation ON exam_subject_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

DROP TRIGGER IF EXISTS set_exam_subject_configs_updated_at ON exam_subject_configs;
CREATE TRIGGER set_exam_subject_configs_updated_at BEFORE UPDATE ON exam_subject_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── exam_invigilator_pool ───────────────────────────────────────────────────
ALTER TABLE exam_invigilator_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_invigilator_pool FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_invigilator_pool_tenant_isolation ON exam_invigilator_pool;
CREATE POLICY exam_invigilator_pool_tenant_isolation ON exam_invigilator_pool
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── exam_slot_rooms ─────────────────────────────────────────────────────────
ALTER TABLE exam_slot_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_slot_rooms FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exam_slot_rooms_tenant_isolation ON exam_slot_rooms;
CREATE POLICY exam_slot_rooms_tenant_isolation ON exam_slot_rooms
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
