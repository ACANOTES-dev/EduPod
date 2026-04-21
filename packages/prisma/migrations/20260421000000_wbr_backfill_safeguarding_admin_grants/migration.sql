-- ─────────────────────────────────────────────────────────────────────────────
-- Wellbeing rebuild — Impl 24 polish migration
--
-- Backfill the pre-existing safeguarding permission grants for the admin
-- tier (school_principal + school_vice_principal) on existing tenants. The
-- wellbeing foundation migration (20260420100000_wellbeing_foundation) added
-- the new wellbeing permissions but never touched the legacy safeguarding
-- grants because they predated the rebuild.
--
-- On NHQS and the four stress tenants, school_principal and
-- school_vice_principal carry only `safeguarding.dedicated_view` and
-- `safeguarding.keywords.write`. Without `safeguarding.view`, the new
-- `/safeguarding` sub-hub (impl 17) hits 403 on every `GET /safeguarding/
-- concerns*` data fetch — even though the sub-hub landing itself renders.
--
-- Rules:
--   • school_principal gets view + manage + report + seal (principal is the
--     Designated Safeguarding Lead in Irish/UK schools; they need full access
--     including sealing authority).
--   • school_vice_principal gets view + manage + report (no seal — sealing
--     is dual-control and should stay with principal + owner).
--   • school_owner is NOT touched — if a tenant has a school_owner role, the
--     seed file guarantees the full grant.
--
-- Idempotent via `NOT EXISTS` guards. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── school_principal: view + manage + report + seal ─────────────────────────

INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key = 'school_principal'
  AND p.permission_key IN (
      'safeguarding.view',
      'safeguarding.manage',
      'safeguarding.report',
      'safeguarding.seal'
  )
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─── school_vice_principal: view + manage + report (no seal) ─────────────────

INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key = 'school_vice_principal'
  AND p.permission_key IN (
      'safeguarding.view',
      'safeguarding.manage',
      'safeguarding.report'
  )
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
