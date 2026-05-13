-- Verification: every tenant must have exactly 20 canonical module rows.
-- Aborts the deploy if any tenant has fewer, more, or any non-canonical rows.
DO $$
DECLARE
  bad_tenant_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_tenant_count
  FROM tenants t
  WHERE (
    SELECT COUNT(*)
    FROM tenant_modules tm
    WHERE tm.tenant_id = t.id
  ) <> 20
  OR (
    SELECT COUNT(*)
    FROM tenant_modules tm
    WHERE tm.tenant_id = t.id
      AND tm.module_key IN (
        'admissions', 'gradebook', 'homework', 'sen',
        'finance', 'payroll', 'budgeting',
        'behaviour', 'pastoral', 'staff_wellbeing', 'early_warning',
        'communications_outbound', 'parent_inquiries', 'engagement', 'website',
        'auto_scheduling', 'leave', 'school_closures', 'ai_functions',
        'compliance_advanced'
      )
  ) <> 20;

  IF bad_tenant_count > 0 THEN
    RAISE EXCEPTION 'Module registry backfill verification FAILED: % tenants do not have exactly 20 canonical module rows.', bad_tenant_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tenant_modules
    WHERE module_key NOT IN (
      'admissions', 'gradebook', 'homework', 'sen',
      'finance', 'payroll', 'budgeting',
      'behaviour', 'pastoral', 'staff_wellbeing', 'early_warning',
      'communications_outbound', 'parent_inquiries', 'engagement', 'website',
      'auto_scheduling', 'leave', 'school_closures', 'ai_functions',
      'compliance_advanced'
    )
  ) THEN
    RAISE EXCEPTION 'Non-canonical module keys still present in tenant_modules.';
  END IF;
END $$;
