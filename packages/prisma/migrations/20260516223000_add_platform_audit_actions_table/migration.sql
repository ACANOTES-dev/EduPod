-- CreateEnum
CREATE TYPE "PlatformAuditActionType" AS ENUM (
  'password_reset',
  'mfa_reset',
  'resend_invite',
  'unlock_account',
  'transfer_ownership',
  'disable_user',
  'enable_user'
);

-- CreateTable
CREATE TABLE "platform_audit_actions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" UUID NOT NULL,
  "action_type" "PlatformAuditActionType" NOT NULL,
  "target_user_id" UUID,
  "target_tenant_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "platform_audit_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "idx_platform_audit_actions_actor" ON "platform_audit_actions" ("actor_id");
CREATE INDEX "idx_platform_audit_actions_target_user" ON "platform_audit_actions" ("target_user_id");
CREATE INDEX "idx_platform_audit_actions_target_tenant" ON "platform_audit_actions" ("target_tenant_id");
CREATE INDEX "idx_platform_audit_actions_type_date" ON "platform_audit_actions" ("action_type", "created_at");

-- AddForeignKeys
ALTER TABLE "platform_audit_actions"
  ADD CONSTRAINT "platform_audit_actions_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_audit_actions"
  ADD CONSTRAINT "platform_audit_actions_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_audit_actions"
  ADD CONSTRAINT "platform_audit_actions_target_tenant_id_fkey"
  FOREIGN KEY ("target_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Session 3B permission. Existing platform support users can resend pending
-- tenant invitations, while destructive user/ownership actions remain owner-only
-- through the existing permission grants.
INSERT INTO platform_permissions (
  permission_key,
  category,
  display_name,
  description,
  is_destructive,
  requires_owner_confirmation
)
VALUES (
  'platform.users.resend_invite',
  'users',
  'Re-send user invitation',
  'Regenerate and re-send a pending tenant invitation.',
  false,
  false
)
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
JOIN platform_permissions p ON p.permission_key = 'platform.users.resend_invite'
WHERE r.role_key IN ('platform_owner', 'platform_support')
ON CONFLICT DO NOTHING;

-- NO RLS policy: this is a platform-level support audit table.
