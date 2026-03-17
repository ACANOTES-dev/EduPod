-- ============================================================
-- P6 Post-Migration: RLS, Triggers, CHECK Constraints, Partial Indexes
-- ============================================================

-- ─── RLS Policies ────────────────────────────────────────────

-- fee_structures
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_structures_tenant_isolation ON fee_structures;
CREATE POLICY fee_structures_tenant_isolation ON fee_structures
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- discounts
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS discounts_tenant_isolation ON discounts;
CREATE POLICY discounts_tenant_isolation ON discounts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- household_fee_assignments
ALTER TABLE household_fee_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_fee_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS household_fee_assignments_tenant_isolation ON household_fee_assignments;
CREATE POLICY household_fee_assignments_tenant_isolation ON household_fee_assignments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices;
CREATE POLICY invoices_tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- invoice_lines
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_lines_tenant_isolation ON invoice_lines;
CREATE POLICY invoice_lines_tenant_isolation ON invoice_lines
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- installments
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS installments_tenant_isolation ON installments;
CREATE POLICY installments_tenant_isolation ON installments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_tenant_isolation ON payments;
CREATE POLICY payments_tenant_isolation ON payments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payment_allocations
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_allocations_tenant_isolation ON payment_allocations;
CREATE POLICY payment_allocations_tenant_isolation ON payment_allocations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- receipts
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS receipts_tenant_isolation ON receipts;
CREATE POLICY receipts_tenant_isolation ON receipts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- refunds
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refunds_tenant_isolation ON refunds;
CREATE POLICY refunds_tenant_isolation ON refunds
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── set_updated_at() Triggers ───────────────────────────────

DROP TRIGGER IF EXISTS set_fee_structures_updated_at ON fee_structures;
CREATE TRIGGER set_fee_structures_updated_at
  BEFORE UPDATE ON fee_structures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_discounts_updated_at ON discounts;
CREATE TRIGGER set_discounts_updated_at
  BEFORE UPDATE ON discounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_household_fee_assignments_updated_at ON household_fee_assignments;
CREATE TRIGGER set_household_fee_assignments_updated_at
  BEFORE UPDATE ON household_fee_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_invoices_updated_at ON invoices;
CREATE TRIGGER set_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_installments_updated_at ON installments;
CREATE TRIGGER set_installments_updated_at
  BEFORE UPDATE ON installments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_payments_updated_at ON payments;
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_refunds_updated_at ON refunds;
CREATE TRIGGER set_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- NOTE: invoice_lines, payment_allocations, receipts do NOT have updated_at

-- ─── CHECK Constraints ───────────────────────────────────────

ALTER TABLE invoice_lines DROP CONSTRAINT IF EXISTS chk_invoice_lines_total;
ALTER TABLE invoice_lines ADD CONSTRAINT chk_invoice_lines_total
  CHECK (line_total = quantity * unit_amount);

-- ─── Partial Unique Indexes ──────────────────────────────────

-- Prevent duplicate active fee assignments (with student)
DROP INDEX IF EXISTS idx_household_fee_assignments_active;
CREATE UNIQUE INDEX idx_household_fee_assignments_active
  ON household_fee_assignments(tenant_id, household_id, student_id, fee_structure_id)
  WHERE effective_to IS NULL;

-- Prevent duplicate active fee assignments (without student — NULL handling)
DROP INDEX IF EXISTS idx_household_fee_assignments_active_no_student;
CREATE UNIQUE INDEX idx_household_fee_assignments_active_no_student
  ON household_fee_assignments(tenant_id, household_id, fee_structure_id)
  WHERE effective_to IS NULL AND student_id IS NULL;

-- Partial unique on external_event_id for Stripe idempotency
DROP INDEX IF EXISTS idx_payments_external_event;
CREATE UNIQUE INDEX idx_payments_external_event
  ON payments(external_event_id)
  WHERE external_event_id IS NOT NULL;
