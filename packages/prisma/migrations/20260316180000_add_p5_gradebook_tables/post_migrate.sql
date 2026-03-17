-- ============================================================
-- P5 Post-Migration: RLS, Triggers, Special Indexes
-- ============================================================

-- ─── RLS Policies ────────────────────────────────────────────

-- grading_scales
ALTER TABLE grading_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_scales FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grading_scales_tenant_isolation ON grading_scales;
CREATE POLICY grading_scales_tenant_isolation ON grading_scales
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- assessment_categories
ALTER TABLE assessment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessment_categories_tenant_isolation ON assessment_categories;
CREATE POLICY assessment_categories_tenant_isolation ON assessment_categories
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- class_subject_grade_configs
ALTER TABLE class_subject_grade_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subject_grade_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_subject_grade_configs_tenant_isolation ON class_subject_grade_configs;
CREATE POLICY class_subject_grade_configs_tenant_isolation ON class_subject_grade_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- assessments
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessments_tenant_isolation ON assessments;
CREATE POLICY assessments_tenant_isolation ON assessments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- grades
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grades_tenant_isolation ON grades;
CREATE POLICY grades_tenant_isolation ON grades
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- period_grade_snapshots
ALTER TABLE period_grade_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_grade_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS period_grade_snapshots_tenant_isolation ON period_grade_snapshots;
CREATE POLICY period_grade_snapshots_tenant_isolation ON period_grade_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_cards
ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_cards_tenant_isolation ON report_cards;
CREATE POLICY report_cards_tenant_isolation ON report_cards
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── set_updated_at() Triggers ───────────────────────────────

DROP TRIGGER IF EXISTS set_grading_scales_updated_at ON grading_scales;
CREATE TRIGGER set_grading_scales_updated_at
  BEFORE UPDATE ON grading_scales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_assessment_categories_updated_at ON assessment_categories;
CREATE TRIGGER set_assessment_categories_updated_at
  BEFORE UPDATE ON assessment_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_class_subject_grade_configs_updated_at ON class_subject_grade_configs;
CREATE TRIGGER set_class_subject_grade_configs_updated_at
  BEFORE UPDATE ON class_subject_grade_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_assessments_updated_at ON assessments;
CREATE TRIGGER set_assessments_updated_at
  BEFORE UPDATE ON assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_grades_updated_at ON grades;
CREATE TRIGGER set_grades_updated_at
  BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_period_grade_snapshots_updated_at ON period_grade_snapshots;
CREATE TRIGGER set_period_grade_snapshots_updated_at
  BEFORE UPDATE ON period_grade_snapshots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_report_cards_updated_at ON report_cards;
CREATE TRIGGER set_report_cards_updated_at
  BEFORE UPDATE ON report_cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Special Indexes (cannot be expressed in Prisma) ─────────

-- Partial unique index: only one active (draft/published) report card per student per period
DROP INDEX IF EXISTS idx_report_cards_active_unique;
CREATE UNIQUE INDEX idx_report_cards_active_unique
  ON report_cards(tenant_id, student_id, academic_period_id)
  WHERE status IN ('draft', 'published');
