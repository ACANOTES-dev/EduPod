-- SCHED-023: RLS policy + updated_at trigger for class_subject_requirements.
-- See /packages/prisma/rls/policies.sql for the authoritative catalogue.

ALTER TABLE class_subject_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subject_requirements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_subject_requirements_tenant_isolation ON class_subject_requirements;
CREATE POLICY class_subject_requirements_tenant_isolation ON class_subject_requirements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

DROP TRIGGER IF EXISTS set_class_subject_requirements_updated_at ON class_subject_requirements;
CREATE TRIGGER set_class_subject_requirements_updated_at BEFORE UPDATE ON class_subject_requirements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
