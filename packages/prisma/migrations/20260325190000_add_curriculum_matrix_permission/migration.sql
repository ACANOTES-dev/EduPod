-- Add curriculum_matrix.manage permission and assign to school_owner + school_principal roles

-- 1. Insert the global permission
INSERT INTO permissions (id, permission_key, description, permission_tier)
VALUES (gen_random_uuid(), 'curriculum_matrix.manage', 'Unlock and modify the curriculum matrix (class-subject assignments)', 'admin')
ON CONFLICT (permission_key) DO NOTHING;

-- 2. Assign to all school_owner roles across tenants
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, r.tenant_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key = 'school_owner'
  AND r.is_system_role = true
  AND p.permission_key = 'curriculum_matrix.manage'
ON CONFLICT DO NOTHING;

-- 3. Assign to all school_principal roles across tenants
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, r.tenant_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key = 'school_principal'
  AND r.is_system_role = true
  AND p.permission_key = 'curriculum_matrix.manage'
ON CONFLICT DO NOTHING;
