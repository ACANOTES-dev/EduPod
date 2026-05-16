export type PlatformRoleKey = 'platform_owner' | 'platform_support';

export interface PlatformRole {
  id: string;
  role_key: PlatformRoleKey;
  display_name: string;
  description: string;
}

export interface PlatformUserRole {
  role_id: string;
  granted_at: string;
  role: PlatformRole;
}

export interface PlatformUser {
  id: string;
  user_id: string;
  invited_at: string;
  activated_at: string | null;
  revoked_at: string | null;
  notes: string | null;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    global_status: string;
    last_login_at: string | null;
  };
  roles: PlatformUserRole[];
}

export interface PlatformPermission {
  id: string;
  permission_key: string;
  display_name: string;
  description: string;
  category: string;
  is_destructive: boolean;
  requires_owner_confirmation: boolean;
}

export interface PlatformPermissionsResponse {
  roles: Array<
    PlatformRole & {
      permissions: Array<{ permission: PlatformPermission }>;
    }
  >;
  permissions: PlatformPermission[];
}
