-- Report cards redesign (Impl 01) defined three new permissions — .view, .comment,
-- .manage — plus a staff-tier branding.view used by the teacher comment editor.
-- The seed file `packages/prisma/seed/permissions.ts` carries them, and
-- `seed/system-roles.ts` grants .view + .comment + branding.view to the teacher
-- role. The seed was never replayed on already-provisioned tenants, so this
-- migration backfills the missing rows idempotently. It also grants the three
-- leadership roles their full report card / branding set so non-owner leaders
-- (principal, vice principal) stop relying on the owner bypass alone.

INSERT INTO permissions (permission_key, description, permission_tier)
VALUES
  ('report_cards.view',    'View report cards and the report cards library (read-only)',                              'staff'),
  ('report_cards.comment', 'Edit own subject comments and submit report-card teacher requests (teachers)',            'staff'),
  ('report_cards.manage',  'Run the report card generation wizard, manage settings, comment windows, and approvals', 'admin'),
  ('branding.view',        'View tenant branding settings (logo, colours)',                                            'staff')
ON CONFLICT (permission_key) DO NOTHING;

-- Teachers: read + write own comments + see the logo
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key = 'teacher'
  AND p.permission_key IN ('report_cards.view', 'report_cards.comment', 'branding.view')
ON CONFLICT DO NOTHING;

-- Leadership (principal, vice principal, owner): every report card privilege.
-- The owner bypass still exists so these rows are belt-and-braces, but they
-- mean the permission cache resolves to the right set even without the
-- role_key shortcut (useful for audit logs and for downgrading the bypass
-- later if we want finer-grained control).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_key IN ('school_owner', 'school_principal', 'school_vice_principal')
  AND p.permission_key IN (
    'report_cards.view',
    'report_cards.comment',
    'report_cards.manage',
    'branding.view'
  )
ON CONFLICT DO NOTHING;
