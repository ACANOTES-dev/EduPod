-- P4B-v2: RLS policies and triggers for auto-scheduler redesign tables

-- ─── RLS Policies ───────────────────────────────────────────────────────────

-- curriculum_requirements
ALTER TABLE curriculum_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS curriculum_requirements_tenant_isolation ON curriculum_requirements;
CREATE POLICY curriculum_requirements_tenant_isolation ON curriculum_requirements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- teacher_competencies
ALTER TABLE teacher_competencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teacher_competencies_tenant_isolation ON teacher_competencies;
CREATE POLICY teacher_competencies_tenant_isolation ON teacher_competencies
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- break_groups
ALTER TABLE break_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS break_groups_tenant_isolation ON break_groups;
CREATE POLICY break_groups_tenant_isolation ON break_groups
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- break_group_year_groups
ALTER TABLE break_group_year_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS break_group_year_groups_tenant_isolation ON break_group_year_groups;
CREATE POLICY break_group_year_groups_tenant_isolation ON break_group_year_groups
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- room_closures
ALTER TABLE room_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS room_closures_tenant_isolation ON room_closures;
CREATE POLICY room_closures_tenant_isolation ON room_closures
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- teacher_scheduling_configs
ALTER TABLE teacher_scheduling_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teacher_scheduling_configs_tenant_isolation ON teacher_scheduling_configs;
CREATE POLICY teacher_scheduling_configs_tenant_isolation ON teacher_scheduling_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── set_updated_at Triggers ────────────────────────────────────────────────
-- (room_closures and break_group_year_groups have no updated_at — append-only / no update)

DROP TRIGGER IF EXISTS set_curriculum_requirements_updated_at ON curriculum_requirements;
CREATE TRIGGER set_curriculum_requirements_updated_at BEFORE UPDATE ON curriculum_requirements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_teacher_competencies_updated_at ON teacher_competencies;
CREATE TRIGGER set_teacher_competencies_updated_at BEFORE UPDATE ON teacher_competencies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_break_groups_updated_at ON break_groups;
CREATE TRIGGER set_break_groups_updated_at BEFORE UPDATE ON break_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_teacher_scheduling_configs_updated_at ON teacher_scheduling_configs;
CREATE TRIGGER set_teacher_scheduling_configs_updated_at BEFORE UPDATE ON teacher_scheduling_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
