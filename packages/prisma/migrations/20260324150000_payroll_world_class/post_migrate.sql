-- staff_attendance_records (standard)
ALTER TABLE staff_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_attendance_records_tenant_isolation ON staff_attendance_records;
CREATE POLICY staff_attendance_records_tenant_isolation ON staff_attendance_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- class_delivery_records (standard)
ALTER TABLE class_delivery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_delivery_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_delivery_records_tenant_isolation ON class_delivery_records;
CREATE POLICY class_delivery_records_tenant_isolation ON class_delivery_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_adjustments (standard)
ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_adjustments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_adjustments_tenant_isolation ON payroll_adjustments;
CREATE POLICY payroll_adjustments_tenant_isolation ON payroll_adjustments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_export_templates (standard)
ALTER TABLE payroll_export_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_export_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_export_templates_tenant_isolation ON payroll_export_templates;
CREATE POLICY payroll_export_templates_tenant_isolation ON payroll_export_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_export_logs (standard)
ALTER TABLE payroll_export_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_export_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_export_logs_tenant_isolation ON payroll_export_logs;
CREATE POLICY payroll_export_logs_tenant_isolation ON payroll_export_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_approval_configs (standard)
ALTER TABLE payroll_approval_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_approval_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_approval_configs_tenant_isolation ON payroll_approval_configs;
CREATE POLICY payroll_approval_configs_tenant_isolation ON payroll_approval_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_allowance_types (standard)
ALTER TABLE payroll_allowance_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_allowance_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_allowance_types_tenant_isolation ON payroll_allowance_types;
CREATE POLICY payroll_allowance_types_tenant_isolation ON payroll_allowance_types
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- staff_allowances (standard)
ALTER TABLE staff_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_allowances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_allowances_tenant_isolation ON staff_allowances;
CREATE POLICY staff_allowances_tenant_isolation ON staff_allowances
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_one_off_items (standard)
ALTER TABLE payroll_one_off_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_one_off_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_one_off_items_tenant_isolation ON payroll_one_off_items;
CREATE POLICY payroll_one_off_items_tenant_isolation ON payroll_one_off_items
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- staff_recurring_deductions (standard)
ALTER TABLE staff_recurring_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_recurring_deductions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_recurring_deductions_tenant_isolation ON staff_recurring_deductions;
CREATE POLICY staff_recurring_deductions_tenant_isolation ON staff_recurring_deductions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

