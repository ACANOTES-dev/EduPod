CREATE TYPE platform_role_key AS ENUM ('platform_owner', 'platform_support');

CREATE TABLE platform_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_users_user_id ON platform_users(user_id);
CREATE INDEX idx_platform_users_revoked_at ON platform_users(revoked_at);

CREATE TABLE platform_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key platform_role_key NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform_user_roles (
  platform_user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES platform_roles(id) ON DELETE CASCADE,
  granted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (platform_user_id, role_id)
);

CREATE INDEX idx_platform_user_roles_role_id ON platform_user_roles(role_id);

CREATE TABLE platform_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key VARCHAR(120) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(60) NOT NULL,
  is_destructive BOOLEAN NOT NULL DEFAULT false,
  requires_two_person BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platform_role_permissions (
  role_id UUID NOT NULL REFERENCES platform_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES platform_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_platform_role_permissions_permission_id
  ON platform_role_permissions(permission_id);
