-- Add missing tenant_id indexes to junction/composite-key tables.
-- RLS filters by tenant_id on every query; without a standalone index
-- these tables cause full table scans as data grows.

-- role_permissions (composite PK on role_id, permission_id)
CREATE INDEX IF NOT EXISTS "idx_role_permissions_tenant" ON "role_permissions"("tenant_id");

-- membership_roles (composite PK on membership_id, role_id)
CREATE INDEX IF NOT EXISTS "idx_membership_roles_tenant" ON "membership_roles"("tenant_id");

-- household_parents (composite PK on household_id, parent_id)
CREATE INDEX IF NOT EXISTS "idx_household_parents_tenant" ON "household_parents"("tenant_id");

-- student_parents (composite PK on student_id, parent_id)
CREATE INDEX IF NOT EXISTS "idx_student_parents_tenant" ON "student_parents"("tenant_id");

-- class_staff (composite PK on class_id, staff_profile_id, assignment_role)
CREATE INDEX IF NOT EXISTS "idx_class_staff_tenant" ON "class_staff"("tenant_id");

-- admission_form_fields (only had index on form_definition_id)
CREATE INDEX IF NOT EXISTS "idx_admission_form_fields_tenant" ON "admission_form_fields"("tenant_id");

-- application_notes (only had index on application_id)
CREATE INDEX IF NOT EXISTS "idx_application_notes_tenant" ON "application_notes"("tenant_id");

-- approval_workflows (no index at all)
CREATE INDEX IF NOT EXISTS "idx_approval_workflows_tenant" ON "approval_workflows"("tenant_id");

-- notification_templates (nullable tenant_id, no index)
CREATE INDEX IF NOT EXISTS "idx_notification_templates_tenant" ON "notification_templates"("tenant_id");

-- invoice_lines (only had index on invoice_id)
CREATE INDEX IF NOT EXISTS "idx_invoice_lines_tenant" ON "invoice_lines"("tenant_id");

-- installments (only had index on invoice_id)
CREATE INDEX IF NOT EXISTS "idx_installments_tenant" ON "installments"("tenant_id");

-- payment_allocations (only had indexes on payment_id and invoice_id)
CREATE INDEX IF NOT EXISTS "idx_payment_allocations_tenant" ON "payment_allocations"("tenant_id");

-- refunds (only had index on payment_id)
CREATE INDEX IF NOT EXISTS "idx_refunds_tenant" ON "refunds"("tenant_id");

-- parent_inquiry_messages (only had index on inquiry_id)
CREATE INDEX IF NOT EXISTS "idx_parent_inquiry_messages_tenant" ON "parent_inquiry_messages"("tenant_id");
