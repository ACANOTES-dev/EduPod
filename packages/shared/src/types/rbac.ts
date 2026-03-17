export type RoleTier = 'platform' | 'admin' | 'staff' | 'parent';

export interface Role {
  id: string;
  tenant_id: string | null;
  role_key: string;
  display_name: string;
  is_system_role: boolean;
  role_tier: RoleTier;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  permission_key: string;
  description: string;
  permission_tier: RoleTier;
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface InvitedRolePayload {
  role_ids: string[];
  parent_link?: {
    household_id?: string;
    student_ids?: string[];
  };
}

export interface Invitation {
  id: string;
  tenant_id: string;
  email: string;
  invited_role_payload: InvitedRolePayload;
  invited_by_user_id: string;
  expires_at: string;
  accepted_at: string | null;
  status: InvitationStatus;
  created_at: string;
  updated_at: string;
}
