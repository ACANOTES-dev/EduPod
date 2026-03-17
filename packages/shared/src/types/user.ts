export type UserGlobalStatus = 'active' | 'suspended' | 'disabled';

export type MembershipStatus =
  | 'invited'
  | 'pending_verification'
  | 'active'
  | 'suspended'
  | 'disabled'
  | 'archived';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  preferred_locale: string;
  global_status: UserGlobalStatus;
  email_verified_at: string | null;
  mfa_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantMembership {
  id: string;
  tenant_id: string;
  user_id: string;
  membership_status: MembershipStatus;
  joined_at: string | null;
  left_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipWithRoles extends TenantMembership {
  roles: import('./rbac').Role[];
  user?: User;
}
