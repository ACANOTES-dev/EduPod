-- ============================================================
-- Teacher-Centric Assessments: RLS Policies for New Tables
-- ============================================================

-- teacher_grading_weights
ALTER TABLE teacher_grading_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_grading_weights FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teacher_grading_weights_tenant_isolation ON teacher_grading_weights;
CREATE POLICY teacher_grading_weights_tenant_isolation ON teacher_grading_weights
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- assessment_unlock_requests
ALTER TABLE assessment_unlock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_unlock_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessment_unlock_requests_tenant_isolation ON assessment_unlock_requests;
CREATE POLICY assessment_unlock_requests_tenant_isolation ON assessment_unlock_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- grade_edit_audits
ALTER TABLE grade_edit_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_edit_audits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grade_edit_audits_tenant_isolation ON grade_edit_audits;
CREATE POLICY grade_edit_audits_tenant_isolation ON grade_edit_audits
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
