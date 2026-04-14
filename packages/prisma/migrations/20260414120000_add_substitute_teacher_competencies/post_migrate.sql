-- Stage 7: RLS policy + updated_at trigger for substitute_teacher_competencies.

ALTER TABLE substitute_teacher_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitute_teacher_competencies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS substitute_teacher_competencies_tenant_isolation ON substitute_teacher_competencies;
CREATE POLICY substitute_teacher_competencies_tenant_isolation ON substitute_teacher_competencies
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

DROP TRIGGER IF EXISTS set_substitute_teacher_competencies_updated_at ON substitute_teacher_competencies;
CREATE TRIGGER set_substitute_teacher_competencies_updated_at BEFORE UPDATE ON substitute_teacher_competencies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
